/**
 * functions/_shared/tag-insights.js
 *
 * 태그 인사이트 분석 공유 모듈.
 * - 서버 API `/api/admin/tag-insights`에서 호출 (D1 posts 결과 전달).
 * - Node 스크립트 `scripts/tag-analysis/*.mjs`에서도 동일 호출해 .md 산출물 생성.
 *
 * 입력: { id, category, title, tag, meta_tags, publish_at, created_at, views, ... } 배열.
 * 출력: { statistics, header_ranking, meta_ranking, graph, health, coverage, suggestions } 객체.
 *
 * 원칙(스펙 준수):
 *   - 태그 이름은 원문 그대로. 대소문자/공백 변형 없음(한 기사 내 중복만 제거).
 *   - 자동 통합/삭제 금지. 건강성 진단 결과는 모두 "사람 검토 필요" 플래그.
 */

export function buildTagInsights(rows, options) {
  const opts = options || {};
  const posts = (Array.isArray(rows) ? rows : [])
    .filter((r) => {
      const pub = r ? r.published : 1;
      return Number(pub == null ? 1 : pub) === 1;
    })
    .map((r) => ({
      id: Number(r.id || 0),
      title: String(r.title || ''),
      category: String(r.category || ''),
      publish_at: r.publish_at || r.created_at || '',
      created_at: r.created_at || '',
      views: Number(r.views || 0),
      header_tokens: splitCommaTokens(r.tag),
      meta_tokens: splitCommaTokens(r.meta_tags),
    }));

  const statistics = buildStatistics(posts);
  const headerRanking = buildHeaderRanking(posts);
  const metaRanking = buildMetaRanking(posts);
  const pairMap = buildPairMap(posts);
  const graph = buildGraph(posts, metaRanking, pairMap);
  const health = buildHealth(posts, metaRanking, pairMap);
  const coverage = buildCoverage(posts, headerRanking);
  const suggestions = buildSuggestions(posts, metaRanking, pairMap, headerRanking);

  return {
    generated_at: new Date().toISOString(),
    statistics,
    header_ranking: headerRanking,
    meta_ranking: metaRanking,
    graph,
    health,
    coverage,
    suggestions,
  };
}

// ───────────── utilities ─────────────
export function splitCommaTokens(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const seen = new Set();
  const out = [];
  for (const piece of s.split(',')) {
    const t = piece.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function monthKey(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// ───────────── §1 statistics ─────────────
function buildStatistics(posts) {
  let tagMissing = 0;
  let metaMissing = 0;
  let metaSum = 0;
  let metaNonEmpty = 0;
  const uniqueHeader = new Set();
  const uniqueMeta = new Set();
  const catMetaSum = new Map();
  const catMetaPosts = new Map();
  const catPosts = new Map();

  for (const p of posts) {
    if (!p.header_tokens.length) tagMissing++;
    if (!p.meta_tokens.length) metaMissing++;
    p.header_tokens.forEach((t) => uniqueHeader.add(t));
    p.meta_tokens.forEach((t) => uniqueMeta.add(t));
    if (p.meta_tokens.length) {
      metaSum += p.meta_tokens.length;
      metaNonEmpty++;
      catMetaSum.set(p.category, (catMetaSum.get(p.category) || 0) + p.meta_tokens.length);
      catMetaPosts.set(p.category, (catMetaPosts.get(p.category) || 0) + 1);
    }
    catPosts.set(p.category, (catPosts.get(p.category) || 0) + 1);
  }

  const categoryAvg = [...catPosts.entries()].map(([category, n]) => ({
    category,
    posts: n,
    with_meta: catMetaPosts.get(category) || 0,
    meta_sum: catMetaSum.get(category) || 0,
    avg_meta: (catMetaPosts.get(category) || 0)
      ? ((catMetaSum.get(category) || 0) / (catMetaPosts.get(category) || 1))
      : 0,
  })).sort((a, b) => b.avg_meta - a.avg_meta || b.posts - a.posts);

  return {
    total_posts: posts.length,
    tag_missing: tagMissing,
    meta_missing: metaMissing,
    unique_header_tags: uniqueHeader.size,
    unique_meta_tags: uniqueMeta.size,
    avg_meta_per_post: metaNonEmpty ? (metaSum / metaNonEmpty) : 0,
    category_avg: categoryAvg,
    missing_posts: posts
      .filter((p) => !p.header_tokens.length || !p.meta_tokens.length)
      .map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        tag_missing: !p.header_tokens.length,
        meta_missing: !p.meta_tokens.length,
      })),
  };
}

// ───────────── header tag ranking (글머리) ─────────────
function buildHeaderRanking(posts) {
  const map = new Map();
  for (const p of posts) {
    for (const t of p.header_tokens) map.set(t, (map.get(t) || 0) + 1);
  }
  const total = posts.length;
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count, pct: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));
}

// ───────────── meta tag ranking (메타) ─────────────
function buildMetaRanking(posts) {
  const map = new Map();
  const categoryMap = new Map();    // tag → {category: count}
  const headerMap = new Map();      // tag → {header: count}
  for (const p of posts) {
    for (const t of p.meta_tokens) {
      map.set(t, (map.get(t) || 0) + 1);
      if (!categoryMap.has(t)) categoryMap.set(t, new Map());
      const cm = categoryMap.get(t);
      cm.set(p.category, (cm.get(p.category) || 0) + 1);
      if (!headerMap.has(t)) headerMap.set(t, new Map());
      const hm = headerMap.get(t);
      for (const h of p.header_tokens) hm.set(h, (hm.get(h) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([tag, count]) => {
      const cm = categoryMap.get(tag);
      const hm = headerMap.get(tag);
      let topCategory = '';
      let topCategoryN = 0;
      if (cm) {
        for (const [c, n] of cm.entries()) if (n > topCategoryN) { topCategoryN = n; topCategory = c; }
      }
      let topHeader = '';
      let topHeaderN = 0;
      if (hm) {
        for (const [h, n] of hm.entries()) if (n > topHeaderN) { topHeaderN = n; topHeader = h; }
      }
      return { tag, count, top_category: topCategory, top_header: topHeader };
    })
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));
}

// ───────────── §2 pair map (co-occurrence) ─────────────
function buildPairMap(posts) {
  const map = new Map();
  for (const p of posts) {
    const tokens = p.meta_tokens;
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const a = tokens[i];
        const b = tokens[j];
        const key = [a, b].sort().join('\u0001');
        const cur = map.get(key) || { a, b, count: 0 };
        cur.count += 1;
        map.set(key, cur);
      }
    }
  }
  return map;
}

// ───────────── §2 graph (nodes + edges) ─────────────
function buildGraph(posts, metaRanking, pairMap) {
  const maxCount = Math.max(1, ...metaRanking.map((m) => m.count));
  const nodes = metaRanking.map((item) => ({
    id: item.tag,
    label: item.tag,
    count: item.count,
    size: Math.round(10 + (item.count / maxCount) * 30), // 10~40 px
    top_header: item.top_header,
    top_category: item.top_category,
  }));
  const links = [...pairMap.values()].map((p) => ({
    source: p.a,
    target: p.b,
    count: p.count,
  })).sort((a, b) => b.count - a.count);
  return { nodes, links };
}

// ───────────── §3 health check ─────────────
function buildHealth(posts, metaRanking, pairMap) {
  const total = posts.length;

  // 3.1 Isolated (등장 1회) 메타 태그
  const isolated = metaRanking.filter((m) => m.count === 1).map((m) => m.tag);

  // 3.2 Overly common (전체 기사의 30% 이상)
  const overlyCommonThreshold = Math.max(3, Math.floor(total * 0.3));
  const overlyCommon = metaRanking
    .filter((m) => m.count >= overlyCommonThreshold)
    .map((m) => ({ tag: m.tag, count: m.count, pct: total ? (m.count / total) : 0 }));

  // 3.3 중복 의심 쌍 (edit distance + substring + co-occurrence heuristic)
  const tags = metaRanking.map((m) => m.tag);
  const duplicateSuspects = [];
  const MAX_PAIRS = 1500; // 대규모 O(n^2) 방지
  const sampleTags = tags.slice(0, 400); // 상위 빈도만 검사
  for (let i = 0; i < sampleTags.length && duplicateSuspects.length < 60; i++) {
    for (let j = i + 1; j < sampleTags.length; j++) {
      const a = sampleTags[i];
      const b = sampleTags[j];
      if (duplicateSuspects.length >= 60) break;
      const reasons = [];
      // substring containment
      if (a.length >= 3 && b.length >= 3) {
        if (a.includes(b) || b.includes(a)) reasons.push('부분 포함');
      }
      // Levenshtein distance (cheap for short strings)
      const dist = levenshtein(a, b);
      const maxLen = Math.max(a.length, b.length);
      if (maxLen >= 4 && dist > 0 && dist <= 2) reasons.push(`편집거리 ${dist}`);
      if (!reasons.length) continue;
      duplicateSuspects.push({
        left: a,
        right: b,
        left_count: metaRanking.find((x) => x.tag === a).count,
        right_count: metaRanking.find((x) => x.tag === b).count,
        reasons,
      });
      if (duplicateSuspects.length >= MAX_PAIRS) break;
    }
  }

  // 3.4 고립 군집 (다른 태그와 공출현 없는 그룹)
  // 간단한 union-find로 연결 컴포넌트 계산
  const parent = new Map();
  function find(x) { if (parent.get(x) === x) return x; const r = find(parent.get(x)); parent.set(x, r); return r; }
  function union(a, b) { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); }
  for (const t of tags) parent.set(t, t);
  for (const p of pairMap.values()) {
    if (parent.has(p.a) && parent.has(p.b)) union(p.a, p.b);
  }
  const components = new Map();
  for (const t of tags) {
    const root = find(t);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(t);
  }
  const isolatedClusters = [...components.values()]
    .filter((members) => members.length >= 2 && members.length <= 5)
    .map((members) => ({
      size: members.length,
      members,
      total_articles: members.reduce((sum, t) => {
        const r = metaRanking.find((x) => x.tag === t);
        return sum + (r ? r.count : 0);
      }, 0),
    }))
    .sort((a, b) => a.total_articles - b.total_articles)
    .slice(0, 20);

  return {
    isolated_tags: isolated,
    isolated_tags_count: isolated.length,
    overly_common_threshold: overlyCommonThreshold,
    overly_common: overlyCommon,
    duplicate_suspects: duplicateSuspects,
    isolated_clusters: isolatedClusters,
    total_components: components.size,
  };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  if (Math.abs(m - n) > 3) return Infinity; // early exit for long diff
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// ───────────── §4 coverage map ─────────────
function buildCoverage(posts, headerRanking) {
  const byHeader = new Map();
  for (const p of posts) {
    for (const h of p.header_tokens) {
      if (!byHeader.has(h)) byHeader.set(h, { tag: h, posts: [], categories: new Map() });
      const entry = byHeader.get(h);
      entry.posts.push({ id: p.id, title: p.title, category: p.category, publish_at: p.publish_at });
      entry.categories.set(p.category, (entry.categories.get(p.category) || 0) + 1);
    }
  }
  const headerStats = [...byHeader.values()].map((e) => ({
    tag: e.tag,
    posts: e.posts.length,
    categories: [...e.categories.entries()].map(([c, n]) => ({ category: c, n })).sort((a, b) => b.n - a.n),
  })).sort((a, b) => b.posts - a.posts);

  // monthly trend
  const monthMap = new Map();
  for (const p of posts) {
    const mk = monthKey(p.publish_at || p.created_at);
    if (!mk) continue;
    monthMap.set(mk, (monthMap.get(mk) || 0) + 1);
  }
  const monthly = [...monthMap.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // strategic gaps: 글머리 태그 중 기사 5건 미만
  const gaps = headerStats.filter((h) => h.posts <= 4).map((h) => h.tag);

  return {
    by_header: headerStats,
    monthly,
    gaps,
    empty_or_thin_header_count: gaps.length,
  };
}

// ───────────── §5 suggestions (hub-spoke + next actions) ─────────────
function buildSuggestions(posts, metaRanking, pairMap, headerRanking) {
  // Hub candidates: top 5 by count, each with spokes = top co-occurring tags
  const topHubs = metaRanking.slice(0, 8);
  const hubClusters = topHubs.map((hub) => {
    const connected = [];
    for (const p of pairMap.values()) {
      if (p.a === hub.tag) connected.push({ tag: p.b, count: p.count });
      else if (p.b === hub.tag) connected.push({ tag: p.a, count: p.count });
    }
    connected.sort((a, b) => b.count - a.count);
    return {
      hub: hub.tag,
      hub_count: hub.count,
      spokes: connected.slice(0, 10),
    };
  }).slice(0, 5);

  // Content gaps: 글머리 태그 기사 수가 적고, 메타 태그 중 관련 있는 키워드가 부족한 조합
  const thinHeaders = headerRanking.filter((h) => h.count > 0 && h.count <= 5);

  // Suggestion generator (heuristic + "사람 검토 필요" 플래그)
  const suggestions = [];
  for (const hub of hubClusters) {
    for (const spoke of hub.spokes.slice(0, 3)) {
      if (suggestions.length >= 10) break;
      suggestions.push({
        title_hint: `${hub.hub} × ${spoke.tag} 교차 특집 (제안)`,
        header_hint: '소식',
        meta_hint: Array.from(new Set([hub.hub, spoke.tag])).concat(hub.spokes.slice(0, 3).map((s) => s.tag)).slice(0, 6),
        rationale: `허브 "${hub.hub}"(${hub.hub_count}건)과 "${spoke.tag}"(${spoke.count}건 공출현)는 자주 연결되나 특집 포맷의 교차 분석 기사가 부족할 수 있다.`,
        priority: hub.hub_count >= 15 ? '상' : (hub.hub_count >= 8 ? '중' : '하'),
        human_review: true,
      });
    }
    if (suggestions.length >= 10) break;
  }

  return {
    hub_clusters: hubClusters,
    thin_headers: thinHeaders,
    suggestions,
    human_review_required: true,
  };
}
