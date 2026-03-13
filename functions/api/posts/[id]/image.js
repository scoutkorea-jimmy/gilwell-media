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

  // External URL → redirect
  if (imgUrl.startsWith('http')) {
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
