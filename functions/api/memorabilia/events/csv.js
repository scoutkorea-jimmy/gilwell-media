/**
 * GET  /api/memorabilia/events/csv             — 전체 행사 CSV export (관리자)
 * GET  /api/memorabilia/events/csv?template=1  — 샘플이 포함된 템플릿 CSV
 * POST /api/memorabilia/events/csv             — CSV 일괄 업로드 (body: text/csv 또는 JSON {csv:string})
 *
 * 사용자 친화 CSV 포맷 (2026-05-26 개선):
 *
 *   8개 컬럼 (한글 헤더 한 줄 + 영문 alias 자동 인식):
 *     슬러그 | 행사명(영문) | 행사명(국문) | 시작일 | 종료일 | 설명(영문) | 설명(국문) | 아카이브
 *
 *   영문 alias 도 그대로 허용: slug · name_en · name_ko · start_date · end_date · description_en · description_ko · archived
 *
 *   레거시 분할 컬럼(start_year / start_month / start_day / end_year / end_month / end_day) 도
 *   하위 호환을 위해 인식. 통합·분할 둘 다 있으면 통합값(start_date/end_date)이 우선.
 *
 *   날짜 컬럼은 자유 형식:
 *     "2023"            → 연도만
 *     "2023-08"         → 연 + 월        (2023.08 / 2023/08 / 2023년 8월 모두 동일 처리)
 *     "2023-08-01"      → 연 + 월 + 일   (2023.08.01 / 2023/08/01 / 2023년 8월 1일 모두 동일)
 *     "" / "-" / "x"    → 비움
 *
 *   archived 컬럼은: 0/1, true/false, yes/no, y/n, 활성/아카이브(=숨김) 모두 인식.
 *
 * Dedup (POST):
 *   1. slug 가 비어있지 않으면 → slug 매칭. 매칭되면 UPDATE, 아니면 INSERT.
 *   2. slug 가 비어있으면 → (name_en + name_ko) trim 매칭 → UPDATE / 없으면 INSERT.
 *
 * "동일 자료는 기존 데이터에 흡수" — 같은 행사를 다시 올리면 INSERT 가 아니라 UPDATE.
 *
 * 인코딩: UTF-8 + BOM (Excel 한글 호환).
 */
import { gateMenuAccess } from '../../../_shared/admin-permissions.js';
import { listEvents, normalizeEventInput } from '../../../_shared/memorabilia-events.js';

// ─── CSV 컬럼 정의 ───────────────────────────────────────────────────────────
// 헤더에 노출되는 한글 라벨 + 인식되는 alias 들.
const COLUMNS = [
  { key: 'slug',           label: '슬러그',         aliases: ['slug', '슬러그'] },
  { key: 'name_en',        label: '행사명(영문)',  aliases: ['name_en', 'name en', 'name-en', '행사명(영문)', '행사명영문', '영문명', '영문'] },
  { key: 'name_ko',        label: '행사명(국문)',  aliases: ['name_ko', 'name ko', 'name-ko', '행사명(국문)', '행사명국문', '국문명', '국문', '한글명'] },
  { key: 'start_date',     label: '시작일',         aliases: ['start_date', 'start date', '시작일', '시작'] },
  { key: 'end_date',       label: '종료일',         aliases: ['end_date', 'end date', '종료일', '종료'] },
  { key: 'description_en', label: '설명(영문)',    aliases: ['description_en', '설명(영문)', '설명영문', '영문설명'] },
  { key: 'description_ko', label: '설명(국문)',    aliases: ['description_ko', '설명(국문)', '설명국문', '국문설명'] },
  { key: 'archived',       label: '아카이브',       aliases: ['archived', '아카이브', '숨김', '활성', 'status'] },
];

// 레거시 분할 날짜 컬럼 alias (하위호환)
const LEGACY_DATE_FIELDS = {
  start_year:  ['start_year',  '시작연도', '시작_연'],
  start_month: ['start_month', '시작월',   '시작_월'],
  start_day:   ['start_day',   '시작일자', '시작_일'],
  end_year:    ['end_year',    '종료연도', '종료_연'],
  end_month:   ['end_month',   '종료월',   '종료_월'],
  end_day:     ['end_day',     '종료일자', '종료_일'],
};

const HELP_COMMENT = [
  '# 길월미디어 · 기념품 행사 카탈로그 CSV 템플릿 (UTF-8 BOM)',
  '# 헤더 한 줄은 한국어 / 영어 어느 쪽이든 인식합니다. 1·2·3행은 안내(#)·헤더·샘플입니다.',
  '# ─ 슬러그: 비우면 자동 생성. 같은 슬러그/이름이 이미 있으면 해당 행을 업데이트(흡수).',
  '# ─ 행사명: 영문/국문 둘 중 하나는 필수.',
  '# ─ 시작일 / 종료일: "2023" (연도만) · "2023-08" (월까지) · "2023-08-01" (일까지) 자유 표기.',
  '#                 비우려면 빈칸으로. "2023.8.1" · "2023/8/1" · "2023년 8월 1일" 도 OK.',
  '# ─ 설명: 비워도 됨.',
  '# ─ 아카이브: 0/1, 활성/아카이브, true/false 모두 OK. 비우면 0(활성).',
].join('\n');

// ─── CSV serialization ──────────────────────────────────────────────────────
function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function rowsToCsv(rows) {
  const lines = [];
  lines.push(HELP_COMMENT);
  lines.push(COLUMNS.map((c) => c.label).join(','));
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return '﻿' + lines.join('\n') + '\n';
}

// ─── CSV parsing (RFC 4180 lite) ────────────────────────────────────────────
function parseCsv(text) {
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
  return rows.filter((r) => !(r.length === 1 && String(r[0] || '').trim() === '') && !String(r[0] || '').startsWith('#'));
}

// ─── 헤더 → key 매핑 ────────────────────────────────────────────────────────
function normalizeHeaderName(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s_-]/g, '');
}
function buildHeaderIndex(headerRow) {
  // 헤더 cell index → 표준 key 매핑
  const idx = {};
  const norm = headerRow.map(normalizeHeaderName);
  for (const col of COLUMNS) {
    for (const alias of col.aliases) {
      const a = normalizeHeaderName(alias);
      const i = norm.indexOf(a);
      if (i >= 0) { idx[col.key] = i; break; }
    }
  }
  // 레거시 분할 날짜
  for (const [legacyKey, aliases] of Object.entries(LEGACY_DATE_FIELDS)) {
    for (const alias of aliases) {
      const a = normalizeHeaderName(alias);
      const i = norm.indexOf(a);
      if (i >= 0) { idx[legacyKey] = i; break; }
    }
  }
  return idx;
}

// ─── 날짜 파싱 ─────────────────────────────────────────────────────────────
// "2023" / "2023-08" / "2023-08-01" / "2023.8.1" / "2023/8/1" / "2023년 8월 1일" / "" 등.
function parseFlexibleDate(input) {
  const raw = String(input || '').trim();
  if (!raw || /^[-x∅]+$/i.test(raw)) return { year: null, month: null, day: null };
  // 모든 분리자(., /, -, 공백, "년", "월", "일")를 통일된 토큰으로 변환
  const tokens = raw
    .replace(/년|월|일/g, ' ')
    .split(/[.\-/\s]+/)
    .filter(Boolean);
  const intOrNull = (s) => {
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  if (!tokens.length) return { year: null, month: null, day: null };
  const year  = intOrNull(tokens[0]);
  const month = tokens.length >= 2 ? intOrNull(tokens[1]) : null;
  const day   = tokens.length >= 3 ? intOrNull(tokens[2]) : null;
  return { year, month, day };
}

function formatDateForCsv(y, m, d) {
  if (y == null) return '';
  if (m == null) return String(y);
  const mm = String(m).padStart(2, '0');
  if (d == null) return `${y}-${mm}`;
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function parseArchivedFlag(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return 0;
  if (/^(1|true|yes|y|t|on)$/.test(s))     return 1;
  if (/^(0|false|no|n|f|off)$/.test(s))    return 0;
  if (/^(아카이브|숨김|hidden|archived)$/.test(s)) return 1;
  if (/^(활성|active|보임|visible)$/.test(s))      return 0;
  return 0;
}

// ─── GET (export / template) ────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'view');
  if (gate) return gate;

  const url = new URL(request.url);
  const isTemplate = url.searchParams.get('template') === '1';

  try {
    let rows;
    if (isTemplate) {
      rows = [
        // 샘플 1: 연·월·일까지 명시
        ['', '25th World Scout Jamboree', '제25회 세계스카우트잼버리', '2023-08-01', '2023-08-12', 'Held in Saemangeum, Korea.', '대한민국 새만금에서 개최.', '0'],
        // 샘플 2: 월까지만
        ['', '31st APR Scout Jamboree', '제31차 아·태스카우트잼버리', '2017-08', '2017-08', 'Held in Mongolia.', '몽골에서 개최.', '0'],
        // 샘플 3: 연도만, 아카이브
        ['', '14th National Scout Jamboree', '제14회 한국잼버리', '1991', '1991', '', '', '0'],
      ];
    } else {
      const items = await listEvents(env.DB, { archived: true });
      rows = items.map((e) => [
        e.slug || '',
        e.name_en || '',
        e.name_ko || '',
        formatDateForCsv(e.start_year, e.start_month, e.start_day),
        formatDateForCsv(e.end_year,   e.end_month,   e.end_day),
        e.description_en || '',
        e.description_ko || '',
        e.archived ? '1' : '0',
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

// ─── POST (import) ──────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia-events', 'write');
  if (gate) return gate;

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

  // 첫 행 = 헤더
  const headerRow = parsed[0];
  const dataRows  = parsed.slice(1);
  if (!dataRows.length) return json({ error: 'no_data', detail: '데이터 행이 없습니다.' }, 400);

  const headerIdx = buildHeaderIndex(headerRow);
  // 최소한 name_en/ko 컬럼이 인식되었는지 검증
  if (headerIdx.name_en == null && headerIdx.name_ko == null) {
    return json({
      error: 'invalid_header',
      detail: '헤더에 행사명(영문) 또는 행사명(국문) 컬럼이 있어야 합니다.',
      recognized: Object.keys(headerIdx),
      expected_columns: COLUMNS.map((c) => c.label),
    }, 400);
  }

  // 기존 행사 dedup lookup
  const existing = await listEvents(env.DB, { archived: true });
  const bySlug = new Map();
  const byNamePair = new Map();
  for (const e of existing) {
    if (e.slug) bySlug.set(e.slug, e);
    const key = (e.name_en || '').trim().toLowerCase() + '|' + (e.name_ko || '').trim().toLowerCase();
    if (!byNamePair.has(key)) byNamePair.set(key, e);
  }

  const get = (cols, key) => {
    const i = headerIdx[key];
    return i == null ? '' : String(cols[i] || '').trim();
  };

  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  let lineNo = 1; // 1: header

  for (const cols of dataRows) {
    lineNo += 1;
    if (cols.every((c) => String(c || '').trim() === '')) { results.skipped += 1; continue; }

    // 날짜: 통합 컬럼 우선, 없으면 레거시 분할 컬럼.
    let startYear, startMonth, startDay, endYear, endMonth, endDay;
    if (headerIdx.start_date != null) {
      const sd = parseFlexibleDate(get(cols, 'start_date'));
      startYear = sd.year; startMonth = sd.month; startDay = sd.day;
    } else {
      startYear  = numOrNull(get(cols, 'start_year'));
      startMonth = numOrNull(get(cols, 'start_month'));
      startDay   = numOrNull(get(cols, 'start_day'));
    }
    if (headerIdx.end_date != null) {
      const ed = parseFlexibleDate(get(cols, 'end_date'));
      endYear = ed.year; endMonth = ed.month; endDay = ed.day;
    } else {
      endYear  = numOrNull(get(cols, 'end_year'));
      endMonth = numOrNull(get(cols, 'end_month'));
      endDay   = numOrNull(get(cols, 'end_day'));
    }

    const row = {
      slug:           get(cols, 'slug'),
      name_en:        get(cols, 'name_en'),
      name_ko:        get(cols, 'name_ko'),
      start_year:     startYear,
      start_month:    startMonth,
      start_day:      startDay,
      end_year:       endYear,
      end_month:      endMonth,
      end_day:        endDay,
      description_en: get(cols, 'description_en'),
      description_ko: get(cols, 'description_ko'),
      archived:       parseArchivedFlag(get(cols, 'archived')),
    };

    const { errors, input } = normalizeEventInput(row);
    if (errors.length) {
      results.errors.push({ line: lineNo, errors });
      continue;
    }

    // Dedup matching
    let target = null;
    if (row.slug && bySlug.has(row.slug)) target = bySlug.get(row.slug);
    if (!target) {
      const key = (row.name_en || '').trim().toLowerCase() + '|' + (row.name_ko || '').trim().toLowerCase();
      if (byNamePair.has(key)) target = byNamePair.get(key);
    }

    try {
      if (target) {
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
        const newRow = {
          id: res.meta.last_row_id, slug,
          name_en: input.name_en, name_ko: input.name_ko,
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

function numOrNull(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
