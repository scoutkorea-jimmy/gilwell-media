/**
 * Memorabilia Events — 공통 행사 카탈로그 (memorabilia_events).
 *
 * 날짜 모델: start_year/month/day, end_year/month/day 각각 NULL 허용.
 *  - year   만:    {year: 2026, month: null, day: null} → "2026년"
 *  - year+month:  {year: 2026, month: 8, day: null}    → "2026년 8월"
 *  - year+month+day: {year: 2026, month: 8, day: 4}    → "2026년 8월 4일"
 *
 * 검증:
 *  - month 있으면 1..12
 *  - day 있으면 1..31 (month 정밀 검증은 클라이언트 책임 — 서버는 범위만)
 *  - day 가 있으면 month 도 있어야 함 (월 없이 일만 입력 금지)
 *  - month 가 있으면 year 도 있어야 함
 */

function slugify(text, fallback) {
  const cleaned = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || (fallback || 'event-' + Math.random().toString(36).slice(2, 8));
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function normalizeEventInput(body) {
  const errors = [];
  const name_en = String(body?.name_en || '').trim().slice(0, 200);
  const name_ko = String(body?.name_ko || '').trim().slice(0, 200);
  if (!name_en && !name_ko) errors.push('행사명은 영문/국문 중 하나는 입력해야 합니다.');

  const category_id = intOrNull(body?.category_id);

  const start_year  = intOrNull(body?.start_year);
  const start_month = intOrNull(body?.start_month);
  const start_day   = intOrNull(body?.start_day);
  const end_year    = intOrNull(body?.end_year);
  const end_month   = intOrNull(body?.end_month);
  const end_day     = intOrNull(body?.end_day);

  function validateDate(label, year, month, day) {
    if (day != null && month == null) errors.push(`${label}: 일을 입력하려면 월도 입력해야 합니다.`);
    if (month != null && year == null) errors.push(`${label}: 월을 입력하려면 연도도 입력해야 합니다.`);
    if (year != null && (year < 1800 || year > 2200)) errors.push(`${label}: 연도가 범위를 벗어납니다.`);
    if (month != null && (month < 1 || month > 12)) errors.push(`${label}: 월은 1~12 범위여야 합니다.`);
    if (day != null && (day < 1 || day > 31)) errors.push(`${label}: 일은 1~31 범위여야 합니다.`);
  }
  validateDate('시작일', start_year, start_month, start_day);
  validateDate('종료일', end_year, end_month, end_day);

  // 시작 > 종료 검사 (둘 다 있을 때)
  if (start_year != null && end_year != null) {
    const startKey = (start_year * 10000) + ((start_month || 0) * 100) + (start_day || 0);
    const endKey   = (end_year * 10000)   + ((end_month   || 0) * 100) + (end_day   || 0);
    if (startKey > endKey) errors.push('시작일이 종료일보다 늦을 수 없습니다.');
  }

  const description_en = String(body?.description_en || '').trim().slice(0, 2000);
  const description_ko = String(body?.description_ko || '').trim().slice(0, 2000);

  return {
    errors,
    input: {
      slug: body?.slug ? slugify(body.slug) : slugify(name_en || name_ko),
      name_en, name_ko,
      category_id,
      start_year, start_month, start_day,
      end_year, end_month, end_day,
      description_en, description_ko,
      archived: body?.archived ? 1 : 0,
    },
  };
}

export function formatEventPeriod(row) {
  if (!row) return '';
  const fmtSide = (y, m, d) => {
    if (y == null) return '';
    if (m == null) return `${y}년`;
    if (d == null) return `${y}년 ${m}월`;
    return `${y}년 ${m}월 ${d}일`;
  };
  const s = fmtSide(row.start_year, row.start_month, row.start_day);
  const e = fmtSide(row.end_year, row.end_month, row.end_day);
  if (!s && !e) return '';
  if (s && !e) return s;
  if (!s && e) return `~ ${e}`;
  if (s === e) return s;
  // 같은 연·월이면 후반 축약 — "2026년 8월 1일 ~ 4일"
  if (row.start_year === row.end_year && row.start_month != null && row.start_month === row.end_month
      && row.start_day != null && row.end_day != null) {
    return `${row.start_year}년 ${row.start_month}월 ${row.start_day}일 ~ ${row.end_day}일`;
  }
  // 같은 연도, 다른 월
  if (row.start_year === row.end_year && row.start_month != null && row.end_month != null) {
    if (row.end_day != null) return `${s} ~ ${row.end_month}월 ${row.end_day}일`;
    return `${s} ~ ${row.end_month}월`;
  }
  return `${s} ~ ${e}`;
}

const MONTH_ABBR_EN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 영문 기간 포맷: "Aug 1 – 12, 2023" / "Aug 1, 2023 – Sep 5, 2023" / "2023" / "Aug 2023".
// 사용자 알림: 같은 연·월이면 동일 패턴으로 축약 (한글과 대응).
export function formatEventPeriodEn(row) {
  if (!row) return '';
  const fmtSide = (y, m, d) => {
    if (y == null) return '';
    if (m == null) return `${y}`;
    if (d == null) return `${MONTH_ABBR_EN[m]} ${y}`;
    return `${MONTH_ABBR_EN[m]} ${d}, ${y}`;
  };
  const s = fmtSide(row.start_year, row.start_month, row.start_day);
  const e = fmtSide(row.end_year, row.end_month, row.end_day);
  if (!s && !e) return '';
  if (s && !e) return s;
  if (!s && e) return `~ ${e}`;
  if (s === e) return s;
  // 같은 연·월·둘 다 day 있음: "Aug 1 – 12, 2023"
  if (row.start_year === row.end_year && row.start_month != null && row.start_month === row.end_month
      && row.start_day != null && row.end_day != null) {
    return `${MONTH_ABBR_EN[row.start_month]} ${row.start_day} – ${row.end_day}, ${row.start_year}`;
  }
  // 같은 연도 다른 월
  if (row.start_year === row.end_year && row.start_month != null && row.end_month != null) {
    if (row.end_day != null) return `${MONTH_ABBR_EN[row.start_month]} ${row.start_day || ''}${row.start_day ? ' ' : ''}– ${MONTH_ABBR_EN[row.end_month]} ${row.end_day}, ${row.start_year}`.replace(/  +/g, ' ');
    return `${MONTH_ABBR_EN[row.start_month]} – ${MONTH_ABBR_EN[row.end_month]} ${row.start_year}`;
  }
  return `${s} – ${e}`;
}

// 참조 카운트는 cached memorabilia_events.usage_count 가 아니라 실시간 서브쿼리로
// 계산. 이전엔 cached 컬럼이 update/delete 누락으로 drift 했음. cached 컬럼은
// 호환을 위해 유지하되 응답에서는 항상 실시간 값으로 덮어쓴다 (2026-05-26 fix).
// category_id + LEFT JOIN memorabilia_event_categories 로 분류 라벨도 포함.
export async function listEvents(db, { archived = false } = {}) {
  const whereArchived = archived ? '' : 'WHERE e.archived = 0';
  const { results } = await db.prepare(
    `SELECT e.id, e.slug, e.name_en, e.name_ko,
            e.category_id,
            cat.slug AS category_slug, cat.label_en AS category_label_en, cat.label_ko AS category_label_ko,
            e.start_year, e.start_month, e.start_day,
            e.end_year, e.end_month, e.end_day,
            e.description_en, e.description_ko, e.archived,
            (SELECT COUNT(*) FROM memorabilia m WHERE m.event_id = e.id) AS usage_count,
            e.created_at, e.updated_at
       FROM memorabilia_events e
       LEFT JOIN memorabilia_event_categories cat ON cat.id = e.category_id
       ${whereArchived}
      ORDER BY COALESCE(cat.sort_order, 999) ASC,
               COALESCE(e.start_year, 0) DESC,
               COALESCE(e.start_month, 0) DESC,
               COALESCE(e.start_day, 0) DESC,
               e.id DESC`
  ).all();
  return (results || []).map((row) => ({
    ...row,
    period_text: formatEventPeriod(row),
    period_text_en: formatEventPeriodEn(row),
  }));
}

export async function getEvent(db, id) {
  const row = await db.prepare(
    `SELECT e.id, e.slug, e.name_en, e.name_ko,
            e.category_id,
            cat.slug AS category_slug, cat.label_en AS category_label_en, cat.label_ko AS category_label_ko,
            e.start_year, e.start_month, e.start_day,
            e.end_year, e.end_month, e.end_day,
            e.description_en, e.description_ko, e.archived,
            (SELECT COUNT(*) FROM memorabilia m WHERE m.event_id = e.id) AS usage_count,
            e.created_at, e.updated_at
       FROM memorabilia_events e
       LEFT JOIN memorabilia_event_categories cat ON cat.id = e.category_id
      WHERE e.id = ?`
  ).bind(id).first();
  if (!row) return null;
  return { ...row, period_text: formatEventPeriod(row), period_text_en: formatEventPeriodEn(row) };
}

// 카테고리 카탈로그 헬퍼 ──────────────────────────────────────────────────────
export async function listEventCategories(db, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived = 0';
  const { results } = await db.prepare(
    `SELECT c.id, c.slug, c.label_en, c.label_ko, c.sort_order, c.archived,
            c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM memorabilia_events e WHERE e.category_id = c.id) AS usage_count
       FROM memorabilia_event_categories c
       ${where}
      ORDER BY c.sort_order ASC, c.label_ko ASC`
  ).all();
  return results || [];
}

export async function createEvent(db, input) {
  // slug 중복 회피
  let slug = input.slug;
  for (let i = 0; i < 5; i += 1) {
    const exists = await db.prepare(`SELECT 1 FROM memorabilia_events WHERE slug = ?`).bind(slug).first();
    if (!exists) break;
    slug = `${input.slug}-${Math.random().toString(36).slice(2, 5)}`;
  }
  const res = await db.prepare(
    `INSERT INTO memorabilia_events
       (slug, name_en, name_ko, category_id,
        start_year, start_month, start_day, end_year, end_month, end_day,
        description_en, description_ko, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    slug, input.name_en, input.name_ko, input.category_id || null,
    input.start_year, input.start_month, input.start_day,
    input.end_year,   input.end_month,   input.end_day,
    input.description_en, input.description_ko,
    input.archived ? 1 : 0,
  ).run();
  return res.meta.last_row_id;
}

export async function updateEvent(db, id, input) {
  await db.prepare(
    `UPDATE memorabilia_events SET
        name_en = ?, name_ko = ?,
        category_id = ?,
        start_year = ?, start_month = ?, start_day = ?,
        end_year = ?,   end_month = ?,   end_day = ?,
        description_en = ?, description_ko = ?,
        archived = ?,
        updated_at = datetime('now')
      WHERE id = ?`
  ).bind(
    input.name_en, input.name_ko,
    input.category_id || null,
    input.start_year, input.start_month, input.start_day,
    input.end_year,   input.end_month,   input.end_day,
    input.description_en, input.description_ko,
    input.archived ? 1 : 0,
    id,
  ).run();
}

export async function deleteEvent(db, id) {
  // SET NULL on memorabilia.event_id 가 자동으로 끊김
  await db.prepare(`DELETE FROM memorabilia_events WHERE id = ?`).bind(id).run();
}

export async function refreshUsageCount(db, eventId) {
  await db.prepare(
    `UPDATE memorabilia_events SET usage_count = (
        SELECT COUNT(*) FROM memorabilia WHERE event_id = ?
     ) WHERE id = ?`
  ).bind(eventId, eventId).run();
}
