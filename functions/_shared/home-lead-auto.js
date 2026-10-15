/**
 * Gilwell Media · 홈 메인 스토리 자동 선정 (2026-08-24)
 *
 * 메인 스토리는 두 갈래로 정해진다.
 *
 *   settings.home_lead_mode = 'manual'  → 운영자가 고른 글을 그대로 쓴다 (자동 갱신 안 함)
 *   settings.home_lead_mode = 'auto'    → 아래 규칙으로 매일 자정(KST) 다시 고른다
 *
 * 값이 없으면 'auto' 로 본다 — "설정 안 되면 규칙에 따라 선정" (오너 지시, 2026-08-24).
 *
 * ── 자동 규칙: "최근 한 달 이내 가장 핫한 기사" ──────────────────────────
 *   후보: 최근 30일 안에 **발행된** 공개글
 *   점수: v7×3 + v8_14×1 + v15_30×0.5   (조회 시점이 최근일수록 가점)
 *
 *   왜 발행일로 후보를 좁히는가: 조회수만으로 줄 세우면 몇 달 전 잼버리 모집
 *   공고가 영원히 1위를 차지한다. 실측(2026-08-24) 누적 1위는 3월 기사였고
 *   최근 30일 조회 1위도 3월 기사였다. 홈 최상단에 만료된 모집글이 걸리는 것을
 *   막으려면 발행 시점으로 후보를 자르는 편이 확실하다.
 *
 *   home-rails.js 의 인기 레일과는 목적이 다르다 — 그쪽은 "지금 많이 읽히는 글"
 *   이라 오래된 글도 후보이고 대신 감점(−0.05)으로 누른다. 메인 스토리는
 *   "지금 내세울 글"이라 아예 최근 발행글로 한정한다.
 *
 * ── 폴백 ────────────────────────────────────────────────────────────────
 *   1) 30일 내 발행글 중 조회가 하나도 없으면 → 그중 최신 글
 *   2) 30일 내 발행글 자체가 없으면 → 전체 공개글 중 최신 글
 *   즉 어떤 경우에도 홈 최상단이 비지 않는다.
 */

/** 자동 선정 후보로 삼을 발행 기간 (일) */
export const AUTO_LEAD_WINDOW_DAYS = 30;

/** 조회 시점별 가중치 — 바꿀 때는 여기만 손대면 된다 */
export const AUTO_LEAD_WEIGHTS = {
  recent7: 3,      // 최근 7일 조회
  days8to14: 1,    // 8~14일
  days15to30: 0.5, // 15~30일
};

/**
 * 자동 규칙으로 메인 스토리 후보를 고른다.
 *
 * @returns {Promise<{ id: number, score: number, reason: string, candidates: number }>}
 *          고를 글이 하나도 없으면 id = 0.
 */
export async function selectAutoHomeLeadId(env) {
  const W = AUTO_LEAD_WEIGHTS;

  // 후보(최근 30일 발행 공개글)의 구간별 조회수를 한 번에 집계한다.
  // content 는 읽지 않는다 — 여기서는 순위만 필요하다.
  const { results } = await env.DB.prepare(
    `SELECT posts.id AS id,
            COALESCE(posts.publish_at, posts.created_at) AS pub,
            SUM(CASE WHEN pv.viewed_at >= datetime('now','-7 day')  THEN 1 ELSE 0 END) AS v7,
            SUM(CASE WHEN pv.viewed_at >= datetime('now','-14 day')
                      AND pv.viewed_at <  datetime('now','-7 day')  THEN 1 ELSE 0 END) AS v14,
            SUM(CASE WHEN pv.viewed_at >= datetime('now','-30 day')
                      AND pv.viewed_at <  datetime('now','-14 day') THEN 1 ELSE 0 END) AS v30
       FROM posts
       LEFT JOIN post_views pv ON pv.post_id = posts.id
      WHERE posts.published = 1
        AND COALESCE(posts.publish_at, posts.created_at) >= datetime('now', '-${AUTO_LEAD_WINDOW_DAYS} day')
      GROUP BY posts.id`
  ).all();

  const rows = (results || []).map((r) => ({
    id: Number(r.id),
    pub: r.pub || '',
    v7: Number(r.v7) || 0,
    v14: Number(r.v14) || 0,
    v30: Number(r.v30) || 0,
  }));

  const newestFirst = (a, b) => (a.pub < b.pub ? 1 : a.pub > b.pub ? -1 : b.id - a.id);
  const score = (r) => r.v7 * W.recent7 + r.v14 * W.days8to14 + r.v30 * W.days15to30;

  if (rows.length) {
    const scored = rows.slice().sort((a, b) => score(b) - score(a) || newestFirst(a, b));
    const top = scored[0];
    if (score(top) > 0) {
      return {
        id: top.id,
        score: score(top),
        reason: `최근 ${AUTO_LEAD_WINDOW_DAYS}일 발행글 중 조회 점수 1위`,
        candidates: rows.length,
      };
    }
    // 후보는 있는데 아무도 조회가 없다 (갓 올린 글들) → 그중 최신
    const newest = rows.slice().sort(newestFirst)[0];
    return {
      id: newest.id,
      score: 0,
      reason: `최근 ${AUTO_LEAD_WINDOW_DAYS}일 발행글에 조회 기록이 없어 최신 글로 선정`,
      candidates: rows.length,
    };
  }

  // 30일 내 발행글이 아예 없다 → 전체 공개글 중 최신
  const fallback = await env.DB.prepare(
    `SELECT id FROM posts
      WHERE published = 1
      ORDER BY COALESCE(publish_at, created_at) DESC, id DESC
      LIMIT 1`
  ).first();

  return {
    id: fallback ? Number(fallback.id) : 0,
    score: 0,
    reason: `최근 ${AUTO_LEAD_WINDOW_DAYS}일 내 발행글이 없어 전체 최신 글로 선정`,
    candidates: 0,
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
  return (await commitHomeLeadState(env, previous, { mode: previous.mode, postId: 0, mediaValue: null })).committed;
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
