/**
 * Gilwell Media · /api/articles.ndjson
 *
 * Machine-readable export of recent public articles in Newline-Delimited
 * JSON (NDJSON) — one complete JSON object per line, streamable. Intended
 * audience:
 *   - LLM / RAG pipelines that want clean metadata without parsing HTML
 *   - Researchers studying Korean scouting media
 *   - Archival / citation systems (Perplexity, Elicit, etc.)
 *
 * Licensing: see /editorial-policy for attribution/reuse terms. We allow
 * summarization + citation with a URL link back to the original article.
 *
 * Query params:
 *   ?days=N   — window size in days (default 90, max 365)
 *   ?limit=N  — row cap (default 500, max 2000)
 *   ?category=korea|apr|wosm|people  — optional filter
 */

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const params = new URL(request.url).searchParams;

  const days = clampInt(params.get('days'), 1, 365, 90);
  const limit = clampInt(params.get('limit'), 1, 2000, 500);
  const categoryRaw = String(params.get('category') || '').trim().toLowerCase();
  const allowedCategories = new Set(['korea', 'apr', 'wosm', 'people']);
  const category = allowedCategories.has(categoryRaw) ? categoryRaw : null;

  let rows = [];
  try {
    const sql = `
      SELECT id, category, title, subtitle, author, meta_tags, tag,
             image_url, location_name, location_address, ai_assisted,
             publish_at, created_at, updated_at, views
        FROM posts
        WHERE published = 1
          AND COALESCE(publish_at, created_at) <= datetime('now')
          AND COALESCE(publish_at, created_at) >= datetime('now', ?)
          ${category ? 'AND category = ?' : ''}
        ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC
        LIMIT ?`;
    const binds = [`-${days} days`];
    if (category) binds.push(category);
    binds.push(limit);
    const rs = await env.DB.prepare(sql).bind(...binds).all();
    rows = Array.isArray(rs && rs.results) ? rs.results : [];
  } catch (err) {
    console.error('GET /api/articles.ndjson DB error:', err);
    return new Response('{"error":"internal_error"}\n', {
      status: 500,
      headers: { 'Content-Type': 'application/x-ndjson; charset=UTF-8' },
    });
  }

  const meta = {
    '@type': 'export_meta',
    publisher: 'BP미디어',
    publisher_url: origin,
    license: `${origin}/editorial-policy`,
    generated_at: new Date().toISOString(),
    window_days: days,
    category: category || 'all',
    row_count: rows.length,
    row_cap: limit,
    schema_hint: 'Each subsequent line is a JSON object representing one NewsArticle summary. Full article bodies are not included — fetch GET {url} for HTML or include the URL in your citation.',
  };

  const lines = [JSON.stringify(meta)];
  for (const row of rows) {
    const pubIso = toIsoString(row.publish_at || row.created_at);
    const modIso = toIsoString(row.updated_at || row.publish_at || row.created_at);
    const entry = {
      id: row.id,
      url: `${origin}/post/${row.id}`,
      category: row.category,
      title: row.title || '',
      subtitle: row.subtitle || '',
      author_code: row.author || null,
      ai_assisted: !!row.ai_assisted,
      keywords: parseCsvList(row.meta_tags),
      tags: parseCsvList(row.tag),
      location_name: row.location_name || null,
      location_address: row.location_address || null,
      image_url: resolveImageUrl(origin, row),
      published_at: pubIso,
      modified_at: modIso,
      views: Number(row.views || 0),
      language: 'ko-KR',
    };
    lines.push(JSON.stringify(entry));
  }

  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=UTF-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
      'X-Robots-Tag': 'noindex',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function clampInt(raw, min, max, fallback) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseCsvList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveImageUrl(origin, row) {
  if (!row.image_url) return null;
  if (/^https?:\/\//i.test(row.image_url)) return row.image_url;
  return `${origin}/api/posts/${row.id}/image`;
}

function toIsoString(dateStr) {
  if (!dateStr) return null;
  const normalized = String(dateStr).replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
