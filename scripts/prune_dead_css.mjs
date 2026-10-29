#!/usr/bin/env node
/**
 * 죽은 CSS 규칙 제거 (드라이런 기본)
 *
 *   node scripts/prune_dead_css.mjs            # 미리보기
 *   node scripts/prune_dead_css.mjs --apply    # 적용
 *
 * 안전 장치:
 *  1. 삭제 대상 클래스는 인자로 받은 목록(DEAD)만.
 *  2. 규칙의 **모든** 선택자가 죽은 클래스만 참조할 때에만 지운다.
 *     `.btn-edit, .btn-delete { }` 처럼 살아 있는 선택자가 섞이면 건드리지 않는다.
 *  3. 요소/속성/의사클래스만으로 된 선택자(`a:hover` 등)가 섞여도 보존한다.
 *  4. `ce-*` `cdx-*` 등 서드파티 런타임 생성 클래스는 애초에 목록에서 제외했다
 *     (Editor.js 가 자기 마크업을 런타임에 만들기 때문에 소스 검색으로는 잡히지 않는다).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const DEAD = new Set(fs.readFileSync(path.join(ROOT, 'scripts/dead-css-classes.txt'), 'utf8')
  .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));

const FILES = ['css/style.css'];

/** 주석을 길이 보존 마스킹 — 인덱스를 원본과 맞춘다 */
const mask = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const scan = mask(src);

  const cuts = [];
  let i = 0, depth = 0;
  while (i < scan.length) {
    const ch = scan[i];
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { depth--; i++; continue; }
    if (depth > 0) { i++; continue; }          // @media 안쪽은 아래 재귀에서 처리
    i++;
  }

  // 최상위/미디어쿼리 내부를 모두 훑어 `선택자 { ... }` 단위로 검사
  const ruleRe = /(^|[}\s;])([^{}@][^{}]*?)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(scan)) !== null) {
    const selRaw = m[2].trim();
    if (!selRaw || selRaw.startsWith('@')) continue;
    const parts = selRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;

    const allDead = parts.every((sel) => {
      const classes = sel.match(/\.[a-zA-Z_][\w-]*/g);
      if (!classes) return false;                       // 클래스 없는 선택자 → 보존
      return classes.every((c) => DEAD.has(c.slice(1)));
    });
    if (!allDead) continue;

    const start = m.index + m[1].length;
    const end = m.index + m[0].length;
    cuts.push({ start, end, sel: selRaw.replace(/\s+/g, ' ').slice(0, 70), bytes: end - start });
  }

  if (!cuts.length) { console.log(`  ${rel}: 삭제 대상 없음`); continue; }

  console.log(`\n${rel} — ${cuts.length}개 규칙 / ${cuts.reduce((s, c) => s + c.bytes, 0)} B`);
  cuts.slice(0, 40).forEach((c) => console.log(`  ${String(c.bytes).padStart(5)}B  ${c.sel}`));
  if (cuts.length > 40) console.log(`  … 외 ${cuts.length - 40}개`);

  if (APPLY) {
    let out = src;
    for (const c of [...cuts].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, c.start) + out.slice(c.end);
    }
    out = out.replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(abs, out);
  }
}
console.log(APPLY ? '\n→ 적용했습니다.' : '\n→ 드라이런. 적용하려면 --apply');
