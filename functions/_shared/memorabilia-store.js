/**
 * Gilwell Media · Memorabilia (기념품 도감) 저장소 헬퍼
 *
 * 도감 항목 CRUD + 부속 테이블(이미지·국가·태그) 트랜잭션 + FTS 동기화를 한곳에 모은다.
 * API 엔드포인트는 이 모듈만 호출한다 — D1 prepare/bind 직접 호출 금지 (예외: 단순 카탈로그 조회).
 */

import { COUNTRY_CODE_LABELS_KO } from './country-code-labels.js';
import {
  extractEditorJsPlain,
  upsertMemorabiliaFtsRow,
  deleteMemorabiliaFtsRow,
} from './memorabilia-search.js';

// ─────────────────────────────────────────────────────────────────────────────
// 입력 정규화
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LIMITS = {
  title:     200,
  event:     200,
  material:  200,
  size:      120,
  issuer:    200,
  slug:      120,
  link_label: 120,
  link_url:  500,
  alt:       200,
  tag_label:  60,
};

function trimStr(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function trimEditorJson(value) {
  // Editor.js JSON 은 그대로 두되, 1MB 한도 안전을 위해 길이 가드
  const s = typeof value === 'string' ? value : (value ? JSON.stringify(value) : '');
  return s.slice(0, 500000);
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1900 || n > 2100) return null;
  return n;
}

function normalizeCountryCodes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const code = String(raw || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.slice(0, 8);
}

function normalizeTagLabels(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const label = trimStr(raw, FIELD_LIMITS.tag_label);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.slice(0, 30);
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const url = trimStr(raw.url, FIELD_LIMITS.link_url);
    if (!url) continue;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) continue;
    out.push({
      label_en: trimStr(raw.label_en, FIELD_LIMITS.link_label),
      label_ko: trimStr(raw.label_ko, FIELD_LIMITS.link_label),
      url,
    });
  }
  return out.slice(0, 20);
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  let primaryClaimed = false;
  for (let i = 0; i < value.length; i++) {
    const raw = value[i];
    if (!raw || typeof raw !== 'object') continue;
    const url = trimStr(raw.url, FIELD_LIMITS.link_url);
    if (!url) continue;
    const isPrimary = !!raw.is_primary && !primaryClaimed;
    if (isPrimary) primaryClaimed = true;
    out.push({
      url,
      alt_en: trimStr(raw.alt_en, FIELD_LIMITS.alt),
      alt_ko: trimStr(raw.alt_ko, FIELD_LIMITS.alt),
      is_primary: isPrimary ? 1 : 0,
      sort_order: Number.isFinite(Number(raw.sort_order)) ? parseInt(raw.sort_order, 10) : i,
    });
  }
  // 대표 미지정 시 첫 번째 자동 지정
  if (out.length && !primaryClaimed) out[0].is_primary = 1;
  return out.slice(0, 20);
}

function generateSlug(title_en, title_ko, id) {
  const base = (title_en || title_ko || '').toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return base ? `${base}-${id}` : `item-${id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 입력 정규화 — 외부 API 입력 → 내부 형태
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeMemorabiliaInput(body) {
  const errors = [];
  const title_en = trimStr(body.title_en, FIELD_LIMITS.title);
  const title_ko = trimStr(body.title_ko, FIELD_LIMITS.title);
  if (!title_en && !title_ko) errors.push('제목은 한국어 또는 영어 중 하나는 필수입니다');

  const has_event = body.has_event ? 1 : 0;
  const status = (body.status === 'public' ? 'public' : 'draft');

  // event_id 가 명시되면 그 행사 카탈로그를 참조. 함께 들어온 event_name 은
  // denormalized cache 로 보존 (행사 이름이 나중에 바뀌어도 빠른 표시 + 검색 인덱스).
  // event_id == null 이면 free-text 입력 (legacy 호환).
  const event_id = body.event_id != null && body.event_id !== '' ? (parseInt(body.event_id, 10) || null) : null;

  return {
    errors,
    input: {
      title_en, title_ko,
      has_event,
      event_id,
      event_name_en: has_event ? trimStr(body.event_name_en, FIELD_LIMITS.event) : '',
      event_name_ko: has_event ? trimStr(body.event_name_ko, FIELD_LIMITS.event) : '',
      year:          normalizeYear(body.year),
      category_id:   body.category_id != null ? parseInt(body.category_id, 10) || null : null,
      material_en:   trimStr(body.material_en, FIELD_LIMITS.material),
      material_ko:   trimStr(body.material_ko, FIELD_LIMITS.material),
      size_text:     trimStr(body.size_text, FIELD_LIMITS.size),
      issuer_en:     trimStr(body.issuer_en, FIELD_LIMITS.issuer),
      issuer_ko:     trimStr(body.issuer_ko, FIELD_LIMITS.issuer),
      description_en: trimEditorJson(body.description_en),
      description_ko: trimEditorJson(body.description_ko),
      related_links: normalizeLinks(body.related_links),
      country_codes: normalizeCountryCodes(body.country_codes),
      tags:          normalizeTagLabels(body.tags),
      images:        normalizeImages(body.images),
      status,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCategoryMap(db) {
  const { results } = await db.prepare(`
    SELECT id, slug, label_en, label_ko, sort_order, archived
      FROM memorabilia_categories
     ORDER BY archived ASC, sort_order ASC, id ASC
  `).all();
  const list = results || [];
  const byId = {};
  for (const row of list) byId[row.id] = row;
  return { list, byId };
}

export async function getMemorabiliaById(db, id, { includeDrafts = false } = {}) {
  const row = await db.prepare(`
    SELECT m.*, c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko
      FROM memorabilia m
      LEFT JOIN memorabilia_categories c ON c.id = m.category_id
     WHERE m.id = ?
  `).bind(id).first();
  if (!row) return null;
  if (!includeDrafts && row.status !== 'public') return null;
  return hydrateOne(db, row);
}

export async function getMemorabiliaBySlug(db, slug, { includeDrafts = false } = {}) {
  const row = await db.prepare(`
    SELECT m.*, c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko
      FROM memorabilia m
      LEFT JOIN memorabilia_categories c ON c.id = m.category_id
     WHERE m.slug = ?
  `).bind(slug).first();
  if (!row) return null;
  if (!includeDrafts && row.status !== 'public') return null;
  return hydrateOne(db, row);
}

async function hydrateOne(db, row) {
  const [imagesRes, countriesRes, tagsRes, eventRow] = await Promise.all([
    db.prepare(`
      SELECT id, url, alt_en, alt_ko, is_primary, sort_order
        FROM memorabilia_images
       WHERE memorabilia_id = ?
       ORDER BY is_primary DESC, sort_order ASC, id ASC
    `).bind(row.id).all(),
    db.prepare(`
      SELECT country_code FROM memorabilia_countries WHERE memorabilia_id = ? ORDER BY country_code
    `).bind(row.id).all(),
    db.prepare(`
      SELECT p.id, p.label
        FROM memorabilia_tag_pool p
        JOIN memorabilia_tags mt ON mt.tag_id = p.id
       WHERE mt.memorabilia_id = ?
       ORDER BY p.label
    `).bind(row.id).all(),
    // 카탈로그 행사가 연결된 경우 함께 가져옴 (없으면 null)
    row.event_id
      ? db.prepare(`
          SELECT id, slug, name_en, name_ko,
                 start_year, start_month, start_day, end_year, end_month, end_day,
                 description_en, description_ko, usage_count
            FROM memorabilia_events WHERE id = ?
        `).bind(row.event_id).first()
      : Promise.resolve(null),
  ]);
  // event period_text 는 클라이언트에서도 사용하므로 여기서 미리 포맷
  let event = null;
  if (eventRow) {
    const { formatEventPeriod, formatEventPeriodEn } = await import('./memorabilia-events.js');
    event = {
      ...eventRow,
      period_text: formatEventPeriod(eventRow),
      period_text_en: formatEventPeriodEn(eventRow),
    };
  }
  return {
    ...row,
    event,                                 // 카탈로그 참조 (없으면 null)
    related_links: safeParseJson(row.related_links_json) || [],
    images:        imagesRes.results || [],
    country_codes: (countriesRes.results || []).map((r) => r.country_code),
    country_labels_ko: (countriesRes.results || []).map((r) => COUNTRY_CODE_LABELS_KO[r.country_code] || r.country_code),
    tags:          (tagsRes.results || []).map((r) => r.label),
  };
}

function safeParseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 생성 / 수정
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D1 has no traditional transactions across multiple statements via the binding,
 * but each statement is atomic. We use batch() for related writes when possible.
 * For simplicity here we do sequential writes — if a follow-up fails the row
 * exists but its relations might be partial. Acceptable for low-write admin flows.
 */
export async function createMemorabilia(db, input, { createdBy = null } = {}) {
  // event_id 가 주어지면 events 카탈로그에서 name 을 가져와 cache 갱신
  await maybeHydrateEventName(db, input);

  const result = await db.prepare(`
    INSERT INTO memorabilia (
      slug,
      title_en, title_ko,
      has_event, event_id, event_name_en, event_name_ko,
      year, category_id,
      material_en, material_ko,
      size_text,
      issuer_en, issuer_ko,
      description_en, description_ko,
      description_plain_en, description_plain_ko,
      related_links_json,
      status,
      created_by, created_at, updated_at, published_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      datetime('now'), datetime('now'),
      CASE WHEN ? = 'public' THEN datetime('now') ELSE NULL END
    )
    RETURNING id
  `).bind(
    `__pending__${Date.now()}`,                  // 임시 slug (id 받은 후 갱신)
    input.title_en, input.title_ko,
    input.has_event, input.event_id, input.event_name_en, input.event_name_ko,
    input.year, input.category_id,
    input.material_en, input.material_ko,
    input.size_text,
    input.issuer_en, input.issuer_ko,
    input.description_en, input.description_ko,
    extractEditorJsPlain(input.description_en),
    extractEditorJsPlain(input.description_ko),
    JSON.stringify(input.related_links || []),
    input.status,
    createdBy,
    input.status,
  ).first();

  const id = result.id;
  if (input.event_id) {
    await db.prepare(`UPDATE memorabilia_events SET usage_count = usage_count + 1 WHERE id = ?`).bind(input.event_id).run();
  }

  // slug 갱신 (id 기반)
  const finalSlug = generateSlug(input.title_en, input.title_ko, id);
  await db.prepare(`UPDATE memorabilia SET slug = ? WHERE id = ?`).bind(finalSlug, id).run();

  await syncRelations(db, id, input);
  await syncFtsForId(db, id);
  return id;
}

export async function updateMemorabilia(db, id, input) {
  const existing = await db.prepare(`SELECT id, status, event_id FROM memorabilia WHERE id = ?`).bind(id).first();
  if (!existing) return null;

  const isPublishingNow = input.status === 'public' && existing.status !== 'public';

  await maybeHydrateEventName(db, input);

  // event_id 변경 시 events.usage_count 조정 — 이전엔 create/delete 만 ±1 했고
  // update 에서 누락되어 행사 변경/해제 시 카운트가 드리프트 했음 (2026-05-26 fix).
  const oldEventId = existing.event_id || null;
  const newEventId = input.event_id || null;
  if (oldEventId !== newEventId) {
    if (oldEventId) {
      await db.prepare(`UPDATE memorabilia_events SET usage_count = MAX(usage_count - 1, 0) WHERE id = ?`).bind(oldEventId).run();
    }
    if (newEventId) {
      await db.prepare(`UPDATE memorabilia_events SET usage_count = usage_count + 1 WHERE id = ?`).bind(newEventId).run();
    }
  }

  await db.prepare(`
    UPDATE memorabilia SET
      title_en = ?, title_ko = ?,
      has_event = ?, event_id = ?, event_name_en = ?, event_name_ko = ?,
      year = ?, category_id = ?,
      material_en = ?, material_ko = ?,
      size_text = ?,
      issuer_en = ?, issuer_ko = ?,
      description_en = ?, description_ko = ?,
      description_plain_en = ?, description_plain_ko = ?,
      related_links_json = ?,
      status = ?,
      updated_at = datetime('now'),
      published_at = CASE
        WHEN ? = 'public' AND published_at IS NULL THEN datetime('now')
        WHEN ? = 'draft' THEN published_at
        ELSE published_at
      END
    WHERE id = ?
  `).bind(
    input.title_en, input.title_ko,
    input.has_event, input.event_id, input.event_name_en, input.event_name_ko,
    input.year, input.category_id,
    input.material_en, input.material_ko,
    input.size_text,
    input.issuer_en, input.issuer_ko,
    input.description_en, input.description_ko,
    extractEditorJsPlain(input.description_en),
    extractEditorJsPlain(input.description_ko),
    JSON.stringify(input.related_links || []),
    input.status,
    input.status,
    input.status,
    id,
  ).run();

  await syncRelations(db, id, input);
  await syncFtsForId(db, id);
  return id;
}

export async function deleteMemorabilia(db, id) {
  // usage_count 감산용: 삭제 전에 event_id 캡쳐
  const row = await db.prepare(`SELECT event_id FROM memorabilia WHERE id = ?`).bind(id).first();
  await deleteMemorabiliaFtsRow(db, id);
  // 부속 테이블은 FK ON DELETE CASCADE 로 자동 정리
  await db.prepare(`DELETE FROM memorabilia WHERE id = ?`).bind(id).run();
  if (row && row.event_id) {
    await db.prepare(`UPDATE memorabilia_events SET usage_count = MAX(usage_count - 1, 0) WHERE id = ?`).bind(row.event_id).run();
  }
}

// event_id 가 주어지면 events 카탈로그에서 name_en/ko 를 가져와 input 의
// denormalized event_name 캐시를 덮어쓴다 (행사 이름 변경 시 일관성).
// has_event 가 false 거나 event_id 가 없으면 free-text 입력 그대로 유지.
async function maybeHydrateEventName(db, input) {
  if (!input.has_event || !input.event_id) return;
  const row = await db.prepare(
    `SELECT name_en, name_ko FROM memorabilia_events WHERE id = ?`
  ).bind(input.event_id).first();
  if (!row) {
    // 잘못된 event_id → 카탈로그 참조 해제, free-text fallback
    input.event_id = null;
    return;
  }
  input.event_name_en = row.name_en || input.event_name_en || '';
  input.event_name_ko = row.name_ko || input.event_name_ko || '';
}

async function syncRelations(db, id, input) {
  // 1) 국가
  await db.prepare(`DELETE FROM memorabilia_countries WHERE memorabilia_id = ?`).bind(id).run();
  for (const code of input.country_codes) {
    await db.prepare(`
      INSERT OR IGNORE INTO memorabilia_countries (memorabilia_id, country_code) VALUES (?, ?)
    `).bind(id, code).run();
  }

  // 2) 태그 (풀에 없으면 추가, 카운트 증가)
  await db.prepare(`DELETE FROM memorabilia_tags WHERE memorabilia_id = ?`).bind(id).run();
  for (const label of input.tags) {
    let row = await db.prepare(`SELECT id FROM memorabilia_tag_pool WHERE label = ?`).bind(label).first();
    if (!row) {
      row = await db.prepare(`
        INSERT INTO memorabilia_tag_pool (label) VALUES (?) RETURNING id
      `).bind(label).first();
    }
    await db.prepare(`
      INSERT OR IGNORE INTO memorabilia_tags (memorabilia_id, tag_id) VALUES (?, ?)
    `).bind(id, row.id).run();
  }
  // usage_count 재계산
  await db.prepare(`
    UPDATE memorabilia_tag_pool
       SET usage_count = (SELECT COUNT(*) FROM memorabilia_tags WHERE tag_id = memorabilia_tag_pool.id),
           updated_at  = datetime('now')
     WHERE id IN (SELECT tag_id FROM memorabilia_tags WHERE memorabilia_id = ?)
  `).bind(id).run();

  // 3) 이미지
  await db.prepare(`DELETE FROM memorabilia_images WHERE memorabilia_id = ?`).bind(id).run();
  for (const img of input.images) {
    await db.prepare(`
      INSERT INTO memorabilia_images (memorabilia_id, url, alt_en, alt_ko, is_primary, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, img.url, img.alt_en, img.alt_ko, img.is_primary, img.sort_order).run();
  }
}

export async function syncFtsForId(db, id) {
  // 1) 메인 + 카테고리 라벨
  const row = await db.prepare(`
    SELECT m.*, c.label_en AS category_label_en, c.label_ko AS category_label_ko
      FROM memorabilia m
      LEFT JOIN memorabilia_categories c ON c.id = m.category_id
     WHERE m.id = ?
  `).bind(id).first();
  if (!row) return;

  // 2) 부수 데이터 조회
  const [countriesRes, tagsRes] = await Promise.all([
    db.prepare(`SELECT country_code FROM memorabilia_countries WHERE memorabilia_id = ?`).bind(id).all(),
    db.prepare(`
      SELECT p.label FROM memorabilia_tag_pool p
        JOIN memorabilia_tags mt ON mt.tag_id = p.id
       WHERE mt.memorabilia_id = ?
    `).bind(id).all(),
  ]);

  await upsertMemorabiliaFtsRow(db, {
    id: row.id,
    title_en: row.title_en, title_ko: row.title_ko,
    event_name_en: row.event_name_en, event_name_ko: row.event_name_ko,
    issuer_en: row.issuer_en, issuer_ko: row.issuer_ko,
    material_en: row.material_en, material_ko: row.material_ko,
    description_plain_en: row.description_plain_en, description_plain_ko: row.description_plain_ko,
    category_label_en: row.category_label_en || '',
    category_label_ko: row.category_label_ko || '',
    country_codes: (countriesRes.results || []).map((r) => r.country_code),
    tags:          (tagsRes.results || []).map((r) => r.label),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 자동완성 / 패싯 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

export async function suggestIssuers(db, prefix, limit = 8) {
  const p = trimStr(prefix, 80);
  if (!p) return [];
  const like = `%${p}%`;
  const { results } = await db.prepare(`
    SELECT DISTINCT v FROM (
      SELECT issuer_ko AS v FROM memorabilia WHERE issuer_ko LIKE ? AND issuer_ko != ''
      UNION
      SELECT issuer_en AS v FROM memorabilia WHERE issuer_en LIKE ? AND issuer_en != ''
    ) ORDER BY v LIMIT ?
  `).bind(like, like, limit).all();
  return (results || []).map((r) => r.v);
}

export async function suggestTags(db, prefix, limit = 10) {
  const p = trimStr(prefix, 60);
  if (!p) {
    const { results } = await db.prepare(`
      SELECT label, usage_count FROM memorabilia_tag_pool ORDER BY usage_count DESC, label ASC LIMIT ?
    `).bind(limit).all();
    return (results || []).map((r) => r.label);
  }
  const like = `%${p}%`;
  const { results } = await db.prepare(`
    SELECT label FROM memorabilia_tag_pool WHERE label LIKE ? ORDER BY usage_count DESC, label ASC LIMIT ?
  `).bind(like, limit).all();
  return (results || []).map((r) => r.label);
}
