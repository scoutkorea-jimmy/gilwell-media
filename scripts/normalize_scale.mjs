#!/usr/bin/env node
/**
 * 타이포·간격 스케일 정규화 (드라이런 기본)
 *
 *   node scripts/normalize_scale.mjs           # 미리보기
 *   node scripts/normalize_scale.mjs --apply   # 적용
 *
 * 배경: 스케일 토큰(--fs-* 12단계, --gap-* 4배수 6단계, --radius-* 7단계)은 이미
 * 잘 정의돼 있는데, 리터럴 px 가 그것을 우회해 font-size 30종·gap 16종이 공존했다.
 * 1px 차이는 육안으로 구분되지 않으므로 의미 없는 단계다.
 *
 * 방침:
 *  · font-size — 기존 토큰에 흡수. 32px 초과 구간은 토큰이 없어 3단계(40/48/56)를
 *    신설하고, 28px 도 24↔32 사이가 너무 벌어져 별도 단계로 둔다.
 *  · gap — 4의 배수로 스냅. 동률(6px 등)은 위로 올린다. 줄이면 요소가 붙어 보이고
 *    모바일에서 터치 타겟 간 간격이 줄기 때문이다.
 *  · border-radius — 정의된 7단계로 환원.
 *  · 값이 토큰과 정확히 일치하면 토큰으로 치환(의미 부여), 다르면 가장 가까운
 *    단계로 스냅한다. 스냅으로 값이 바뀌는 건은 리포트에 delta 를 표시한다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const FILES = ['style.css', 'board.css', 'post.css', 'calendar.css', 'glossary.css',
  'jamboree16.css', 'memorabilia.css', 'wosm-members.css', 'chatbot.css'].map((f) => 'css/' + f);

/** px 값 → 토큰명 */
const FS = [
  [10, 'fs-micro'], [11, 'fs-meta'], [12, 'fs-caption'], [13.5, 'fs-small'],
  [14, 'fs-body'], [15, 'fs-reading'], [16, 'fs-lead'], [18, 'fs-title'],
  [20, 'fs-section'], [22, 'fs-chapter'], [24, 'fs-document'], [28, 'fs-headline'],
  [32, 'fs-display'], [40, 'fs-display-lg'], [48, 'fs-hero'], [56, 'fs-hero-lg'],
];
const GAP = [
  [4, 'gap-micro'], [8, 'gap-tight'], [12, 'gap-element'], [16, 'gap-card'],
  [20, 'gap-wide'], [24, 'gap-section'], [32, 'gap-section-out'], [48, 'gap-page'],
];
const RADIUS = [
  [4, 'radius-tight'], [6, 'radius-sm'], [8, 'radius-md'], [12, 'radius-lg'],
  [16, 'radius-xl'], [22, 'radius-2xl'], [999, 'radius-pill'],
];

/** 가장 가까운 단계. 동률이면 큰 쪽(간격이 좁아지는 것보다 넓어지는 편이 안전) */
function snap(v, scale) {
  let best = scale[0];
  for (const s of scale) {
    const d = Math.abs(s[0] - v), bd = Math.abs(best[0] - v);
    if (d < bd || (d === bd && s[0] > best[0])) best = s;
  }
  return best;
}

const mask = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

const deltas = new Map();   // "12px→13.5px" → count
let total = 0;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const scan = mask(src);

  const edits = [];
  const collect = (re, scale, prop) => {
    for (const m of scan.matchAll(re)) {
      const v = parseFloat(m[1]);
      if (!Number.isFinite(v)) continue;
      const [target, token] = snap(v, scale);
      const key = `${prop} ${v}px → ${target}px`;
      if (v !== target) deltas.set(key, (deltas.get(key) || 0) + 1);
      // m[0] 안에서 숫자 부분만 교체
      const replaced = m[0].replace(/[\d.]+px/, `var(--${token})`);
      edits.push({ start: m.index, end: m.index + m[0].length, text: replaced });
      total++;
    }
  };
  collect(/font-size:\s*([\d.]+)px/g, FS, 'font');
  collect(/(?<=[;{]\s*)gap:\s*([\d.]+)px/g, GAP, 'gap');
  collect(/border-radius:\s*([\d.]+)px/g, RADIUS, 'radius');

  if (!edits.length) continue;
  if (APPLY) {
    let out = src;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    fs.writeFileSync(abs, out);
  }
  console.log(`  ${rel.padEnd(26)} ${String(edits.length).padStart(4)}건`);
}

console.log(`\n총 ${total}건 토큰화`);
const changed = [...deltas.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n값이 실제로 바뀌는 건 (${changed.reduce((s, x) => s + x[1], 0)}건):`);
changed.forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}회  ${k}`));
console.log(APPLY ? '\n→ 적용했습니다.' : '\n→ 드라이런. 적용하려면 --apply');
