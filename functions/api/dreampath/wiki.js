/**
 * Dreampath · Knowledge Base (Document Wiki)
 *
 * GET    /api/dreampath/wiki?list=1            — page list (latest-version meta)
 * GET    /api/dreampath/wiki?page_id=N         — page + versions + current content
 * GET    /api/dreampath/wiki?slug=X            — same, resolved by slug
 * GET    /api/dreampath/wiki?version_id=N      — single version (full content, for diff)
 * POST   /api/dreampath/wiki                   — create page OR new version (write:wiki)
 * POST   /api/dreampath/wiki?followup=1        — upsert my follow-up/memo (view:wiki)
 * PUT    /api/dreampath/wiki?version_id=N      — in-place edit a version (write:wiki OR uploader)
 * DELETE /api/dreampath/wiki?page_id=N         — delete page + versions + followups + comments (admin)
 *
 * Permission model:
 *   - GET      → view:wiki
 *   - POST/PUT → write:wiki  (PUT also allowed to the version's uploader)
 *   - DELETE   → admin role
 *   Admin role bypasses scopes (see _shared/dreampath-perm.js hasPerm()).
 *
 * [CASE STUDY 2026-06-04 — title is the page identity]
 *   A wiki page is keyed by `slug` (normalized title). Uploading a document
 *   whose title normalizes to an EXISTING slug appends a new version
 *   (version_no = current_version + 1) instead of creating a second page.
 *   That is the whole point of the feature (track how the same document
 *   changes over time). If you change slug normalization, you risk splitting
 *   one logical document into two pages — re-verify _slug() against existing
 *   rows before shipping. Ref: DREAMPATH-HISTORY.md 2026-06-04.
 */

import { hasPerm, requirePerm, requireAdmin } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Characters stripped from a slug: html-unsafe + path separators. Letters,
// digits, hyphens and Korean syllables are preserved.
const SLUG_STRIP = /["'<>`\\/]/g;

// [CASE STUDY 2026-06-04 — version suffixes split one document into many]
//   "CUFS_..._v1.2_DRAFT" and "CUFS_..._v1.0_DRAFT" were creating two separate
//   wiki pages because the slug kept the version/draft suffix. The fix: a page
//   is identified by its BASE title — trailing version/draft markers are
//   stripped before slugging, so v1.0 / v1.2 / final / rev3 of the same doc
//   all map to one page. Only TRAILING markers are removed (so "Budget 2026"
//   vs "Budget 2025" stay distinct — a bare year is NOT a marker). A bare
//   integer is also kept; only dotted numbers (1.2) and v-prefixed tokens are
//   treated as versions. Ref: DREAMPATH-HISTORY.md 2026-06-04 case 3.
function _isVersionMarker(tok) {
  return /^v\d+(\.\d+)*(draft|final|rev\d*)?$/i.test(tok)         // v1, v1.2, v2final
      || /^\d+(\.\d+)+$/.test(tok)                                // 1.2, 1.0 (dotted)
      || /^(v|ver|version|draft|final|fin|copy|wip|rev\d*|r\d+)$/i.test(tok) // EN words
      // Korean doc-type / draft descriptors — "X 신구대조표", "X 원안", "X 개정안"
      // all belong to document "X". These trail the real title, so dropping
      // them groups the change-table / draft with its parent document.
      || /^(신구대조표|신구대조|대조표|원안|개정안|개정|초안|시안|검토안|수정안|최종안|최종|버전|버젼)$/.test(tok);
}

// Extract the document's REAL version label from its filename (e.g. "v1.2",
// "v1.0"), so the UI shows the actual version instead of our internal upload
// counter. Returns null when the filename has no version token.
// [CASE STUDY 2026-06-04 — show real version, not upload order]
//   Internal version_no (1,2,3…) was surfacing as "v2" for a v1.2 document,
//   which read like we renumbered the doc. We now store + display version_label.
function _versionLabel(title) {
  const m = String(title || '').match(/v\s*\.?\s*(\d+(?:\.\d+)*)/i)
        || String(title || '').match(/(?:^|[\s_\-(])(\d+\.\d+)(?=[\s_\-)]|$)/);
  return m ? ('v' + m[1]) : null;
}

// Split a title on separators and drop trailing version/draft markers. Always
// keeps at least the first token so a doc literally named "v1.2" survives.
function _baseTokens(title) {
  const toks = String(title || '').trim().split(/[\s_\-]+/).filter(Boolean);
  let end = toks.length;
  while (end > 1 && _isVersionMarker(toks[end - 1])) end--;
  return toks.slice(0, end);
}

// Human-readable base title (display) — markers stripped, spaces between tokens.
function _baseTitle(title) {
  const t = _baseTokens(title);
  return t.length ? t.join(' ') : String(title || '').trim();
}

// Stable identity slug = base tokens, lowercased + hyphen-joined. Same base →
// same slug → same page (new version), regardless of version suffix.
function _slug(title) {
  return (_baseTokens(title).join('-').toLowerCase().replace(SLUG_STRIP, '').slice(0, 200)) || 'doc';
}

// CREATE TABLE IF NOT EXISTS guard (auth.js pattern). The canonical schema is
// also applied via wrangler migration; this keeps the endpoint self-healing
// if a fresh environment hits the API before the migration runs.
async function _ensureTables(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_wiki_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      current_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by_id INTEGER,
      created_by_name TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_wiki_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      version_label TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT,
      source_file_url TEXT,
      source_file_name TEXT,
      change_context TEXT,
      char_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      uploaded_by_id INTEGER,
      uploaded_by_name TEXT
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_wiki_versions_page ON dp_wiki_versions(page_id, version_no)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_wiki_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL,
      page_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      status TEXT NOT NULL DEFAULT 'following',
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(version_id, user_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_wiki_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      parent_id INTEGER,
      author_id INTEGER,
      author_name TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    // Per-change "변경 사유" memos, keyed to a specific (from,to) version pair
    // and a stable row_key (hash of the changed text). One memo per change.
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_wiki_diff_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      from_version_id INTEGER NOT NULL,
      to_version_id INTEGER NOT NULL,
      row_key TEXT NOT NULL,
      old_excerpt TEXT,
      new_excerpt TEXT,
      note TEXT NOT NULL,
      author_id INTEGER,
      author_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(from_version_id, to_version_id, row_key)
    )`),
  ]);
}

function _uploaderName(user) {
  return String((user && (user.name || user.username)) || 'Unknown');
}

export async function onRequestGet({ request, env, data }) {
  const denied = requirePerm(data, 'view:wiki');
  if (denied) return denied;
  await _ensureTables(env);

  const url = new URL(request.url);
  const list = url.searchParams.get('list');
  const pageId = parseInt(url.searchParams.get('page_id') || '', 10);
  const slug = url.searchParams.get('slug');
  const versionId = parseInt(url.searchParams.get('version_id') || '', 10);

  // Per-change memos for a version pair.
  if (url.searchParams.get('diff_notes')) {
    const from = parseInt(url.searchParams.get('from') || '', 10);
    const to = parseInt(url.searchParams.get('to') || '', 10);
    if (!from || !to) return json({ error: 'from and to are required.' }, 400);
    const rows = (await env.DB.prepare(
      `SELECT row_key, old_excerpt, new_excerpt, note, author_name, updated_at
         FROM dp_wiki_diff_notes WHERE from_version_id = ? AND to_version_id = ?`
    ).bind(from, to).all()).results || [];
    return json({ notes: rows });
  }

  // Single version (for diff) — content included.
  if (versionId) {
    const v = await env.DB.prepare(
      `SELECT id, page_id, version_no, version_label, title, content, source_type, source_file_url,
              source_file_name, change_context, char_count, created_at, uploaded_by_name
         FROM dp_wiki_versions WHERE id = ?`
    ).bind(versionId).first();
    if (!v) return json({ error: 'Version not found.' }, 404);
    return json({ version: v });
  }

  // Page list — latest-version metadata, no content bodies.
  if (list) {
    const rows = await env.DB.prepare(
      `SELECT p.id, p.slug, p.title, p.category, p.current_version, p.created_at, p.updated_at,
              p.created_by_name,
              (SELECT COUNT(*) FROM dp_wiki_versions v WHERE v.page_id = p.id) AS version_count,
              (SELECT source_type FROM dp_wiki_versions v WHERE v.page_id = p.id ORDER BY v.version_no DESC LIMIT 1) AS latest_source_type,
              (SELECT version_label FROM dp_wiki_versions v WHERE v.page_id = p.id ORDER BY v.version_no DESC LIMIT 1) AS latest_version_label,
              (SELECT uploaded_by_name FROM dp_wiki_versions v WHERE v.page_id = p.id ORDER BY v.version_no DESC LIMIT 1) AS latest_editor
         FROM dp_wiki_pages p
        ORDER BY p.updated_at DESC`
    ).all();
    return json({ pages: rows.results || [] });
  }

  // Single page — page + version timeline + current content + my follow-ups.
  let page = null;
  if (pageId) {
    page = await env.DB.prepare(`SELECT * FROM dp_wiki_pages WHERE id = ?`).bind(pageId).first();
  } else if (slug) {
    page = await env.DB.prepare(`SELECT * FROM dp_wiki_pages WHERE slug = ?`).bind(_slug(slug)).first();
  } else {
    return json({ error: 'Provide list=1, page_id, slug, or version_id.' }, 400);
  }
  if (!page) return json({ error: 'Wiki page not found.' }, 404);

  // Version timeline (metadata only — no content blobs in the list).
  const versions = (await env.DB.prepare(
    `SELECT id, version_no, version_label, title, source_type, source_file_url, source_file_name,
            change_context, char_count, created_at, uploaded_by_name,
            (SELECT COUNT(*) FROM dp_wiki_followups f WHERE f.version_id = dp_wiki_versions.id) AS follower_count
       FROM dp_wiki_versions
      WHERE page_id = ?
      ORDER BY version_no DESC`
  ).bind(page.id).all()).results || [];

  // Current version with content.
  const current = await env.DB.prepare(
    `SELECT id, version_no, version_label, title, content, source_type, source_file_url, source_file_name,
            change_context, char_count, created_at, uploaded_by_name
       FROM dp_wiki_versions WHERE page_id = ? AND version_no = ?`
  ).bind(page.id, page.current_version).first();

  // This user's follow-up state per version (status + personal memo).
  const uid = data.dpUser && data.dpUser.uid;
  const myFollowups = {};
  if (uid) {
    const fr = (await env.DB.prepare(
      `SELECT version_id, status, note FROM dp_wiki_followups WHERE page_id = ? AND user_id = ?`
    ).bind(page.id, uid).all()).results || [];
    fr.forEach(f => { myFollowups[f.version_id] = { status: f.status, note: f.note }; });
  }

  return json({ page, versions, current, my_followups: myFollowups });
}

export async function onRequestPost({ request, env, data }) {
  const url = new URL(request.url);
  await _ensureTables(env);

  // Per-change "변경 사유" memo upsert (view:wiki). Empty note → delete.
  if (url.searchParams.get('diff_note')) {
    const denied = requirePerm(data, 'view:wiki');
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const from = parseInt(body.from_version_id, 10);
    const to = parseInt(body.to_version_id, 10);
    const pageId = parseInt(body.page_id, 10);
    const rowKey = String(body.row_key || '').slice(0, 80);
    if (!from || !to || !pageId || !rowKey) return json({ error: 'from_version_id, to_version_id, page_id, row_key are required.' }, 400);
    const note = body.note != null ? String(body.note).slice(0, 2000) : '';
    const uid = data.dpUser && data.dpUser.uid;
    if (!note.trim()) {
      await env.DB.prepare(`DELETE FROM dp_wiki_diff_notes WHERE from_version_id = ? AND to_version_id = ? AND row_key = ?`)
        .bind(from, to, rowKey).run();
      return json({ ok: true, cleared: true });
    }
    await env.DB.prepare(
      `INSERT INTO dp_wiki_diff_notes
         (page_id, from_version_id, to_version_id, row_key, old_excerpt, new_excerpt, note, author_id, author_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(from_version_id, to_version_id, row_key)
       DO UPDATE SET note = excluded.note, old_excerpt = excluded.old_excerpt, new_excerpt = excluded.new_excerpt,
                     author_id = excluded.author_id, author_name = excluded.author_name, updated_at = datetime('now')`
    ).bind(pageId, from, to, rowKey,
           body.old_excerpt ? String(body.old_excerpt).slice(0, 400) : null,
           body.new_excerpt ? String(body.new_excerpt).slice(0, 400) : null,
           note, uid, _uploaderName(data.dpUser)).run();
    return json({ ok: true });
  }

  // Follow-up / personal memo upsert — only needs view:wiki (you can follow
  // anything you can read).
  if (url.searchParams.get('followup')) {
    const denied = requirePerm(data, 'view:wiki');
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const versionId = parseInt(body.version_id, 10);
    const pageId = parseInt(body.page_id, 10);
    if (!versionId || !pageId) return json({ error: 'version_id and page_id are required.' }, 400);
    const status = body.status === 'acknowledged' ? 'acknowledged' : 'following';
    const note = body.note != null ? String(body.note).slice(0, 4000) : null;
    const uid = data.dpUser && data.dpUser.uid;
    if (!uid) return json({ error: 'Authentication required.' }, 401);
    // Clearing removes the follow-up row entirely.
    if (body.clear) {
      await env.DB.prepare(`DELETE FROM dp_wiki_followups WHERE version_id = ? AND user_id = ?`)
        .bind(versionId, uid).run();
      return json({ ok: true, cleared: true });
    }
    await env.DB.prepare(
      `INSERT INTO dp_wiki_followups (version_id, page_id, user_id, user_name, status, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(version_id, user_id)
       DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = datetime('now')`
    ).bind(versionId, pageId, uid, _uploaderName(data.dpUser), status, note).run();
    return json({ ok: true });
  }

  // Create page / append version.
  const denied = requirePerm(data, 'write:wiki');
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const content = String(body.content || '');
  if (!title) return json({ error: 'Title is required.' }, 400);
  if (!content) return json({ error: 'Content is empty — nothing to save.' }, 400);

  const slug = _slug(title);
  const baseTitle = _baseTitle(title);
  // Prefer a caller-supplied label, else parse from the filename/title.
  const versionLabel = (body.version_label && String(body.version_label).trim()) || _versionLabel(title);
  const sourceType = ['pdf', 'docx', 'manual'].includes(body.source_type) ? body.source_type : 'manual';
  const sourceFile = body.source_file || {};
  const sourceUrl = sourceFile.url ? String(sourceFile.url) : null;
  const sourceName = sourceFile.name ? String(sourceFile.name) : null;
  const changeContext = body.change_context != null ? String(body.change_context).slice(0, 4000) : null;
  const category = body.category != null ? String(body.category).slice(0, 120) : null;
  const charCount = content.replace(/<[^>]*>/g, '').length;
  const uid = data.dpUser && data.dpUser.uid;
  const uname = _uploaderName(data.dpUser);

  // Identity resolution: an explicit attach_page_id wins (manual "this is a new
  // version of X"); otherwise group by base slug (version suffix stripped).
  const attachId = parseInt(body.attach_page_id, 10);
  let existing = null;
  if (attachId) {
    existing = await env.DB.prepare(`SELECT * FROM dp_wiki_pages WHERE id = ?`).bind(attachId).first();
    if (!existing) return json({ error: '연결할 문서를 찾을 수 없습니다.' }, 404);
  } else {
    existing = await env.DB.prepare(`SELECT * FROM dp_wiki_pages WHERE slug = ?`).bind(slug).first();
  }

  if (existing) {
    const nextVer = Number(existing.current_version || 0) + 1;
    // version.title keeps the FULL uploaded name (e.g. "..._v1.2_DRAFT") so the
    // timeline shows where each version came from; page.title stays the base.
    const ins = await env.DB.prepare(
      `INSERT INTO dp_wiki_versions
         (page_id, version_no, version_label, title, content, source_type, source_file_url, source_file_name,
          change_context, char_count, uploaded_by_id, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(existing.id, nextVer, versionLabel, title, content, sourceType, sourceUrl, sourceName,
           changeContext, charCount, uid, uname).run();
    await env.DB.prepare(
      `UPDATE dp_wiki_pages SET current_version = ?, category = COALESCE(?, category),
              updated_at = datetime('now') WHERE id = ?`
    ).bind(nextVer, category, existing.id).run();
    return json({ ok: true, page_id: existing.id, version_id: ins.meta.last_row_id, version_no: nextVer, is_new_page: false, attached_to: existing.title });
  }

  const pageIns = await env.DB.prepare(
    `INSERT INTO dp_wiki_pages (slug, title, category, current_version, created_by_id, created_by_name)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).bind(slug, baseTitle, category, uid, uname).run();
  const pageId = pageIns.meta.last_row_id;
  const verIns = await env.DB.prepare(
    `INSERT INTO dp_wiki_versions
       (page_id, version_no, version_label, title, content, source_type, source_file_url, source_file_name,
        change_context, char_count, uploaded_by_id, uploaded_by_name)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(pageId, versionLabel, title, content, sourceType, sourceUrl, sourceName, changeContext, charCount, uid, uname).run();
  return json({ ok: true, page_id: pageId, version_id: verIns.meta.last_row_id, version_no: 1, is_new_page: true });
}

export async function onRequestPut({ request, env, data }) {
  await _ensureTables(env);
  const url = new URL(request.url);
  const versionId = parseInt(url.searchParams.get('version_id') || '', 10);
  if (!versionId) return json({ error: 'version_id is required.' }, 400);

  const v = await env.DB.prepare(`SELECT * FROM dp_wiki_versions WHERE id = ?`).bind(versionId).first();
  if (!v) return json({ error: 'Version not found.' }, 404);

  // write:wiki OR the uploader of this version may edit it in place.
  const uid = data.dpUser && data.dpUser.uid;
  const isUploader = uid && Number(v.uploaded_by_id) === Number(uid);
  if (!hasPerm(data.dpUser, 'write:wiki') && !isUploader) {
    return json({ error: 'You do not have permission to edit this wiki version.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const title = body.title != null ? String(body.title).trim() : v.title;
  const content = body.content != null ? String(body.content) : v.content;
  const changeContext = body.change_context != null ? String(body.change_context).slice(0, 4000) : v.change_context;
  if (!title) return json({ error: 'Title cannot be empty.' }, 400);
  if (!content) return json({ error: 'Content cannot be empty.' }, 400);
  const charCount = content.replace(/<[^>]*>/g, '').length;
  // Allow explicit version_label override; else keep existing, else parse title.
  const versionLabel = body.version_label !== undefined
    ? (body.version_label ? String(body.version_label).trim() : null)
    : (v.version_label || _versionLabel(title));

  await env.DB.prepare(
    `UPDATE dp_wiki_versions SET title = ?, version_label = ?, content = ?, change_context = ?, char_count = ? WHERE id = ?`
  ).bind(title, versionLabel, content, changeContext, charCount, versionId).run();

  // If this is the page's current version, keep page title/updated_at in sync.
  const page = await env.DB.prepare(`SELECT * FROM dp_wiki_pages WHERE id = ?`).bind(v.page_id).first();
  if (page && Number(page.current_version) === Number(v.version_no)) {
    await env.DB.prepare(`UPDATE dp_wiki_pages SET title = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(title, v.page_id).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const denied = requireAdmin(data);
  if (denied) return denied;
  await _ensureTables(env);
  const url = new URL(request.url);
  const pageId = parseInt(url.searchParams.get('page_id') || '', 10);
  if (!pageId) return json({ error: 'page_id is required.' }, 400);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM dp_wiki_followups WHERE page_id = ?`).bind(pageId),
    env.DB.prepare(`DELETE FROM dp_wiki_diff_notes WHERE page_id = ?`).bind(pageId),
    env.DB.prepare(`DELETE FROM dp_wiki_comments WHERE page_id = ?`).bind(pageId),
    env.DB.prepare(`DELETE FROM dp_wiki_versions WHERE page_id = ?`).bind(pageId),
    env.DB.prepare(`DELETE FROM dp_wiki_pages WHERE id = ?`).bind(pageId),
  ]);
  return json({ ok: true });
}
