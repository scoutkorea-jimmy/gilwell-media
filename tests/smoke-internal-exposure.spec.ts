import { test, expect } from '@playwright/test';

/**
 * 내부 파일 공개 노출 회귀 가드 (라이브 검증)
 *
 * 배경: `wrangler pages deploy .` 가 저장소 루트를 통째로 업로드하므로 개발·운영
 * 파일이 기본적으로 공개된다. 2026-07-21 에 rules/·docs/·db/schema.sql·
 * wrangler.toml(D1 database_id)·output/(게시글 151행 덤프)이 200 으로 노출된 것을
 * 확인하고 functions/_middleware.js `isBlockedInternalPath()` 로 차단했다.
 *
 * 정적 검증은 scripts/audit_public_exposure.mjs (preflight 게이트).
 * 이 파일은 "배포된 결과가 실제로 그런가"를 확인한다 — `.assetsignore` 처럼
 * 설정이 조용히 무시되는 경우를 잡아낸다.
 */

const BLOCKED = [
  '/rules/README.md',
  '/rules/10-site.md',
  '/docs/feature-definition.md',
  '/docs/working-notes.md',
  '/db/schema.sql',
  '/scripts/deploy_production.sh',
  '/scripts/audit_public_exposure.mjs',
  '/workers/publish-due-scheduler.js',
  '/tests/smoke-home.spec.ts',
  '/wrangler.toml',
  '/wrangler.publish-due.toml',
  '/package.json',
  '/playwright.config.ts',
  '/deploy.sh',
  '/CLAUDE.md',
  '/AGENTS.md',
  '/README.md',
  '/.dev.vars.example',
  '/.gitignore',
];

/**
 * 런타임이 실제로 fetch 하는 경로 — 차단하면 기능이 죽는다.
 * 각 항목 옆에 "누가 쓰는지"를 남겨 둔다. 차단 목록을 넓힐 때 이 테스트가 막는다.
 */
const MUST_STAY_LIVE: Array<[string, string]> = [
  ['/dreampath/DREAMPATH.md', 'dreampath/app.js _renderRulesMarkdown() 이 fetch'],
  ['/dreampath/app.js', 'Dreampath 앱 런타임'],
  ['/card-news-app/app.jsx', 'functions/card-news/[id].js 가 브라우저 Babel 로 변환'],
  ['/card-news-app/cards.jsx', 'functions/card-news/[id].js'],
  ['/card-news-app/styles.css', 'functions/card-news/[id].js'],
  ['/dreampath/templates/templates-app.js', 'dreampath/app.js 문서 템플릿 iframe'],
  ['/dreampath/templates/templates.css', 'dreampath/app.js 문서 템플릿 iframe'],
  ['/data/changelog.json', 'js/kms.js renderChangelog()'],
  ['/VERSION', '배포 검증 · 외부 모니터링'],
  ['/css/style.css', '공개 페이지 공용 스타일'],
  ['/js/main.js', 'GW 네임스페이스'],
  ['/robots.txt', '검색엔진'],
  ['/sitemap.xml', '검색엔진'],
];

test.describe('내부 파일이 공개 URL 로 노출되지 않는다', () => {
  for (const path of BLOCKED) {
    test(`${path} 는 404`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(
        res.status(),
        `${path} 가 공개되고 있습니다. functions/_middleware.js 의 차단 목록을 확인하세요.`
      ).toBe(404);
    });
  }
});

test.describe('런타임이 의존하는 경로는 살아 있다', () => {
  for (const [path, owner] of MUST_STAY_LIVE) {
    test(`${path} 는 200 (${owner})`, async ({ request }) => {
      const res = await request.get(path);
      expect(
        res.status(),
        `${path} 가 죽었습니다 — ${owner}. 차단 목록에 잘못 들어갔는지 확인하세요.`
      ).toBe(200);
    });
  }
});
