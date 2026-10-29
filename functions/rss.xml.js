import { queryRust } from './_shared/rust-server.js';
import { loadNavLabels } from './_shared/nav-labels.js';
import { getCategoryMeta } from './_shared/category-meta.mjs';

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;

  try {
    const { ensureDuePostsPublished } = await import('./_shared/publish-due-posts.js');
    await ensureDuePostsPublished(env, origin).catch((err) => {
      console.error('GET /rss.xml auto publish error:', err);
    });
    const navLabels = await loadNavLabels(env);
    const labels = Object.fromEntries(['latest','korea','apr','wosm','people','glossary'].map((category) => [category, getCategoryMeta(navLabels, category, 'ko').label || 'BP미디어']));
    const response = await queryRust({ request, env }, 'rss', { origin, labels });
    if (!response.ok) throw new Error('Rust RSS failed');
    const xml = await response.text();

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=UTF-8',
        'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('GET /rss.xml error:', err);
    return new Response('RSS feed unavailable', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
}

// onRequestGet만 export하면 HEAD 요청이 매치되지 않아 404로 떨어진다. 피드 리더 일부는 GET 전에 HEAD probe.
export const onRequestHead = onRequestGet;
