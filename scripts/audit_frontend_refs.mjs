#!/usr/bin/env node
/**
 * Frontend reference audit — 안정성 패키지 3차 (2026-05-26).
 *
 * 이번 세션에서 잡힌 회귀 패턴들을 자동 검출한다:
 *  1) 자산 캐시 토큰 누락 — sync_versions.sh 가 갱신하지 않는 ?v= 토큰이
 *     HTML 에 살아 있으면 배포 후 신규 코드가 stale 캐시로 묻힌다.
 *     (memorabilia-shared.js 회귀 — 03.128.00 에서 추가)
 *  2) CSS 클래스 정의 누락 — HTML 이 class 를 쓰는데 CSS 어디에도
 *     해당 셀렉터가 없으면 의도된 스타일이 적용되지 않는다.
 *     (.v3-modal-backdrop 회귀 — 03.127.02 에서 추가)
 *  3) JS 가 참조하는 DOM id 가 HTML 에서 사라진 경우 — null .value 가
 *     던지는 TypeError 회귀. (#memo-event-en/ko 회귀 — 03.125.01 에서 잡힘)
 *
 * 사용:
 *   node scripts/audit_frontend_refs.mjs              # 보고만, exit 0
 *   node scripts/audit_frontend_refs.mjs --strict     # 위반이 있으면 exit 1
 *
 * 출력은 사람이 읽기 쉬운 카테고리 별 목록. release_preflight.sh 에서
 * --strict 로 실행하면 배포 차단도 가능 (단계적 도입 권장 — 우선 warn-only).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict');

// ── 파일 수집 ─────────────────────────────────────────────────────────────
function walk(dir, exts, skipDirs = new Set(['node_modules', '.git', '.wrangler', 'output'])) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, exts, skipDirs));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

const HTML_FILES = walk(ROOT, ['.html']);
const JS_FILES = walk(join(ROOT, 'js'), ['.js']);
const CSS_FILES = walk(join(ROOT, 'css'), ['.css']);

const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(ROOT, p);

// ── 1) Asset cache-bust audit ─────────────────────────────────────────────
// HTML 안의 /js/foo.js?v=... 또는 /css/foo.css?v=... 토큰을 모두 모으고,
// sync_versions.sh 가 그 파일 토큰을 갱신하는지 확인.
const ASSET_REF_RE = /(?:href|src)="(\/(?:js|css)\/[a-zA-Z0-9_\-/.]+)\?v=[^"]+"/g;

function collectAssetRefs() {
  const refs = new Map(); // path → [files]
  for (const f of HTML_FILES) {
    const txt = read(f);
    for (const m of txt.matchAll(ASSET_REF_RE)) {
      const p = m[1];
      if (!refs.has(p)) refs.set(p, []);
      refs.get(p).push(rel(f));
    }
  }
  return refs;
}

function syncScriptCoverage() {
  // sync_versions.sh 의 perl -0pi -e "..." 안에 등장하는 자산 경로를 추출.
  // 이스케이프 변형이 다양하므로(backslash, # delimiter) 가장 단순한 접근:
  // 파일 텍스트의 모든 backslash 를 제거한 뒤 /js/foo.js?v= 패턴을 찾는다.
  const sync = read(join(ROOT, 'scripts/sync_versions.sh'));
  const normalized = sync.replace(/\\/g, '');
  const found = new Set();
  for (const m of normalized.matchAll(/\/((?:js|css)\/[a-zA-Z][a-zA-Z0-9_-]+\.(?:js|css))\?v=/g)) {
    found.add(`/${m[1]}`);
  }
  return found;
}

const refs = collectAssetRefs();
const syncCovers = syncScriptCoverage();
const driftAssets = [];
for (const [p] of refs) {
  if (!syncCovers.has(p)) driftAssets.push(p);
}

// ── 2) CSS class definition coverage ──────────────────────────────────────
// HTML 에서 class="..." 모음 → CSS 에서 .foo / .foo[attr] / .foo.bar / .foo::*
// 형태로 정의되어 있는지. 동적 추가 클래스(JS) 는 false negative 가 많아 warn only.
const CLASS_ATTR_RE = /class="([^"]+)"/g;
const CSS_SELECTOR_RE = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;

function collectHtmlClasses() {
  const set = new Set();
  for (const f of HTML_FILES) {
    const txt = read(f);
    for (const m of txt.matchAll(CLASS_ATTR_RE)) {
      m[1].split(/\s+/).filter(Boolean).forEach((c) => set.add(c));
    }
  }
  return set;
}
function collectCssClasses() {
  const set = new Set();
  for (const f of CSS_FILES) {
    const txt = read(f);
    for (const m of txt.matchAll(CSS_SELECTOR_RE)) set.add(m[1]);
  }
  return set;
}
function collectJsClasses() {
  // JS 가 추가하는 클래스(classList.add, className=, innerHTML 안의 class= 등)
  const set = new Set();
  const patterns = [
    /classList\.(?:add|toggle|remove)\(\s*['"`]([a-zA-Z][a-zA-Z0-9_-]*)['"`]/g,
    /className\s*=\s*['"`]([a-zA-Z][^'"`]*?)['"`]/g,
    /class="([a-zA-Z][^"]*?)"/g, // 템플릿 리터럴 안 HTML 등
  ];
  for (const f of JS_FILES) {
    const txt = read(f);
    for (const re of patterns) {
      for (const m of txt.matchAll(re)) {
        m[1].split(/\s+/).filter(Boolean).forEach((c) => set.add(c));
      }
    }
  }
  return set;
}

const htmlClasses = collectHtmlClasses();
const cssClasses = collectCssClasses();
const jsClasses = collectJsClasses();
// HTML 에 등장 + CSS·JS 어디에도 없는 클래스 (오타·사라진 정의 의심)
const orphanClasses = [...htmlClasses]
  .filter((c) => !cssClasses.has(c) && !jsClasses.has(c))
  // 알려진 hook-only 클래스 (JS 가 보지만 CSS 가 스타일 안 함) — false positive 제외
  .filter((c) => !/^(data-|aria-|skip-link|hidden|active|is-)/.test(c));

// ── 3) DOM id reference audit ──────────────────────────────────────────────
// JS 에서 $('#foo') / getElementById('foo') / querySelector('#foo') 모두 모으고
// HTML 에 id="foo" 가 있는지.
const HTML_ID_RE = /id="([a-zA-Z0-9_-]+)"/g;
const JS_ID_REF_RES = [
  /\$\(\s*['"`]#([a-zA-Z0-9_-]+)['"`]\s*[,)]/g,
  /getElementById\(\s*['"`]([a-zA-Z0-9_-]+)['"`]\s*\)/g,
  /querySelector\(\s*['"`]#([a-zA-Z0-9_-]+)['"`]\s*\)/g,
];

function collectHtmlIds() {
  const set = new Set();
  for (const f of HTML_FILES) {
    const txt = read(f);
    for (const m of txt.matchAll(HTML_ID_RE)) set.add(m[1]);
  }
  return set;
}
function collectJsIds() {
  const out = new Map(); // id → [files]
  for (const f of JS_FILES) {
    const txt = read(f);
    for (const re of JS_ID_REF_RES) {
      for (const m of txt.matchAll(re)) {
        const id = m[1];
        if (!out.has(id)) out.set(id, new Set());
        out.get(id).add(rel(f));
      }
    }
  }
  return out;
}

const htmlIds = collectHtmlIds();
const jsIds = collectJsIds();
const orphanIds = [];
for (const [id, files] of jsIds) {
  if (!htmlIds.has(id)) orphanIds.push({ id, files: [...files] });
}
// JS 가 동적으로 생성하는 id (innerHTML 안에서 id="..." 로 만든 것) 도 jsIds 와
// htmlIds 어느 쪽에도 안 들어가는 경우가 있어 false positive 줄임:
const jsCreatedIds = new Set();
for (const f of JS_FILES) {
  const txt = read(f);
  for (const m of txt.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)) jsCreatedIds.add(m[1]);
  // 템플릿 리터럴 ${prefix}-foo 변형은 무시
}
const realOrphanIds = orphanIds.filter((o) => !jsCreatedIds.has(o.id));

// ── 보고 ──────────────────────────────────────────────────────────────────
const report = [];
report.push('━━━ Frontend Reference Audit ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
report.push(`HTML files: ${HTML_FILES.length} · JS: ${JS_FILES.length} · CSS: ${CSS_FILES.length}`);
report.push('');

let critical = 0;

report.push('▎ 1) Asset cache-bust drift');
report.push(`   HTML 자산 토큰 ${refs.size}개 / sync_versions.sh 커버 ${syncCovers.size}개`);
if (driftAssets.length) {
  critical += driftAssets.length;
  report.push(`   ❌ 드리프트 ${driftAssets.length}개 — 배포 후 stale 캐시 위험:`);
  for (const p of driftAssets) {
    report.push(`      • ${p}   (HTML: ${refs.get(p).join(', ')})`);
  }
  report.push('   → scripts/sync_versions.sh 의 perl 치환 라인에 추가 필요');
} else {
  report.push('   ✓ 모든 자산 토큰이 sync_versions.sh 에서 갱신됨');
}
report.push('');

report.push('▎ 2) CSS 클래스 정의 누락 (오타·삭제된 정의 의심)');
if (orphanClasses.length) {
  report.push(`   ⚠ ${orphanClasses.length}개 클래스가 HTML 에 있으나 CSS·JS 어디에도 없음:`);
  for (const c of orphanClasses.slice(0, 20)) report.push(`      • .${c}`);
  if (orphanClasses.length > 20) report.push(`      … 외 ${orphanClasses.length - 20}`);
  report.push('   (참고: JS 가 동적으로 의미 부여하거나 utility 클래스라 false positive 가능)');
} else {
  report.push('   ✓ 누락 의심 0건');
}
report.push('');

report.push('▎ 3) JS 가 참조하는 DOM id 중 HTML 에 없는 것 (TypeError 위험)');
if (realOrphanIds.length) {
  report.push(`   ⚠ ${realOrphanIds.length}건 — null .value / null.click 등 TypeError 위험:`);
  for (const { id, files } of realOrphanIds.slice(0, 20)) {
    report.push(`      • #${id}   ← ${files.join(', ')}`);
  }
  if (realOrphanIds.length > 20) report.push(`      … 외 ${realOrphanIds.length - 20}`);
  report.push('   (참고: 다른 페이지 전용 id 를 공유 모듈이 참조해서 정상인 경우도 있음)');
} else {
  report.push('   ✓ 위험 참조 0건');
}
report.push('');

report.push('━━━ 요약 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
report.push(`Critical (자산 캐시 드리프트): ${driftAssets.length}건`);
report.push(`Warn (CSS 클래스 누락):       ${orphanClasses.length}건`);
report.push(`Warn (DOM id 참조 누락):       ${realOrphanIds.length}건`);

console.log(report.join('\n'));

if (STRICT && critical > 0) {
  console.error('\n💥 --strict 모드: critical 위반으로 종료 코드 1');
  process.exit(1);
}
process.exit(0);
