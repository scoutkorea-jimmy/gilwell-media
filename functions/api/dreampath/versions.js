/**
 * Dreampath · Version History
 *
 * GET    /api/dreampath/versions         — list all versions
 * POST   /api/dreampath/versions         — add new version (admin only)
 *          body: { type: 'feature'|'bugfix', description: '...' }
 *          Server auto-calculates the new version number:
 *            feature → aa.bbb+1.00  (cc resets to 0)
 *            bugfix  → aa.bbb.cc+1
 */

import { requirePerm, requireAdmin } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function formatVersion(aa, bbb, cc) {
  return `${pad(aa, 2)}.${pad(bbb, 3)}.${pad(cc, 2)}`;
}

export async function onRequestGet({ env, data }) {
  const denied = requirePerm(data, 'view:versions'); if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT id, version, aa, bbb, cc, type, description, released_at
       FROM dp_versions
      ORDER BY aa DESC, bbb DESC, cc DESC, id DESC`
  ).all();
  return json({ versions: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (data.dpUser.role !== 'admin') {
    return json({ error: 'Admin access required.' }, 403);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { type, description } = body;
  const validTypes = ['feature', 'bugfix'];
  if (!validTypes.includes(type)) {
    return json({ error: 'type must be "feature" or "bugfix".' }, 400);
  }
  if (!description || !description.trim()) {
    return json({ error: 'description is required.' }, 400);
  }

  // Get the latest version to calculate the next one
  const latest = await env.DB.prepare(
    `SELECT aa, bbb, cc FROM dp_versions ORDER BY released_at DESC, id DESC LIMIT 1`
  ).first();

  const curAA  = latest?.aa  ?? 1;
  const curBBB = latest?.bbb ?? 0;
  const curCC  = latest?.cc  ?? 0;

  let newAA  = curAA;
  let newBBB = curBBB;
  let newCC  = curCC;

  if (type === 'feature') {
    newBBB = curBBB + 1;
    newCC  = 0;
  } else {
    // bugfix
    newCC = curCC + 1;
  }

  const version = formatVersion(newAA, newBBB, newCC);

  const result = await env.DB.prepare(
    `INSERT INTO dp_versions (version, aa, bbb, cc, type, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(version, newAA, newBBB, newCC, type, description.trim().slice(0, 1000)).run();

  return json({ id: result.meta.last_row_id, version, ok: true });
}

