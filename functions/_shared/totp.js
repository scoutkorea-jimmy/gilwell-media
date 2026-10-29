/**
 * TOTP (RFC 6238) — Google Authenticator 호환 2FA 코어.
 *
 * 알고리즘: HMAC-SHA1, 30초 step, 6자리 — Google Authenticator / 1Password /
 * Authy 기본값과 동일. Cloudflare Workers Web Crypto(crypto.subtle)만 사용.
 *
 * 이 모듈은 순수 계산만 한다(상태/DB 없음). 시크릿 저장·검증 마커는 호출부에서.
 *
 * 검증: RFC 6238 SHA-1 테스트 벡터로 단위 검증됨 (scripts/test-totp.mjs).
 */

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 Base32 인코딩 (패딩 없음, 대문자). */
export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 4648 Base32 디코딩 (대소문자·공백·패딩 허용). 잘못된 문자는 무시하지 않고 throw. */
export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 암호학적 난수 시크릿(기본 20바이트=160bit) → Base32 문자열. */
export function generateSecret(byteLen = 20) {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

// 8바이트 빅엔디안 카운터.
function counterBytes(counter) {
  const buf = new Uint8Array(8);
  // counter 는 2^53 미만 정수 — 하위 32비트/상위 비트 분리.
  let hi = Math.floor(counter / 0x100000000);
  let lo = counter >>> 0;
  for (let i = 7; i >= 4; i--) { buf[i] = lo & 0xff; lo = Math.floor(lo / 256); }
  for (let i = 3; i >= 0; i--) { buf[i] = hi & 0xff; hi = Math.floor(hi / 256); }
  return buf;
}

/** HOTP(RFC 4226): keyBytes(Uint8Array) + counter → digits 자리 코드 문자열. */
export async function hotp(keyBytes, counter, digits = 6) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes(counter)));
  const offset = sig[sig.length - 1] & 0x0f;
  const bin = ((sig[offset] & 0x7f) << 24)
    | ((sig[offset + 1] & 0xff) << 16)
    | ((sig[offset + 2] & 0xff) << 8)
    | (sig[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, '0');
}

/** TOTP: base32 시크릿 + 시각(초) → 코드. */
export async function totp(secretBase32, timeSec, opts = {}) {
  const step = opts.step || 30;
  const digits = opts.digits || 6;
  const t0 = opts.t0 || 0;
  const counter = Math.floor((timeSec - t0) / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * 코드 검증 — 시계 어긋남 보정을 위해 t, t±window step 을 확인.
 * timing-safe 비교. 유효하면 true.
 */
export async function verifyTotp(secretBase32, code, timeSec, opts = {}) {
  const step = opts.step || 30;
  const digits = opts.digits || 6;
  const window = opts.window == null ? 1 : opts.window;
  const input = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6,8}$/.test(input)) return false;
  const keyBytes = base32Decode(secretBase32);
  const baseCounter = Math.floor((timeSec - (opts.t0 || 0)) / step);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const candidate = await hotp(keyBytes, baseCounter + w, digits);
    // 모든 후보를 끝까지 평가(early-return timing leak 방지)
    if (constantTimeEqual(candidate, input)) ok = true;
  }
  return ok;
}

/** otpauth:// URI (Authenticator 앱 QR용). */
export function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 일회용 백업코드 N개 생성 (형식: XXXX-XXXX, 대문자/숫자, 혼동 문자 제외). */
export function generateBackupCodes(count = 8) {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I 제외
  const codes = [];
  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    let s = '';
    for (let j = 0; j < 8; j++) s += ALPHA[buf[j] % ALPHA.length];
    codes.push(s.slice(0, 4) + '-' + s.slice(4));
  }
  return codes;
}

/** 백업코드 저장용 해시(SHA-256 hex). 대시·대소문자 정규화 후 해시. */
export async function hashBackupCode(code) {
  const norm = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 저장된 백업코드 해시 목록(JSON 문자열)에서 code 매칭 → 일치 해시 반환(소비용), 없으면 null. */
export async function matchBackupCode(storedJson, code) {
  if (!storedJson || !code) return null;
  let list = [];
  try { list = JSON.parse(storedJson); } catch (_) { return null; }
  if (!Array.isArray(list)) return null;
  const h = await hashBackupCode(code);
  return list.includes(h) ? h : null;
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let r = a.length ^ b.length;
  for (let i = 0; i < len; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
