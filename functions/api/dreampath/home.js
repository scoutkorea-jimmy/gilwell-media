function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ env, data }) {
  const user = data && data.dpUser ? data.dpUser : null;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const matchNames = [String(user.name || '').trim(), String(user.username || '').trim()]
    .filter(Boolean)
    .map(function (value) { return value.toLowerCase(); });

  // Determine which boards this user can access
  const isAdmin = user.role === 'admin';
  let accessibleBoards = [];
  try {
    const boardRows = await env.DB.prepare(`SELECT slug, board_type FROM dp_boards`).all();
    const allBoards = boardRows.results || [];
    if (isAdmin) {
      accessibleBoards = allBoards.map(function (b) { return b.slug; });
    } else {
      const u = await env.DB.prepare(`SELECT department FROM dp_users WHERE id = ?`).bind(user.uid).first();
      const dept = (u && u.department || '').toLowerCase();
      accessibleBoards = allBoards.filter(function (b) {
        if (b.board_type !== 'team') return true; // non-team boards are accessible to all
        var country = b.slug.slice(5); // team_xxx -> xxx
        return dept.includes(country);
      }).map(function (b) { return b.slug; });
    }
  } catch (e) {
    // Fallback: show all non-team boards
    accessibleBoards = ['announcements', 'documents', 'minutes'];
  }

  // Build SQL IN clause for accessible boards
  const boardPlaceholders = accessibleBoards.map(function () { return '?'; }).join(',');

  const [taskRows, noteRows, postHistoryRows, eventHistoryRows, commentRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, assignee, status, priority, due_date, updated_at
         FROM dp_tasks
        ORDER BY
          CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
          CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
          COALESCE(due_date, '9999-12-31') ASC,
          datetime(updated_at) DESC
        LIMIT 30`
    ).all(),
    env.DB.prepare(
      `SELECT id, title, type, status, priority, updated_at
         FROM dp_notes
        ORDER BY
          CASE status WHEN 'open' THEN 0 ELSE 1 END,
          CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
          datetime(updated_at) DESC
        LIMIT 20`
    ).all(),
    env.DB.prepare(
      `SELECT h.post_id, h.editor_name, h.edit_note, h.edited_at, p.title, p.board
         FROM dp_post_history h
         JOIN dp_board_posts p ON p.id = h.post_id
        WHERE p.board IN (${boardPlaceholders})
        ORDER BY datetime(h.edited_at) DESC, h.id DESC
        LIMIT 12`
    ).bind(...accessibleBoards).all(),
    env.DB.prepare(
      `SELECT h.event_id, h.editor_name, h.edit_note, h.edited_at, e.title
         FROM dp_event_history h
         JOIN dp_events e ON e.id = h.event_id
        ORDER BY datetime(h.edited_at) DESC, h.id DESC
        LIMIT 12`
    ).all(),
    env.DB.prepare(
      `SELECT c.id, c.post_id, c.author_name, c.content, c.created_at, p.title, p.board
         FROM dp_post_comments c
         JOIN dp_board_posts p ON p.id = c.post_id
        WHERE p.board IN (${boardPlaceholders})
        ORDER BY datetime(c.created_at) DESC, c.id DESC
        LIMIT 12`
    ).bind(...accessibleBoards).all(),
  ]);

  const tasks = (taskRows.results || []);
  const notes = (noteRows.results || []);
  const myTasks = tasks.filter(function (task) {
    const assignee = String(task.assignee || '').trim().toLowerCase();
    return assignee && matchNames.indexOf(assignee) >= 0;
  }).slice(0, 6);

  const alerts = []
    .concat(buildTaskAlerts(myTasks))
    .concat(buildNoteAlerts(notes))
    .slice(0, 8);

  const recentChanges = []
    .concat((postHistoryRows.results || []).map(function (item) {
      return {
        kind: 'post',
        title: item.title || '',
        meta: item.editor_name || '',
        note: item.edit_note || '',
        created_at: item.edited_at || '',
      };
    }))
    .concat((eventHistoryRows.results || []).map(function (item) {
      return {
        kind: 'event',
        title: item.title || '',
        meta: item.editor_name || '',
        note: item.edit_note || '',
        created_at: item.edited_at || '',
      };
    }))
    .concat((commentRows.results || []).map(function (item) {
      return {
        kind: 'comment',
        title: item.title || '',
        meta: item.author_name || '',
        note: item.content || '',
        created_at: item.created_at || '',
      };
    }))
    .sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    })
    .slice(0, 30);

  return json({
    alerts,
    my_tasks: myTasks,
    recent_changes: recentChanges,
  });
}

function buildTaskAlerts(tasks) {
  return tasks.reduce(function (acc, item) {
    const due = String(item.due_date || '').trim();
    if (!due) return acc;
    const days = diffDaysFromToday(due);
    if (days < 0) {
      acc.push({ kind: 'task_overdue', label: '기한 지남', title: item.title || '', meta: due });
      return acc;
    }
    if (days <= 3 && item.status !== 'done') {
      acc.push({ kind: 'task_due_soon', label: '마감 임박', title: item.title || '', meta: due });
    }
    return acc;
  }, []);
}

function buildNoteAlerts(notes) {
  return notes
    .filter(function (item) { return item.status === 'open' && item.priority === 'high'; })
    .slice(0, 4)
    .map(function (item) {
      return {
        kind: 'high_priority_note',
        label: '중요 메모',
        title: item.title || '',
        meta: item.type || 'note',
      };
    });
}

function diffDaysFromToday(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateText || '')) return 9999;
  const today = new Date();
  const start = new Date(dateText.slice(0, 10) + 'T00:00:00');
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((start.getTime() - current.getTime()) / 86400000);
}

