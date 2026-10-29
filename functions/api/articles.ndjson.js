import { queryRust } from '../_shared/rust-server.js';
import { PUBLIC_DATE_EXPR } from '../_shared/post-public-date.js';

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


  let body;
  try {
    const rust = await queryRust({ request, env }, 'article-export', { days: params.get('days'), limit: params.get('limit'), category: params.get('category'), publicDateExpr: PUBLIC_DATE_EXPR, origin });
    if (!rust.ok) throw new Error('Rust article export failed');
    body = await rust.text();
  } catch (err) {
    console.error('GET /api/articles.ndjson DB error:', err);
    return new Response('{"error":"internal_error"}\n', {
      status: 500,
      headers: { 'Content-Type': 'application/x-ndjson; charset=UTF-8' },
    });
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=UTF-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
      'X-Robots-Tag': 'noindex',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
