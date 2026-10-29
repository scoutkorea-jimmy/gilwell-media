// Compatibility reference from origin/main 835a326a; test-only.
/**
 * 홈 메인 스토리: 직접 지정이 우선이며 자동 모드는 최근 7일 조회수로 선정한다.
 * 기존 매일 자정(KST) 작업이 갱신하며, 공동 1위는 매 선정 시 무작위로 고른다.
 */
export const AUTO_LEAD_WINDOW_DAYS = 7;

export async function selectAutoHomeLeadId(env) {
  const { results } = await env.DB.prepare(
    `SELECT posts.id, COUNT(pv.post_id) AS views
       FROM posts
       LEFT JOIN post_views pv ON pv.post_id = posts.id
        AND pv.viewed_at >= datetime('now', '-${AUTO_LEAD_WINDOW_DAYS} day')
      WHERE posts.published = 1
      GROUP BY posts.id`
  ).all();
  const rows = results || [];
  const score = rows.reduce((max, row) => Math.max(max, Number(row.views) || 0), 0);
  const tied = rows.filter((row) => (Number(row.views) || 0) === score);
  const picked = tied[Math.floor(Math.random() * tied.length)];
  return {
    id: picked ? Number(picked.id) : 0,
    score,
    reason: rows.length ? `최근 ${AUTO_LEAD_WINDOW_DAYS}일 조회수 1위${tied.length > 1 ? ' (동률 무작위 선정)' : ''}` : '선정할 공개글이 없음',
    candidates: rows.length,
  };
}

/**
 * 현재 메인 스토리 모드. 값이 없으면 'auto'.
 * @returns {Promise<'auto'|'manual'>}
 */
export async function readHomeLeadMode(env) {
  const row = await env.DB.prepare(
    `SELECT value FROM settings WHERE key = 'home_lead_mode'`
  ).first();
  return String(row && row.value) === 'manual' ? 'manual' : 'auto';
}

// One SELECT gives editors and the scheduled job a consistent generation of
// the related keys. The raw values also guard writers outside this helper.
export async function readHomeLeadState(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN ('home_lead_post', 'home_lead_media', 'home_lead_mode', 'home_lead_rev')`).all();
  const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
  return {
    mode: values.home_lead_mode === 'manual' ? 'manual' : 'auto',
    postId: parseInt(values.home_lead_post, 10) || 0,
    mediaValue: values.home_lead_media ?? null,
    revision: parseInt(values.home_lead_rev, 10) || 0,
    rawMode: values.home_lead_mode ?? null,
    rawPost: values.home_lead_post ?? null,
  };
}

// Claim ownership inside one D1 transaction. Every subsequent statement uses
// this request's token so a losing writer also performs zero DELETEs on empty
// settings. No token survives the transaction's final revision update.
export async function commitHomeLeadState(env, previous, next, lastRun = '') {
  const revision = previous.revision + 1;
  const claim = String(revision) + '|' + crypto.randomUUID();
  const owned = `EXISTS(SELECT 1 FROM settings WHERE key = 'home_lead_rev' AND value = ?)`;
  const statements = [env.DB.prepare(`INSERT INTO settings(key, value)
    SELECT 'home_lead_rev', ?
    WHERE (SELECT value FROM settings WHERE key = 'home_lead_mode') IS ?
      AND (SELECT value FROM settings WHERE key = 'home_lead_post') IS ?
      AND (SELECT value FROM settings WHERE key = 'home_lead_media') IS ?
      AND (? = 0 OR EXISTS(SELECT 1 FROM posts WHERE id = ? AND published = 1))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?`
  ).bind(claim, previous.rawMode, previous.rawPost, previous.mediaValue, next.postId || 0, next.postId || 0, previous.revision)];
  statements.push(env.DB.prepare(`INSERT INTO settings(key, value) SELECT 'home_lead_mode', ? WHERE ${owned}
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(next.mode === 'manual' ? 'manual' : 'auto', claim));
  if (next.postId) statements.push(env.DB.prepare(`INSERT INTO settings(key, value) SELECT 'home_lead_post', ? WHERE ${owned}
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(String(next.postId), claim));
  else statements.push(env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_post' AND ${owned}`).bind(claim));
  if (next.mediaValue != null) statements.push(env.DB.prepare(`INSERT INTO settings(key, value) SELECT 'home_lead_media', ? WHERE ${owned}
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(next.mediaValue, claim));
  else statements.push(env.DB.prepare(`DELETE FROM settings WHERE key = 'home_lead_media' AND ${owned}`).bind(claim));
  if (lastRun) statements.push(env.DB.prepare(`INSERT INTO settings(key, value) SELECT 'home_lead_auto_last_run', ? WHERE ${owned}
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(lastRun, claim));
  statements.push(env.DB.prepare(`UPDATE settings SET value = ? WHERE key = 'home_lead_rev' AND value = ?`).bind(String(revision), claim));
  const writes = await env.DB.batch(statements);
  return { committed: !!(writes[0].meta && writes[0].meta.changes === 1), revision };
}

export async function clearHomeLeadForPost(env, postId) {
  const previous = await readHomeLeadState(env);
  if (previous.postId !== Number(postId)) return false;
  return (await commitHomeLeadState(env, previous, { mode: 'auto', postId: 0, mediaValue: null })).committed;
}

/**
 * 자동 모드일 때만 메인 스토리를 다시 고른다.
 * 수동 모드면 아무것도 건드리지 않는다.
 *
 * @returns {Promise<{ skipped:boolean, mode:string, changed:boolean, post_id:number,
 *                     previous_post_id:number, reason:string, candidates:number }>}
 */
export async function refreshAutoHomeLead(env) {
  const previousState = await readHomeLeadState(env);
  const mode = previousState.mode;
  if (mode !== 'auto') {
    return { skipped: true, mode, changed: false, post_id: 0, previous_post_id: 0, reason: '수동 지정 모드', candidates: 0 };
  }

  const picked = await selectAutoHomeLeadId(env);
  const previous = previousState.postId;

  if (!picked.id) {
    return { skipped: false, mode, changed: false, post_id: 0, previous_post_id: previous, reason: '선정할 공개글이 없음', candidates: picked.candidates };
  }

  const changed = picked.id !== previous;
  const result = await commitHomeLeadState(env, previousState, {
    mode: 'auto', postId: picked.id, mediaValue: changed ? null : previousState.mediaValue,
  }, new Date().toISOString());
  if (!result.committed) {
    const latest = await readHomeLeadState(env);
    return { skipped: true, mode: latest.mode, changed: false, post_id: latest.postId, previous_post_id: previous, reason: '동시 운영 변경을 보존했습니다.', candidates: picked.candidates };
  }

  return {
    skipped: false,
    mode,
    changed,
    post_id: picked.id,
    previous_post_id: previous,
    reason: picked.reason,
    candidates: picked.candidates,
  };
}
