export async function findRelatedPosts(env, basePost, limit = 5) {
  if (!env?.DB || !basePost?.id) return [];

  const anchorTerms = Array.from(extractTerms(basePost.tag, basePost.meta_tags)).slice(0, 3);
  let sql = `
    SELECT id, title, category, created_at, publish_at, tag, meta_tags
      FROM posts
     WHERE published = 1
       AND id != ?
  `;
  const bindings = [basePost.id];

  if (anchorTerms.length) {
    const likeParts = [];
    anchorTerms.forEach((term) => {
      likeParts.push('LOWER(COALESCE(tag, \'\')) LIKE ?', 'LOWER(COALESCE(meta_tags, \'\')) LIKE ?');
      bindings.push(`%${term}%`, `%${term}%`);
    });
    sql += ` AND (category = ? OR ${likeParts.join(' OR ')})`;
    bindings.splice(1, 0, basePost.category || '');
  } else if (basePost.category) {
    sql += ' AND category = ?';
    bindings.push(basePost.category);
  }

  sql += ' ORDER BY datetime(COALESCE(publish_at, created_at)) DESC LIMIT ?';
  bindings.push(anchorTerms.length ? 30 : 20);

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();

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
      publish_at: post.publish_at || '',
      created_at: post.created_at || '',
      sort_date: post.publish_at || post.created_at || '',
      score,
    };
  }).filter((post) => post.title);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.sort_date).localeCompare(String(a.sort_date));
  });

  return scored.slice(0, limit).map((post) => ({
    id: post.id,
    title: post.title,
    category: post.category,
    publish_at: post.publish_at,
    created_at: post.created_at,
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
