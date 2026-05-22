/**
 * Gilwell Media · /post/:id.md
 *
 * 각 기사의 plain markdown 미러. AI 봇(ChatGPT/Claude/Perplexity)이 HTML 파싱
 * 없이 본문을 깨끗한 텍스트로 인용·요약할 수 있도록 노출한다.
 *
 * 사람용 페이지(/post/:id)와 동일한 데이터 소스에서 markdown으로 변환:
 *   - frontmatter: title, url, category, published, author, citations
 *   - body: Editor.js JSON → markdown (paragraph/header/list/quote/image/embed)
 *
 * 비공개 글, 미존재 글, .md 확장자 외 요청은 404.
 */

import { SITE_BRAND_NAME } from '../_shared/site-copy.mjs';

export async function onRequestGet({ params, env, request }) {
  // params.id에는 .md 확장자가 포함돼 있을 수도, 없을 수도 있는데 우리 라우트는 [id].md.js라
  // Pages 런타임이 .md를 떼고 id만 넘긴다. (안전망 차원에서 .md suffix 한 번 더 trim)
  const rawId = String(params.id || '').replace(/\.md$/i, '');
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id) || id < 1) return notFound();

  let post;
  try {
    post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  } catch (err) {
    console.error('GET /post/:id.md DB error:', err);
    return new Response('# 오류\n\n게시글을 불러오지 못했습니다.\n', errorHeaders(500));
  }
  if (!post) return notFound();
  if (post.published === 0) return notFound();

  const origin = new URL(request.url).origin;
  const postUrl = `${origin}/post/${id}`;
  const pubDate = String(post.publish_at || post.created_at || '').slice(0, 10);
  const updated = String(post.updated_at || '').slice(0, 10);

  const md = renderPostMarkdown({
    post,
    postUrl,
    pubDate,
    updated,
    origin,
  });

  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=UTF-8',
      'Cache-Control': 'public, max-age=900',
      // AI 봇이 가져가는 데이터라는 사실을 검색엔진엔 인덱싱시키지 않음 (canonical은 HTML 페이지).
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const onRequestHead = onRequestGet;

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

  // 자료출처 — renderContent에서 citation 추출하는 로직과 같은 패턴 (자료출처: ...).
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

// ─── Editor.js JSON → Markdown 변환 ───────────────────────────────

function editorJsonToMarkdown(raw, origin) {
  if (!raw) return '';
  let doc;
  try { doc = JSON.parse(String(raw).trim()); } catch (_) {
    // Editor.js JSON이 아니면 HTML로 간주하고 단순 변환.
    return htmlToMarkdown(String(raw));
  }
  if (!doc || !Array.isArray(doc.blocks)) return '';

  const out = [];
  for (const block of doc.blocks) {
    const data = block.data || {};
    const type = block.type;
    if (type === 'header') {
      const level = Math.min(6, Math.max(2, Number(data.level) || 2)); // h1은 제목 한 개만 — 본문은 h2부터
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
      // raw HTML block — 표 등 일부 사용. Markdown으로 변환은 단순 strip.
      const text = htmlToMarkdown(String(data.html || ''));
      if (text) {
        out.push(text);
        out.push('');
      }
    }
    // 알 수 없는 타입은 조용히 무시.
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 인라인 HTML 마크업 (Editor.js paragraph/header/list/quote 내부) → markdown.
function inlineToMd(html) {
  if (!html) return '';
  let s = String(html);
  // <a href="X">Y</a> → [Y](X)
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const inner = stripTags(text);
    return `[${inner}](${href})`;
  });
  // bold / italic
  s = s.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**');
  s = s.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');
  // code
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  // mark — 마크다운 표준에 없음 → 굵게로 근사
  s = s.replace(/<mark>([\s\S]*?)<\/mark>/gi, '**$1**');
  // line break
  s = s.replace(/<br\s*\/?>/gi, '  \n');
  // 남은 태그 strip
  s = stripTags(s);
  return decodeEntities(s).trim();
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '');
}

function htmlToMarkdown(html) {
  if (!html) return '';
  const inline = inlineToMd(html);
  return inline.replace(/\s+/g, ' ').trim();
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
  // "자료출처:" 또는 "Source:" 뒤에 오는 URL을 모두 수집.
  const sourcePattern = /(?:자료출처|출처|Source|source)\s*[:：]\s*([\s\S]*?)(?:\n\n|$)/g;
  let match;
  while ((match = sourcePattern.exec(text)) !== null) {
    const block = match[1];
    const urlMatches = block.match(/https?:\/\/\S+/g) || [];
    urlMatches.forEach((u) => urls.add(u.replace(/[)\].,;]+$/, '')));
  }
  return Array.from(urls);
}

function notFound() {
  return new Response('# 404 Not Found\n\n해당 게시글을 찾을 수 없습니다.\n', errorHeaders(404));
}

function errorHeaders(status) {
  return {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  };
}
