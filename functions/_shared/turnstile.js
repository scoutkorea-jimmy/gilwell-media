/**
 * Cloudflare Turnstile server-side verification.
 *
 * Setup:
 *   1. Go to dash.cloudflare.com → Turnstile → Add site (bpmedia.net)
 *   2. Copy the Secret Key → add as env var TURNSTILE_SECRET in
 *      Cloudflare Pages → Settings → Environment variables
 *   3. Copy the Site Key → set window.TURNSTILE_SITE_KEY in main.js
 *
 * If TURNSTILE_SECRET is not set, verification is skipped (graceful
 * degradation — site works before Turnstile is configured).
 */

export async function verifyTurnstile(token, env) {
  if (!env.TURNSTILE_SECRET) return true; // not configured → skip
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
