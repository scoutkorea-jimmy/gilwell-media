/**
 * Dreampath · Tasks (Schedule)
 * GET    /api/dreampath/tasks             — list all  (view:tasks)
 * POST   /api/dreampath/tasks             — create    (write:tasks)
 * PUT    /api/dreampath/tasks?id=N        — update    (write:tasks)
 * DELETE /api/dreampath/tasks?id=N        — delete    (write:tasks)
 */

import { requirePerm } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_STATUSES   = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'normal', 'high'];

export async function onRequestGet({ env, data }) {
  const denied = requirePerm(data, 'view:tasks'); if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT id, title, description, assignee, status, priority, due_date, sort_order, created_at, updated_at
       FROM dp_tasks
      ORDER BY status ASC, sort_order ASC, created_at ASC`
  ).all();
  return json({ tasks: rows.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  const denied = requirePerm(data, 'write:tasks'); if (denied) return denied;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { title, description, assignee, status, priority, due_date } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return json({ error: '제목을 입력해주세요.' }, 400);
  }

  const safeTitle       = title.trim().slice(0, 200);
  const safeDescription = description ? description.trim().slice(0, 2000) : null;
  const safeAssignee    = assignee ? assignee.trim().slice(0, 50) : null;
  const safeStatus      = VALID_STATUSES.includes(status) ? status : 'todo';
  const safePriority    = VALID_PRIORITIES.includes(priority) ? priority : 'normal';
  const safeDueDate     = due_date ? due_date.trim().slice(0, 20) : null;

  const maxOrder = await env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) as m FROM dp_tasks WHERE status = ?`
  ).bind(safeStatus).first();
  const sortOrder = (maxOrder?.m || 0) + 1;

  const result = await env.DB.prepare(
    `INSERT INTO dp_tasks (title, description, assignee, status, priority, due_date, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(safeTitle, safeDescription, safeAssignee, safeStatus, safePriority, safeDueDate, sortOrder).run();

  return json({ id: result.meta.last_row_id, ok: true });
}

export async function onRequestPut({ request, env, data }) {
  const denied = requirePerm(data, 'write:tasks'); if (denied) return denied;
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id가 필요합니다.' }, 400);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const fields = [];
  const values = [];

  if (body.title !== undefined) {
    fields.push('title = ?');
    values.push(body.title.trim().slice(0, 200));
  }
  if (body.description !== undefined) {
    fields.push('description = ?');
    values.push(body.description ? body.description.trim().slice(0, 2000) : null);
  }
  if (body.assignee !== undefined) {
    fields.push('assignee = ?');
    values.push(body.assignee ? body.assignee.trim().slice(0, 50) : null);
  }
  if (body.status !== undefined && VALID_STATUSES.includes(body.status)) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (body.priority !== undefined && VALID_PRIORITIES.includes(body.priority)) {
    fields.push('priority = ?');
    values.push(body.priority);
  }
  if (body.due_date !== undefined) {
    fields.push('due_date = ?');
    values.push(body.due_date ? body.due_date.trim().slice(0, 20) : null);
  }

  if (fields.length === 0) return json({ error: '변경할 내용이 없습니다.' }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(
    `UPDATE dp_tasks SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  const denied = requirePerm(data, 'write:tasks'); if (denied) return denied;
  const url = new URL(request.url);
  const id  = parseInt(url.searchParams.get('id') || '', 10);
  if (!id || isNaN(id)) return json({ error: 'id가 필요합니다.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_tasks WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
