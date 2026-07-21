#!/usr/bin/env node
/**
 * 공개 노출 경계 감사 — release preflight 게이트
 *
 * `wrangler pages deploy .` 는 저장소 루트를 통째로 업로드하므로, 저장소에
 * 파일을 추가하면 기본적으로 공개 URL 로 읽힌다. 실제 차단은
 * `functions/_middleware.js` 의 `isBlockedInternalPath()` 가 수행한다.
 *
 * 이 스크립트는 그 차단 목록이 저장소 실제 구성과 어긋나지 않는지 검증한다.
 * 두 방향 모두 막는다:
 *
 *   1) 새 내부 디렉토리·파일을 추가했는데 차단 목록에 안 넣은 경우
 *      → 조용히 공개된다. (2026-07-21 사고: rules/, db/, output/ 노출)
 *
 *   2) 런타임이 fetch 하는 자산을 차단 목록에 넣은 경우
 *      → 기능이 죽는다. (`.assetsignore` 에 card-news-app / dist-homepage 를
 *        넣었던 시한폭탄 — Pages 가 그 파일을 무시한 덕에 우연히 살았다.)
 *
 * 네트워크 없이 동작한다. 라이브 확인은 tests/smoke-internal-exposure.spec.ts.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlockedInternalPath } from '../functions/_middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 브라우저에 서빙되어야 하는 최상위 항목.
 * `*.html` 은 자동으로 공개로 간주한다 (사이트 페이지 = URL).
 * 여기에 없는 최상위 항목은 전부 "내부"로 간주해 차단을 요구한다.
 */
const PUBLIC_ENTRIES = new Set([
  // 정적 자산 디렉토리
  'css', 'js', 'img', 'data', 'fonts',
  // Pages Functions (정적 자산으로 업로드되지 않지만 URL 을 소유)
  'functions',
  // 런타임이 직접 참조하는 앱 소스
  'card-news-app',   // functions/card-news/[id].js 가 .jsx 를 브라우저로 내려보냄
  'dist-homepage',   // js/dreampath.js 가 문서 템플릿을 iframe 으로 로드
  // 루트 파일
  '_headers', '_redirects',
  'VERSION', 'ADMIN_VERSION', 'ASSET_VERSION',
  'DREAMPATH.md',    // js/dreampath.js `_renderRulesMarkdown()` 이 fetch
  'robots.txt', 'sitemap.xml',
]);

/**
 * 절대 차단되면 안 되는 구체 경로 — 차단 시 즉시 기능이 죽는다.
 * 위 PUBLIC_ENTRIES 와 중복이지만, 실제 경로 문자열로 한 번 더 확인한다.
 */
const MUST_STAY_PUBLIC = [
  '/DREAMPATH.md',
  '/card-news-app/app.jsx',
  '/card-news-app/cards.jsx',
  '/card-news-app/styles.css',
  '/dist-homepage/templates-app.js',
  '/dist-homepage/templates.css',
  '/data/changelog.json',
  '/VERSION',
  '/ADMIN_VERSION',
  '/css/style.css',
  '/js/main.js',
  '/js/dreampath.js',
  '/img/og-default.png',
  '/index.html',
  '/',
];

function trackedTopLevelEntries() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  const entries = new Set();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    entries.add(line.split('/')[0]);
  }
  return [...entries].sort();
}

function main() {
  const errors = [];
  const warnings = [];

  // ── 1) 내부 항목이 전부 차단되는가 ────────────────────────────────
  const internalUnblocked = [];
  for (const entry of trackedTopLevelEntries()) {
    if (PUBLIC_ENTRIES.has(entry)) continue;
    if (entry.endsWith('.html')) continue;      // 사이트 페이지
    // 디렉토리/파일 양쪽 형태로 확인
    const asFile = `/${entry}`;
    const asDir = `/${entry}/probe`;
    if (!isBlockedInternalPath(asFile) && !isBlockedInternalPath(asDir)) {
      internalUnblocked.push(entry);
    }
  }
  if (internalUnblocked.length) {
    errors.push(
      `공개 노출 위험 — 아래 최상위 항목이 차단 목록에 없습니다:\n` +
      internalUnblocked.map((e) => `    • ${e}`).join('\n') +
      `\n  해소법: functions/_middleware.js 의 BLOCKED_PREFIXES / BLOCKED_FILES 에 추가하거나,\n` +
      `         정말 공개해야 한다면 scripts/audit_public_exposure.mjs 의 PUBLIC_ENTRIES 에 추가하세요.`
    );
  }

  // ── 2) 살아야 하는 경로가 차단되지 않았는가 ──────────────────────
  const wronglyBlocked = MUST_STAY_PUBLIC.filter((p) => isBlockedInternalPath(p));
  if (wronglyBlocked.length) {
    errors.push(
      `기능 파괴 위험 — 런타임이 fetch 하는 경로가 차단되었습니다:\n` +
      wronglyBlocked.map((p) => `    • ${p}`).join('\n') +
      `\n  해소법: functions/_middleware.js 의 차단 목록에서 제거하세요.`
    );
  }

  // ── 3) 차단 목록이 실제로 존재하지 않는 경로를 가리키는가 (정보) ──
  //     저장소에서 사라진 디렉토리를 계속 차단하는 것 자체는 무해하므로 경고만.
  if (warnings.length) warnings.forEach((w) => console.warn(`  ! ${w}`));

  if (errors.length) {
    console.error('공개 노출 경계 감사 실패:\n');
    errors.forEach((e) => console.error(`  ${e}\n`));
    process.exit(1);
  }

  console.log(
    `공개 노출 경계 OK — 내부 항목 전부 차단됨, 런타임 의존 경로 ${MUST_STAY_PUBLIC.length}개 정상.`
  );
}

main();
