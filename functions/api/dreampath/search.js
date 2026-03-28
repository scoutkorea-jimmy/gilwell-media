function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim();
  if (!q) return json({ query: '', results: [] });

  const like = '%' + q + '%';
  const compact = '%' + q.replace(/\s+/g, '') + '%';

  const [postRows, taskRows, noteRows, commentRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, board, title, created_at, updated_at,
              CASE
                WHEN title LIKE ? THEN 60
                WHEN replace(COALESCE(title, ''), ' ', '') LIKE ? THEN 45
                WHEN COALESCE(content, '') LIKE ? THEN 20
                ELSE 5
              END AS score
         FROM dp_board_posts
        WHERE title LIKE ?
           OR COALESCE(content, '') LIKE ?
           OR replace(COALESCE(title, ''), ' ', '') LIKE ?
        ORDER BY score DESC, datetime(updated_at) DESC
        LIMIT 8`
    ).bind(like, compact, like, like, like, compact).all(),
    env.DB.prepare(
      `SELECT id, title, assignee, due_date, updated_at,
              CASE
                WHEN title LIKE ? THEN 55
                WHEN COALESCE(description, '') LIKE ? THEN 25
                WHEN COALESCE(assignee, '') LIKE ? THEN 20
                ELSE 5
              END AS score
         FROM dp_tasks
        WHERE title LIKE ? OR COALESCE(description, '') LIKE ? OR COALESCE(assignee, '') LIKE ?
        ORDER BY score DESC, datetime(updated_at) DESC
        LIMIT 8`
    ).bind(like, like, like, like, like, like).all(),
    env.DB.prepare(
      `SELECT id, title, type, status, updated_at,
              CASE
                WHEN title LIKE ? THEN 55
                WHEN COALESCE(content, '') LIKE ? THEN 25
                ELSE 5
              END AS score
         FROM dp_notes
        WHERE title LIKE ? OR COALESCE(content, '') LIKE ?
        ORDER BY score DESC, datetime(updated_at) DESC
        LIMIT 8`
    ).bind(like, like, like, like).all(),
    env.DB.prepare(
      `SELECT c.id, c.post_id, c.content, c.author_name, c.created_at, p.title,
              CASE
                WHEN COALESCE(c.content, '') LIKE ? THEN 35
                WHEN COALESCE(p.title, '') LIKE ? THEN 15
                ELSE 5
              END AS score
         FROM dp_post_comments c
         JOIN dp_board_posts p ON p.id = c.post_id
        WHERE COALESCE(c.content, '') LIKE ? OR COALESCE(p.title, '') LIKE ?
        ORDER BY score DESC, datetime(c.created_at) DESC
        LIMIT 8`
    ).bind(like, like, like, like).all(),
  ]);

  const results = []
    .concat((postRows.results || []).map(function (item) {
      return {
        kind: 'post',
        id: item.id,
        title: item.title || '',
        subtitle: item.board || '',
        meta: item.updated_at || item.created_at || '',
        score: item.score || 0,
      };
    }))
    .concat((taskRows.results || []).map(function (item) {
      return {
        kind: 'task',
        id: item.id,
        title: item.title || '',
        subtitle: item.assignee ? '담당: ' + item.assignee : 'Task',
        meta: item.due_date || item.updated_at || '',
        score: item.score || 0,
      };
    }))
    .concat((noteRows.results || []).map(function (item) {
      return {
        kind: 'note',
        id: item.id,
        title: item.title || '',
        subtitle: item.type || 'note',
        meta: item.updated_at || '',
        score: item.score || 0,
      };
    }))
    .concat((commentRows.results || []).map(function (item) {
      return {
        kind: 'comment',
        id: item.id,
        title: item.title || 'Comment',
        subtitle: item.author_name ? item.author_name + ' comment' : 'Comment',
        meta: item.created_at || '',
        score: item.score || 0,
      };
    }))
    .sort(function (a, b) {
      return (b.score || 0) - (a.score || 0) || String(b.meta || '').localeCompare(String(a.meta || ''));
    })
    .slice(0, 16);

  return json({ query: q, results });
}

