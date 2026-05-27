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

  for (const id of ids) {
    try {
      const changed = await applyUpdatesToRow(env.DB, id, u, result.affected_event_ids);
      if (changed) result.updated += 1;
      else         result.skipped += 1;
    } catch (err) {
      result.errors.push({ id, error: String(err && err.message || err) });
    }
  }

  // FTS 재구축 — 업데이트 성공한 ids 만 (변경 없는 항목 sync 는 낭비)
  let ftsSynced = 0;
  for (const id of ids) {
    try { await syncFtsForId(env.DB, id); ftsSynced += 1; } catch (err) {
      console.error('FTS sync failed for memorabilia id', id, err);
    }
  }

  return json({
    ok: true,
    updated: result.updated,
    skipped: result.skipped,
    errors:  result.errors,
    fts_synced: ftsSynced,
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
  // 1) 기존 행 — event_id 변경 추적용
  const existing = await db.prepare(`SELECT id, event_id FROM memorabilia WHERE id = ?`).bind(id).first();
  if (!existing) throw new Error('not_found');

  // 2) memorabilia 메인 컬럼 UPDATE — 변경된 필드만
  const setParts = [];
  const setBinds = [];

  if (u.status !== undefined)      { setParts.push('status = ?');      setBinds.push(u.status); }
  if (u.category_id !== undefined) { setParts.push('category_id = ?'); setBinds.push(u.category_id); }
  if (u.has_event !== undefined)   { setParts.push('has_event = ?');   setBinds.push(u.has_event); }
  if (u.event_id !== undefined) {
    setParts.push('event_id = ?');
    setBinds.push(u.event_id);
    // 카탈로그 참조가 변하면 denormalized 이름 캐시도 갱신
    if (u.event_id) {
      const ev = await db.prepare(`SELECT name_en, name_ko FROM memorabilia_events WHERE id = ?`).bind(u.event_id).first();
      if (ev) {
        setParts.push('event_name_en = ?'); setBinds.push(ev.name_en || '');
        setParts.push('event_name_ko = ?'); setBinds.push(ev.name_ko || '');
      }
    }
  }
  if (u.year !== undefined)       { setParts.push('year = ?');         setBinds.push(u.year); }
  if (u.issuer_en !== undefined)  { setParts.push('issuer_en = ?');    setBinds.push(u.issuer_en); }
  if (u.issuer_ko !== undefined)  { setParts.push('issuer_ko = ?');    setBinds.push(u.issuer_ko); }
  if (u.material_en !== undefined){ setParts.push('material_en = ?');  setBinds.push(u.material_en); }
  if (u.material_ko !== undefined){ setParts.push('material_ko = ?');  setBinds.push(u.material_ko); }
  if (u.size_text !== undefined)  { setParts.push('size_text = ?');    setBinds.push(u.size_text); }

  let mainChanged = false;
  if (setParts.length) {
    setParts.push("updated_at = datetime('now')");
    setBinds.push(id);
    await db.prepare(`UPDATE memorabilia SET ${setParts.join(', ')} WHERE id = ?`).bind(...setBinds).run();
    mainChanged = true;
  }

  // 3) event_id 변경 시 usage_count 조정
  if (u.event_id !== undefined && existing.event_id !== u.event_id) {
    if (existing.event_id) {
      await db.prepare(`UPDATE memorabilia_events SET usage_count = MAX(usage_count - 1, 0) WHERE id = ?`).bind(existing.event_id).run();
      affectedEventIds.add(existing.event_id);
    }
    if (u.event_id) {
      await db.prepare(`UPDATE memorabilia_events SET usage_count = usage_count + 1 WHERE id = ?`).bind(u.event_id).run();
      affectedEventIds.add(u.event_id);
    }
  }

  // 4) 태그 변경
  let tagsChanged = false;
  if (u.set_tags !== undefined) {
    await db.prepare(`DELETE FROM memorabilia_tags WHERE memorabilia_id = ?`).bind(id).run();
    for (const label of u.set_tags) await attachTag(db, id, label);
    tagsChanged = true;
  } else {
    if (u.add_tags && u.add_tags.length) {
      for (const label of u.add_tags) await attachTag(db, id, label);
      tagsChanged = true;
    }
    if (u.remove_tags && u.remove_tags.length) {
      for (const label of u.remove_tags) await detachTag(db, id, label);
      tagsChanged = true;
    }
  }
  if (tagsChanged) {
    await db.prepare(`
      UPDATE memorabilia_tag_pool
         SET usage_count = (SELECT COUNT(*) FROM memorabilia_tags WHERE tag_id = memorabilia_tag_pool.id),
             updated_at = datetime('now')
    `).run();
  }

  // 5) 국가 변경
  let countriesChanged = false;
  if (u.set_country_codes !== undefined) {
    await db.prepare(`DELETE FROM memorabilia_countries WHERE memorabilia_id = ?`).bind(id).run();
    for (const code of u.set_country_codes) {
      await db.prepare(`INSERT OR IGNORE INTO memorabilia_countries (memorabilia_id, country_code) VALUES (?, ?)`).bind(id, code).run();
    }
    countriesChanged = true;
  } else {
    if (u.add_country_codes && u.add_country_codes.length) {
      for (const code of u.add_country_codes) {
        await db.prepare(`INSERT OR IGNORE INTO memorabilia_countries (memorabilia_id, country_code) VALUES (?, ?)`).bind(id, code).run();
      }
      countriesChanged = true;
    }
    if (u.remove_country_codes && u.remove_country_codes.length) {
      for (const code of u.remove_country_codes) {
        await db.prepare(`DELETE FROM memorabilia_countries WHERE memorabilia_id = ? AND country_code = ?`).bind(id, code).run();
      }
      countriesChanged = true;
    }
  }

  if (mainChanged || tagsChanged || countriesChanged) {
    // updated_at 보장 — main 미변경 + 관계만 변경 케이스
    if (!mainChanged) {
      await db.prepare(`UPDATE memorabilia SET updated_at = datetime('now') WHERE id = ?`).bind(id).run();
    }
    return true;
  }
  return false;
}

async function attachTag(db, memoId, label) {
  let row = await db.prepare(`SELECT id FROM memorabilia_tag_pool WHERE label = ?`).bind(label).first();
  if (!row) {
    row = await db.prepare(`INSERT INTO memorabilia_tag_pool (label) VALUES (?) RETURNING id`).bind(label).first();
  }
  await db.prepare(`INSERT OR IGNORE INTO memorabilia_tags (memorabilia_id, tag_id) VALUES (?, ?)`).bind(memoId, row.id).run();
}
async function detachTag(db, memoId, label) {
  const row = await db.prepare(`SELECT id FROM memorabilia_tag_pool WHERE label = ?`).bind(label).first();
  if (!row) return;
  await db.prepare(`DELETE FROM memorabilia_tags WHERE memorabilia_id = ? AND tag_id = ?`).bind(memoId, row.id).run();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
