#!/usr/bin/env node
/**
 * scripts/tag-analysis/01_export.mjs
 *
 * D1(posts 테이블)에서 published=1 기사 전수를 JSON으로 export.
 * 원문 태그 문자열을 그대로 보존한다 (대문자/공백/특수문자 손대지 않음).
 *
 * 사용:
 *   node scripts/tag-analysis/01_export.mjs           # 전체 151건
 *   node scripts/tag-analysis/01_export.mjs --limit 10  # 샘플 10건
 *
 * 출력: output/intermediate/posts_export.json
 * 재실행 안전: 매번 D1 현재 상태로 덮어씀.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT  = resolve(REPO, 'output/intermediate/posts_export.json');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;

const cols = [
  'id', 'category', 'title', 'subtitle', 'tag', 'meta_tags',
  'special_feature', 'published', 'author', 'views',
  'created_at', 'publish_at', 'updated_at',
];

// SELECT에서 content/image_url 제외 — 태그 분석에 불필요하고 JSON 크기만 부풀림
let sql = `SELECT ${cols.join(', ')} FROM posts WHERE published = 1 ORDER BY id ASC`;
if (limit) sql += ` LIMIT ${limit}`;

console.error(`[export] D1 → ${OUT}${limit ? ` (limit ${limit})` : ' (전량)'}`);
const raw = execSync(
  `wrangler d1 execute gilwell-posts --remote --json --command "${sql}"`,
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } }
);

// wrangler --json 출력 형식: [ { results: [...], meta: {...} } ]
const parsed = JSON.parse(raw);
const rows = (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results))
  ? parsed[0].results
  : [];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  exported_at: new Date().toISOString(),
  source: 'D1 gilwell-posts.posts',
  filter: 'published = 1',
  limit: limit || null,
  count: rows.length,
  columns: cols,
  rows,
}, null, 2));

console.error(`[export] ${rows.length}건 저장 완료`);
