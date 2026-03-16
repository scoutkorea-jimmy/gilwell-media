export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const feedUrl = `${origin}/rss.xml`;
  const siteUrl = `${origin}/`;

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, category, title, subtitle, content, created_at, publish_at, updated_at, tag, published
         FROM posts
        WHERE published = 1
        ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC
        LIMIT 20`
    ).all();

    const items = (results || []).map((post) => {
      const title = escapeXml(post.title || `post-${post.id}`);
      const link = `${origin}/post/${post.id}`;
      const description = escapeXml(buildDescription(post));
      const pubDate = toRfc822(post.created_at || post.updated_at || post.publish_at);
      const category = escapeXml(resolveCategoryLabel(post.category));
      const tags = parseTags(post.tag);
      const guid = escapeXml(link);
      const categoryTags = tags.map((tag) => `    <category domain="tag">${escapeXml(tag)}</category>`).join('\n');

      return `  <item>
    <title>${title}</title>
    <link>${escapeXml(link)}</link>
    <guid isPermaLink="true">${guid}</guid>
    <description>${description}</description>
    <category>${category}</category>
${categoryTags ? `${categoryTags}\n` : ''}    <bpmedia:created>${escapeXml(post.created_at || '')}</bpmedia:created>
    ${pubDate ? `<pubDate>${escapeXml(pubDate)}</pubDate>` : ''}
  </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:bpmedia="https://bpmedia.net/ns/rss">
<channel>
  <title>BP미디어</title>
  <link>${escapeXml(siteUrl)}</link>
  <description>BP미디어 최신 기사 RSS 피드</description>
  <language>ko</language>
  <lastBuildDate>${escapeXml(toRfc822(new Date().toISOString()) || '')}</lastBuildDate>
  <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom"/>
${items}
</channel>
</rss>`;

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

function buildDescription(post) {
  const subtitle = typeof post.subtitle === 'string' ? post.subtitle.trim() : '';
  const summary = subtitle || truncatePlain(post.content || '', 220);
  const tags = parseTags(post.tag);
  if (!tags.length) return summary;
  return summary ? `${summary} | 글머리 태그: ${tags.join(', ')}` : `글머리 태그: ${tags.join(', ')}`;
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function truncatePlain(str, maxLen) {
  if (!str) return '';
  const trimmed = String(str).trim();
  let text = trimmed;

  if (trimmed.charAt(0) === '{') {
    try {
      const doc = JSON.parse(trimmed);
      if (Array.isArray(doc.blocks)) {
        text = doc.blocks.map((block) => {
          if (block.type === 'paragraph' || block.type === 'header') return block.data.text || '';
          if (block.type === 'quote') return block.data.text || '';
          if (block.type === 'list') {
            return (block.data.items || []).map((item) => typeof item === 'string' ? item : (item.content || '')).join(' ');
          }
          return '';
        }).join(' ');
      }
    } catch (_) {}
  }

  const plain = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).trimEnd() + '...';
}

function resolveCategoryLabel(category) {
  const labels = {
    korea: 'Korea / KSA',
    apr: 'APR',
    wosm: 'WOSM',
    people: 'Scout People',
    glossary: 'Glossary',
  };
  return labels[category] || 'BP미디어';
}

function toRfc822(value) {
  if (!value) return '';
  const normalized = String(value).replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
