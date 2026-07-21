#!/usr/bin/env node
/**
 * --white / --black → 시맨틱 토큰 마이그레이션 (다크모드 선행 조건)
 *
 * 문제: `--white` 와 `--black` 은 "색 이름" 토큰이라 역할이 섞여 있다.
 *   background: var(--white)  → 표면. 다크모드에서 어두워져야 한다.
 *   color:      var(--white)  → 보라 버튼 위 흰 글씨. 다크에서도 흰색이어야 한다.
 * 같은 토큰이므로 일괄 반전이 불가능하다. 역할별 토큰으로 먼저 쪼갠다.
 *
 * 안전성: 새 토큰의 라이트 모드 값을 기존 값과 **동일하게** 정의하므로,
 * 이 마이그레이션만으로는 계산된 스타일이 바뀌지 않는다 (시각적 변화 0).
 *
 * 사용:
 *   node scripts/migrate_semantic_color_tokens.mjs           # 드라이런 (기본)
 *   node scripts/migrate_semantic_color_tokens.mjs --apply   # 실제 적용
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const FILES = [
  'css/style.css', 'css/board.css', 'css/post.css', 'css/calendar.css',
  'css/glossary.css', 'css/jamboree16.css', 'css/memorabilia.css',
  'css/wosm-members.css',
];

/**
 * 2차 웨이브 — 브랜드 강조색도 같은 문제를 갖는다.
 * background: var(--accent) 는 다크에서 어두운 보라를 유지해야 그 위 흰 글씨가 살고,
 * color: var(--accent) 는 다크에서 밝은 보라가 되어야 읽힌다 (딥퍼플은 Lc 10.7 로 소멸).
 * `--apply --wave2` 로 실행한다.
 */
const WAVE2 = ['accent', 'scouting-purple', 'midnight-purple', 'forest-green', 'ocean-blue', 'fire-red'];
const WAVE2_MAP = Object.fromEntries(WAVE2.map((t) => [t, {
  background: `${t}-surface`, 'background-color': `${t}-surface`,
  color: `${t}-text`,
  border: `${t}-border`, 'border-color': `${t}-border`,
  'border-top': `${t}-border`, 'border-bottom': `${t}-border`,
  'border-left': `${t}-border`, 'border-right': `${t}-border`,
}]));

/** 속성 → 새 토큰 매핑. 여기에 없는 속성은 건드리지 않는다. */
const MAP = process.argv.includes('--wave2') ? WAVE2_MAP : {
  white: {
    background: 'surface', 'background-color': 'surface',
    color: 'on-accent',
    border: 'border-on-accent', 'border-color': 'border-on-accent',
    'border-top': 'border-on-accent', 'border-bottom': 'border-on-accent',
    'border-left': 'border-on-accent', 'border-right': 'border-on-accent',
  },
  black: {
    background: 'surface-inverse', 'background-color': 'surface-inverse',
    color: 'text-strong',
    border: 'border-strong', 'border-color': 'border-strong',
    'border-top': 'border-strong', 'border-bottom': 'border-strong',
    'border-left': 'border-strong', 'border-right': 'border-strong',
  },
};

/**
 * 값 위치에서 역방향으로 훑어 그 값을 소유한 속성명을 찾는다.
 * `;` `{` `}` 를 만나면 선언 경계이므로 중단한다.
 * 한 줄 규칙(`.x:hover { color: var(--white) }`)도 정확히 처리된다.
 */
function ownerProperty(src, valueIndex) {
  let i = valueIndex;
  // 값 앞의 가장 가까운 ':' 찾기. 선언 경계(; { })를 만나면 소유 속성이 없다.
  while (i > 0 && src[i] !== ':' && src[i] !== ';' && src[i] !== '{' && src[i] !== '}') i--;
  if (src[i] !== ':') return null;
  let end = i - 1;
  while (end > 0 && /\s/.test(src[end])) end--;
  let start = end;
  while (start > 0 && /[a-zA-Z-]/.test(src[start - 1])) start--;
  return src.slice(start, end + 1).toLowerCase();
  // 별도의 경계 검사는 두지 않는다. `{` 가 선택자와 값 사이를 항상 가로막으므로
  // 선택자 조각(`:hover` 등)이 속성으로 잡히지 않고, 최종 판정은 MAP 등재
  // 여부가 한다 (`--gradient-ink` 같은 토큰 정의는 MAP 에 없어 자동 제외).
}

/** 주석을 같은 길이의 공백으로 치환 — 인덱스를 보존해 원본에 그대로 적용 가능 */
function maskComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const stats = {};
let totalChanged = 0, totalSkipped = 0;
const skipped = [];

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const scan = maskComments(src); // 주석 안의 var(--white) 는 매치되지 않는다
  let out = '', cursor = 0, changed = 0;
  const re = new RegExp("var\\(--(" + Object.keys(MAP).join("|") + ")\\)", "g");
  let m;
  while ((m = re.exec(scan)) !== null) {
    const tok = m[1];
    const prop = ownerProperty(scan, m.index);
    const target = prop && MAP[tok][prop];
    if (!target) {
      totalSkipped++;
      skipped.push(`${rel}  [${prop || '경계밖'}]  var(--${tok})`);
      continue;
    }
    out += src.slice(cursor, m.index) + `var(--${target})`;
    cursor = m.index + m[0].length;
    changed++;
    const key = `${prop}: var(--${tok}) → var(--${target})`;
    stats[key] = (stats[key] || 0) + 1;
  }
  out += src.slice(cursor);
  totalChanged += changed;
  if (changed && APPLY) fs.writeFileSync(abs, out);
  if (changed) console.log(`  ${rel.padEnd(26)} ${String(changed).padStart(3)}건`);
}

console.log('\n매핑별 건수');
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(52)} ${String(v).padStart(3)}`);
}
if (skipped.length) {
  console.log(`\n건드리지 않음 (${skipped.length}건) — 수동 확인 대상`);
  skipped.forEach((s) => console.log('  ' + s));
}
console.log(`\n합계 변경 ${totalChanged}건 / 미변경 ${totalSkipped}건`);
console.log(APPLY ? '→ 파일에 적용했습니다.' : '→ 드라이런입니다. 적용하려면 --apply');
