/**
 * POST /api/memorabilia/bulk-replace
 *
 * 기념품 도감 + 행사 카탈로그의 텍스트 컬럼에서 find/replace 일괄 치환.
 * 띄어쓰기 통일, 발행처 명칭 표준화 등 한 번에 수정.
 *
 * Body:
 *   {
 *     operations: [
 *       { field: 'issuer_en', find: 'Korean Scout Assn', replace: 'Korea Scout Association' },
 *       { field: 'issuer_ko', find: '한국 스카우트연맹',     replace: '한국스카우트연맹' },
 *       ...
 *     ],
 *     preset?: 'country_rep_team_no_space'  // 한글 "{국가명} 대표단" → "{국가명}대표단" 일괄
 *     dry_run?: boolean                      // true 면 매칭 건수만 반환, 실제 변경 X
 *   }
 *
 * 허용 필드 (memorabilia):
 *   title_en, title_ko, issuer_en, issuer_ko, event_name_en, event_name_ko,
 *   material_en, material_ko, size_text, description_en, description_ko,
 *   description_plain_en, description_plain_ko
 * 허용 필드 (memorabilia_events):
 *   name_en, name_ko, description_en, description_ko
 *
 * 응답: { dry_run, results: [{ field, find, replace, matched, changed, table }], total_changed, fts_synced }
 *
 * "동일한 데이터에 대해서는 기존 데이터에 흡수" — 본 endpoint 는 텍스트 컬럼 내부의
 * 부분 문자열을 치환하므로, 변형 표기를 표준 표기로 통일하면 자연스럽게 흡수된다.
 */
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { syncFtsForId } from '../../_shared/memorabilia-store.js';
import { COUNTRY_CODE_LABELS_KO } from '../../_shared/country-code-labels.js';

const MEMORABILIA_FIELDS = new Set([
  'title_en', 'title_ko',
  'issuer_en', 'issuer_ko',
  'event_name_en', 'event_name_ko',
  'material_en', 'material_ko',
  'size_text',
  'description_en', 'description_ko',
  'description_plain_en', 'description_plain_ko',
]);

const EVENTS_FIELDS = new Set([
  'name_en', 'name_ko',
  'description_en', 'description_ko',
]);

function classifyField(field) {
  if (MEMORABILIA_FIELDS.has(field)) return 'memorabilia';
  if (EVENTS_FIELDS.has(field))      return 'memorabilia_events';
  return null;
}

// 카탈로그 기반 자동 프리셋 — 한글 "{국가명} 대표단" → "{국가명}대표단" 모든 필드
function buildCountryRepTeamPreset() {
  const ops = [];
  const koNames = Object.values(COUNTRY_CODE_LABELS_KO).filter(Boolean);
  // 중복 제거 (이론상 catalog 는 unique 이지만 안전장치)
  const seen = new Set();
  for (const name of koNames) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const find    = `${name} 대표단`;
    const replace = `${name}대표단`;
    // 가능한 모든 한글 텍스트 필드에 적용 — 어디에 나타날지 모름
    for (const field of ['title_ko', 'issuer_ko', 'event_name_ko', 'description_ko', 'description_plain_ko']) {
      ops.push({ field, find, replace });
    }
    for (const field of ['name_ko', 'description_ko']) {
      ops.push({ field, find, replace, _table: 'memorabilia_events' });
    }
  }
  return ops;
}

export async function onRequestPost({ request, env }) {
  const gate = await gateMenuAccess(request, env, 'memorabilia', 'write');
  if (gate) return gate;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const dryRun = !!body?.dry_run;

  // operations 수집 — preset 과 explicit operations 모두 허용 (병합)
  let operations = Array.isArray(body?.operations) ? body.operations : [];
  if (body?.preset === 'country_rep_team_no_space') {
    operations = operations.concat(buildCountryRepTeamPreset());
  }
  if (!operations.length) return json({ error: 'no_operations' }, 400);

  // 정규화 + 검증
  const normalized = [];
  for (const op of operations) {
    const field   = String(op.field || '').trim();
    const find    = String(op.find    ?? '').trim();
    const replace = String(op.replace ?? '');
    if (!field || !find) continue;
    if (find === replace) continue;
    const table = op._table || classifyField(field);
    if (!table) {
      return json({ error: 'invalid_field', detail: `허용되지 않는 필드: ${field}` }, 400);
    }
    normalized.push({ field, find, replace, table });
  }
  if (!normalized.length) return json({ error: 'no_valid_operations' }, 400);

  const results = [];
  let totalChanged = 0;
  const affectedMemoIds = new Set();

  for (const op of normalized) {
    const { field, find, replace, table } = op;
    const likePattern = `%${escapeLike(find)}%`;

    if (dryRun) {
      const { results: cnt } = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${field} LIKE ? ESCAPE '\\'`
      ).bind(likePattern).all();
      const matched = (cnt && cnt[0] && cnt[0].n) || 0;
      results.push({ table, field, find, replace, matched, changed: 0 });
      continue;
    }

    // 영향 받는 memorabilia ids 캡쳐 (FTS 동기화용)
    if (table === 'memorabilia') {
      const { results: idsRows } = await env.DB.prepare(
        `SELECT id FROM memorabilia WHERE ${field} LIKE ? ESCAPE '\\'`
      ).bind(likePattern).all();
      for (const r of (idsRows || [])) affectedMemoIds.add(r.id);
    }

    // 실제 치환 — REPLACE() 는 모든 occurrences 치환
    const res = await env.DB.prepare(
      `UPDATE ${table}
          SET ${field} = REPLACE(${field}, ?, ?),
              updated_at = datetime('now')
        WHERE ${field} LIKE ? ESCAPE '\\'`
    ).bind(find, replace, likePattern).run();

    const changed = (res.meta && res.meta.changes) || 0;
    totalChanged += changed;
    results.push({ table, field, find, replace, changed });

    // event 카탈로그 이름 변경 시, 도감 측 denormalized event_name_* 도 함께 동기화
    if (table === 'memorabilia_events' && (field === 'name_en' || field === 'name_ko')) {
      const memoField = field === 'name_en' ? 'event_name_en' : 'event_name_ko';
      // event_name_* 가 같은 변형을 갖고 있으면 동시 치환
      const memoRes = await env.DB.prepare(
        `UPDATE memorabilia
            SET ${memoField} = REPLACE(${memoField}, ?, ?),
                updated_at = datetime('now')
          WHERE ${memoField} LIKE ? ESCAPE '\\'`
      ).bind(find, replace, likePattern).run();
      const cascadedChanged = (memoRes.meta && memoRes.meta.changes) || 0;
      if (cascadedChanged) {
        totalChanged += cascadedChanged;
        results.push({ table: 'memorabilia', field: memoField, find, replace, changed: cascadedChanged, cascaded_from: field });
        // affected ids 도 갱신 — 위에서 SELECT 안 했으므로 한 번 더
        const { results: idsRows } = await env.DB.prepare(
          `SELECT id FROM memorabilia WHERE ${memoField} LIKE ? ESCAPE '\\'`
        ).bind(`%${escapeLike(replace)}%`).all();
        for (const r of (idsRows || [])) affectedMemoIds.add(r.id);
      }
    }
  }

  // FTS 동기화 — 영향 받은 memorabilia rows 만 재계산
  let ftsSynced = 0;
  if (!dryRun && affectedMemoIds.size) {
    for (const id of affectedMemoIds) {
      try {
        await syncFtsForId(env.DB, id);
        ftsSynced += 1;
      } catch (err) {
        console.error('FTS sync failed for memorabilia id', id, err);
      }
    }
  }

  return json({
    dry_run: dryRun,
    results,
    total_changed: totalChanged,
    fts_synced: ftsSynced,
    affected_memorabilia_ids: Array.from(affectedMemoIds),
  });
}

// SQL LIKE escape — '%' 와 '_' 은 와일드카드이므로 escape. '\' 도 escape (ESCAPE '\\').
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, '\\$&');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
