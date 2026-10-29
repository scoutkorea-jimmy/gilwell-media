import { queryRust } from './rust-server.js';
import { purgeContentCache } from './cache-purge.js';

export async function ensureDuePostsPublished(env, origin) {
  if (!env || !env.DB) return { published: [] };

  const rust = await queryRust({ env, request: { url: 'https://internal.invalid/' } }, 'publish-due', {});
  if (!rust.ok) throw new Error('Rust scheduled publication failed');
  const { published: duePosts } = await rust.json();
  if (!duePosts.length) return { published: [] };
  const ids = duePosts.map((item) => Number(item && item.id || 0)).filter((value) => value > 0);
  if (!ids.length) return { published: [] };

  if (origin) {
    const categories = Array.from(new Set(duePosts.map((item) => item.category).filter(Boolean)));
    await purgeContentCache(env, origin, { postIds: ids, categories }).catch((err) => {
      console.error('auto publish cache purge error:', err);
    });
  }

  return { published: duePosts };
}
