#!/usr/bin/env node
/**
 * scripts/tag-analysis/04_run_all.mjs
 *
 * posts_export.json → functions/_shared/tag-insights.js → 5개 산출물 생성:
 *   output/tag-analysis/01_statistics.md   (§1 재생성 — 기존 03_statistics.mjs와 동일 결과)
 *   output/tag-analysis/02_graph.json      (§2 관계도 데이터)
 *   output/tag-analysis/02_graph.html      (§2 D3.js 인터랙티브)
 *   output/tag-analysis/03_health_check.md (§3 건강성 진단)
 *   output/tag-analysis/04_coverage_map.md (§4 콘텐츠 축적 현황)
 *   output/tag-analysis/05_next_actions.md (§5 허브-스포크 + 신규 제안)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTagInsights } from '../../functions/_shared/tag-insights.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const EXPORT_PATH = resolve(REPO, 'output/intermediate/posts_export.json');
const OUT_DIR = resolve(REPO, 'output/tag-analysis');
mkdirSync(OUT_DIR, { recursive: true });

const raw = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'));
const insights = buildTagInsights(raw.rows);

writeFileSync(resolve(REPO, 'output/intermediate/tag_insights.json'), JSON.stringify(insights, null, 2));

// ───────────── §2 graph JSON + HTML ─────────────
const graphOut = { generated_at: insights.generated_at, nodes: insights.graph.nodes, links: insights.graph.links };
writeFileSync(resolve(OUT_DIR, '02_graph.json'), JSON.stringify(graphOut, null, 2));

const graphHtml = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><title>BP미디어 태그 관계도</title>
<style>
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f8fafc; color:#1f2937; }
  header { padding: 16px 24px; background:#fff; border-bottom:1px solid #e5e7eb; }
  h1 { margin:0 0 4px; font-size:18px; }
  .meta { font-size:12px; color:#6b7280; }
  .controls { padding:12px 24px; background:#fff; border-bottom:1px solid #e5e7eb; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .controls label { font-size:12px; color:#4b5563; display:flex; align-items:center; gap:6px; }
  #chart { width:100%; height: calc(100vh - 140px); background:#fff; }
  .node circle { cursor:pointer; }
  .node text { font-size: 11px; pointer-events:none; fill:#111827; }
  .link { stroke-opacity: 0.35; }
  .legend { padding: 0 24px 16px; font-size:12px; color:#4b5563; }
</style>
</head><body>
<header>
  <h1>BP미디어 메타 태그 관계도</h1>
  <div class="meta">생성 ${insights.generated_at} · 노드 ${insights.graph.nodes.length}개 · 링크 ${insights.graph.links.length}개</div>
</header>
<div class="controls">
  <label><input type="checkbox" id="hideOnce" checked> 1회 등장 태그 숨김</label>
  <label>최소 공출현: <input type="range" id="minCo" min="1" max="10" value="1"> <span id="minCoVal">1</span></label>
  <label>노드 크기 배율: <input type="range" id="scale" min="0.5" max="2" step="0.1" value="1"> <span id="scaleVal">1.0</span></label>
</div>
<svg id="chart"></svg>
<div class="legend">※ 노드 색은 '우세 글머리 태그', 노드 크기는 메타 태그 등장 빈도, 링크 굵기는 공출현 횟수 반영.</div>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const DATA = ${JSON.stringify({ nodes: insights.graph.nodes, links: insights.graph.links })};

// 우세 글머리 태그 고유값 → 색 배정
const headers = Array.from(new Set(DATA.nodes.map(n => n.top_header || '').filter(Boolean)));
const color = d3.scaleOrdinal(d3.schemeTableau10).domain(headers);

const svg = d3.select('#chart');
const width = window.innerWidth;
const height = window.innerHeight - 140;
svg.attr('viewBox', [0, 0, width, height]);

const zoomG = svg.append('g');
svg.call(d3.zoom().scaleExtent([0.2, 3]).on('zoom', (ev) => zoomG.attr('transform', ev.transform)));

let simulation = null;
let linkSel, nodeSel;

function render() {
  const hideOnce = document.getElementById('hideOnce').checked;
  const minCo = +document.getElementById('minCo').value;
  const scale = +document.getElementById('scale').value;
  document.getElementById('minCoVal').textContent = minCo;
  document.getElementById('scaleVal').textContent = scale.toFixed(1);

  const nodes = DATA.nodes.filter(n => !hideOnce || n.count > 1).map(n => ({...n}));
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = DATA.links
    .filter(l => l.count >= minCo && nodeIds.has(l.source) && nodeIds.has(l.target))
    .map(l => ({...l}));

  zoomG.selectAll('*').remove();

  linkSel = zoomG.append('g').attr('class', 'links').selectAll('line')
    .data(links).join('line')
    .attr('class', 'link')
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', d => Math.min(6, 0.5 + Math.sqrt(d.count)));

  nodeSel = zoomG.append('g').attr('class', 'nodes').selectAll('g')
    .data(nodes).join('g').attr('class', 'node')
    .call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end', (ev, d) => { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  nodeSel.append('circle')
    .attr('r', d => (d.size || 12) * scale * 0.5)
    .attr('fill', d => color(d.top_header || ''))
    .attr('opacity', 0.85)
    .append('title').text(d => d.id + ' · ' + d.count + '건 · 주요 글머리: ' + (d.top_header || '—'));

  nodeSel.append('text')
    .attr('dy', d => -(((d.size || 12) * scale * 0.5) + 4))
    .attr('text-anchor', 'middle')
    .text(d => d.id);

  if (simulation) simulation.stop();
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => (d.size || 12) * scale * 0.6))
    .on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    });
}

document.getElementById('hideOnce').addEventListener('change', render);
document.getElementById('minCo').addEventListener('input', render);
document.getElementById('scale').addEventListener('input', render);
render();
</script>
</body></html>`;
writeFileSync(resolve(OUT_DIR, '02_graph.html'), graphHtml);

// ───────────── §3 health check .md ─────────────
{
  const h = insights.health;
  const lines = [];
  lines.push(`# 태그 체계 건강성 진단 (03_health_check)\n`);
  lines.push(`> 생성: ${insights.generated_at}`);
  lines.push(`> 모든 항목은 **사람 검토 필요** 플래그. 자동 통합/삭제 금지.\n`);

  lines.push(`## 1. 1회만 등장한 고립 태그 (${h.isolated_tags.length}개)`);
  lines.push(`> SEO 집계 상 거의 기여 없음. 다른 기사에도 붙일 수 있는지 검토.\n`);
  if (!h.isolated_tags.length) { lines.push('없음.\n'); }
  else {
    lines.push(`<details><summary>${h.isolated_tags.length}개 전체 보기</summary>\n`);
    lines.push(h.isolated_tags.map((t) => `- \`${t}\``).join('\n'));
    lines.push('\n</details>\n');
  }

  lines.push(`## 2. 너무 많은 기사에 붙어 의미가 희석된 범용 태그`);
  lines.push(`> 기준: 전체 ${insights.statistics.total_posts}건 중 ${h.overly_common_threshold}건 이상(≥30%) 등장.`);
  lines.push(`> 이런 태그는 검색 차별성이 낮음. 세분화를 고려하거나 "스카우트" 같은 범주 전역 태그임을 명시.\n`);
  if (!h.overly_common.length) { lines.push('해당 없음.\n'); }
  else {
    lines.push(`| 태그 | 등장 기사 | 비율 | 권고 |`);
    lines.push(`|---|---|---|---|`);
    for (const oc of h.overly_common) {
      lines.push(`| \`${oc.tag}\` | ${oc.count} | ${(oc.pct * 100).toFixed(1)}% | 세분화 검토 (사람 검토 필요) |`);
    }
    lines.push('');
  }

  lines.push(`## 3. 중복 의심 태그 쌍 (편집거리/부분 포함)`);
  lines.push(`> 휴리스틱으로 추출. 반드시 사람 판단. 자동 병합 금지.\n`);
  if (!h.duplicate_suspects.length) { lines.push('해당 없음.\n'); }
  else {
    lines.push(`| 태그 A | 태그 B | A건수 | B건수 | 의심 근거 | 권고 |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const d of h.duplicate_suspects) {
      lines.push(`| \`${d.left}\` | \`${d.right}\` | ${d.left_count} | ${d.right_count} | ${d.reasons.join(', ')} | 통합/분리/유지 판단 필요 |`);
    }
    lines.push('');
  }

  lines.push(`## 4. 고립 군집 (소규모 연결 컴포넌트)`);
  lines.push(`> 2~5개 태그가 서로만 연결되고 주 그래프에 붙지 않은 경우. 특수 주제이거나 방치된 태그일 수 있음.\n`);
  if (!h.isolated_clusters.length) { lines.push('해당 없음 (모든 태그가 주 그래프에 연결됨).\n'); }
  else {
    lines.push(`| 크기 | 구성 태그 | 총 기사 수 |`);
    lines.push(`|---|---|---|`);
    for (const c of h.isolated_clusters) {
      lines.push(`| ${c.size} | ${c.members.map((t) => `\`${t}\``).join(', ')} | ${c.total_articles} |`);
    }
    lines.push('');
  }

  lines.push(`## 5. 메타 태그가 없는 기사`);
  const missing = insights.statistics.missing_posts.filter((m) => m.meta_missing);
  if (!missing.length) { lines.push('모든 기사에 메타 태그 있음.\n'); }
  else {
    lines.push(`| id | category | 제목 | 바로가기 |`);
    lines.push(`|---|---|---|---|`);
    for (const p of missing) {
      lines.push(`| ${p.id} | ${p.category} | ${(p.title || '').replace(/\|/g,'\\|').slice(0,40)} | [공개](https://bpmedia.net/post/${p.id}) |`);
    }
  }
  writeFileSync(resolve(OUT_DIR, '03_health_check.md'), lines.join('\n'));
}

// ───────────── §4 coverage map ─────────────
{
  const c = insights.coverage;
  const lines = [];
  lines.push(`# 콘텐츠 축적 현황 (04_coverage_map)\n`);
  lines.push(`> 생성: ${insights.generated_at}\n`);

  lines.push(`## 1. 글머리 태그별 누적 기사 수`);
  lines.push(`| 글머리 태그 | 기사 수 | 주요 category 분포 |`);
  lines.push(`|---|---|---|`);
  for (const h of c.by_header) {
    const cats = h.categories.map((x) => `${x.category}:${x.n}`).join(' · ');
    lines.push(`| \`${h.tag}\` | ${h.posts} | ${cats} |`);
  }
  lines.push('');

  lines.push(`## 2. 월별 발행 추세`);
  lines.push(`| 월 | 기사 수 |`);
  lines.push(`|---|---|`);
  for (const m of c.monthly) lines.push(`| ${m.month} | ${m.count} |`);
  lines.push('');

  lines.push(`## 3. 전략적으로 부족한 글머리 태그 (기사 5건 이하)`);
  if (!c.gaps.length) { lines.push('모든 글머리 태그가 5건 초과.\n'); }
  else {
    lines.push(`> 이 카테고리는 축적이 얇음. 신규 기사 기획 시 우선 고려.\n`);
    lines.push(c.gaps.map((t) => `- \`${t}\``).join('\n'));
    lines.push('');
  }

  writeFileSync(resolve(OUT_DIR, '04_coverage_map.md'), lines.join('\n'));
}

// ───────────── §5 next actions ─────────────
{
  const s = insights.suggestions;
  const lines = [];
  lines.push(`# SEO/AEO 클러스터 + 신규 콘텐츠 제안 (05_next_actions)\n`);
  lines.push(`> 생성: ${insights.generated_at}`);
  lines.push(`> 모든 제안은 **사람 검토 필요** 플래그. 자동 적용 금지.\n`);

  lines.push(`## 1. 허브-스포크 클러스터 후보 (상위 5)`);
  for (const hub of s.hub_clusters) {
    lines.push(`\n### 허브: \`${hub.hub}\` (${hub.hub_count}건)`);
    lines.push(`| 스포크 태그 | 공출현 횟수 |`);
    lines.push(`|---|---|`);
    for (const sp of hub.spokes) lines.push(`| \`${sp.tag}\` | ${sp.count} |`);
  }
  lines.push('');

  lines.push(`## 2. 기사 수가 부족한 글머리 태그 (축적 필요)`);
  for (const t of s.thin_headers.slice(0, 20)) {
    lines.push(`- \`${t.tag}\` (${t.count}건)`);
  }
  lines.push('');

  lines.push(`## 3. 신규 콘텐츠 제안 (10건, 휴리스틱 · 사람 검토 필요)`);
  lines.push(`| # | 제목 힌트 | 글머리 힌트 | 권장 메타 태그 | 근거 | 우선순위 |`);
  lines.push(`|---|---|---|---|---|---|`);
  s.suggestions.forEach((sug, i) => {
    const metas = sug.meta_hint.map((m) => `\`${m}\``).join(', ');
    lines.push(`| ${i + 1} | ${sug.title_hint} | \`${sug.header_hint}\` | ${metas} | ${sug.rationale} | ${sug.priority} |`);
  });
  lines.push(`\n> 모든 제안은 공출현 패턴에서 기계적으로 파생됨. Editor.A / Jimmy 판단이 필수.\n`);

  writeFileSync(resolve(OUT_DIR, '05_next_actions.md'), lines.join('\n'));
}

console.error(`[run_all] 5개 산출물 생성 완료 → ${OUT_DIR}`);
