import { queryRust } from './rust-server.js';
/**
 * Gilwell Media · Memorabilia (기념품 도감) 저장소 헬퍼
 *
 * 도감 항목 CRUD + 부속 테이블(이미지·국가·태그) 트랜잭션 + FTS 동기화를 한곳에 모은다.
 * API 엔드포인트는 이 모듈만 호출한다 — D1 prepare/bind 직접 호출 금지 (예외: 단순 카탈로그 조회).
 */

import { COUNTRY_CODE_LABELS_KO } from './country-code-labels.js';
import {
  extractEditorJsPlain,
  buildMemorabiliaFtsValues,
  upsertMemorabiliaFtsRow,
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
  credit:    300,
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
      credit: trimStr(raw.credit, FIELD_LIMITS.credit),
      is_primary: isPrimary ? 1 : 0,
      sort_order: Number.isFinite(Number(raw.sort_order)) ? parseInt(raw.sort_order, 10) : i,
    });
  }
  // 대표 미지정 시 첫 번째 자동 지정
  if (out.length && !primaryClaimed) out[0].is_primary = 1;
  return out.slice(0, 20);
}

// 관련 기념품 id 배열 정규화 — 양의 정수만, 중복 제거, 최대 12개. (자기참조·비공개 필터는 hydrate 시점)
function normalizeRelatedMemorabilia(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const id = parseInt(raw && typeof raw === 'object' ? raw.id : raw, 10);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 12) break;
  }
  return out;
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
      // 제작기관 미입력 시 기본값 — 영문 "Unknown" / 국문 "미상".
      // 신규 저장 시점에만 적용. 기존 빈 레코드는 편집/저장 직전까지 그대로.
      issuer_en:     trimStr(body.issuer_en, FIELD_LIMITS.issuer) || 'Unknown',
      issuer_ko:     trimStr(body.issuer_ko, FIELD_LIMITS.issuer) || '미상',
      description_en: trimEditorJson(body.description_en),
      description_ko: trimEditorJson(body.description_ko),
      related_links: normalizeLinks(body.related_links),
      related_memorabilia: normalizeRelatedMemorabilia(body.related_memorabilia),
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
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-categories-list', {});
  if (!response.ok) throw new Error('Rust memorabilia categories lookup failed');
  const {items:list} = await response.json();
  const byId = {};
  for (const row of list) byId[row.id] = row;
  return { list, byId };
}

export async function getMemorabiliaById(db, id, { includeDrafts = false } = {}) {
  return getMemorabiliaDetail(db, {id, includeDrafts});
}

export async function getMemorabiliaBySlug(db, slug, { includeDrafts = false } = {}) {
  return getMemorabiliaDetail(db, {slug, includeDrafts});
}

async function getMemorabiliaDetail(db, options) {
  const response = await queryRust({env:{DB:db}, request:{url:'https://internal.invalid/'}}, 'memorabilia-detail', {...options, hydrate:true});
  if (!response.ok) throw new Error('Rust memorabilia detail failed');
  const data = await response.json();
  if (data.item) return data.item;
  if (!data.row) return null;
  return hydrateOne(db, data.row, data);
}

async function hydrateOne(db, row, data) {
  const imagesRes = {results:data.images};
  const countriesRes = {results:data.countries};
  const tagsRes = {results:data.tags};
  const event = data.event;
  // 관련 기념품 — 저장 순서 보존, 자기 자신 제외, 공개(public) 항목만 노출.
  // 비공개/draft 누출 방지를 위해 어디서나 status='public' 만 하이드레이트한다
  // (관련 항목은 공개 기념품끼리 연결하는 용도; draft 가 섞이면 표시에서 자동 제외).
  const relatedIds = (safeParseJson(row.related_memorabilia_json) || [])
    .map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x) && x !== row.id);
  let related_memorabilia = [];
  if (relatedIds.length) {
    const results = data.relatedRows;
    const byId = new Map((results || []).map((r) => [r.id, r]));
    related_memorabilia = relatedIds.map((id) => byId.get(id)).filter(Boolean).map((r) => ({
      ...r,
      country_label_ko: r.country_code ? (COUNTRY_CODE_LABELS_KO[r.country_code] || r.country_code) : '',
    }));
  }
  return {
    ...row,
    event,                                 // 카탈로그 참조 (없으면 null)
    related_links: safeParseJson(row.related_links_json) || [],
    related_memorabilia,                   // [{id,slug,title_en,title_ko,year,image_url}] 공개·저장순
    related_memorabilia_ids: related_memorabilia.map((r) => r.id),  // 편집 폼 prefill (공개 id)
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

export async function createMemorabilia(db, input, { createdBy = null } = {}) {
  const snapshot = await loadEditSnapshot(db, input);
  const eventSnapshot = maybeHydrateEventName(input, snapshot.event);
  const plainEn = extractEditorJsPlain(input.description_en), plainKo = extractEditorJsPlain(input.description_ko);
  const tagRows = snapshot.tagRows;
  const tagOrder = new Map(tagRows.map(row => [row.label, Number(row.id)]));
  const orderedTags = input.tags.slice().sort((a, b) => (tagOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (tagOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
  const category = snapshot.category;
  const fts = buildMemorabiliaFtsValues({
    ...input, id:0, description_plain_en:plainEn, description_plain_ko:plainKo,
    category_label_en:category?.label_en || '', category_label_ko:category?.label_ko || '',
    country_codes:input.country_codes.slice().sort(), tags:orderedTags,
  });
  const related = [];
  for (const {id:otherId,row} of snapshot.related) {
    let list = safeParseJson(row.related_memorabilia_json) || [];
    if (!Array.isArray(list)) list = [];
    const norm = list.map(x => parseInt(x, 10)).filter(Number.isFinite);
    related.push({id:otherId, previous:row.related_memorabilia_json ?? null, normalized:JSON.stringify(norm), limited:JSON.stringify(norm.slice(0, 12))});
  }
  if (input.images.some(image => !Number.isFinite(image.sort_order))) throw new Error('D1_TYPE_ERROR: invalid image order');
  const claim = '__pending__' + crypto.randomUUID();
  const values = [claim,input.title_en,input.title_ko,input.has_event,input.event_id,input.event_name_en,input.event_name_ko,
    input.year,input.category_id,input.material_en,input.material_ko,input.size_text,input.issuer_en,input.issuer_ko,
    input.description_en,input.description_ko,plainEn,plainKo,JSON.stringify(input.related_links || []),
    JSON.stringify(input.related_memorabilia || []),input.status,createdBy,input.status];
  if (values.some(value => value === undefined)) throw new Error('D1_TYPE_ERROR: undefined memorabilia binding');
  const response = await queryRust({env:{DB:db}, request:{url:'https://internal.invalid/'}}, 'memorabilia-create', {
    values, claim, slugBase:generateSlug(input.title_en,input.title_ko,0).slice(0,-2),
    eventId:input.event_id || null, countries:input.country_codes, tags:input.tags, images:input.images, related, fts,
    tagSnapshots:input.tags.map(label => ({label, id:tagOrder.get(label) ?? null})),
    categorySnapshot:input.category_id ? {id:input.category_id, exists:!!category, en:category?.label_en ?? null, ko:category?.label_ko ?? null} : null,
    eventSnapshot:eventSnapshot ? {id:input.event_id, en:eventSnapshot.name_en ?? null, ko:eventSnapshot.name_ko ?? null} : null,
  });
  if (!response.ok) throw new Error('Rust memorabilia create failed');
  return (await response.json()).id;
}

export async function updateMemorabilia(db, id, input, { expectedUpdatedAt = null } = {}) {
  const snapshot = await loadEditSnapshot(db, input, id);
  const existing = snapshot.existing;
  if (!existing) return null;

  const eventSnapshot = maybeHydrateEventName(input, snapshot.event);

  const values = [
    input.title_en, input.title_ko, input.has_event, input.event_id, input.event_name_en, input.event_name_ko,
    input.year, input.category_id, input.material_en, input.material_ko, input.size_text, input.issuer_en, input.issuer_ko,
    input.description_en, input.description_ko, extractEditorJsPlain(input.description_en), extractEditorJsPlain(input.description_ko),
    JSON.stringify(input.related_links || []), JSON.stringify(input.related_memorabilia || []), input.status, input.status, input.status,
    id, expectedUpdatedAt, expectedUpdatedAt,
  ];
  if (values.some(value => value === undefined)) throw new Error('D1_TYPE_ERROR: undefined memorabilia binding');
  const tagRows = snapshot.tagRows;
  const tagOrder = new Map(tagRows.map(row => [row.label, Number(row.id)]));
  const orderedTags = input.tags.slice().sort((a, b) => (tagOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (tagOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
  const category = snapshot.category;
  const fts = buildMemorabiliaFtsValues({
    ...input, id, description_plain_en:values[15], description_plain_ko:values[16],
    category_label_en:category?.label_en || '', category_label_ko:category?.label_ko || '',
    country_codes:input.country_codes.slice().sort(), tags:orderedTags,
  });
  const related = [];
  for (const {id:otherId,row} of snapshot.related) {
    let list = safeParseJson(row.related_memorabilia_json) || [];
    if (!Array.isArray(list)) list = [];
    const norm = list.map(x => parseInt(x, 10)).filter(Number.isFinite);
    const change = !norm.includes(id);
    if (change) norm.push(id);
    related.push({id:otherId, previous:row.related_memorabilia_json ?? null, value:change ? JSON.stringify(norm.slice(0, 12)) : '', change});
  }
  if (input.images.some(image => !Number.isFinite(image.sort_order))) throw new Error('D1_TYPE_ERROR: invalid image order');
  const claim = 'memo:' + crypto.randomUUID();
  const response = await queryRust({env:{DB:db}, request:{url:'https://internal.invalid/'}}, 'memorabilia-update', {
    values, previousUpdated:existing.updated_at ?? null, oldEventId:existing.event_id || null, newEventId:input.event_id || null,
    countries:input.country_codes, tags:input.tags, images:input.images, related, fts, claim,
    tagSnapshots:input.tags.map(label => ({label, id:tagOrder.get(label) ?? null})),
    categorySnapshot:input.category_id ? {id:input.category_id, exists:!!category, en:category?.label_en ?? null, ko:category?.label_ko ?? null} : null,
    eventSnapshot:eventSnapshot ? {id:input.event_id, en:eventSnapshot.name_en ?? null, ko:eventSnapshot.name_ko ?? null} : null,
  });
  if (!response.ok) throw new Error('Rust memorabilia update failed');
  const {row:saved} = await response.json();
  if (!saved) return { conflict: true };
  return saved;
}

export async function deleteMemorabilia(db, id) {
  const response = await queryRust({env:{DB:db}, request:{url:'https://internal.invalid/'}}, 'memorabilia-delete', {id});
  if (!response.ok) throw new Error('Rust memorabilia delete failed');
}

// event_id 가 주어지면 events 카탈로그에서 name_en/ko 를 가져와 input 의
// denormalized event_name 캐시를 덮어쓴다 (행사 이름 변경 시 일관성).
// has_event 가 false 거나 event_id 가 없으면 free-text 입력 그대로 유지.
async function loadEditSnapshot(db, input, id = null) {
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-edit-snapshot', {
    id, eventId:input.has_event && input.event_id ? input.event_id : null, categoryId:input.category_id || null,
    tags:input.tags, related:input.related_memorabilia || [],
  });
  if (!response.ok) throw new Error('Rust memorabilia edit snapshot failed');
  return response.json();
}

function maybeHydrateEventName(input, row) {
  if (!input.has_event || !input.event_id) return;
  if (!row) {
    // 잘못된 event_id → 카탈로그 참조 해제, free-text fallback
    input.event_id = null;
    return;
  }
  input.event_name_en = row.name_en || input.event_name_en || '';
  input.event_name_ko = row.name_ko || input.event_name_ko || '';
  return row;
}

export async function syncFtsForId(db, id) {
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-fts-snapshot', {id});
  if (!response.ok) throw new Error('Rust memorabilia search snapshot failed');
  const {row,countries,tags} = await response.json();
  if (!row) return;

  await upsertMemorabiliaFtsRow(db, {
    id: row.id,
    title_en: row.title_en, title_ko: row.title_ko,
    event_name_en: row.event_name_en, event_name_ko: row.event_name_ko,
    issuer_en: row.issuer_en, issuer_ko: row.issuer_ko,
    material_en: row.material_en, material_ko: row.material_ko,
    description_plain_en: row.description_plain_en, description_plain_ko: row.description_plain_ko,
    category_label_en: row.category_label_en || '',
    category_label_ko: row.category_label_ko || '',
    country_codes: countries.map((r) => r.country_code),
    tags:          tags.map((r) => r.label),
  }, {
    values: [row.id,row.updated_at ?? null,row.title_en ?? null,row.title_ko ?? null,
      row.event_name_en ?? null,row.event_name_ko ?? null,row.issuer_en ?? null,row.issuer_ko ?? null,
      row.material_en ?? null,row.material_ko ?? null,row.description_plain_en ?? null,row.description_plain_ko ?? null,
      row.category_id ?? null,row.category_label_en ?? null,row.category_label_ko ?? null],
    countries: countries.map(r => r.country_code),
    tags: tags.map(r => ({id:r.id,label:r.label})),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 자동완성 / 패싯 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

export async function suggestIssuers(db, prefix, limit = 8) {
  const p = trimStr(prefix, 80);
  if (!p) return [];
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-suggest', {type:'issuer',prefix:p,limit});
  if (!response.ok) throw new Error('Rust issuer suggestions failed');
  return (await response.json()).items;
}

export async function suggestTags(db, prefix, limit = 10) {
  const p = trimStr(prefix, 60);
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-suggest', {type:'tag',prefix:p,limit});
  if (!response.ok) throw new Error('Rust tag suggestions failed');
  return (await response.json()).items;
}
