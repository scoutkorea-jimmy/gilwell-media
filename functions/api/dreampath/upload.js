/**
 * Dreampath · File Upload
 * POST /api/dreampath/upload   multipart/form-data { file: File }
 * Returns { url, name, type, size, is_image }
 *
 * Hardening (2026-05-20):
 *   - Rate limited per uid (10 uploads / 60s) to stop authenticated cost
 *     pumps against R2 storage.
 *   - MIME allowlist + magic-byte verification: we no longer trust the
 *     client-supplied `file.type` blindly. The first ~16 bytes are sniffed
 *     and the resulting MIME must match the declared one *and* sit on the
 *     allowlist (images / PDF / common Office / archives). Files that pass
 *     are stored with a server-derived `contentType` so a renamed `.gif`
 *     can't serve as SVG/HTML.
 */
import { enforceRateLimit, rateLimitResponse } from '../../_shared/rate-limit.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

// MIME allowlist — only types that we want callers to be able to surface in
// dreampath posts and that we're comfortable serving from POST_IMAGES.
// Anything else returns 415 even if it looks benign. Add deliberately.
const ALLOWED_MIME = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/heic', 'image/heif',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  // Video (small only via MAX_SIZE)
  'video/mp4', 'video/quicktime',
  // Audio
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
]);

// Magic-byte signatures. Returns a canonical MIME for the bytes, or null
// if the file's leading bytes don't match any known signature.
function sniffMime(bytes) {
  if (!bytes || bytes.length < 4) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  // WEBP: RIFF....WEBP
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'image/bmp';
  // HEIC/HEIF: bytes 4-7 = "ftyp" then heic/heix/mif1/heim/heis/hevc/hevx etc.
  if (bytes.length >= 12
      && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'heim'
        || brand === 'heis' || brand === 'hevc' || brand === 'hevx') return 'image/heic';
    if (brand === 'isom' || brand === 'iso2' || brand === 'mp41' || brand === 'mp42' || brand === 'avc1') return 'video/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand === 'M4A ') return 'audio/mp4';
  }
  // PDF: 25 50 44 46 (%PDF)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  // ZIP and modern Office (.docx/.xlsx/.pptx are ZIPs): 50 4B 03 04 / 50 4B 05 06 / 50 4B 07 08
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return 'application/zip';
  }
  // Legacy Office (.doc/.xls/.ppt): D0 CF 11 E0
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
    return 'application/msword';
  }
  // MP3 (ID3 or frame sync 0xFF 0xFB/0xF3/0xF2)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes[0] === 0xFF && (bytes[1] === 0xFB || bytes[1] === 0xF3 || bytes[1] === 0xF2)) return 'audio/mpeg';
  return null;
}

// Map sniffed canonical types to the broader "this declared MIME is
// acceptable for these bytes" set. e.g. application/zip on disk legitimately
// corresponds to .docx/.xlsx/.pptx in MIME terms.
function declaredMatchesSniffed(declared, sniffed) {
  if (!declared || !sniffed) return false;
  if (declared === sniffed) return true;
  if (sniffed === 'application/zip') {
    return (
      declared === 'application/zip' ||
      declared === 'application/x-zip-compressed' ||
      declared === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      declared === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      declared === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
  }
  if (sniffed === 'application/msword') {
    return declared === 'application/msword' || declared === 'application/vnd.ms-excel' || declared === 'application/vnd.ms-powerpoint';
  }
  if (sniffed === 'image/heic') {
    return declared === 'image/heic' || declared === 'image/heif';
  }
  if (sniffed === 'audio/mp4') {
    return declared === 'audio/mp4' || declared === 'audio/x-m4a';
  }
  return false;
}

export async function onRequestPost({ request, env, data }) {
  if (!env.POST_IMAGES) {
    return json({ error: 'File storage not configured.' }, 500);
  }

  // Rate limit per dpUser uid (falls back to IP if dpUser missing).
  const uid = (data && data.dpUser && data.dpUser.uid) || null;
  const identity = uid ? `uid:${uid}` : `ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`;
  const rl = await enforceRateLimit(env, {
    route: 'dreampath-upload',
    identity,
    limit: 10,           // 10 uploads
    windowSeconds: 60,   // per minute
  });
  if (!rl.ok) return rateLimitResponse(rl, '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');

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

  if (file.size > MAX_SIZE) {
    return json({ error: 'File too large. Maximum size is 100 MB.' }, 400);
  }
  if (file.size === 0) {
    return json({ error: 'Empty file.' }, 400);
  }

  const declaredType = String(file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(declaredType)) {
    return json({ error: 'Unsupported file type.' }, 415);
  }

  const originalName = file.name || 'file';
  const dotIdx = originalName.lastIndexOf('.');
  const ext = dotIdx > 0 ? originalName.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';

  // Belt-and-braces extension blocklist — even if MIME passes, a renamed
  // executable shouldn't survive. Kept as a redundant defense layer.
  const BLOCKED_EXTENSIONS = new Set([
    'exe','sh','bat','cmd','com','ps1','ps2','vbs','vbe','js','jse',
    'jar','app','deb','rpm','dmg','pkg','msi','scr','pif','hta',
    'cpl','dll','sys','drv','inf','reg','lnk','svg','html','htm','xml',
  ]);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return json({ error: 'Unsupported file type.' }, 415);
  }

  const arrayBuffer = await file.arrayBuffer();

  // Magic-byte sniff on the first 16 bytes. Plain text uploads are allowed
  // without a signature match because text files have no fixed header.
  const head = new Uint8Array(arrayBuffer, 0, Math.min(16, arrayBuffer.byteLength));
  const sniffed = sniffMime(head);
  if (declaredType !== 'text/plain' && declaredType !== 'text/csv') {
    if (!sniffed || !declaredMatchesSniffed(declaredType, sniffed)) {
      return json({ error: 'File content does not match its declared type.' }, 415);
    }
  }

  // Use the SNIFFED type (server-derived) as the served Content-Type so a
  // forged client value can't make a JPEG be served as image/svg+xml etc.
  // For text uploads we still need a sensible default.
  const safeContentType = sniffed
    || (declaredType === 'text/csv' ? 'text/csv' : 'text/plain');

  const key = `dp-files/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const isImage = safeContentType.startsWith('image/');

  await env.POST_IMAGES.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: safeContentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalName: originalName.slice(0, 200),
      uploadedBy: uid ? String(uid) : '',
    },
  });

  const origin = new URL(request.url).origin;
  const url = `${origin}/api/images/${encodeURIComponent(key)}`;

  return json({ url, name: originalName, type: safeContentType, size: file.size, is_image: isImage });
}

export function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  });
}
