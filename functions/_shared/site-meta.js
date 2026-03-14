export const ADSENSE_ACCOUNT = 'ca-pub-9517793409283448';
export const NAVER_SITE_VERIFICATION = '67d80b07cdf98761a3adbe635c48cd8691a4b598';
const SITE_ORIGIN = 'https://bpmedia.net';
const PUBLISHER = {
  '@type': 'Organization',
  name: 'BP미디어',
  url: SITE_ORIGIN,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_ORIGIN}/img/logo.svg`,
  },
};

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
    wosm: {
      title: 'WOSM · BP미디어',
      description: '세계스카우트연맹 관련 소식을 전합니다.',
    },
    people: {
      title: '스카우트 인물 · BP미디어',
      description: '국내외 스카우트 인물을 조명하는 공간입니다.',
    },
    glossary: {
      title: '스카우트 용어 번역집 · BP미디어',
      description: '국문·영문·불어 3개 국어 기준의 스카우트 용어 번역집입니다.',
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
  footer: {
    raw_text: '',
    title: 'BP미디어',
    description: 'BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.',
    domain_label: 'bpmedia.net',
    tip_email: 'story@bpmedia.net',
    contact_email: 'info@bpmedia.net',
  },
  image_url: null,
  google_verification: '',
  naver_verification: NAVER_SITE_VERIFICATION,
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
    footer: {},
    image_url: sanitizeImageUrl(raw && raw.image_url),
    google_verification: sanitizeText(raw && raw.google_verification, '', 120),
    naver_verification: sanitizeText(raw && raw.naver_verification, '', 120),
  };

  Object.keys(DEFAULT_SITE_META.pages).forEach((key) => {
    const source = raw && raw.pages
      ? (raw.pages[key] || (key === 'wosm' ? raw.pages.worm : null) || {})
      : {};
    meta.pages[key] = {
      title: sanitizeText(source.title, DEFAULT_SITE_META.pages[key].title, 120),
      description: sanitizeText(source.description, DEFAULT_SITE_META.pages[key].description, 260),
    };
  });

  const footer = raw && raw.footer ? raw.footer : {};
  meta.footer = {
    raw_text: sanitizeText(footer.raw_text, DEFAULT_SITE_META.footer.raw_text, 4000),
    title: sanitizeText(footer.title, DEFAULT_SITE_META.footer.title, 80),
    description: sanitizeText(footer.description, DEFAULT_SITE_META.footer.description, 260),
    domain_label: sanitizeText(footer.domain_label, DEFAULT_SITE_META.footer.domain_label, 120),
    tip_email: sanitizeEmail(footer.tip_email, DEFAULT_SITE_META.footer.tip_email),
    contact_email: sanitizeEmail(footer.contact_email, DEFAULT_SITE_META.footer.contact_email),
  };

  return meta;
}

export function getSitePageKey(pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const mapping = {
    '/index.html': 'home',
    '/korea.html': 'korea',
    '/apr.html': 'apr',
    '/wosm.html': 'wosm',
    '/people.html': 'people',
    '/glossary.html': 'glossary',
    '/contributors.html': 'contributors',
    '/search.html': 'search',
  };
  return mapping[normalized] || null;
}

export function buildShareMetaBlock({ pageKey, title, description, url, imageUrl, googleVerification, naverVerification, itemListElements }) {
  const safeTitle = escapeHtml(title || DEFAULT_SITE_META.pages.home.title);
  const safeDesc = escapeHtml(description || DEFAULT_SITE_META.pages.home.description);
  const safeUrl = escapeHtml(url || 'https://bpmedia.net');
  const safeImage = imageUrl ? escapeHtml(imageUrl) : '';
  const twitterCard = safeImage ? 'summary_large_image' : 'summary';
  const robots = pageKey === 'search'
    ? '<meta name="robots" content="noindex,follow"/>'
    : '<meta name="robots" content="index,follow,max-image-preview:large"/>';
  const structuredData = buildStructuredDataEntries({ pageKey, title, description, url, imageUrl, itemListElements });

  return [
    `<meta name="google-adsense-account" content="${ADSENSE_ACCOUNT}"/>`,
    robots,
    `<meta name="description" content="${safeDesc}"/>`,
    `<meta property="og:locale" content="ko_KR"/>`,
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
    ...structuredData.map((item) => `<script type="application/ld+json">${safeJsonLd(item)}</script>`),
  ].filter(Boolean).join('\n  ');
}

export function getResolvedShareImage(siteMeta, origin) {
  if (!siteMeta || !siteMeta.image_url) return `${origin}/img/logo.svg`;
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

function sanitizeEmail(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : fallback;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStructuredDataEntries({ pageKey, title, description, url, imageUrl, itemListElements }) {
  const resolvedUrl = url || `${SITE_ORIGIN}/`;
  const pageName = title || DEFAULT_SITE_META.pages.home.title;
  const pageDescription = description || DEFAULT_SITE_META.pages.home.description;
  const entries = [
    buildOrganizationStructuredData(imageUrl),
    buildWebsiteStructuredData(imageUrl),
    buildPageStructuredData({ pageKey, title: pageName, description: pageDescription, url: resolvedUrl, imageUrl }),
  ];
  const itemList = buildItemListStructuredData({ pageKey, url: resolvedUrl, itemListElements });
  if (itemList) entries.push(itemList);
  const breadcrumb = buildBreadcrumbStructuredData(pageKey, resolvedUrl);
  if (breadcrumb) entries.push(breadcrumb);
  return entries;
}

function buildOrganizationStructuredData(imageUrl) {
  const payload = {
    '@context': 'https://schema.org',
    ...PUBLISHER,
  };
  if (imageUrl) payload.image = imageUrl;
  return payload;
}

function buildWebsiteStructuredData(imageUrl) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: 'BP미디어 · bpmedia.net',
    url: `${SITE_ORIGIN}/`,
    inLanguage: 'ko-KR',
    publisher: PUBLISHER,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_ORIGIN}/search.html?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  if (imageUrl) payload.image = imageUrl;
  return payload;
}

function buildPageStructuredData({ pageKey, title, description, url, imageUrl }) {
  const type = pageKey === 'search' ? 'SearchResultsPage' : (pageKey === 'home' ? 'WebPage' : 'CollectionPage');
  const payload = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#webpage`,
    name: title,
    headline: title,
    description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: 'BP미디어 · bpmedia.net',
    },
    about: {
      '@type': 'Thing',
      name: getPageTopic(pageKey),
    },
    inLanguage: 'ko-KR',
    publisher: PUBLISHER,
  };
  if (imageUrl) payload.primaryImageOfPage = imageUrl;
  return payload;
}

function buildBreadcrumbStructuredData(pageKey, url) {
  const crumb = getBreadcrumbLabel(pageKey);
  if (!crumb || pageKey === 'home') return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: '홈',
        item: `${SITE_ORIGIN}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: crumb,
        item: url,
      },
    ],
  };
}

function getBreadcrumbLabel(pageKey) {
  const labels = {
    korea: 'Korea',
    apr: 'APR',
    wosm: 'WOSM',
    people: '스카우트 인물',
    glossary: '스카우트 용어 번역집',
    contributors: '도움을 주신 분들',
    search: '검색',
  };
  return labels[pageKey] || '';
}

function getPageTopic(pageKey) {
  const topics = {
    home: '스카우트 뉴스',
    korea: '한국 스카우트 소식',
    apr: '아시아태평양 스카우트 소식',
    wosm: '세계스카우트연맹 소식',
    people: '스카우트 인물',
    glossary: '스카우트 용어 번역집',
    contributors: '후원 및 기여자 소개',
    search: '사이트 검색 결과',
  };
  return topics[pageKey] || '스카우트 뉴스';
}

function buildItemListStructuredData({ pageKey, url, itemListElements }) {
  if (!Array.isArray(itemListElements) || !itemListElements.length) return null;
  if (!['home', 'korea', 'apr', 'wosm', 'people', 'glossary'].includes(pageKey)) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${url}#itemlist`,
    name: getPageTopic(pageKey),
    itemListElement: itemListElements.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.title,
    })),
  };
}

function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export { DEFAULT_SITE_META };
