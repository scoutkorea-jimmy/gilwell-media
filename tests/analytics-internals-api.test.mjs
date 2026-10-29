import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken } from '../functions/_shared/auth.js';
import { resolveAdminAnalyticsRange, resolveAdminAnalyticsRangeRust } from '../functions/_shared/admin-analytics-range.js';
import { queryRust } from '../functions/_shared/rust-server.js';
import { buildTagInsights, buildTagInsightsRust, prepareTagInsights } from '../functions/_shared/tag-insights.js';
import { onRequestGet as visits, resolveHeatmapRangeLegacy, resolveHeatmapRangeRust } from '../functions/api/admin/analytics.js';
import { onRequestGet as geo } from '../functions/api/admin/geo-audience.js';
import { onRequestGet as marketing } from '../functions/api/admin/marketing.js';
import { onRequestGet as tags } from '../functions/api/admin/tag-insights.js';
import { onRequestGet as articles } from '../functions/api/admin/tag-articles.js';
import { onRequestGet as keywords } from '../functions/api/admin/search-keywords.js';
import { buildVisitHeatmap } from './fixtures/visit-heatmap.js';
import { buildUtmCampaigns } from './fixtures/marketing-campaigns.js';
import { normalizePath, classifyJourneyStage, classifyReferrer } from './fixtures/marketing-classification.js';
import { buildMarketingPayload } from './fixtures/marketing-payload.js';
import { SITE_PATH_TITLE_FALLBACKS } from '../functions/_shared/site-structure.mjs';

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
  const env = { ADMIN_SECRET: TEST_SECRET, DB: Object.assign(new (class D1Database {})(), { prepare(sql) {
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
  } }) };
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

test('Rust admin analytics ranges preserve KST dates, limits, errors and fallback', async () => {
  const direct=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'admin-analytics-range',{start:'2026-10-02',end:'2026-10-01',days:null,all:null,defaultDays:30,allowAll:false,defaultAll:false,today:'2026-10-29'});
  assert.equal(direct.status,200);
  assert.deepEqual((await direct.json()).range,resolveAdminAnalyticsRange(new URLSearchParams('start=2026-10-02&end=2026-10-01')));
  for (const options of [{},{days:7},{allowAll:true,defaultAll:true},{prefix:'tag_'}]) {
    const prefix=options.prefix || '';
    for (const query of ['',`${prefix}days=7`,`${prefix}days=0x10`,`${prefix}days=181`,`${prefix}days=`,`${prefix}days=bad`,`${prefix}start=2026-02-30&${prefix}end=2026-03-01`,`${prefix}start=2026-10-02&${prefix}end=2026-10-01`,`${prefix}start=2026-01-01&${prefix}end=2026-10-15`,`${prefix}start=1800-01-01&${prefix}end=1800-01-02`,`${prefix}all=1`]) {
      const params=new URLSearchParams(query);
      let expected,error;
      try {expected=resolveAdminAnalyticsRange(params,options);} catch(e) {error=e;}
      if (error) await assert.rejects(resolveAdminAnalyticsRangeRust(params,{},options),{name:error.name,message:error.message});
      else assert.deepEqual(await resolveAdminAnalyticsRangeRust(params,{},options),expected,query);
      if (!error) assert.deepEqual(await resolveAdminAnalyticsRangeRust(params,{},options,async()=>new Response('',{status:503})),expected,query+' fallback');
    }
  }
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

test('Rust time series fills leap-day gaps and preserves KST midnight and averages', async () => {
  const f=fixture();
  try {
    addVisit(f,'same','2024-02-28 14:59:59');
    addVisit(f,'same','2024-02-28 15:00:00');
    addVisit(f,'second','2024-03-01 15:00:00');
    const result=await (await request(f,'visits','start=2024-02-28&end=2024-03-02')).json();
    assert.deepEqual(result.visitors.series.map(item=>[item.date,item.visits]),[['2024-02-28',1],['2024-02-29',1],['2024-03-01',0],['2024-03-02',1]]);
    assert.equal(result.summary.range_visits,2);
    assert.equal(result.summary.range_pageviews,3);
    assert.equal(result.summary.average_daily_visits,0.8);
    assert.equal(result.summary.average_daily_pageviews,0.8);
    const hourly=await (await request(f,'visits','start=2024-02-29&end=2024-02-29')).json();
    assert.equal(hourly.visitors.series.length,24);
    assert.equal(hourly.visitors.series[0].visits,1);
    assert.equal(hourly.visitors.series[23].visits,0);
  } finally {f.db.close();}
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

test('Tag drilldown matches whole metadata tokens with JavaScript whitespace and case rules', async () => {
  const f=fixture();
  try {
    addPost(f,1,'\uFEFFScout\uFEFF, scout,Scout',1,'2026-10-01 12:00:00');
    addPost(f,2,'Scout group',1,'2026-10-01 12:00:00');
    addPost(f,3,'scout',1,'2026-10-01 12:00:00');
    addPost(f,4,'Scout',0,'2026-10-01 12:00:00');
    addPost(f,5,'100%, other',1,'2026-10-01 12:00:00');
    for (const [tag,ids] of [['Scout',[1]],['scout',[3,1]],['100%',[5]],['Scout group',[2]],['%',[]]]) {
      const response=await request(f,'articles','tag='+encodeURIComponent(tag));
      assert.equal(response.status,200,tag);
      assert.deepEqual((await response.json()).posts.map(row=>row.id),ids,tag);
    }
  } finally { f.db.close(); }
});

test('Tag drilldown pagination preserves numeric coercion and slicing boundaries', async () => {
  const f=fixture();
  try {
    for (let i=1;i<=7;i++) addPost(f,i,'exact',1,'2026-10-01 12:00:00');
    const all=[7,6,5,4,3,2,1];
    for (const [rawLimit,rawPage] of [[null,null],['2','2'],['1.5','3'],['0','0'],['-8','-4'],['bad','bad'],['Infinity','Infinity'],['0x2','2'],['1000','99']]) {
      const params=new URLSearchParams({tag:'exact'});
      if (rawLimit!==null) params.set('limit',rawLimit);
      if (rawPage!==null) params.set('page',rawPage);
      const limit=Math.min(50,Math.max(1,Number(rawLimit)||20));
      const page=Math.min(Math.max(1,Math.ceil(all.length/limit)),Math.max(1,Math.floor(Number(rawPage)||1)));
      const response=await request(f,'articles',params.toString());
      assert.equal(response.status,200);
      const result=await response.json();
      assert.deepEqual({ids:result.posts.map(row=>row.id),total:result.total,page:result.page,limit:result.limit},{ids:all.slice((page-1)*limit,page*limit),total:all.length,page,limit},params.toString());
    }
  } finally {f.db.close();}
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
    const oldRows=f.db.prepare('SELECT viewer_key,path,referrer_host,referrer_url,utm_source,utm_medium,utm_campaign,visited_at FROM site_visits ORDER BY viewer_key ASC,datetime(visited_at) ASC,id ASC').all().map(row=>({...row,_path:normalizePath(row.path),_stage:classifyJourneyStage(row.path),_source:classifyReferrer(row.referrer_host,row.referrer_url,row.utm_source,row.utm_medium,row.utm_campaign)}));
    const oldPosts=f.db.prepare("SELECT '/post/' || id AS path,title FROM posts WHERE published=1").all();
    assert.deepEqual(data,buildMarketingPayload({startDate:'2026-10-01',endDate:'2026-10-01',label:'2026-10-01',days:1},oldRows,oldPosts,buildUtmCampaigns(oldRows)));
    assert.deepEqual(f.state.writes, []);
  } finally { f.db.close(); }
});

test('Rust marketing output matches the legacy empty dashboard', async () => {
  const f=fixture();
  try {
    const response=await request(f,'marketing','start=2026-10-01&end=2026-10-01');
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),buildMarketingPayload({startDate:'2026-10-01',endDate:'2026-10-01',label:'2026-10-01',days:1},[],[],[]));
  } finally { f.db.close(); }
});

test('Rust marketing campaigns preserve trim, missing values, tie ordering and top 12', async () => {
  const f=fixture();
  try {
    const insert=f.db.prepare('INSERT INTO site_visits(viewer_key,path,visited_at,utm_campaign,utm_source,utm_medium) VALUES(?,?,?,?,?,?)');
    for(let i=0;i<16;i++) insert.run(`viewer-${String(i).padStart(2,'0')}`,'/','2026-10-01 03:00:00',i%3===0?' 가나다 ':`합성${i}`,i%4===0?null:'source',i%2===0?' social ':null);
    insert.run('viewer-99','/','2026-10-01 03:01:00',' 가나다 ',null,' social ');
    insert.run('viewer-empty','/','2026-10-01 03:02:00',null,null,null);
    const rows=f.db.prepare('SELECT utm_campaign,utm_source,utm_medium FROM site_visits ORDER BY viewer_key ASC,datetime(visited_at) ASC,id ASC').all();
    const response=await request(f,'marketing','start=2026-10-01&end=2026-10-01');
    assert.equal(response.status,200);
    const data=await response.json();
    assert.deepEqual(data.utm_campaigns,buildUtmCampaigns(rows));
    assert.equal(data.utm_campaigns.length,12);
    assert.equal(JSON.stringify(data).includes('viewer-'),false);
  } finally {f.db.close();}
});

test('Rust marketing visit classification matches legacy paths, stages and sources', async () => {
  const f=fixture();
  try {
    const paths=['/',' /calendar?x=1 ','/index.html','/wosm-members','/post/12?q=x','/dreampath/','/korea','relative','/post/3#part'];
    const hosts=['direct','unknown','internal','story.kakao.com','search.naver.com','google.com','facebook.com','x.com','sub.example.org','search.daum.net','bing.com','instagram.com','threads.net','youtube.com','linkedin.com','line.me','whatsapp.com','t.me','discord.com','reddit.com','band.us'];
    const insert=f.db.prepare('INSERT INTO site_visits(viewer_key,path,visited_at,referrer_host,referrer_url,utm_source,utm_medium,utm_campaign) VALUES(?,?,?,?,?,?,?,?)');
    hosts.forEach((host,i)=>insert.run(`synthetic-${String(i).padStart(2,'0')}`,paths[i%paths.length],'2026-10-01 03:00:00',host,`https://${host}/search`,i===4?'kakaotalk':null,i===4?'social-share':null,i===4?'Sample':null));
    for(const [index,path] of ['/é','/e\u0301','/post/2','/post/2','/post/3','/post/2'].entries()) insert.run('synthetic-00',path,`2026-10-01 03:0${index+1}:00`,'direct',null,null,null,null);
    insert.run('synthetic-01','/é','2026-10-01 03:01:00','unknown',null,null,null,null);
    insert.run('synthetic-01','/e\u0301','2026-10-01 03:02:00','unknown',null,null,null,null);
    const rows=f.db.prepare('SELECT viewer_key,path,referrer_host,referrer_url,utm_source,utm_medium,utm_campaign,visited_at FROM site_visits ORDER BY viewer_key ASC,datetime(visited_at) ASC,id ASC').all().map(row=>({...row,_path:normalizePath(row.path),_stage:classifyJourneyStage(row.path),_source:classifyReferrer(row.referrer_host,row.referrer_url,row.utm_source,row.utm_medium,row.utm_campaign)}));
    assert.equal(rows.length,hosts.length+8);
    const response=await request(f,'marketing','start=2026-10-01&end=2026-10-01');
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),buildMarketingPayload({startDate:'2026-10-01',endDate:'2026-10-01',label:'2026-10-01',days:1},rows,[],buildUtmCampaigns(rows)));
    const internal=await queryRust({env:f.env,request:new Request('https://synthetic.invalid/')},'analytics-marketing',{start:'2026-10-01 00:00:00',end:'2026-10-02 00:00:00',range:{startDate:'2026-10-01',endDate:'2026-10-01',label:'2026-10-01',days:1},pathTitles:SITE_PATH_TITLE_FALLBACKS});
    assert.equal(JSON.stringify(await internal.json()).includes('synthetic-'),false);
  } finally {f.db.close();}
});

test('Rust marketing output matches legacy across varied synthetic journeys', async () => {
  const f=fixture();
  try {
    const insert=f.db.prepare('INSERT INTO site_visits(viewer_key,path,visited_at,referrer_host,referrer_url,utm_source,utm_medium,utm_campaign) VALUES(?,?,?,?,?,?,?,?)');
    const paths=['/','/calendar','/korea','/post/1','/post/2','/é','/e\u0301','/foo|bar','relative','/post/1?x=1'];
    const hosts=['direct','unknown','naver.com','google.com','facebook.com','sub.example.org'];
    let seed=20261029; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let round=0;round<8;round++) {
      f.db.exec('DELETE FROM site_visits');
      for(let i=0;i<100;i++) {
        const path=paths[random()%paths.length],host=hosts[random()%hosts.length],source=[null,'facebook','kakaotalk','odd|source'][random()%4];
        insert.run(`synthetic-viewer-${random()%20}`,path,`2026-10-01 ${String(random()%12).padStart(2,'0')}:00:00`,host,`https://${host}/search`,source,source?'social-share':null,source?'camp':'');
      }
      const rows=f.db.prepare('SELECT viewer_key,path,referrer_host,referrer_url,utm_source,utm_medium,utm_campaign,visited_at FROM site_visits ORDER BY viewer_key ASC,datetime(visited_at) ASC,id ASC').all().map(row=>({...row,_path:normalizePath(row.path),_stage:classifyJourneyStage(row.path),_source:classifyReferrer(row.referrer_host,row.referrer_url,row.utm_source,row.utm_medium,row.utm_campaign)}));
      const response=await request(f,'marketing','start=2026-10-01&end=2026-10-01');
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),buildMarketingPayload({startDate:'2026-10-01',endDate:'2026-10-01',label:'2026-10-01',days:1},rows,[],buildUtmCampaigns(rows)),`synthetic round ${round}`);
    }
  } finally {f.db.close();}
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

test('heatmaps preserve KST visit and public publication times', async () => {
  const f=fixture();
  try {
    addVisit(f,'viewer','2026-10-01 03:00:00');
    addVisit(f,'admin','2026-10-01 03:01:00','Seoul','/admin');
    addPost(f,1,'',1,'2026-10-01 12:00:00');
    addPost(f,2,'',1,'2026-10-01T03:00:00Z');
    addPost(f,3,'',0,'2026-10-01 12:00:00');
    const response=await request(f,'visits','start=2026-10-01&end=2026-10-01&heatmap_start=2026-10-01&heatmap_end=2026-10-01');
    assert.equal(response.status,200);
    const data=await response.json();
    const cell=data.heatmap.cells.find(c=>c.weekday===4 && c.hour==='12');
    assert.equal(cell.visits,1);
    assert.equal(cell.pageviews,1);
    assert.equal(cell.publish_count,2);
  } finally {f.db.close();}
});

test('Rust heatmap matches the original 168 cells, intensity and empty state', async () => {
  const f=fixture();
  try {
    const query='start=2026-10-01&end=2026-10-01&heatmap_start=2026-10-01&heatmap_end=2026-10-01';
    const range={label:'2026-10-01'};
    let result=await (await request(f,'visits',query)).json();
    assert.deepEqual(result.heatmap,buildVisitHeatmap([],[],range));
    addVisit(f,'one','2026-10-01 03:00:00');
    addVisit(f,'two','2026-10-01 03:01:00');
    addVisit(f,'one','2026-10-01 03:02:00');
    addVisit(f,'four','2026-10-01 03:03:00');
    addVisit(f,'three','2026-10-01 04:00:00');
    addPost(f,1,'',1,'2026-10-01 12:00:00');
    addPost(f,2,'',1,'2026-10-01 12:15:00');
    addPost(f,3,'',1,'2026-10-01 13:00:00');
    result=await (await request(f,'visits',query)).json();
    const visits=[{weekday:4,visit_hour:'12',visits:3,pageviews:4},{weekday:4,visit_hour:'13',visits:1,pageviews:1}];
    const posts=[{weekday:4,publish_hour:'12',publish_count:2},{weekday:4,publish_hour:'13',publish_count:1}];
    assert.deepEqual(result.heatmap,buildVisitHeatmap(visits,posts,range));
  } finally { f.db.close(); }
});

test('path dwell preserves limits, article activity and visit scope', async () => {
  const f=fixture();
  try {
    addPost(f,1,'',1,'2026-10-01 12:00:00');
    addVisit(f,'same','2026-10-01 03:00:00','Seoul','/first');
    addVisit(f,'same','2026-10-01 03:00:02','Seoul','/second');
    addVisit(f,'same','2026-10-01 05:00:02','Seoul','/post/1');
    addVisit(f,'admin','2026-10-01 03:00:01','Seoul','/admin');
    f.db.prepare("INSERT INTO post_engagement(post_id,engaged_seconds,updated_at) VALUES(1,42,'2026-10-01 05:00:00')").run();
    const response=await request(f,'visits','start=2026-10-01&end=2026-10-01');
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.summary.average_dwell_seconds,902.5);
    assert.equal(data.top_paths.find(row=>row.path==='/first').avg_dwell_seconds,5);
    assert.equal(data.top_paths.find(row=>row.path==='/second').avg_dwell_seconds,1800);
    assert.equal(data.top_paths.find(row=>row.path==='/post/1').avg_dwell_seconds,42);
    assert(!data.top_paths.some(row=>row.path==='/admin'));
  } finally {f.db.close();}
});

test('article, referrer and tag details keep their distinct date ranges', async () => {
  const f=fixture();
  try {
    addPost(f,1,'캠프, 교육',1,'2026-10-01 12:00:00');
    addPost(f,2,'교육',0,'2026-10-02 12:00:00');
    addVisit(f,'visitor','2026-10-01 03:00:00','Seoul','/post/1','KR',37.5,127,'facebook');
    f.db.prepare("INSERT INTO post_engagement(post_id,engaged_seconds,updated_at) VALUES(1,55,'2026-10-01 03:00:00')").run();
    const response=await request(f,'visits','start=2026-10-01&end=2026-10-01&tag_start=2026-10-02&tag_end=2026-10-02');
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.article_top_posts[0].path,'/post/1');
    assert.equal(data.article_top_posts[0].avg_dwell_seconds,55);
    assert.equal(data.summary.popular_post_average_dwell_seconds,55);
    assert(data.referrers.some(item=>item.source_key==='utm-facebook'));
    assert(data.tags.graph.articles.some(item=>item.id===2));
    assert(!data.tags.graph.articles.some(item=>item.id===1));
  } finally {f.db.close();}
});


test('experimental Rust tag statistics match the shared analysis for synthetic inputs', async () => {
  const datasets = [[], [
    { id: 1, title: '합성 기사', publish_at:'2026-01-19', category: '국내', tag: ' 행사,행사, Scout ', meta_tags: '캠프, 캠프,Camp', published: 1 },
    { id: 2, title: '두 번째', created_at:'2025-12-01', category: '국내', tag: '', meta_tags: '캠프', published: null },
    { id: 3, title: '빈 메타', category: '국제', tag: '😀, Scout', meta_tags: '', published: '1' },
    { id: 4, title: '제외', category: '국제', tag: '제외', meta_tags: '제외', published: 0 },
    { id: 5, category: '', tag: '\ufeff , ', meta_tags: null },
  ], [
    {id: 21, category: '첫째', tag: '가,나,é,😀', meta_tags: 'é,나,가,😀'},
    {id: 22, category: '둘째', tag: '나,가,e\u0301,😀', meta_tags: 'é,나,가,😀'},
    {id: 23, category: '둘째', tag: '가', meta_tags: '빈도'},
    {id: 24, category: '첫째', tag: '나', meta_tags: '빈도'},
    {id: 25, category: '국내', tag: 'a', meta_tags: '\ue000,😀'},
    {id: 26, category: '국내', tag: 'a', meta_tags: '😀,\ue000'},
    {id: 27, category: '국내', tag: 'a', meta_tags: 'a\u0001b,c'},
    {id: 28, category: '국내', tag: 'a', meta_tags: 'a,b\u0001c'},
    {id: 29, category: '국내', tag: 'a', meta_tags: '스카우트,스카우팅,캠프😀,캠프😁'},
    {id: 30, category: '국내', tag: 'a', meta_tags: '고립첫째,고립둘째'},
  ], Array.from({length: 180}, (_, i) => ({ id: i + 10, title: `합성 ${i}`, category: ['a', 'b', '다', ''][i % 4], tag: i % 3 ? 'A,가,A' : '', meta_tags: i % 5 ? `공통,태그${i % 7}` : '', published: i % 11 ? 1 : 0 }))];
  for (const rows of datasets) {
    const expected = JSON.parse(JSON.stringify(buildTagInsights(rows).statistics));
    const response = await queryRust({env: {}, request: {url: 'https://synthetic.invalid/'}}, 'tag-insight-statistics', {posts: prepareTagInsights(rows)});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    const rankings = await queryRust({env: {}, request: {url: 'https://synthetic.invalid/'}}, 'tag-insight-rankings', {posts: prepareTagInsights(rows)});
    assert.equal(rankings.status, 200);
    const reference = buildTagInsights(rows);
    const assembled = await buildTagInsightsRust(rows);
    delete assembled.generated_at;
    const legacy = {...reference}; delete legacy.generated_at;
    assert.deepEqual(assembled,legacy);
    assert.deepEqual(await rankings.json(), {header_ranking:reference.header_ranking,meta_ranking:reference.meta_ranking,graph:reference.graph,health:reference.health,coverage:reference.coverage,suggestions:reference.suggestions});
  }
});


test('Rust heatmap ranges preserve long spans, default bounds and legacy fallback', async () => {
  for (const query of ['', 'heatmap_days=1','heatmap_days=90','heatmap_days=300','heatmap_days=0', 'heatmap_days=2.5', 'heatmap_days=bad','heatmap_all=1','heatmap_start=2020-01-01&heatmap_end=2026-10-01','heatmap_start=2026-10-02&heatmap_end=2026-10-01','heatmap_start=2026-01-01']) {
    const params=new URLSearchParams(query);
    assert.deepEqual(await resolveHeatmapRangeRust(params),resolveHeatmapRangeLegacy(params));
    const failing=async()=>new Response('synthetic',{status:503});
    assert.deepEqual(await resolveHeatmapRangeRust(params,{},failing),resolveHeatmapRangeLegacy(params));
  }
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'admin-heatmap-range',{start:'2020-01-01',end:'2026-10-01',days:null,all:null,today});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).range,resolveHeatmapRangeLegacy(new URLSearchParams('heatmap_start=2020-01-01&heatmap_end=2026-10-01')));
});
