/**
 * Gilwell Media · /robots.txt
 *
 * 규칙 본문은 아래 상수 3개가 단일 원본이다. 예전에는 같은 10줄을 봇마다
 * 손으로 복사해 15벌을 유지했는데, 한 벌만 고치면 나머지 14벌이 조용히
 * 어긋나는 구조였다. 봇 목록과 규칙을 분리해 그 가능성을 없앤다.
 */

const DISALLOW_PATHS = [
  '/admin',
  '/admin.html',
  '/dreampath',
  '/dreampath.html',
  '/kms',
  '/kms.html',
  '/search',
  '/search.html',
  '/api/',
  '/output/',
];

// 기사 본문 이미지와 공유 카드 이미지는 전부 `/api/` 아래에서 서빙된다
// (`/api/images/*`, `/api/posts/<id>/image`, `/api/og-image/<id>`).
// `Disallow: /api/` 만 있으면 — 2026-08-26 실측으로 기사 og:image 가
// `https://bpmedia.net/api/images/draft-cover-….png` 였다 —
//   · Googlebot 이 렌더링 시 서브리소스로 이미지를 못 가져오고
//   · Naver Yeti 는 이미지 색인에서 통째로 빠지며
//   · robots 를 따르는 공유 스크래퍼(facebookexternalhit 등)는 카드가 빈다.
// robots.txt 는 "가장 구체적인 규칙 우선"이라 Allow 가 Disallow 를 이긴다.
// 경로를 좁게 끊어 이미지 엔드포인트만 열고 나머지 API 는 그대로 막는다.
const ALLOW_PATHS = [
  '/api/images/',
  '/api/og-image/',
  '/api/posts/*/image',
];

// 검색 엔진 크롤러 — 표준 규칙(Allow: / + 이미지 예외 + 관리·검색·출력 차단).
const SEARCH_AGENTS = [
  'Googlebot',
  'Naverbot',
  'Yeti',
];

// AI / LLM 크롤러 — 전면 허용 정책(뉴스 사이트 기본값). 사이트 콘텐츠가 AI
// 답변·요약에 인용될 수 있도록 explicit allow 하되, 관리·검색·출력 경로는
// 검색 봇과 동일하게 막는다. 훈련만 거부하거나 특정 봇만 차단하려면 그 봇을
// 이 목록에서 빼고 `Disallow: /` 만 가진 그룹을 따로 만든다.
const AI_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Amazonbot',
  'Bytespider',
  'Meta-ExternalAgent',
];

// 전면 허용 — 이미지 전용 크롤러와 광고 심사 봇은 차단 경로가 필요 없다.
const FULL_ACCESS_AGENTS = [
  'Googlebot-Image',
  'AdsBot-Google',
];

function standardGroup(agent) {
  return [
    `User-agent: ${agent}`,
    'Allow: /',
    ...ALLOW_PATHS.map((path) => `Allow: ${path}`),
    ...DISALLOW_PATHS.map((path) => `Disallow: ${path}`),
    '',
  ];
}

function fullAccessGroup(agent) {
  return [
    `User-agent: ${agent}`,
    'Allow: /',
    '',
  ];
}

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const lines = [
    ...SEARCH_AGENTS.flatMap(standardGroup),
    ...FULL_ACCESS_AGENTS.flatMap(fullAccessGroup),
    ...AI_AGENTS.flatMap(standardGroup),
    ...standardGroup('*'),
    `Sitemap: ${origin}/sitemap.xml`,
    `Sitemap: ${origin}/sitemap-news.xml`,
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
