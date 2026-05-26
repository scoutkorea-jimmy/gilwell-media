/**
 * Shared helpers for the memorabilia public comments + likes feature.
 *
 *  · PBKDF2-SHA256 password hashing (Web Crypto, Workers-native).
 *    100,000 iterations, 16-byte random salt, base64 encoding for storage.
 *  · Comment input validation — surfaces all field errors at once.
 *  · Public/admin row serializers — public never sees IP or password hashes.
 */

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_BYTES = 32;
const SALT_BYTES = 16;

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function deriveKey(password, saltBuf) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    PBKDF2_HASH_BYTES * 8
  );
}

export async function hashCommentPassword(plain) {
  const saltArr = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(saltArr);
  const bits = await deriveKey(String(plain), saltArr.buffer);
  return {
    hash: bufToBase64(bits),
    salt: bufToBase64(saltArr.buffer),
  };
}

export async function verifyCommentPassword(plain, storedHash, storedSalt) {
  if (!plain || !storedHash || !storedSalt) return false;
  try {
    const saltBuf = base64ToBuf(storedSalt);
    const bits = await deriveKey(String(plain), saltBuf);
    const candidate = bufToBase64(bits);
    return timingSafeEqual(candidate, storedHash);
  } catch (err) {
    console.error('[memorabilia-comments] verify error:', err);
    return false;
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Validate raw form input from POST /api/memorabilia/:id/comments.
 * Returns { errors: string[], data?: normalized }.
 */
export function validateCommentSubmission(raw) {
  const errors = [];
  const author_name = String((raw && raw.author_name) || '').trim();
  const affiliation = String((raw && raw.affiliation) || '').trim();
  const password    = String((raw && raw.password) || '');
  const content     = String((raw && raw.content) || '').trim();

  if (!author_name) errors.push('이름을 입력해주세요.');
  else if (author_name.length > 40) errors.push('이름은 40자 이하여야 합니다.');

  if (!affiliation) errors.push('소속연맹을 입력해주세요.');
  else if (affiliation.length > 80) errors.push('소속연맹은 80자 이하여야 합니다.');

  if (!password) errors.push('비밀번호를 입력해주세요.');
  else if (password.length < 6) errors.push('비밀번호는 6자 이상이어야 합니다.');
  else if (password.length > 128) errors.push('비밀번호가 너무 깁니다.');

  if (!content) errors.push('내용을 입력해주세요.');
  else if (content.length > 1000) errors.push('내용은 1000자 이하여야 합니다.');

  if (errors.length) return { errors };
  return {
    errors: [],
    data: { author_name, affiliation, password, content },
  };
}

/**
 * Public row shape — strips IP / password / moderation meta.
 * Used by GET /api/memorabilia/:id/comments (approved only).
 */
export function serializeCommentPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    memorabilia_id: row.memorabilia_id,
    author_name: row.author_name,
    affiliation: row.affiliation,
    content: row.content,
    created_at: row.created_at,
  };
}

/**
 * Admin row shape — includes IP, UA, moderation metadata.
 * Used by GET /api/admin/memorabilia/comments?status=...
 */
export function serializeCommentAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    memorabilia_id: row.memorabilia_id,
    memorabilia_title_ko: row.memorabilia_title_ko || null,
    memorabilia_title_en: row.memorabilia_title_en || null,
    memorabilia_slug: row.memorabilia_slug || null,
    author_name: row.author_name,
    affiliation: row.affiliation,
    content: row.content,
    ip_address: row.ip_address,
    user_agent: row.user_agent || null,
    status: row.status,
    rejection_reason: row.rejection_reason || null,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at || null,
    reviewed_by: row.reviewed_by || null,
    deleted_at: row.deleted_at || null,
  };
}
