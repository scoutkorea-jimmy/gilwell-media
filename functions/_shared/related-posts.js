export async function findRelatedPosts(env, basePost, limit = 5) {
  if (!env?.DB || !basePost?.id) return [];

  const anchorTerms = extractTerms(basePost.tag, basePost.meta_tags);
  const { results } = await env.DB.prepare(
    `SELECT id, title, category, created_at, tag, meta_tags
       FROM posts
      WHERE published = 1
        AND id != ?
      ORDER BY datetime(created_at) DESC
      LIMIT 80`
  ).bind(basePost.id).all();

  const scored = (results || []).map((post) => {
    const candidateTerms = extractTerms(post.tag, post.meta_tags);
    const overlap = countOverlap(anchorTerms, candidateTerms);
    const categoryBonus = post.category === basePost.category ? 20 : 0;
    const tagBonus = overlap * 100;
    const score = tagBonus + categoryBonus;
    return {
      id: post.id,
      title: post.title || '',
      category: post.category || '',
      created_at: post.created_at || '',
      score,
    };
  }).filter((post) => post.title);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  return scored.slice(0, limit).map((post) => ({
    id: post.id,
    title: post.title,
    category: post.category,
  }));
}

function extractTerms() {
  const out = new Set();
  Array.from(arguments).forEach((value) => {
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .forEach((item) => out.add(item));
  });
  return out;
}

function countOverlap(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  a.forEach((item) => {
    if (b.has(item)) count += 1;
  });
  return count;
}
