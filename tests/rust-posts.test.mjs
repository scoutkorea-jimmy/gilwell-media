import './register-rust-wasm.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken } from '../functions/_shared/auth.js';
import { queryRust } from '../functions/_shared/rust-server.js';
import { COUNTRY_CODE_LABELS_KO, getCountryCatalogSorted } from '../functions/_shared/country-code-labels.js';
import { onRequestGet as countries } from '../functions/api/memorabilia/countries.js';
import { PUBLIC_DATE_EXPR } from '../functions/_shared/post-public-date.js';
import { serializePostImage } from '../functions/_shared/images.js';
import { POPULAR_WEIGHTS } from '../functions/_shared/home-rails.js';
import { loadNavLabels, normalizeNavLabels } from '../functions/_shared/nav-labels.js';
import { loadSiteMeta, normalizeSiteMeta } from '../functions/_shared/site-meta.js';
import { enforceRateLimit as actualRate } from '../functions/_shared/rate-limit.js';
import { enforceRateLimit as oldRate } from './fixtures/rust-rate-limit.js';
import { isPublishKillSwitchOn, requirePublishAllowed } from '../functions/_shared/admin-permissions.js';
import { logOperationalEvent as actualOps, ensureOperationalEventsTable as actualOpsEnsure } from '../functions/_shared/ops-log.js';
import { logOperationalEvent as oldOps, ensureOperationalEventsTable as oldOpsEnsure } from './fixtures/rust-ops-log.js';
import { onRequestGet as sitemap, onRequestHead as sitemapHead } from '../functions/sitemap.xml/index.js';
import { onRequestGet as oldSitemap, onRequestHead as oldSitemapHead } from './fixtures/rust-seo/sitemap.js';
import { onRequestGet as newsSitemap, onRequestHead as newsSitemapHead } from '../functions/sitemap-news.xml/index.js';
import { onRequestGet as oldNewsSitemap, onRequestHead as oldNewsSitemapHead } from './fixtures/rust-seo/news.js';
import { onRequestGet as rss } from '../functions/rss.xml.js';
import { onRequestGet as oldRss } from './fixtures/rust-seo/rss.js';
import { ensureDuePostsPublished as actualDue } from '../functions/_shared/publish-due-posts.js';
import { ensureDuePostsPublished as oldDue } from './fixtures/rust-publish-due-posts.js';
import { onRequestGet as actual } from '../functions/api/posts/index.js';
import { onRequestGet as original, onRequestPost as originalCreate } from './fixtures/rust-posts/index.js';
import { onRequestPost as actualCreate } from '../functions/api/posts/index.js';
import { onRequestGet as actualTags } from '../functions/api/posts/tags.js';
import { onRequestGet as originalTags } from './fixtures/rust-posts/tags.js';
import { onRequestGet as actualFeatures } from '../functions/api/posts/special-features.js';
import { onRequestGet as originalFeatures } from './fixtures/rust-posts/special-features.js';
import { onRequestGet as actualPopular } from '../functions/api/posts/popular.js';
import { onRequestGet as originalPopular } from './fixtures/rust-posts/popular.js';
import { onRequestGet as actualHome, assembleHomeResponse } from '../functions/api/home.js';
import { ensureHomepageIssuesTable as ensureActualIssue, recordHomepageIssue as actualIssue } from '../functions/_shared/homepage-issues.js';
import { ensureHomepageIssuesTable as ensureOriginalIssue, recordHomepageIssue as originalIssue } from './fixtures/rust-homepage-issues.js';
import { onRequestGet as actualIssuesList } from '../functions/api/admin/homepage-issues.js';
import { onRequestGet as originalIssuesList } from './fixtures/rust-admin-issues/index.js';
import { onRequestPatch as actualIssuePatch } from '../functions/api/admin/homepage-issues/[id].js';
import { onRequestPatch as originalIssuePatch } from './fixtures/rust-admin-issues/id.js';
import { onRequestGet as actualHistory } from '../functions/api/admin/site-history.js';
import { onRequestGet as originalHistory } from './fixtures/rust-admin-issues/site-history.js';
import { onRequestGet as originalHome } from './fixtures/rust-home.js';
import { onRequestGet as actualDetail, onRequestDelete as actualDelete, onRequestPut as actualPut, onRequestPatch as actualPatch } from '../functions/api/posts/[id].js';
import { onRequestGet as originalDetail } from './fixtures/rust-posts/detail.js';
import { onRequestDelete as originalDelete, onRequestPut as originalPut, onRequestPatch as originalPatch } from './fixtures/rust-posts/write.js';
import { getViewerKey } from '../functions/_shared/engagement.js';
import { getLikeStats as actualLikeStats } from '../functions/_shared/engagement.js';
import { getLikeStats as originalLikeStats } from './fixtures/rust-engagement.js';
import { recordUniqueView as actualView } from '../functions/_shared/engagement.js';
import { recordUniqueView as originalView } from './fixtures/rust-engagement.js';
import { onRequestPost as actualLike } from '../functions/api/posts/[id]/like.js';
import { onRequestPost as originalLike } from './fixtures/rust-posts/like.js';
import { findRelatedPosts as actualRelated, findManualRelatedPosts as actualManual } from '../functions/_shared/related-posts.js';
import { findRelatedPosts as originalRelated, findManualRelatedPosts as originalManual } from './fixtures/rust-related-posts.js';
import { getSpecialFeatureCollection as actualCollection, findSpecialFeaturePosts as actualFeaturePosts } from '../functions/_shared/special-features.js';
import { getSpecialFeatureCollection as originalCollection, findSpecialFeaturePosts as originalFeaturePosts } from './fixtures/rust-special-features.js';
import { onRequestGet as actualArticlePage } from '../functions/post/[id].js';
import { onRequestGet as originalArticlePage } from './fixtures/rust-article-page.js';
import { onRequestGet as actualExport } from '../functions/api/articles.ndjson.js';
import { onRequestGet as originalExport } from './fixtures/rust-articles-ndjson.js';
import { recordSiteVisit as actualSiteVisit, ensureSiteVisitColumns } from '../functions/_shared/analytics.js';
import { recordSiteVisit as oldSiteVisit } from './fixtures/rust-analytics.js';
import { onRequestPost as actualEngagement } from '../functions/api/analytics/post-engagement.js';
import { onRequestPost as oldEngagement } from './fixtures/rust-post-engagement.js';
import { onRequestGet as actualAnalytics } from '../functions/api/analytics/today.js';
import { onRequestGet as originalAnalytics } from './fixtures/rust-analytics-today.js';
import { onRequestGet as actualStats } from '../functions/api/stats.js';
import { onRequestGet as originalStats } from './fixtures/rust-stats.js';
import { selectHomeRailIds as actualRails } from '../functions/_shared/home-rails.js';
import { selectHomeRailIds as originalRails } from './fixtures/rust-home-rails.js';
import { hydrateByIds as actualHydrate } from '../functions/_shared/home-rails.js';
import { hydrateByIds as originalHydrate } from './fixtures/rust-home-rails.js';
import { selectAutoHomeLeadId as actualLeadRank } from '../functions/_shared/home-lead-auto.js';
import { selectAutoHomeLeadId as originalLeadRank } from './fixtures/rust-home-lead-auto.js';
import { readHomeLeadMode as actualLeadMode } from '../functions/_shared/home-lead-auto.js';
import { readHomeLeadMode as originalLeadMode } from './fixtures/rust-home-lead-auto.js';

const secret = 'synthetic-rust-posts-only';
const fixtureTime = new Date().toISOString();

function fixture({role = 'anonymous', fail = false, due = false, failHome = false, failHero = false, failAnalytics = false, failFooterToday = false, failFooterTotal = false, failSetting = ''} = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const state = {beforeAll:null,manualQueries:0,allCalls:[]};
  sqlite.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL);
    CREATE TABLE calendar_events(id INTEGER,related_post_id INTEGER);
    CREATE TABLE post_history(post_id INTEGER,action TEXT,summary TEXT,snapshot TEXT,before_snapshot TEXT,after_snapshot TEXT);
    CREATE TABLE post_likes(post_id INTEGER,liked_at TEXT,viewer_key TEXT,UNIQUE(post_id,viewer_key));
    CREATE TABLE post_engagement(post_id INTEGER,engaged_seconds INTEGER,viewer_key TEXT,session_key TEXT,updated_at TEXT,UNIQUE(post_id,session_key));
    CREATE TABLE site_visits(path TEXT,visited_at TEXT DEFAULT CURRENT_TIMESTAMP,viewer_key TEXT,referrer_host TEXT,referrer_url TEXT,utm_source TEXT,utm_medium TEXT,utm_campaign TEXT,visited_bucket TEXT,country_code TEXT,country_name TEXT,city_name TEXT,region_code TEXT,continent_code TEXT,latitude REAL,longitude REAL,UNIQUE(viewer_key,path,visited_bucket));
    CREATE TABLE post_views(post_id INTEGER,viewed_at TEXT DEFAULT CURRENT_TIMESTAMP,viewer_key TEXT,viewed_bucket TEXT,UNIQUE(post_id,viewer_key,viewed_bucket));
    CREATE TABLE posts(id INTEGER PRIMARY KEY,category TEXT,title TEXT,subtitle TEXT,image_url TEXT,image_caption TEXT,image_frame TEXT,created_at TEXT,publish_at TEXT,updated_at TEXT,featured INTEGER,tag TEXT,meta_tags TEXT,special_feature TEXT,views INTEGER,author TEXT,published INTEGER,sort_order INTEGER,youtube_url TEXT,content TEXT,related_posts_manual TEXT,internal_audit_note TEXT,gallery_images TEXT,location_name TEXT,location_address TEXT,manual_related_posts TEXT,author_user_id INTEGER,ai_assisted INTEGER)`);
  const insert = sqlite.prepare(`INSERT INTO posts(id,category,title,subtitle,image_url,image_frame,created_at,publish_at,featured,tag,meta_tags,special_feature,views,author,published,sort_order,content) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const time = fixtureTime;
  for (let i = 1; i <= 38; i++) {
    insert.run(i,['korea','apr','wosm','people'][i % 4],i === 3 ? '스카우트 여정' : 'Synthetic article ' + i,
      i === 5 ? '스카우트 이야기' : '', i === 4 ? 'data:image/png;base64,AAAA' : i === 5 ? 'https://example.invalid/img.png' : null,
      i === 5 ? '{"x":120,"y":-2}' : null, time, i === 37 ? '2999-01-01 00:00:00' : null,
      i % 5 === 0 ? 1 : 0, i % 2 ? 'camp, 한국' : 'scout', i % 3 ? 'common, 교육' : 'other',
      i % 4 ? 'Scout feature' : '', i * 2, i === 3 ? 'loading...' : i === 4 ? 'Editor a' : 'Synthetic author',
      i === 37 || i === 38 ? 0 : 1, i % 6, i === 7 ? '본문 스카우트' : 'content');
  }
  if (due) sqlite.prepare("UPDATE posts SET publish_at='2000-01-01 00:00:00' WHERE id=38").run();
  sqlite.exec("INSERT INTO post_likes(post_id,liked_at) VALUES(1,datetime('now')), (1,datetime('now')), (2,datetime('now','-10 days')); INSERT INTO post_engagement(post_id,engaged_seconds) VALUES(1,10),(1,20); INSERT INTO site_visits(path,visited_at,viewer_key) VALUES('/post/1?source=test',datetime('now'),'viewer-a'),('/post/2',datetime('now','-10 days'),'viewer-b'),('/api/example',datetime('now'),'excluded'),('/admin',datetime('now'),'excluded'); INSERT INTO post_views(post_id,viewed_at) VALUES(1,datetime('now')); INSERT INTO settings VALUES('home_lead_mode','manual'),('home_lead_post','1'); UPDATE posts SET related_posts_manual='[2,37,3]',internal_audit_note='private synthetic' WHERE id=1");
  const user = {id:77,role:'member',status:'active',username:'synthetic',token_min_iat:0,permissions:JSON.stringify({access_admin:true,permissions:role === 'member-list' ? ['view:list'] : role === 'writer' ? ['write:write'] : ['view:calendar']})};
  sqlite.exec('CREATE TABLE admin_users(id INTEGER PRIMARY KEY,status TEXT,deleted_at TEXT,permissions TEXT,token_min_iat INTEGER)');
  sqlite.prepare('INSERT INTO admin_users(id,status,deleted_at,permissions) VALUES(?,?,NULL,?)').run(user.id,user.status,user.permissions);
  const DB = Object.assign(new (class D1Database {})(), {
    prepare(sql) {
      let args = [];
      return {
        sql, get args() { return args; },
        bind(...values) { args=values; return this; },
        async all() {
          state.allCalls.push({sql,args:[...args]});
          if (sql.includes('SELECT id, title, category, created_at, publish_at FROM posts WHERE published = 1 AND id IN')) state.manualQueries++;
          if (state.beforeAll) { const hook=state.beforeAll; state.beforeAll=null; hook(sql); }
          if (fail || (failHome && args[0] === 'korea' && sql.includes('category = ?') && sql.includes('SELECT id, category')) || (failSetting && sql.includes('FROM settings') && sql.includes("'"+failSetting+"'"))) throw new Error('synthetic database failure');
          return {results:sqlite.prepare(sql).all(...args)};
        },
        async first() { if (sql.includes('FROM admin_users')) return user; const footer=sql.includes('COUNT(DISTINCT viewer_key) AS u') && sql.includes('FROM site_visits'); const today=sql.includes("datetime(visited_at, '+9 hours')"); if (fail || (failAnalytics && sql.includes('FROM site_visits')) || (footer && ((failFooterToday && today) || (failFooterTotal && !today))) || (failSetting && sql.includes('FROM settings') && (args[0] === failSetting || sql.includes("key = '" + failSetting + "'"))) || (failHero && args[0] === 1 && sql.includes('SELECT id, category, title, subtitle, image_url'))) throw new Error('synthetic database failure'); return sqlite.prepare(sql).get(...args) || null; },
        async run() { if (fail) throw new Error('synthetic database failure'); const r=sqlite.prepare(sql).run(...args); return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}; },
      };
    },
    async batch(statements) {
      if (fail) throw new Error('synthetic database failure');
      sqlite.exec('BEGIN');
      try {
        const results=statements.map(stmt=>{const r=sqlite.prepare(stmt.sql).run(...stmt.args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};});
        sqlite.exec('COMMIT');return results;
      } catch (error) {sqlite.exec('ROLLBACK');throw error;}
    },
  });
  return { sqlite, env:{DB,ADMIN_SECRET:secret}, role, state };
}

async function invoke(handler, f, suffix, path = '/api/posts') {
  const headers = {};
  if (f.role !== 'anonymous') {
    const data = f.role === 'owner' ? {role:'full'} : {role:'member',uid:77};
    headers.Cookie = 'admin_token=' + await createToken(secret,data);
  }
  const response = await handler({request:new Request('https://synthetic.invalid'+path+suffix,{headers}),env:f.env});
  return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
}

test('Rust article text validation preserves types, trimming and UTF-16 limits', async () => {
  const {validatePostText,requireNonEmptyString,optionalTrimmedString}=await import('../functions/_shared/post-input.js');
  const f=fixture();
  try {
    for (const titleRequired of [false,true]) for(const value of [undefined,null,0,false,{},'', '  ', '  정상 😀  ', '가'.repeat(199)+'😀', '제목\ud800']) {
      const body={title:value,subtitle:value,tag:value,meta_tags:value,author:value};
      const result=await validatePostText(f.env,body,titleRequired);
      const expected={
        title:titleRequired || value!==undefined ? requireNonEmptyString(value,'제목',200) : {ok:true,provided:false},
        subtitle:optionalTrimmedString(value,'부제',300),tag:optionalTrimmedString(value,'태그',200),
        meta_tags:optionalTrimmedString(value,'메타 태그',500),author:optionalTrimmedString(value,'작성자',60),
      };
      for(const key of Object.keys(expected)) {
        assert.equal(result[key].ok,expected[key].ok,`${key} ${String(value)}`);
        assert.equal(result[key].value,expected[key].value,`${key} ${String(value)}`);
        assert.equal(result[key].error,expected[key].error,`${key} ${String(value)}`);
        if(expected[key].provided !== undefined) assert.equal(result[key].provided,expected[key].provided);
      }
    }
  } finally {f.sqlite.close();}
});

test('article content validation preserves legacy result and safe large-input fallback', async () => {
  const {validatePostText,requireNonEmptyString}=await import('../functions/_shared/post-input.js');
  const f=fixture();
  try {
    const missing={kind:'missing'};
    const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-text-validate',{title_required:false,title:missing,subtitle:missing,tag:missing,meta_tags:missing,author:missing,published:missing,featured:missing,ai_assisted:missing,sort_order:missing,content:{kind:'text',value:'  본문 😀  '}});
    assert.deepEqual((await direct.json()).content,{ok:true,provided:true,value:'본문 😀'});
    for(const value of [undefined,null,0,false,{},'', '  ', '  본문 😀  ', '본문\ud800', '가'.repeat(16385)]) {
      const result=await validatePostText(f.env,{content:value},false);
      assert.deepEqual(result.content,requireNonEmptyString(value,'내용'),String(value).slice(0,30));
    }
    assert.equal((await validatePostText(f.env,{},false)).content.provided,false);
  } finally {f.sqlite.close();}
});

test('AI score JSON extraction preserves code fence priority and failure fallback', async () => {
  const {extractScoreJson}=await import('../functions/api/admin/score-article.js');
  const f=fixture();
  try {
    for(const raw of ['plain text','{}','앞 {"a":1} 뒤 {"b":2}','```json\n{"score":90}\n```','```\n{"score":0}\n```','```json\n```','```JSON\n{"x":1}\n```','응답 😀 {"값":"이모지"}','```json\n{"x":1}\n``` 뒤 ```json\n{"x":2}\n```','{"title":"\ud800"}','x'.repeat(131073)]) {
      const direct=await extractScoreJson(raw,f.env);
      const fallback=await extractScoreJson(raw,f.env,async()=>new Response('',{status:503}));
      assert.equal(direct,fallback,raw.slice(0,50));
    }
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'ai-score-extract',{raw:'결과 ```json\n{"score":95}\n```'});
    assert.equal((await response.json()).extracted,'{"score":95}\n');
  } finally {f.sqlite.close();}
});

test('AI score prompt preserves rubric, article, interpolation markers and legacy fallback', async () => {
  const {buildScorePrompt}=await import('../functions/api/admin/score-article.js');
  const f=fixture();
  try {
    for(const values of [
      ['기준 A','제목','부제','본문','태그'],['기준 😀','',null,'본문\n두 줄',''],
      ['기준 ${title || \'(없음)\'}','제목 ${rubric}','부제','본문 ${tags || \'(없음)\'}','태그'],
      ['기준','제목\ud800','','본문',''],['기준','긴 제목'.repeat(30000),'','본문',''],
    ]) {
      const direct=await buildScorePrompt(...values,f.env);
      const fallback=await buildScorePrompt(...values,f.env,async()=>new Response('',{status:503}));
      assert.equal(direct,fallback);
    }
    const values=['합성 기준','합성 제목','합성 부제','합성 본문','합성 태그'];
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'ai-score-prompt',{values});
    assert.equal((await response.json()).prompt,await buildScorePrompt(...values,f.env,async()=>new Response('',{status:503})));
  } finally {f.sqlite.close();}
});

test('article special feature normalization preserves legacy whitespace and UTF-16 boundaries', async () => {
  const {validatePostText}=await import('../functions/_shared/post-input.js');
  const {sanitizeSpecialFeature}=await import('../functions/_shared/special-features.js');
  const f=fixture();
  try {
    const missing={kind:'missing'};
    const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-text-validate',{title_required:false,title:missing,subtitle:missing,tag:missing,meta_tags:missing,author:missing,published:missing,featured:missing,ai_assisted:missing,sort_order:missing,special_feature:{kind:'text',value:'  특집\t 소식  '}});
    assert.equal(String.fromCharCode(...(await direct.json()).special_feature.units),'특집 소식');
    for(const value of [undefined,null,0,1,false,{},['가','나'],'',' \t\n ','  특집\u00a0  😀 ', '가'.repeat(119)+'😀','이름\ud800', '가'.repeat(16385)]) {
      assert.equal((await validatePostText(f.env,{special_feature:value},false)).special_feature,sanitizeSpecialFeature(value),String(value).slice(0,30));
    }
  } finally {f.sqlite.close();}
});

test('article image caption and location trimming preserve legacy values and boundaries', async () => {
  const {validatePostText}=await import('../functions/_shared/post-input.js');
  const f=fixture();
  try {
    const missing={kind:'missing'};
    const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-text-validate',{title_required:false,title:missing,subtitle:missing,tag:missing,meta_tags:missing,author:missing,published:missing,featured:missing,ai_assisted:missing,sort_order:missing,image_caption:{kind:'text',value:'  사진  '},location_name:{kind:'text',value:'  서울  '},location_address:missing});
    const raw=await direct.json();
    assert.equal(String.fromCharCode(...raw.image_caption.units),'사진');
    assert.equal(String.fromCharCode(...raw.location_name.units),'서울');
    assert.equal(raw.location_address.value,null);
    for(const value of [undefined,null,0,false,{},'', '  ', '  사진 <b>😀</b>  ','가'.repeat(119)+'😀', '나'.repeat(299)+'😀','문자\ud800','가'.repeat(16385)]) {
      const result=await validatePostText(f.env,{image_caption:value,location_name:value,location_address:value},false);
      for(const [key,max] of [['image_caption',300],['location_name',120],['location_address',300]]) {
        const expected=typeof value==='string' ? (value.trim().slice(0,max) || null) : null;
        assert.equal(result[key],expected,`${key} ${String(value).slice(0,25)}`);
      }
    }
  } finally {f.sqlite.close();}
});

test('article YouTube validation preserves supported hosts and rejects deceptive URLs', async () => {
  const {validatePostText}=await import('../functions/_shared/post-input.js');
  const {sanitizeYouTubeUrl}=await import('../functions/_shared/youtube.js');
  const f=fixture();
  try {
    const missing={kind:'missing'};
    const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-text-validate',{title_required:false,title:missing,subtitle:missing,tag:missing,meta_tags:missing,author:missing,published:missing,featured:missing,ai_assisted:missing,sort_order:missing,youtube_url:{kind:'text',value:'https://youtu.be/abcdefghijk?t=1'}});
    assert.equal((await direct.json()).youtube_url,'https://www.youtube.com/watch?v=abcdefghijk');
    for(const value of [undefined,null,0,{},'', ' https://youtu.be/abcdefghijk?t=5 ', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://m.youtube.com/shorts/abcdefghijk/more','https://youtube-nocookie.com/embed/abcdefghijk', 'https://youtube.com.evil.invalid/watch?v=abcdefghijk','https://youtube.com@evil.invalid/watch?v=abcdefghijk','javascript:alert(1)','https://youtu.be/abcdefghij', 'https://youtu.be/abcdefghijk\ud800', 'x'.repeat(16385)]) {
      assert.equal((await validatePostText(f.env,{youtube_url:value},false)).youtube_url,sanitizeYouTubeUrl(value),String(value).slice(0,70));
    }
  } finally {f.sqlite.close();}
});

test('article flag and sort validation preserves legacy input conversion', async () => {
  const {validatePostText,optionalBooleanFlag,optionalIntegerOrNull}=await import('../functions/_shared/post-input.js');
  const f=fixture();
  try {
    const missing={kind:'missing'};
    const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-text-validate',{title_required:false,title:missing,subtitle:missing,tag:missing,meta_tags:missing,author:missing,published:{kind:'text',value:' On '},featured:{kind:'boolean',boolean:false},ai_assisted:{kind:'number',number:-1,zero:false},sort_order:{kind:'text',value:'12suffix'}});
    assert.equal(direct.status,200);
    const raw=await direct.json();
    assert.equal(raw.published.value,1); assert.equal(raw.featured.value,0); assert.equal(raw.ai_assisted.value,1); assert.equal(raw.sort_order.value,12);
    for(const value of [undefined,null,'', ' ', ' On ', 'off', 'yes', 'maybe', '12suffix', '0x10', true,false,0,-1,1.5,NaN,Infinity,{},'\ud800']) {
      const result=await validatePostText(f.env,{published:value,featured:value,ai_assisted:value,sort_order:value},false);
      for(const key of ['published','featured','ai_assisted']) assert.deepEqual(JSON.parse(JSON.stringify(result[key])),JSON.parse(JSON.stringify(optionalBooleanFlag(value))),`${key}: ${String(value)}`);
      assert.deepEqual(JSON.parse(JSON.stringify(result.sort_order)),JSON.parse(JSON.stringify(optionalIntegerOrNull(value,'정렬 순서'))),`sort_order: ${String(value)}`);
    }
  } finally {f.sqlite.close();}
});

test('article publish date validation preserves original timezone and fallback rules', async () => {
  const {validatePostText,normalizePublishAtInput}=await import('../functions/_shared/post-input.js');
  const f=fixture();
  try {
    const cases=[
      ['2026-10-29',''],['2026-99-99',''],['2026-10-29T12:34',''],['2026-10-29 12:34',''],
      ['2026-10-29T12:34:56',''],['2026-10-29T00:30:00Z',''],['2026-10-29T09:30:00+09:00',''],
      ['2026-10-29T23:59:59.500Z',''],['  invalid ',' 2026-11-01 '],[null,'2026-02-30'],
      ['invalid','invalid'],[42,'2027-01-01'],['+275760-09-13T00:00:00.000Z',''],['2026-01-01\ud800','2027-01-01'],
    ];
    for(const [publish_at,publish_date] of cases) {
      const result=await validatePostText(f.env,{publish_at,publish_date},false);
      let expected,throws=false;
      try {expected=normalizePublishAtInput(publish_at,publish_date);} catch {throws=true;}
      if(throws) assert.equal(result.publish_at,null,String(publish_at));
      else assert.equal(result.publish_at,expected,`${String(publish_at)} ${String(publish_date)}`);
    }
  } finally {f.sqlite.close();}
});

test('Rust article list matches legacy results across public and admin query contracts', async () => {
  const scenarios = [
    ['', 'anonymous'], ['?category=korea','anonymous'], ['?category=worm','anonymous'], ['?category=invalid','anonymous'],
    ['?page=2&limit=7','anonymous'], ['?page=garbage&limit=NaN','anonymous'], ['?page=100001&limit=200','anonymous'],
    ['?page=12suffix&limit=2.9','anonymous'], ['?page=-3&limit=0','anonymous'], ['?page=%2B002&limit=%20003','anonymous'], ['?page=1e999&limit=99999999999999999999999999999','anonymous'],
    ['?q='+encodeURIComponent('가'.repeat(199)+'😀')+'&sort=relevance','anonymous'], ['?special_feature='+encodeURIComponent('가'.repeat(119)+'😀'),'anonymous'],
    ['?q=스카우트&sort=relevance','anonymous'], ['?q=Scout&sort=latest','anonymous'], ['?q=%25%27%20OR%201=1','anonymous'],
    ['?q=%20S%20c%20o%20u%20t%20&sort=relevance','anonymous'], ['?q=%EF%BB%BF%ED%95%9C%EA%B5%AD%20%20%EC%8A%A4%EC%B9%B4%EC%9A%B0%ED%8A%B8','anonymous'], ['?q=%20%20','anonymous'], ['?q=%F0%9F%98%80','anonymous'],
    ['?tag=교육','anonymous'], ['?start_date=2020-01-01&end_date=2999-01-01','anonymous'], ['?days=1','anonymous'],
    ['?sort=popular','anonymous'], ['?sort=popular&period=24h','anonymous'], ['?sort=popular&period=7d','anonymous'],
    ['?sort=popular&period=invalid','anonymous'], ['?sort=oldest','anonymous'], ['?sort=views','anonymous'],
    ['?sort=%20PoPuLaR%20&period=%201d%20','anonymous'], ['?sort=relevance','anonymous'], ['?q=Scout&sort=%20ReLeVaNcE%20','anonymous'], ['?start_date=%202020-01-01%20&end_date=broken','anonymous'], ['?start_date=2020-13-99','anonymous'],
    ['?category=apr&sort=manual','anonymous'], ['?special_feature=Scout%20%20feature','anonymous'], ['?featured=1','anonymous'], ['?featured=1&q=Scout','anonymous'],
    ['?days=2suffix','anonymous'], ['?days=bad','anonymous'], ['?days=-1','anonymous'], ['?days=999999999999999999999999','anonymous'], ['?special_feature=%20Scout%09feature%20','anonymous'], ['?special_feature=%F0%9F%98%80','anonymous'], ['?featured=true&all=true','anonymous'],
    ['?scope=admin&published=0','anonymous'], ['?scope=admin&published=0','member-list'], ['?scope=admin','member-other'],
    ['?scope=admin&published=0','owner'], ['?scope=admin&all=1','owner'], ['?scope=admin&order_by=title&order_dir=asc','owner'],
    ['?scope=admin&published=draft&order_by=%20TITLE%20&order_dir=%20ASC%20','owner'], ['?scope=admin&published=TRUE','owner'],
    ['?scope=admin&order_by=date&order_dir=desc','owner'], ['?scope=admin&order_by=views&order_dir=asc','owner'],
    ['?scope=admin&order_by=category','owner'], ['?scope=admin&order_by=upload&order_dir=asc','owner'],
    ['?scope=admin&all=1&q=Synthetic&sort=relevance','owner'],
  ];
  for (const [suffix,role] of scenarios) {
    const legacy=fixture({role}), rust=fixture({role});
    try {
      const before = await invoke(original,legacy,suffix);
      const after = await invoke(actual,rust,suffix);
      assert.deepEqual(after,before,`${role} ${suffix}`);
      if (role !== 'owner' && after.status === 200) assert(!after.body.posts.some(row => row.published === 0));
    } finally {legacy.sqlite.close(); rust.sqlite.close();}
  }
});

test('article search sends legacy UTF-16 code units to D1 for emoji boundaries', async () => {
  for (const suffix of [
    '?q='+encodeURIComponent('😀')+'&sort=relevance',
    '?q='+encodeURIComponent('가'.repeat(199)+'😀')+'&sort=relevance',
    '?special_feature='+encodeURIComponent('가'.repeat(119)+'😀'),
  ]) {
    const legacy=fixture(), current=fixture();
    try {
      const before=await invoke(original,legacy,suffix), after=await invoke(actual,current,suffix);
      assert.equal(before.status,200); assert.deepEqual(after,before);
      const find=f=>f.state.allCalls.find(call=>call.sql.includes('AS search_score') && call.sql.includes('FROM posts WHERE'));
      const oldCall=find(legacy),newCall=find(current);
      assert(oldCall && newCall,suffix);
      assert.deepEqual(newCall.args,oldCall.args,suffix);
    } finally {legacy.sqlite.close();current.sqlite.close();}
  }
});

test('Rust article list preserves public author and image output while keeping admin author', async () => {
  for (const role of ['anonymous','owner']) for (const [author,image,frame] of [
    [' loading… ','data:image/png;base64,AA==','{"x":12.5,"y":120}'],
    [' Editor a ','https://example.invalid/image','{broken'],
    [null,'/relative.jpg',null],
    ['홍길동','http://example.invalid/image','{"x":0,"y":99}'],
    ['합성','https://example.invalid/image','{"x":1e999,"y":-1}'],
    ['합성','https://example.invalid/image','\ufeff{"x":21,"y":78}\ufeff'],
  ]) {
    const before=fixture({role}), after=fixture({role});
    try {
      for (const f of [before,after]) f.sqlite.prepare('UPDATE posts SET author=?,image_url=?,image_frame=? WHERE id=1').run(author,image,frame);
      const suffix=role==='owner'?'?scope=admin&all=1':'?limit=100';
      assert.deepEqual(await invoke(actual,after,suffix),await invoke(original,before,suffix),`${role} ${author}`);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust public post serializer only emits permitted fields', async () => {
  const f=fixture();
  try {
    const source={id:1,title:'기사',author:'Editor a',image_url:'data:image/png;base64,AA==',image_frame:'{"x":-4,"y":32.5}',content:'본문',related_posts:[{id:2}],internal_audit_note:'private',author_user_id:77,published:1};
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-public-serialize',{post:source,origin:'https://synthetic.invalid'});
    const {post}=await response.json();
    assert.equal(post.author,'Editor.A');
    assert.equal(post.image_url,'https://synthetic.invalid/api/posts/1/image');
    assert.deepEqual(post.image_frame,{x:0,y:33});
    assert.deepEqual(post.related_posts,[{id:2}]);
    for (const field of ['internal_audit_note','author_user_id','published']) assert.equal(Object.hasOwn(post,field),false);
  } finally {f.sqlite.close();}
});

test('article detail shares one manual related query per request', async () => {
  const f=fixture();
  try {
    const response=await actualDetail({params:{id:'1'},request:new Request('https://synthetic.invalid/api/posts/1',{headers:{'User-Agent':'Googlebot'}}),env:f.env});
    assert.equal(response.status,200);
    const {post}=await response.json();
    assert.deepEqual(post.manual_related_posts.map(item=>item.id),[2,3]);
    assert.equal(f.state.manualQueries,1);
    const again=await actualDetail({params:{id:'1'},request:new Request('https://synthetic.invalid/api/posts/1',{headers:{'User-Agent':'Googlebot'}}),env:f.env});
    assert.equal(again.status,200);
    assert.equal(f.state.manualQueries,2,'separate requests do not reuse stale data');
  } finally {f.sqlite.close();}
});

test('article SSR shares one manual related query per request', async (t) => {
  t.mock.method(globalThis,'fetch',async () => new Response('Synthetic status page',{status:200}));
  const f=fixture();
  try {
    const response=await actualArticlePage({params:{id:'1'},request:new Request('https://synthetic.invalid/post/1',{headers:{'User-Agent':'Googlebot'}}),env:f.env});
    assert.equal(response.status,200);
    assert.equal(f.state.manualQueries,1);
  } finally {f.sqlite.close();}
});

test('Rust detail retrieval preserves visibility, author privacy, views and related articles', async () => {
  const scenarios = [
    ['1','anonymous',''], ['1','owner',''], ['1','member-list',''],
    ['37','anonymous',''], ['37','owner',''], ['999','anonymous',''],
    ['0','anonymous',''], ['1abc','anonymous',''], ['1','anonymous','human'], ['1','anonymous','bot'],
  ];
  for (const [id,role,viewer] of scenarios) {
    const legacy=fixture({role}), rust=fixture({role});
    try {
      const responses=[];
      for (const [handler,f] of [[originalDetail,legacy],[actualDetail,rust]]) {
        const headers={};
        if (role !== 'anonymous') headers.Cookie='admin_token='+await createToken(secret,role === 'owner' ? {role:'full'} : {role:'member',uid:77});
        if (viewer) {
          headers['CF-Connecting-IP']='192.0.2.7';
          headers['User-Agent']=viewer === 'bot' ? 'Googlebot' : 'Mozilla/5.0';
          const key=await getViewerKey(new Request('https://synthetic.invalid/',{headers}),f.env);
          f.sqlite.prepare('INSERT INTO post_likes(post_id,viewer_key,liked_at) VALUES(1,?,datetime(\'now\'))').run(key);
        }
        const response=await handler({params:{id},request:new Request('https://synthetic.invalid/api/posts/'+id,{headers}),env:f.env});
        responses.push({status:response.status,cache:response.headers.get('cache-control'),body:await response.json(),views:f.sqlite.prepare('SELECT views FROM posts WHERE id=1').get().views});
      }
      assert.deepEqual(responses[1],responses[0],`${role} ${id} ${viewer}`);
      if (responses[1].status === 200 && role !== 'owner') assert.equal(Object.hasOwn(responses[1].body.post,'internal_audit_note'),false);
      if (id === '1' && viewer) {
        assert.equal(responses[1].body.post.liked,true);
        assert.equal(responses[1].views,viewer === 'human' ? 3 : 2);
        assert(!responses[1].body.post.related_posts.some(post=>post.id===37));
      }
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust-backed public navigation reads settings and keeps default fallback', async () => {
  for (const scenario of ['missing','valid','malformed','failure']) {
    const f=fixture({fail:scenario==='failure'});
    try {
      if (scenario==='valid') f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('nav_labels', JSON.stringify({'nav.home':{ko:'  홈 & 소식 ',en:'Home'},'nav.korea':{ko:'한국'}}));
      if (scenario==='malformed') f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('nav_labels','{broken');
      const expected = scenario==='valid' ? normalizeNavLabels(JSON.parse(f.sqlite.prepare("SELECT value FROM settings WHERE key='nav_labels'").get().value)) : normalizeNavLabels({});
      assert.deepEqual(await loadNavLabels(f.env), expected, scenario);
    } finally {f.sqlite.close();}
  }
});

test('Rust-backed site metadata preserves public values and default fallback', async () => {
  for (const scenario of ['missing','valid','malformed','failure']) {
    const f=fixture({fail:scenario==='failure'});
    try {
      const input={pages:{home:{title:'합성 사이트',description:'합성 소개'}},footer:{title:'합성 발행자'},image_url:'https://example.invalid/cover.jpg'};
      if (scenario==='valid') f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('site_meta', JSON.stringify(input));
      if (scenario==='malformed') f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('site_meta','{broken');
      assert.deepEqual(await loadSiteMeta(f.env), normalizeSiteMeta(scenario==='valid'?input:null), scenario);
    } finally {f.sqlite.close();}
  }
});

test('Rust home sections match legacy output, hero settings and section fallback', async () => {
  for (const options of [{},{failHome:true},{failAnalytics:true},{failFooterToday:true},{failFooterTotal:true},{failSetting:'ticker'},{failSetting:'hero_media'},{customSettings:true},{hero:[1,37]},{hero:[1,1]},{hero:[1,37],heroAfter:true,heroImage:'data:image/png;base64,AA=='},{hero:[1,37],heroImage:'invalid image'},{hero:[1,37],failHero:true},{lead:37},{leadValue:"0",leadMode:"auto"},{leadValue:"invalid",leadMode:"auto"},{leadValue:"0",leadMode:"manual"},{leadValue:"1trailing",leadMode:"auto"},{leadValue:"-1",leadMode:"auto"}]) {
    const legacy=fixture(options), rust=fixture(options);
    try {
      for (const f of [legacy,rust]) {
        if (options.hero) {
          f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero',JSON.stringify({manual_post_ids:options.hero,manual_position:options.heroAfter?'after_auto':'before_auto'}));
          f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_media',JSON.stringify({'1':{fit:'contain',position_x:14,position_y:80,zoom:130}}));
          f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_interval','4000');
          if (options.heroImage) f.sqlite.prepare('UPDATE posts SET image_url=? WHERE id=1').run(options.heroImage);
        }
        if (options.lead) f.sqlite.prepare("UPDATE settings SET value=? WHERE key='home_lead_post'").run(String(options.lead));
        if (options.leadValue !== undefined) {
          f.sqlite.prepare("UPDATE settings SET value=? WHERE key='home_lead_post'").run(options.leadValue);
          f.sqlite.prepare("UPDATE settings SET value=? WHERE key='home_lead_mode'").run(options.leadMode);
        }
        if (options.customSettings) {
          f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('ticker',JSON.stringify(['Synthetic ticker']));
          f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('translations',JSON.stringify({strings:{'nav.home':{ko:'excluded'},'home.title':{ko:'synthetic'}}}));
        }
      }
      const before=await invoke(originalHome,legacy,'','/api/home');
      const after=await invoke(actualHome,rust,'','/api/home');
      assert.deepEqual(after,before,JSON.stringify(options));
      assert.equal(after.status,200);
      assert.equal(after.body.latest.posts.length,4);
      if (options.failHome) {
        assert.equal(after.body.issues.korea,true);
        assert.deepEqual(after.body.columns.korea.posts,[]);
        assert.equal(after.body.columns.apr.posts.length,4);
      } else assert.equal(after.body.columns.korea.posts.length,4);
      if (options.failHero) assert.equal(after.body.issues.hero,true);
      else if (options.hero) {
        const manual=after.body.hero.posts.find(post=>post.id===1);
        assert.equal(manual.media.fit,'contain');
        if (options.heroAfter) assert.notEqual(after.body.hero.posts[0].id,1);
        else assert.equal(after.body.hero.posts[0].id,1);
        assert.equal(after.body.hero.interval_ms,4000);
        assert(!after.body.hero.posts.some(post=>post.id===37));
      }
      if (options.lead) assert.equal(after.body.lead.post,null);
      if (options.failAnalytics) assert.equal(after.body.analytics.total_unique,0);
      else { assert.equal(after.body.analytics.total_unique,options.failFooterTotal?0:2); assert.equal(after.body.analytics.today_unique,options.failFooterToday?0:1); }
      if (options.failSetting === 'ticker') assert.equal(after.body.issues.ticker,true);
      if (options.failSetting === 'hero_media') assert.equal(after.body.issues.hero,true);
      if (options.customSettings) assert.deepEqual(after.body.ticker.items,['Synthetic ticker']);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust home footer keeps API partial results and rejects partial SSR results', async () => {
  for (const options of [{},{failFooterToday:true},{failFooterTotal:true},{failAnalytics:true}]) {
    const f=fixture(options);
    try {
      const context={env:f.env,request:{url:'https://synthetic.invalid/'}};
      const api=await queryRust(context,'home-footer-analytics',{});
      assert.equal(api.status,200);
      const value=await api.json();
      assert.equal(value.today_unique,options.failFooterToday || options.failAnalytics ? 0 : 1);
      assert.equal(value.total_unique,options.failFooterTotal || options.failAnalytics ? 0 : 2);
      const ssr=await queryRust(context,'home-footer-analytics',{strict:true});
      assert.equal(ssr.status,options.failFooterToday || options.failFooterTotal || options.failAnalytics ? 500 : 200);
      if (ssr.ok) assert.deepEqual((await ssr.json()).ssr_footer,{totalVisitors:'2',totalViews:'2',todayVisitors:'1'});
    } finally {f.sqlite.close();}
  }
  const f=fixture();
  try {
    f.sqlite.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1234) INSERT INTO site_visits(path,visited_at,viewer_key) SELECT '/synthetic',datetime('now'),'synthetic-'||x FROM n");
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'home-footer-analytics',{strict:true});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).ssr_footer,{totalVisitors:'1,236',totalViews:'1,236',todayVisitors:'1,235'});
  } finally {f.sqlite.close();}
});

test('Rust home response preserves the payload and safely falls back for failures and UTF-16', async () => {
  const data={siteMeta:{title:'합성'},navLabels:{},translations:{},ticker:[],stats:{today:0},footerAnalytics:{total_unique:0},hero:{posts:[]},lead:{post:null},latest:[{title:'기사'}],popular:[],picks:[],banners:[],korea:[],apr:[],wosm:[],people:[],issues:{latest:true}};
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  const expected=await assembleHomeResponse(context,data);
  assert.deepEqual(expected.latest.posts,data.latest);
  assert.deepEqual(expected.issues,{latest:true});
  for(const fail of [async()=>new Response('',{status:500}),async()=>{throw new Error('synthetic failure');},async()=>Response.json({})]) assert.deepEqual(await assembleHomeResponse(context,data,fail),expected);
  let called=false;
  const unusual={...data,latest:[{title:'\ud83d'}]};
  const result=await assembleHomeResponse(context,unusual,async()=>{called=true;throw new Error('should use compatibility path');});
  assert.equal(called,false);
  assert.equal(result.latest.posts[0].title.charCodeAt(0),0xd83d);
});

test('home card excerpts match legacy editor, HTML and surrogate boundary behavior', async () => {
  for (const [content,subtitle] of [
    ['<style>x</style><script>alert(1)</script><p>문장&nbsp;&amp; &lt;태그&gt;</p>',''],
    [JSON.stringify({blocks:[{data:{text:'첫째 <b>둘째</b>'}},{data:{items:['셋',{content:'object'},null]}},{data:{text:''}}]}),''],
    ['{broken "blocks" <b>문장</b>',''],
    ['', '  부제 & 설명  '],
    ['가'.repeat(418)+'😀끝',''],
    ['가'.repeat(425),''],
  ]) {
    const legacy=fixture(),rust=fixture();
    try {
      for (const f of [legacy,rust]) f.sqlite.prepare('UPDATE posts SET content=?,subtitle=? WHERE published=1').run(content,subtitle);
      const before=await invoke(originalHome,legacy,'','/api/home');
      const after=await invoke(actualHome,rust,'','/api/home');
      assert.deepEqual(after,before,JSON.stringify([content,subtitle]));
      assert(!Object.hasOwn(after.body.lead.post,'content'));
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('home card image URLs and framing match legacy output', async () => {
  for (const [url,frame] of [
    ['https://example.invalid/image.jpg','{"x":10.5,"y":101}'],
    ['data:image/png;base64,AA==','{"x":null,"y":"12.5"}'],
    ['/relative.jpg','{"x":"bad","y":-20}'],
    [null,'{broken'],
    ['http://example.invalid/image.png','{"x":true}'],
    ['https://example.invalid/image.png','{"x":1e999,"y":-1}'],
    ['https://example.invalid/image.png','\ufeff{"x":21,"y":78}\ufeff'],
    ['https://example.invalid/image.png','{"x":-0.5,"y":0}'],
  ]) {
    const legacy=fixture(), rust=fixture();
    try {
      for (const f of [legacy,rust]) f.sqlite.prepare('UPDATE posts SET image_url=?, image_frame=? WHERE published=1').run(url,frame);
      const before=await invoke(originalHome,legacy,'','/api/home');
      const after=await invoke(actualHome,rust,'','/api/home');
      assert.deepEqual(after,before,JSON.stringify([url,frame]));
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('public schema queries preserve visibility, ordering, date filter and glossary data', async () => {
  const f=fixture();
  try {
    f.sqlite.exec("CREATE TABLE glossary_terms(id INTEGER,bucket TEXT,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER); INSERT INTO glossary_terms VALUES(1,'나','나무','Tree','','설명',1),(2,'가','가족','Family','','<script>합성</script>',0)");
    f.sqlite.prepare("UPDATE posts SET created_at='2000-01-01 00:00:00' WHERE id=1").run();
    for (const key of ['home','latest','korea','apr','wosm','people','glossary','glossary-schema']) {
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'public-schema',{key});
      assert.equal(response.status,200,key);
      const {results}=await response.json();
      const category=['korea','apr','wosm','people','glossary'].includes(key);
      const query=key==='glossary-schema' ? 'SELECT id,bucket,term_ko,term_en,term_fr,description_ko FROM glossary_terms ORDER BY bucket,COALESCE(sort_order,0),term_ko' : `SELECT id,title FROM posts WHERE published=1 ${category?'AND category = ?':key==='latest'?"AND datetime(COALESCE(publish_at,created_at)) >= datetime('now','-30 days')":''} ORDER BY datetime(COALESCE(publish_at,created_at)) DESC,id DESC LIMIT 10`;
      const expected=category?f.sqlite.prepare(query).all(key):f.sqlite.prepare(query).all();
      assert.deepEqual(results,JSON.parse(JSON.stringify(expected)),key);
    }
    const invalid=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'public-schema',{key:'private'});
    assert.equal(invalid.status,500);
  } finally {f.sqlite.close();}
});

test('Rust glossary JSON-LD preserves names, ordering, description and script safety', async () => {
  const f=fixture();
  try {
    f.sqlite.exec("CREATE TABLE glossary_terms(id INTEGER,bucket TEXT,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER); INSERT INTO glossary_terms VALUES(1,'나',' 나무 ','Tree','Arbre','</script><script>합성</script>',1),(2,'가','',' Family ','',' 설명 ',0)");
    const request=()=>queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'public-schema',{key:'glossary-schema',origin:'https://synthetic.invalid'});
    const data=await (await request()).json();
    assert(!data.html.includes('</script><script>합성</script>'));
    assert(data.html.includes(String.raw`\u003c/script\u003e`));
    const payload=JSON.parse(data.html.match(/<script[^>]*>([\s\S]*)<\/script>/)[1]);
    assert.equal(payload['@type'],'DefinedTermSet');
    assert.equal(payload.url,'https://synthetic.invalid/glossary');
    assert.deepEqual(payload.inLanguage,['ko-KR','en','fr']);
    assert.deepEqual(payload.hasDefinedTerm.map(t=>({id:t['@id'],name:t.name,alternate:t.alternateName,description:t.description,code:t.termCode})),[
      {id:'https://synthetic.invalid/glossary#term-2',name:'Family',alternate:undefined,description:'설명',code:'가'},
      {id:'https://synthetic.invalid/glossary#term-1',name:'나무',alternate:['Tree','Arbre'],description:'</script><script>합성</script>',code:'나'},
    ]);
    f.sqlite.exec('DELETE FROM glossary_terms');
    assert.equal((await (await request()).json()).html,'');
  } finally {f.sqlite.close();}
});

test('WOSM dataset preserves array/object counts and missing, malformed or unavailable settings', async () => {
  for (const [scenario,raw,count] of [['missing',null,0],['array','[1,2]',2],['object','{"items":[1,2,3]}',3],['empty','{"items":[]}',0],['malformed','{broken',0],['failure',null,0]]) {
    const f=fixture({fail:scenario==='failure'});
    try {
      if (raw!==null) f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('wosm_members',raw);
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'public-schema',{key:'wosm-schema',origin:'https://synthetic.invalid'});
      assert.equal(response.status,200,scenario);
      const {html}=await response.json();
      const data=JSON.parse(html.match(/<script[^>]*>([\s\S]*)<\/script>/)[1]);
      assert.equal(data['@type'],'Dataset');
      assert.equal(data.url,'https://synthetic.invalid/wosm-members');
      assert.equal(data.license,'https://synthetic.invalid/editorial-policy');
      assert.deepEqual(data.inLanguage,['ko-KR','en']);
      assert.deepEqual(data.variableMeasured[0],count?{'@type':'PropertyValue',name:'등록 연맹 수',value:count}:{'@type':'PropertyValue',name:'등록 연맹 수'});
      assert.equal(data.variableMeasured.length,7);
    } finally {f.sqlite.close();}
  }
});

test('feature collections match legacy slugs, visibility, ordering and limits', async () => {
  for (const [category,slug,opts] of [['korea','cafe',{}],['korea','cafe',{limit:1}],['korea','cafe',{limit:0}],['korea','cafe',{limit:-1}],['korea','cafe',{limit:1.5}],['korea','cafe',{limit:'bad'}],['korea','cafe',{limit:Infinity}],['apr','feature',{}],['korea','unknown',{}],['','cafe',{}]]) {
    const before=fixture(),after=fixture();
    try {
      for (const f of [before,after]) {
        f.sqlite.exec("UPDATE posts SET special_feature='Café & 한국',category='korea' WHERE id IN (1,2,37); UPDATE posts SET special_feature='😀',category='apr' WHERE id=3");
      }
      const old=await originalCollection(before.env,category,slug,opts);
      const current=await actualCollection(after.env,category,slug,opts);
      assert.deepEqual(current,JSON.parse(JSON.stringify(old)),JSON.stringify([category,slug,opts]));
      if (current) assert(current.items.every(item=>item.id!==37));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('publish switch preserves missing, casing, owner bypass and read-failure behavior', async () => {
  const f=fixture();
  try {
    assert.equal(await isPublishKillSwitchOn(f.env),null);
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('publish_kill_switch','ON');
    assert.equal(await isPublishKillSwitchOn(f.env),true);
    assert.equal((await requirePublishAllowed(f.env,{isOwner:false})).error.status,403);
    assert.equal((await requirePublishAllowed(f.env,{isOwner:true})).error,null);
    f.sqlite.prepare('UPDATE settings SET value=? WHERE key=?').run(' on ','publish_kill_switch');
    assert.equal(await isPublishKillSwitchOn(f.env),false);
    const prepare=f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('SELECT value FROM settings WHERE key = ?')) stmt.first=async()=>{throw new Error('synthetic switch read failure');};return stmt;};
    assert.equal(await isPublishKillSwitchOn(f.env),false);
    assert.equal((await requirePublishAllowed(f.env,{isOwner:false})).error,null);
    assert.equal(await isPublishKillSwitchOn(null),false);
  } finally {f.sqlite.close();}
});

test('Rust country catalog preserves every label, Korean order and English name', async () => {
  const f=fixture();
  try {
    const display=new Intl.DisplayNames(['en'],{type:'region'});
    const expected=getCountryCatalogSorted().map(({code,name_ko})=>({code,name_ko,name_en:display.of(code)||code}));
    const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'country-catalog',{entries:Object.entries(COUNTRY_CODE_LABELS_KO)});
    assert.equal(direct.status,200);
    assert.deepEqual((await direct.json()).items,expected);
    const response=await countries({env:f.env,request:new Request('https://synthetic.invalid/api/memorabilia/countries')});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'public, max-age=3600, stale-while-revalidate=86400');
    const {items}=await response.json();
    assert.equal(items.length,Object.keys(COUNTRY_CODE_LABELS_KO).length);
    assert.deepEqual(items,expected);
  } finally {f.sqlite.close();}
});

test('Rust public statistics preserve counts, empty databases and failure responses', async () => {
  for (const options of [{},{empty:true},{fail:true}]) {
    const legacy=fixture(options), rust=fixture(options);
    try {
      if (options.empty) { legacy.sqlite.exec('DELETE FROM posts'); rust.sqlite.exec('DELETE FROM posts'); }
      const before=await invoke(originalStats,legacy,'','/api/stats');
      const after=await invoke(actualStats,rust,'','/api/stats');
      assert.deepEqual(after,before,JSON.stringify(options));
      if (options.empty) assert.deepEqual(after.body,{korea:0,apr:0,wosm:0,people:0,today:0});
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust public statistics use the correct Korean midnight boundary', async () => {
  const f=fixture();
  try {
    f.sqlite.exec("DELETE FROM posts; INSERT INTO posts(id,category,title,published,publish_at) VALUES(1,'korea','전날',1,'2026-01-01 23:59:59'),(2,'korea','새날',1,'2026-01-02 00:00:00'),(3,'korea','비공개',0,'2026-01-02 00:00:00')");
    for (const [instant,today] of [['2026-01-01T14:59:59Z',1],['2026-01-01T15:00:00Z',1]]) {
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-stats',{publicDateExpr:PUBLIC_DATE_EXPR,nowMs:Date.parse(instant)});
      assert.equal((await response.json()).today,today,instant);
    }
    f.sqlite.prepare("UPDATE posts SET published=0 WHERE id=1").run();
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-stats',{publicDateExpr:PUBLIC_DATE_EXPR,nowMs:Date.parse('2026-01-01T14:59:59Z')});
    assert.equal((await response.json()).today,0);
    const afterMidnight=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-stats',{publicDateExpr:PUBLIC_DATE_EXPR,nowMs:Date.parse('2026-01-01T15:00:00Z')});
    assert.equal((await afterMidnight.json()).today,1);
  } finally {f.sqlite.close();}
});

test('Rust home rail selection matches recency weighting, ties, exclusions and empty results', async () => {
  for (const limit of [0,1,4,100]) {
    for (const empty of [false,true]) {
      const legacy=fixture(), rust=fixture();
      try {
        for (const f of [legacy,rust]) {
          if (empty) f.sqlite.exec('DELETE FROM posts');
          else f.sqlite.exec("INSERT INTO post_views(post_id,viewed_at) VALUES(2,datetime('now')),(2,datetime('now')),(3,datetime('now','-8 days')),(4,datetime('now','-20 days')),(5,datetime('now','-90 days')),(37,datetime('now'))");
        }
        const before=await originalRails(legacy.env,limit);
        const after=await actualRails(rust.env,limit);
        assert.deepEqual(after,before,`limit ${limit}, empty ${empty}`);
        assert(after.popularIds.every(id=>!after.pickIds.includes(id)));
        assert(!after.pickIds.includes(37));
      } finally {legacy.sqlite.close();rust.sqlite.close();}
    }
  }
});

test('Rust SSR home rail cards preserve legacy order, images and full content', async () => {
  for (const empty of [false,true]) {
    const legacy=fixture(), rust=fixture();
    try {
      for (const f of [legacy,rust]) {
        if (empty) f.sqlite.exec('DELETE FROM posts');
        else f.sqlite.exec("INSERT INTO post_views(post_id,viewed_at) VALUES(2,datetime('now')),(2,datetime('now')),(3,datetime('now','-8 days')); UPDATE posts SET image_url='data:image/png;base64,AA==' WHERE id=2");
      }
      const columns='id, category, title, subtitle, content, image_url, created_at, publish_at, tag, author';
      const {pickIds,popularIds}=await originalRails(legacy.env,4);
      const ids=[...new Set([...pickIds,...popularIds])];
      const cards=await originalHydrate(legacy.env,ids,columns,row=>serializePostImage(row,'https://synthetic.invalid'));
      const byId=new Map(cards.map(row=>[row.id,row]));
      const expected={picks:pickIds.map(id=>byId.get(id)).filter(Boolean),popular:popularIds.map(id=>byId.get(id)).filter(Boolean)};
      const response=await queryRust({env:rust.env,request:{url:'https://synthetic.invalid/'}},'home-rails-cards',{limit:4,weights:POPULAR_WEIGHTS,columns,origin:'https://synthetic.invalid'});
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),expected);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust home rail hydration preserves requested order, duplicates and missing IDs', async () => {
  for (const ids of [[],[1],[3,1,999,3,37]]) {
    const legacy=fixture(), rust=fixture();
    try {
      const serialize = row => ({ id:row.id, label:row.title.toUpperCase() });
      const before=await originalHydrate(legacy.env,ids,'id, title',serialize);
      const after=await actualHydrate(rust.env,ids,'id, title',serialize);
      assert.deepEqual(after,before,JSON.stringify(ids));
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust auto lead ranking preserves public-only candidates and tie selection', async (t) => {
  for (const [kind,random] of [['unique',0],['tie',0],['tie',0.999],['empty',0]]) {
    const legacy=fixture(), rust=fixture();
    try {
      for (const f of [legacy,rust]) {
        if (kind === 'tie') f.sqlite.exec("INSERT INTO post_views(post_id,viewed_at) VALUES(2,datetime('now')),(37,datetime('now')),(37,datetime('now'))");
        if (kind === 'empty') f.sqlite.exec('DELETE FROM posts');
      }
      const clock=t.mock.method(Math,'random',()=>random);
      const before=await originalLeadRank(legacy.env);
      const after=await actualLeadRank(rust.env);
      clock.mock.restore();
      assert.deepEqual(after,before,`${kind} random ${random}`);
      assert.notEqual(after.id,37);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
  const legacy=fixture({fail:true}), rust=fixture({fail:true});
  try {
    assert.equal((await Promise.allSettled([originalLeadRank(legacy.env)]))[0].status,'rejected');
    assert.equal((await Promise.allSettled([actualLeadRank(rust.env)]))[0].status,'rejected');
  } finally {legacy.sqlite.close();rust.sqlite.close();}
});

test('Rust like counts preserve viewer state and repeated-like behavior', async () => {
  const legacy=fixture(), rust=fixture();
  try {
    for (const f of [legacy,rust]) f.sqlite.prepare("INSERT INTO post_likes(post_id,viewer_key,liked_at) VALUES(1,'synthetic-viewer',datetime('now'))").run();
    for (const [id,key] of [[1,null],[1,'synthetic-viewer'],[1,'other-viewer'],[999,'synthetic-viewer']]) {
      assert.deepEqual(await actualLikeStats(rust.env,id,key),await originalLikeStats(legacy.env,id,key));
    }
    for (const [id,agent] of [['2','Mozilla/5.0'],['2','Mozilla/5.0'],['37','Mozilla/5.0'],['2','Googlebot']]) {
      const results=[];
      for (const [handler,f] of [[originalLike,legacy],[actualLike,rust]]) {
        const request=new Request('https://synthetic.invalid/api/posts/'+id+'/like',{
          method:'POST',headers:{'CF-Connecting-IP':'192.0.2.20','User-Agent':agent},
        });
        const response=await handler({params:{id},env:f.env,request});
        results.push({status:response.status,body:await response.json(),count:f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_likes WHERE post_id=2').get().n});
      }
      assert.deepEqual(results[1],results[0],`${id} ${agent}`);
      if (id === '2' && agent === 'Mozilla/5.0') assert.equal(results[1].count,2);
    }
  } finally {legacy.sqlite.close();rust.sqlite.close();}
});

test('Rust view accounting preserves 12-hour deduplication and concurrent insert behavior', async () => {
  const legacy=fixture(), rust=fixture();
  try {
    for (const [id,key] of [[1,null],[1,'viewer-a'],[1,'viewer-a'],[1,'viewer-b'],[999,'viewer-a']]) {
      const before=await originalView(legacy.env,id,key);
      const after=await actualView(rust.env,id,key);
      assert.equal(after,before,`${id} ${key}`);
      assert.deepEqual(rust.sqlite.prepare('SELECT id,views FROM posts WHERE id=1').get(),legacy.sqlite.prepare('SELECT id,views FROM posts WHERE id=1').get());
    }
    const before=await Promise.all([originalView(legacy.env,1,'viewer-c'),originalView(legacy.env,1,'viewer-c')]);
    const after=await Promise.all([actualView(rust.env,1,'viewer-c'),actualView(rust.env,1,'viewer-c')]);
    assert.deepEqual(after.sort(),before.sort());
    assert.deepEqual(after.sort(),[false,true]);
    assert.equal(rust.sqlite.prepare('SELECT views FROM posts WHERE id=1').get().views,legacy.sqlite.prepare('SELECT views FROM posts WHERE id=1').get().views);
  } finally {legacy.sqlite.close();rust.sqlite.close();}
});

test('Rust related-post queries preserve manual order, scoring inputs, published filtering and failures', async () => {
  const cases = [
    {id:1,category:'apr',title:'Synthetic article 1',tag:'camp, 한국',meta_tags:'교육, common',related_posts_manual:'[2,37,3,2,1]'},
    {id:1,category:'apr',title:'%_ 스카우트',tag:'#스카우트 한%국 \\test',meta_tags:'meta_%, 한국',related_posts_manual:'2,3,37'},
    {id:1,category:'',title:'',tag:'',meta_tags:'',related_posts_manual:'invalid'},
    {id:999,category:'korea',title:'No match',tag:'',meta_tags:'',related_posts_manual:'[37,38]'},
    {id:1,category:'apr',title:'A Scout 스카우트 여정 2026 test extra 제목 문장',tag:'#camp scout common 교육 한국 long repeated repeated after',meta_tags:'after one two three four',related_posts_manual:'[]'},
  ];
  for (const base of cases) {
    for (const limit of [0,1,2.9,5,Infinity]) {
      const legacy=fixture(), rust=fixture();
      try {
        for (const [a,b] of [[actualRelated,originalRelated],[actualManual,originalManual]]) {
          const before=await b(legacy.env,base,limit), after=await a(rust.env,base,limit);
          assert.deepEqual(after,before,`${base.id} limit ${limit}`);
          assert(!after.some(post=>[37,38].includes(post.id)));
        }
      } finally {legacy.sqlite.close();rust.sqlite.close();}
    }
  }
  for (const value of [null,'', '특집 <기사>']) {
    const legacy=fixture(), rust=fixture();
    try {
      for (const f of [legacy,rust]) f.sqlite.prepare('UPDATE posts SET special_feature=?,subtitle=?,tag=?,image_url=?,image_caption=? WHERE id=2').run('Synthetic feature',value,value,value,value);
      const base={id:1,category:'wosm',special_feature:'Synthetic feature'};
      const actualRows=await actualFeaturePosts(rust.env,base,50);
      assert.equal(actualRows.length,1);
      assert.deepEqual(actualRows,await originalFeaturePosts(legacy.env,base,50));
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
  for (const base of [{id:1,category:'apr',special_feature:'Scout feature'},{id:1,category:' apr ',special_feature:'  Scout  feature  '},{id:1,category:'apr',special_feature:'😀'},{id:1,category:'apr',special_feature:'   '},{id:1,category:'  ',special_feature:'Scout feature'},{id:1,category:'apr',special_feature:'none'},{id:1,category:'',special_feature:'Scout feature'}]) {
    const legacy=fixture(), rust=fixture();
    try { assert.deepEqual(await actualFeaturePosts(rust.env,base,50),await originalFeaturePosts(legacy.env,base,50)); }
    finally {legacy.sqlite.close();rust.sqlite.close();}
  }
  const legacy=fixture({fail:true}), rust=fixture({fail:true});
  try {
    const base={id:1,category:'apr',title:'Synthetic',tag:'camp',meta_tags:'',related_posts_manual:'[2]'};
    assert.equal((await Promise.allSettled([originalRelated(legacy.env,base)]))[0].status,'rejected');
    assert.equal((await Promise.allSettled([actualRelated(rust.env,base)]))[0].status,'rejected');
  } finally {legacy.sqlite.close();rust.sqlite.close();}
});

test('Rust manual related IDs preserve legacy parsing and slice limits', async () => {
  for (const raw of ['[3,2,2,37,1,999]','3, 2abc, 37, -1','[{"id":"3x"},{"id":2},null]',[3,{id:'2x'},37],null,'["2\\ud800",3]','["2\ud800",3]',`[1e${'9'.repeat(310)},3,2]`,'not-json','3']) {
    for (const limit of [0,1,2.9,-1,Infinity,-Infinity,NaN]) {
      const before=fixture(),after=fixture();
      try {
        const base={id:1,related_posts_manual:raw};
        assert.deepEqual(await actualManual(after.env,base,limit),await originalManual(before.env,base,limit),`${String(raw)} limit ${limit}`);
      } finally {before.sqlite.close();after.sqlite.close();}
    }
  }
});

test('related special feature sends exact UTF-16 query bindings', async () => {
  for (const feature of ['  😀  캠프 ', '가'.repeat(119)+'😀', '합성\ud800특집']) {
    const old=fixture(),current=fixture();
    try {
      const base={id:1,category:'apr',special_feature:feature};
      assert.deepEqual(await actualFeaturePosts(current.env,base),await originalFeaturePosts(old.env,base));
      const find=f=>f.state.allCalls.find(call=>call.sql.includes("COALESCE(special_feature, '') = ?"));
      assert.deepEqual(find(current).args,find(old).args);
    } finally {old.sqlite.close();current.sqlite.close();}
  }
});

test('Rust manual related posts preserve selected order, empty fields and private exclusion', async () => {
  const before=fixture(),after=fixture();
  try {
    for (const f of [before,after]) f.sqlite.prepare('UPDATE posts SET title=NULL, category=NULL, created_at=NULL, publish_at=NULL WHERE id=2').run();
    const base={id:1,related_posts_manual:'[3,37,2,3,1,999]'};
    const actualRows=await actualManual(after.env,base,8);
    assert.deepEqual(actualRows,await originalManual(before.env,base,8));
    assert.deepEqual(actualRows.map(row=>row.id),[3,2]);
    assert.deepEqual(actualRows[1],{id:2,title:'',category:'',publish_at:'',created_at:''});
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust article SSR and Markdown retrieval preserve public, draft, missing and invalid responses', async (t) => {
  t.mock.method(globalThis,'fetch',async () => new Response('Synthetic status page',{status:200}));
  for (const [id,role] of [['1','anonymous'],['1.md','anonymous'],['37','anonymous'],['37','owner'],['37.md','owner'],['999','anonymous'],['bad','anonymous'],['1.json','anonymous']]) {
    const legacy=fixture({role}), rust=fixture({role});
    try {
      const results=[];
      for (const [handler,f] of [[originalArticlePage,legacy],[actualArticlePage,rust]]) {
        const headers=role === 'owner' ? {Cookie:'admin_token='+await createToken(secret,{role:'full'})} : {};
        const response=await handler({params:{id},env:f.env,request:new Request('https://synthetic.invalid/post/'+id,{headers})});
        results.push({status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),body:await response.text()});
      }
      assert.deepEqual(results[1],results[0],`${id} ${role}`);
      if (id==='37.md') assert.equal(results[1].status,404);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust tag, special feature and popular endpoints match legacy output and error behavior', async () => {
  const scenarios = [
    [actualTags,originalTags,'/api/posts/tags','', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?category=worm&days=7', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?category=invalid', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?days=garbage', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?category=korea&days=2suffix', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?days=-10', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?days=9999999999999999999999', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','?category=%20worm%20', 'anonymous',{}],
    [actualTags,originalTags,'/api/posts/tags','', 'anonymous',{fail:true}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','?category=korea','anonymous',{}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','?category=invalid','owner',{}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','?category=worm','anonymous',{}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','?category=korea&category=apr','owner',{}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','?category=%20korea%20','anonymous',{}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','', 'member-list',{}],
    [actualFeatures,originalFeatures,'/api/posts/special-features','', 'anonymous',{fail:true}],
    [actualPopular,originalPopular,'/api/posts/popular','', 'anonymous',{}],
    [actualPopular,originalPopular,'/api/posts/popular','', 'anonymous',{due:true}],
    [actualPopular,originalPopular,'/api/posts/popular','', 'anonymous',{fail:true}],
  ];
  for (const [a,b,path,suffix,role,options] of scenarios) {
    const legacy=fixture({...options,role}), rust=fixture({...options,role});
    try {
      const before=await invoke(b,legacy,suffix,path);
      const after=await invoke(a,rust,suffix,path);
      assert.deepEqual(after,before,`${path} ${suffix} ${role} ${JSON.stringify(options)}`);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust popular list preserves image normalization and ordering', async () => {
  for (const image of ['data:image/png;base64,AA==','https://example.invalid/image','/relative.jpg',null]) {
    const before=fixture(), after=fixture();
    try {
      for (const f of [before,after]) f.sqlite.prepare('UPDATE posts SET image_url=? WHERE id=1').run(image);
      assert.deepEqual(await invoke(actualPopular,after,'','/api/posts/popular'),await invoke(originalPopular,before,'','/api/posts/popular'),String(image));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust article list preserves due publication and database failure responses', async () => {
  for (const options of [{due:true},{fail:true}]) {
    const legacy=fixture(options), rust=fixture(options);
    try {
      const before=await invoke(original,legacy,'?category=wosm');
      const after=await invoke(actual,rust,'?category=wosm');
      if (options.due) {
        for (const result of [before,after]) {
          const post=result.body.posts.find(item=>item.id===38);
          assert.match(post.updated_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?$/);
          post.updated_at='<timestamp>';
        }
      }
      assert.deepEqual(after,before);
      if (options.due) {
        assert.equal(legacy.sqlite.prepare('SELECT published FROM posts WHERE id=38').get().published,1);
        assert.equal(rust.sqlite.prepare('SELECT published FROM posts WHERE id=38').get().published,1);
      }
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});


test('article creation preserves authorization, validation, saved fields and history', async () => {
  const cases = [
    {role:'anonymous',body:{category:'korea',title:'Test',content:'Body'},status:401},
    {role:'member-list',body:{category:'korea',title:'Test',content:'Body'},status:403},
    {role:'owner',body:{category:'bad',title:'Test',content:'Body'},status:400},
    {role:'owner',body:{category:'korea',title:' ',content:'Body'},status:400},
    {role:'owner',body:{category:'korea',title:'  Test  ',content:'본문',subtitle:null,tag:null,meta_tags:null,special_feature:null,published:false},status:201},
    {role:'owner',body:{category:'apr',title:'Test',content:'Body',subtitle:null,tag:null,meta_tags:null,featured:true},status:409},
    {role:'owner',body:{category:'korea',title:'Test',content:'Body'},status:500},
    {role:'owner',body:{category:'korea',title:'긴 본문',content:'본문'.repeat(50000),subtitle:null,tag:null,meta_tags:null,special_feature:null,published:false},status:201},
    {role:'writer',body:{category:'korea',title:'작성자',content:'본문',subtitle:null,tag:null,meta_tags:null,special_feature:null,published:false},status:201},
  ];
  for (const c of cases) {
    const legacy=fixture({role:c.role}), rust=fixture({role:c.role});
    try {
      const results=[];
      for (const [handler,f] of [[originalCreate,legacy],[actualCreate,rust]]) {
        const headers={'Content-Type':'application/json'};
        if (c.role !== 'anonymous') headers.Cookie='admin_token='+await createToken(secret,c.role === 'owner' ? {role:'full'} : {role:'member',uid:77});
        const response=await handler({request:new Request('https://synthetic.invalid/api/posts',{method:'POST',headers,body:JSON.stringify(c.body)}),env:f.env});
        results.push({status:response.status,body:await response.json(),rows:f.sqlite.prepare('SELECT * FROM posts WHERE id>38').all(),history:f.sqlite.prepare('SELECT * FROM post_history').all()});
      }
      if (c.status === 201) {
        for (const result of results) {
          const row=result.rows[0];
          assert.match(row.created_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
          assert.equal(row.updated_at,row.created_at);
          assert.equal(JSON.parse(result.history[0].snapshot).created_at,row.created_at);
        }
      }
      const normalizeTimes = value => JSON.parse(JSON.stringify(value).replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g,'<timestamp>'));
      assert.deepEqual(normalizeTimes(results[1]),normalizeTimes(results[0]),JSON.stringify(c));
      assert.equal(results[1].status,c.status,JSON.stringify(c));
      assert.equal(results[1].rows.length,c.status === 201 ? 1 : 0);
      assert.equal(results[1].history.length,c.status === 201 ? 1 : 0);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});


test('article deletion preserves authorization and related data cleanup', async () => {
  for (const [role,id,status] of [['anonymous','1',401],['member-list','1',401],['owner','bad',400],['owner','999',404],['owner','1',200]]) {
    const before=fixture({role}), after=fixture({role});
    try {
      const results=[];
      for (const [handler,f] of [[originalDelete,before],[actualDelete,after]]) {
        f.sqlite.exec("INSERT INTO calendar_events VALUES(1,1); INSERT INTO post_history(post_id,action) VALUES(1,'create')");
        const headers={};
        if(role!=='anonymous') headers.Cookie='admin_token='+await createToken(secret,role==='owner'?{role:'full'}:{role:'member',uid:77});
        const response=await handler({params:{id},request:new Request('https://synthetic.invalid/api/posts/'+id,{method:'DELETE',headers}),env:f.env});
        results.push({status:response.status,body:await response.json(),post:f.sqlite.prepare('SELECT id FROM posts WHERE id=1').get() || null,history:f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history WHERE post_id=1').get().n,calendar:f.sqlite.prepare('SELECT related_post_id FROM calendar_events WHERE id=1').get().related_post_id,likes:f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_likes WHERE post_id=1').get().n});
      }
      assert.deepEqual(results[1],results[0],`${role} ${id}`);
      assert.equal(results[1].status,status);
      if(status===200) assert.deepEqual([results[1].post,results[1].history,results[1].calendar,results[1].likes],[null,0,null,0]);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('article editing preserves permissions, optimistic conflicts, updates and snapshots', async () => {
  const cases = [
    ['PUT','anonymous',1,{title:'수정'},401], ['PUT','member-list',1,{title:'수정'},403],
    ['PUT','writer',1,{title:'수정'},403], ['PUT','writer',1,{title:'수정',subtitle:null},200,true],
    ['PUT','owner',1,{title:'수정',content:'본문 변경',tag:' scout ',meta_tags:null,sort_order:5},200],
    ['PUT','owner',1,{title:'',content:'본문'},400], ['PUT','owner',1,{},400],
    ['PUT','owner',1,{title:'수정',expected_updated_at:'1999-01-01 00:00:00'},409],
    ['PUT','owner',999,{title:'수정'},404],
    ['PATCH','owner',1,{sort_order:7},200], ['PATCH','owner',1,{published:false},200],
    ['PATCH','owner',1,{published:'maybe'},200], ['PATCH','owner',1,{featured:'maybe'},200], ['PATCH','owner',1,{sort_order:'bad'},400], ['PATCH','owner',1,{sort_order:'12suffix'},200],
    ['PATCH','writer',1,{featured:true},403,true], ['PATCH','writer',1,{sort_order:3},200,true],
    ['PATCH','anonymous',1,{published:false},401], ['PATCH','owner',1,{},400],
  ];
  for (const [method,role,id,body,status,owned] of cases) {
    const before=fixture({role}), after=fixture({role});
    try {
      const results=[];
      const handlers=method==='PUT' ? [originalPut,actualPut] : [originalPatch,actualPatch];
      for (const [handler,f] of [[handlers[0],before],[handlers[1],after]]) {
        if (owned) f.sqlite.prepare('UPDATE posts SET author_user_id=77 WHERE id=1').run();
        if (body.expected_updated_at) f.sqlite.prepare("UPDATE posts SET updated_at='2020-01-01 00:00:00' WHERE id=1").run();
        const headers={'Content-Type':'application/json'};
        if (role!=='anonymous') headers.Cookie='admin_token='+await createToken(secret,role==='owner'?{role:'full'}:{role:'member',uid:77});
        const response=await handler({params:{id:String(id)},request:new Request('https://synthetic.invalid/api/posts/'+id,{method,headers,body:JSON.stringify(body)}),env:f.env});
        results.push({status:response.status,body:await response.json(),post:f.sqlite.prepare('SELECT * FROM posts WHERE id=1').get(),history:f.sqlite.prepare('SELECT * FROM post_history').all()});
      }
      if(status===200) {
        assert.match(results[1].post.updated_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
        assert.equal(JSON.parse(results[1].history[0].after_snapshot).updated_at,results[1].post.updated_at);
      }
      const normalizeTimes=value=>JSON.parse(JSON.stringify(value).replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?/g,'<timestamp>'));
      assert.deepEqual(normalizeTimes(results[1]),normalizeTimes(results[0]),JSON.stringify([method,role,id,body]));
      assert.equal(results[1].status,status,JSON.stringify([method,role,id,body]));
      assert.equal(results[1].history.length,status===200 ? 1 : 0);
    } finally { before.sqlite.close(); after.sqlite.close(); }
  }
});


test('Rust article update rejects SQL fragments outside its allowlist', async () => {
  const f=fixture();
  try {
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'post-update',{id:1,fields:['title = ?, published = 0'],values:['tamper'],action:'update',summary:'synthetic',claim:'post-history:synthetic'});
    assert.equal(response.status,500);
    assert.equal(f.sqlite.prepare('SELECT published FROM posts WHERE id=1').get().published,1);
  } finally {f.sqlite.close();}
});


test('public visit analytics preserve unique visitors, pageviews and errors', async () => {
  for (const failAnalytics of [false,true]) {
    const before=fixture({failAnalytics}), after=fixture({failAnalytics});
    try {
      const out=[];
      for (const [handler,f] of [[originalAnalytics,before],[actualAnalytics,after]]) {
        f.sqlite.exec("INSERT INTO site_visits(path,visited_at,viewer_key) VALUES('/another',datetime('now'),'viewer-a'),('/anonymous',datetime('now'),NULL)");
        const response=await handler({request:new Request('https://synthetic.invalid/api/analytics/today'),env:f.env});
        out.push({status:response.status,body:await response.json()});
      }
      assert.deepEqual(out[1],out[0]);
      assert.equal(out[1].status,failAnalytics?500:200);
      if (!failAnalytics) {assert.equal(out[1].body.today_unique,1);assert.equal(out[1].body.today_views,3);assert.equal(out[1].body.total_unique,2);assert.equal(out[1].body.total_pageviews,4);}
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('article NDJSON export preserves filters, metadata and public fields', async () => {
  for (const suffix of ['', '?category=korea&days=10&limit=4','?category=invalid&limit=2','?days=0&limit=999999', '?category=apr&days=365','?days=bogus&limit=-2&category=%20APR%20','?days=12.9&limit=3tail&category=WoSm','?days=1e999&limit=0x20','?days=%2B0007&limit=99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999']) {
    const before=fixture(),after=fixture();
    try {
      const out=[];
      for (const [handler,f] of [[originalExport,before],[actualExport,after]]) {
        const response=await handler({request:new Request('https://synthetic.invalid/api/articles.ndjson'+suffix),env:f.env});
        const rows=(await response.text()).trim().split('\n').map(JSON.parse);
        delete rows[0].generated_at;
        out.push({status:response.status,type:response.headers.get('Content-Type'),rows});
      }
      assert.deepEqual(out[1],out[0],suffix);
      assert.equal(out[1].status,200);
      assert(out[1].rows.slice(1).every(row=>!Object.hasOwn(row,'internal_audit_note')));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('article NDJSON preserves author, tags, dates, image and numeric edge cases', async () => {
  for (const data of [
    ['loading…','하나, 둘|셋','<첫째>|둘','/relative/image','2020-01-01 00:00:00','12',1],
    [' Editor a ','',null,'HTTPS://example.invalid/img.jpg',null,'bad',0],
    ['불러오는 중...',' 태그 , | 중복 ', '사실',null,'not-a-date',-5,1],
  ]) {
    const before=fixture(),after=fixture();
    try {
      const out=[];
      for(const [f,handler] of [[before,originalExport],[after,actualExport]]) {
        f.sqlite.exec('UPDATE posts SET published=0 WHERE id!=1');
        f.sqlite.prepare('UPDATE posts SET author=?,meta_tags=?,tag=?,image_url=?,updated_at=?,views=?,ai_assisted=? WHERE id=1').run(...data);
        const response=await handler({request:new Request('https://synthetic.invalid/api/articles.ndjson'),env:f.env});
        const rows=(await response.text()).trim().split('\n').map(JSON.parse);
        delete rows[0].generated_at;
        out.push({status:response.status,rows});
      }
      assert.deepEqual(out[1],out[0],JSON.stringify(data));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('article NDJSON export preserves database error response', async () => {
  for (const handler of [originalExport,actualExport]) {
    const f=fixture({fail:true});
    try {
      const response=await handler({request:new Request('https://synthetic.invalid/api/articles.ndjson'),env:f.env});
      assert.equal(response.status,500);
      assert.equal(await response.text(),'{"error":"internal_error"}\n');
    } finally {f.sqlite.close();}
  }
});


test('visit schema migration preserves records, retries failures and handles concurrent columns', async () => {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE site_visits(id INTEGER PRIMARY KEY,viewer_key TEXT,path TEXT); INSERT INTO site_visits VALUES(1,'viewer','/article')");
  let fail=true,race=false;
  const DB=Object.assign(new (class D1Database {})(),{prepare(sql){return {
    async all(){return {results:sqlite.prepare(sql).all()};},
    async run(){
      if (sql.includes('ADD COLUMN region_code') && fail) {fail=false;throw new Error('synthetic alter failure');}
      if (sql.includes('ADD COLUMN continent_code') && race) {race=false;sqlite.prepare(sql).run();throw new Error('synthetic concurrent alter');}
      if (sql.includes('CREATE INDEX') && sql.includes('city_name')) throw new Error('synthetic optional index failure');
      const result=sqlite.prepare(sql).run();return {success:true,meta:{changes:Number(result.changes)}};
    },
  };}});
  try {
    await assert.rejects(ensureSiteVisitColumns({DB}));
    assert.equal(sqlite.prepare('SELECT path FROM site_visits WHERE id=1').get().path,'/article');
    race=true;
    assert.equal(await ensureSiteVisitColumns({DB}),true);
    assert.equal(await ensureSiteVisitColumns({DB}),true);
    const columns=sqlite.prepare('PRAGMA table_info(site_visits)').all().map(row=>row.name);
    for (const name of ['country_code','country_name','city_name','region_code','continent_code','latitude','longitude']) assert(columns.includes(name),name);
    assert.equal(sqlite.prepare('SELECT viewer_key FROM site_visits WHERE id=1').get().viewer_key,'viewer');
    assert(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_site_visits_country_code'").get());
    assert.equal(await ensureSiteVisitColumns(null),true);
  } finally {sqlite.close();}
});

test('visit and reading analytics preserve bot exclusion, deduplication and maximum session duration', async () => {
  const before=fixture(),after=fixture();
  try {
    const out=[];
    for(const [f,visit,engagement] of [[before,oldSiteVisit,oldEngagement],[after,actualSiteVisit,actualEngagement]]) {
      const headers={'CF-Connecting-IP':'192.0.2.8','User-Agent':'Mozilla/5.0','Content-Type':'application/json'};
      const req=new Request('https://synthetic.invalid/api/analytics/visit',{method:'POST',headers,body:'{}'});
      const data={path:'/post/1?ref=x',current_url:'https://synthetic.invalid/post/1?utm_source=Scout',referrer:'https://example.invalid/a'};
      const result=[await visit(req,f.env,data),await visit(req,f.env,data),await visit(req,f.env,{path:'/admin'})];
      result.push(await visit(new Request(req.url,{method:'POST',headers:{...headers,'User-Agent':'Googlebot'}}),f.env,data));
      for(const path of ['/api/internal','/admin.html','/valid?x=1','/line?x\ny','/'+ '😀'.repeat(130),'/unpaired-\ud800?x=1',{utf16:[47,97]},null,0]) result.push(await visit(req,f.env,{path}));
      for (const seconds of [15,8,42,50000]) {
        const response=await engagement({env:f.env,request:new Request('https://synthetic.invalid/api/analytics/post-engagement',{method:'POST',headers,body:JSON.stringify({post_id:1,session_key:'synthetic-session',engaged_seconds:seconds})})});
        result.push([response.status,await response.json()]);
      }
      const bad=await engagement({env:f.env,request:new Request('https://synthetic.invalid/api/analytics/post-engagement',{method:'POST',headers,body:JSON.stringify({post_id:1,session_key:'bad key',engaged_seconds:5})})});
      result.push(await bad.json());
      for (const payload of [
        {post_id:'1xyz',session_key:'  parsed-key  ',engaged_seconds:'12.9'},
        {post_id:1,session_key:'boolean-time',engaged_seconds:true},
        {post_id:1,session_key:'invalid-time',engaged_seconds:'Infinity'},
        {post_id:1,session_key:'x'.repeat(121),engaged_seconds:1},
        {post_id:-1,session_key:'negative-id',engaged_seconds:1},
        {post_id:1,session_key:0,engaged_seconds:1},
      ]) {
        const response=await engagement({env:f.env,request:new Request('https://synthetic.invalid/api/analytics/post-engagement',{method:'POST',headers,body:JSON.stringify(payload)})});
        result.push([response.status,await response.json()]);
      }
      result.push(f.sqlite.prepare("SELECT path,referrer_host,utm_source FROM site_visits WHERE visited_bucket IS NOT NULL").all());
      result.push(f.sqlite.prepare("SELECT post_id,engaged_seconds FROM post_engagement WHERE session_key='synthetic-session'").get());
      out.push(result);
    }
    assert.deepEqual(out[1],out[0]);
    assert.deepEqual(out[1].slice(0,4).map(x=>x.recorded),[true,false,false,false]);
    assert.equal(out[1].at(-1).engaged_seconds,43200);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('visit referrer and campaign fields match the original for URL edge cases', async () => {
  const before=fixture(), after=fixture();
  try {
    const req=new Request('https://synthetic.invalid/api/analytics/visit',{headers:{'CF-Connecting-IP':'192.0.2.33','User-Agent':'Mozilla/5.0'}});
    const cases=[
      {referrer:' https://EXAMPLE.invalid:443/a b ',current_url:'https://synthetic.invalid/p?utm_source=%20Scout%20&utm_medium=Email&utm_campaign=%ED%95%9C%EA%B8%80'},
      {referrer:'https://synthetic.invalid/other',current_url:'https://synthetic.invalid/?utm_source=FIRST&utm_source=SECOND'},
      {referrer:'javascript:alert(1)',current_url:'not-a-url'},
      {referrer:'https://[::1]:8080/path',current_url:'https://other.invalid/?utm_source=%FF&utm_medium=a+b'},
      {referrer:23,current_url:null},
      {referrer:'',current_url:'https://synthetic.invalid/?utm_source='+encodeURIComponent('a'.repeat(79)+'😀')},
      {referrer:'https://example.invalid/a',current_url:'https://synthetic.invalid/?utm_source='+encodeURIComponent('가'.repeat(81))},
      {referrer:'https://example.invalid/\ud800',current_url:'https://synthetic.invalid/'},
    ];
    for (const [index, item] of cases.entries()) {
      const payload={...item,path:'/synthetic-visit-'+index};
      assert.deepEqual(await actualSiteVisit(req,after.env,payload),await oldSiteVisit(req,before.env,payload));
    }
    const select="SELECT path,referrer_host,referrer_url,utm_source,utm_medium,utm_campaign FROM site_visits WHERE path LIKE '/synthetic-visit-%' ORDER BY path";
    assert.deepEqual(after.sqlite.prepare(select).all(),before.sqlite.prepare(select).all());
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('visit geo fields retain country names, coordinate rounding and unusual input', async () => {
  const before=fixture(),after=fixture();
  try {
    const cases=[
      {country:' kr ',city:' 서울 ',regionCode:' 11 ',continent:' as ',latitude:'37.1234567',longitude:'127.1234565'},
      {country:'ZZ',city:'',regionCode:'',latitude:'-0.0000005',longitude:'180'},
      {country:'us',city:'😀'.repeat(60)+'끝',latitude:'-91',longitude:'181'},
      {country:' a😀 '.repeat(8),city:'가'.repeat(119)+'😀',latitude:true,longitude:false},
      {country:['KR'],city:{name:'Seoul'},regionCode:0,continent:false,latitude:' ',longitude:'NaN'},
      {country:'kr',city:'\ud800',latitude:null,longitude:null},
    ];
    for(const [index, cf] of cases.entries()) {
      const req=new Request('https://synthetic.invalid/api/analytics/visit',{headers:{'CF-Connecting-IP':'192.0.2.41','User-Agent':'Mozilla/5.0'}});
      Object.defineProperty(req,'cf',{value:cf});
      const payload={path:'/geo-case-'+index};
      assert.deepEqual(await actualSiteVisit(req,after.env,payload),await oldSiteVisit(req,before.env,payload));
    }
    const sql="SELECT path,country_code,country_name,city_name,region_code,continent_code,latitude,longitude FROM site_visits WHERE path LIKE '/geo-case-%' ORDER BY path";
    assert.deepEqual(after.sqlite.prepare(sql).all(),before.sqlite.prepare(sql).all());
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('scheduled publication preserves ordering, batch limit, date filtering and repeated execution', async () => {
  const before=fixture(),after=fixture();
  try {
    const out=[];
    for(const [f,handler] of [[before,oldDue],[after,actualDue]]) {
      const insert=f.sqlite.prepare('INSERT INTO posts(id,category,title,published,publish_at) VALUES(?,?,?,?,?)');
      for(let i=100;i<160;i++) insert.run(i,i%2?'korea':'apr','synthetic '+i,0,`2000-01-${String((i%20)+1).padStart(2,'0')}T00:00:00`);
      insert.run(200,'korea','invalid date',0,'not-a-date');
      insert.run(201,'korea','future',0,'2999-01-01 00:00:00');
      const first=await handler(f.env,null); const second=await handler(f.env,null); const third=await handler(f.env,null);
      const rows=f.sqlite.prepare('SELECT id,published FROM posts WHERE id>=100 ORDER BY id').all();
      out.push({first,second,third,rows});
    }
    assert.deepEqual(JSON.parse(JSON.stringify(out[1])),JSON.parse(JSON.stringify(out[0])));
    assert.equal(out[1].first.published.length,50);
    assert.equal(out[1].second.published.length,10);
    assert.deepEqual(out[1].third.published,[]);
    assert(out[1].rows.filter(row=>row.id>=200).every(row=>row.published===0));
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('sitemaps and RSS preserve public content, metadata, escaping and HEAD contracts', async()=>{
  for(const [handler,oldHandler,path,method] of [[sitemap,oldSitemap,'/sitemap.xml','GET'],[sitemapHead,oldSitemapHead,'/sitemap.xml','HEAD'],[newsSitemap,oldNewsSitemap,'/sitemap-news.xml','GET'],[newsSitemapHead,oldNewsSitemapHead,'/sitemap-news.xml','HEAD'],[rss,oldRss,'/rss.xml','GET']]) {
    const before=fixture(),after=fixture();
    try {
      const out=[];
      for(const [f,run] of [[before,oldHandler],[after,handler]]) {
        f.sqlite.exec("CREATE TABLE glossary_terms(id INTEGER,created_at TEXT,updated_at TEXT); INSERT INTO glossary_terms VALUES(1,'2025-01-01','2026-01-01'); UPDATE posts SET title='표제 <A&B>',special_feature='특집' WHERE id=1");
        const response=await run({env:f.env,request:new Request('https://synthetic.invalid'+path,{method})});
        const body=(await response.text()).replace(/<lastBuildDate>.*?<\/lastBuildDate>/,'<lastBuildDate>TIME</lastBuildDate>');
        out.push({status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),body});
      }
      assert.deepEqual(out[1],out[0],`${method} ${path}`);
      if(method==='GET') { assert.match(out[1].body,/synthetic.invalid/);assert.doesNotMatch(out[1].body,/internal_audit_note/); }
      else assert.equal(out[1].body,'');
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('sitemap matches feature slugs, latest dates and invalid-date fallback', async () => {
  const before=fixture(),after=fixture();
  try {
    const out=[];
    for (const [f,run] of [[before,oldSitemap],[after,sitemap]]) {
      f.sqlite.exec("CREATE TABLE glossary_terms(id INTEGER,created_at TEXT,updated_at TEXT); INSERT INTO glossary_terms VALUES(1,'2025-01-01','not a date'); UPDATE posts SET published=0 WHERE id>4");
      const update=f.sqlite.prepare('UPDATE posts SET category=?,special_feature=?,created_at=?,publish_at=?,updated_at=? WHERE id=?');
      update.run('korea','Café & 한국','2024-01-01 00:00:00','2026-10-20 12:00:00','2026-10-21 03:00:00',1);
      update.run('korea','Café & 한국','2024-01-01 00:00:00','2026-10-22T12:00:00+09:00','not-a-date',2);
      update.run('apr','  ','2024-01-01 00:00:00',null,null,3);
      update.run('wosm','😀','broken','broken','broken',4);
      const response=await run({env:f.env,request:new Request('https://synthetic.invalid/sitemap.xml')});
      out.push({status:response.status,body:await response.text()});
    }
    assert.deepEqual(out[1],out[0]);
    assert.match(out[1].body,/\/feature\/korea\/cafe</);
    assert.match(out[1].body,/\/feature\/apr\//);
    assert.match(out[1].body,/\/feature\/wosm\/feature/);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('RSS rendering preserves escaping, tags, descriptions and publication dates', async () => {
  const before=fixture(), after=fixture();
  try {
    const out=[];
    for (const [f,run] of [[before,oldRss],[after,rss]]) {
      f.sqlite.exec(`UPDATE posts SET published=0 WHERE id!=1`);
      f.sqlite.prepare('UPDATE posts SET title=?,subtitle=?,tag=?,publish_at=? WHERE id=1').run(`제목 <&> "인용" '문장'`,`요약 <&>`, `태그 & 하나, 태그 <둘>`, '2026-10-28 16:00:00');
      const response=await run({env:f.env,request:new Request('https://synthetic.invalid/rss.xml')});
      out.push((await response.text()).replace(/<lastBuildDate>.*?<\/lastBuildDate>/,'<lastBuildDate>TIME</lastBuildDate>'));
    }
    assert.equal(out[1],out[0]);
    assert.match(out[1],/제목 &lt;&amp;&gt; &quot;인용&quot; &apos;문장&apos;/);
    assert.match(out[1],/<category domain="tag">태그 &amp; 하나<\/category>/);
    assert.match(out[1],/<pubDate>Wed, 28 Oct 2026 07:00:00 GMT<\/pubDate>/);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('RSS descriptions match legacy HTML, Editor.js, whitespace and UTF-16 truncation', async () => {
  const scenarios = [
    ['  제목 설명  ', '<b>unused</b>', '하나, 둘'],
    ['', '<p>  기사 &amp; 내용 </p>\n<b>두번째</b>', '태그'],
    ['', JSON.stringify({blocks:[{type:'paragraph',data:{text:'안녕 <b>세계</b>'}},{type:'list',data:{items:['하나',{content:'둘'}]}},{type:'quote',data:{text:'인용'}}]}), ' 태그, , 다른 '],
    ['', '{broken json <span>문장</span>', ''],
    ['', JSON.stringify({blocks:[null]}), ''],
    ['', JSON.stringify({blocks:[42,{type:'paragraph',data:{text:0}},{type:'paragraph',data:{text:['가','나']}},{type:'list',data:{items:[{content:false},'끝']}}]}), ''],
    ['', JSON.stringify({blocks:[{type:'paragraph',data:'문자열'}]}), ''],
    ['', '가'.repeat(219)+'😀끝', ''],
    ['', '\ufeff  띄움\u00a0\n두번째  ', ''],
  ];
  for (const [subtitle,content,tag] of scenarios) {
    const before=fixture(),after=fixture();
    try {
      const out=[];
      for(const [f,run] of [[before,oldRss],[after,rss]]) {
        f.sqlite.exec('UPDATE posts SET published=0 WHERE id!=1');
        f.sqlite.prepare('UPDATE posts SET subtitle=?,content=?,tag=? WHERE id=1').run(subtitle,content,tag);
        const response=await run({env:f.env,request:new Request('https://synthetic.invalid/rss.xml')});
        out.push({status:response.status,body:(await response.text()).replace(/<lastBuildDate>.*?<\/lastBuildDate>/,'<lastBuildDate>TIME</lastBuildDate>')});
      }
      assert.deepEqual(out[1],out[0],JSON.stringify([subtitle,content,tag]));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('RSS preserves created and published time zones, invalid dates and navigation labels', async () => {
  for (const [created,published,category] of [
    ['2026-10-28 16:00:00',null,'korea'],
    ['2026-10-28T16:00:00Z','2026-10-28 16:00:00','apr'],
    ['2026-10-28 16:00:00','2026-10-28T16:00:00+02:00','wosm'],
    ['2026-10-28 16:00:00','invalid date','unknown'],
  ]) {
    const before=fixture(),after=fixture();
    try {
      const out=[];
      for (const [f,run] of [[before,oldRss],[after,rss]]) {
        f.sqlite.exec('UPDATE posts SET published=0 WHERE id!=1');
        f.sqlite.prepare('UPDATE posts SET created_at=?,publish_at=?,category=? WHERE id=1').run(created,published,category);
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('nav_labels',JSON.stringify({'nav.korea':{ko:'한국 & 스카우트'},'nav.apr':{ko:'아시아 <태평양>'}}));
        const response=await run({env:f.env,request:new Request('https://synthetic.invalid/rss.xml')});
        out.push({status:response.status,body:(await response.text()).replace(/<lastBuildDate>.*?<\/lastBuildDate>/,'<lastBuildDate>TIME</lastBuildDate>')});
      }
      assert.deepEqual(out[1],out[0],JSON.stringify([created,published,category]));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('sitemaps and RSS preserve database failure responses',async()=>{
  for(const [handler,oldHandler,path] of [[sitemap,oldSitemap,'/sitemap.xml'],[newsSitemap,oldNewsSitemap,'/sitemap-news.xml'],[rss,oldRss,'/rss.xml']]) {
    const before=fixture({fail:true}),after=fixture({fail:true});
    try {
      const out=[];
      for(const [f,run] of [[before,oldHandler],[after,handler]]) {
        const response=await run({env:f.env,request:new Request('https://synthetic.invalid'+path)});
        out.push({status:response.status,body:await response.text()});
      }
      assert.deepEqual(out[1],out[0],path);
      assert.equal(out[1].status,path==='/rss.xml'?500:200);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust related ranking preserves Unicode tokenization, date ties and empty fields', async () => {
  const legacy=fixture(), rust=fixture();
  try {
    for (const f of [legacy,rust]) {
      const update=f.sqlite.prepare('UPDATE posts SET category=?, title=?, tag=?, meta_tags=?, publish_at=?, created_at=? WHERE id=?');
      update.run('apr','스카우트 세계 캠프','##한국 #İSTANBUL','%한국_ 일본','2024-01-02','2024-01-01',2);
      update.run('apr','스카우트-세계 소식','한국, 캠프','일본','2024-01-10','2024-01-01',3);
      update.run('korea','세계 캠프 😀','한국','İSTANBUL','2024-01-2','2024-01-01',4);
      update.run('apr','다른 제목','###😀😀 한국','  \uFEFF캠프','2024-01-02','2024-01-01',5);
      update.run('apr','',null,null,null,null,6);
    }
    for(const base of [
      {id:1,category:'apr',title:'스카우트 세계 캠프',tag:'#한국 #İSTANBUL',meta_tags:'캠프 일본'},
      {id:1,category:'apr',title:'😀 세계',tag:'😀😀, %한국_ \\테스트',meta_tags:'\uFEFF캠프'},
      {id:1,category:null,title:'',tag:'',meta_tags:''},
      {id:1,title:'',tag:'',meta_tags:''},
    ]) for(const limit of [1,5,20]) {
      assert.deepEqual(await actualRelated(rust.env,base,limit),await originalRelated(legacy.env,base,limit));
    }
  } finally {legacy.sqlite.close();rust.sqlite.close();}
});

test('home rails refresh on each request when the same environment is reused', async () => {
  const f=fixture();
  try {
    const first=await invoke(actualHome,f,'','/api/home');
    f.sqlite.exec("INSERT INTO post_views(post_id,viewed_at) VALUES(2,datetime('now')),(2,datetime('now'))");
    const second=await invoke(actualHome,f,'','/api/home');
    assert.equal(first.status,200);
    assert.equal(second.status,200);
    assert.equal(first.body.picks.posts[0].id,1);
    assert.equal(second.body.picks.posts[0].id,2);
  } finally {f.sqlite.close();}
});

test('home translation and ticker normalization preserves legacy values and invalid-setting fallbacks', async () => {
  const cases = [
    ['{"strings":{"nav.home":"숨김","home.title":{"ko":"한글"},"__proto__":{"x":1}}}', '["속보",{"ko":"새 소식"}]'],
    ['{"strings":[1],"nav.korea":1,"home.x":false}', '[]'],
    ['null', '{}'],
    ['{invalid', '[invalid'],
    ['{"home.surrogate":"\\ud83d"}', '["\\ud83d"]'],
    ['', ''],
  ];
  for (const [translations,ticker] of cases) {
    const before=fixture(),after=fixture();
    try {
      for(const f of [before,after]) {
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('translations',translations);
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('ticker',ticker);
      }
      const oldHome=await invoke(originalHome,before,'','/api/home');
      const newHome=await invoke(actualHome,after,'','/api/home');
      assert.deepEqual(newHome.body.translations,oldHome.body.translations,translations);
      assert.deepEqual(newHome.body.ticker,oldHome.body.ticker,ticker);
      assert.deepEqual(newHome.body.issues,oldHome.body.issues);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('homepage issue schema preserves legacy rows, migration retry and duplicate columns', async () => {
  const before=fixture(),after=fixture();
  try {
    for(const f of [before,after]) f.sqlite.exec("CREATE TABLE homepage_issues(id INTEGER PRIMARY KEY,title TEXT NOT NULL,status TEXT,severity TEXT,updated_at TEXT); INSERT INTO homepage_issues VALUES(1,'기존 장애','open','high','2026-01-01')");
    await ensureOriginalIssue(before.env);
    const prepare=after.env.DB.prepare.bind(after.env.DB);
    let fail=true;
    after.env.DB.prepare=sql=>{
      const stmt=prepare(sql);
      if (sql.includes('ADD COLUMN occurrence_count')) {
        const run=stmt.run.bind(stmt);
        stmt.run=async()=>{if(fail){fail=false;throw new Error('synthetic alter failure');} return run();};
      }
      return stmt;
    };
    await assert.rejects(ensureActualIssue(after.env));
    assert.equal(after.sqlite.prepare('SELECT title FROM homepage_issues WHERE id=1').get().title,'기존 장애');
    await ensureActualIssue(after.env);
    await ensureActualIssue(after.env);
    const cols=f=>JSON.parse(JSON.stringify(f.sqlite.prepare('PRAGMA table_info(homepage_issues)').all()));
    assert.deepEqual(cols(after),cols(before));
    assert.equal(after.sqlite.prepare('SELECT occurrence_count FROM homepage_issues WHERE id=1').get().occurrence_count,1);
    const priorPrepare=after.env.DB.prepare.bind(after.env.DB);
    let pragmaFailure=true;
    after.env.DB.prepare=sql=>{
      const stmt=priorPrepare(sql);
      if(sql.includes('PRAGMA table_info(homepage_issues)')) {const all=stmt.all.bind(stmt);stmt.all=async()=>{if(pragmaFailure){pragmaFailure=false;throw new Error('synthetic pragma failure');}return all();};}
      return stmt;
    };
    await ensureActualIssue(after.env);
    assert.equal(pragmaFailure,false);
    assert.equal(after.sqlite.prepare('SELECT title FROM homepage_issues WHERE id=1').get().title,'기존 장애');
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('rate limit schema readiness is isolated per D1 binding', async () => {
  const instances=[fixture(),fixture()];
  try {
    for (const f of instances) f.sqlite.exec('DROP TABLE api_rate_limit');
    const {enforceRateLimit}=await import('../functions/_shared/rate-limit.js?binding-isolation');
    for (const f of instances) {
      const options={route:'isolation',identity:'synthetic',limit:1,windowSeconds:60};
      assert.equal((await enforceRateLimit(f.env,options)).ok,true);
      assert.equal((await enforceRateLimit(f.env,options)).ok,false);
    }
    const retry=fixture();
    try {
      retry.sqlite.exec('DROP TABLE api_rate_limit');
      const prepare=retry.env.DB.prepare.bind(retry.env.DB);
      let fail=true;
      retry.env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('CREATE TABLE IF NOT EXISTS api_rate_limit')) {const run=stmt.run.bind(stmt);stmt.run=async()=>{if(fail){fail=false;throw new Error('synthetic schema failure')}return run()};}return stmt;};
      const options={route:'retry',identity:'synthetic',limit:1,windowSeconds:60};
      assert.equal((await enforceRateLimit(retry.env,options)).error,true);
      assert.equal((await enforceRateLimit(retry.env,options)).ok,true);
      assert.equal((await enforceRateLimit(retry.env,options)).ok,false);
    } finally {retry.sqlite.close();}
  } finally {for (const f of instances) f.sqlite.close();}
});

test('rate limit preserves fixed-window behavior, reset and fail-open response', async () => {
  const before=fixture(),after=fixture(), oldNow=Date.now;
  Date.now=()=>1700000100000;
  try {
    const output=[];
    for(const [f,rate] of [[before,oldRate],[after,actualRate]]) {
      const results=[];
      const options={route:'synthetic',identity:'user',limit:3,windowSeconds:60};
      for(let i=0;i<5;i++) results.push(await rate(f.env,options));
      const first=f.sqlite.prepare("SELECT count,window_start_at FROM api_rate_limit WHERE bucket_key='synthetic:user'").get();
      f.sqlite.prepare("UPDATE api_rate_limit SET window_start_at=? WHERE bucket_key='synthetic:user'").run(1700000040);
      results.push(await rate(f.env,options));
      const second=f.sqlite.prepare("SELECT count,window_start_at FROM api_rate_limit WHERE bucket_key='synthetic:user'").get();
      output.push({results,first:{...first},second:{...second}});
    }
    assert.deepEqual(output[1],output[0]);
    assert.deepEqual(output[1].results.map(r=>r.ok),[true,true,true,false,false,true]);
    const prepare=after.env.DB.prepare.bind(after.env.DB);
    after.env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('INSERT INTO api_rate_limit')) stmt.first=async()=>{throw new Error('synthetic rate failure');};return stmt;};
    assert.deepEqual(await actualRate(after.env,{route:'failed',identity:'u',limit:4,windowSeconds:30}),{ok:true,remaining:4,windowSeconds:30,error:true});
    assert.deepEqual(await actualRate(null,{route:'x',identity:'u',limit:4,windowSeconds:30}),{ok:true,remaining:4});
  } finally {Date.now=oldNow;before.sqlite.close();after.sqlite.close();}
});

test('operational event schema and writes match legacy across channels and failures', async () => {
  const before=fixture(),after=fixture();
  try {
    const cyclic={}; cyclic.self=cyclic;
    const payloads=[{}, {channel:'dreampath',type:'dreampath_login_failed',level:'warn',actor:' 합성사용자 ',ip:'192.0.2.5',path:'/api/dreampath/auth',message:' 로그인 실패 ',details:{source:'합성',nested:['하나',2]}}, {channel:'admin',type:'x'.repeat(100),message:'긴 문자열'.repeat(100),details:cyclic}, {channel:'site',type:'unicode-boundary',message:'가'.repeat(499)+'😀'}];
    for(const [f,ensure,write] of [[before,oldOpsEnsure,oldOps],[after,actualOpsEnsure,actualOps]]) {
      await ensure(f.env);
      await ensure(f.env);
      for(const payload of payloads) assert.equal(await write(f.env,payload),true);
    }
    const schema=f=>JSON.parse(JSON.stringify(f.sqlite.prepare('PRAGMA table_info(operational_events)').all()));
    const rows=f=>JSON.parse(JSON.stringify(f.sqlite.prepare('SELECT channel,type,level,actor,ip,path,message,details FROM operational_events ORDER BY id').all()));
    assert.deepEqual(schema(after),schema(before));
    assert.deepEqual(rows(after),rows(before));
    const indexes=f=>f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='operational_events' ORDER BY name").all().map(row=>row.name);
    assert.deepEqual(indexes(after),indexes(before));
    const prepare=after.env.DB.prepare.bind(after.env.DB);
    after.env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.startsWith('INSERT INTO operational_events')) stmt.run=async()=>{throw new Error('synthetic log write failure');};return stmt;};
    assert.equal(await actualOps(after.env,{type:'failure'}),false);
    assert.equal(after.sqlite.prepare('SELECT COUNT(*) AS n FROM operational_events').get().n,4);
    assert.equal(await actualOps(null,{}),false);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust homepage issue lookup preserves deduplication and severity upgrades', async () => {
  const before=fixture(),after=fixture();
  try {
    const results=[];
    for(const [f,record] of [[before,originalIssue],[after,actualIssue]]) {
      const issue={title:'합성 이슈',issue_type:'error',area:'homepage',severity:'low',source_path:'/api/home',summary:'첫 기록',occurred_at:'2026-01-01 00:00:00'};
      const first=await record(f.env,issue);
      const second=await record(f.env,{...issue,severity:'high',summary:'다시 발생',occurred_at:'2026-01-02 00:00:00'});
      const separate=await record(f.env,{...issue,source_path:'/different'});
      results.push([first,second,separate].map(({created_at,updated_at,...rest})=>rest));
    }
    assert.deepEqual(results[1],results[0]);
    assert.equal(results[1][1].occurrence_count,2);
    assert.equal(results[1][1].severity,'high');
    assert.notEqual(results[1][2].id,results[1][0].id);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('recent issue count only selects matching active issues inside ten minutes', async () => {
  const f=fixture();
  try {
    f.sqlite.exec("CREATE TABLE homepage_issues(source_path TEXT,status TEXT,last_seen_at TEXT,updated_at TEXT,occurrence_count INTEGER); INSERT INTO homepage_issues VALUES('/a','open',datetime('now','-2 minutes'),datetime('now','-2 minutes'),2),('/a','monitoring',datetime('now','-1 minute'),datetime('now','-1 minute'),4),('/a','resolved',datetime('now'),datetime('now'),99),('/a','open',datetime('now','-20 minutes'),datetime('now'),88),('/b','open',datetime('now'),datetime('now'),77)");
    const context={env:f.env,request:{url:'https://synthetic.invalid/'}};
    for(const [sourcePath,count] of [['/a',4],['/b',77],['/missing',null]]) {
      const response=await queryRust(context,'homepage-issue-recent',{sourcePath});
      assert.equal(response.status,200);
      const {row}=await response.json();
      assert.equal(row?.occurrence_count ?? null,count);
    }
    f.sqlite.exec('DROP TABLE homepage_issues');
    assert.equal((await queryRust(context,'homepage-issue-recent',{sourcePath:'/a'})).status,500);
  } finally {f.sqlite.close();}
});

test('home returns a JSON error even when diagnostic storage is unavailable', async () => {
  const response=await actualHome({env:{DB:{prepare(){throw new Error('synthetic diagnostics unavailable');}}},request:{url:'invalid synthetic URL',headers:new Headers()}});
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'Database error'});
});

test('Rust homepage issue writes surface database failures without changing records', async () => {
  const f=fixture();
  try {
    const issue={title:'합성 오류',issue_type:'error',severity:'low',area:'homepage',source_path:'/api/home'};
    const first=await actualIssue(f.env,issue);
    f.sqlite.exec("CREATE TRIGGER reject_issue_update BEFORE UPDATE ON homepage_issues BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await assert.rejects(actualIssue(f.env,{...issue,severity:'high'}));
    const saved=f.sqlite.prepare('SELECT severity, occurrence_count FROM homepage_issues WHERE id=?').get(first.id);
    assert.equal(saved.severity,'low');
    assert.equal(saved.occurrence_count,1);
  } finally {f.sqlite.close();}
});


test('Rust admin issue list and status updates preserve legacy responses and access', async () => {
  const before=fixture(),after=fixture();
  try {
    for(const f of [before,after]) {
      await actualIssue(f.env,{title:'합성 위험',issue_type:'risk',severity:'high',area:'ui',source_path:'/synthetic',occurred_at:'2026-01-01 00:00:00'});
      await actualIssue(f.env,{title:'다른 사례',issue_type:'issue',severity:'low',area:'homepage',status:'monitoring',occurred_at:'2026-01-01 00:00:00'});
      f.sqlite.exec("UPDATE homepage_issues SET created_at='2026-01-01 00:00:00',updated_at='2026-01-01 00:00:00'");
    }
    const token=await createToken(secret,{role:'full'});
    const headers={Cookie:'admin_token='+token,'Content-Type':'application/json'};
    for(const query of ['', '?q=합성','?status=monitoring','?status=missing','?limit=1','?q=%25']) {
      const results=[];
      for(const [f,handler] of [[before,originalIssuesList],[after,actualIssuesList]]) {
        const r=await handler({env:f.env,request:new Request('https://synthetic.invalid/api/admin/homepage-issues'+query,{headers})});
        results.push([r.status,await r.json()]);
      }
      assert.deepEqual(results[1],results[0],query);
    }
    for(const status of ['monitoring','monitoring','bad','open']) {
      const results=[];
      for(const [f,handler] of [[before,originalIssuePatch],[after,actualIssuePatch]]) {
        const r=await handler({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/admin/homepage-issues/1',{method:'PATCH',headers,body:JSON.stringify({status})})});
        results.push([r.status,await r.json()]);
      }
      assert.deepEqual(results[1],results[0],status);
    }
    const denied=await actualIssuesList({env:after.env,request:new Request('https://synthetic.invalid/api/admin/homepage-issues')});
    assert.equal(denied.status,401);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust site history merge preserves deduplication, stable ties and groups', async () => {
  const f=fixture();
  try {
    const entries=[
      {item:{id:'op',kind:'operational',entity_id:3,entity_action:'update',group:'content'},time:10},
      {item:{id:'setting-op',kind:'operational',entity_id:'hero',entity_action:'settings_change',group:'settings'},time:10},
      {item:{id:'post',kind:'post_history',entity_id:3,entity_action:'update',group:'content'},time:20},
      {item:{id:'setting',kind:'settings_history',entity_id:'hero',group:'settings'},time:20},
      {item:{id:'other',kind:'post_history',entity_id:3,entity_action:'create',group:'content'},time:10},
      {item:{id:'unknown-time',kind:'homepage_issue',group:'error'},time:0},
    ];
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'site-history-merge',{entries,limit:3});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.deepEqual(result.items.map(item=>item.id),['op','setting-op','other']);
    assert.deepEqual(result.groups,{error:0,issue:0,auth:0,settings:1,content:2});
    const settings=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'site-history-merge',{
      entries:[{settings:{id:8,key:' tags ',value:'İΣ 합성',saved_at:'2026-01-02 00:00:00'},time:1}],limit:1,
    });
    assert.equal(settings.status,200);
    const item=(await settings.json()).items[0];
    assert.equal(item.title,'글머리 태그 설정 변경');
    assert.equal(item.entity_id,'tags');
    assert.equal(item.search_text,('tags 글머리 태그 İΣ 합성').toLowerCase());
    const posts=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'site-history-merge',{
      entries:[{post:{row:{id:9,post_id:3,action:' status ',summary:' 요약 İΣ ',created_at:'2026-01-01'},current:{title:' 제목 ',category:'korea'}},time:1}],limit:1,
    });
    assert.equal(posts.status,200);
    const post=(await posts.json()).items[0];
    assert.equal(post.title,'제목');
    assert.equal(post.problem,'게시글 상태 변경 · 제목');
    assert.equal(post.suspected_cause,'요약 İΣ');
    assert.equal(post.search_text,('status 제목  요약 İΣ  korea /post/3').toLowerCase());
    const issues=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'site-history-merge',{
      entries:[{issue:{id:4,title:'문제 İΣ',issue_type:'error',severity:'high',status:'open',area:'api',summary:'',impact:'영향',cause:'',action_items:'확인',source_path:'/api/test',reporter:'합성',updated_at:'2026-01-01'},time:1}],limit:1,
    });
    assert.equal(issues.status,200);
    const issue=(await issues.json()).items[0];
    assert.equal(issue.group,'error');
    assert.equal(issue.problem,'영향');
    assert.equal(issue.detail,'/api/test · 확인');
    assert.equal(issue.search_text,('문제 İΣ  영향  확인 /api/test 합성 api open').toLowerCase());
    const ops=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'site-history-merge',{
      entries:[{operational:{row:{id:8,type:'post_updated',level:'info',channel:'admin',path:'/api/posts/3',actor:'합성',message:'변경 İΣ',created_at:'2026-01-01'},details:{stack:'스택'},meta:{post_id:3,revision:'2'}},time:1}],limit:1,
    });
    assert.equal(ops.status,200);
    const op=(await ops.json()).items[0];
    assert.equal(op.title,'게시글 수정');
    assert.equal(op.entity_id,3);
    assert.equal(op.entity_action,'update');
    assert.equal(op.detail,'/api/posts/3 · actor=합성 · revision=2');
    assert.equal(op.search_text,('post_updated 변경 İΣ /api/posts/3 합성 post 스택').toLowerCase());
  } finally { f.sqlite.close(); }
});

test('Rust site history sources preserve merged ordering, deduplication and partial failures', async () => {
  for (const partial of [false,true]) {
    const before=fixture(),after=fixture();
    try {
      for (const f of [before,after]) {
        await actualIssue(f.env,{title:'합성 오류',issue_type:'error',severity:'high',area:'api',source_path:'/api/test',occurred_at:'2026-01-01 00:00:00'});
        f.sqlite.exec("UPDATE homepage_issues SET created_at='2026-01-01 00:00:00',updated_at='2026-01-01 00:00:00'");
        f.sqlite.exec("CREATE TABLE operational_events(id INTEGER PRIMARY KEY,channel TEXT,type TEXT,level TEXT,actor TEXT,ip TEXT,path TEXT,message TEXT,details TEXT,created_at TEXT); INSERT INTO operational_events VALUES(1,'admin','settings_change','info','editor','','/api/settings/hero','설정 변경','{\"key\":\"hero\"}','2026-01-03 00:00:00')");
        f.sqlite.exec("INSERT INTO operational_events VALUES(2,'site','post_updated','info','합성','','/api/posts/3','변경 İΣ','{\"meta\":{\"post_id\":3,\"revision\":\"2\"},\"stack\":\"스택\"}','2026-01-03 00:00:00'),(3,'site','api_error','error','합성','','/api/test','실패',NULL,'2026-01-02 00:00:00')");
        if(!partial) f.sqlite.exec("CREATE TABLE settings_history(id INTEGER PRIMARY KEY,key TEXT,value TEXT,saved_at TEXT); INSERT INTO settings_history VALUES(1,'hero','{}','2026-01-02 00:00:00'),(2,' tags ','İΣ 테스트','2026-01-02 00:00:00'),(3,'unknown_key',NULL,'2026-01-02 00:00:00'),(4,'constructor','legacy','2026-01-02 00:00:00')");
        f.sqlite.exec("DROP TABLE post_history; CREATE TABLE post_history(id INTEGER PRIMARY KEY,post_id INTEGER,action TEXT,summary TEXT,before_snapshot TEXT,after_snapshot TEXT,created_at TEXT); INSERT INTO post_history VALUES(1,3,'update','수정',NULL,'{\"title\":\"합성 기사\",\"category\":\"korea\"}','2026-01-04 00:00:00'),(2,4,' status ',' 요약 İΣ ',NULL,'{\"title\":\" 제목 \",\"category\":\"apr\"}','2026-01-03 00:00:00'),(3,5,'constructor','구형',NULL,'{\"title\":\"구형 이력\"}','2026-01-02 00:00:00')");
      }
      const combined=await queryRust({env:after.env,request:{url:'https://synthetic.invalid/'}},'site-history-sources',{limit:300});
      assert.equal(combined.status,200);
      const sources=await combined.json();
      assert.equal(!!sources.settings.failed,partial);
      assert.equal(sources.operational.failed,undefined);
      assert.equal(sources.issues.failed,undefined);
      assert.equal(sources.posts.failed,undefined);
      const headers={Cookie:'admin_token='+await createToken(secret,{role:'full'})};
      for(const suffix of ['','?limit=1','?limit=9999']) {
        const values=[];
        for(const [f,handler] of [[before,originalHistory],[after,actualHistory]]) {
          const response=await handler({env:f.env,request:new Request('https://synthetic.invalid/api/admin/site-history'+suffix,{headers})});
          values.push([response.status,await response.json()]);
        }
        assert.deepEqual(values[1],values[0],suffix);
        assert.equal(values[1][1].partial,partial);
        assert.equal(values[1][1].sources.settings,!partial);
        assert.equal(values[1][1].items[0].kind,'operational');
      }
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('post view record and counter roll back together on database failure', async () => {
  const f=fixture();
  try {
    const initial=f.sqlite.prepare('SELECT views FROM posts WHERE id=1').get().views;
    f.sqlite.exec("CREATE TRIGGER reject_post_view BEFORE UPDATE OF views ON posts WHEN OLD.id=1 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await assert.rejects(actualView(f.env,1,'synthetic-atomic-viewer'));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM post_views WHERE post_id=1 AND viewer_key='synthetic-atomic-viewer'").get().n,0);
    assert.equal(f.sqlite.prepare('SELECT views FROM posts WHERE id=1').get().views,initial);
    f.sqlite.exec('DROP TRIGGER reject_post_view');
    const results=await Promise.all(Array.from({length:5},()=>actualView(f.env,1,'synthetic-atomic-viewer')));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal(f.sqlite.prepare('SELECT views FROM posts WHERE id=1').get().views,initial+1);
  } finally {f.sqlite.close();}
});

test('post creation rolls back if its audit history cannot be stored', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sqlite.exec("CREATE TRIGGER reject_post_history BEFORE INSERT ON post_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const token=await createToken(secret,{role:'full'});
    const body={category:'korea',title:'이력 오류 합성 기사',content:'본문',subtitle:null,tag:null,meta_tags:null,special_feature:null,published:false};
    const response=await actualCreate({env:f.env,request:new Request('https://synthetic.invalid/api/posts',{method:'POST',headers:{Cookie:'admin_token='+token,'Content-Type':'application/json'},body:JSON.stringify(body)})});
    assert.equal(response.status,500);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE title='이력 오류 합성 기사'").get().n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history').get().n,0);
  } finally {f.sqlite.close();}
});

test('post updates and status changes roll back when history insertion or finalization fails', async () => {
  for(const method of ['PUT','PATCH']) for(const stage of ['INSERT','UPDATE']) {
    const f=fixture({role:'owner'});
    try {
      f.sqlite.exec(`CREATE TRIGGER reject_post_history_${stage.toLowerCase()} BEFORE ${stage} ON post_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`);
      const initial=f.sqlite.prepare('SELECT title,published,sort_order,updated_at FROM posts WHERE id=1').get();
      const token=await createToken(secret,{role:'full'});
      const body=method==='PUT'?{title:'변경 실패'}:{sort_order:123};
      const handler=method==='PUT'?actualPut:actualPatch;
      const response=await handler({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/posts/1',{method,headers:{Cookie:'admin_token='+token,'Content-Type':'application/json'},body:JSON.stringify(body)})});
      assert.equal(response.status,500,`${method} ${stage}`);
      assert.deepEqual(f.sqlite.prepare('SELECT title,published,sort_order,updated_at FROM posts WHERE id=1').get(),initial);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history').get().n,0);
    } finally {f.sqlite.close();}
  }
});

test('simultaneous post edits accept one revision and preserve one history snapshot', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sqlite.prepare("UPDATE posts SET updated_at='2099-01-01 00:00:00.000' WHERE id=1").run();
    const token=await createToken(secret,{role:'full'});
    const headers={Cookie:'admin_token='+token,'Content-Type':'application/json'};
    const responses=await Promise.all(['합성 A','합성 B'].map(title=>actualPut({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/posts/1',{method:'PUT',headers,body:JSON.stringify({title,expected_updated_at:'2099-01-01 00:00:00.000'})})})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const conflict=await responses.find(r=>r.status===409).json();
    assert.equal(conflict.code,'EDIT_CONFLICT');
    const row=f.sqlite.prepare('SELECT title,updated_at FROM posts WHERE id=1').get();
    assert(['합성 A','합성 B'].includes(row.title));
    assert(row.updated_at>'2099-01-01 00:00:00.000');
    assert.equal(conflict.server_updated_at,row.updated_at);
    const history=f.sqlite.prepare('SELECT before_snapshot,after_snapshot FROM post_history WHERE post_id=1').all();
    assert.equal(history.length,1);
    assert.equal(JSON.parse(history[0].after_snapshot).title,row.title);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM post_history WHERE after_snapshot LIKE 'post-history:%'").get().n,0);
  } finally {f.sqlite.close();}
});

test('status changes advance a future revision and reject stale editors', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sqlite.prepare("UPDATE posts SET updated_at='2099-01-01 00:00:00.000' WHERE id=1").run();
    const token=await createToken(secret,{role:'full'});
    const headers={Cookie:'admin_token='+token,'Content-Type':'application/json'};
    const status=await actualPatch({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/posts/1',{method:'PATCH',headers,body:JSON.stringify({sort_order:7})})});
    assert.equal(status.status,200);
    const newStamp=f.sqlite.prepare('SELECT updated_at FROM posts WHERE id=1').get().updated_at;
    assert(newStamp>'2099-01-01 00:00:00.000');
    const stale=await actualPut({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/posts/1',{method:'PUT',headers,body:JSON.stringify({title:'오래된 내용',expected_updated_at:'2099-01-01 00:00:00.000'})})});
    assert.equal(stale.status,409);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history').get().n,1);
  } finally {f.sqlite.close();}
});


test('scheduled publication does not publish a concurrently rescheduled article', async () => {
  const f=fixture({due:true});
  try {
    const race=sql=>{if(sql.startsWith('UPDATE posts SET published = 1')) f.sqlite.prepare("UPDATE posts SET publish_at='2999-01-01 00:00:00' WHERE id=38").run(); else f.state.beforeAll=race;};
    f.state.beforeAll=race;
    const result=await actualDue(f.env,null);
    assert.deepEqual(result.published,[]);
    const row=f.sqlite.prepare('SELECT published,publish_at FROM posts WHERE id=38').get();
    assert.equal(row.published,0);assert.equal(row.publish_at,'2999-01-01 00:00:00');
  } finally {f.sqlite.close();}
});

test('scheduled publication advances the revision to reject stale editing', async () => {
  const f=fixture({due:true,role:'owner'});
  try {
    f.sqlite.prepare("UPDATE posts SET updated_at='2099-01-01 00:00:00.000' WHERE id=38").run();
    const result=await actualDue(f.env,null);
    assert.equal(result.published[0].id,38);
    const stamp=f.sqlite.prepare('SELECT updated_at FROM posts WHERE id=38').get().updated_at;
    assert(stamp>'2099-01-01 00:00:00.000');
    const token=await createToken(secret,{role:'full'});
    const response=await actualPut({env:f.env,params:{id:'38'},request:new Request('https://synthetic.invalid/api/posts/38',{method:'PUT',headers:{Cookie:'admin_token='+token,'Content-Type':'application/json'},body:JSON.stringify({title:'오래된 편집',expected_updated_at:'2099-01-01 00:00:00.000'})})});
    assert.equal(response.status,409);
    assert.equal(f.sqlite.prepare('SELECT published FROM posts WHERE id=38').get().published,1);
  } finally {f.sqlite.close();}
});

test('article deletion rolls back related records on database failure and tolerates absent optional tables', async () => {
  for (const fail of [true, false]) {
    const f = fixture({ role: 'owner' });
    try {
      f.sqlite.exec("INSERT INTO calendar_events VALUES(1,1); INSERT INTO post_history(post_id,action) VALUES(1,'create')");
      if (fail) f.sqlite.exec("CREATE TRIGGER reject_like_delete BEFORE DELETE ON post_likes BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      else f.sqlite.exec('DROP TABLE calendar_events');
      const token = await createToken(secret, { role: 'full' });
      const response = await actualDelete({ params: { id: '1' }, request: new Request('https://synthetic.invalid/api/posts/1', { method: 'DELETE', headers: { Cookie: 'admin_token=' + token } }), env: f.env });
      assert.equal(response.status, fail ? 500 : 200);
      assert.equal(!!f.sqlite.prepare('SELECT id FROM posts WHERE id=1').get(), fail);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_views WHERE post_id=1').get().n, fail ? 1 : 0);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history WHERE post_id=1').get().n, fail ? 1 : 0);
      if (fail) assert.equal(f.sqlite.prepare('SELECT related_post_id FROM calendar_events WHERE id=1').get().related_post_id, 1);
    } finally { f.sqlite.close(); }
  }
});

test('deleting an article preserves hero options and retries concurrent hero edits', async () => {
  const f = fixture({ role: 'owner' });
  try {
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero', JSON.stringify({ manual_post_ids: [1, 2], manual_position: 'before_auto', custom: 'keep' }));
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_media', JSON.stringify({ 1: { zoom: 120 }, 2: { zoom: 130 } }));
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_interval', '8000');
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_rev', '1');
    const batch = f.env.DB.batch.bind(f.env.DB);
    let raced = false;
    f.env.DB.batch = async statements => {
      if (!raced && statements[0]?.args[0] === 'hero_rev') {
        raced = true;
        f.sqlite.prepare("UPDATE settings SET value=? WHERE key='hero'").run(JSON.stringify({ manual_post_ids: [1, 3], manual_position: 'before_auto', custom: 'concurrent' }));
        f.sqlite.prepare("UPDATE settings SET value='5' WHERE key='hero_rev'").run();
        f.sqlite.prepare("UPDATE settings SET value='9000' WHERE key='hero_interval'").run();
      }
      return batch(statements);
    };
    const token = await createToken(secret, { role: 'full' });
    const response = await actualDelete({ params: { id: '1' }, request: new Request('https://synthetic.invalid/api/posts/1', { method: 'DELETE', headers: { Cookie: 'admin_token=' + token } }), env: f.env });
    assert.equal(response.status, 200);
    assert.equal(raced, true);
    const settings = Object.fromEntries(f.sqlite.prepare("SELECT key,value FROM settings WHERE key LIKE 'hero%'").all().map(row => [row.key, row.value]));
    assert.deepEqual(JSON.parse(settings.hero), { manual_post_ids: [3], manual_position: 'before_auto', custom: 'concurrent' });
    assert.deepEqual(JSON.parse(settings.hero_media), { 2: { zoom: 130 } });
    assert.equal(settings.hero_interval, '9000');
    assert.equal(settings.hero_rev, '6');
  } finally { f.sqlite.close(); }
});


test('Rust home lead mode preserves manual and fallback behavior', async () => {
  for (const mode of ['manual', 'auto', 'unexpected', null]) {
    const f = fixture();
    try {
      if (mode === null) f.sqlite.prepare("DELETE FROM settings WHERE key='home_lead_mode'").run();
      else f.sqlite.prepare("UPDATE settings SET value=? WHERE key='home_lead_mode'").run(mode);
      assert.equal(await actualLeadMode(f.env), await originalLeadMode(f.env));
    } finally { f.sqlite.close(); }
  }
});

test('Rust hero settings preserve legacy formats and interval limits', async () => {
  for (const [hero, interval] of [
    ['1', '1000'], ['["2suffix",1,3]', '16000ms'],
    ['{"post_ids":["1",2],"manual_position":"before_auto"}', '4500ms'],
    ['{"manual_post_ids":[null,"-1",["2"],1],"post_ids":[3]}', 'invalid'],
    ['{broken', ''], ['[broken', '2000'], ['0', '0'],
    ['{"manual_post_ids":[1,1e999,2],"manual_position":"before_auto"}', '3000'],
    ['\ufeff{"manual_post_ids":[1,2],"manual_position":"before_auto"}\ufeff', '3000'],
    ['{"manual_post_ids":[{"toString":null},1],"manual_position":"before_auto"}', '3000'],
    ['{"manual_post_ids":[1,2,{"toString":null}],"manual_position":"before_auto"}', '3000'],
  ]) {
    const legacy = fixture(), rust = fixture();
    try {
      for (const f of [legacy, rust]) {
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero', hero);
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_interval', interval);
      }
      const before = await invoke(originalHome, legacy, '', '/api/home');
      const after = await invoke(actualHome, rust, '', '/api/home');
      assert.deepEqual(after.body.hero, before.body.hero, `${hero} / ${interval}`);
      assert.equal(after.body.issues.hero, before.body.issues.hero);
    } finally { legacy.sqlite.close(); rust.sqlite.close(); }
  }
});

test('Rust home hero media matches legacy device crops and malformed settings', async () => {
  for (const media of [
    '{bad', 'null', '[]',
    JSON.stringify({1:{fit:'contain',position_x:'-8px',position_y:135,zoom:200}}),
    JSON.stringify({1:{fit:'cover',position_x:12,position_y:24,zoom:80,desktop:{position_x:'75px',zoom:55},mobile:{position_y:'87px',zoom:145}}}),
    JSON.stringify({1:{desktop:[],mobile:null,position_x:[42],position_y:'bad',zoom:'73.9'}}),
    JSON.stringify({1:null,2:{fit:'contain'}}),
    '{"1":{"fit":"contain","position_x":1e999,"position_y":33}}',
  ]) {
    const legacy = fixture(), rust = fixture();
    try {
      for (const f of [legacy, rust]) {
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero', JSON.stringify({manual_post_ids:[1],manual_position:'before_auto'}));
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_media', media);
      }
      const before = await invoke(originalHome, legacy, '', '/api/home');
      const after = await invoke(actualHome, rust, '', '/api/home');
      assert.deepEqual(after.body.hero, before.body.hero, media);
    } finally { legacy.sqlite.close(); rust.sqlite.close(); }
  }
});

test('Rust home lead media matches legacy device crops and fallback settings', async () => {
  for (const media of [null, '{bad', 'null', '[]', '{"fit":"contain","position_x":1e999,"position_y":33}', JSON.stringify({fit:'contain',position_x:'-9px',position_y:101,zoom:160}), JSON.stringify({position_x:12,position_y:30,zoom:85,desktop:{zoom:65},mobile:{position_x:'80px',zoom:140}}), JSON.stringify({desktop:[],mobile:null,position_x:[42],zoom:'invalid'})]) {
    const legacy = fixture(), rust = fixture();
    try {
      for (const f of [legacy, rust]) if (media !== null) f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('home_lead_media', media);
      const before = await invoke(originalHome, legacy, '', '/api/home');
      const after = await invoke(actualHome, rust, '', '/api/home');
      assert.deepEqual(after.body.lead, before.body.lead, String(media));
    } finally { legacy.sqlite.close(); rust.sqlite.close(); }
  }
});


test('card news article query matches legacy filtering and rankings', async () => {
  const {onRequestGet:oldGet} = await import('./fixtures/rust-card-news-articles.js');
  const {onRequestGet:newGet} = await import('../functions/api/admin/card-news/articles.js');
  for (const query of ['?start=2020-01-01T00:00&end=2100-01-01T00:00', '?start=2020-01-01T00:00&end=2100-01-01T00:00&sort=likes&limit=5', '?start=2020-01-01T00:00&end=2100-01-01T00:00&sort=recent&category=korea', '?start=2020-01-01T00:00&end=2100-01-01T00:00&category=unknown&sort=bad']) {
    const legacy=fixture({role:'owner'}), rust=fixture({role:'owner'});
    try {
      const before=await invoke(oldGet,legacy,query,'/api/admin/card-news/articles');
      const after=await invoke(newGet,rust,query,'/api/admin/card-news/articles');
      assert.deepEqual(after,before,query);
      assert.equal(after.status,200);
      assert(!after.body.items.some(item=>item.id===37));
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});

test('Rust card news request parsing preserves KST defaults, categories and limit semantics',async t=>{
  const {onRequestGet:oldGet}=await import('./fixtures/rust-card-news-articles.js');
  const {onRequestGet:newGet}=await import('../functions/api/admin/card-news/articles.js');
  t.mock.method(Date,'now',()=>Date.parse('2026-10-29T03:02:05Z'));
  for(const query of ['', '?start=invalid&end=invalid&limit=-3', '?start=2020-01-01%2000:00&end=2100-01-01T00:00:21&sort=LIKES&category=KOREA&limit=4.9', '?start=2020-01-01T00:00&end=2100-01-01T00:00&limit=1000&category=unknown', '?start=2020-01-01T00:00&end=2100-01-01T00:00&limit=1e3&sort=RECENT', '?start=2020-01-01T00:00T00&end=2100-01-01T00:00&sort=%C4%B0']) {
    const before=fixture({role:'owner'}),after=fixture({role:'owner'});
    try {assert.deepEqual(await invoke(newGet,after,query,'/api/admin/card-news/articles'),await invoke(oldGet,before,query,'/api/admin/card-news/articles'),query);}
    finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust card news excerpts match legacy editor blocks, limits and compatibility fallback',async()=>{
  const {onRequestGet:oldGet}=await import('./fixtures/rust-card-news-articles.js');
  const {onRequestGet:newGet}=await import('../functions/api/admin/card-news/articles.js');
  const cases=[['',true],['<p>가 &amp; 나&nbsp;&lt;다&gt;</p>',true],['{invalid',true],[JSON.stringify({blocks:[{data:{text:'<b>제목</b> &amp; 설명'}},{data:{items:['하나',{content:'<i>둘</i>'},{content:7},null]}}]}),true],[JSON.stringify({blocks:[{data:{text:'\ud800'}}]}),false],['가'.repeat(399)+'😀끝',false],[JSON.stringify({blocks:[]}),true]];
  for(const [content,projected] of cases) {
    const legacy=fixture({role:'owner'}),rust=fixture({role:'owner'});
    try {
      for(const f of [legacy,rust]) {f.sqlite.exec('DELETE FROM posts WHERE id != 1');f.sqlite.prepare("UPDATE posts SET content=?,published=1,category='korea',publish_at='2026-01-01 00:00:00' WHERE id=1").run(content);}
      const query='?start=2020-01-01T00:00&end=2100-01-01T00:00';
      assert.deepEqual(await invoke(newGet,rust,query,'/api/admin/card-news/articles'),await invoke(oldGet,legacy,query,'/api/admin/card-news/articles'));
      const response=await queryRust({env:rust.env,request:{url:'https://synthetic.invalid/'}},'card-news-articles',{sort:'views',category:null,start:'2020-01-01 00:00:00',end:'2100-01-01 00:00:00',limit:30,project:true});
      assert.equal(response.status,200);assert.equal((await response.json()).projected,projected);
    } finally {legacy.sqlite.close();rust.sqlite.close();}
  }
});


test('Rust AI usage queries match legacy periods, token fallback and chart ranges', async t => {
  const {onRequestGet:oldGet}=await import('./fixtures/rust-ai-usage.js');
  const {onRequestGet:newGet}=await import('../functions/api/admin/ai-usage.js');
  const fixed=Date.parse('2026-10-29T03:00:00Z');
  const clock=t.mock.method(Date,'now',()=>fixed);
  try {
    for (const suffix of ['?days=14','?start=2026-10-01&end=2026-10-29','?days=invalid','?start=2026-10-29&end=2026-10-29','?days=365']) {
      const before=fixture({role:'owner'}),after=fixture({role:'owner'});
      try {
        for (const f of [before,after]) {
          f.sqlite.exec('CREATE TABLE ai_usage_log(id INTEGER PRIMARY KEY,created_at INTEGER,endpoint TEXT,model TEXT,status TEXT,error_code TEXT,input_chars INTEGER,output_chars INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,total_tokens INTEGER,latency_ms INTEGER)');
          f.sqlite.prepare('INSERT INTO ai_usage_log VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(1,fixed/1000-60,'score','synthetic','success',null,100,50,10,5,15,200);
          f.sqlite.prepare('INSERT INTO ai_usage_log VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(2,fixed/1000-86400*2,'draft','synthetic','error','synthetic',80,20,0,0,0,400);
          f.sqlite.prepare('INSERT INTO ai_usage_log VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(3,fixed/1000-120,'draft','synthetic','success',null,1234,567,0,0,0,123);
        }
        assert.deepEqual(await invoke(newGet,after,suffix,'/api/admin/ai-usage'),await invoke(oldGet,before,suffix,'/api/admin/ai-usage'),suffix);
      } finally {before.sqlite.close();after.sqlite.close();}
    }
    const before=fixture({role:'owner'}),after=fixture({role:'owner'});
    try {
      for(const f of [before,after]) f.sqlite.exec('CREATE TABLE ai_usage_log(id INTEGER PRIMARY KEY,created_at INTEGER,endpoint TEXT,model TEXT,status TEXT,error_code TEXT,input_chars INTEGER,output_chars INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,total_tokens INTEGER,latency_ms INTEGER)');
      assert.deepEqual(await invoke(newGet,after,'?days=14','/api/admin/ai-usage'),await invoke(oldGet,before,'?days=14','/api/admin/ai-usage'));
    } finally {before.sqlite.close();after.sqlite.close();}
  } finally {clock.mock.restore();}
});


test('Rust AI score history matches legacy filters, pagination and overall statistics', async t => {
  const {onRequestGet:oldGet}=await import('./fixtures/rust-ai-score-history.js');
  const {onRequestGet:newGet}=await import('../functions/api/admin/ai-score-history.js');
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const clock=t.mock.method(Date,'now',()=>Date.parse('2026-10-29T03:00:00Z'));
  try {
    for (const query of ['', '?q=합성&grade=A&min_score=80&limit=1', '?q=%25&offset=1&limit=2', '?grade=invalid&min_score=150', '?q=합성&limit=1&offset=99', '?limit=1&offset=1']) {
      const before=fixture({role:'owner'}),after=fixture({role:'owner'});
      try {
        for (const f of [before,after]) {
          f.sqlite.exec("CREATE TABLE ai_score_log(id INTEGER PRIMARY KEY,created_at INTEGER,actor TEXT,input_title TEXT,input_subtitle TEXT,input_body_chars INTEGER,input_tags TEXT,overall_score INTEGER,overall_grade TEXT,overall_summary TEXT,improvement TEXT,revision_suggestion TEXT,categories_json TEXT,latency_ms INTEGER,total_tokens INTEGER,status TEXT,error_code TEXT); INSERT INTO ai_score_log VALUES(1,1793230000,'synthetic','합성 기사','',30,'',90,'A','합성 평가','','','[]',100,20,'success',NULL),(2,1793230001,'synthetic','다른 기사','',20,'',50,'C','평가','','','invalid',200,0,'error','synthetic')");
          const insert=f.sqlite.prepare('INSERT INTO ai_score_log(id,created_at,categories_json) VALUES(?,?,?)');
          [null,'',JSON.stringify([{name:'정확성',score:0}]),'{"value":null}','"\\ud800"','1e400'].forEach((value,i)=>insert.run(3+i,1793230010+i,value));
          [0,-1,'invalid',8640000000000].forEach((stamp,i)=>insert.run(9+i,stamp,null));
        }
        assert.deepEqual(await invoke(newGet,after,query,'/api/admin/ai-score-history'),await invoke(oldGet,before,query,'/api/admin/ai-score-history'),query);
        if (!query) {
          const response=await queryRust({env:after.env,request:new Request('https://synthetic.invalid/')},'ai-score-history',{kind:'list',q:'',grade:'',min_score:null,limit:30,offset:0});
          const rows=(await response.json()).rows;
          assert.deepEqual(rows.find(row=>row.id===5).categories,[{name:'정확성',score:0}]);
          assert.deepEqual(rows.find(row=>row.id===3).categories,[]);
          assert.equal(Object.hasOwn(rows.find(row=>row.id===2),'categories'),false);
          assert.equal(Object.hasOwn(rows.find(row=>row.id===8),'categories'),false);
        }
      } finally {before.sqlite.close();after.sqlite.close();}
    }
    const before=fixture({role:'owner'}),after=fixture({role:'owner'});
    try {
      for (const f of [before,after]) f.sqlite.exec('CREATE TABLE ai_score_log(id INTEGER PRIMARY KEY,created_at INTEGER,actor TEXT,input_title TEXT,input_subtitle TEXT,input_body_chars INTEGER,input_tags TEXT,overall_score INTEGER,overall_grade TEXT,overall_summary TEXT,improvement TEXT,revision_suggestion TEXT,categories_json TEXT,latency_ms INTEGER,total_tokens INTEGER,status TEXT,error_code TEXT)');
      assert.deepEqual(await invoke(newGet,after,'','/api/admin/ai-score-history'),await invoke(oldGet,before,'','/api/admin/ai-score-history'));
    } finally {before.sqlite.close();after.sqlite.close();}
  } finally {clock.mock.restore();}
});


test('Rust AI usage and score logs preserve legacy fields and failure behavior', async t => {
  const {logAiUsage:oldUsage}=await import('./fixtures/rust-ai-usage-log.js');
  const {logAiUsage:newUsage}=await import('../functions/_shared/ai-usage.js');
  const {logAiScore:oldScore}=await import('./fixtures/rust-ai-score-log.js');
  const {logAiScore:newScore}=await import('../functions/_shared/ai-score-log.js');
  const clock=t.mock.method(Date,'now',()=>Date.parse('2026-10-29T03:00:00Z'));
  const before=fixture(),after=fixture();
  try {
    for (const f of [before,after]) f.sqlite.exec("CREATE TABLE ai_usage_log(created_at INTEGER,endpoint TEXT,model TEXT,ip TEXT,actor TEXT,input_chars INTEGER,output_chars INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,total_tokens INTEGER,latency_ms INTEGER,status TEXT,error_code TEXT); CREATE TABLE ai_score_log(created_at INTEGER,actor TEXT,ip TEXT,input_title TEXT,input_subtitle TEXT,input_body_chars INTEGER,input_tags TEXT,overall_score INTEGER,overall_grade TEXT,overall_summary TEXT,improvement TEXT,revision_suggestion TEXT,categories_json TEXT,latency_ms INTEGER,total_tokens INTEGER,status TEXT,error_code TEXT)");
    const usage={endpoint:'score-article',model:'synthetic',actor:'synthetic',ip:'synthetic',inputChars:100,outputChars:50,status:'ok'};
    const score={actor:'synthetic',inputTitle:'합성 기사',inputBodyChars:100,overallScore:87,overallGrade:'A',categories:[{label:'합성'}],status:'success'};
    await oldUsage(before.env,usage); await newUsage(after.env,usage);
    await oldScore(before.env,score); await newScore(after.env,score);
    assert.deepEqual(after.sqlite.prepare('SELECT * FROM ai_usage_log').all(),before.sqlite.prepare('SELECT * FROM ai_usage_log').all());
    assert.deepEqual(after.sqlite.prepare('SELECT * FROM ai_score_log').all(),before.sqlite.prepare('SELECT * FROM ai_score_log').all());
    after.sqlite.exec('DROP TABLE ai_usage_log; DROP TABLE ai_score_log');
    await assert.doesNotReject(newUsage(after.env,usage));
    await assert.doesNotReject(newScore(after.env,score));
  } finally {before.sqlite.close();after.sqlite.close();clock.mock.restore();}
});


test('Rust OG image preserves public-only lookup, crop and fallback', async t => {
  const {onRequestGet:oldGet}=await import('./fixtures/rust-og-image.js');
  const {onRequestGet:newGet}=await import('../functions/api/og-image/[id].js');
  const mock=t.mock.method(globalThis,'fetch',async (_url, options) => new Response('synthetic-image',{status:200,headers:{'Content-Type':'image/png','cf-resized':JSON.stringify(options.cf.image.gravity)}}));
  try {
    for (const id of ['1','2.jpg','37','999','invalid']) {
      const before=fixture(), after=fixture();
      try {
        for (const f of [before,after]) f.sqlite.prepare("UPDATE posts SET image_url='https://synthetic.invalid/image.png',image_frame=? WHERE id=1").run(JSON.stringify({x:25,y:70}));
        const output=[];
        for (const [f,handler] of [[before,oldGet],[after,newGet]]) {
          const response=await handler({env:f.env,params:{id},request:new Request('https://synthetic.invalid/api/og-image/'+id)});
          output.push({status:response.status,location:response.headers.get('location'),cache:response.headers.get('cache-control'),type:response.headers.get('content-type'),resized:response.headers.get('x-og-resized'),body:await response.text()});
        }
        assert.deepEqual(output[1],output[0],id);
      } finally {before.sqlite.close();after.sqlite.close();}
    }
  } finally {mock.mock.restore();}
});

test('featured limit is rechecked inside post create and edit transactions', async () => {
  for (const operation of ['create','update','status']) {
    const f=fixture({role:'owner'});
    try {
      f.sqlite.exec('UPDATE posts SET featured=0; UPDATE posts SET featured=1,published=1 WHERE id IN (1,2,3)');
      const originalBatch=f.env.DB.batch.bind(f.env.DB);
      let raced=false;
      f.env.DB.batch=async statements=>{
        if (!raced && statements.some(stmt=>stmt.sql.includes('abs(-9223372036854775808)'))) {
          raced=true;
          f.sqlite.exec('UPDATE posts SET featured=1,published=1 WHERE id=5');
        }
        return originalBatch(statements);
      };
      const token=await createToken(secret,{role:'full'});
      const headers={'Content-Type':'application/json',Cookie:'admin_token='+token};
      const body=operation==='create' ? {category:'korea',title:'동시 생성',content:'본문',subtitle:null,tag:null,meta_tags:null,special_feature:null,published:true,featured:true} : operation==='update' ? {title:'합성 수정',featured:true} : {featured:true};
      const method=operation==='create'?'POST':operation==='update'?'PUT':'PATCH';
      const path=operation==='create'?'/api/posts':'/api/posts/4';
      const handler=operation==='create'?actualCreate:operation==='update'?actualPut:actualPatch;
      const response=await handler({env:f.env,params:{id:'4'},request:new Request('https://synthetic.invalid'+path,{method,headers,body:JSON.stringify(body)})});
      assert.equal(raced,true,operation+' status='+response.status+' body='+await response.clone().text());
      assert.equal(response.status,409,operation);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE featured=1 AND published=1').get().n,4);
      assert.equal(f.sqlite.prepare('SELECT featured FROM posts WHERE id=4').get().featured,0);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history').get().n,0);
    } finally {f.sqlite.close();}
  }
});
