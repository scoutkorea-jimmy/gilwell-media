#!/usr/bin/env node
/**
 * scripts/tag-analysis/02_tokenize.mjs
 *
 * posts_export.json의 tag/meta_tags 원문 문자열을 쉼표로 split.
 * - 원문 그대로 보존(트림만 수행, 대소문자/유니코드 변형 없음)
 * - 빈 토큰/중복 토큰은 한 기사 내에서만 제거(전체 집계는 원본 그대로)
 *
 * 출력: output/intermediate/posts_tokenized.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const IN   = resolve(REPO, 'output/intermediate/posts_export.json');
const OUT  = resolve(REPO, 'output/intermediate/posts_tokenized.json');

function splitTags(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const seen = new Set();
  const out = [];
  for (const piece of s.split(',')) {
    const t = piece.trim();
    if (!t) continue;
    if (seen.has(t)) continue; // 한 기사 내 중복만 제거
    seen.add(t);
    out.push(t);
  }
  return out;
}

const raw = JSON.parse(readFileSync(IN, 'utf8'));
const tokenized = raw.rows.map((p) => ({
  id: p.id,
  category: p.category,
  title: p.title,
  tag_raw: p.tag,
  meta_tags_raw: p.meta_tags,
  tag_tokens: splitTags(p.tag),             // 글머리 태그 배열
  meta_tokens: splitTags(p.meta_tags),      // 메타 태그 배열
  special_feature: p.special_feature,
  publish_at: p.publish_at,
  created_at: p.created_at,
  views: p.views,
}));

writeFileSync(OUT, JSON.stringify({
  exported_at: raw.exported_at,
  count: tokenized.length,
  note: '원문 보존. 한 기사 내 중복 토큰만 제거. 전체 집계는 원문 그대로 별도 스크립트에서 수행.',
  posts: tokenized,
}, null, 2));

console.error(`[tokenize] ${tokenized.length}건 토큰화 완료 → ${OUT}`);
