/**
 * GET  /api/memorabilia/events/csv             — 전체 행사 CSV export (관리자)
 * GET  /api/memorabilia/events/csv?template=1  — 빈 템플릿 CSV (행만 비어있음)
 * POST /api/memorabilia/events/csv             — CSV 일괄 업로드 (body: text/csv 또는 JSON {csv:string})
 *
 * Dedup 정책 (POST):
 *   1. slug 가 비어있지 않으면 → slug 매칭. 매칭되면 UPDATE, 아니면 INSERT (slug 그대로).
 *   2. slug 가 비어있으면 → (name_en + name_ko) trim 매칭으로 기존 행사 탐색.
 *      - 매칭되면 UPDATE
 *      - 없으면 INSERT (slug 자동 생성)
 *
 * "동일한 데이터에 대해서는 기존 데이터에 흡수시키는 형태" — 같은 이름 행사는
 * 중복 INSERT 하지 않고 기존 행을 UPDATE 한다. 결과 응답에 inserted/updated/skipped
 * 카운트와 행 단위 결과(라인 번호 기반) 포함.
 *
 * 인코딩: UTF-8 + BOM (Excel 한글 호환).
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { listEvents, normalizeEventInput } from '../../../_shared/memorabilia-events.js';

const CSV_HEADER = [
  'slug',
  'name_en',
  'name_ko',
  'start_year',
  'start_month',
  'start_day',
  'end_year',
  'end_month',
  'end_day',
  'description_en',
  'description_ko',
  'archived',
];

const HELP_COMMENT = [
  '# slug: 비워두면 자동 생성. 기존 slug 와 일치하면 해당 행사를 업데이트합니다.',
  '# name_en/name_ko: 둘 중 하나는 필수. slug 비어있으면 이름 일치로 dedup.',
  '# start_*/end_*: 비울 수 있음. day 입력 시 month 필수, month 입력 시 year 필수.',
  '# archived: 0 (활성) / 1 (아카이브). 비우면 0.',
  '# 첫 줄(#)은 무시됩니다. 헤더는 두 번째 줄.',
];

// ── CSV serialization ────────────────────────────────────────────────────────
function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows) {
  const lines = [];
  lines.push(HELP_COMMENT.join('\n'));
  lines.push(CSV_HEADER.join(','));
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return '﻿' + lines.join('\n') + '\n';
}

// ── CSV parsing (RFC 4180 lite) ──────────────────────────────────────────────
function parseCsv(text) {
  // BOM 제거
  let i = 0;
  if (text.charCodeAt(0) === 0xFEFF) i = 1;

  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      cur += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ',') { row.push(cur); cur = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i += 1; continue; }
    cur += c; i += 1;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }

  // 주석(#)·빈 줄 제거
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === '') && !r[0].startsWith('#'));
}

// ── GET (export / template) ──────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'view');
  if (gate) return gate;

  const url = new URL(request.url);
  const isTemplate = url.searchParams.get('template') === '1';

  try {
    let rows;
    if (isTemplate) {
      // 예시 한 줄
      rows = [[
        '', '25th World Scout Jamboree', '제25회 세계스카우트잼버리',
        '2023', '8', '1', '2023', '8', '12',
        'Held in Saemangeum, Korea.', '대한민국 새만금에서 개최.',
        '0',
      ]];
    } else {
      const items = await listEvents(env.DB, { archived: true });
      rows = items.map((e) => [
        e.slug || '',
        e.name_en || '',
        e.name_ko || '',
        e.start_year ?? '',
        e.start_month ?? '',
        e.start_day ?? '',
        e.end_year ?? '',
        e.end_month ?? '',
        e.end_day ?? '',
        e.description_en || '',
        e.description_ko || '',
        e.archived ? 1 : 0,
      ]);
    }

    const filename = isTemplate
      ? 'memorabilia-events-template.csv'
      : `memorabilia-events-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(rowsToCsv(rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/memorabilia/events/csv error:', err);
    return json({ error: 'export_failed', detail: String(err && err.message || err) }, 500);
  }
}

// ── POST (import) ────────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

  // body 는 text/csv 또는 application/json { csv: string }
  let csvText = '';
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      csvText = String(body?.csv || '');
    } else {
      csvText = await request.text();
    }
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  if (!csvText.trim()) return json({ error: 'empty_csv' }, 400);

  const parsed = parseCsv(csvText);
  if (!parsed.length) return json({ error: 'no_rows' }, 400);

  // 헤더 — 첫 행이 헤더로 간주됨
  const header = parsed[0].map((s) => String(s || '').trim().toLowerCase());
  const dataRows = parsed.slice(1);
  if (!dataRows.length) return json({ error: 'no_data', detail: '데이터 행이 없습니다.' }, 400);

  // 헤더 유효성 — 최소한 name_en 또는 name_ko 컬럼이 있어야 의미 있음.
  if (!header.includes('name_en') && !header.includes('name_ko')) {
    return json({
      error: 'invalid_header',
      detail: '헤더에 name_en 또는 name_ko 컬럼이 있어야 합니다.',
      expected: CSV_HEADER,
    }, 400);
  }
  const idxOf = (key) => header.indexOf(key);

  // 기존 행사 모두 로드 → slug / 이름 매칭용 lookup map
  const existing = await listEvents(env.DB, { archived: true });
  const bySlug = new Map();
  const byNamePair = new Map(); // "name_en|name_ko"(trim) → row
  for (const e of existing) {
    if (e.slug) bySlug.set(e.slug, e);
    const key = (e.name_en || '').trim().toLowerCase() + '|' + (e.name_ko || '').trim().toLowerCase();
    if (!byNamePair.has(key)) byNamePair.set(key, e);
  }

  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  let lineNo = 1; // 1: header. Data rows start at lineNo 2.

  for (const cols of dataRows) {
    lineNo += 1;
    // 빈 행 스킵
    if (cols.every((c) => String(c || '').trim() === '')) { results.skipped += 1; continue; }

    const get = (key) => {
      const idx = idxOf(key);
      return idx >= 0 ? String(cols[idx] || '').trim() : '';
    };

    const row = {
      slug:           get('slug'),
      name_en:        get('name_en'),
      name_ko:        get('name_ko'),
      start_year:     get('start_year'),
      start_month:    get('start_month'),
      start_day:      get('start_day'),
      end_year:       get('end_year'),
      end_month:      get('end_month'),
      end_day:        get('end_day'),
      description_en: get('description_en'),
      description_ko: get('description_ko'),
      archived:       /^(1|true|yes|y)$/i.test(get('archived')) ? 1 : 0,
    };

    // 정규화·검증 — normalizeEventInput 가 errors / input 을 반환.
    const { errors, input } = normalizeEventInput(row);
    if (errors.length) {
      results.errors.push({ line: lineNo, errors });
      continue;
    }

    // dedup 매칭 — slug 우선, 다음 (name_en, name_ko) trim 일치
    let target = null;
    if (row.slug && bySlug.has(row.slug)) target = bySlug.get(row.slug);
    if (!target) {
      const key = (row.name_en || '').trim().toLowerCase() + '|' + (row.name_ko || '').trim().toLowerCase();
      if (byNamePair.has(key)) target = byNamePair.get(key);
    }

    try {
      if (target) {
        // UPDATE — usage_count / created_at 은 보존
        await env.DB.prepare(
          `UPDATE memorabilia_events SET
              name_en = ?, name_ko = ?,
              start_year = ?, start_month = ?, start_day = ?,
              end_year = ?,   end_month = ?,   end_day = ?,
              description_en = ?, description_ko = ?,
              archived = ?,
              updated_at = datetime('now')
            WHERE id = ?`
        ).bind(
          input.name_en, input.name_ko,
          input.start_year, input.start_month, input.start_day,
          input.end_year,   input.end_month,   input.end_day,
          input.description_en, input.description_ko,
          input.archived,
          target.id,
        ).run();
        results.updated += 1;
      } else {
        // INSERT — slug 중복 회피
        let slug = input.slug;
        for (let i = 0; i < 5; i += 1) {
          const ex = await env.DB.prepare(`SELECT 1 FROM memorabilia_events WHERE slug = ?`).bind(slug).first();
          if (!ex) break;
          slug = `${input.slug}-${Math.random().toString(36).slice(2, 5)}`;
        }
        const res = await env.DB.prepare(
          `INSERT INTO memorabilia_events
            (slug, name_en, name_ko,
             start_year, start_month, start_day, end_year, end_month, end_day,
             description_en, description_ko, archived)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          slug, input.name_en, input.name_ko,
          input.start_year, input.start_month, input.start_day,
          input.end_year,   input.end_month,   input.end_day,
          input.description_en, input.description_ko,
          input.archived,
        ).run();
        // 같은 import 내 후속 행에서 다시 dedup 매칭되도록 lookup 갱신
        const newRow = {
          id: res.meta.last_row_id,
          slug,
          name_en: input.name_en,
          name_ko: input.name_ko,
        };
        bySlug.set(slug, newRow);
        const key = (input.name_en || '').trim().toLowerCase() + '|' + (input.name_ko || '').trim().toLowerCase();
        byNamePair.set(key, newRow);
        results.inserted += 1;
      }
    } catch (err) {
      results.errors.push({ line: lineNo, errors: ['DB 오류: ' + String(err && err.message || err)] });
    }
  }

  return json({ ok: true, ...results });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
