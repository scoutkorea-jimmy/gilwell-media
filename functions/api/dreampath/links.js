/**
 * Dreampath · Traceability links (PMO)
 *
 * Generic bidirectional links between any two entities so a PMO can trace
 * document ↔ decision ↔ risk ↔ issue ↔ task ↔ meeting-minute.
 *
 * GET    /api/dreampath/links?type=wiki&id=5   — links touching this entity (other side resolved)
 * POST   /api/dreampath/links                  — { a_type,a_id,b_type,b_id } create (idempotent)
 * DELETE /api/dreampath/links?id=N             — remove a link
 *
 * Any authenticated Dreampath user may read/manage links (low-risk metadata;
 * the middleware already authenticates). A pair is stored once, normalized so
 * (wiki,5)-(task,3) and (task,3)-(wiki,5) collapse to one row.
 */

// Entity type → table + how to route on the client. Whitelist guards SQL.
const ENTITY = {
  wiki:     { table: 'dp_wiki_pages' },
  decision: { table: 'dp_decisions' },
  risk:     { table: 'dp_risks' },
  note:     { table: 'dp_notes' },
  task:     { table: 'dp_tasks' },
  post:     { table: 'dp_board_posts', extra: 'board' },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function _ensureTable(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS dp_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      a_type TEXT NOT NULL, a_id INTEGER NOT NULL,
      b_type TEXT NOT NULL, b_id INTEGER NOT NULL,
      created_by_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(a_type, a_id, b_type, b_id)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_links_a ON dp_links(a_type, a_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_links_b ON dp_links(b_type, b_id)`),
  ]);
}

// Normalize a pair so it stores once regardless of argument order.
function _norm(at, ai, bt, bi) {
  const a = at + ':' + ai, b = bt + ':' + bi;
  return a <= b ? { a_type: at, a_id: ai, b_type: bt, b_id: bi }
                : { a_type: bt, a_id: bi, b_type: at, b_id: ai };
}

// Resolve titles for a set of {type,id} refs, batched per type.
async function _resolveTitles(env, refs) {
  const byType = {};
  refs.forEach(r => { (byType[r.type] = byType[r.type] || []).push(Number(r.id)); });
  const titles = {};
  for (const [type, ids] of Object.entries(byType)) {
    const ent = ENTITY[type];
    if (!ent || !ids.length) continue;
    const ph = ids.map(() => '?').join(',');
    const cols = 'id, title' + (ent.extra ? ', ' + ent.extra : '');
    const rows = (await env.DB.prepare(`SELECT ${cols} FROM ${ent.table} WHERE id IN (${ph})`).bind(...ids).all()).results || [];
    rows.forEach(row => { titles[type + ':' + row.id] = row; });
  }
  return titles;
}

export async function onRequestGet({ request, env, data }) {
  if (!data || !data.dpUser) return json({ error: 'Authentication required.' }, 401);
  await _ensureTable(env);
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!ENTITY[type] || !id) return json({ error: 'Valid type and id are required.' }, 400);

  const rows = (await env.DB.prepare(
    `SELECT id, a_type, a_id, b_type, b_id, created_by_name, created_at FROM dp_links
      WHERE (a_type = ? AND a_id = ?) OR (b_type = ? AND b_id = ?)
      ORDER BY created_at DESC`
  ).bind(type, id, type, id).all()).results || [];

  // The "other" side of each link.
  const others = rows.map(r => (r.a_type === type && Number(r.a_id) === id)
    ? { type: r.b_type, id: r.b_id, link_id: r.id }
    : { type: r.a_type, id: r.a_id, link_id: r.id });
  const titles = await _resolveTitles(env, others);
  const links = others.map(o => {
    const meta = titles[o.type + ':' + o.id];
    return {
      link_id: o.link_id, type: o.type, id: o.id,
      title: meta ? meta.title : '(삭제됨)',
      board: meta ? meta.board : undefined,
      missing: !meta,
    };
  });
  return json({ links });
}

export async function onRequestPost({ request, env, data }) {
  if (!data || !data.dpUser) return json({ error: 'Authentication required.' }, 401);
  await _ensureTable(env);
  const body = await request.json().catch(() => ({}));
  const at = body.a_type, ai = parseInt(body.a_id, 10);
  const bt = body.b_type, bi = parseInt(body.b_id, 10);
  if (!ENTITY[at] || !ENTITY[bt] || !ai || !bi) return json({ error: 'Valid a_type/a_id and b_type/b_id are required.' }, 400);
  if (at === bt && ai === bi) return json({ error: '같은 항목끼리는 연결할 수 없습니다.' }, 400);
  const n = _norm(at, ai, bt, bi);
  const uname = String((data.dpUser.name || data.dpUser.username) || '');
  await env.DB.prepare(
    `INSERT INTO dp_links (a_type, a_id, b_type, b_id, created_by_name)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(a_type, a_id, b_type, b_id) DO NOTHING`
  ).bind(n.a_type, n.a_id, n.b_type, n.b_id, uname).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, data }) {
  if (!data || !data.dpUser) return json({ error: 'Authentication required.' }, 401);
  await _ensureTable(env);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);
  if (!id) return json({ error: 'id is required.' }, 400);
  await env.DB.prepare(`DELETE FROM dp_links WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
