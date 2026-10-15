import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken } from '../functions/_shared/auth.js';
import { resolveAdminAnalyticsRange } from '../functions/_shared/admin-analytics-range.js';
import { onRequestGet as visits } from '../functions/api/admin/analytics.js';
import { onRequestGet as geo } from '../functions/api/admin/geo-audience.js';
import { onRequestGet as marketing } from '../functions/api/admin/marketing.js';
import { onRequestGet as tags } from '../functions/api/admin/tag-insights.js';
import { onRequestGet as articles } from '../functions/api/admin/tag-articles.js';
import { onRequestGet as keywords } from '../functions/api/admin/search-keywords.js';

const TEST_SECRET = 'analytics-test-only-secret-no-production-access';
const handlers = { visits, geo, marketing, tags, articles, keywords };

function fixture({ role = 'owner', permissions = [], accessAdmin = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE site_visits (id INTEGER PRIMARY KEY, viewer_key TEXT, path TEXT, referrer_host TEXT, referrer_url TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, visited_at TEXT, country_code TEXT, country_name TEXT, city_name TEXT, region_code TEXT, continent_code TEXT, latitude REAL, longitude REAL);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, subtitle TEXT, category TEXT, tag TEXT, meta_tags TEXT, special_feature TEXT, published INTEGER, publish_at TEXT, created_at TEXT, updated_at TEXT, views INTEGER);
    CREATE TABLE post_engagement (post_id INTEGER, engaged_seconds REAL, updated_at TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);`);
  const user = { id: 17, username: 'analytics_fixture', role, status: 'active', token_min_iat: 0, permissions: JSON.stringify({ access_admin: accessAdmin, permissions }) };
  const state = { queries: [], writes: [] };
  const env = { ADMIN_SECRET: TEST_SECRET, DB: { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() {
        state.queries.push(sql);
        if (sql.includes('FROM admin_users')) return { ...user };
        return db.prepare(sql).get(...args) || null;
      },
      async all() { state.queries.push(sql); return { results: db.prepare(sql).all(...args) }; },
      async run() { state.writes.push(sql); return { success: true, ...db.prepare(sql).run(...args) }; },
    };
  } } };
  return { db, env, state, user };
}

async function request(f, key, query, authenticated = true) {
  const headers = {};
  if (authenticated) headers.Cookie = 'admin_token=' + await createToken(TEST_SECRET, { role: f.user.role, uid: f.user.id });
  return handlers[key]({ env: f.env, request: new Request('https://local-analytics.invalid/api/admin/' + key + '?' + query, { headers }) });
}

function addVisit(f, viewer, stamp, city = 'Seoul', path = '/', country = 'KR', lat = 37.5, lon = 127, source = null) {
  f.db.prepare('INSERT INTO site_visits (viewer_key,path,visited_at,country_code,country_name,city_name,latitude,longitude,utm_source) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(viewer, path, stamp, country, country === 'KR' ? 'South Korea' : country, city, lat, lon, source);
}
function addPost(f, id, meta, published, publishAt, createdAt = '2026-09-01 00:00:00', header = '검증') {
  f.db.prepare('INSERT INTO posts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, '합성 기사 ' + id, '', 'korea', header, meta, '', published, publishAt, createdAt, createdAt, 0);
}

test('Admin ranges reject partial/invalid dates, normalize reverse order and cap inclusive days at180', () => {
  for (const query of ['start=2026-10-01', 'end=2026-10-02', 'start=2026-02-30&end=2026-03-01', 'days=foo', 'days=-1']) {
    assert.throws(() => resolveAdminAnalyticsRange(new URLSearchParams(query)), RangeError);
  }
  const reversed = resolveAdminAnalyticsRange(new URLSearchParams('start=2026-10-02&end=2026-10-01'));
  assert.equal(reversed.startDate, '2026-10-01'); assert.equal(reversed.days, 2);
  const capped = resolveAdminAnalyticsRange(new URLSearchParams('start=2026-01-01&end=2026-10-15'));
  assert.equal(capped.days, 180); assert.equal(capped.endDate, '2026-10-15');
  // Explicit custom bounds take precedence over a legacy all=1 caller.
  assert.equal(resolveAdminAnalyticsRange(new URLSearchParams('all=1&start=2026-10-01&end=2026-10-02'), { allowAll: true }).days, 2);
});

test('every analytics endpoint enforces anonymous401 and restricted-member403 before data queries', async () => {
  const f = fixture({ role: 'member' });
  try {
    for (const key of Object.keys(handlers)) {
      assert.equal((await request(f, key, 'days=7&tag=검증', false)).status, 401);
      assert.equal((await request(f, key, 'days=7&tag=검증')).status, 403);
    }
    assert.equal(f.state.queries.some(sql => /FROM (site_visits|posts)/.test(sql)), false);
    assert.deepEqual(f.state.writes, []);
  } finally { f.db.close(); }
});

test('period unique visits are independent of daily and hourly series sums', async () => {
  const f = fixture();
  try {
    addVisit(f, 'same-viewer', '2026-09-30 15:30:00');
    addVisit(f, 'same-viewer', '2026-10-01 01:30:00');
    addVisit(f, 'same-viewer', '2026-10-01 15:30:00');
    addVisit(f, 'second-viewer', '2026-10-01 15:45:00');
    addVisit(f, 'admin-only', '2026-10-01 15:50:00', 'Seoul', '/admin.html');
    const response = await request(f, 'visits', 'start=2026-10-01&end=2026-10-02');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.summary.range_visits, 2);
    assert.equal(data.visitors.series.reduce((sum, row) => sum + row.visits, 0), 3);
    assert.equal(data.summary.range_pageviews, 4);
    const hourly = await (await request(f, 'visits', 'start=2026-10-01&end=2026-10-01')).json();
    assert.equal(hourly.summary.range_visits, 1);
    assert.equal(hourly.visitors.series.reduce((sum, row) => sum + row.visits, 0), 2);
  } finally { f.db.close(); }
});

test('Geo keeps country distinct counts, all301cities, null coordinates and explicit unknowns', async () => {
  const f = fixture();
  try {
    addVisit(f, 'mobile-viewer', '2026-10-01 00:00:00', 'Seoul');
    addVisit(f, 'mobile-viewer', '2026-10-01 01:00:00', 'Busan');
    for (let i = 0; i < 301; i++) addVisit(f, 'viewer-' + i, '2026-10-01 02:00:00', 'Synthetic City ' + i, '/', 'KR', null, null);
    addVisit(f, 'unknown-location', '2026-10-01 03:00:00', null, '/', null, null, null);
    const response = await request(f, 'geo', 'start=2026-10-01&end=2026-10-01');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.countries.find(row => row.country_code === 'KR').visits, 302);
    assert.equal(data.cities.length, 304);
    assert.equal(data.cities.filter(row => row.country_code === 'KR').reduce((sum, row) => sum + row.visits, 0), 303);
    assert.equal(data.cities.find(row => row.city_name_original === 'Synthetic City 300').latitude, null);
    assert.equal(data.countries.find(row => row.country_code === 'ZZ').country_name, '국가 미확인');
    assert.equal(data.summary.unknown_country_pageviews, 1);
    assert.equal(data.summary.missing_coordinate_pageviews, 302);
    assert.ok(f.state.writes.every(sql => sql.startsWith('CREATE INDEX IF NOT EXISTS')));
  } finally { f.db.close(); }
});

test('Tag summary and exact-meta drilldown use same published population and KST bounds', async () => {
  const f = fixture({ role: 'member', permissions: ['view:analytics-tags'] });
  try {
    addPost(f, 1, '스카우트, 잼버리', 1, '2026-10-01 00:00:00');
    addPost(f, 2, '스카우트연맹', 1, '2026-10-01 13:00:00');
    addPost(f, 3, '스카우트', 0, '2026-10-01 13:00:00');
    addPost(f, 4, '스카우트', 1, '2026-09-30 23:59:59');
    addPost(f, 5, ' 스카우트 , 미래 ', 1, null, '2026-09-30 15:00:00');
    addPost(f, 6, '스카우트', 1, '2026-10-01T15:00:00Z'); // Oct2 KST
    addPost(f, 7, '스카우트', 1, '2026-10-02 00:00:00');
    const query = 'start=2026-10-01&end=2026-10-01&all=1';
    const insightResponse = await request(f, 'tags', query);
    assert.equal(insightResponse.status, 200);
    const insights = await insightResponse.json();
    assert.equal(insights.statistics.total_posts, 3);
    assert.equal(insights.meta_ranking.find(row => row.tag === '스카우트').count, 2);
    assert.equal(insights.range.days, 1);
    const detailResponse = await request(f, 'articles', query + '&tag=' + encodeURIComponent('스카우트'));
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.total, 2);
    assert.deepEqual(detail.posts.map(row => row.id).sort(), [1, 5]);
    assert.deepEqual(detail.range, insights.range);
    assert.deepEqual(f.state.writes, []);
  } finally { f.db.close(); }
});

test('Marketing period totals flow through other buckets without losing or double-counting users', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 12; i++) {
      addPost(f, i + 1, '검증', 1, '2026-10-01 00:00:00');
      addVisit(f, 'viewer-' + i, '2026-10-01 00:00:00', 'Seoul', '/', 'KR', 37, 127, 'synthetic-channel-' + i);
      addVisit(f, 'viewer-' + i, '2026-10-01 01:00:00', 'Seoul', '/post/' + (i + 1), 'KR', 37, 127);
    }
    const response = await request(f, 'marketing', 'start=2026-10-01&end=2026-10-01');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.summary.unique_users, 12);
    assert.equal(data.summary.awareness_users, 12);
    const flow = data.journey_flow;
    assert.equal(flow.sources.reduce((sum, item) => sum + item.value, 0), 12);
    assert.equal(flow.destinations.reduce((sum, item) => sum + item.value, 0), 12);
    assert.equal(flow.stages.reduce((sum, item) => sum + item.value, 0), 12);
    assert.ok(flow.destinations.some(item => item.label === '기타 대표 페이지'));
    assert.equal(flow.links.filter(link => link.source.startsWith('source:')).reduce((sum, link) => sum + link.value, 0), 12);
    assert.equal(flow.links.filter(link => link.target.startsWith('dest:')).reduce((sum, link) => sum + link.value, 0), 12);
    assert.match(flow.definition, /세션 전환율 아님/);
    assert.deepEqual(f.state.writes, []);
  } finally { f.db.close(); }
});

test('all analysis range endpoints return400 for partial dates without reading metric tables', async () => {
  const f = fixture();
  try {
    for (const key of Object.keys(handlers)) assert.equal((await request(f, key, 'start=2026-10-01&tag=검증')).status, 400);
    assert.equal(f.state.queries.some(sql => /FROM (site_visits|posts)/.test(sql)), false);
    assert.deepEqual(f.state.writes, []);
  } finally { f.db.close(); }
});

test('Search referrer keywords share normalized KST range without mixing admin or future events', async () => {
  const f = fixture();
  try {
    addVisit(f, 'search1', '2026-09-30 15:00:00');
    addVisit(f, 'search2', '2026-10-01 14:59:59');
    addVisit(f, 'outside', '2026-10-01 15:00:00');
    addVisit(f, 'private-admin', '2026-10-01 12:00:00', 'Seoul', '/admin');
    f.db.exec(`UPDATE site_visits SET referrer_host='www.google.com', referrer_url='https://www.google.com/search?q=scouting'`);
    const response = await request(f, 'keywords', 'start=2026-10-01&end=2026-10-01');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total_visits, 2);
    assert.equal(data.known_visits, 2);
    assert.equal(data.keywords[0].keyword, 'scouting');
    assert.equal(data.range.days, null); assert.equal(data.range.effective_days, 1);
    assert.equal(data.range.start, '2026-10-01'); assert.equal(data.range.label, '2026-10-01');
    assert.deepEqual(f.state.writes, []);
  } finally { f.db.close(); }
});

test('Geo unknown country zero and missing coordinate pairs are preserved, real zero coordinates remain valid', async () => {
  const f = fixture();
  try {
    addVisit(f, 'unknown-city', '2026-10-01 00:00:00', 'Synthetic Unknown City', '/', null, null, 127);
    addVisit(f, 'unknown-city2', '2026-10-01 01:00:00', 'Synthetic Unknown City', '/', null, 37, null);
    let data = await (await request(f, 'geo', 'start=2026-10-01&end=2026-10-01')).json();
    assert.equal(data.summary.countries, 0); assert.equal(data.summary.cities, 1);
    assert.equal(data.countries[0].latitude, null); assert.equal(data.countries[0].longitude, null);
    addVisit(f, 'equator', '2026-10-01 02:00:00', 'Synthetic Zero City', '/', 'GH', 0, 0);
    data = await (await request(f, 'geo', 'start=2026-10-01&end=2026-10-01')).json();
    const zero = data.cities.find(row => row.city_name_original === 'Synthetic Zero City');
    assert.equal(zero.latitude, 0); assert.equal(zero.longitude, 0);
    assert.equal(data.summary.missing_coordinate_pageviews, 2);
  } finally { f.db.close(); }
});
