import { queryRust } from './rust-server.js';

/**
 * 홈 메인 스토리: 직접 지정이 우선이며 자동 모드는 최근 7일 조회수로 선정한다.
 * 기존 매일 자정(KST) 작업이 갱신하며, 공동 1위는 매 선정 시 무작위로 고른다.
 */
export const AUTO_LEAD_WINDOW_DAYS = 7;

export async function selectAutoHomeLeadId(env) {
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'home-lead-rank', { days: AUTO_LEAD_WINDOW_DAYS });
  if (!rust.ok) throw new Error('Rust auto home lead ranking failed');
  return rust.json();
}

/**
 * 현재 메인 스토리 모드. 값이 없으면 'auto'.
 * @returns {Promise<'auto'|'manual'>}
 */
export async function readHomeLeadMode(env) {
  return (await readHomeLeadState(env)).mode;
}

// One SELECT gives editors and the scheduled job a consistent generation of
// the related keys. The raw values also guard writers outside this helper.
export async function readHomeLeadState(env, includeMedia = false) {
  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'home-lead-state', {});
  if (!rust.ok) throw new Error('Rust home lead state query failed');
  const { items: results, normalized_media } = await rust.json();
  const values = Object.fromEntries((results || []).map((row) => [row.key, row.value]));
  return {
    mode: values.home_lead_mode === 'manual' ? 'manual' : 'auto',
    postId: parseInt(values.home_lead_post, 10) || 0,
    mediaValue: values.home_lead_media ?? null,
    revision: parseInt(values.home_lead_rev, 10) || 0,
    rawMode: values.home_lead_mode ?? null,
    rawPost: values.home_lead_post ?? null,
    ...(includeMedia ? { normalizedMedia: normalized_media } : {}),
  };
}

// Claim ownership inside one D1 transaction. Every subsequent statement uses
// this request's token so a losing writer also performs zero DELETEs on empty
// settings. No token survives the transaction's final revision update.
export async function commitHomeLeadState(env, previous, next, lastRun = '') {
  const revision = previous.revision + 1;
  const claim = String(revision) + '|' + crypto.randomUUID();
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'home-lead-commit', {
    rawMode:previous.rawMode, rawPost:previous.rawPost, oldMedia:previous.mediaValue, oldRevision:previous.revision,
    nextMode:next.mode, nextPost:next.postId || 0, nextPostText:String(next.postId || 0), nextMedia:next.mediaValue,
    lastRun, revision:String(revision), claim,
  });
  if (!response.ok) throw new Error('Rust home lead commit failed');
  return { committed:(await response.json()).committed, revision };
}

export async function clearHomeLeadForPost(env, postId) {
  const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'home-lead-clear', {postId:Number(postId),uuid:crypto.randomUUID()});
  if (!response.ok) throw new Error('Rust home lead clear failed');
  return (await response.json()).cleared;
}

/**
 * 자동 모드일 때만 메인 스토리를 다시 고른다.
 * 수동 모드면 아무것도 건드리지 않는다.
 *
 * @returns {Promise<{ skipped:boolean, mode:string, changed:boolean, post_id:number,
 *                     previous_post_id:number, reason:string, candidates:number }>}
 */
export async function refreshAutoHomeLead(env) {
  const rust = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'home-lead-refresh', {uuid:crypto.randomUUID()});
  if (!rust.ok) throw new Error('Rust automatic home lead refresh failed');
  return rust.json();
}
