import { queryRust } from './rust-server.js';

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

function validationInput(body) {
  const fields = ['category_id', 'start_year', 'start_month', 'start_day', 'end_year', 'end_month', 'end_day'];
  const values = Object.fromEntries(fields.map((key) => [key, body?.[key]]));
  const units = (text) => Array.from({length:text.length}, (_, i) => text.charCodeAt(i));
  const text_units = Object.fromEntries(['name_en','name_ko','description_en','description_ko'].map((key) => [key, units(String(body?.[key] || ''))]));
  return {...values, text_units, archived:!!body?.archived, ...(body?.slug ? {slug_units:units(String(body.slug))} : {})};
}

export async function validateEventInputs(bodies, env) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'memorabilia-event-validate', bodies.map(validationInput));
  if (!response.ok) throw new Error('Rust event validation failed');
  return response.json();
}

export async function normalizeEventInput(body, env, validation) {
  const { errors, text_units, ...input } = validation || (await validateEventInputs([body], env))[0];
  for (const [key, units] of Object.entries(text_units)) input[key] = String.fromCharCode(...units);
  return {errors, input:{
    ...input,
  }};
}

// 참조 카운트는 cached memorabilia_events.usage_count 가 아니라 실시간 서브쿼리로
// 계산. 이전엔 cached 컬럼이 update/delete 누락으로 drift 했음. cached 컬럼은
// 호환을 위해 유지하되 응답에서는 항상 실시간 값으로 덮어쓴다 (2026-05-26 fix).
// category_id + LEFT JOIN memorabilia_event_categories 로 분류 라벨도 포함.
export async function listEvents(db, { archived = false } = {}) {
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-events-list', {archived});
  if (!response.ok) throw new Error('Rust event list failed');
  return (await response.json()).items || [];
}

export async function getEvent(db, id) {
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-event-get', {id});
  if (!response.ok) throw new Error('Rust event lookup failed');
  return (await response.json()).row || null;
}

// 카테고리 카탈로그 헬퍼 ──────────────────────────────────────────────────────
export async function listEventCategories(db, { includeArchived = false } = {}) {
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'event-category-list', {includeArchived});
  if (!response.ok) throw new Error('Rust event category list failed');
  return (await response.json()).items;
}

export async function createEvent(db, input) {
  return (await createEventWithSlug(db, input)).id;
}

export async function createEventWithSlug(db, input) {
  const bindings = [input.slug,input.name_en,input.name_ko,input.category_id || null,
    input.start_year,input.start_month,input.start_day,input.end_year,input.end_month,input.end_day,
    input.description_en,input.description_ko,input.archived ? 1 : 0];
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-event-create', {bindings});
  if (!response.ok) throw new Error('Rust event creation failed');
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return {id:result.id,slug:result.slug};
}

export async function updateEvent(db, id, input, expected) {
  const bindings = [input.name_en,input.name_ko,input.category_id || null,
    input.start_year,input.start_month,input.start_day,input.end_year,input.end_month,input.end_day,
    input.description_en,input.description_ko,input.archived ? 1 : 0,id];
  const fields=['name_en','name_ko','category_id','start_year','start_month','start_day','end_year','end_month','end_day','description_en','description_ko','archived'];
  const snapshot=Array.isArray(expected) ? expected : expected ? fields.map(key=>expected[key] ?? null) : null;
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-event-update', {bindings,expected:snapshot});
  if (!response.ok) throw new Error('Rust event update failed');
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  if (result.conflict) return {conflict:true};
}

export async function deleteEvent(db, id) {
  // SET NULL on memorabilia.event_id 가 자동으로 끊김
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-event-delete', {id});
  if (!response.ok) throw new Error('Rust event delete failed');
}

export async function refreshUsageCount(db, eventId) {
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-maintenance', {kind:'refresh_event_usage',id:eventId});
  if (!response.ok) throw new Error('Rust event usage refresh failed');
}
