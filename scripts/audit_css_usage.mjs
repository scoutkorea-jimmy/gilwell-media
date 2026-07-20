#!/usr/bin/env node
/**
 * css/style.css 의 각 규칙이 어느 공개 표면에서 쓰이는지 기계적으로 귀속시킨다.
 *
 * 왜 필요한가: style.css 는 320KB 이고 공개 페이지 17개가 공유한다. 눈으로
 * 섹션 배너를 보고 줄 범위를 잘라내면 반드시 사고가 난다 — 실제로 calendar-*
 * 블록 안에는 기사 상세가 쓰는 .calendar-related-post-* 가 섞여 있다.
 *
 * 판정 규칙(보수적):
 *   - 규칙의 셀렉터에서 클래스 토큰을 뽑는다.
 *   - 콤마로 나뉜 분기 중 "하나라도" 모든 클래스가 어떤 표면의 소스에 등장하면
 *     그 표면이 해당 규칙을 필요로 한다고 본다.
 *   - 클래스 토큰이 전혀 없는 규칙(:root, body, a, @font-face...)은 GLOBAL.
 *   - 리터럴로 안 잡히는 클래스는 UNMATCHED 로 분류하고, 런타임 조립 가능성을
 *     알리는 접두사 힌트를 함께 출력한다. 절대 "미사용"으로 단정하지 않는다.
 *
 * 사용:
 *   node scripts/audit_css_usage.mjs            # 요약
 *   node scripts/audit_css_usage.mjs --json     # 전체 규칙 귀속 JSON
 *   node scripts/audit_css_usage.mjs --surface home   # 특정 표면이 필요로 하는 규칙
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'css/style.css');

// 표면(surface) = 하나의 공개 페이지가 로드하는 소스 전체.
// 공유 런타임(main.js/site-chrome.js/chatbot.js)은 모든 표면에 포함된다.
const SHARED_JS = ['js/main.js', 'js/site-chrome.js', 'js/chatbot.js'];

const SURFACES = {
  home: ['index.html', 'js/home.js', 'js/home-helpers.js', 'js/home-render.js', 'js/home-hero.js', 'js/home-runtime.js'],
  board: ['latest.html', 'korea.html', 'apr.html', 'wosm.html', 'people.html', 'js/board.js', 'js/board-write.js'],
  post: ['functions/post/[id].js', 'js/post-page.js', 'functions/feature/[category]/[slug].js'],
  glossary: ['glossary.html', 'js/glossary.js', 'functions/glossary-raw.js'],
  calendar: ['calendar.html', 'js/calendar.js'],
  memorabilia: ['memorabilia.html', 'js/memorabilia.js', 'js/memorabilia-shared.js'],
  wosm_members: ['wosm-members.html', 'js/wosm-members.js'],
  search: ['search.html', 'js/search.js'],
  jamboree16: ['jamboree16.html', 'js/jamboree16.js'],
  kms: ['kms.html', 'js/kms.js'],
  static: ['about.html', 'contributors.html', 'privacy.html', 'editorial-policy.html', '404.html', '500.html'],
};

function readIfExists(rel) {
  const full = path.join(ROOT, rel);
  try { return fs.readFileSync(full, 'utf8'); } catch { return ''; }
}

/** 소스에서 클래스로 쓰였을 법한 토큰을 뽑는다 (문자열/속성 어디에 있든). */
function harvestTokens(source) {
  const tokens = new Set();
  const re = /[A-Za-z_][A-Za-z0-9_-]{1,}/g;
  let m;
  while ((m = re.exec(source)) !== null) tokens.add(m[0]);
  return tokens;
}

function buildSurfaceTokens() {
  const out = {};
  for (const [name, files] of Object.entries(SURFACES)) {
    const all = [...files, ...SHARED_JS];
    let text = '';
    for (const f of all) text += '\n' + readIfExists(f);
    out[name] = { tokens: harvestTokens(text), files: all };
  }
  return out;
}

/**
 * CSS 를 최상위 규칙 단위로 스캔한다. @media/@supports 는 내부 규칙을 펼친다.
 * 문자열/주석 안의 중괄호에 속지 않도록 상태를 들고 간다.
 */
function parseRules(css) {
  const rules = [];
  let i = 0;
  const n = css.length;
  let selStart = 0;
  const atStack = [];

  function lineAt(idx) {
    let line = 1;
    for (let k = 0; k < idx && k < n; k++) if (css.charCodeAt(k) === 10) line++;
    return line;
  }

  while (i < n) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      if (selStart >= i - 2) selStart = i;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < n && css[i] !== quote) { if (css[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (ch === '{') {
      const rawPrelude = css.slice(selStart, i);
      // 셀렉터 판정에는 주석을 뺀 텍스트를 쓴다. 주석 안의 ".무언가" 가 클래스로
      // 오인되면 귀속이 틀어진다(실제로 169개 규칙의 프렐류드에 주석이 붙어 있다).
      // 다만 추출용 범위(startIdx)는 주석을 포함한 원본 그대로 둬서, 규칙을 옮길 때
      // 바로 위 설명 주석이 함께 따라가도록 한다.
      const prelude = stripCssComments(rawPrelude).trim();
      if (prelude.startsWith('@')) {
        // at-rule: media/supports 는 내부를 계속 스캔, 그 외(@font-face/@keyframes)는 통째로 건너뜀
        const nested = /^@(media|supports|layer|container)\b/i.test(prelude);
        if (nested) {
          atStack.push(prelude);
          i++;
          selStart = i;
          continue;
        }
        const close = matchBrace(css, i);
        rules.push({
          type: 'at',
          prelude,
          start: lineAt(selStart),
          end: lineAt(close),
          startIdx: selStart,
          endIdx: close + 1,
          bytes: Buffer.byteLength(css.slice(selStart, close + 1), 'utf8'),
          media: atStack.slice(),
        });
        i = close + 1;
        selStart = i;
        continue;
      }
      const close = matchBrace(css, i);
      if (prelude) {
        rules.push({
          type: 'rule',
          selector: prelude.replace(/\s+/g, ' '),
          start: lineAt(selStart),
          end: lineAt(close),
          startIdx: selStart,
          endIdx: close + 1,
          bytes: Buffer.byteLength(css.slice(selStart, close + 1), 'utf8'),
          media: atStack.slice(),
        });
      }
      i = close + 1;
      selStart = i;
      continue;
    }
    if (ch === '}') {
      atStack.pop();
      i++;
      selStart = i;
      continue;
    }
    i++;
  }
  return rules;
}

/** 문자열 리터럴을 건드리지 않고 /* *\/ 주석만 제거한다. */
function stripCssComments(value) {
  let out = '';
  let i = 0;
  const n = value.length;
  while (i < n) {
    const ch = value[i];
    if (ch === '/' && value[i + 1] === '*') {
      const end = value.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += ch; i++;
      while (i < n && value[i] !== q) { if (value[i] === '\\') { out += value[i]; i++; } out += value[i]; i++; }
      out += value[i] || ''; i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function matchBrace(css, openIdx) {
  let depth = 0;
  let i = openIdx;
  const n = css.length;
  while (i < n) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue; }
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < n && css[i] !== q) { if (css[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return n - 1;
}

/** 셀렉터를 콤마 분기로 나누고, 각 분기의 클래스 토큰 집합을 돌려준다. */
function selectorBranches(selector) {
  return splitTopLevel(selector, ',').map((branch) => {
    const classes = new Set();
    // :not(...) 등 함수형 인자 안의 클래스는 존재 판정에서 제외한다(있으면 오탐).
    const stripped = branch.replace(/:[a-z-]+\([^)]*\)/gi, ' ');
    const re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
    let m;
    while ((m = re.exec(stripped)) !== null) classes.add(m[1]);
    return { branch: branch.trim(), classes: [...classes] };
  });
}

function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** 런타임 조립 흔적 힌트: 클래스의 접두사가 소스에 문자열로 등장하는가. */
function prefixHint(cls, surfaceTokens) {
  const hits = [];
  for (const [name, { tokens }] of Object.entries(surfaceTokens)) {
    for (let len = cls.length - 1; len >= 6; len--) {
      const pre = cls.slice(0, len);
      if (!pre.endsWith('-')) continue;
      if (tokens.has(pre) || tokens.has(pre.slice(0, -1))) { hits.push(`${name}:${pre}*`); break; }
    }
  }
  return hits;
}

function main() {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const surfaceTokens = buildSurfaceTokens();
  const rules = parseRules(css);

  const report = [];
  for (const rule of rules) {
    if (rule.type === 'at') {
      report.push({ ...rule, surfaces: ['GLOBAL'], verdict: 'global' });
      continue;
    }
    const branches = selectorBranches(rule.selector);
    const allClasses = [...new Set(branches.flatMap((b) => b.classes))];
    if (!allClasses.length) {
      report.push({ ...rule, classes: [], surfaces: ['GLOBAL'], verdict: 'global' });
      continue;
    }
    const surfaces = [];
    for (const [name, { tokens }] of Object.entries(surfaceTokens)) {
      const ok = branches.some((b) => b.classes.length && b.classes.every((c) => tokens.has(c)));
      if (ok) surfaces.push(name);
    }
    const verdict = surfaces.length ? 'used' : 'unmatched';
    const entry = { ...rule, classes: allClasses, surfaces, verdict };
    if (verdict === 'unmatched') entry.hints = [...new Set(allClasses.flatMap((c) => prefixHint(c, surfaceTokens)))];
    report.push(entry);
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2));
    return;
  }

  const surfaceArg = process.argv.indexOf('--surface');
  if (surfaceArg !== -1) {
    const want = process.argv[surfaceArg + 1];
    const rows = report.filter((r) => r.surfaces.includes(want));
    const bytes = rows.reduce((a, r) => a + r.bytes, 0);
    console.log(`surface=${want}: ${rows.length} rules, ${bytes} B`);
    return;
  }

  const total = report.reduce((a, r) => a + r.bytes, 0);
  const byVerdict = {};
  for (const r of report) {
    byVerdict[r.verdict] = byVerdict[r.verdict] || { rules: 0, bytes: 0 };
    byVerdict[r.verdict].rules++;
    byVerdict[r.verdict].bytes += r.bytes;
  }

  console.log(`css/style.css — ${rules.length} rules, ${total} B\n`);
  console.log('판정별:');
  for (const [k, v] of Object.entries(byVerdict)) {
    console.log(`  ${k.padEnd(10)} ${String(v.rules).padStart(5)} rules  ${String(v.bytes).padStart(8)} B`);
  }

  console.log('\n표면별 필요 바이트 (중복 포함 — 한 규칙이 여러 표면에 잡힐 수 있음):');
  const perSurface = {};
  for (const name of Object.keys(SURFACES)) perSurface[name] = { rules: 0, bytes: 0 };
  for (const r of report) {
    for (const s of r.surfaces) {
      if (s === 'GLOBAL') continue;
      perSurface[s].rules++;
      perSurface[s].bytes += r.bytes;
    }
  }
  for (const [k, v] of Object.entries(perSurface).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${k.padEnd(14)} ${String(v.rules).padStart(5)} rules  ${String(v.bytes).padStart(8)} B`);
  }

  const globalBytes = report.filter((r) => r.surfaces.includes('GLOBAL')).reduce((a, r) => a + r.bytes, 0);
  const homeNeeded = report.filter((r) => r.surfaces.includes('GLOBAL') || r.surfaces.includes('home'));
  const homeBytes = homeNeeded.reduce((a, r) => a + r.bytes, 0);
  console.log(`\nGLOBAL(셀렉터에 클래스 없음 등): ${globalBytes} B`);
  console.log(`홈이 필요로 하는 합계(GLOBAL+home): ${homeBytes} B  (${(homeBytes / total * 100).toFixed(1)}%)`);

  const homeOnly = report.filter((r) => r.verdict === 'used' && r.surfaces.length === 1 && r.surfaces[0] === 'home');
  console.log(`홈 전용 규칙: ${homeOnly.length}개 ${homeOnly.reduce((a, r) => a + r.bytes, 0)} B`);

  const unmatched = report.filter((r) => r.verdict === 'unmatched');
  const withHints = unmatched.filter((r) => r.hints && r.hints.length);
  console.log(`\nUNMATCHED ${unmatched.length}개 ${unmatched.reduce((a, r) => a + r.bytes, 0)} B`);
  console.log(`  그중 런타임 조립 힌트 있음: ${withHints.length}개 (삭제 금지 후보)`);
  console.log(`  힌트 없음: ${unmatched.length - withHints.length}개 — 수동 확인 대상`);

  console.log('\n단일 표면 전용 규칙 (분리 후보):');
  const soleBy = {};
  for (const r of report) {
    if (r.verdict !== 'used' || r.surfaces.length !== 1) continue;
    const s = r.surfaces[0];
    soleBy[s] = soleBy[s] || { rules: 0, bytes: 0 };
    soleBy[s].rules++;
    soleBy[s].bytes += r.bytes;
  }
  for (const [k, v] of Object.entries(soleBy).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${k.padEnd(14)} ${String(v.rules).padStart(5)} rules  ${String(v.bytes).padStart(8)} B`);
  }
}

main();
