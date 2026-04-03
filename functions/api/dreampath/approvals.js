/**
 * Dreampath · Post Approvals (Meeting Minutes multi-approver voting)
 * GET  /api/dreampath/approvals?post_id=N         — list approvals
 * PUT  /api/dreampath/approvals?post_id=N&approver=NAME — vote or admin override
 *      body: { status: 'approved'|'rejected'|'pending', override_note?: '...' }
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const CUTOFF = '2026-04-01';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const postId = parseInt(url.searchParams.get('post_id') || '', 10);
  if (!postId) return json({ error: 'post_id is required.' }, 400);
  const rows = await env.DB.prepare(
    `SELECT id, approver_name, status, voted_at, override_by, override_note, created_at
       FROM dp_post_approvals WHERE post_id = ? ORDER BY created_at ASC`
  ).bind(postId).all();
  return json({ approvals: rows.results || [] });
}

export async function onRequestPut({ request, env, data }) {
  const url = new URL(request.url);
  const postId = parseInt(url.searchParams.get('post_id') || '', 10);
  const approverName = decodeURIComponent(url.searchParams.get('approver') || '').trim();
  if (!postId || !approverName) return json({ error: 'post_id and approver are required.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { status: newStatus, override_note } = body;
  if (!['approved', 'rejected', 'pending'].includes(newStatus)) {
    return json({ error: 'status must be approved, rejected, or pending' }, 400);
  }

  const isAdmin = data.dpUser.role === 'admin';
  const userDisplayName = String(data.dpUser.name || '').trim().toLowerCase();
  const userUsername    = String(data.dpUser.username || '').trim().toLowerCase();
  const isOwnVote = [userDisplayName, userUsername].includes(approverName.toLowerCase());

  if (!isOwnVote && !isAdmin) {
    return json({ error: 'You can only vote for yourself.' }, 403);
  }

  const approval = await env.DB.prepare(
    `SELECT id, status FROM dp_post_approvals WHERE post_id = ? AND approver_name = ?`
  ).bind(postId, approverName).first();
  if (!approval) return json({ error: 'Approver not assigned to this post.' }, 404);

  const post = await env.DB.prepare(
    `SELECT title, created_at FROM dp_board_posts WHERE id = ?`
  ).bind(postId).first();
  if (!post) return json({ error: 'Post not found.' }, 404);

  const isPreCutoff = post.created_at.slice(0, 10) < CUTOFF;
  const isAdminOverride = !isOwnVote && isAdmin;

  if (isAdminOverride && !isPreCutoff) {
    return json({ error: 'Admin vote override is only allowed for minutes created before April 1, 2026.' }, 403);
  }

  await env.DB.prepare(
    `UPDATE dp_post_approvals SET status = ?, voted_at = datetime('now'), override_by = ?, override_note = ? WHERE id = ?`
  ).bind(
    newStatus,
    isAdminOverride ? data.dpUser.name : null,
    isAdminOverride ? (override_note ? override_note.trim().slice(0, 300) : null) : null,
    approval.id
  ).run();

  // Recompute post approval_status
  const all = await env.DB.prepare(
    `SELECT status FROM dp_post_approvals WHERE post_id = ?`
  ).bind(postId).all();
  const rows = all.results || [];
  const total = rows.length;
  const approvedCount = rows.filter(r => r.status === 'approved').length;
  const newPostStatus = (total > 0 && approvedCount > total / 2) ? 'approved' : 'pending';
  await env.DB.prepare(
    `UPDATE dp_board_posts SET approval_status = ? WHERE id = ?`
  ).bind(newPostStatus, postId).run();

  // Log to post history
  const prevStatus = approval.status;
  const logNote = isAdminOverride
    ? `[Admin Override] ${data.dpUser.name} changed ${approverName}'s vote from '${prevStatus}' to '${newStatus}'${override_note ? ': ' + override_note.trim() : ''}`
    : `[Approval] ${approverName} voted ${newStatus}`;
  await env.DB.prepare(
    `INSERT INTO dp_post_history (post_id, editor_name, prev_title, prev_content, edit_note) VALUES (?, ?, ?, ?, ?)`
  ).bind(postId, data.dpUser.name, post.title || '', null, logNote).run();

  return json({ ok: true, approval_status: newPostStatus, approved_count: approvedCount, total });
}
