/**
 * BP미디어 · Post Cover Image
 *
 * GET /api/posts/:id/image
 * Returns the cover image for a post as a proper HTTP response.
 * Supports base64 data URIs (stored in DB) and external URLs (redirect).
 * Used as the og:image source for link preview cards.
 */

export async function onRequestGet({ params, env }) {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return new Response(null, { status: 404 });
  }

  let post;
  try {
    post = await env.DB.prepare('SELECT image_url FROM posts WHERE id = ? AND published = 1')
      .bind(id).first();
  } catch (err) {
    return new Response(null, { status: 500 });
  }

  if (!post || !post.image_url) {
    return new Response(null, { status: 404 });
  }

  const imgUrl = post.image_url;

  // External URL → redirect, but only after validating the scheme + host.
  // posts.image_url is admin-written, so under normal flow it's already a
  // trusted R2 / Cloudflare URL, but defense-in-depth: a stored-XSS or a
  // compromised admin account could otherwise plant a `javascript:` URL or
  // an attacker-controlled host and turn this endpoint into an open
  // redirect from our origin. We require `https://` + an allowlisted host.
  if (imgUrl.startsWith('http')) {
    if (!isSafeExternalImageUrl(imgUrl)) {
      console.error('[posts/image] rejected unsafe redirect target', { id, host: tryGetHost(imgUrl) });
      return new Response(null, { status: 404 });
    }
    return Response.redirect(imgUrl, 302);
  }

  // Base64 data URI → serve as binary
  if (imgUrl.startsWith('data:')) {
    const commaIdx = imgUrl.indexOf(',');
    if (commaIdx < 0) return new Response(null, { status: 404 });
    const header   = imgUrl.slice(0, commaIdx);
    const b64      = imgUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    try {
      const binary = atob(b64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Response(bytes.buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (e) {
      return new Response(null, { status: 500 });
    }
  }

  return new Response(null, { status: 404 });
}

// Allowlist of hosts permitted as `Response.redirect` targets for cover
// images. Anything else is treated as if the row had no image. Keep this
// list narrow — every new host is a fresh open-redirect blast radius.
const SAFE_IMAGE_HOST_SUFFIXES = [
  '.r2.dev',                       // Cloudflare R2 public buckets
  '.r2.cloudflarestorage.com',     // Cloudflare R2 native endpoint
  '.cloudflare.com',               // Cloudflare-owned subdomains
  'bpmedia.net',                   // our origin
  '.bpmedia.net',
  '.pages.dev',                    // Pages preview/prod
];

function isSafeExternalImageUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    // Force HTTPS — http:// downgrade is a small but unnecessary risk.
    if (url.protocol === 'http:') return false;
    const host = url.hostname.toLowerCase();
    return SAFE_IMAGE_HOST_SUFFIXES.some((suffix) =>
      suffix.startsWith('.') ? host.endsWith(suffix) : host === suffix
    );
  } catch (_) {
    return false;
  }
}

function tryGetHost(raw) {
  try { return new URL(raw).hostname; } catch (_) { return null; }
}
