import { queryRust } from '../../_shared/rust-server.js';
/**
 * POST /api/memorabilia/bulk-update
 *
 * 선택한 도감 항목 여러 개에 대해 동일한 변경을 일괄 적용한다.
 * 빈 필드는 무시되므로, 클라이언트는 변경할 필드만 updates 에 담아 보내면 된다.
 *
 * Body:
 *   {
 *     ids: number[],                  // 1 이상의 memorabilia.id
 *     updates: {
 *       status?:        'public' | 'draft',
 *       category_id?:   number | null,
 *       has_event?:     boolean,
 *       event_id?:      number | null,
 *       year?:          number | null,
 *       issuer_en?:     string,
 *       issuer_ko?:     string,
 *       material_en?:   string,
 *       material_ko?:   string,
 *       size_text?:     string,
 *       add_tags?:           string[],     // 라벨 추가
 *       remove_tags?:        string[],     // 라벨 제거
 *       set_tags?:           string[] | null,  // 교체 (null = 모두 삭제)
 *       add_country_codes?:  string[],     // ISO-2
 *       remove_country_codes?: string[],
 *       set_country_codes?:    string[] | null,
 *     }
 *   }
 *
 * 결과: { ok, updated, skipped, errors:[{id, error}], affected_event_ids:[] }
 *
 * event_id 변경 시 memorabilia_events.usage_count 가 자동 ±1 (각 항목 별로 처리).
 * FTS 는 영향 받은 모든 id 에 대해 syncFtsForId 로 재구축.
 */
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { syncFtsForId } from '../../_shared/memorabilia-store.js';
import { buildMemorabiliaFtsValues } from '../../_shared/memorabilia-search.js';

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const ids = Array.isArray(body?.ids) ? body.ids.map((n) => parseInt(n, 10)).filter(Number.isFinite) : [];
  const updates = (body && typeof body.updates === 'object') ? body.updates : null;
  if (!ids.length)   return json({ error: 'no_ids',     detail: '하나 이상의 항목을 선택하세요.' }, 400);
  if (!updates)      return json({ error: 'no_updates', detail: '변경할 필드를 지정하세요.' }, 400);

  // 정규화
  const u = normalizeUpdates(updates);
  if (u.error) return json({ error: 'invalid_updates', detail: u.error }, 400);
  if (!u.hasAny) return json({ error: 'no_updates', detail: '체크된 필드가 없습니다.' }, 400);

  const result = { updated: 0, skipped: 0, errors: [], affected_event_ids: new Set() };

  let ftsSynced = 0;
  const ftsFailed = [];
  for (const id of ids) {
    try {
      const changed = await applyUpdatesToRow(env.DB, id, u, result.affected_event_ids);
      if (changed) result.updated += 1;
      else result.skipped += 1;
      ftsSynced += 1;
    } catch (err) {
      result.errors.push({ id, error: String(err && err.message || err) });
      try { await syncFtsForId(env.DB,id); ftsSynced += 1; }
      catch (syncError) { ftsFailed.push(id); console.error('FTS sync failed for memorabilia id',id,syncError); }
    }
  }

  return json({
    ok: true,
    updated: result.updated,
    skipped: result.skipped,
    errors:  result.errors,
    fts_synced: ftsSynced,
    ...(ftsFailed.length ? { fts_failed: ftsFailed } : {}),
    affected_event_ids: Array.from(result.affected_event_ids),
  });
}

// ── 정규화 ─────────────────────────────────────────────────────────────────
function normalizeUpdates(updates) {
  const u = {
    status:       undefined,
    category_id:  undefined,
    has_event:    undefined,
    event_id:     undefined,
    year:         undefined,
    issuer_en:    undefined,
    issuer_ko:    undefined,
    material_en:  undefined,
    material_ko:  undefined,
    size_text:    undefined,
    add_tags:     undefined,
    remove_tags:  undefined,
    set_tags:     undefined,   // null → clear
    add_country_codes:    undefined,
    remove_country_codes: undefined,
    set_country_codes:    undefined,
  };

  if (updates.status !== undefined) {
    if (updates.status !== 'public' && updates.status !== 'draft') {
      return { error: 'status 는 public 또는 draft.' };
    }
    u.status = updates.status;
  }
  if (updates.category_id !== undefined) {
    if (updates.category_id === null) u.category_id = null;
    else {
      const n = parseInt(updates.category_id, 10);
      if (!Number.isFinite(n)) return { error: 'category_id 가 잘못됨.' };
      u.category_id = n;
    }
  }
  if (updates.has_event !== undefined) u.has_event = updates.has_event ? 1 : 0;
  if (updates.event_id !== undefined) {
    if (updates.event_id === null) u.event_id = null;
    else {
      const n = parseInt(updates.event_id, 10);
      if (!Number.isFinite(n)) return { error: 'event_id 가 잘못됨.' };
      u.event_id = n;
    }
  }
  if (updates.year !== undefined) {
    if (updates.year === null || updates.year === '') u.year = null;
    else {
      const n = parseInt(updates.year, 10);
      if (!Number.isFinite(n)) return { error: 'year 가 잘못됨.' };
      u.year = n;
    }
  }
  for (const key of ['issuer_en', 'issuer_ko', 'material_en', 'material_ko', 'size_text']) {
    if (updates[key] !== undefined) u[key] = String(updates[key] || '').slice(0, 200);
  }
  // 제작기관 미입력 시 기본값 — normalizeMemorabiliaInput 와 동일 규칙.
  // 토글 켜고 비워둔 경우도 'Unknown'/'미상' 로 채움.
  if (u.issuer_en !== undefined && !u.issuer_en.trim()) u.issuer_en = 'Unknown';
  if (u.issuer_ko !== undefined && !u.issuer_ko.trim()) u.issuer_ko = '미상';

  // 태그
  if (Array.isArray(updates.add_tags))    u.add_tags    = cleanLabels(updates.add_tags);
  if (Array.isArray(updates.remove_tags)) u.remove_tags = cleanLabels(updates.remove_tags);
  if (updates.set_tags !== undefined) {
    u.set_tags = updates.set_tags === null ? [] : cleanLabels(updates.set_tags || []);
  }

  // 국가
  if (Array.isArray(updates.add_country_codes))    u.add_country_codes    = cleanCodes(updates.add_country_codes);
  if (Array.isArray(updates.remove_country_codes)) u.remove_country_codes = cleanCodes(updates.remove_country_codes);
  if (updates.set_country_codes !== undefined) {
    u.set_country_codes = updates.set_country_codes === null ? [] : cleanCodes(updates.set_country_codes || []);
  }

  u.hasAny = Object.entries(u).some(([k, v]) => k !== 'hasAny' && v !== undefined);
  return u;
}

function cleanLabels(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const s = String(v == null ? '' : v).trim().slice(0, 60);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
function cleanCodes(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const s = String(v || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// ── 행 단위 적용 ────────────────────────────────────────────────────────────
async function applyUpdatesToRow(db, id, u, affectedEventIds) {
  const snapshotResponse = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-bulk-snapshot', {
    id, labels:[...new Set([...(u.set_tags || []),...(u.add_tags || [])])], hasCategory:u.category_id !== undefined,
    categoryId:u.category_id ?? null, eventId:u.event_id ?? null,
  });
  if (!snapshotResponse.ok) throw new Error('Rust bulk update snapshot failed');
  const {row,countries:countryRows,tags,tagSnapshots,category,event} = await snapshotResponse.json();
  if (!row) throw new Error('not_found');
  const countries=countryRows.map(r=>r.country_code);
  const nextCountries=new Set(u.set_country_codes !== undefined ? u.set_country_codes : countries);
  if (u.set_country_codes === undefined) {
    for (const code of u.add_country_codes || []) nextCountries.add(code);
    for (const code of u.remove_country_codes || []) nextCountries.delete(code);
  }
  const nextTags=new Set(u.set_tags !== undefined ? u.set_tags : tags.map(t=>t.label));
  if (u.set_tags === undefined) {
    for (const label of u.add_tags || []) nextTags.add(label);
    for (const label of u.remove_tags || []) nextTags.delete(label);
  }
  const idsByLabel=new Map(tags.map(t=>[t.label,Number(t.id)]));
  for (const tag of tagSnapshots) if (tag.id !== null) idsByLabel.set(tag.label,Number(tag.id));
  const orderedTags=[...nextTags].sort((a,b)=>(idsByLabel.get(a) ?? Number.MAX_SAFE_INTEGER)-(idsByLabel.get(b) ?? Number.MAX_SAFE_INTEGER));
  const categoryId=u.category_id !== undefined ? u.category_id : row.category_id;
  const categorySnapshot=categoryId ? {id:categoryId,exists:!!category,en:category?.label_en ?? null,ko:category?.label_ko ?? null} : null;
  const eventId=u.event_id;
  const eventSnapshot=eventId ? {id:eventId,exists:!!event,en:event?.name_en ?? null,ko:event?.name_ko ?? null} : null;
  const finalRow={...row,...u, event_name_en:event ? (event.name_en || '') : row.event_name_en,
    event_name_ko:event ? (event.name_ko || '') : row.event_name_ko,
    category_label_en:category?.label_en || '',category_label_ko:category?.label_ko || '',
    country_codes:[...nextCountries].sort(),tags:orderedTags};
  const snapshot={values:[row.id,row.updated_at ?? null,row.title_en ?? null,row.title_ko ?? null,
    row.event_name_en ?? null,row.event_name_ko ?? null,row.issuer_en ?? null,row.issuer_ko ?? null,
    row.material_en ?? null,row.material_ko ?? null,row.description_plain_en ?? null,row.description_plain_ko ?? null,
    row.category_id ?? null,row.category_label_en ?? null,row.category_label_ko ?? null],countries,tags};
  const response = await queryRust({env:{DB:db},request:{url:'https://internal.invalid/'}}, 'memorabilia-bulk-row', {
    id,updates:u,fts:buildMemorabiliaFtsValues(finalRow),snapshot,tagSnapshots,categorySnapshot,eventSnapshot,
  });
  if (!response.ok) throw new Error('Rust bulk update failed');
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  for (const eventId of result.affectedEventIds || []) affectedEventIds.add(eventId);
  return result.changed;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
