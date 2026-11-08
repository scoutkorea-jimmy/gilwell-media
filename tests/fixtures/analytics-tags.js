export function aggregateTags(rows, range) {
  const map = new Map();
  const pairMap = new Map();
  const posts = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const keywords = collectKeywordTerms(row);
    if (!keywords.length) return;
    posts.push({
      id: Number(row && row.id || 0),
      title: String(row && row.title || ''),
      category: String(row && row.category || ''),
      published: Number(row && row.published || 0) === 1,
      pageviews: Number(row && row.pageviews || 0),
      keywords,
    });
    keywords.forEach((tag) => {
      const key = tag.toLowerCase();
      const current = map.get(key) || {
        tag,
        count: 0,
        published_count: 0,
        draft_count: 0,
        pageviews: 0,
        categories: new Set(),
      };
      current.count += 1;
      if (Number(row && row.published || 0) === 1) current.published_count += 1;
      else current.draft_count += 1;
      current.pageviews += Number(row && row.pageviews || 0);
      if (row && row.category) current.categories.add(row.category);
      map.set(key, current);
    });
    const uniqueTags = Array.from(new Set(keywords.map((item) => item.trim()).filter(Boolean)));
    for (let i = 0; i < uniqueTags.length; i += 1) {
      for (let j = i + 1; j < uniqueTags.length; j += 1) {
        const left = uniqueTags[i];
        const right = uniqueTags[j];
        const pairKey = [left.toLowerCase(), right.toLowerCase()].sort().join('::');
        const pair = pairMap.get(pairKey) || { source: left, target: right, count: 0 };
        pair.count += 1;
        pairMap.set(pairKey, pair);
      }
    }
  });

  const baseItems = Array.from(map.values())
    .map((item) => ({
      tag: item.tag,
      count: item.count,
      published_count: item.published_count,
      draft_count: item.draft_count,
      pageviews: item.pageviews,
      categories: Array.from(item.categories).sort((a, b) => a.localeCompare(b, 'en')),
    }));
  const maxCount = Math.max(1, ...baseItems.map((item) => Number(item.count || 0)));
  const maxViews = Math.max(1, ...baseItems.map((item) => Number(item.pageviews || 0)));
  const allItems = baseItems
    .map((item) => {
      const countRatio = Number(item.count || 0) / maxCount;
      const viewRatio = Number(item.pageviews || 0) / maxViews;
      return Object.assign({}, item, {
        weighted_score: Number(((countRatio * 0.38) + (viewRatio * 0.62)).toFixed(4)),
      });
    })
    .sort((a, b) => b.weighted_score - a.weighted_score || b.count - a.count || b.pageviews - a.pageviews || a.tag.localeCompare(b.tag, 'ko'));
  const items = allItems.slice(0, 80);

  return {
    range_label: range && range.label ? range.label : '',
    total_unique_tags: allItems.length,
    total_tag_assignments: allItems.reduce((sum, item) => sum + Number(item.count || 0), 0),
    items,
    graph: buildTagGraph(allItems, pairMap, posts),
  };
}

function buildTagGraph(items, pairMap, posts) {
  const topTags = (Array.isArray(items) ? items : []).slice(0, 22);
  const allowedTags = new Set(topTags.map((item) => String(item.tag || '').toLowerCase()));
  const tagTagLinks = Array.from(pairMap.values())
    .filter((item) => {
      const left = String(item.source || '').toLowerCase();
      const right = String(item.target || '').toLowerCase();
      return allowedTags.has(left) && allowedTags.has(right) && Number(item.count || 0) >= 1;
    })
    .sort((a, b) => b.count - a.count || String(a.source || '').localeCompare(String(b.source || ''), 'ko'))
    .slice(0, 56)
    .map((item) => ({
      id: 'tt:' + String(item.source || '') + '::' + String(item.target || ''),
      type: 'tag_tag',
      source: 'tag:' + item.source,
      target: 'tag:' + item.target,
      count: Number(item.count || 0),
    }));
  const relatedArticles = (Array.isArray(posts) ? posts : [])
    .map((post) => {
      const matchedTags = (post.keywords || []).filter((tag) => allowedTags.has(String(tag || '').toLowerCase()));
      return Object.assign({}, post, { matchedTags });
    })
    .filter((post) => post.matchedTags.length)
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length || Number(b.published) - Number(a.published) || b.id - a.id)
    .slice(0, 32);
  return {
    nodes: topTags.map((item) => ({
      id: 'tag:' + item.tag,
      label: item.tag,
      node_type: 'tag',
      count: Number(item.count || 0),
      pageviews: Number(item.pageviews || 0),
      weighted_score: Number(item.weighted_score || 0),
      categories: item.categories || [],
    })),
    links: tagTagLinks,
    articles: relatedArticles.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category,
      published: !!post.published,
      keywords: post.matchedTags.slice(),
    })),
    counts: {
      tags: topTags.length,
      posts: relatedArticles.length,
      tag_tag_links: tagTagLinks.length,
    },
    filters: {
      node_types: ['tag'],
      link_types: ['tag_tag'],
    },
  };
}

function collectKeywordTerms(row) {
  const raw = []
    .concat(String(row && row.tag || '').split(','))
    .concat(String(row && row.meta_tags || '').split(','));
  const seen = new Set();
  const items = [];
  raw.forEach((item) => {
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    items.push(value);
  });
  return items;
}
