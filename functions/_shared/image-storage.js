const IMAGE_ROUTE_PREFIX = '/api/images/';

export function hasPostImageBucket(env) {
  return !!(env && env.POST_IMAGES && typeof env.POST_IMAGES.put === 'function');
}

export function buildImageRoute(origin, key) {
  return `${origin}${IMAGE_ROUTE_PREFIX}${encodeURIComponent(key)}`;
}

export function extractImageKeyFromUrl(value, origin) {
  if (!value || typeof value !== 'string') return '';
  try {
    const parsed = new URL(value, origin);
    if (parsed.pathname.indexOf(IMAGE_ROUTE_PREFIX) !== 0) return '';
    return decodeURIComponent(parsed.pathname.slice(IMAGE_ROUTE_PREFIX.length));
  } catch (_) {
    return '';
  }
}

export async function storeDataImage(env, dataUrl, origin, prefix) {
  if (!hasPostImageBucket(env) || !isDataImageUrl(dataUrl)) {
    return { url: dataUrl || null, key: '' };
  }

  const { mimeType, bytes, ext } = decodeDataImage(dataUrl);
  const key = `${prefix}-${crypto.randomUUID()}.${ext}`;
  await env.POST_IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
  return { url: buildImageRoute(origin, key), key };
}

export async function deleteStoredImageByUrl(env, value, origin) {
  const key = extractImageKeyFromUrl(value, origin);
  if (!key || !hasPostImageBucket(env)) return;
  await env.POST_IMAGES.delete(key);
}

export async function serveStoredBucketImage(env, key) {
  if (!hasPostImageBucket(env) || !key) {
    return new Response(null, { status: 404 });
  }
  const object = await env.POST_IMAGES.get(key);
  if (!object) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', headers.get('Cache-Control') || 'public, max-age=31536000, immutable');

  const originalName = object.customMetadata?.originalName;
  if (originalName) {
    const encoded = encodeURIComponent(originalName).replace(/'/g, '%27');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
  }

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

export async function upgradeEditorContentImages(content, env, origin, prefix) {
  if (!hasPostImageBucket(env) || !content || typeof content !== 'string' || content.trim().charAt(0) !== '{') {
    return content;
  }

  let doc;
  try {
    doc = JSON.parse(content);
  } catch (_) {
    return content;
  }
  if (!doc || !Array.isArray(doc.blocks)) return content;

  let changed = false;
  for (const block of doc.blocks) {
    if (!block || block.type !== 'image' || !block.data) continue;
    const current = (block.data.file && block.data.file.url) ? block.data.file.url : block.data.url;
    if (!isDataImageUrl(current)) continue;
    const stored = await storeDataImage(env, current, origin, prefix);
    if (!stored.url) continue;
    block.data.url = stored.url;
    if (!block.data.file || typeof block.data.file !== 'object') block.data.file = {};
    block.data.file.url = stored.url;
    changed = true;
  }

  return changed ? JSON.stringify(doc) : content;
}

function isDataImageUrl(value) {
  return typeof value === 'string' && value.trim().startsWith('data:image/');
}

function decodeDataImage(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { mimeType, bytes, ext: mimeToExt(mimeType) };
}

function mimeToExt(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'jpg';
}
