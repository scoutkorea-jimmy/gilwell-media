/**
 * Gilwell Media · post markdown renderer
 *
 * /post/:id.md 의 plain markdown 본문을 만든다. AI 봇(ChatGPT/Claude/Perplexity)이
 * HTML 파싱 없이 본문을 인용·요약할 수 있도록 깨끗한 markdown으로 노출.
 *
 * Cloudflare Pages가 [id].md.js 같은 dynamic+literal 라우트 패턴을 인식하지 못해
 * 별도 함수가 아닌, post/[id].js 안에서 분기 호출하는 형태.
 */

import { SITE_BRAND_NAME } from './site-copy.mjs';

export function buildPostMarkdownResponse({ post, postUrl, origin }) {
  const pubDate = String(post.publish_at || post.created_at || '').slice(0, 10);
  const updated = String(post.updated_at || '').slice(0, 10);
  const body = renderPostMarkdown({ post, postUrl, pubDate, updated, origin });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=UTF-8',
      'Cache-Control': 'public, max-age=900',
      // AI 봇이 가져가는 데이터라는 사실을 검색엔진엔 인덱싱시키지 않음 (canonical은 HTML 페이지).
      'X-Robots-Tag': 'noindex',
    },
  });
}

export function buildMarkdownErrorResponse(status, message) {
  return new Response(`# ${status === 404 ? '404 Not Found' : '오류'}\n\n${message || '게시글을 찾을 수 없습니다.'}\n`, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function renderPostMarkdown({ post, postUrl, pubDate, updated, origin }) {
  const title = (post.title || '').trim();
  const subtitle = (post.subtitle || '').trim();
  const author = (post.author || 'Editor.A').trim();
  const category = (post.category || '').trim();
  const tags = parseTags(post.tag);
  const metaTags = parseTags(post.meta_tags);

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `url: ${postUrl}`,
    `canonical: ${postUrl}`,
    category ? `category: ${yamlString(category)}` : null,
    `author: ${yamlString(author)}`,
    pubDate ? `published: ${pubDate}` : null,
    updated ? `updated: ${updated}` : null,
    tags.length ? `tags: [${tags.map(yamlString).join(', ')}]` : null,
    metaTags.length ? `meta_tags: [${metaTags.map(yamlString).join(', ')}]` : null,
    post.location_name ? `location: ${yamlString(post.location_name)}` : null,
    `source: ${yamlString(SITE_BRAND_NAME)}`,
    '---',
    '',
  ].filter((line) => line !== null).join('\n');

  const bodyParts = [];
  bodyParts.push(`# ${title}`);
  bodyParts.push('');
  if (subtitle) {
    bodyParts.push(`*${subtitle}*`);
    bodyParts.push('');
  }
  bodyParts.push(`_${pubDate || ''} · ${author}${category ? ' · ' + category : ''}_`);
  bodyParts.push('');

  const heroImg = post.image_url ? absoluteUrl(post.image_url, origin) : '';
  const heroAlt = post.image_caption || title;
  if (heroImg) {
    bodyParts.push(`![${escapeMdAlt(heroAlt)}](${heroImg})`);
    bodyParts.push('');
  }

  const bodyMd = editorJsonToMarkdown(post.content || '', origin);
  if (bodyMd) {
    bodyParts.push(bodyMd);
    bodyParts.push('');
  }

  const citations = extractCitations(post.content || '');
  if (citations.length) {
    bodyParts.push('## 자료출처');
    bodyParts.push('');
    citations.forEach((url) => bodyParts.push(`- ${url}`));
    bodyParts.push('');
  }

  bodyParts.push('---');
  bodyParts.push(`원문(HTML): ${postUrl}`);
  bodyParts.push('');

  return frontmatter + bodyParts.join('\n');
}

function editorJsonToMarkdown(raw, origin) {
  if (!raw) return '';
  let doc;
  try { doc = JSON.parse(String(raw).trim()); } catch (_) {
    return htmlToMarkdown(String(raw));
  }
  if (!doc || !Array.isArray(doc.blocks)) return '';

  const out = [];
  for (const block of doc.blocks) {
    const data = block.data || {};
    const type = block.type;
    if (type === 'header') {
      const level = Math.min(6, Math.max(2, Number(data.level) || 2));
      out.push('#'.repeat(level) + ' ' + inlineToMd(data.text || ''));
      out.push('');
    } else if (type === 'paragraph') {
      const txt = inlineToMd(data.text || '');
      if (txt) {
        out.push(txt);
        out.push('');
      }
    } else if (type === 'list') {
      const ordered = data.style === 'ordered';
      const items = Array.isArray(data.items) ? data.items : [];
      items.forEach((item, idx) => {
        const content = typeof item === 'string' ? item : (item.content || '');
        const prefix = ordered ? `${idx + 1}.` : '-';
        out.push(`${prefix} ${inlineToMd(content)}`);
      });
      out.push('');
    } else if (type === 'quote') {
      const lines = inlineToMd(data.text || '').split('\n');
      lines.forEach((line) => out.push(`> ${line}`));
      if (data.caption) out.push(`> — ${inlineToMd(data.caption)}`);
      out.push('');
    } else if (type === 'image') {
      const url = data.file && data.file.url ? absoluteUrl(data.file.url, origin) : (data.url || '');
      const caption = data.caption || '';
      if (url) {
        out.push(`![${escapeMdAlt(caption || '')}](${url})`);
        if (caption) {
          out.push('');
          out.push(`_${inlineToMd(caption)}_`);
        }
        out.push('');
      }
    } else if (type === 'embed') {
      const url = data.source || data.embed || '';
      const caption = data.caption || url;
      if (url) {
        out.push(`[${inlineToMd(caption)}](${url})`);
        out.push('');
      }
    } else if (type === 'delimiter') {
      out.push('---');
      out.push('');
    } else if (type === 'code') {
      const lang = data.language || '';
      out.push('```' + lang);
      out.push(String(data.code || ''));
      out.push('```');
      out.push('');
    } else if (type === 'raw') {
      const text = htmlToMarkdown(String(data.html || ''));
      if (text) {
        out.push(text);
        out.push('');
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inlineToMd(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const inner = stripTags(text);
    return `[${inner}](${href})`;
  });
  s = s.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**');
  s = s.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<mark>([\s\S]*?)<\/mark>/gi, '**$1**');
  s = s.replace(/<br\s*\/?>/gi, '  \n');
  s = stripTags(s);
  return decodeEntities(s).trim();
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '');
}

function htmlToMarkdown(html) {
  if (!html) return '';
  return inlineToMd(html).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function escapeMdAlt(s) {
  return String(s || '').replace(/[\[\]]/g, '');
}

function yamlString(value) {
  const s = String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  return `"${s}"`;
}

function parseTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function absoluteUrl(u, origin) {
  const s = String(u || '');
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/')) return origin + s;
  return s;
}

function extractCitations(content) {
  if (!content) return [];
  let raw = String(content);
  let text = raw;
  if (raw.trim().charAt(0) === '{') {
    try {
      const doc = JSON.parse(raw.trim());
      if (Array.isArray(doc.blocks)) {
        text = doc.blocks.map((b) => {
          const d = b.data || {};
          if (b.type === 'paragraph') return d.text || '';
          return '';
        }).join('\n');
      }
    } catch (_) { /* fall through */ }
  }
  const urls = new Set();
  const sourcePattern = /(?:자료출처|출처|Source|source)\s*[:：]\s*([\s\S]*?)(?:\n\n|$)/g;
  let match;
  while ((match = sourcePattern.exec(text)) !== null) {
    const block = match[1];
    const urlMatches = block.match(/https?:\/\/\S+/g) || [];
    urlMatches.forEach((u) => urls.add(u.replace(/[)\].,;]+$/, '')));
  }
  return Array.from(urls);
}
