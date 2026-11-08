#!/usr/bin/env node
/**
 * 공개 노출 경계 감사 — release preflight 게이트
 *
 * [2026-07-22 모델 변경] 이전에는 `wrangler pages deploy .` 가 저장소를 통째로
 * 올려서, 내부 파일이 일단 업로드된 뒤 미들웨어가 404 로 가려주는 구조였다.
 * 이제는 `wrangler pages deploy public` 이라 **public/ 안에 있는 것만 업로드된다.**
 * 따라서 진짜 불변식은 하나다: "내부용 파일이 public/ 안에 들어가지 않는다".
 *
 * 두 방향을 검사한다:
 *   1) public/ 안에 내부용 파일(문서·스크립트·설정)이 섞여 있지 않은가
 *      → 섞이면 배포와 함께 공개된다.
 *   2) 런타임이 fetch 하는 자산이 미들웨어 차단 목록에 걸리지 않는가
 *      → 걸리면 기능이 죽는다 (이중 안전장치가 오히려 앱을 깨는 경우).
 *
 * 네트워크 없이 동작한다. 라이브 확인은 tests/smoke-internal-exposure.spec.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlockedInternalPath } from '../functions/_middleware.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');

/** public/ 안에 있으면 안 되는 것 — 있으면 배포와 함께 공개된다 */
const FORBIDDEN_IN_PUBLIC = [
  { test: (f) => f.endsWith('.sh'), why: '셸 스크립트' },
  { test: (f) => f.endsWith('.toml'), why: '배포 설정' },
  { test: (f) => /(^|\/)package(-lock)?\.json$/.test(f), why: 'npm 설정' },
  { test: (f) => /(^|\/)\.dev\.vars/.test(f), why: '환경변수 예시' },
  { test: (f) => /(^|\/)(CLAUDE|AGENTS|README)\.md$/i.test(f), why: '개발 문서' },
  { test: (f) => /HISTORY\.md$/i.test(f), why: '개발 이력 문서' },
  { test: (f) => f.endsWith('.sql'), why: 'DB 스키마' },
];

/**
 * 런타임이 실제로 fetch 하는 경로 — 미들웨어가 차단하면 기능이 죽는다.
 * (미들웨어 차단은 이제 이중 안전장치지만, 잘못 넓히면 앱을 깬다)
 */
const MUST_STAY_PUBLIC = [
  '/', '/index.html',
  '/css/style.css', '/js/main.js', '/data/changelog.json',
  '/VERSION', '/ADMIN_VERSION',
  '/dreampath/app.js', '/dreampath/DREAMPATH.md',
  '/dreampath/templates/templates-app.js',
  '/card-news-app/app.jsx', '/card-news-app/cards.jsx',
];

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const errors = [];

// ── 1) public/ 안에 내부용 파일이 섞였는가 ────────────────────────────
if (!fs.existsSync(PUB)) {
  errors.push('public/ 디렉토리가 없습니다. 배포 대상 디렉토리입니다.');
} else {
  const leaked = [];
  for (const f of walk(PUB)) {
    // DREAMPATH.md 는 앱의 규칙 뷰어가 런타임에 fetch 하므로 예외
    if (f === 'dreampath/DREAMPATH.md') continue;
    for (const rule of FORBIDDEN_IN_PUBLIC) {
      if (rule.test(f)) { leaked.push(`${f}  (${rule.why})`); break; }
    }
  }
  if (leaked.length) {
    errors.push(
      `내부용 파일이 public/ 안에 있습니다 — 배포되면 그대로 공개됩니다:\n` +
      leaked.map((l) => `    • public/${l}`).join('\n') +
      `\n  해소법: public/ 밖(scripts/, docs/, rules/, db/ 등)으로 옮기세요.`
    );
  }
}

// ── 2) 런타임 의존 경로가 차단되지 않았는가 ──────────────────────────
const wronglyBlocked = MUST_STAY_PUBLIC.filter((p) => isBlockedInternalPath(p));
if (wronglyBlocked.length) {
  errors.push(
    `기능 파괴 위험 — 런타임이 fetch 하는 경로가 미들웨어에 차단됐습니다:\n` +
    wronglyBlocked.map((p) => `    • ${p}`).join('\n') +
    `\n  해소법: functions/_middleware.js 의 차단 목록에서 제거하세요.`
  );
}

if (errors.length) {
  console.error('공개 노출 경계 감사 실패:\n');
  errors.forEach((e) => console.error(`  ${e}\n`));
  process.exit(1);
}

const n = fs.existsSync(PUB) ? walk(PUB).length : 0;
console.log(`공개 노출 경계 OK — public/ ${n}개 파일에 내부용 파일 없음, 런타임 의존 경로 ${MUST_STAY_PUBLIC.length}개 정상.`);
