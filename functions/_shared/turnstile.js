/**
 * Cloudflare Turnstile server-side verification.
 *
 * Setup:
 *   1. Go to dash.cloudflare.com → Turnstile → Add site (bpmedia.net)
 *   2. Copy the Secret Key → add as env var TURNSTILE_SECRET in
 *      Cloudflare Pages → Settings → Environment variables
 *   3. Copy the Site Key → set window.TURNSTILE_SITE_KEY in main.js
 *
 * Behavior matrix:
 *   - TURNSTILE_SECRET missing + preview/dev  → verification skipped silently (dev ergonomics)
 *   - TURNSTILE_SECRET missing + production   → verification SKIPPED but a warn log is emitted on
 *     every invocation so ops notices the misconfiguration. We intentionally keep fail-open here
 *     so an expired/rotated secret can't lock the operator out of the admin panel.
 *     Set TURNSTILE_STRICT=1 to flip this to fail-closed once confident the secret is permanent.
 */

let _warnedMissingSecret = false;

export async function verifyTurnstile(token, env) {
  if (!env.TURNSTILE_SECRET) {
    const strict = String(env.TURNSTILE_STRICT || '').trim() === '1';
    if (isProductionEnv(env)) {
      if (!_warnedMissingSecret) {
        console.warn('[turnstile] TURNSTILE_SECRET is not configured in production — CAPTCHA layer is disabled. strict=' + (strict ? 'on' : 'off'));
        _warnedMissingSecret = true;
      }
      return !strict;
    }
    return true; // non-prod: skip so local dev & preview still work
  }
  if (!token || typeof token !== 'string' || !token.trim()) return false;
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          secret:   env.TURNSTILE_SECRET,
          response: token,
        }),
      }
    );
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function isProductionEnv(env) {
  const flag = String((env && (env.ENVIRONMENT || env.CF_PAGES_BRANCH)) || '').toLowerCase();
  if (!flag) return false;
  if (flag === 'production' || flag === 'prod') return true;
  if (flag === 'main') return true;
  return false;
}
