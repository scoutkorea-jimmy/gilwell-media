import { requirePerm } from '../../_shared/dreampath-perm.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ env, data }) {
  const denied = requirePerm(data, 'view:home'); if (denied) return denied;
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

  // Current month window (UTC-based date arithmetic; calendar renders in local tz
  // but month boundaries only need to be close enough for filtering).
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const nextMonthStart = month === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 2).padStart(2, '0')}-01`;
  const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sevenDaysLater = new Date(year, month, now.getDate() + 7);
  const weekEnd = `${sevenDaysLater.getFullYear()}-${String(sevenDaysLater.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysLater.getDate()).padStart(2, '0')}`;

  const [
    taskRows,
    noteRows,
    postHistoryRows,
    eventHistoryRows,
    commentRows,
    eventRows,
    pendingApprovalRows,
  ] = await Promise.all([
    (matchNames.length
      ? env.DB.prepare(
          `SELECT id, title, assignee, status, priority, due_date, updated_at
             FROM dp_tasks
            WHERE LOWER(TRIM(COALESCE(assignee, ''))) IN (${matchNames.map(() => '?').join(',')})
            ORDER BY
              CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
              CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
              COALESCE(due_date, '9999-12-31') ASC,
              datetime(updated_at) DESC
            LIMIT 30`
        ).bind(...matchNames).all()
      : Promise.resolve({ results: [] })),
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
          AND datetime(h.edited_at) >= datetime('now', '-1 day')
        ORDER BY datetime(h.edited_at) DESC, h.id DESC
        LIMIT 12`
    ).bind(...accessibleBoards).all(),
    env.DB.prepare(
      `SELECT h.event_id, h.editor_name, h.edit_note, h.edited_at, e.title
         FROM dp_event_history h
         JOIN dp_events e ON e.id = h.event_id
        WHERE datetime(h.edited_at) >= datetime('now', '-1 day')
        ORDER BY datetime(h.edited_at) DESC, h.id DESC
        LIMIT 12`
    ).all(),
    env.DB.prepare(
      `SELECT c.id, c.post_id, c.author_name, c.content, c.created_at, p.title, p.board
         FROM dp_post_comments c
         JOIN dp_board_posts p ON p.id = c.post_id
        WHERE p.board IN (${boardPlaceholders})
          AND datetime(c.created_at) >= datetime('now', '-1 day')
        ORDER BY datetime(c.created_at) DESC, c.id DESC
        LIMIT 12`
    ).bind(...accessibleBoards).all(),
    // [CASE STUDY 2026-04-24 — events_current_month shape contract]
    // Symptom (risk): Calendar renders blank colors / missing times on first
    //                 home paint because `renderCalendar()` in dreampath.js
    //                 expects `type` / `start_time` / `end_time` fields.
    // Root cause: Draft of this query used `event_type` (DB column name in
    //             a sibling API) and omitted `start_time` / `end_time`.
    //             renderCalendar() would receive `undefined` and silently
    //             fall back to default color / skip time labels.
    // Lesson: This SELECT must mirror the projection of /api/dreampath/events
    //         byte-for-byte. If that sibling API adds or renames fields, this
    //         query must follow or renderCalendar breaks on initial paint
    //         only (and works after the month switch fallback — the worst
    //         kind of bug: works in dev, fails on first load).
    // Ref: DREAMPATH.md Section 9.3, DREAMPATH-HISTORY.md 2026-04-24 · D.
    env.DB.prepare(
      `SELECT id, title, start_date, end_date, start_time, end_time, type,
              description, recurrence_type, recurrence_end, created_at
         FROM dp_events
        WHERE (end_date >= ? OR start_date >= ?)
          AND start_date < ?
        ORDER BY start_date ASC, id ASC
        LIMIT 200`
    ).bind(monthStart, monthStart, nextMonthStart).all(),
    // [CASE STUDY 2026-04-24 — pending approvals matching contract]
    // Symptom (risk): A user with `display_name = "Jimmy Park"` but
    //                 `username = "jimmy"` could be assigned as approver
    //                 under either form, yet this query would miss one.
    // Root cause: `dp_post_approvals.approver_name` is a free-form string set
    //             at approver-assignment time. Historically it could be the
    //             display name OR the username. Matching one form only would
    //             hide pending approvals from the home strip.
    // Lesson: Always match against BOTH `data.dpUser.name` (display name) AND
    //         `data.dpUser.username`, lowercased. If the schema ever
    //         normalizes `approver_name` to a single form, revisit this.
    //         Also filter by `p.approval_status != 'approved'` — an already-
    //         locked post should not surface "you need to vote" nagging.
    // Ref: DREAMPATH.md Section 8.3, 12 B5, DREAMPATH-HISTORY.md 2026-04-24 · D.
    (matchNames.length
      ? env.DB.prepare(
          `SELECT a.post_id, a.approver_name, a.status AS my_status,
                  p.title, p.board, p.created_at AS post_created_at, p.approval_status
             FROM dp_post_approvals a
             JOIN dp_board_posts p ON p.id = a.post_id
            WHERE LOWER(a.approver_name) IN (${matchNames.map(() => '?').join(',')})
              AND a.status = 'pending'
              AND (p.approval_status IS NULL OR p.approval_status != 'approved')
            ORDER BY datetime(p.created_at) DESC
            LIMIT 10`
        ).bind(...matchNames).all()
      : Promise.resolve({ results: [] })),
  ]);

  const tasks = (taskRows.results || []);
  const notes = (noteRows.results || []);
  const myTasks = tasks.slice(0, 6);

  const alerts = []
    .concat(buildTaskAlerts(myTasks))
    .concat(buildNoteAlerts(notes))
    .slice(0, 8);

  const recentChanges = []
    .concat((postHistoryRows.results || []).map(function (item) {
      return {
        kind: 'post',
        ref_id: item.post_id,
        title: item.title || '',
        meta: item.editor_name || '',
        note: item.edit_note || '',
        created_at: item.edited_at || '',
      };
    }))
    .concat((eventHistoryRows.results || []).map(function (item) {
      return {
        kind: 'event',
        ref_id: item.event_id,
        title: item.title || '',
        meta: item.editor_name || '',
        note: item.edit_note || '',
        created_at: item.edited_at || '',
      };
    }))
    .concat((commentRows.results || []).map(function (item) {
      return {
        kind: 'comment',
        ref_id: item.post_id,
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

  // Today / week summary — fuel for the B1 "Today" strip on home top.
  const tasksDueToday = myTasks.filter(function (t) {
    return String(t.due_date || '').slice(0, 10) === todayStr && t.status !== 'done';
  }).length;
  const tasksOverdue = myTasks.filter(function (t) {
    const d = String(t.due_date || '').slice(0, 10);
    return d && d < todayStr && t.status !== 'done';
  }).length;
  const events = (eventRows.results || []);
  const meetingsThisWeek = events.filter(function (e) {
    const d = String(e.start_date || '').slice(0, 10);
    return d && d >= todayStr && d <= weekEnd;
  }).length;
  const pendingApprovals = (pendingApprovalRows.results || []).map(function (row) {
    return {
      post_id: row.post_id,
      approver_name: row.approver_name || '',
      title: row.title || '',
      board: row.board || '',
      post_created_at: row.post_created_at || '',
    };
  });
  const highPriorityNotes = notes.filter(function (n) {
    return n.status === 'open' && n.priority === 'high';
  }).length;

  return json({
    alerts,
    my_tasks: myTasks,
    recent_changes: recentChanges,
    today_summary: {
      tasks_due_today: tasksDueToday,
      tasks_overdue: tasksOverdue,
      meetings_this_week: meetingsThisWeek,
      pending_approvals: pendingApprovals.length,
      high_priority_notes: highPriorityNotes,
      today: todayStr,
    },
    events_current_month: events,
    pending_approvals: pendingApprovals,
  });
}

function buildTaskAlerts(tasks) {
  return tasks.reduce(function (acc, item) {
    const due = String(item.due_date || '').trim();
    if (!due) return acc;
    const days = diffDaysFromToday(due);
    if (days < 0) {
      acc.push({ kind: 'task_overdue', label: 'Overdue', title: item.title || '', meta: due, task_id: item.id, status: item.status });
      return acc;
    }
    if (days <= 3 && item.status !== 'done') {
      acc.push({ kind: 'task_due_soon', label: 'Due soon', title: item.title || '', meta: due, task_id: item.id, status: item.status });
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
        label: 'Priority note',
        title: item.title || '',
        meta: item.type || 'note',
        note_id: item.id,
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
