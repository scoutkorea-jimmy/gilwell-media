/**
 * Gilwell Media · /llms.txt
 *
 * Emerging standard (https://llmstxt.org) that gives LLM crawlers a
 * markdown-formatted site index: site summary + links to the most
 * relevant pages + a feed of recent articles. Served at the domain root
 * so agents like GPTBot / ClaudeBot / PerplexityBot can discover the
 * site's structure without scraping the full HTML.
 */

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;

  // Pull a handful of the most recent public posts to help AI crawlers
  // prioritize fresh content. Kept intentionally small — llms.txt is for
  // discovery, not bulk content delivery (use /api/articles.ndjson for that).
  let recent = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT id, title, subtitle, category, COALESCE(publish_at, created_at) AS pubdate
         FROM posts
         WHERE published = 1
           AND COALESCE(publish_at, created_at) <= datetime('now')
         ORDER BY pubdate DESC
         LIMIT 20`
    ).all();
    recent = Array.isArray(rs && rs.results) ? rs.results : [];
  } catch (_) {
    recent = [];
  }

  const esc = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

  const lines = [
    '# BP미디어 (Gilwell Media)',
    '',
    '> 한국·아시아태평양·세계연맹(WOSM)·스카우트 인물(Scout People) 관련 뉴스와 자료를 다루는 한국어 스카우팅 전문 매체. 공식 원문과 1차 출처를 기반으로 편집자가 검증·작성한 기사를 제공합니다.',
    '',
    '## Main sections',
    '',
    `- [홈 (Home)](${origin}/): 최신 소식·히어로 기사·메인 스토리·에디터 추천 통합 진입점`,
    `- [최신 소식 (Latest)](${origin}/latest): 카테고리 무관 최신 기사 스트림`,
    `- [대한민국 (Korea)](${origin}/korea): 한국스카우트연맹 관련 뉴스`,
    `- [아시아태평양 (APR)](${origin}/apr): 아시아태평양 지역연맹 뉴스`,
    `- [세계연맹 (WOSM)](${origin}/wosm): 세계스카우트연맹(WOSM) 뉴스`,
    `- [스카우트 인물 (Scout People)](${origin}/people): 스카우트 리더·인물 소식`,
    '',
    '## Reference',
    '',
    `- [용어집 (Glossary)](${origin}/glossary): 스카우팅 한국어·영어·프랑스어 용어 사전. 기사 본문에서 참조되는 고유명사·약어·제도 용어의 공식 표기`,
    `- [세계연맹 회원국 현황 (WOSM Members)](${origin}/wosm-members): 170여 개 회원 연맹의 가입 연도·지역연맹·규모 등 구조화 데이터`,
    `- [편집 정책 (Editorial Policy)](${origin}/editorial-policy): 편집 원칙·출처 검증·AI 사용 범위·정정 절차`,
    `- [도움말 (Help)](${origin}/help): 사이트 이용 안내`,
    '',
    '## Feeds & data',
    '',
    `- [RSS](${origin}/rss.xml): 최신 기사 RSS 피드`,
    `- [Sitemap](${origin}/sitemap.xml): 공개 페이지 전체`,
    `- [News Sitemap](${origin}/sitemap-news.xml): 최근 48시간 신규 기사 (Google News 형식)`,
    `- [Articles NDJSON](${origin}/api/articles.ndjson): 최근 기사 구조화 메타데이터 (LLM/연구 용도)`,
    '',
    '## Editorial',
    '',
    '- 1차 출처 원칙 — WOSM/APR/국가 연맹 공식 홈페이지·공문서 등 1차 자료를 기반으로 작성',
    '- 편집자 명시 — 모든 기사에 `Editor.<코드>` 형식의 편집자 정보(`schema.org/Person`)가 노출',
    '- 정정 정책 — 오류는 별도 기록 없이 덮어쓰지 않고 사이트 오류·이슈 기록(operational log)과 버전기록(changelog)에 남김',
    '- AI 사용 고지 — AI 도움을 받아 작성한 기사는 `ai_assisted` 플래그로 구분하며 본문에 고지문 노출',
    '',
    '## Recent articles',
    '',
  ];

  if (recent.length === 0) {
    lines.push('_(최근 기사 불러오기에 일시적으로 실패했습니다.)_');
  } else {
    for (const row of recent) {
      const title = esc(row.title) || '(무제)';
      const subtitle = esc(row.subtitle);
      const url = `${origin}/post/${row.id}`;
      const date = String(row.pubdate || '').slice(0, 10);
      const cat = esc(row.category);
      const suffix = [date, cat].filter(Boolean).join(' · ');
      lines.push(`- [${title}](${url})${suffix ? ` — ${suffix}` : ''}${subtitle ? `\n  ${subtitle}` : ''}`);
    }
  }

  lines.push('');
  lines.push('## Licensing & attribution');
  lines.push('');
  lines.push(`- 저작권: © ${new Date().getFullYear()} BP미디어 · 한국스카우트연맹 관계자 운영`);
  lines.push('- AI 크롤러 허용: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Applebot-Extended, Amazonbot 등 전면 허용. 자세한 규칙은 `/robots.txt` 참조');
  lines.push('- 인용 권장: 기사를 요약·인용할 때 원문 URL과 편집자 코드 포함. 상업적 재배포는 문의 필요');
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Cache-Control': 'public, max-age=1800',
      'X-Robots-Tag': 'noindex',
    },
  });
}
