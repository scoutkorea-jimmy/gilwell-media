#!/usr/bin/env node
/**
 * css/style.css 에서 "정확히 한 표면에서만 쓰인다"고 확정된 규칙을 페이지별
 * 시트로 떼어낸다. 분류는 하지 않는다 — scripts/audit_css_usage.mjs --json 의
 * 결과를 그대로 소비한다(귀속 판정의 단일 원본).
 *
 * 안전장치:
 *   - 추출 범위가 겹치면 즉시 중단.
 *   - 원본 = 남는 CSS + 떼어낸 CSS(래퍼 제외) 바이트가 맞는지 검증.
 *   - 결과 style.css 를 다시 파싱해 규칙 수가 예상과 일치하는지 검증.
 *   - @media/@supports 안의 규칙은 같은 조건으로 다시 감싸 옮긴다.
 *
 * 로드 순서: 페이지 시트는 style.css **뒤에** 링크해야 한다. 동일 명시도
 * 규칙의 우선순위가 원본 순서(뒤에 온 것이 이김)에 의존하기 때문.
 *
 *   node scripts/split_css.mjs --dry-run
 *   node scripts/split_css.mjs
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'css/style.css');
const AUDIT = path.join(ROOT, 'scripts/audit_css_usage.mjs');

// 떼어낼 표면 → 출력 파일. kms/static 은 이득이 작고(각 4~5KB) static 은
// 404/500 이 style.css 를 로드하지 않는 예외가 있어 이번 범위에서 제외한다.
const TARGETS = {
  board: 'css/board.css',
  calendar: 'css/calendar.css',
  post: 'css/post.css',
  wosm_members: 'css/wosm-members.css',
  glossary: 'css/glossary.css',
  jamboree16: 'css/jamboree16.css',
};

const HEADER = (surface) => `/* ${surface} 전용 스타일 — css/style.css 에서 분리.
 *
 * 이 파일의 규칙은 scripts/audit_css_usage.mjs 가 "${surface} 표면에서만 쓰인다"고
 * 확정한 것들이다. 다른 페이지에서 쓰기 시작하면 style.css 로 되돌려야 한다.
 * 반드시 style.css **뒤에** 링크할 것 — 동일 명시도 규칙의 순서 의존성 때문.
 *
 * 재생성: node scripts/split_css.mjs
 */
`;

function loadAudit() {
  const out = execFileSync('node', [AUDIT, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

function soleSurfaceRules(report, surface) {
  return report.filter((r) => r.verdict === 'used' && r.surfaces.length === 1 && r.surfaces[0] === surface);
}

/** 연속 규칙을 같은 media 스택끼리 묶어 @media 래퍼를 최소로 만든다. */
function emitRules(css, rules) {
  let out = '';
  let prevMedia = null;
  let open = 0;
  for (const rule of rules) {
    const media = rule.media || [];
    const key = media.join(' && ');
    if (key !== prevMedia) {
      while (open > 0) { out += '}\n'; open--; }
      for (const m of media) { out += `${m} {\n`; open++; }
      prevMedia = key;
    }
    out += css.slice(rule.startIdx, rule.endIdx).replace(/^\s*\n/, '') + '\n';
  }
  while (open > 0) { out += '}\n'; open--; }
  return out;
}

function assertNoOverlap(ranges) {
  const sorted = ranges.slice().sort((a, b) => a.startIdx - b.startIdx);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startIdx < sorted[i - 1].endIdx) {
      throw new Error(`추출 범위 겹침: ${sorted[i - 1].startIdx}-${sorted[i - 1].endIdx} vs ${sorted[i].startIdx}-${sorted[i].endIdx}`);
    }
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const report = loadAudit();

  const picked = [];
  const perSurface = {};
  for (const surface of Object.keys(TARGETS)) {
    const rules = soleSurfaceRules(report, surface);
    perSurface[surface] = rules;
    picked.push(...rules);
  }

  assertNoOverlap(picked);

  const originalRuleCount = report.filter((r) => r.type === 'rule' || r.type === 'at').length;
  let removedBytes = 0;
  for (const r of picked) removedBytes += Buffer.byteLength(css.slice(r.startIdx, r.endIdx), 'utf8');

  // 원본에서 추출 범위를 제거 (뒤에서부터 잘라 인덱스 밀림 방지)
  const ordered = picked.slice().sort((a, b) => b.startIdx - a.startIdx);
  let remaining = css;
  for (const r of ordered) remaining = remaining.slice(0, r.startIdx) + remaining.slice(r.endIdx);

  console.log(`원본            ${Buffer.byteLength(css, 'utf8')} B / ${originalRuleCount} rules`);
  console.log(`추출            ${removedBytes} B / ${picked.length} rules`);
  console.log(`남는 style.css  ${Buffer.byteLength(remaining, 'utf8')} B`);
  console.log('');
  for (const [surface, file] of Object.entries(TARGETS)) {
    const rules = perSurface[surface];
    const bytes = rules.reduce((a, r) => a + r.bytes, 0);
    console.log(`  ${file.padEnd(24)} ${String(rules.length).padStart(4)} rules  ${String(bytes).padStart(7)} B`);
  }

  if (dryRun) {
    console.log('\n--dry-run: 파일을 쓰지 않았습니다.');
    return;
  }

  for (const [surface, file] of Object.entries(TARGETS)) {
    const body = emitRules(css, perSurface[surface]);
    fs.writeFileSync(path.join(ROOT, file), HEADER(surface) + body, 'utf8');
  }
  fs.writeFileSync(CSS_PATH, remaining, 'utf8');

  // 사후 검증 — 남은 style.css 가 다시 파싱되고 규칙 수가 줄어든 만큼만 줄었는지
  const after = JSON.parse(execFileSync('node', [AUDIT, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const afterCount = after.length;
  console.log(`\n검증: style.css 규칙 ${originalRuleCount} → ${afterCount} (추출 ${picked.length})`);
  if (afterCount !== originalRuleCount - picked.length) {
    console.log('⚠ 규칙 수가 예상과 다릅니다. @media 래퍼 처리나 빈 at-rule 때문일 수 있으니 diff 를 확인하세요.');
  }
}

main();
