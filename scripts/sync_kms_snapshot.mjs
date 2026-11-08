#!/usr/bin/env node
/**
 * KMS 스냅샷 동기화 — D1(운영 원본) → 저장소 사본 2벌.
 *
 * 배경: KMS 콘텐츠는 3벌로 존재한다.
 *   1) D1 settings.feature_definition  — 운영 원본(관리자 KMS 편집기가 쓴다). 단일 진실.
 *   2) docs/feature-definition.md       — 사람/AI용 markdown 스냅샷.
 *   3) functions/_shared/feature-definition-default.js — D1 이 비었을 때만 쓰는 fallback.
 * 동기화 스크립트가 없어 (2)(3)이 (1)과 따로 놀며 드리프트했다(폰트 규칙·섹션 누락 등).
 * 이 스크립트는 (1)을 읽어 (2)(3)을 재생성해 셋을 항상 일치시킨다.
 *
 * 사용:  node scripts/sync_kms_snapshot.mjs            # 변경 없으면 0, 있으면 파일 갱신
 *        node scripts/sync_kms_snapshot.mjs --check    # 변경 있으면 비0 종료(드리프트 감지, 배포 게이트용)
 *
 * 요구: wrangler 로그인 + 네트워크. PATH 에 /opt/homebrew/bin 필요할 수 있음.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MD_PATH = join(ROOT, 'docs', 'feature-definition.md');
const DEFAULT_JS_PATH = join(ROOT, 'functions', '_shared', 'feature-definition-default.js');
const checkOnly = process.argv.includes('--check');

function fetchD1Content() {
  const out = execFileSync(
    'wrangler',
    ['d1', 'execute', 'gilwell-posts', '--remote', '--json',
     '--command', "SELECT value FROM settings WHERE key = 'feature_definition'"],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  const parsed = JSON.parse(out);
  const rows = (parsed[0] && parsed[0].results) || [];
  if (!rows.length || !rows[0].value) throw new Error('D1 feature_definition 이 비어 있음 — 동기화 중단');
  return String(rows[0].value).replace(/\r\n/g, '\n');
}

// markdown 콘텐츠를 JS template literal 안전 문자열로 변환 (백슬래시→백틱→${} 순).
function toTemplateLiteralBody(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function buildDefaultJs(content) {
  return `// ⚠ 자동 생성 파일 — 직접 편집하지 말 것.\n` +
    `// scripts/sync_kms_snapshot.mjs 가 D1 settings.feature_definition 에서 재생성한다.\n` +
    `// KMS 내용을 바꾸려면 관리자 KMS 편집기(= D1)를 수정한 뒤 이 스크립트를 실행한다.\n` +
    `export const DEFAULT_FEATURE_DEFINITION = \`${toTemplateLiteralBody(content)}\`;\n`;
}

function changed(path, next) {
  return !existsSync(path) || readFileSync(path, 'utf8') !== next;
}

const content = fetchD1Content();
const nextDefaultJs = buildDefaultJs(content);

const mdChanged = changed(MD_PATH, content);
const jsChanged = changed(DEFAULT_JS_PATH, nextDefaultJs);

if (checkOnly) {
  if (mdChanged || jsChanged) {
    console.error('KMS 스냅샷 드리프트 감지:' +
      (mdChanged ? ' docs/feature-definition.md' : '') +
      (jsChanged ? ' feature-definition-default.js' : '') +
      ' — `node scripts/sync_kms_snapshot.mjs` 실행 필요.');
    process.exit(1);
  }
  console.log('KMS 스냅샷 동기화 상태 OK.');
  process.exit(0);
}

if (mdChanged) writeFileSync(MD_PATH, content);
if (jsChanged) writeFileSync(DEFAULT_JS_PATH, nextDefaultJs);
console.log(`KMS 스냅샷 동기화 완료 (${content.length} bytes).` +
  ` md:${mdChanged ? '갱신' : '동일'} default.js:${jsChanged ? '갱신' : '동일'}`);
