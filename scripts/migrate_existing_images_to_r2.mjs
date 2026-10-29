#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const DB_NAME = process.argv[2] || 'gilwell-posts';
const BUCKET = process.argv[3] || 'gilwell-media-images';
const ORIGIN = process.argv[4] || 'https://bpmedia.net';

const tempRoot = mkdtempSync(join(tmpdir(), 'gw-r2-migrate-'));

try {
  const postRows = d1Query(`SELECT id, image_url FROM posts WHERE image_url LIKE 'data:image/%'`).results || [];
  const contentRows = d1Query(`SELECT id, content FROM posts WHERE content LIKE '%data:image/%'`).results || [];
  const siteMetaRow = d1Query(`SELECT value FROM settings WHERE key = 'site_meta'`).results?.[0] || null;

  let migratedCovers = 0;
  let migratedInline = 0;
  for (const row of postRows) {
    const updates = [];

    if (isDataImageUrl(row.image_url)) {
      const coverUrl = uploadDataUrl(row.image_url, `cover-${row.id}`);
      updates.push(`image_url = '${sqlEscape(coverUrl)}'`);
      migratedCovers += 1;
    }

    if (updates.length) {
      d1Exec(`UPDATE posts SET ${updates.join(', ')} WHERE id = ${Number(row.id)};`);
    }
  }

  for (const row of contentRows) {
    const upgraded = migrateEditorContent(row.content, `post-${row.id}`);
    if (!upgraded.changed) continue;
    d1Exec(`UPDATE posts SET content = '${sqlEscape(upgraded.content)}' WHERE id = ${Number(row.id)};`);
    migratedInline += upgraded.count;
  }

  let migratedSiteMeta = 0;
  if (siteMetaRow?.value) {
    const parsed = JSON.parse(siteMetaRow.value);
    if (isDataImageUrl(parsed.image_url)) {
      parsed.image_url = uploadDataUrl(parsed.image_url, 'site-meta');
      migratedSiteMeta = 1;
      d1Exec(`UPDATE settings SET value = '${sqlEscape(JSON.stringify(parsed))}' WHERE key = 'site_meta';`);
    }
  }

  console.log(JSON.stringify({
    migrated_cover_images: migratedCovers,
    migrated_inline_images: migratedInline,
    migrated_site_meta_images: migratedSiteMeta,
  }, null, 2));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function migrateEditorContent(content, prefix) {
  let doc;
  try {
    doc = JSON.parse(content);
  } catch (_) {
    return { changed: false, content, count: 0 };
  }
  if (!doc || !Array.isArray(doc.blocks)) return { changed: false, content, count: 0 };

  let count = 0;
  for (const block of doc.blocks) {
    if (!block || block.type !== 'image' || !block.data) continue;
    const current = (block.data.file && block.data.file.url) ? block.data.file.url : block.data.url;
    if (!isDataImageUrl(current)) continue;
    const uploaded = uploadDataUrl(current, `${prefix}-inline`);
    block.data.url = uploaded;
    if (!block.data.file || typeof block.data.file !== 'object') block.data.file = {};
    block.data.file.url = uploaded;
    count += 1;
  }

  return {
    changed: count > 0,
    content: count > 0 ? JSON.stringify(doc) : content,
    count,
  };
}

function uploadDataUrl(dataUrl, prefix) {
  const { buffer, mimeType, ext } = decodeDataUrl(dataUrl);
  const key = `${prefix}-${crypto.randomUUID()}.${ext}`;
  const filePath = join(tempRoot, key);
  writeFileSync(filePath, buffer);
  execFileSync('wrangler', [
    'r2', 'object', 'put', `${BUCKET}/${key}`,
    '--remote',
    '--file', filePath,
    '--content-type', mimeType,
    '--cache-control', 'public, max-age=31536000, immutable',
  ], { stdio: 'pipe' });
  return `${ORIGIN}/api/images/${encodeURIComponent(key)}`;
}

function d1Query(sql) {
  const raw = execFileSync('wrangler', [
    'd1', 'execute', DB_NAME,
    '--remote',
    '--json',
    '--command', sql,
  ], { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(raw);
  return parsed[0] || { results: [] };
}

function d1Exec(sql) {
  execFileSync('wrangler', [
    'd1', 'execute', DB_NAME,
    '--remote',
    '--command', sql,
  ], { stdio: 'pipe' });
}

function decodeDataUrl(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  return {
    mimeType,
    ext: mimeToExt(mimeType),
    buffer: Buffer.from(b64, 'base64'),
  };
}

function mimeToExt(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'jpg';
}

function isDataImageUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}
