import { purgeContentCache } from './cache-purge.js';

const DUE_PUBLISH_EXPR = "COALESCE(datetime(replace(publish_at, 'T', ' ')), datetime(publish_at))";

export async function ensureDuePostsPublished(env, origin) {
  if (!env || !env.DB) return { published: [] };

  const { results } = await env.DB.prepare(
    `SELECT id, category
       FROM posts
      WHERE published = 0
        AND publish_at IS NOT NULL
        AND ${DUE_PUBLISH_EXPR} IS NOT NULL
        AND ${DUE_PUBLISH_EXPR} <= datetime('now', '+9 hours')
      ORDER BY ${DUE_PUBLISH_EXPR} ASC, id ASC
      LIMIT 50`
  ).all();

  const duePosts = results || [];
  if (!duePosts.length) return { published: [] };

  const ids = duePosts
    .map((item) => Number(item && item.id || 0))
    .filter((value) => value > 0);
  if (!ids.length) return { published: [] };

  const placeholders = ids.map(() => '?').join(', ');
  await env.DB.prepare(
    `UPDATE posts
        SET published = 1,
            updated_at = datetime('now')
      WHERE id IN (${placeholders})`
  ).bind(...ids).run();

  if (origin) {
    const categories = Array.from(new Set(duePosts.map((item) => item.category).filter(Boolean)));
    await purgeContentCache(env, origin, { postIds: ids, categories }).catch((err) => {
      console.error('auto publish cache purge error:', err);
    });
  }

  return { published: duePosts };
}
