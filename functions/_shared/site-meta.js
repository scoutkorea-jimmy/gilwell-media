const DEFAULT_SITE_META = {
  pages: {
    home: {
      title: 'BP미디어 · bpmedia.net',
      description: '스카우트 운동의 소식을 기록하는 독립 미디어입니다.',
    },
    korea: {
      title: 'Korea · BP미디어',
      description: '한국스카우트연맹 관련 소식을 전합니다.',
    },
    apr: {
      title: 'APR · BP미디어',
      description: '아시아태평양 지역 스카우트 소식을 전합니다.',
    },
    worm: {
      title: 'WOSM · BP미디어',
      description: '세계스카우트연맹 관련 소식을 전합니다.',
    },
    people: {
      title: '스카우트 인물 · BP미디어',
      description: '국내외 스카우트 인물을 조명하는 공간입니다.',
    },
    contributors: {
      title: '도움을 주신 분들 · BP미디어',
      description: 'BP미디어 운영에 도움을 주신 분들을 소개합니다.',
    },
    search: {
      title: '검색 · BP미디어',
      description: 'BP미디어 기사와 페이지를 검색합니다.',
    },
  },
  image_url: null,
  google_verification: '',
  naver_verification: '',
};

export async function loadSiteMeta(env) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_meta'`).first();
    return normalizeSiteMeta(row ? JSON.parse(row.value) : null);
  } catch {
    return normalizeSiteMeta(null);
  }
}

export function normalizeSiteMeta(raw) {
  const meta = {
    pages: {},
    image_url: sanitizeImageUrl(raw && raw.image_url),
    google_verification: sanitizeText(raw && raw.google_verification, '', 120),
    naver_verification: sanitizeText(raw && raw.naver_verification, '', 120),
  };

  Object.keys(DEFAULT_SITE_META.pages).forEach((key) => {
    const source = raw && raw.pages && raw.pages[key] ? raw.pages[key] : {};
    meta.pages[key] = {
      title: sanitizeText(source.title, DEFAULT_SITE_META.pages[key].title, 120),
      description: sanitizeText(source.description, DEFAULT_SITE_META.pages[key].description, 260),
    };
  });

  return meta;
}

export function getSitePageKey(pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const mapping = {
    '/index.html': 'home',
    '/korea.html': 'korea',
    '/apr.html': 'apr',
    '/worm.html': 'worm',
    '/people.html': 'people',
    '/contributors.html': 'contributors',
    '/search.html': 'search',
  };
  return mapping[normalized] || null;
}

export function buildShareMetaBlock({ pageKey, title, description, url, imageUrl, googleVerification, naverVerification }) {
  const safeTitle = escapeHtml(title || DEFAULT_SITE_META.pages.home.title);
  const safeDesc = escapeHtml(description || DEFAULT_SITE_META.pages.home.description);
  const safeUrl = escapeHtml(url || 'https://bpmedia.net');
  const safeImage = imageUrl ? escapeHtml(imageUrl) : '';
  const twitterCard = safeImage ? 'summary_large_image' : 'summary';
  const robots = pageKey === 'search'
    ? '<meta name="robots" content="noindex,follow"/>'
    : '<meta name="robots" content="index,follow,max-image-preview:large"/>';
  const structuredData = buildPageStructuredData({ pageKey, title, description, url, imageUrl });

  return [
    robots,
    `<meta name="description" content="${safeDesc}"/>`,
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:title" content="${safeTitle}"/>`,
    `<meta property="og:description" content="${safeDesc}"/>`,
    `<meta property="og:url" content="${safeUrl}"/>`,
    safeImage ? `<meta property="og:image" content="${safeImage}"/>` : '',
    `<meta property="og:site_name" content="BP미디어 · bpmedia.net"/>`,
    `<meta name="twitter:card" content="${twitterCard}"/>`,
    `<meta name="twitter:title" content="${safeTitle}"/>`,
    `<meta name="twitter:description" content="${safeDesc}"/>`,
    safeImage ? `<meta name="twitter:image" content="${safeImage}"/>` : '',
    googleVerification ? `<meta name="google-site-verification" content="${escapeHtml(googleVerification)}"/>` : '',
    naverVerification ? `<meta name="naver-site-verification" content="${escapeHtml(naverVerification)}"/>` : '',
    `<link rel="canonical" href="${safeUrl}"/>`,
    structuredData ? `<script type="application/ld+json">${structuredData}</script>` : '',
  ].filter(Boolean).join('\n  ');
}

export function getResolvedShareImage(siteMeta, origin) {
  if (!siteMeta || !siteMeta.image_url) return '';
  if (siteMeta.image_url.startsWith('http')) return siteMeta.image_url;
  return `${origin}/api/settings/site-meta/image`;
}

export function serveStoredImage(imageUrl) {
  if (!imageUrl) return new Response(null, { status: 404 });

  if (imageUrl.startsWith('http')) {
    return Response.redirect(imageUrl, 302);
  }

  if (imageUrl.startsWith('data:')) {
    const commaIdx = imageUrl.indexOf(',');
    if (commaIdx < 0) return new Response(null, { status: 404 });
    const header = imageUrl.slice(0, commaIdx);
    const b64 = imageUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes.buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      return new Response(null, { status: 500 });
    }
  }

  return new Response(null, { status: 404 });
}

function sanitizeText(value, fallback, maxLen) {
  const str = typeof value === 'string' ? value.trim() : '';
  return (str || fallback).slice(0, maxLen);
}

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch {}
  return null;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPageStructuredData({ pageKey, title, description, url, imageUrl }) {
  const type = pageKey === 'home' ? 'WebSite' : (pageKey === 'search' ? 'SearchResultsPage' : 'CollectionPage');
  const payload = {
    '@context': 'https://schema.org',
    '@type': type,
    name: title || DEFAULT_SITE_META.pages.home.title,
    description: description || DEFAULT_SITE_META.pages.home.description,
    url: url || 'https://bpmedia.net/',
    inLanguage: 'ko-KR',
    publisher: {
      '@type': 'Organization',
      name: 'BP미디어',
      url: 'https://bpmedia.net',
      logo: {
        '@type': 'ImageObject',
        url: 'https://bpmedia.net/img/logo.svg',
      },
    },
  };
  if (imageUrl) payload.image = imageUrl;
  if (pageKey === 'home') {
    payload.potentialAction = {
      '@type': 'SearchAction',
      target: 'https://bpmedia.net/search.html?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    };
  }
  return safeJsonLd(payload);
}

function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export { DEFAULT_SITE_META };
