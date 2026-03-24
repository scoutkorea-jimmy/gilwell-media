/**
 * Dreampath · File Upload
 * POST /api/dreampath/upload   multipart/form-data { file: File }
 * Returns { url, name, type, size, is_image }
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.POST_IMAGES) {
    return json({ error: 'File storage not configured.' }, 500);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data.' }, 400);
  }

  const file = formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No file provided.' }, 400);
  }

  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_SIZE) {
    return json({ error: 'File too large. Maximum size is 20 MB.' }, 400);
  }

  const originalName = file.name || 'file';
  const dotIdx = originalName.lastIndexOf('.');
  const ext = dotIdx > 0 ? originalName.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const key = `dp-files/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const isImage = file.type.startsWith('image/');

  const arrayBuffer = await file.arrayBuffer();
  await env.POST_IMAGES.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const origin = new URL(request.url).origin;
  const url = `${origin}/api/images/${encodeURIComponent(key)}`;

  return json({ url, name: originalName, type: file.type || 'application/octet-stream', size: file.size, is_image: isImage });
}

export function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  });
}
