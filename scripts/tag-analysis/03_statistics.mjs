#!/usr/bin/env node
/**
 * scripts/tag-analysis/03_statistics.mjs
 *
 * 산출물 #1 "기초 통계"(01_statistics.md)를 생성.
 *
 * 포맷 (2026-04-19 Jimmy 승인 기준):
 *   §1 전체 규모
 *   §2 글머리 태그별 기사 수 + 비율
 *   §3 메타 태그 상위 20
 *   §4 메타 태그 하위 10  (Phase C 패널에서 '더보기 모달'로 전체 페이지네이션 제공 예정)
 *   §5 category 분포 (참고)
 *   §6 태그 누락 기사 (공개 URL 링크 포함)
 *   §7 category별 기사당 평균 메타 태그 개수
 *   §8 발행 시점 분포 (월별)
 *   Appendix A 전체 메타 태그 빈도 (desc)
 *
 * 삭제됨:
 *   (구)§5 글머리 × category 교차 분포 — 관계도(§2 graph)에서 edge 굵기로 표현하기로 합의.
 *
 * 출력: output/tag-analysis/01_statistics.md
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const IN   = resolve(REPO, 'output/intermediate/posts_tokenized.json');
const OUT  = resolve(REPO, 'output/tag-analysis/01_statistics.md');

const raw = JSON.parse(readFileSync(IN, 'utf8'));
const posts = raw.posts;
const total = posts.length;

// -------- 카운트 --------
const tagCounts = new Map();
const metaCounts = new Map();
const categoryCounts = new Map();
const catMetaSum = new Map();     // category → sum of meta_token lengths
const catMetaPosts = new Map();   // category → count of posts with ≥1 meta
const monthCounts = new Map();    // YYYY-MM → n
let metaSum = 0;
let metaNonEmpty = 0;
let tagMissing = 0;
let metaMissing = 0;

function monthKey(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

for (const p of posts) {
  if (!p.tag_tokens.length) tagMissing++;
  if (!p.meta_tokens.length) metaMissing++;
  categoryCounts.set(p.category, (categoryCounts.get(p.category) || 0) + 1);

  for (const t of p.tag_tokens) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  for (const m of p.meta_tokens) metaCounts.set(m, (metaCounts.get(m) || 0) + 1);

  if (p.meta_tokens.length) {
    metaSum += p.meta_tokens.length;
    metaNonEmpty++;
    catMetaSum.set(p.category, (catMetaSum.get(p.category) || 0) + p.meta_tokens.length);
    catMetaPosts.set(p.category, (catMetaPosts.get(p.category) || 0) + 1);
  }

  const mk = monthKey(p.publish_at || p.created_at);
  if (mk) monthCounts.set(mk, (monthCounts.get(mk) || 0) + 1);
}

const metaAvg = metaNonEmpty ? (metaSum / metaNonEmpty) : 0;

function sortDesc(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function sortAsc(map) {
  return [...map.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
}

const tagRanking = sortDesc(tagCounts);
const metaRankingTop = sortDesc(metaCounts);
const metaRankingBottom = sortAsc(metaCounts);
const metaRankingFull = sortDesc(metaCounts);
const categoryRanking = sortDesc(categoryCounts);
const monthRanking = [...monthCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

// -------- Markdown --------
const lines = [];
lines.push(`# 기초 통계 (기사 태그 축적 현황)\n`);
lines.push(`> 생성 시각: ${raw.exported_at}`);
lines.push(`> 원본: D1 \`posts\` 테이블 (published = 1)`);
lines.push(`> 필드 매핑: 글머리 태그 = \`tag\`, 메타 태그 = \`meta_tags\`, category 는 상위 축`);
lines.push(`> 태그 이름은 원문 그대로 보존. 자동 통합/삭제 없음.\n`);

// §1
lines.push(`## 1. 전체 규모`);
lines.push(`| 지표 | 값 |`);
lines.push(`|---|---|`);
lines.push(`| 분석 대상 기사 | ${total}건 |`);
lines.push(`| 글머리 태그(\`tag\`) 누락 | ${tagMissing}건 |`);
lines.push(`| 메타 태그(\`meta_tags\`) 누락 | ${metaMissing}건 |`);
lines.push(`| 고유 글머리 태그 수 | ${tagCounts.size}개 |`);
lines.push(`| 고유 메타 태그 수 | ${metaCounts.size}개 |`);
lines.push(`| 기사당 평균 메타 태그 개수 | ${metaAvg.toFixed(2)}개 (메타 태그 있는 기사 기준) |\n`);

// §2
lines.push(`## 2. 글머리 태그별 기사 수`);
lines.push(`| 글머리 태그 | 기사 수 | 비율 |`);
lines.push(`|---|---|---|`);
for (const [tag, n] of tagRanking) {
  const pct = ((n / total) * 100).toFixed(1);
  lines.push(`| \`${tag}\` | ${n} | ${pct}% |`);
}
lines.push('');

// §3
lines.push(`## 3. 메타 태그 등장 빈도 — 상위 20`);
lines.push(`| 순위 | 메타 태그 | 등장 기사 수 |`);
lines.push(`|---|---|---|`);
metaRankingTop.slice(0, 20).forEach(([tag, n], i) => {
  lines.push(`| ${i + 1} | \`${tag}\` | ${n} |`);
});
lines.push('');
lines.push(`> 전체 ${metaRankingTop.length}개는 문서 하단 **부록 A**에서 확인. 관리자 패널(Phase C)에는 **더보기 → 모달 페이지네이션**으로 제공 예정.\n`);

// §4
lines.push(`## 4. 메타 태그 등장 빈도 — 하위 10 (1회 등장 고립 태그 후보 맛보기)`);
lines.push(`| 메타 태그 | 등장 기사 수 |`);
lines.push(`|---|---|`);
metaRankingBottom.slice(0, 10).forEach(([tag, n]) => {
  lines.push(`| \`${tag}\` | ${n} |`);
});
lines.push(`\n> 1회만 등장한 고립 태그 전수는 \`03_health_check.md\`에서 별도 정리. 관리자 패널도 동일하게 상세 모달 제공.\n`);

// §5 — category 분포 (참고)
lines.push(`## 5. category 분포 (참고)`);
lines.push(`> 기존 '글머리 × category 교차 분포' 섹션은 제거됨. 같은 정보는 §2 관계도의 edge 굵기(공출현)와 node 색(우세 글머리)로 시각화.\n`);
lines.push(`| category | 기사 수 |`);
lines.push(`|---|---|`);
for (const [c, n] of categoryRanking) {
  lines.push(`| \`${c}\` | ${n} |`);
}
lines.push('');

// §6 — 태그 누락 기사 (링크 포함)
lines.push(`## 6. 태그 누락 기사 (사람 검토 필요)`);
if (tagMissing === 0 && metaMissing === 0) {
  lines.push(`모든 기사에 \`tag\`와 \`meta_tags\`가 채워져 있습니다.\n`);
} else {
  const missingList = posts
    .filter((p) => !p.tag_tokens.length || !p.meta_tokens.length)
    .map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      tag: p.tag_tokens.length ? '✓' : '⚠ 없음',
      meta: p.meta_tokens.length ? '✓' : '⚠ 없음',
    }));
  lines.push(`| id | category | 제목 | tag | meta_tags | 바로가기 |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of missingList) {
    const safeTitle = (r.title || '').replace(/\|/g, '\\|').slice(0, 40);
    lines.push(`| ${r.id} | ${r.category} | ${safeTitle} | ${r.tag} | ${r.meta} | [공개 보기](https://bpmedia.net/post/${r.id}) |`);
  }
  lines.push(`\n> 각 기사는 bpmedia.net의 공개 URL로 직접 이동 가능. 관리자 수정은 \`/admin\` → 게시글 목록에서 해당 id로 진입.\n`);
}

// §7 — category별 평균 메타 태그 개수
lines.push(`## 7. category별 기사당 평균 메타 태그 개수`);
lines.push(`> SEO 편차 점검. 특정 보드가 다른 보드보다 메타 태그가 얕으면 검색 노출이 약해질 수 있음.\n`);
lines.push(`| category | 메타 태그 있는 기사 | 메타 태그 총합 | 평균 |`);
lines.push(`|---|---|---|---|`);
const catAvgRows = [...catMetaPosts.entries()].map(([c, postsN]) => {
  const sum = catMetaSum.get(c) || 0;
  return { category: c, postsN, sum, avg: postsN ? (sum / postsN) : 0 };
}).sort((a, b) => b.avg - a.avg);
for (const r of catAvgRows) {
  lines.push(`| \`${r.category}\` | ${r.postsN} | ${r.sum} | ${r.avg.toFixed(2)} |`);
}
lines.push('');

// §8 — 발행 시점 분포
lines.push(`## 8. 발행 시점 분포 (월별)`);
lines.push(`> 기준: \`publish_at\` 없으면 \`created_at\`. YYYY-MM 단위 집계.\n`);
lines.push(`| 월 | 기사 수 |`);
lines.push(`|---|---|`);
for (const [ym, n] of monthRanking) {
  lines.push(`| ${ym} | ${n} |`);
}
lines.push(`\n> 최근 6개월 / 12개월 추세는 \`04_coverage_map.md\`에서 주제별로 재분석.\n`);

// Appendix A — 전체 메타 태그 빈도
lines.push(`---\n`);
lines.push(`## 부록 A. 전체 메타 태그 빈도 (${metaRankingFull.length}개, 내림차순)`);
lines.push(`> Phase C 관리자 패널은 '더보기' 모달 + 페이지네이션으로 제공. 이 부록은 문서 버전의 전체 스냅샷.\n`);
lines.push(`| 순위 | 메타 태그 | 등장 기사 수 |`);
lines.push(`|---|---|---|`);
metaRankingFull.forEach(([tag, n], i) => {
  lines.push(`| ${i + 1} | \`${tag}\` | ${n} |`);
});
lines.push('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'));
console.error(`[statistics] ${OUT} 생성 (${total}건 기준)`);
