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

  const contentType = headers.get('Content-Type') || '';
  const isImage = contentType.startsWith('image/');
  const originalName = object.customMetadata?.originalName;
  if (originalName) {
    const encoded = encodeURIComponent(originalName).replace(/'/g, '%27');
    const disposition = isImage ? 'inline' : 'attachment';
    headers.set('Content-Disposition', `${disposition}; filename*=UTF-8''${encoded}`);
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

// Bitmap-only allowlist. SVG is deliberately excluded because SVG can carry
// <script> and event handlers that execute when the image is loaded inline,
// which would bypass the rest of the XSS defenses.
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function decodeDataImage(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const rawMime = (mimeMatch ? mimeMatch[1] : 'image/jpeg').toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(rawMime)) {
    throw new Error(`Unsupported image type: ${rawMime}`);
  }
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  // Magic byte 검증 — MIME 헤더가 위조됐는지 실제 파일 시그니처로 재확인.
  // 데이터 URL 의 "data:image/jpeg" 라벨만 믿으면 GIF/PNG 가 JPEG 로 위장
  // 가능 (예: SVG 본문을 jpeg MIME 로 끼워넣는 변형). 시그니처 불일치 시 거부.
  const detected = detectImageMagic(bytes);
  if (!detected) throw new Error('Unrecognized image bytes (magic mismatch)');
  if (detected !== mimeType) {
    throw new Error(`Image magic ${detected} does not match declared MIME ${mimeType}`);
  }
  return { mimeType, bytes, ext: mimeToExt(mimeType) };
}

// 첫 12바이트로 비트맵 시그니처 식별. 허용된 5종(jpeg/png/webp/gif) 만 인식.
function detectImageMagic(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) return 'image/png';
  // GIF: 47 49 46 38 (37|39) 61  → "GIF87a" or "GIF89a"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
  // WebP: "RIFF" .... "WEBP"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

function mimeToExt(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}
