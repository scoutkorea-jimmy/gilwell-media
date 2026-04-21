/**
 * Gilwell Media · admin_users validation utilities
 *
 * Centralized input validation for user CRUD + permission payloads so the
 * handlers stay concise and behavior stays consistent between create and
 * update paths.
 */
import { flattenMenuSlugs } from './admin-users.js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const DISPLAY_NAME_MAX = 60;
export const EDITOR_CODE_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 256;
export const AI_DAILY_LIMIT_MAX = 10000;

const USERNAME_RE = /^[a-z0-9_]+$/;
// Usernames we never let a member claim — collisions or impersonation risks.
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'system', 'root', 'null', 'undefined',
  'support', 'bpmedia',
]);

export function normalizeUsername(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase();
}

export function validateUsername(raw, { allowOwner = false } = {}) {
  const name = normalizeUsername(raw);
  if (!name) return { ok: false, error: '아이디를 입력해주세요.' };
  if (name.length < USERNAME_MIN) return { ok: false, error: `아이디는 최소 ${USERNAME_MIN}자 이상이어야 합니다.` };
  if (name.length > USERNAME_MAX) return { ok: false, error: `아이디는 최대 ${USERNAME_MAX}자 이하여야 합니다.` };
  if (!USERNAME_RE.test(name)) {
    return { ok: false, error: '아이디는 영문 소문자·숫자·언더스코어(_)만 사용할 수 있습니다.' };
  }
  if (!allowOwner && name === 'owner') {
    return { ok: false, error: '아이디 "owner"는 시스템 예약어입니다.' };
  }
  if (RESERVED_USERNAMES.has(name)) {
    return { ok: false, error: `아이디 "${name}"은(는) 예약되어 있어 사용할 수 없습니다.` };
  }
  return { ok: true, value: name };
}

export function validateDisplayName(raw) {
  const name = String(raw == null ? '' : raw).trim();
  if (!name) return { ok: false, error: '표시 이름을 입력해주세요.' };
  if (name.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `표시 이름은 최대 ${DISPLAY_NAME_MAX}자까지 입력 가능합니다.` };
  }
  return { ok: true, value: name };
}

export function validatePassword(raw) {
  const pw = String(raw == null ? '' : raw);
  if (!pw) return { ok: false, error: '비밀번호를 입력해주세요.' };
  if (pw.length < PASSWORD_MIN) return { ok: false, error: `비밀번호는 최소 ${PASSWORD_MIN}자 이상이어야 합니다.` };
  if (pw.length > PASSWORD_MAX) return { ok: false, error: `비밀번호는 최대 ${PASSWORD_MAX}자 이하여야 합니다.` };
  return { ok: true, value: pw };
}

export function validateEditorCode(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const code = String(raw).trim();
  if (!code) return { ok: true, value: null };
  if (code.length > EDITOR_CODE_MAX) {
    return { ok: false, error: `편집자 코드는 최대 ${EDITOR_CODE_MAX}자까지 입력 가능합니다.` };
  }
  return { ok: true, value: code };
}

export function validateAiDailyLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > AI_DAILY_LIMIT_MAX) {
    return { ok: false, error: `AI 일일 한도는 0–${AI_DAILY_LIMIT_MAX} 범위여야 합니다. 비우면 기본값(10) 적용.` };
  }
  return { ok: true, value: Math.floor(n) };
}

export function validateStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'active' || s === 'disabled') return { ok: true, value: s };
  return { ok: false, error: 'status는 active 또는 disabled여야 합니다.' };
}

/**
 * Validate the permissions blob {access_admin, permissions[]}. Rejects unknown
 * menu slugs so we never ship phantom permissions that silently do nothing.
 */
export function validatePermissions(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'permissions는 객체여야 합니다.' };
  }
  const accessAdmin = !!raw.access_admin;
  const arr = Array.isArray(raw.permissions) ? raw.permissions : [];
  const validSlugs = new Set(flattenMenuSlugs());
  const cleaned = [];
  for (const entry of arr) {
    if (typeof entry !== 'string') continue;
    const match = entry.match(/^(view|write):([a-z0-9-]+)$/);
    if (!match) return { ok: false, error: `잘못된 권한 토큰: ${entry}` };
    const slug = match[2];
    if (!validSlugs.has(slug)) {
      return { ok: false, error: `알 수 없는 메뉴 slug: ${slug}` };
    }
    cleaned.push(entry);
  }
  // Dedupe + sort for stable storage.
  const unique = Array.from(new Set(cleaned)).sort();
  return {
    ok: true,
    value: { access_admin: accessAdmin, permissions: unique },
  };
}

/**
 * Generate a temporary password: 12 alphanumeric chars, no ambiguous (0OIl1).
 * Returned to the owner for distribution; the member is forced to change it
 * at first login (must_change_password=1).
 */
export function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}
