import { resolveScoreHistoryFiltersLegacy, resolveScoreHistoryFiltersRust } from '../functions/api/admin/ai-score-history.js';
import { resolveAiUsageRangeLegacy, resolveAiUsageRangeRust } from '../functions/api/admin/ai-usage.js';
import { assembleOperationsLegacy, assembleOperationsRust } from '../functions/api/admin/operations.js';
import { COUNTRY_NAME_KO_MAP, COUNTRY_NAME_ALIAS_MAP } from '../functions/_shared/country-name-ko.js';
import { sanitizeWosmMembersItems, sanitizeWosmMembersItemsRust, normalizeWosmMembersResponse, normalizeWosmMembersResponseRust, normalizeWosmFieldsRust, normalizeWosmMembersColumns, normalizeWosmMembersColumnsRust, DEFAULT_WOSM_MEMBERS, normalizeWosmImportMapping, normalizeWosmPublicCopy, normalizeWosmRegisteredCount } from '../functions/_shared/wosm-members.js';
import { normalizeScoreRubric, normalizeScoreRubricRust } from '../functions/_shared/score-rubric.js';
import { validateCommentSubmission, validateCommentSubmissionRust } from '../functions/_shared/memorabilia-comments.js';
import { normalizeImageFrame, normalizeImageFrameRust, serializeImageFrameForStore, serializeImageFrameForStoreRust } from '../functions/_shared/image-frame.js';
import { recordPostHistory } from '../functions/_shared/post-history.js';
import { sanitizeCalendarCopy, DEFAULT_CALENDAR_COPY } from '../functions/_shared/calendar-copy.js';
import { sanitizeCalendarCopy as oldSanitizeCalendarCopy } from './fixtures/rust-settings/calendar-copy-shared.js';
import { recordPostHistory as oldRecordPostHistory } from './fixtures/rust-posts/post-history-helper.js';
import { onRequestPost as postLike } from '../functions/api/posts/[id]/like.js';
import { onRequestPut as postReorder, onRequestDelete as postReset } from '../functions/api/posts/reorder.js';
import { onRequestPut as oldPostReorder, onRequestDelete as oldPostReset } from './fixtures/rust-posts/reorder.js';
import { onRequestGet as postHistory } from '../functions/api/posts/[id]/history.js';
import { onRequestGet as oldPostHistory } from './fixtures/rust-posts/history.js';
import { onRequestGet as postCover } from '../functions/api/posts/[id]/image.js';
import { onRequestGet as oldPostCover } from './fixtures/rust-posts/image.js';
import { onRequestGet as searchMemorabilia } from '../functions/api/memorabilia/search.js';
import { onRequestGet as oldSearchMemorabilia } from './fixtures/rust-memorabilia/search-api.js';
import { suggestIssuers, suggestTags } from '../functions/_shared/memorabilia-store.js';
import { onRequestGet as memoAutocomplete } from '../functions/api/memorabilia/autocomplete.js';
import { onRequestGet as oldMemoAutocomplete } from './fixtures/rust-memorabilia-autocomplete.js';
import { suggestIssuers as oldSuggestIssuers, suggestTags as oldSuggestTags } from './fixtures/rust-memorabilia/store.js';
import { onRequestPost as memoReplace } from '../functions/api/memorabilia/bulk-replace.js';
import { onRequestPost as oldMemoReplace } from './fixtures/rust-memorabilia/bulk-replace.js';
import { syncFtsForId } from '../functions/_shared/memorabilia-store.js';
import { onRequestPost as memoBulk } from '../functions/api/memorabilia/bulk-update.js';
import { onRequestPost as oldMemoBulk } from './fixtures/rust-memorabilia/bulk-update.js';
import { onRequestGet as adminComments } from '../functions/api/admin/memorabilia-comments.js';
import { onRequestPatch as adminCommentPatch } from '../functions/api/admin/memorabilia-comments/[id].js';
import { onRequestGet as oldAdminComments } from './fixtures/rust-memorabilia/admin-comments.js';
import { onRequestPatch as oldAdminCommentPatch } from './fixtures/rust-memorabilia/admin-comment-id.js';
import { onRequestGet as memoCommentsGet, onRequestPost as memoCommentsPost } from '../functions/api/memorabilia/[id]/comments.js';
import { onRequestGet as oldMemoCommentsGet, onRequestPost as oldMemoCommentsPost } from './fixtures/rust-memorabilia/comments.js';
import { onRequestPost as memoCommentDelete } from '../functions/api/memorabilia/comments/[id]/delete.js';
import { onRequestPost as oldMemoCommentDelete } from './fixtures/rust-memorabilia/comment-delete.js';
import { recordUniqueMemorabiliaView } from '../functions/_shared/engagement.js';
import { onRequestGet as memoLikeGet, onRequestPost as memoLikePost } from '../functions/api/memorabilia/[id]/like.js';
import { onRequestGet as oldMemoLikeGet, onRequestPost as oldMemoLikePost } from './fixtures/rust-memorabilia/like.js';
import { onRequestGet as memoView } from '../functions/api/memorabilia/[id]/view.js';
import { onRequestGet as oldMemoView } from './fixtures/rust-memorabilia/view.js';
import { onRequestGet as eventCsvGet, onRequestPost as eventCsvPost } from '../functions/api/memorabilia/events/csv.js';
import { onRequestGet as oldEventCsvGet, onRequestPost as oldEventCsvPost } from './fixtures/rust-memorabilia/events-csv.js';
import { onRequestPost as eventsBulk } from '../functions/api/memorabilia/events/bulk-update.js';
import { onRequestPost as oldEventsBulk } from './fixtures/rust-memorabilia/events-bulk.js';
import { listEvents, getEvent, createEvent, createEventWithSlug, updateEvent, deleteEvent, normalizeEventInput } from '../functions/_shared/memorabilia-events.js';
import { listEvents as oldListEvents, getEvent as oldGetEvent, createEvent as oldCreateEvent, updateEvent as oldUpdateEvent, deleteEvent as oldDeleteEvent, normalizeEventInput as oldNormalizeEvent, formatEventPeriod as oldPeriod, formatEventPeriodEn as oldPeriodEn } from './fixtures/rust-memorabilia/events-helper.js';
import { onRequestGet as eventCatsGet, onRequestPost as eventCatsPost } from '../functions/api/memorabilia/event-categories.js';
import { onRequestPatch as eventCatsPatch, onRequestDelete as eventCatsDelete } from '../functions/api/memorabilia/event-categories/[id].js';
import { onRequestGet as oldEventCatsGet, onRequestPost as oldEventCatsPost } from './fixtures/rust-memorabilia/event-categories.js';
import { onRequestPatch as oldEventCatsPatch, onRequestDelete as oldEventCatsDelete } from './fixtures/rust-memorabilia/event-category-id.js';
import { onRequestGet as categoriesGet, onRequestPost as categoriesPost } from '../functions/api/memorabilia/categories.js';
import { onRequestPatch as categoriesPatch, onRequestDelete as categoriesDelete } from '../functions/api/memorabilia/categories/[id].js';
import { onRequestGet as oldCategoriesGet, onRequestPost as oldCategoriesPost } from './fixtures/rust-memorabilia/categories.js';
import { onRequestPatch as oldCategoriesPatch, onRequestDelete as oldCategoriesDelete } from './fixtures/rust-memorabilia/category-id.js';
import './register-rust-wasm.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createToken } from '../functions/_shared/auth.js';
import { queryRust } from '../functions/_shared/rust-server.js';
import { COUNTRY_CODE_LABELS_KO } from '../functions/_shared/country-code-labels.js';
import { validateUpload, validateUploadRust } from '../functions/api/memorabilia/upload-image.js';
import { detectImageMagic, detectImageMagicRust, parseImageMimeRust, extractImageKeyFromUrl, extractImageKeyFromUrlRust, deleteStoredImageByUrl } from '../functions/_shared/image-storage.js';
import { normalizeDraftText, normalizeDraftTextRust, normalizeDraftFields } from '../functions/api/admin/drafts.js';
import { onRequestGet as publicMemoSlug } from '../functions/api/memorabilia/slug/[slug].js';
import { normalizeCalendarInput, calendarValues } from '../functions/_shared/calendar.js';
import { onRequestGet as oldGetBanner, onRequestPut as oldPutBanner } from './fixtures/rust-settings/board-banner.js';
import { onRequestGet as getBanner, onRequestPut as putBanner } from '../functions/api/settings/board-banner.js';
import { onRequestGet as oldGetEditors, onRequestPut as oldPutEditors } from './fixtures/rust-settings/editors.js';
import { onRequestGet as getEditors, onRequestPut as putEditors, normalizeEditorsRust } from '../functions/api/settings/editors.js';
import { onRequestGet as oldGetTranslations, onRequestPut as oldPutTranslations } from './fixtures/rust-settings/translations.js';
import { onRequestGet as getTranslations, onRequestPut as putTranslations } from '../functions/api/settings/translations.js';
import { onRequestGet as oldGetNav, onRequestPut as oldPutNav } from './fixtures/rust-settings/nav-labels.js';
import { onRequestGet as getNav, onRequestPut as putNav } from '../functions/api/settings/nav-labels.js';
import { onRequestGet as oldGetPostTags, onRequestPut as oldPutPostTags } from './fixtures/rust-settings/tags.js';
import { onRequestGet as getPostTags, onRequestPut as putPostTags, normalizeTagSettings, normalizeTagSettingsRust, tagSettingsPlanRust } from '../functions/api/settings/tags.js';
import { onRequestGet as oldGetBoardCopy, onRequestPut as oldPutBoardCopy } from './fixtures/rust-settings/board-copy.js';
import { onRequestGet as getBoardCopy, onRequestPut as putBoardCopy } from '../functions/api/settings/board-copy.js';
import { onRequestGet as oldGetSiteMeta, onRequestPut as oldPutSiteMeta } from './fixtures/rust-settings/site-meta.js';
import { onRequestGet as getSiteMeta, onRequestPut as putSiteMeta } from '../functions/api/settings/site-meta.js';
import { onRequestGet as oldGetDefinition, onRequestPut as oldPutDefinition } from './fixtures/rust-settings/feature-definition.js';
import { onRequestGet as getDefinition, onRequestPut as putDefinition } from '../functions/api/settings/feature-definition.js';
import { loadFeatureDefinition, DEFAULT_FEATURE_DEFINITION, normalizeFeatureDefinitionContent, isLegacyFeatureDefinition, analyzeFeatureDefinitionRust } from '../functions/_shared/feature-definition.js';
import { onRequestGet as oldGetPrivacy, onRequestPut as oldPutPrivacy, onRequestDelete as oldDeletePrivacy } from './fixtures/rust-settings/privacy-policy.js';
import { onRequestGet as getPrivacy, onRequestPut as putPrivacy, onRequestDelete as deletePrivacy } from '../functions/api/settings/privacy-policy.js';
import { readHomeLeadState as oldReadLead, commitHomeLeadState as oldCommitLead } from './fixtures/rust-home-lead-auto.js';
import { readHomeLeadState as readLead, commitHomeLeadState as commitLead } from '../functions/_shared/home-lead-auto.js';
import { onRequestGet as oldGetLead, onRequestPut as oldPutLead } from './fixtures/rust-settings/home-lead.js';
import { onRequestGet as getLead, onRequestPut as putLead } from '../functions/api/settings/home-lead.js';
import { onRequestGet as oldGetContributors, onRequestPut as oldPutContributors } from './fixtures/rust-settings/contributors.js';
import { onRequestGet as getContributors, onRequestPut as putContributors } from '../functions/api/settings/contributors.js';
import { onRequestGet as oldGetHero, onRequestPut as oldPutHero } from './fixtures/rust-settings/hero.js';
import { onRequestGet as getHero, onRequestPut as putHero } from '../functions/api/settings/hero.js';
import { onRequestGet as oldGetAuthor, onRequestPut as oldPutAuthor } from './fixtures/rust-settings/author.js';
import { onRequestGet as getAuthor, onRequestPut as putAuthor } from '../functions/api/settings/author.js';
import { onRequestGet as oldGetDisclaimer, onRequestPut as oldPutDisclaimer } from './fixtures/rust-settings/ai-disclaimer.js';
import { onRequestGet as getDisclaimer, onRequestPut as putDisclaimer } from '../functions/api/settings/ai-disclaimer.js';
import { onRequestGet as oldGetTicker, onRequestPut as oldPutTicker } from './fixtures/rust-settings/ticker.js';
import { onRequestGet as getTicker, onRequestPut as putTicker } from '../functions/api/settings/ticker.js';
import { onRequestGet as oldGetLayout, onRequestPut as oldPutLayout } from './fixtures/rust-settings/board-layout.js';
import { onRequestGet as getLayout, onRequestPut as putLayout, sanitizeGap, sanitizeGapRust } from '../functions/api/settings/board-layout.js';
import { onRequestGet as oldGetRubric, onRequestPut as oldPutRubric, onRequestDelete as oldDeleteRubric } from './fixtures/rust-settings/score-rubric.js';
import { onRequestGet as getRubric, onRequestPut as putRubric, onRequestDelete as deleteRubric } from '../functions/api/settings/score-rubric.js';
import { onRequestPut as oldPutWosm, onRequestGet as oldGetWosm } from './fixtures/rust-settings/wosm-members.js';
import { onRequestPut as oldPutReferences, onRequestGet as oldGetReferences } from './fixtures/rust-settings/reference-sites.js';
import { onRequestPut as putWosm, onRequestGet as getWosm } from '../functions/api/settings/wosm-members.js';
import { onRequestGet as oldGetTags, onRequestPut as oldPutTags } from './fixtures/rust-settings/calendar-tags.js';
import { onRequestGet as getTags, onRequestPut as putTags, normalizeCalendarTags, normalizeCalendarTagsRust } from '../functions/api/settings/calendar-tags.js';
import { onRequestGet as oldGetCopy, onRequestPut as oldPutCopy } from './fixtures/rust-settings/calendar-copy.js';
import { onRequestGet as getCopy, onRequestPut as putCopy } from '../functions/api/settings/calendar-copy.js';
import { onRequestPut as putReferences, onRequestGet as getReferences, sanitizeReferenceSites, sanitizeReferenceSitesRust } from '../functions/api/settings/reference-sites.js';
import { onRequestGet as getGlossary } from '../functions/api/glossary/index.js';
import { onRequestGet as getCalendar, onRequestPost as createCalendar } from '../functions/api/calendar/index.js';
import { onRequestGet as oldCalendar, onRequestPost as oldCreateCalendar } from './fixtures/rust-calendar/index.js';
import { onRequestPut as putCalendar, onRequestDelete as deleteCalendar } from '../functions/api/calendar/[id].js';
import { onRequestPut as oldPutCalendar, onRequestDelete as oldDeleteCalendar } from './fixtures/rust-calendar/detail.js';
import { onRequestPut as putGlossary } from '../functions/api/glossary/[id].js';
import { onRequestPatch as patchMemorabilia, onRequestGet as getMemorabilia } from '../functions/api/memorabilia/[id].js';
import { upsertMemorabiliaFtsRow as oldUpsertMemoFts } from './fixtures/rust-memorabilia/search.js';
import { upsertMemorabiliaFtsRow as upsertMemoFts, buildMemorabiliaFtsValues } from '../functions/_shared/memorabilia-search.js';
import { getMemorabiliaById as oldMemoId, getMemorabiliaBySlug as oldMemoSlug, createMemorabilia as oldCreateMemo, updateMemorabilia as oldUpdateMemo, deleteMemorabilia as oldDeleteMemo, normalizeMemorabiliaInput as oldNormalizeMemo } from './fixtures/rust-memorabilia/store.js';
import { getMemorabiliaById as memoId, getMemorabiliaBySlug as memoSlug, createMemorabilia as createMemo, updateMemorabilia as updateMemo, deleteMemorabilia as deleteMemo, normalizeMemorabiliaInput as normalizeMemo } from '../functions/_shared/memorabilia-store.js';
import { onRequestGet as oldListMemorabilia } from './fixtures/rust-memorabilia/index.js';
import { onRequestGet as listMemorabilia } from '../functions/api/memorabilia/index.js';
import { onRequestGet as listPosts } from '../functions/api/posts/index.js';

const SECRET = 'isolated-content-contracts-only-never-production';
function fixture(permissions = [], role = 'member') {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)');
  sqlite.exec('CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL)');
  sqlite.exec('CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,category TEXT)');
  const calendarSource = readFileSync(new URL('../server-rust/src/calendar.rs', import.meta.url), 'utf8');
  sqlite.exec(calendarSource.match(/CREATE TABLE IF NOT EXISTS calendar_events \([^"]+\)/)[0]);
  sqlite.exec('ALTER TABLE calendar_events ADD COLUMN target_groups TEXT');
  const user = { id: 77, role, status: 'active', username: 'synthetic_content', token_min_iat: 0, permissions: JSON.stringify({ access_admin: true, permissions }) };
  const state = { writes: [], batches: [], beforeBatch: null, beforeRun: null, failOnSql: null, failAllOnSql: null };
  const DB = Object.assign(new (class D1Database {})(), {
    prepare(sql) {
      let args = [];
      return {
        sql, get args() { return args; }, bind(...values) { args = values; return this; },
        async first() { if (sql.includes('FROM admin_users')) return user; if (state.forceRevision && (sql.includes("wosm_members_rev") || args[0] === 'reference_sites_rev' || args[0] === 'wosm_members_rev')) return {value:'0'}; return sqlite.prepare(sql).get(...args) || null; },
        async all() { if (state.failAllOnSql && state.failAllOnSql.test(sql)) throw new Error('synthetic read failure'); return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { state.writes.push(sql); if (state.beforeRun) { const hook=state.beforeRun; state.beforeRun=null; hook(sql); } const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      if (state.beforeBatch) { const hook=state.beforeBatch; state.beforeBatch=null; hook(); }
      const results = []; sqlite.exec('BEGIN');
      try {
        for (const statement of statements) {
          state.writes.push(statement.sql);
          if (state.failOnSql && state.failOnSql.test(statement.sql)) throw new Error('synthetic batch failure');
          if (/\bRETURNING\b/i.test(statement.sql) || /^\s*SELECT\b/i.test(statement.sql)) {
            const rows=sqlite.prepare(statement.sql).all(...statement.args);
            results.push({success:true,results:rows,meta:{changes:Number(sqlite.prepare('SELECT changes() AS n').get().n)}});
          } else {
            const result = sqlite.prepare(statement.sql).run(...statement.args);
            results.push({ success:true, meta:{changes:Number(result.changes)} });
          }
        }
        sqlite.exec('COMMIT'); state.batches.push(results.map(result => result.meta.changes)); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  });
  return { sqlite, state, env: { DB, ADMIN_SECRET: SECRET }, user };
}
async function request(f, path, body, method = 'PUT') {
  const token = await createToken(SECRET, { role: f.user.role === 'owner' ? 'full' : f.user.role, uid: f.user.id, username: f.user.username });
  return new Request('https://synthetic.invalid' + path, { method, headers: { Cookie: 'admin_token=' + token, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}
function seedMemorabilia(f) {
  f.sqlite.exec(`CREATE TABLE memorabilia(id INTEGER PRIMARY KEY,slug TEXT,title_en TEXT,title_ko TEXT,has_event INTEGER,event_id INTEGER,event_name_en TEXT,event_name_ko TEXT,year INTEGER,category_id INTEGER,material_en TEXT,material_ko TEXT,size_text TEXT,issuer_en TEXT,issuer_ko TEXT,description_en TEXT,description_ko TEXT,description_plain_en TEXT,description_plain_ko TEXT,related_links_json TEXT,related_memorabilia_json TEXT,status TEXT,updated_at TEXT,published_at TEXT,created_at TEXT,created_by INTEGER);INSERT INTO memorabilia(id,slug,title_ko,event_id,status,updated_at) VALUES(1,'synthetic','saved',1,'draft','old');CREATE TABLE memorabilia_events(id INTEGER PRIMARY KEY,usage_count INTEGER,name_en TEXT,name_ko TEXT,slug TEXT,start_year INTEGER,start_month INTEGER,start_day INTEGER,end_year INTEGER,end_month INTEGER,end_day INTEGER,archived INTEGER,country_codes_json TEXT);INSERT INTO memorabilia_events(id,usage_count) VALUES(1,5);
CREATE TABLE memorabilia_categories(id INTEGER PRIMARY KEY,label_en TEXT,label_ko TEXT,slug TEXT,sort_order INTEGER,archived INTEGER);
CREATE TABLE memorabilia_countries(memorabilia_id INTEGER,country_code TEXT,PRIMARY KEY(memorabilia_id,country_code));
CREATE TABLE memorabilia_tags(memorabilia_id INTEGER,tag_id INTEGER,PRIMARY KEY(memorabilia_id,tag_id));
CREATE TABLE memorabilia_tag_pool(id INTEGER PRIMARY KEY,label TEXT UNIQUE,usage_count INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE memorabilia_images(id INTEGER PRIMARY KEY,memorabilia_id INTEGER,url TEXT,alt_en TEXT,alt_ko TEXT,credit TEXT,is_primary INTEGER,sort_order INTEGER);
CREATE VIRTUAL TABLE memorabilia_fts USING fts5(title_en,title_ko,event_name_en,event_name_ko,issuer_en,issuer_ko,material_en,material_ko,description_plain_en,description_plain_ko,tags_text,country_names_text,category_label_text,jamo_blob,choseong_blob,memorabilia_id UNINDEXED)`);
  f.sqlite.exec('ALTER TABLE memorabilia_events ADD COLUMN description_en TEXT;ALTER TABLE memorabilia_events ADD COLUMN description_ko TEXT');
}

test('memorabilia maintenance preserves original index deletion and event counts', async () => {
  const [{refreshUsageCount},{refreshUsageCount:oldRefresh},{deleteMemorabiliaFtsRow},{deleteMemorabiliaFtsRow:oldDelete}]=await Promise.all([
    import('../functions/_shared/memorabilia-events.js'),import('./fixtures/rust-memorabilia/events-helper.js'),
    import('../functions/_shared/memorabilia-search.js'),import('./fixtures/rust-memorabilia/search.js'),
  ]);
  const old=fixture(), current=fixture();
  try {
    for(const f of [old,current]) {
      seedMemorabilia(f);
      f.sqlite.exec("INSERT INTO memorabilia(id,slug,event_id) VALUES(2,'two',1); INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('첫째',1),('둘째',2)");
    }
    for(const id of [1,'1',999,null]) {
      await oldRefresh(old.env.DB,id); await refreshUsageCount(current.env.DB,id);
      assert.deepEqual(current.sqlite.prepare('SELECT id,usage_count FROM memorabilia_events').all(),old.sqlite.prepare('SELECT id,usage_count FROM memorabilia_events').all());
    }
    for(const id of ['1',999,null,2]) {
      await oldDelete(old.env.DB,id); await deleteMemorabiliaFtsRow(current.env.DB,id);
      assert.deepEqual(current.sqlite.prepare('SELECT memorabilia_id,title_ko FROM memorabilia_fts ORDER BY rowid').all(),old.sqlite.prepare('SELECT memorabilia_id,title_ko FROM memorabilia_fts ORDER BY rowid').all());
    }
    current.sqlite.exec('DROP TABLE memorabilia_fts');
    await assert.rejects(deleteMemorabiliaFtsRow(current.env.DB,1));
    current.sqlite.exec('DROP TABLE memorabilia_events');
    await assert.rejects(refreshUsageCount(current.env.DB,1));
  } finally {old.sqlite.close();current.sqlite.close();}
});

test('calendar copy/tags and WOSM reject view-only writers without any mutation', async () => {
  for (const [handler, slug, path] of [[putWosm,'wosm-members','/api/settings/wosm-members'],[putTags,'calendar','/api/settings/calendar-tags'],[putCopy,'calendar','/api/settings/calendar-copy']]) {
    const f = fixture(['view:' + slug]);
    const response = await handler({ env: f.env, request: await request(f, path, {}) });
    assert.equal(response.status, 403); assert.equal(f.state.writes.length, 0); assert.equal(f.state.batches.length, 0);
    f.sqlite.close();
  }
});

test('members with the matching write permission keep calendar/WOSM save access', async () => {
  for (const [handler,slug,path,body] of [[putWosm,'wosm-members','/api/settings/wosm-members',{items:[],registered_count:0,if_revision:0}],[putTags,'calendar','/api/settings/calendar-tags',{items:['합성 태그']}],[putCopy,'calendar','/api/settings/calendar-copy',{}]]) {
    const f=fixture(['write:'+slug]);const response=await handler({env:f.env,request:await request(f,path,body)});assert.equal(response.status,200);assert.ok(f.state.writes.some(sql=>sql.includes('INSERT INTO settings')));f.sqlite.close();
  }
});

test('admin retrieval failure is distinct from empty, public WOSM fallback is preserved', async () => {
  const env = { DB: { prepare() { return { first: async () => { throw new Error('synthetic unavailable'); } }; } } };
  const admin = await getWosm({ env, request: new Request('https://synthetic.invalid/api/settings/wosm-members?scope=admin') });
  assert.equal(admin.status, 503); assert.match((await admin.json()).error, /불러오지 못했습니다/);
  const publicResponse = await getWosm({ env, request: new Request('https://synthetic.invalid/api/settings/wosm-members') });
  assert.equal(publicResponse.status, 200); assert.deepEqual((await publicResponse.json()).items, []);
  const f = fixture([], 'owner');
  const prepare = f.env.DB.prepare.bind(f.env.DB);
  f.env.DB.prepare = sql => {
    const statement = prepare(sql), first = statement.first.bind(statement);
    statement.first = async () => { if (statement.args[0] === 'reference_sites') throw new Error('synthetic unavailable'); return first(); };
    return statement;
  };
  const anonymous = await getReferences({ env: f.env, request: new Request('https://synthetic.invalid/api/settings/reference-sites') }); assert.equal(anonymous.status, 401);
  const failedReferences = await getReferences({ env:f.env, request:await request(f,'/api/settings/reference-sites',null,'GET') }); assert.equal(failedReferences.status,503); assert.match((await failedReferences.json()).error,/불러오지 못했습니다/);
  f.sqlite.close();
});

test('glossary/calendar admin cache bypass keeps public cache contracts', async () => {
  const f = fixture([], 'owner');
  f.sqlite.exec('CREATE TABLE glossary_terms(id INTEGER,bucket TEXT,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER,created_at TEXT,updated_at TEXT)');
  for (const [handler, path, maxAge] of [[getGlossary,'glossary',300],[getCalendar,'calendar',120]]) {
    const admin = await handler({ env: f.env, request: new Request('https://synthetic.invalid/api/' + path + '?scope=admin') });
    assert.equal(admin.status, 200); assert.equal(admin.headers.get('cache-control'), 'no-store');
    const publicResponse = await handler({ env: f.env, request: new Request('https://synthetic.invalid/api/' + path) });
    assert.equal(publicResponse.status, 200); assert.match(publicResponse.headers.get('cache-control'), new RegExp('max-age=' + maxAge));
  }
  f.sqlite.close();
});

test('reference and WOSM revision batch chain prevents racing loser payload writes', async () => {
  for (const [handler, path, key, revision, firstBody, secondBody] of [
    [putReferences,'/api/settings/reference-sites','reference_sites','reference_sites_rev',{items:[{name:'winner'}],if_revision:0},{items:[{name:'loser'}],if_revision:0}],
    [putWosm,'/api/settings/wosm-members','wosm_members','wosm_members_rev',{items:[{country_en:'winner'}],registered_count:0,if_revision:0},{items:[{country_en:'loser'}],registered_count:5,if_revision:0}],
  ]) {
    const f = fixture([], 'owner');
    f.state.forceRevision = true;
    // Both requests read revision 0 before either batch, as with concurrent requests.
    const requests = await Promise.all([request(f,path,firstBody),request(f,path,secondBody)]);
    const responses = await Promise.all(requests.map(req => handler({ env:f.env, request:req })));
    assert.deepEqual(responses.map(r=>r.status).sort(), [200,409]);
    const stored = f.sqlite.prepare('SELECT value FROM settings WHERE key=?').get(key).value;
    const successful = responses.findIndex(response => response.status === 200);
    assert.match(stored, new RegExp(successful === 0 ? 'winner' : 'loser'));
    assert.doesNotMatch(stored, new RegExp(successful === 0 ? 'loser' : 'winner'));
    assert.equal(f.sqlite.prepare('SELECT value FROM settings WHERE key=?').get(revision).value, '1');
    assert.ok(f.state.batches.some(changes => changes.every(n=>n===0)), 'CAS loser leaves every chained payload untouched');
    if (key === 'wosm_members') assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='wosm_members_registered_count'").get().value, successful === 0 ? '0' : '5');
    f.sqlite.close();
  }
});

test('calendar and glossary stale updated_at returns409 without losing the saved row', async () => {
  const f = fixture([], 'owner');
  await getCalendar({ env:f.env, request: new Request('https://synthetic.invalid/api/calendar') });
  f.sqlite.exec("INSERT INTO calendar_events(id,title,start_at,updated_at) VALUES(1,'saved','2026-10-15','current')");
  const cal = await putCalendar({ env:f.env, params:{id:'1'}, request:await request(f,'/api/calendar/1',{title:'stale',start_date:'2026-10-15',expected_updated_at:'old'}) });
  assert.equal(cal.status,409); assert.equal(f.sqlite.prepare('SELECT title FROM calendar_events WHERE id=1').get().title,'saved');
  f.sqlite.exec("CREATE TABLE glossary_terms(id INTEGER PRIMARY KEY,bucket TEXT,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER,created_at TEXT,updated_at TEXT); INSERT INTO glossary_terms(id,bucket,term_ko,updated_at) VALUES(1,'가','가족','current')");
  const glos = await putGlossary({ env:f.env, params:{id:'1'}, request:await request(f,'/api/glossary/1',{term_ko:'가나다',expected_updated_at:'old'}) });
  assert.equal(glos.status,409); assert.equal(f.sqlite.prepare('SELECT term_ko FROM glossary_terms WHERE id=1').get().term_ko,'가족');
  f.sqlite.close();
});

test('calendar repeated writes always advance the existing timestamp even within one millisecond',async()=>{
  const f=fixture([],'owner');const stamp='2999-01-01 00:00:00.000';f.sqlite.prepare("INSERT INTO calendar_events(id,title,start_at,updated_at) VALUES(1,'saved','2026-10-15',?)").run(stamp);
  const first=await putCalendar({env:f.env,params:{id:'1'},request:await request(f,'/api/calendar/1',{title:'new',start_date:'2026-10-15',expected_updated_at:stamp})});assert.equal(first.status,200);
  const next=(await first.json()).item.updated_at;assert.ok(next>stamp);
  const second=await putCalendar({env:f.env,params:{id:'1'},request:await request(f,'/api/calendar/1',{title:'stale',start_date:'2026-10-15',expected_updated_at:stamp})});assert.equal(second.status,409);assert.equal(f.sqlite.prepare('SELECT title FROM calendar_events WHERE id=1').get().title,'new');f.sqlite.close();
});

test('memorabilia compare-and-swap catches a race after the precheck without altering event usage or relations',async()=>{
  const f=fixture([],'owner');
  seedMemorabilia(f);
  let raced=false;
  f.state.beforeBatch=()=>{raced=true;f.sqlite.exec("UPDATE memorabilia SET updated_at='newer' WHERE id=1");};
  const response=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',{title_ko:'stale input',status:'draft',expected_updated_at:'old'},'PATCH')});
  assert.equal(raced,true);assert.equal(response.status,409);assert.equal((await response.json()).error,'version_mismatch');assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia WHERE id=1').get().title_ko,'saved');assert.equal(f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get().usage_count,5);f.sqlite.close();
});

test('successful memorabilia save returns its own CAS timestamp and synchronizes existing relations and FTS',async()=>{
  const f=fixture([],'owner');seedMemorabilia(f);
  const response=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',{title_ko:'저장한 제목',status:'draft',expected_updated_at:'old',country_codes:['KR'],tags:['합성태그'],images:[]},'PATCH')});
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.id,1);assert.ok(data.updated_at&&data.updated_at!=='old');assert.equal(f.sqlite.prepare('SELECT title_ko,updated_at FROM memorabilia WHERE id=1').get().updated_at,data.updated_at);assert.equal(f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get().usage_count,4);assert.equal(f.sqlite.prepare('SELECT country_code FROM memorabilia_countries WHERE memorabilia_id=1').get().country_code,'KR');assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'저장한 제목');f.sqlite.close();
});

test('memo draft reads require its menu view permission while public reads keep published-only behavior',async()=>{
  const restricted=fixture(['view:list']);seedMemorabilia(restricted);
  const anonymous=await getMemorabilia({env:restricted.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/memorabilia/1?scope=admin')});assert.equal(anonymous.status,401);
  const denied=await getMemorabilia({env:restricted.env,params:{id:'1'},request:await request(restricted,'/api/memorabilia/1?scope=admin',null,'GET')});assert.equal(denied.status,403);
  const deniedList=await listMemorabilia({env:restricted.env,request:await request(restricted,'/api/memorabilia?scope=admin&include_drafts=1',null,'GET')});assert.equal(deniedList.status,403);
  const publicDraft=await getMemorabilia({env:restricted.env,params:{id:'1'},request:await request(restricted,'/api/memorabilia/1',null,'GET')});assert.equal(publicDraft.status,404);
  restricted.sqlite.exec("UPDATE memorabilia SET status='public',event_id=NULL WHERE id=1");const publicItem=await getMemorabilia({env:restricted.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/memorabilia/1')});assert.equal(publicItem.status,200);assert.equal((await publicItem.json()).item.status,'public');
  restricted.user.permissions=JSON.stringify({access_admin:false,permissions:['view:memorabilia']});const disabled=await getMemorabilia({env:restricted.env,params:{id:'1'},request:await request(restricted,'/api/memorabilia/1?scope=admin',null,'GET')});assert.equal(disabled.status,403);restricted.sqlite.close();
  const reader=fixture(['view:memorabilia']);seedMemorabilia(reader);
  const permitted=await getMemorabilia({env:reader.env,params:{id:'1'},request:await request(reader,'/api/memorabilia/1?scope=admin',null,'GET')});assert.equal(permitted.status,200);assert.equal(permitted.headers.get('cache-control'),'no-store');assert.equal((await permitted.json()).item.status,'draft');reader.sqlite.close();
});

test('global admin memo title search finds an older row and treats SQL wildcard characters literally',async()=>{
  const f=fixture(['view:memorabilia']);seedMemorabilia(f);f.sqlite.exec("UPDATE memorabilia SET title_ko='찾기_%' WHERE id=1;INSERT INTO memorabilia(id,title_ko,status,updated_at) VALUES(2,'찾기AAZZ','draft','2099-01-01')");
  for(let id=3;id<=110;id++)f.sqlite.prepare('INSERT INTO memorabilia(id,title_ko,status,updated_at) VALUES(?,?,?,?)').run(id,'unrelated '+id,'draft','2099-01-01');
  const response=await listMemorabilia({env:f.env,request:await request(f,'/api/memorabilia?scope=admin&include_drafts=1&q='+encodeURIComponent('찾기_%'),null,'GET')});assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,1);assert.equal(data.items.length,1);assert.equal(data.items[0].id,1);assert.equal(response.headers.get('cache-control'),'no-store');f.sqlite.close();
});

test('posts internal dwell follows existing list-view policy without changing public article fields',async()=>{
  const scenarios=[{name:'owner',role:'owner',perms:[],dwell:true},{name:'list reader',role:'member',perms:['view:list'],dwell:true},{name:'other menu',role:'member',perms:['view:calendar'],dwell:false},{name:'disabled access',role:'member',perms:['view:list'],disabled:true,dwell:false},{name:'anonymous',role:'member',perms:[],anonymous:true,dwell:false}];
  let publicBaseline;
  for(const scenario of scenarios){const f=fixture(scenario.perms,scenario.role);for(const column of ['subtitle TEXT','image_url TEXT','image_caption TEXT','image_frame TEXT','created_at TEXT','publish_at TEXT','updated_at TEXT','featured INTEGER','tag TEXT','meta_tags TEXT','special_feature TEXT','views INTEGER','author TEXT','published INTEGER','sort_order INTEGER','youtube_url TEXT','content TEXT'])f.sqlite.exec('ALTER TABLE posts ADD COLUMN '+column);
    f.sqlite.exec("CREATE TABLE post_likes(post_id INTEGER);CREATE TABLE post_engagement(post_id INTEGER,engaged_seconds INTEGER);INSERT INTO posts(id,title,category,published,created_at,author,views) VALUES(1,'public article','korea',1,'2026-10-15','합성 저자',7);INSERT INTO post_engagement VALUES(1,35)");if(scenario.disabled)f.user.permissions=JSON.stringify({access_admin:false,permissions:['view:list']});
    const req=scenario.anonymous?new Request('https://synthetic.invalid/api/posts?scope=admin&published=1'):await request(f,'/api/posts?scope=admin&published=1',null,'GET');const response=await listPosts({env:f.env,request:req});assert.equal(response.status,200,scenario.name);const data=await response.json();assert.equal(data.posts.length,1);const {avg_dwell_seconds,...publicFields}=data.posts[0];assert.equal(Object.hasOwn(data.posts[0],'avg_dwell_seconds'),scenario.dwell,scenario.name);if(scenario.dwell)assert.equal(avg_dwell_seconds,35);if(!publicBaseline)publicBaseline=publicFields;else assert.deepEqual(publicFields,publicBaseline,scenario.name);assert.deepEqual(f.state.writes,[],'read-only fixture has no due-publication or business mutations');f.sqlite.close();
  }
});


test('calendar handlers preserve legacy reads, permissions, writes, conflicts and deletion', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    const out=[];
    for (const [f,get,create,put,del] of [[before,oldCalendar,oldCreateCalendar,oldPutCalendar,oldDeleteCalendar],[after,getCalendar,createCalendar,putCalendar,deleteCalendar]]) {
      f.sqlite.exec("INSERT INTO posts(id,title,category) VALUES(3,'관련 기사','korea'); INSERT INTO calendar_events(id,title,start_at,related_post_id,created_at,updated_at) VALUES(1,'기존 일정','2026-10-01 00:00:00',3,'2026-01-01 00:00:00','2999-01-01 00:00:00.000')");
      f.sqlite.prepare('UPDATE calendar_events SET event_tags=?,target_groups=? WHERE id=1').run(' Scout, Scout, 캠프 ',JSON.stringify([' 컵 ','컵','스카우트','invalid']));
      f.sqlite.prepare('INSERT INTO calendar_events(id,title,start_at,event_tags,related_posts_json,target_groups) VALUES(?,?,?,?,?,?)').run(2,'둘째 일정','2026-11-01 00:00:00',JSON.stringify(['태그','태그',' 두 번째 ']),JSON.stringify([{id:'3suffix',title:' 기사 ',category:' korea '},{id:3,title:'중복'}]),'{invalid');
      f.sqlite.exec("UPDATE calendar_events SET created_at='2026-01-01 00:00:00',updated_at='2026-01-01 00:00:00' WHERE id=2");
      const result=[];
      let response=await get({env:f.env,request:new Request('https://synthetic.invalid/api/calendar')});
      result.push([response.status,response.headers.get('cache-control'),await response.json()]);
      response=await put({env:f.env,params:{id:'1'},request:await request(f,'/api/calendar/1',{title:'실패',start_date:'2026-10-15',expected_updated_at:'old'})});
      result.push([response.status,await response.json()]);
      response=await put({env:f.env,params:{id:'1'},request:await request(f,'/api/calendar/1',{title:'수정 일정',start_date:'2026-10-15',expected_updated_at:'2999-01-01 00:00:00.000'})});
      result.push([response.status,await response.json()]);
      response=await create({env:f.env,request:await request(f,'/api/calendar',{title:'새 일정',start_date:'2026-12-20',event_tags:['Scout'],latitude:37.5,longitude:127.1},'POST')});
      const created=await response.json();
      delete created.item.created_at; delete created.item.updated_at;
      result.push([response.status,created]);
      response=await del({env:f.env,params:{id:'1'},request:await request(f,'/api/calendar/1',{},'DELETE')});
      result.push([response.status,await response.json()]);
      response=await del({env:f.env,params:{id:'999'},request:await request(f,'/api/calendar/999',{},'DELETE')});
      result.push([response.status,await response.json()]);
      result.push(f.sqlite.prepare('SELECT id,title,start_at,latitude,longitude FROM calendar_events ORDER BY id').all());
      out.push(result);
    }
    assert.deepEqual(out[1],out[0]);
    assert.deepEqual(out[1].map(x=>Array.isArray(x)?x[0]:undefined).slice(0,6),[200,409,200,201,200,200]);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust calendar date parsing matches existing input behavior', async () => {
  const f=fixture([], 'owner');
  try {
    const cases=[
      {start_at:'2026-1-2'}, {start_at:'2026.1.2T00:00'}, {start_at:'2026/12/31 9:05:10',end_at:'2027-1-1 0:00'},
      {start_at:'invalid',start_date:'2026.2.31',start_time:'00:00'}, {start_date:'2026-5-3',start_time:'25:00'},
      {start_at:'2026-04-01  1:02',end_date:'2026/3/31'}, {start_date:'2026-0-1'}, {start_date:'2026-11-32'},
      {start_date:'2026-2-5',end_at:'2026-2-6 9:30'}, {start_at:'2026-01-01T00:00:00Z',start_date:'2026-1-2'},
      {start_at:0,start_date:' 2026-7-9 ',start_time:'9:05:03'}, {start_at:'2026-1-1 00:00:00'},
    ];
    for (const body of cases) {
      body.title='합성 일정';
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'calendar-dates',body);
      assert.equal(response.status,200);
      assert.deepEqual(normalizeCalendarInput(body,await response.json()),normalizeCalendarInput(body),JSON.stringify(body));
    }
  } finally { f.sqlite.close(); }
});

test('Rust calendar input normalization matches existing fields and validation', async () => {
  const f=fixture([], 'owner');
  try {
    const cases=[
      {}, {title:'일정'}, {title_original:' 원문 ',start_date:'2026/1/2'},
      {title:' 일정 ',title_original:' 원문 ',start_at:'2026-2-3 00:00',end_date:'2026-2-4',event_category:' apr ',event_tags:'태그, 태그, 둘',target_groups:[' 컵 ','컵','스카우트'],latitude:'-37.1234565',longitude:'181',link_url:'https://example.com/한글?a=1'},
      {title:'x',start_date:'2026-1-1',related_post_id:'3suffix',related_posts:[{id:'3suffix',title:' 기사 ',category:' korea '},{id:3,title:'중복'},{id:4,title:'두 번째'}],event_tags:[' A ','A','']},
      {title:'x',start_date:'2026-1-1',related_post_ids:[{id:2,title:'둘'}],target_groups:[['컵'],'컵','invalid'],latitude:true,longitude:''},
      {title:'x',start_date:'2026-1-2',end_date:'2026-1-1',link_url:'javascript:alert(1)'},
    ];
    for (const body of cases) {
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'calendar-normalize',body);
      assert.equal(response.status,200);
      const actual=await response.json(), old=normalizeCalendarInput(body);
      assert.deepEqual(actual,old.error?{error:old.error}:{values:calendarValues(old)},JSON.stringify(body));
    }
  } finally {f.sqlite.close();}
});

test('calendar mutation denies anonymous and view-only accounts',async()=>{
  for(const [handler,method] of [[createCalendar,'POST'],[putCalendar,'PUT'],[deleteCalendar,'DELETE']]) {
    const f=fixture(['view:calendar']);
    try {
      for(const anonymous of [true,false]) {
        const req=anonymous?new Request('https://synthetic.invalid/api/calendar/1',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'test',start_date:'2026-10-01'})}):await request(f,'/api/calendar/1',{title:'test',start_date:'2026-10-01'},method);
        const response=await handler({env:f.env,params:{id:'1'},request:req});
        assert.equal(response.status,anonymous?401:403);
      }
      assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM calendar_events').get().n,0);
    } finally {f.sqlite.close();}
  }
});


test('revisioned setting writes match legacy results and atomic payloads',async()=>{
  const cases=[
    [oldPutWosm,putWosm,'/api/settings/wosm-members',{items:[{country_en:'Synthetic'}],registered_count:31,if_revision:0},[]],
    [oldPutWosm,putWosm,'/api/settings/wosm-members',{items:[{country_en:'x'.repeat(150)}],registered_count:31,if_revision:0},[]],
    [oldPutWosm,putWosm,'/api/settings/wosm-members',{items:[{country_en:'Synthetic'}],if_revision:1},[]],
    [oldPutReferences,putReferences,'/api/settings/reference-sites',{items:[{name:'Example',url:'https://example.invalid/'}],if_revision:0},[]],
    [oldPutReferences,putReferences,'/api/settings/reference-sites',{items:[{name:'Example'}],if_revision:1},[]],
  ];
  for(const [original,actual,path,body,permissions] of cases){
    const before=fixture(permissions,'owner'),after=fixture(permissions,'owner');
    try{
      const result=[];
      for(const [f,handler] of [[before,original],[after,actual]]){
        const response=await handler({env:f.env,request:await request(f,path,body)});
        result.push({status:response.status,body:await response.json(),settings:f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all()});
      }
      assert.deepEqual(result[1],result[0],path);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('feature definition Rust read keeps latest history and missing-history fallback', async () => {
  const f=fixture([],'owner');
  try {
    const content='# 합성 운영 기준\n\n## 0. 문서 목적과 사용 순서\n유지할 내용';
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('feature_definition',content);
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('feature_definition_rev','3');
    assert.equal(await loadFeatureDefinition(f.env),content);
    const withoutHistory=await getDefinition({env:f.env});
    assert.equal(withoutHistory.status,200);
    assert.equal((await withoutHistory.json()).updated_at,null);
    f.sqlite.exec("CREATE TABLE settings_history(key TEXT,value TEXT,saved_at TEXT); INSERT INTO settings_history VALUES('feature_definition','old','2026-01-01 00:00:00'),('feature_definition','new','2026-02-01 00:00:00'),('other','x','2027-01-01 00:00:00')");
    const result=await (await getDefinition({env:f.env})).json();
    assert.equal(result.content,content);
    assert.equal(result.updated_at,'2026-02-01 00:00:00');
    assert.equal(result.revision,3);
    f.sqlite.prepare('UPDATE settings SET value=? WHERE key=?').run('legacy','feature_definition');
    assert.equal(await loadFeatureDefinition(f.env),DEFAULT_FEATURE_DEFINITION);
  } finally {f.sqlite.close();}
});

test('calendar schema readiness is isolated by database binding', async () => {
  const databases=[new DatabaseSync(':memory:'),new DatabaseSync(':memory:')];
  try {
    const bindings=databases.map(sqlite=>{
      sqlite.exec("CREATE TABLE calendar_events(id INTEGER PRIMARY KEY,title TEXT,start_at TEXT)");
      return Object.assign(new (class D1Database {})(),{prepare(sql){return {
        async all(){return {results:sqlite.prepare(sql).all()}},
        async run(){const result=sqlite.prepare(sql).run();return {success:true,meta:{changes:Number(result.changes)}}},
      }}});
    });
    const {ensureCalendarTable}=await import('../functions/_shared/calendar.js?schema-binding-isolation');
    await ensureCalendarTable({DB:bindings[0]});
    await ensureCalendarTable({DB:bindings[1]});
    for (const db of databases) assert(db.prepare('PRAGMA table_info(calendar_events)').all().some(row=>row.name==='target_groups'));
  } finally {for (const db of databases) db.close();}
});

test('calendar schema migration preserves old events and retries after failure', async () => {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE calendar_events(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT,location_name TEXT,location_address TEXT,start_at TEXT NOT NULL,end_at TEXT,link_url TEXT,created_at TEXT,updated_at TEXT); INSERT INTO calendar_events(id,title,start_at) VALUES(1,'보존 일정','2027-01-01')");
  let failOnce=true, race=false;
  const DB=Object.assign(new (class D1Database {})(),{prepare(sql) { return {
    async all() {return {results:sqlite.prepare(sql).all()};},
    async run() {if (race && sql.includes('ADD COLUMN target_groups')) {race=false; sqlite.prepare(sql).run(); throw new Error('synthetic concurrent column creation');} if (failOnce && sql.includes('ADD COLUMN target_groups')) {failOnce=false; throw new Error('synthetic migration failure');} const result=sqlite.prepare(sql).run();return {success:true,meta:{changes:Number(result.changes)}};},
  }; }});
  const {ensureCalendarTable}=await import('../functions/_shared/calendar.js?schema-retry-test');
  try {
    await assert.rejects(ensureCalendarTable({DB}));
    assert.equal(sqlite.prepare('SELECT title FROM calendar_events WHERE id=1').get().title,'보존 일정');
    await ensureCalendarTable({DB});
    await ensureCalendarTable({DB});
    const columns=sqlite.prepare('PRAGMA table_info(calendar_events)').all().map(row=>row.name);
    for(const name of ['title_original','event_category','event_tags','country_name','latitude','longitude','related_post_id','related_posts_json','start_has_time','end_has_time','target_groups']) assert(columns.includes(name),name);
    assert.equal(sqlite.prepare('SELECT title,event_category FROM calendar_events WHERE id=1').get().title,'보존 일정');
    assert.equal(sqlite.prepare('SELECT event_category FROM calendar_events WHERE id=1').get().event_category,'WOSM');
    sqlite.exec('ALTER TABLE calendar_events DROP COLUMN target_groups');
    race=true;
    assert.equal((await queryRust({env:{DB},request:{url:'https://synthetic.invalid/'}},'calendar-ensure',{})).status,200);
    assert(sqlite.prepare('PRAGMA table_info(calendar_events)').all().some(row=>row.name==='target_groups'));
  } finally {sqlite.close();}
});

test('revisioned settings reads match legacy public and authorized responses',async()=>{
  for(const [prior,current,path,owner] of [[oldGetWosm,getWosm,'/api/settings/wosm-members',false],[oldGetWosm,getWosm,'/api/settings/wosm-members?scope=admin',true],[oldGetReferences,getReferences,'/api/settings/reference-sites',true]]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const output=[];
      for(const [f,handler] of [[before,prior],[after,current]]) {
        f.sqlite.exec(`INSERT INTO settings(key,value) VALUES('wosm_members','[]'),('wosm_members_rev','7'),('wosm_members_registered_count','23'),('reference_sites','[{"name":"Synthetic","url":"https://example.invalid/"}]'),('reference_sites_rev','4')`);
        const req=owner?await request(f,path,null,'GET'):new Request('https://synthetic.invalid'+path);
        const res=await handler({env:f.env,request:req});
        output.push({status:res.status,cache:res.headers.get('cache-control'),body:await res.json()});
      }
      assert.deepEqual(output[1],output[0],path);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('WOSM reads preserve legacy stored input and invalid JSON behavior', async () => {
  const values=[null,'', '{invalid', 'null', '{}', JSON.stringify([]), JSON.stringify([
    {country_en:' France ',country_ko:'France',country_fr:' République ',extra_fields:{'A B':' 값 ','a-b':'새 값'},sort_order:7},
    {country_en:'',country_ko:'',country_fr:''}, {country_en:'한국',country_ko:'한글',unknown:' 내용 '},
    {country_en:'synthetic',country_ko:'가'.repeat(119)+'😀',sort_order:'invalid'}, {country_en:'x'.repeat(150)},
  ])];
  for (const value of values) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const output=[];
      for (const [f,handler] of [[before,oldGetWosm],[after,getWosm]]) {
        if (value !== null) f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('wosm_members',value);
        const res=await handler({env:f.env,request:new Request('https://synthetic.invalid/api/settings/wosm-members')});
        output.push({status:res.status,body:await res.json()});
      }
      assert.deepEqual(output[1],output[0],String(value));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('WOSM stored columns and public fields match the legacy read across boundary inputs', async () => {
  const cases=[
    {columns:'{invalid',mapping:'null',copy:'[]',count:'not-number'},
    {columns:JSON.stringify([{key:'custom',label:'가'.repeat(39)+' '+ '나',default_header:'a'.repeat(159)+' x'},{key:'membership_category',label:'',default_header:''}]),mapping:JSON.stringify({country_en:'a'.repeat(159)+' x',country_fr:'😀'.repeat(81)}),copy:JSON.stringify({child_label:'나'.repeat(39)+' x',helper_text:'다'.repeat(359)+' 😀'}),count:'7.5'},
    {columns:JSON.stringify([{key:'sort order',label:'정렬',default_header:'Strict Order'},{key:'country_names',label:'국가명'}]),mapping:JSON.stringify({country_ko:'한국어',country_en:'English',country_fr:'Français'}),copy:JSON.stringify({overview_template:'합성',section_region_label:'지역'}),count:'0'},
  ];
  for (const input of cases) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const results=[];
      for(const [f,handler] of [[before,oldGetWosm],[after,getWosm]]) {
        const insert=f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)');
        for(const [key,value] of Object.entries({wosm_members_columns:input.columns,wosm_members_import_mapping:input.mapping,wosm_members_public_copy:input.copy,wosm_members_registered_count:input.count})) insert.run(key,value);
        const response=await handler({env:f.env,request:new Request('https://synthetic.invalid/api/settings/wosm-members')});
        results.push({status:response.status,body:await response.json()});
      }
      assert.deepEqual(results[1],results[0]);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('WOSM long unknown English names preserve the second normalization boundary', async () => {
  const raw=[{country_en:'x'.repeat(150)}];
  const once=sanitizeWosmMembersItems(raw);
  assert.equal(once[0].country_ko.length,150);
  const twice=sanitizeWosmMembersItems(once);
  assert.equal(twice[0].country_ko.length,120);
  const out=await normalizeWosmMembersResponseRust(once,[],{},176,0,{});
  assert.equal(out.items[0].country_ko.length,120);
  assert.deepEqual(out,normalizeWosmMembersResponse(once,[],{},176,0,{}));
});


test('reference-site read retains the original long Unicode URL exactly', async () => {
  const before=fixture([],'owner'),after=fixture([],'owner');
  try {
    const original='https://example.invalid/'+ '한'.repeat(100);
    const stored=JSON.stringify([{name:'합성',url:original}]);
    const results=[];
    for (const [f,handler] of [[before,oldGetReferences],[after,getReferences]]) {
      f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('reference_sites',stored);
      const response=await handler({env:f.env,request:await request(f,'/api/settings/reference-sites',null,'GET')});
      results.push({status:response.status,body:await response.json()});
    }
    assert.deepEqual(results[1],results[0]);
    assert.equal(results[0].body.items[0].url,new URL(original).toString());
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('admin tag usage matches legacy counts, samples and protects in-use tags', async () => {
  const before=fixture([],'owner'),after=fixture([],'owner');
  try {
    for(const f of [before,after]) {
      f.sqlite.exec("ALTER TABLE posts ADD COLUMN tag TEXT; ALTER TABLE posts ADD COLUMN updated_at TEXT; INSERT INTO posts(id,title,category,tag,updated_at) VALUES(1,'공개','korea','캠프, 교육','2026-01-01'),(2,'합성 초안','apr','교육 ,캠프','2026-01-03'),(3,'부분 일치','wosm','캠프장','2026-01-04'),(4,'다른 글','people','교육','2026-01-02')");
      f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('tags',JSON.stringify({common:['캠프','교육'],categories:{korea:[],apr:[],wosm:[],people:[]}}));
    }
    for(const tag of ['캠프','교육','캠프장','없는 태그']) {
      const out=[];
      for(const [f,handler] of [[before,oldGetPostTags],[after,getPostTags]]) {
        const path='/api/settings/tags?usage='+encodeURIComponent(tag);
        const response=await handler({env:f.env,request:await request(f,path,null,'GET')});
        out.push({status:response.status,body:await response.json()});
      }
      assert.deepEqual(out[1],out[0],tag);
    }
    const guarded=[];
    for(const [f,handler] of [[before,oldPutPostTags],[after,putPostTags]]) {
      const response=await handler({env:f.env,request:await request(f,'/api/settings/tags',{common:['교육'],categories:{korea:[],apr:[],wosm:[],people:[]}})});
      guarded.push({status:response.status,body:await response.json(),saved:f.sqlite.prepare("SELECT value FROM settings WHERE key='tags'").get().value});
    }
    assert.deepEqual(guarded[1],guarded[0]);
    assert.equal(guarded[1].status,409);
    assert.equal(guarded[1].body.count,2);
    const anonymous=await getPostTags({env:after.env,request:new Request('https://synthetic.invalid/api/settings/tags?usage=캠프')});
    assert.equal(anonymous.status,401);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('tag save rechecks usage atomically when an article starts using a removed tag', async () => {
  const f=fixture([],'owner');
  try {
    f.sqlite.exec('ALTER TABLE posts ADD COLUMN tag TEXT; ALTER TABLE posts ADD COLUMN updated_at TEXT');
    const existing=JSON.stringify({common:['경쟁태그','교육'],categories:{korea:[],apr:[],wosm:[],people:[]}});
    f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('tags',existing);
    const original=f.env.DB.prepare.bind(f.env.DB);
    let injected=false;
    f.env.DB.prepare=sql=>{
      const statement=original(sql);
      if (sql.includes("INSERT INTO settings (key, value) SELECT 'tags'")) {
        const run=statement.run.bind(statement);
        statement.run=async()=>{
          injected=true;
          f.sqlite.prepare('INSERT INTO posts(id,title,category,tag,updated_at) VALUES(?,?,?,?,?)').run(9,'동시 작성','korea','경쟁태그','2026-01-01');
          return run();
        };
      }
      return statement;
    };
    const response=await putPostTags({env:f.env,request:await request(f,'/api/settings/tags',{common:['교육'],categories:{korea:[],apr:[],wosm:[],people:[]}})});
    assert.equal(injected,true);
    assert.equal(response.status,409);
    const body=await response.json();
    assert.equal(body.tag_in_use,'경쟁태그');
    assert.equal(body.count,1);
    assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='tags'").get().value,existing);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM posts WHERE id=9').get().n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='settings_history'").get().n,0);
  } finally {f.sqlite.close();}
});

test('single settings preserve defaults, sanitized saves, restore and cache headers',async()=>{
  for(const [path,oldGet,get,oldPut,put,body,oldDelete,del] of [
    ['/api/settings/board-banner',oldGetBanner,getBanner,oldPutBanner,putBanner,{items:{korea:{event_name:'행사',event_date:'2027-01-01'}}}],
    ['/api/settings/editors',oldGetEditors,getEditors,oldPutEditors,putEditors,{editors:{A:'합성 기자'}}],
    ['/api/settings/translations',oldGetTranslations,getTranslations,oldPutTranslations,putTranslations,{strings:{'sample.key':{ko:'안내'}}}],
    ['/api/settings/nav-labels',oldGetNav,getNav,oldPutNav,putNav,{labels:{'nav.home':{ko:'홈'}}}],
    ['/api/settings/tags',oldGetPostTags,getPostTags,oldPutPostTags,putPostTags,{common:['추가'],categories:{korea:[],apr:[],wosm:[],people:[]}}],
    ['/api/settings/author',oldGetAuthor,getAuthor,oldPutAuthor,putAuthor,{author:' 합성 작성자 '}],
    ['/api/settings/ai-disclaimer',oldGetDisclaimer,getDisclaimer,oldPutDisclaimer,putDisclaimer,{text:' 합성 안내 '}],
    ['/api/settings/ticker',oldGetTicker,getTicker,oldPutTicker,putTicker,{items:['합성 기사', ' 기타 ']}],
    ['/api/settings/board-layout',oldGetLayout,getLayout,oldPutLayout,putLayout,{gap_px:99}],
    ['/api/settings/calendar-tags',oldGetTags,getTags,oldPutTags,putTags,{items:['캠프','캠프',' 새 행사 ']}],
    ['/api/settings/calendar-copy',oldGetCopy,getCopy,oldPutCopy,putCopy,{copy:{page_title:'합성 일정'}}],
    ['/api/settings/score-rubric',oldGetRubric,getRubric,oldPutRubric,putRubric,{content:'합성 평가 기준'},oldDeleteRubric,deleteRubric],
  ]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const output=[];
      for(const [f,g,p,d] of [[before,oldGet,oldPut,oldDelete],[after,get,put,del]]) {
        const items=[];
        if(path==='/api/settings/tags') f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('tags',JSON.stringify({common:[],categories:{korea:[],apr:[],wosm:[],people:[]}}));
        for(const method of ['GET','PUT','GET',...(d?['DELETE','GET']:[])]) {
          const handler=method==='GET'?g:method==='PUT'?p:d;
          const res=await handler({env:f.env,request:await request(f,path,body,method)});
          items.push({status:res.status,cache:res.headers.get('cache-control'),body:await res.json()});
        }
        items.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());
        output.push(items);
      }
      assert.deepEqual(output[1],output[0],path);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust calendar copy preserves field order, text and legacy unusual values',async()=>{
  for(const input of [null,{}, {page_title:'  합성 일정  ',map_help:'\ufeff안내\ufeff'}, {page_title:'😀 일정',ongoing_empty:''},
    {page_title:123,map_title:['a','b'],month_view_label:true}, {page_title:'\ud800'}, ['unused']]) {
    const expected=oldSanitizeCalendarCopy(input);
    const actual=await sanitizeCalendarCopy(input);
    assert.deepEqual(actual,expected);
    assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  }
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'calendar-copy-normalize',{raw:{page_title:'  합성 일정  '},defaults:Object.entries(DEFAULT_CALENDAR_COPY)});
  assert.equal(response.status,200);
  assert.deepEqual(Object.fromEntries((await response.json()).entries),oldSanitizeCalendarCopy({page_title:'  합성 일정  '}));
});


test('single setting adapter rejects non-whitelisted keys and unauthorized deletion',async()=>{
  const f=fixture([],'owner');
  try {
    f.sqlite.exec("INSERT INTO settings VALUES('protected','preserve'),('calendar_tags','[\"keep\"]')");
    for(const input of [{key:'protected',operation:'put',value:'tamper'},{key:'calendar_tags',operation:'delete'},{key:'editors',operation:'put',value:'tamper'}]) {
      const res=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'settings-single',input);
      assert.equal(res.status,500);
    }
    assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='protected'").get().value,'preserve');
    assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='calendar_tags'").get().value,'["keep"]');
  } finally {f.sqlite.close();}
});


test('revisioned board copy, site metadata and KMS settings match legacy save contracts',async()=>{
  for(const [path,oldGet,get,oldPut,put,body,key] of [
    ['/api/settings/board-copy',oldGetBoardCopy,getBoardCopy,oldPutBoardCopy,putBoardCopy,{korea:{description:'합성 설명'},if_revision:0},'board_copy'],
    ['/api/settings/site-meta',oldGetSiteMeta,getSiteMeta,oldPutSiteMeta,putSiteMeta,{pages:{home:{title:'합성 제목'}},image_url:'',if_revision:0},'site_meta'],
    ['/api/settings/feature-definition',oldGetDefinition,getDefinition,oldPutDefinition,putDefinition,{content:'# 합성 기준\n\n## 0. 문서 목적과 사용 순서\n합성 내용',if_revision:0},'feature_definition'],
  ]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const output=[];
      for(const [f,g,p] of [[before,oldGet,oldPut],[after,get,put]]) {
        const result=[];
        for(const [handler,method,payload] of [[g,'GET',null],[p,'PUT',body],[p,'PUT',body],[g,'GET',null]]) {
          const res=await handler({env:f.env,request:await request(f,path,payload,method)});
          const data=await res.json();
          if(key==='feature_definition') delete data.updated_at;
          result.push({status:res.status,body:data,cache:res.headers.get('cache-control')});
        }
        result.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());
        output.push(result);
      }
      assert.deepEqual(output[1],output[0],path);
      assert.deepEqual(output[1].slice(0,3).map(x=>x.status),[200,200,409]);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('revisioned settings adapter rejects targets outside its allowed scope',async()=>{
  const f=fixture([],'owner');
  try {
    f.sqlite.exec("INSERT INTO settings VALUES('unrelated','original'),('unrelated_rev','0')");
    const ctx={env:f.env,request:{url:'https://synthetic.invalid/'}};
    const read=await queryRust(ctx,'settings-snapshot',{target:'unrelated'});
    const write=await queryRust(ctx,'settings-save',{target:'unrelated',currentRev:0,nextRev:'1',values:['tamper']});
    assert.equal(read.status,500);assert.equal(write.status,500);
    assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='unrelated'").get().value,'original');
  } finally {f.sqlite.close();}
});


test('privacy policy preserves owner gate, validation, save, conflict, history and restore',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try {
    const output=[];
    for(const [f,get,put,del] of [[before,oldGetPrivacy,oldPutPrivacy,oldDeletePrivacy],[after,getPrivacy,putPrivacy,deletePrivacy]]) {
      f.sqlite.exec("INSERT INTO settings VALUES('privacy_policy_html','<p>이전 방침</p>'),('privacy_policy_updated_at','2026-01-01T00:00:00Z'),('privacy_policy_rev','3')");
      const items=[];
      for(const [handler,method,body] of [[get,'GET',null],[put,'PUT',{html:'<script>blocked</script>',if_revision:3}],[put,'PUT',{html:'<p>합성 수정</p>',if_revision:2}],[put,'PUT',{html:'<p>합성 수정</p>',if_revision:3}],[del,'DELETE',{if_revision:4}],[get,'GET',null]]) {
        const res=await handler({env:f.env,request:await request(f,'/api/settings/privacy-policy?scope=admin',body,method)});
        const data=await res.json();if(data.updated_at && data.updated_at!=='2026-01-01T00:00:00Z')data.updated_at='NEW';
        items.push({status:res.status,body:data,cache:res.headers.get('cache-control')});
      }
      items.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());
      items.push(f.sqlite.prepare('SELECT key,value FROM settings_history ORDER BY id').all());
      output.push(items);
    }
    assert.deepEqual(output[1],output[0]);
    assert.deepEqual(output[1].slice(0,6).map(x=>x.status),[200,400,409,200,200,200]);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('home lead state commits match legacy manual, automatic, clear and invalid selection',async()=>{
  for(const next of [{mode:'manual',postId:1,mediaValue:'{"fit":"contain"}'},{mode:'auto',postId:2,mediaValue:null},{mode:'auto',postId:0,mediaValue:null},{mode:'manual',postId:3,mediaValue:null}]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const out=[];
      for(const [f,read,commit] of [[before,oldReadLead,oldCommitLead],[after,readLead,commitLead]]) {
        f.sqlite.exec("ALTER TABLE posts ADD COLUMN published INTEGER; INSERT INTO posts VALUES(1,'public','korea',1),(2,'other','apr',1),(3,'private','korea',0); INSERT INTO settings VALUES('home_lead_mode','manual'),('home_lead_post','1'),('home_lead_media','original'),('home_lead_rev','3')");
        const previous=await read(f.env);
        const result=await commit(f.env,previous,next,'2026-10-29T00:00:00.000Z');
        out.push({result,rows:f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all()});
      }
      assert.deepEqual(out[1],out[0],JSON.stringify(next));
      assert.equal(out[1].result.committed,next.postId!==3);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('home lead admin preview and manual saves match legacy output',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try {
    const output=[];
    for(const [f,get,put] of [[before,oldGetLead,oldPutLead],[after,getLead,putLead]]) {
      f.sqlite.exec(`ALTER TABLE posts ADD COLUMN published INTEGER; ALTER TABLE posts ADD COLUMN subtitle TEXT; ALTER TABLE posts ADD COLUMN content TEXT; ALTER TABLE posts ADD COLUMN image_url TEXT; ALTER TABLE posts ADD COLUMN image_caption TEXT; ALTER TABLE posts ADD COLUMN created_at TEXT; ALTER TABLE posts ADD COLUMN tag TEXT; ALTER TABLE posts ADD COLUMN views INTEGER; ALTER TABLE posts ADD COLUMN author TEXT; ALTER TABLE posts ADD COLUMN youtube_url TEXT; CREATE TABLE post_views(post_id INTEGER,viewed_at TEXT); INSERT INTO posts(id,title,category,published,created_at) VALUES(1,'공개 합성','korea',1,'2026-01-01 00:00:00'),(2,'비공개 합성','apr',0,'2026-01-01 00:00:00'); INSERT INTO post_views VALUES(1,datetime('now')); INSERT INTO settings VALUES('home_lead_mode','auto'),('home_lead_rev','0')`);
      const rows=[];
      for(const [handler,method,body] of [[get,'GET',null],[put,'PUT',{post_id:2,if_revision:0}],[put,'PUT',{post_id:1,media:{fit:'contain',position_x:'-4px',zoom:170,desktop:{position_y:'77px'},mobile:{position_x:91,zoom:64}},if_revision:0}],[get,'GET',null]]) {
        const res=await handler({env:f.env,request:await request(f,'/api/settings/home-lead',body,method)});
        rows.push({status:res.status,body:await res.json(),cache:res.headers.get('cache-control')});
      }
      rows.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());output.push(rows);
    }
    assert.deepEqual(output[1],output[0]);
    assert.deepEqual(output[1].slice(0,4).map(x=>x.status),[200,400,200,200]);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('contributors settings preserve defaults, normalization and revision conflicts',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try{
    const out=[];
    for(const [f,get,put] of [[before,oldGetContributors,oldPutContributors],[after,getContributors,putContributors]]) {
      const result=[];
      for(const [handler,method,body] of [[get,'GET',null],[put,'PUT',{items:[{name:' 합성 ',note:' 도움 ',date:'2026-01-02'},{name:' '}],if_revision:0}],[put,'PUT',{items:[],if_revision:0}],[get,'GET',null]]) {
        const res=await handler({env:f.env,request:await request(f,'/api/settings/contributors',body,method)});
        result.push({status:res.status,body:await res.json()});
      }
      result.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());out.push(result);
    }
    assert.deepEqual(out[1],out[0]);assert.deepEqual(out[1].slice(0,4).map(x=>x.status),[200,200,409,200]);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('hero settings preserve automatic ordering, manual slots, framing and revision conflicts',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try{
    const output=[];
    for(const [f,get,put] of [[before,oldGetHero,oldPutHero],[after,getHero,putHero]]) {
      f.sqlite.exec(`ALTER TABLE posts ADD COLUMN subtitle TEXT; ALTER TABLE posts ADD COLUMN image_url TEXT; ALTER TABLE posts ADD COLUMN created_at TEXT; ALTER TABLE posts ADD COLUMN publish_at TEXT; ALTER TABLE posts ADD COLUMN published INTEGER; INSERT INTO posts VALUES(1,'첫 기사','korea','','','2026-01-01',NULL,1),(2,'둘째 기사','apr','','','2026-01-02',NULL,1),(3,'비공개','wosm','','','2026-01-03',NULL,0)`);
      const rows=[];
      for(const [handler,method,body] of [[get,'GET',null],[put,'PUT',{manual_post_ids:[1,3],manual_position:'before_auto',interval_ms:3500,media_map:{1:{fit:'contain'}},if_revision:0}],[get,'GET',null],[put,'PUT',{manual_post_ids:[],if_revision:0}]]) {
        const response=await handler({env:f.env,request:await request(f,'/api/settings/hero',body,method)});
        rows.push({status:response.status,body:await response.json()});
      }
      rows.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());output.push(rows);
    }
    assert.deepEqual(output[1],output[0]);assert.deepEqual(output[1].slice(0,4).map(x=>x.status),[200,200,200,409]);
    assert.deepEqual(output[1][2].body.posts.map(p=>p.id),[1,2]);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('memorabilia list matches legacy public/admin filtering, literal search and pagination',async()=>{
  for(const [role,perms,suffix] of [['anonymous',[],''],['anonymous',[],'?scope=admin&include_drafts=1'],['member',['view:memorabilia'],'?scope=admin&include_drafts=1&q=%EC%B0%BE%EA%B8%B0_%25'],['member',['view:memorabilia'],'?scope=admin&include_drafts=1&event_id=5'],['owner',[],'?scope=admin&include_drafts=1&limit=1&page=2'],['member',['view:list'],'?scope=admin&include_drafts=1'],['anonymous',[],'?limit=-1']]) {
    const before=fixture(perms,role==='owner'?'owner':'member'),after=fixture(perms,role==='owner'?'owner':'member');
    try {
      const out=[];
      for(const [f,handler] of [[before,oldListMemorabilia],[after,listMemorabilia]]) {
        seedMemorabilia(f);
        f.sqlite.exec("UPDATE memorabilia SET title_ko='찾기_%',status='public',event_id=5 WHERE id=1; INSERT INTO memorabilia(id,slug,title_ko,status,updated_at,event_id) VALUES(2,'draft','비공개', 'draft','2099-01-01',5),(3,'pub','공개', 'public','2026-01-01',6); INSERT INTO memorabilia_categories(id,slug,label_ko) VALUES(4,'sample','합성'); UPDATE memorabilia SET category_id=4 WHERE id=1; INSERT INTO memorabilia_images(id,memorabilia_id,url,is_primary,sort_order) VALUES(1,1,'https://example.invalid/a.png',1,0); INSERT INTO memorabilia_tag_pool(id,label) VALUES(1,'합성'); INSERT INTO memorabilia_tags VALUES(1,1)");
        const req=role==='anonymous'?new Request('https://synthetic.invalid/api/memorabilia'+suffix):await request(f,'/api/memorabilia'+suffix,null,'GET');
        const response=await handler({env:f.env,request:req});
        out.push({status:response.status,cache:response.headers.get('cache-control'),body:await response.json()});
      }
      assert.deepEqual(out[1],out[0],JSON.stringify([role,perms,suffix]));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('Rust image MIME header validation matches legacy and uses no image body',async()=>{
  for (const header of ['data:image/png;base64','data:image/JPG;base64','data:image/webp;anything','data:image/gif','data:image/svg+xml;base64','data:IMAGE/İ;base64','DATA:image/png;base64','data:',' data:image/jpeg;base64','data:image/jpeg\ud800;base64','data:image/png;'+ 'x'.repeat(16385)]) {
    let called=false;
    const actual=await parseImageMimeRust(header,{},async (...args)=>{called=true;assert.deepEqual(args[2],{header});return queryRust(...args);});
    const fallback=await parseImageMimeRust(header,{},async()=>{throw new Error('synthetic failure');});
    assert.deepEqual(actual,fallback,header.slice(0,80));
    assert.equal(called,header.length<=16384 && !header.includes('\ud800'));
  }
});

test('Rust image cleanup keys preserve URL parsing and never select a different object',async()=>{
  const origin='https://synthetic.invalid';
  for (const value of ['',null,'/api/images/example.png','/api/images/%ED%95%9C%20%EA%B8%80.png','https://other.invalid/api/images/a%2Fb.png?x=1','/api/images/%25','/api/images/%ED%A0%80','/api/images/%GG','/api/images/../secret','/api/images/','https://synthetic.invalid/img/a','/api/images/\ud800','/api/images/'+ 'x'.repeat(16385)]) {
    const expected=extractImageKeyFromUrl(value,origin);
    if (typeof value==='string' && value && value.length<=16384 && !value.includes('\ud800')) {
      const direct=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'image-storage-key',{value,origin});
      assert.equal(direct.status,200);
      assert.equal((await direct.json()).key,expected,String(value).slice(0,80));
    }
    assert.equal(await extractImageKeyFromUrlRust(value,origin,{}),expected,String(value).slice(0,80));
    assert.equal(await extractImageKeyFromUrlRust(value,origin,{},async()=>new Response('',{status:503})),expected);
    assert.equal(await extractImageKeyFromUrlRust(value,origin,{},async()=>Response.json({key:'wrong-object'})),expected);
  }
  const removed=[];
  const env={POST_IMAGES:{put(){},async delete(key){removed.push(key);}}};
  await deleteStoredImageByUrl(env,'/api/images/%ED%95%9C%20%EA%B8%80.png',origin);
  await deleteStoredImageByUrl(env,'/api/images/%GG',origin);
  assert.deepEqual(removed,['한 글.png']);
});

test('Rust shared image magic detector matches legacy formats and failure fallback',async()=>{
  const fixtures=[[],[255,216,255], [255,216,255,...Array(9).fill(0)], [137,80,78,71,13,10,26,10,0,0,0,0], [...Buffer.from('GIF87a'),0,0,0,0,0,0], [...Buffer.from('GIF89a'),0,0,0,0,0,0], [...Buffer.from('RIFF1234WEBP')], [...Buffer.from('RIFF1234NOPE')], [...Buffer.from('<svg></svg>!')]];
  for(const fixture of fixtures) {
    const bytes=Uint8Array.from(fixture);let called=false;
    const detected=await detectImageMagicRust(bytes,{},async (...args)=>{called=true;assert(args[2].header.length<=12);const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(called,true);assert.equal(detected,detectImageMagic(bytes));
    assert.equal(await detectImageMagicRust(bytes,{},async()=>new Response('',{status:503})),detectImageMagic(bytes));
  }
  for(let i=0;i<100;i++) {
    const bytes=Uint8Array.from({length:i%17},(_,j)=>(i*37+j*19)%256);
    assert.equal(await detectImageMagicRust(bytes,{}),detectImageMagic(bytes));
  }
});

test('draft create rolls back insert and pruning if batch result lookup fails',async()=>{
  const f=fixture([],'owner');
  try {
    const schema=readFileSync(new URL('../db/migration_070.sql',import.meta.url),'utf8').match(/CREATE TABLE IF NOT EXISTS drafts \([\s\S]*?\);/)[0];
    f.sqlite.exec(schema);
    for(let i=0;i<10;i++) f.sqlite.prepare('INSERT INTO drafts(owner_editor_code,title) VALUES(?,?)').run('owner','기존 '+i);
    const fields=Array(20).fill(null);fields[1]='새 초안';fields[16]=1;fields[17]=0;fields[18]=0;fields[19]='본문';
    const context={env:f.env,request:{url:'https://synthetic.invalid/'}};
    f.state.failOnSql=/SELECT \* FROM drafts WHERE id=last_insert_rowid/;
    const failed=await queryRust(context,'draft-create',{owner:'owner',fields});
    assert.equal(failed.ok,false);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM drafts').get().n,10);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM drafts WHERE title='새 초안'").get().n,0);
    f.state.failOnSql=null;
    const result=await queryRust(context,'draft-create',{owner:'owner',fields});
    assert.equal(result.ok,true);const {draft}=await result.json();
    assert.equal(draft.title,'새 초안');assert.equal(draft.content,'본문');assert.equal(draft.published_flag,true);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM drafts').get().n,10);
  } finally {f.sqlite.close();}
});

test('Rust draft text normalization preserves JavaScript UTF-16 limits and fallback',async()=>{
  const longFields=Object.fromEntries(['title','subtitle','category','tag','meta_tags','author','publish_at','youtube_url','image_caption','location_name','location_address','special_feature'].map(key=>[key,'😀'.repeat(1100)]));
  const fixtures=[{},longFields, {title:'가'.repeat(399)+'😀끝',category:'',subtitle:'\ud800',tag:'태그'.repeat(800),meta_tags:'m'.repeat(2100),author:5,image_caption:['a','b'],location_name:'서울',special_feature:'<특집>'}, {title:false,category:42,youtube_url:{a:1},location_address:'x'.repeat(450)}];
  for(const raw of fixtures) {
    let called=false;
    const actual=await normalizeDraftTextRust(raw,{},async (...args)=>{called=true;const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(called,true);assert.deepEqual(actual,normalizeDraftText(raw));
    assert.deepEqual(await normalizeDraftTextRust(raw,{},async()=>new Response('',{status:503})),normalizeDraftText(raw));
  }
  const output=await normalizeDraftFields({title:'제목',category:'',editing_post_id:null,published_flag:false,featured_flag:true,manual_related_posts:[1,2],content:'본문'}, {},'https://synthetic.invalid');
  assert.equal(output.title,'제목');assert.equal(output.category,'korea');assert.equal(output.editing_post_id,0);
  assert.equal(output.published_flag,0);assert.equal(output.featured_flag,1);assert.equal(output.manual_related_posts,'[1,2]');assert.equal(output.content,'본문');
});

test('combined draft text and storage matches the separate path for create and update',async()=>{
  const f=fixture([],'owner');
  try {
    f.sqlite.exec(readFileSync(new URL('../db/migration_070.sql',import.meta.url),'utf8').match(/CREATE TABLE IF NOT EXISTS drafts \([\s\S]*?\);/)[0]);
    const names=['editing_post_id','title','subtitle','category','tag','meta_tags','author','publish_at','youtube_url','image_url','image_caption','gallery_images','location_name','location_address','special_feature','manual_related_posts','published_flag','featured_flag','ai_assisted','content'];
    const context={env:f.env,request:{url:'https://synthetic.invalid/'}};
    for(const raw of [{title:'합성 기사',tag:'야영',content:'본문'},{title:'가'.repeat(399)+'😀끝',subtitle:'😀'.repeat(205),category:'',featured_flag:true,manual_related_posts:[1,2]}]) {
      const separate=await normalizeDraftFields(raw,f.env,'https://synthetic.invalid');
      const combined=await normalizeDraftFields(raw,f.env,'https://synthetic.invalid',{deferText:true});
      const previous=await queryRust(context,'draft-create',{owner:'owner',fields:names.map(key=>separate[key])});
      const next=await queryRust(context,'draft-create',{owner:'owner',fields:names.map(key=>combined[key]),text_units:combined.text_units});
      assert.equal(previous.status,200);
      assert.equal(next.status,previous.status);
      if(previous.ok) {
        const before=(await previous.json()).draft,after=(await next.json()).draft;
        assert.deepEqual(Object.fromEntries(names.map(k=>[k,after[k]])),Object.fromEntries(names.map(k=>[k,before[k]])));
        const updated=await queryRust(context,'draft-operation',{operation:'update',owner:'owner',id:after.id,fields:names.map(key=>combined[key]),text_units:combined.text_units});
        assert.equal(updated.status,200);
        const row=(await updated.json()).draft;
        assert.deepEqual(Object.fromEntries(names.map(k=>[k,row[k]])),Object.fromEntries(names.map(k=>[k,after[k]])));
      }
    }
    const incomplete=await normalizeDraftFields({title:'누락 검사'},f.env,'https://synthetic.invalid',{deferText:true});
    delete incomplete.text_units.title;
    const beforeCount=f.sqlite.prepare('SELECT COUNT(*) AS n FROM drafts').get().n;
    const rejected=await queryRust(context,'draft-create',{owner:'owner',fields:names.map(key=>incomplete[key]),text_units:incomplete.text_units});
    assert.equal(rejected.status,500);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM drafts').get().n,beforeCount);
  } finally {f.sqlite.close();}
});

test('Rust memorabilia image validation matches legacy bounds and preserves fallback',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  const prefix='data:image/png;base64,';
  const inputs=['','hello','DATA:image/png;base64,AAAA','data:image/png;base64,AAAA','data:image/JPEG;base64,AAAA','data:image/svg+xml;base64,AAAA','data:image/;base64,AAAA','data:image/png', prefix+'x'.repeat(12*1024*1024-prefix.length), prefix+'x'.repeat(12*1024*1024), prefix+'😀'.repeat(20), 'data:image/\ud800;base64,AAAA'];
  for(const input of inputs) {
    const expected=validateUpload(input);let called=false;
    const result=await validateUploadRust(input,context,async (...args)=>{called=true;assert.equal(args[2].header.includes('base64'),false);const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.deepEqual(result,expected);assert.equal(called,!input.includes('\ud800'));
    assert.deepEqual(await validateUploadRust(input,context,async()=>new Response('',{status:503})),expected);
  }
});

test('memorabilia detail matches legacy images, tags, related public records and drafts',async()=>{
  for(const [kind,identifier,includeDrafts] of [['id',1,false],['id',1,true],['id',999,false],['slug','synthetic',false],['slug','synthetic',true]]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const output=[];
      for(const [f,idFn,slugFn] of [[before,oldMemoId,oldMemoSlug],[after,memoId,memoSlug]]) {
        seedMemorabilia(f);
        f.sqlite.exec(`UPDATE memorabilia SET related_memorabilia_json='[3,2,1]',related_links_json='[{"url":"https://example.invalid/"}]' WHERE id=1; INSERT INTO memorabilia(id,slug,title_ko,status) VALUES(2,'draft-two','숨김','draft'),(3,'public-three','공개','public'); INSERT INTO memorabilia_countries VALUES(1,'KR'),(3,'US'); INSERT INTO memorabilia_tag_pool(id,label) VALUES(1,'합성 태그'); INSERT INTO memorabilia_tags VALUES(1,1); INSERT INTO memorabilia_images(id,memorabilia_id,url,is_primary,sort_order) VALUES(1,1,'https://example.invalid/a',1,0),(2,3,'https://example.invalid/b',1,0)`);
        output.push(await (kind==='id'?idFn:slugFn)(f.env.DB,identifier,{includeDrafts}));
      }
      assert.deepEqual(JSON.parse(JSON.stringify(output[1])),JSON.parse(JSON.stringify(output[0])),JSON.stringify([kind,identifier,includeDrafts]));
      if(includeDrafts&&identifier!=='missing') {
        assert.deepEqual(output[1].related_memorabilia_ids,[3]);
        const payload={includeDrafts,hydrate:true,[kind]:identifier};
        const response=await queryRust({env:after.env,request:{url:'https://synthetic.invalid/'}},'memorabilia-detail',payload);
        assert.equal(response.ok,true);
        assert.deepEqual((await response.json()).item,JSON.parse(JSON.stringify(output[0])));
        const idResponse=await queryRust({env:after.env,request:{url:'https://synthetic.invalid/'}},'memorabilia-id-response',{id:1,includeDrafts:true});
        assert.equal(idResponse.status,200);assert.equal(idResponse.headers.get('cache-control'),'no-store');
        assert.deepEqual((await idResponse.json()).item,JSON.parse(JSON.stringify(output[0])));
        assert.equal((await queryRust({env:after.env,request:{url:'https://synthetic.invalid/'}},'memorabilia-id-response',{id:1,includeDrafts:false})).status,404);
      }
      if(!includeDrafts) assert.equal(output[1],null);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust memorabilia hydration preserves JSON edge cases and falls back for unusual values',async()=>{
  assert.deepEqual(JSON.parse(readFileSync(new URL('../server-rust/src/country_labels.json',import.meta.url),'utf8')),COUNTRY_CODE_LABELS_KO);
  for(const [links,code,expectRust] of [['invalid-json','KR',true],['false','US',true],['[9007199254740993]','ZZ',true],['"\\ud800"','KR',false],['[]','__proto__',false]]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      for(const f of [before,after]) {
        seedMemorabilia(f);
        f.sqlite.prepare('UPDATE memorabilia SET related_links_json=?,related_memorabilia_json=? WHERE id=1').run(links,'[]');
        f.sqlite.prepare('INSERT INTO memorabilia_countries VALUES(1,?)').run(code);
      }
      const old=await oldMemoId(before.env.DB,1,{includeDrafts:true});
      const current=await memoId(after.env.DB,1,{includeDrafts:true});
      assert.deepEqual(JSON.parse(JSON.stringify(current)),JSON.parse(JSON.stringify(old)));
      const response=await queryRust({env:after.env,request:{url:'https://synthetic.invalid/'}},'memorabilia-detail',{id:1,includeDrafts:true,hydrate:true});
      const data=await response.json();
      assert.equal(!!data.item,expectRust);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust public memorabilia slug preserves status, visibility, caching and UTF-16 fallback',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.prepare("UPDATE memorabilia SET status='public',related_links_json='[]',related_memorabilia_json='[]' WHERE id=1").run();
    const request=new Request('https://synthetic.invalid/api/memorabilia/slug/synthetic');
    for(const [slug,status] of [[' synthetic ',200],['   ',400],['missing',404],['x'.repeat(119)+'😀',404]]) {
      if(slug!=='x'.repeat(119)+'😀') {
        const direct=await queryRust({env:f.env,request},'memorabilia-public-slug',{slug});
        assert.equal(direct.status,status);
      }
      const response=await publicMemoSlug({request,env:f.env,params:{slug}});
      assert.equal(response.status,status);
      assert.match(response.headers.get('content-type'),/^application\/json; charset=utf-8$/);
      if(status===200) {
        assert.equal(response.headers.get('cache-control'),'public, max-age=300, s-maxage=300, stale-while-revalidate=1800');
        assert.deepEqual((await response.json()).item,JSON.parse(JSON.stringify(await oldMemoSlug(f.env.DB,'synthetic',{includeDrafts:false}))));
      }
    }
    const boundary=await queryRust({env:f.env,request},'memorabilia-public-slug',{slug:'x'.repeat(119)+'😀'});
    assert.equal(boundary.status,409);
    f.sqlite.prepare("UPDATE memorabilia SET status='draft' WHERE id=1").run();
    assert.equal((await publicMemoSlug({request,env:f.env,params:{slug:'synthetic'}})).status,404);
  } finally {f.sqlite.close();}
});


test('memorabilia update matches legacy content, CAS, relations and FTS writes',async()=>{
  for(const [id,stamp,status] of [[1,'2999-01-01 00:00:00.000','public'],[1,'stale','draft'],[999,'2999-01-01 00:00:00.000','draft']]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const output=[];
      for(const [f,normalize,update] of [[before,oldNormalizeMemo,oldUpdateMemo],[after,normalizeMemo,updateMemo]]) {
        seedMemorabilia(f);f.sqlite.prepare("UPDATE memorabilia SET updated_at='2999-01-01 00:00:00.000' WHERE id=1").run();
        const {input,errors}=normalize({title_ko:'합성 수정',status,country_codes:['KR'],tags:['테스트'],images:[]});assert.deepEqual(errors,[]);
        const result=await update(f.env.DB,id,input,{expectedUpdatedAt:stamp});
        const item=f.sqlite.prepare('SELECT id,title_ko,status,updated_at FROM memorabilia WHERE id=1').get();
        output.push({result,item,countries:f.sqlite.prepare('SELECT * FROM memorabilia_countries').all(),tags:f.sqlite.prepare('SELECT memorabilia_id,tag_id FROM memorabilia_tags').all(),fts:f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts').all(),event:f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get()});
      }
      assert.deepEqual(JSON.parse(JSON.stringify(output[1])),JSON.parse(JSON.stringify(output[0])),JSON.stringify([id,stamp,status]));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('prepared memorabilia search index values preserve legacy multilingual tokens',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try {
    for(const f of [before,after])seedMemorabilia(f);
    const item={id:1,title_ko:'한국 잼버리',title_en:'Scout jamboree',event_name_ko:'세계 행사',issuer_ko:'발행처',material_ko:'금속',description_plain_ko:'야영 활동',category_label_ko:'기념품',category_label_en:'souvenir',tags:['태그','scout'],country_codes:['KR','US']};
    await oldUpsertMemoFts(before.env.DB,item);await upsertMemoFts(after.env.DB,item);
    const old=before.sqlite.prepare('SELECT * FROM memorabilia_fts').get(),current=after.sqlite.prepare('SELECT * FROM memorabilia_fts').get();
    assert.deepEqual(current,old);
    const values=buildMemorabiliaFtsValues(item);
    assert.equal(values.length,16);
    assert.equal(values[15],1);
    assert.match(values[13],/ㅎㅏㄴ/);
    assert.match(values[14],/ㅎㄱ/);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('memorabilia batch rolls back content, event, relations and index when any stage fails',async()=>{
  for(const failure of [/UPDATE memorabilia_events SET/,/DELETE FROM memorabilia_countries/,/INSERT OR IGNORE INTO memorabilia_tag_pool/,/INSERT INTO memorabilia_images/,/UPDATE memorabilia SET related_memorabilia_json/,/INSERT INTO memorabilia_fts/]) {
    const f=fixture([],'owner');
    try {
      seedMemorabilia(f);
      f.sqlite.exec(`INSERT INTO memorabilia(id,slug,title_ko,status,related_memorabilia_json) VALUES(2,'related','관련','public','[]'); INSERT INTO memorabilia_countries VALUES(1,'KR'); INSERT INTO memorabilia_images(id,memorabilia_id,url,is_primary,sort_order) VALUES(1,1,'https://example.invalid/old',1,0); INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('saved',1)`);
      const snapshot=()=>({memo:f.sqlite.prepare('SELECT id,title_ko,event_id,status,updated_at,related_memorabilia_json FROM memorabilia ORDER BY id').all(),countries:f.sqlite.prepare('SELECT * FROM memorabilia_countries').all(),images:f.sqlite.prepare('SELECT * FROM memorabilia_images').all(),tags:f.sqlite.prepare('SELECT * FROM memorabilia_tags').all(),pool:f.sqlite.prepare('SELECT * FROM memorabilia_tag_pool').all(),fts:f.sqlite.prepare('SELECT * FROM memorabilia_fts').all(),event:f.sqlite.prepare('SELECT * FROM memorabilia_events').all()});
      const previous=snapshot();f.state.failOnSql=failure;
      const body={title_ko:'실패해야 하는 수정',status:'draft',expected_updated_at:'old',country_codes:['US'],tags:['새 태그'],images:[{url:'https://example.invalid/new',is_primary:true}],related_memorabilia:[2]};
      const res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',body,'PATCH')});
      assert.equal(res.status,500,String(failure));assert.deepEqual(snapshot(),previous,String(failure));
    } finally {f.sqlite.close();}
  }
});


test('memorabilia update preserves a concurrent related-item edit and rolls back',async()=>{
  for(const prior of ['[]','[1]']) {
    const f=fixture([],'owner');
    try {
      seedMemorabilia(f);
      f.sqlite.prepare("INSERT INTO memorabilia(id,slug,title_ko,status,related_memorabilia_json) VALUES(2,'related','관련','public',?)").run(prior);
      f.state.beforeBatch=()=>f.sqlite.prepare('UPDATE memorabilia SET related_memorabilia_json=? WHERE id=2').run('[9]');
      const body={title_ko:'변경 금지',status:'draft',expected_updated_at:'old',related_memorabilia:[2]};
      const res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',body,'PATCH')});
      assert.equal(res.status,500);
      assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia WHERE id=1').get().title_ko,'saved');
      assert.equal(f.sqlite.prepare('SELECT related_memorabilia_json FROM memorabilia WHERE id=2').get().related_memorabilia_json,'[9]');
      assert.equal(f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get().usage_count,5);
    } finally {f.sqlite.close();}
  }
});


test('atomic memorabilia update preserves legacy multi-tag and Korean FTS content',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try {
    const out=[];
    for(const [f,normalize,update] of [[before,oldNormalizeMemo,oldUpdateMemo],[after,normalizeMemo,updateMemo]]) {
      seedMemorabilia(f);
      f.sqlite.exec("UPDATE memorabilia SET updated_at='2999-01-01 00:00:00.000' WHERE id=1; INSERT INTO memorabilia_categories(id,slug,label_en,label_ko) VALUES(7,'badge','Badge','배지'); INSERT INTO memorabilia_tag_pool(id,label) VALUES(5,'둘째'),(9,'첫째')");
      const {input}=normalize({title_ko:'세계 잼버리',title_en:'World Jamboree',status:'public',category_id:7,country_codes:['US','KR'],tags:['첫째','둘째','새 태그'],images:[]});
      await update(f.env.DB,1,input,{expectedUpdatedAt:'2999-01-01 00:00:00.000'});
      out.push(f.sqlite.prepare('SELECT * FROM memorabilia_fts WHERE memorabilia_id=1').get());
    }
    assert.deepEqual(out[1],out[0]);
    assert.match(out[1].jamo_blob,/ㅈㅐㅁ/);assert.match(out[1].choseong_blob,/ㅈㅂㄹ/);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('memorabilia update preserves concurrent category and tag catalog edits',async()=>{
  for(const kind of ['category','tag']) {
    const f=fixture([],'owner');
    try {
      seedMemorabilia(f);
      f.sqlite.exec("INSERT INTO memorabilia_categories(id,slug,label_en,label_ko) VALUES(7,'badge','Badge','배지'); INSERT INTO memorabilia_tag_pool(id,label) VALUES(9,'기존태그')");
      f.state.beforeBatch=()=>{if(kind==='category') f.sqlite.exec("UPDATE memorabilia_categories SET label_ko='다른 분류명' WHERE id=7");else f.sqlite.exec("DELETE FROM memorabilia_tag_pool WHERE id=9; INSERT INTO memorabilia_tag_pool(id,label) VALUES(12,'기존태그')");};
      const body={title_ko:'변경 금지',status:'draft',category_id:7,tags:['기존태그'],expected_updated_at:'old'};
      const res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',body,'PATCH')});
      assert.equal(res.status,500,kind);
      assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia WHERE id=1').get().title_ko,'saved');
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_fts').get().n,0);
    } finally {f.sqlite.close();}
  }
});


test('memorabilia update preserves a concurrent event-catalog rename',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);f.sqlite.exec("UPDATE memorabilia_events SET name_en='Old event',name_ko='이전 행사' WHERE id=1");
    f.state.beforeBatch=()=>f.sqlite.exec("UPDATE memorabilia_events SET name_ko='새 행사' WHERE id=1");
    const body={title_ko:'변경 금지',status:'draft',has_event:true,event_id:1,expected_updated_at:'old'};
    const res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',body,'PATCH')});
    assert.equal(res.status,500);
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia WHERE id=1').get().title_ko,'saved');
    assert.equal(f.sqlite.prepare('SELECT name_ko FROM memorabilia_events WHERE id=1').get().name_ko,'새 행사');
  } finally {f.sqlite.close();}
});


test('atomic memorabilia save handles maximum relations and long content',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);
    for(let id=2;id<=13;id++)f.sqlite.prepare('INSERT INTO memorabilia(id,slug,title_ko,status,related_memorabilia_json) VALUES(?,?,?,?,?)').run(id,'related-'+id,'관련 '+id,'public','[]');
    const body={title_ko:'큰 합성 항목',status:'draft',description_ko:'장문'.repeat(20000),country_codes:['KR','US','JP','GB','FR','DE','CA','AU'],tags:Array.from({length:30},(_,i)=>'합성태그'+i),images:Array.from({length:20},(_,i)=>({url:'https://example.invalid/'+i,is_primary:i===0})),related_memorabilia:Array.from({length:12},(_,i)=>i+2),expected_updated_at:'old'};
    const res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',body,'PATCH')});
    assert.equal(res.status,200);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_countries WHERE memorabilia_id=1').get().n,8);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_tags WHERE memorabilia_id=1').get().n,30);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_images WHERE memorabilia_id=1').get().n,20);
    for(let id=2;id<=13;id++)assert.deepEqual(JSON.parse(f.sqlite.prepare('SELECT related_memorabilia_json FROM memorabilia WHERE id=?').get(id).related_memorabilia_json),[1]);
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'큰 합성 항목');
  } finally {f.sqlite.close();}
});


test('legacy memorabilia saves without a version still work and reject concurrent changes',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);
    let res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',{title_ko:'구형 저장',status:'draft'},'PATCH')});
    assert.equal(res.status,200);
    f.state.beforeBatch=()=>f.sqlite.exec("UPDATE memorabilia SET title_ko='다른 저장',updated_at='newer' WHERE id=1");
    res=await patchMemorabilia({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',{title_ko:'덮어쓰기 금지',status:'draft'},'PATCH')});
    assert.equal(res.status,409);
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia WHERE id=1').get().title_ko,'다른 저장');
  } finally {f.sqlite.close();}
});


test('memorabilia deletion preserves legacy FTS cleanup and event counts',async()=>{
  for(const [id,withEvent] of [[1,true],[1,false],[999,false]]) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const out=[];
      for(const [f,del] of [[before,oldDeleteMemo],[after,deleteMemo]]) {
        seedMemorabilia(f);
        if(!withEvent) f.sqlite.exec('UPDATE memorabilia SET event_id=NULL WHERE id=1');
        f.sqlite.prepare('INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES(?,?)').run('합성 색인',id);
        await del(f.env.DB,id);
        out.push({item:f.sqlite.prepare('SELECT id FROM memorabilia WHERE id=1').get()||null,fts:f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts').all(),count:f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get().usage_count});
      }
      assert.deepEqual(out[1],out[0],JSON.stringify([id,withEvent]));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('memorabilia deletion rolls back FTS and event count when any stage fails',async()=>{
  for(const failure of [/DELETE FROM memorabilia_fts/,/UPDATE memorabilia_events SET/,/^DELETE FROM memorabilia WHERE/]) {
    const f=fixture([],'owner');
    try {
      seedMemorabilia(f);f.sqlite.exec("INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('saved',1)");
      f.state.failOnSql=failure;
      const response=await (await import('../functions/api/memorabilia/[id].js')).onRequestDelete({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/1',{},'DELETE')});
      assert.equal(response.status,500,String(failure));
      assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia WHERE id=1').get().title_ko,'saved');
      assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'saved');
      assert.equal(f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get().usage_count,5);
    } finally {f.sqlite.close();}
  }
});


test('memorabilia creation matches legacy slug, relations and search indexing',async()=>{
  const before=fixture([],'owner'),after=fixture([],'owner');
  try{
    const out=[];
    for(const [f,normalize,create] of [[before,oldNormalizeMemo,oldCreateMemo],[after,normalizeMemo,createMemo]]){
      seedMemorabilia(f);f.sqlite.exec("UPDATE memorabilia SET related_memorabilia_json='[]' WHERE id=1; UPDATE memorabilia_events SET name_en='Scout Camp',name_ko='스카우트 캠프' WHERE id=1");
      const {input,errors}=normalize({title_ko:'합성 신규',status:'public',has_event:true,event_id:1,country_codes:['US','KR'],tags:['신규태그'],images:[{url:'https://example.invalid/new.png',is_primary:true}],related_memorabilia:[1]});
      assert.deepEqual(errors,[]);const id=await create(f.env.DB,input,{createdBy:'synthetic'});
      out.push({id,item:f.sqlite.prepare('SELECT id,slug,title_ko,status,event_id,event_name_ko FROM memorabilia WHERE id=?').get(id),event:f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get(),countries:f.sqlite.prepare('SELECT * FROM memorabilia_countries WHERE memorabilia_id=? ORDER BY country_code').all(id),tags:f.sqlite.prepare('SELECT * FROM memorabilia_tags WHERE memorabilia_id=?').all(id),related:f.sqlite.prepare('SELECT related_memorabilia_json FROM memorabilia WHERE id=1').get(),fts:f.sqlite.prepare('SELECT * FROM memorabilia_fts WHERE memorabilia_id=?').get(id)});
    }
    assert.deepEqual(out[1],out[0]);assert.equal(out[1].item.slug,'합성-신규-2');assert.equal(out[1].event.usage_count,6);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('memorabilia creation rolls back every stage on failure',async()=>{
  for(const failure of [/UPDATE memorabilia_events SET/,/INSERT OR IGNORE INTO memorabilia_countries/,/INSERT OR IGNORE INTO memorabilia_tag_pool/,/INSERT INTO memorabilia_images/,/UPDATE memorabilia SET related_memorabilia_json/,/INSERT INTO memorabilia_fts/,/UPDATE memorabilia SET slug/]) {
    const f=fixture([],'owner');
    try {
      seedMemorabilia(f);f.sqlite.exec("UPDATE memorabilia SET related_memorabilia_json='[]' WHERE id=1; UPDATE memorabilia_events SET name_en='Camp',name_ko='캠프' WHERE id=1; INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('saved',1)");
      const snapshot=()=>({memo:f.sqlite.prepare('SELECT id,slug,title_ko,status,event_id,related_memorabilia_json FROM memorabilia ORDER BY id').all(),event:f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get(),countries:f.sqlite.prepare('SELECT * FROM memorabilia_countries').all(),images:f.sqlite.prepare('SELECT * FROM memorabilia_images').all(),tags:f.sqlite.prepare('SELECT * FROM memorabilia_tags').all(),pool:f.sqlite.prepare('SELECT * FROM memorabilia_tag_pool').all(),fts:f.sqlite.prepare('SELECT * FROM memorabilia_fts').all()});
      const original=snapshot();f.state.failOnSql=failure;
      const {input}=normalizeMemo({title_ko:'실패할 신규',status:'public',has_event:true,event_id:1,country_codes:['KR'],tags:['새 태그'],images:[{url:'https://example.invalid/new.png',is_primary:true}],related_memorabilia:[1]});
      await assert.rejects(createMemo(f.env.DB,input,{createdBy:'synthetic'}),String(failure));
      assert.deepEqual(snapshot(),original,String(failure));
    } finally {f.sqlite.close();}
  }
});

test('memorabilia creation preserves concurrent related and catalog edits',async()=>{
  for(const kind of ['related','category','tag','event']) {
    const f=fixture([],'owner');
    try {
      seedMemorabilia(f);f.sqlite.exec("UPDATE memorabilia SET related_memorabilia_json='[]' WHERE id=1; UPDATE memorabilia_events SET name_en='Camp',name_ko='캠프' WHERE id=1; INSERT INTO memorabilia_categories(id,slug,label_en,label_ko) VALUES(7,'badge','Badge','배지'); INSERT INTO memorabilia_tag_pool(id,label) VALUES(9,'기존태그')");
      f.state.beforeBatch=()=>{if(kind==='related')f.sqlite.exec("UPDATE memorabilia SET related_memorabilia_json='[9]' WHERE id=1");if(kind==='category')f.sqlite.exec("UPDATE memorabilia_categories SET label_ko='변경 분류' WHERE id=7");if(kind==='tag')f.sqlite.exec("DELETE FROM memorabilia_tag_pool WHERE id=9; INSERT INTO memorabilia_tag_pool(id,label) VALUES(12,'기존태그')");if(kind==='event')f.sqlite.exec("UPDATE memorabilia_events SET name_ko='변경 행사' WHERE id=1");};
      const {input}=normalizeMemo({title_ko:'경쟁 신규',status:'draft',has_event:true,event_id:1,category_id:7,tags:['기존태그'],related_memorabilia:[1]});
      await assert.rejects(createMemo(f.env.DB,input,{createdBy:'synthetic'}));
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia').get().n,1);
      assert.equal(f.sqlite.prepare('SELECT usage_count FROM memorabilia_events WHERE id=1').get().usage_count,5);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_fts').get().n,0);
    } finally {f.sqlite.close();}
  }
});


test('atomic memorabilia creation supports maximum relations and large content',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);
    for(let id=2;id<=13;id++)f.sqlite.prepare('INSERT INTO memorabilia(id,slug,title_ko,status,related_memorabilia_json) VALUES(?,?,?,?,?)').run(id,'related-'+id,'관련 '+id,'public','[]');
    const {input}=normalizeMemo({title_ko:'대량 합성 신규',status:'public',description_ko:'장문'.repeat(20000),country_codes:['KR','US','JP','GB','FR','DE','CA','AU'],tags:Array.from({length:30},(_,i)=>'합성태그'+i),images:Array.from({length:20},(_,i)=>({url:'https://example.invalid/'+i,is_primary:i===0})),related_memorabilia:Array.from({length:12},(_,i)=>i+2)});
    const id=await createMemo(f.env.DB,input,{createdBy:'synthetic'});
    assert.equal(id,14);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_countries WHERE memorabilia_id=?').get(id).n,8);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_tags WHERE memorabilia_id=?').get(id).n,30);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_images WHERE memorabilia_id=?').get(id).n,20);
    for(let other=2;other<=13;other++)assert.deepEqual(JSON.parse(f.sqlite.prepare('SELECT related_memorabilia_json FROM memorabilia WHERE id=?').get(other).related_memorabilia_json),[id]);
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=?').get(id).title_ko,'대량 합성 신규');
  } finally {f.sqlite.close();}
});

test('memorabilia creation leaves an existing reciprocal reference untouched',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.prepare('UPDATE memorabilia SET related_memorabilia_json=? WHERE id=1').run('[ "2" ]');
    const {input}=normalizeMemo({title_ko:'신규',status:'draft',related_memorabilia:[1]});
    assert.equal(await createMemo(f.env.DB,input,{createdBy:'synthetic'}),2);
    assert.equal(f.sqlite.prepare('SELECT related_memorabilia_json FROM memorabilia WHERE id=1').get().related_memorabilia_json,'[ "2" ]');
  } finally {f.sqlite.close();}
});


test('Rust category CRUD matches legacy behavior and preserves in-use categories', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) { seedMemorabilia(f); f.sqlite.exec('ALTER TABLE memorabilia_categories ADD COLUMN updated_at TEXT; CREATE UNIQUE INDEX category_slug ON memorabilia_categories(slug)'); }
    const outcomes=[];
    for(const [f,get,post,patch,del] of [[before,oldCategoriesGet,oldCategoriesPost,oldCategoriesPatch,oldCategoriesDelete],[after,categoriesGet,categoriesPost,categoriesPatch,categoriesDelete]]) {
      const results=[];
      const invoke=async (handler,path,body,method,id)=>{const r=await handler({env:f.env,request:await request(f,path,body,method),params:{id}});results.push([r.status,await r.json()]);};
      await invoke(post,'/api/memorabilia/categories',{slug:'Badge!',label_ko:'배지',sort_order:4},'POST');
      await invoke(post,'/api/memorabilia/categories',{slug:'badge',label_en:'Duplicate'},'POST');
      await invoke(patch,'/api/memorabilia/categories/1',{label_en:'Badge',archived:false},'PATCH','1');
      await invoke(get,'/api/memorabilia/categories',{},'GET');
      f.sqlite.prepare('UPDATE memorabilia SET category_id=1 WHERE id=1').run();
      await invoke(del,'/api/memorabilia/categories/1',{},'DELETE','1');
      f.sqlite.prepare('UPDATE memorabilia SET category_id=NULL WHERE id=1').run();
      await invoke(del,'/api/memorabilia/categories/1',{},'DELETE','1');
      outcomes.push(results);
    }
    assert.deepEqual(outcomes[1],outcomes[0]);
    assert.equal(outcomes[1][1][0],409);
    assert.equal(outcomes[1][4][1].archived,true);
    assert.equal(outcomes[1][5][1].deleted,true);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust category deletion rolls back on failure and honors newly added usage', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f); f.sqlite.exec("ALTER TABLE memorabilia_categories ADD COLUMN updated_at TEXT; INSERT INTO memorabilia_categories(id,slug,archived) VALUES(1,'synthetic',0)");
    f.sqlite.prepare('UPDATE memorabilia SET category_id=1 WHERE id=1').run();
    f.state.failOnSql=/DELETE FROM memorabilia_categories/;
    const ctx={env:f.env,request:await request(f,'/api/memorabilia/categories/1',{},'DELETE'),params:{id:'1'}};
    assert.equal((await categoriesDelete(ctx)).status,500);
    assert.equal(f.sqlite.prepare('SELECT archived FROM memorabilia_categories WHERE id=1').get().archived,0);
    f.state.failOnSql=null;
    f.sqlite.prepare('UPDATE memorabilia SET category_id=NULL WHERE id=1').run();
    f.state.beforeBatch=()=>f.sqlite.prepare('UPDATE memorabilia SET category_id=1 WHERE id=1').run();
    const result=await categoriesDelete({...ctx,request:await request(f,'/api/memorabilia/categories/1',{},'DELETE')});
    assert.deepEqual(await result.json(),{ok:true,archived:true,in_use:1});
    assert.equal(f.sqlite.prepare('SELECT archived FROM memorabilia_categories WHERE id=1').get().archived,1);
  } finally {f.sqlite.close();}
});


test('Rust event categories preserve lists, usage, updates and event unlinking', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER REFERENCES memorabilia_event_categories(id) ON DELETE SET NULL; INSERT INTO memorabilia_event_categories VALUES(1,'camp','Camp','야영',1,0,'2026-01-01','2026-01-01'),(2,'old','Old','지난 행사',2,1,'2026-01-01','2026-01-01'); UPDATE memorabilia_events SET category_id=1 WHERE id=1");
    }
    const output=[];
    for(const [f,get,patch,del] of [[before,oldEventCatsGet,oldEventCatsPatch,oldEventCatsDelete],[after,eventCatsGet,eventCatsPatch,eventCatsDelete]]) {
      const results=[];
      for(const suffix of ['', '?include_archived=1']) {const r=await get({env:f.env,request:await request(f,'/api/memorabilia/event-categories'+suffix,{},'GET')});results.push([r.status,await r.json()]);}
      const p=await patch({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/event-categories/1',{label_ko:'합성 행사',sort_order:0},'PATCH')}); results.push([p.status,await p.json()]);
      results.push(f.sqlite.prepare('SELECT label_ko,sort_order FROM memorabilia_event_categories WHERE id=1').get());
      const d=await del({env:f.env,params:{id:'1'},request:await request(f,'/api/memorabilia/event-categories/1',{},'DELETE')});results.push([d.status,await d.json()]);
      results.push(f.sqlite.prepare('SELECT category_id FROM memorabilia_events WHERE id=1').get());
      output.push(results);
    }
    assert.deepEqual(output[1],output[0]);
    assert.equal(output[1][0][1].items[0].usage_count,1);
    assert.equal(output[1].at(-1).category_id,null);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust event category creation preserves validation and slug generation', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER)");
    const outputs=[];
    for(const [f,post] of [[before,oldEventCatsPost],[after,eventCatsPost]]) {
      const out=[];
      for(const body of [{label_en:'Scout Camp',label_ko:'야영',sort_order:3},{slug:'INVALID!',label_ko:'오류'},{}]) {
        const response=await post({env:f.env,request:await request(f,'/api/memorabilia/event-categories',body,'POST')});out.push([response.status,await response.json()]);
      }
      out.push(f.sqlite.prepare('SELECT id,slug,label_en,label_ko,sort_order,archived FROM memorabilia_event_categories').all());
      outputs.push(out);
    }
    assert.deepEqual(outputs[1],outputs[0]);
    assert.equal(outputs[1][0][1].slug,'scout-camp');
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('event category creation preserves database error response', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT UNIQUE,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER); CREATE TRIGGER reject_event_category BEFORE INSERT ON memorabilia_event_categories BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const responses=[];
    for(const [f,handler] of [[before,oldEventCatsPost],[after,eventCatsPost]]) {
      const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/event-categories',{slug:'failure',label_en:'Failure'},'POST')});responses.push([r.status,await r.json()]);
    }
    assert.deepEqual(responses[1],responses[0]);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust event CRUD preserves dates, category labels, live usage counts and ordering', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER); INSERT INTO memorabilia_event_categories VALUES(1,'camp','Camp','야영',1); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; UPDATE memorabilia_events SET slug='old',name_en='Old',name_ko='이전',archived=0,category_id=1,start_year=2020 WHERE id=1");
    }
    const results=[];
    for(const [f,list,get,create,update,del,normalize] of [[before,oldListEvents,oldGetEvent,oldCreateEvent,oldUpdateEvent,oldDeleteEvent,oldNormalizeEvent],[after,listEvents,getEvent,createEvent,updateEvent,deleteEvent,normalizeEventInput]]) {
      const input=(await normalize({name_en:'Synthetic Camp',name_ko:'합성 야영',category_id:1,start_year:2026,start_month:8,start_day:3,end_year:2026,end_month:8,end_day:9},f.env)).input;
      const id=await create(f.env.DB,input);
      f.sqlite.prepare('UPDATE memorabilia SET event_id=? WHERE id=1').run(id);
      const initial=await get(f.env.DB,id);
      const listed=await list(f.env.DB,{archived:true});
      await update(f.env.DB,id,{...input,name_ko:'수정된 행사',archived:1});
      const updated=await get(f.env.DB,id);
      const publicItems=await list(f.env.DB);
      await del(f.env.DB,id);
      results.push({id,initial,listed,updated,publicItems,remaining:await get(f.env.DB,id)});
    }
    for(const result of results) assert.match(result.updated.updated_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const normalized=results.map(result=>({...result,updated:{...result.updated,updated_at:'<timestamp>'}}));
    assert.deepEqual(normalized[1],normalized[0]);
    assert.equal(results[1].initial.usage_count,1);
    assert.equal(results[1].initial.category_label_ko,'야영');
    assert.equal(results[1].initial.period_text,'2026년 8월 3일 ~ 9일');
    assert.equal(results[1].remaining,null);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('event update protects changes made after its snapshot',async()=>{
  const f=fixture([],'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; UPDATE memorabilia_events SET slug='old',name_en='Original',name_ko='기존',archived=0 WHERE id=1");
    const snapshot=await getEvent(f.env.DB,1);
    const input=(await normalizeEventInput({name_en:'Original',name_ko:'내 수정'},f.env)).input;
    f.sqlite.prepare("UPDATE memorabilia_events SET name_ko='다른 수정' WHERE id=1").run();
    assert.deepEqual(await updateEvent(f.env.DB,1,input,snapshot),{conflict:true});
    assert.equal(f.sqlite.prepare('SELECT name_ko FROM memorabilia_events WHERE id=1').get().name_ko,'다른 수정');
    const fresh=await getEvent(f.env.DB,1);
    assert.equal(await updateEvent(f.env.DB,1,input,fresh),undefined);
    assert.equal(f.sqlite.prepare('SELECT name_ko FROM memorabilia_events WHERE id=1').get().name_ko,'내 수정');
  } finally {f.sqlite.close();}
});

test('Rust event period formatting preserves Korean and English date precision', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec('CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT');
    const cases = [
      [null,null,null,null,null,null], [2026,null,null,null,null,null], [null,null,null,2026,8,null],
      [2026,8,1,2026,8,1], [2026,8,1,2026,8,9], [2026,8,null,2026,9,3],
      [2026,8,1,2026,9,null], [2026,null,null,2027,3,5], [2026,13,0,2026,14,2],
    ];
    for (const values of cases) {
      f.sqlite.prepare('UPDATE memorabilia_events SET start_year=?,start_month=?,start_day=?,end_year=?,end_month=?,end_day=? WHERE id=1').run(...values);
      const row=await getEvent(f.env.DB,1);
      assert.equal(row.period_text,oldPeriod(row));
      assert.equal(row.period_text_en,oldPeriodEn(row));
      const listed=await listEvents(f.env.DB,{archived:true});
      const fromList=listed.find(item=>item.id===1);
      assert.equal(fromList.period_text,row.period_text);
      assert.equal(fromList.period_text_en,row.period_text_en);
    }
  } finally { f.sqlite.close(); }
});

test('Rust event date validation preserves existing errors and coercion', async () => {
  const f=fixture([], 'owner');
  try {
    for (const body of [
      {name_en:'Camp',start_year:'2026',start_month:'08',start_day:'2',end_year:2026,end_month:8,end_day:1},
      {slug:'fixed',name_ko:'행사',start_day:32,end_month:13,end_day:0},
      {name_en:'A',category_id:'0x10',start_year:'1e3',start_month:true,start_day:['2'],end_year:2201},
      {name_en:'A',start_year:' ',start_month:'no',start_day:null,archived:'false'},
      {name_en:'A',start_year:2020,end_year:2021},
    ]) assert.deepEqual(await normalizeEventInput(body,f.env),oldNormalizeEvent(body));
    const missing=await normalizeEventInput({},f.env);
    assert.deepEqual(missing.errors,oldNormalizeEvent({}).errors);
  } finally { f.sqlite.close(); }
});

test('Rust event slug normalization preserves Unicode and UTF-16 truncation', async () => {
  const f=fixture([], 'owner');
  try {
    for (const body of [
      {name_en:' Café & Crème ',name_ko:'행사'},
      {name_en:'A'.repeat(199)+'😀suffix'},
      {name_en:'Ignored',slug:'Été 2026 / Event'},
      {name_en:'Ignored',slug:'스카우트 Camp'},
      {name_en:'Ignored',slug:12345},
      {name_en:'  '+ 'A'.repeat(199)+'😀suffix  ',description_ko:'설'.repeat(1999)+'😀다음',archived:true},
      {name_en:['Synthetic',' Event'],description_en:42,archived:'false'},
      {name_en:'Long',description_en:' '.repeat(70000)+'text'+' '.repeat(70000)},
    ]) assert.deepEqual(await normalizeEventInput(body,f.env),oldNormalizeEvent(body));
    const fallback=await normalizeEventInput({name_ko:'행사'},f.env);
    assert.match(fallback.input.slug,/^event-[a-z0-9]{0,6}$/);
  } finally { f.sqlite.close(); }
});

test('Rust event creation resolves slug collisions and returns the saved slug', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; UPDATE memorabilia_events SET slug='camp' WHERE id=1");
    const {input}=await normalizeEventInput({slug:'camp',name_en:'Camp'},f.env);
    const created=await createEventWithSlug(f.env.DB,input);
    assert.match(created.slug,/^camp-[a-z0-9]{0,3}$/);
    assert.equal(f.sqlite.prepare('SELECT slug FROM memorabilia_events WHERE id=?').get(created.id).slug,created.slug);
    const direct=await createEventWithSlug(f.env.DB,{...input,slug:'unique'});
    assert.equal(direct.slug,'unique');
  } finally { f.sqlite.close(); }
});

test('Rust event update failure leaves the existing event intact', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; UPDATE memorabilia_events SET name_ko='기존 행사' WHERE id=1; CREATE TRIGGER reject_event_update BEFORE UPDATE ON memorabilia_events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const {input}=await normalizeEventInput({name_ko:'변경 행사',start_year:2026},f.env);
    await assert.rejects(updateEvent(f.env.DB,1,input));
    assert.equal(f.sqlite.prepare('SELECT name_ko FROM memorabilia_events WHERE id=1').get().name_ko,'기존 행사');
  } finally {f.sqlite.close();}
});


test('Rust event bulk updates preserve validation, selected IDs, and failure responses', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER); INSERT INTO memorabilia_event_categories VALUES(1,'camp','Camp','야영',1,0); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; INSERT INTO memorabilia_events(id,name_ko,archived) VALUES(2,'합성',0)");
    }
    const outcomes=[];
    for(const [f,handler] of [[before,oldEventsBulk],[after,eventsBulk]]) {
      const result=[];
      for(const body of [{ids:[],updates:{archived:true}},{ids:[1],updates:{category_id:999}},{ids:[1,2,2,999],updates:{category_id:1,archived:true}},{ids:[2],updates:{category_id:null,archived:false}},{ids:['1tail','bad',2],updates:{archived:'false'}},{ids:[1],updates:{category_id:'bad'}},{ids:[1],updates:{}},{ids:[1],updates:null},{ids:['bad'],updates:{archived:true}}]) {
        const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/bulk-update',body,'POST')});result.push([r.status,await r.json()]);
      }
      result.push(f.sqlite.prepare('SELECT id,category_id,archived FROM memorabilia_events ORDER BY id').all());
      f.sqlite.exec("CREATE TRIGGER reject_event_bulk BEFORE UPDATE ON memorabilia_events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/bulk-update',{ids:[1,2],updates:{archived:false}},'POST')});result.push([r.status,await r.json()]);
      result.push(f.sqlite.prepare('SELECT id,category_id,archived FROM memorabilia_events ORDER BY id').all());outcomes.push(result);
    }
    assert.deepEqual(outcomes[1],outcomes[0]);
    assert.equal(outcomes[1][2][1].updated,2);
    assert.deepEqual(outcomes[1][9],outcomes[1][11]);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust CSV event import and export preserve deduplication, dates and row errors', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT); INSERT INTO memorabilia_event_categories VALUES(1,'camp','Camp','야영',1,0,'2026-01-01','2026-01-01'); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; UPDATE memorabilia_events SET slug='old',name_en='Old Camp',name_ko='이전 행사',archived=0 WHERE id=1");
    }
    const csv='slug,name_en,name_ko,category,start_date,end_date,description_en,description_ko,archived\nold,Old Camp,변경 행사,camp,2026-08-01,2026-08-09,hello,설명,0\nnew-camp,New Camp,신규 행사,야영,2025-07,2025-07,,,,\n,New Camp,신규 행사,야영,2025-07,2025-07,,,,\ninvalid,,,camp,2026-13,,,,,\n';
    const output=[];
    for(const [f,get,post] of [[before,oldEventCsvGet,oldEventCsvPost],[after,eventCsvGet,eventCsvPost]]) {
      const r=await post({env:f.env,request:await request(f,'/api/memorabilia/events/csv',{csv},'POST')});
      const imported=[r.status,await r.json()];
      const stored=f.sqlite.prepare('SELECT id,slug,name_en,name_ko,category_id,start_year,start_month,start_day,end_year,end_month,end_day,description_en,description_ko,archived FROM memorabilia_events ORDER BY id').all();
      const exported=await get({env:f.env,request:await request(f,'/api/memorabilia/events/csv',{},'GET')});
      output.push({imported,stored,csv:await exported.text()});
    }
    assert.deepEqual(output[1],output[0]);
    assert.equal(output[1].imported[1].inserted,1);
    assert.equal(output[1].imported[1].updated,2);
    assert.equal(output[1].imported[1].errors.length,1);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust event CSV import keeps existing-event ordering for duplicate names', async () => {
  const before=fixture([], 'owner'), after=fixture([], 'owner');
  try {
    for (const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec(`CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT);
        ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT;
        UPDATE memorabilia_events SET slug='older',name_en='Same',name_ko='행사',start_year=2020 WHERE id=1;
        INSERT INTO memorabilia_events(id,slug,name_en,name_ko,start_year) VALUES(2,'newer','Same','행사',2025)`);
    }
    const csv='slug,name_en,name_ko,description_ko\n,Same,행사,새 설명\n';
    const output=[];
    for (const [f,handler] of [[before,oldEventCsvPost],[after,eventCsvPost]]) {
      const response=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/csv',{csv},'POST')});
      output.push([response.status,await response.json(),f.sqlite.prepare('SELECT id,description_ko FROM memorabilia_events ORDER BY id').all()]);
    }
    assert.deepEqual(output[1],output[0]);
    assert.equal(output[1][2][1].description_ko,'새 설명');
  } finally { before.sqlite.close(); after.sqlite.close(); }
});

test('Rust event CSV category matching preserves aliases, duplicate precedence and missing categories', async () => {
  const before=fixture([], 'owner'), after=fixture([], 'owner');
  try {
    for (const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec(`CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT);
        INSERT INTO memorabilia_event_categories VALUES(1,'first','ΟΣ','야영',1,0,NULL,NULL),(2,'second','Camp','야영',2,1,NULL,NULL);
        ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT`);
    }
    const csv='slug,name_en,category\na,One,야영\nb,Two, ος \nc,Three,CAMP\nd,Four,unknown\ne,Five,\n';
    const output=[];
    for (const [f,handler] of [[before,oldEventCsvPost],[after,eventCsvPost]]) {
      const response=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/csv',{csv},'POST')});
      output.push([response.status,await response.json(),f.sqlite.prepare("SELECT slug,category_id FROM memorabilia_events WHERE slug IN ('a','b','c','d','e') ORDER BY slug").all()]);
    }
    assert.deepEqual(output[1],output[0]);
    assert.deepEqual(output[1][2].map(row=>row.category_id),[2,1,2,null,null]);
  } finally { before.sqlite.close(); after.sqlite.close(); }
});

test('Rust event CSV export preserves template, BOM, dates and escaped fields', async () => {
  const before=fixture([], 'owner'), after=fixture([], 'owner');
  try {
    for (const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec(`CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT);
        ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT;
        UPDATE memorabilia_events SET slug='csv',name_en='Camp, "One"',name_ko='행사',start_year=2026,start_month=8,start_day=1,end_year=2027,description_ko='첫줄
둘째줄',archived=1 WHERE id=1`);
    }
    for (const suffix of ['', '?template=1']) {
      const output=[];
      for (const [f,handler] of [[before,oldEventCsvGet],[after,eventCsvGet]]) {
        const response=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/csv'+suffix,{},'GET')});
        output.push([response.status,response.headers.get('content-type'),response.headers.get('content-disposition'),Buffer.from(await response.arrayBuffer())]);
      }
      assert.deepEqual(output[1],output[0]);
      assert.deepEqual([...output[1][3].subarray(0,3)],[0xef,0xbb,0xbf]);
    }
  } finally { before.sqlite.close(); after.sqlite.close(); }
});

test('Rust event CSV parser preserves quoted newlines, comments and legacy whitespace', async () => {
  const samples = [
    '\ufeff# 설명\r\nslug,name_en,name_ko,description_ko\r\na,"Camp, ""One""",행사,"첫 줄\r\n둘째 줄"\r\n',
    'slug,name_en,name_ko\n\ufeff\n# 주석\na,Camp,행사\n',
    'slug,name_en,name_ko\n\u0085\na,Camp,행사\n',
    'slug,name_en,name_ko\na,"unfinished,행사',
    '# comment\n\n',
    'slug,category\n',
    'slug,category,start_year\nexample,camp,2026\n',
    '행사명(영문),NAME_EN,국문명,시작연도,시작_월,시작일자,종료연도,아카이브\nIgnored,Preferred,행사,2026,8,2,2027,숨김\n',
    '분류,슬러그,시작연도,종료_일\n야영,example,2026,1\n',
    ' NAME\u00a0_EN , 행사명-국문 , start date , 시작_연\nCamp,행사,2023년 8월 1일,1999\n',
    'slug,name_en,start_date,end_date,archived\na,One,2023.8.1,2024/2,YES\nb,Two,∅,x,보임\nc,Three,0x7e7-08-01,2025년 3월,숨김\n',
    'slug,name_ko,start_year,start_month,start_day,end_year,archived\na,행사,0x7e7,8.9,1e0,2025,ON\nb,행사2,invalid,0,0,NaN,active\n',
    'slug,name_en,start_date\n' + Array.from({length:100},(_,i)=>`event-${i},Event ${i},2026-${i % 5 ? '08' : '13'}\n`).join(''),
  ];
  for (const csv of samples) {
    const before=fixture([], 'owner'), after=fixture([], 'owner');
    try {
      for (const f of [before,after]) {
        seedMemorabilia(f);
        f.sqlite.exec('CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT');
      }
      const output=[];
      for (const [f,handler] of [[before,oldEventCsvPost],[after,eventCsvPost]]) {
        const response=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/csv',{csv},'POST')});
        output.push([response.status,await response.json(),f.sqlite.prepare('SELECT slug,name_en,name_ko,category_id,start_year,start_month,start_day,end_year,end_month,end_day,description_ko,archived FROM memorabilia_events ORDER BY id').all()]);
      }
      assert.deepEqual(output[1],output[0]);
    } finally { before.sqlite.close(); after.sqlite.close(); }
  }
});

test('Rust CSV import reports individual database errors and continues', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("CREATE TABLE memorabilia_event_categories(id INTEGER PRIMARY KEY,slug TEXT,label_en TEXT,label_ko TEXT,sort_order INTEGER,archived INTEGER,created_at TEXT,updated_at TEXT); ALTER TABLE memorabilia_events ADD COLUMN category_id INTEGER; ALTER TABLE memorabilia_events ADD COLUMN created_at TEXT; ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; UPDATE memorabilia_events SET slug='old',name_en='Old',name_ko='기존',archived=0 WHERE id=1; CREATE TRIGGER reject_event_csv BEFORE UPDATE ON memorabilia_events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    }
    const csv='slug,name_en,name_ko\nold,Old,변경\nnew,New,신규\n';
    const result=[];
    for(const [f,handler] of [[before,oldEventCsvPost],[after,eventCsvPost]]) {
      const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/events/csv',{csv},'POST')});
      result.push([r.status,await r.json(),f.sqlite.prepare('SELECT id,slug,name_ko FROM memorabilia_events ORDER BY id').all()]);
    }
    assert.deepEqual(result[1],result[0]);
    assert.equal(result[1][1].errors.length,1);
    assert.equal(result[1][1].inserted,1);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust memorabilia likes and views preserve toggling, bots, privacy and bucket deduplication', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("ALTER TABLE memorabilia ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0; UPDATE memorabilia SET status='public' WHERE id=1; INSERT INTO memorabilia(id,slug,status,view_count) VALUES(2,'private','draft',0); CREATE TABLE memorabilia_likes(id INTEGER PRIMARY KEY,memorabilia_id INTEGER,viewer_key TEXT,UNIQUE(memorabilia_id,viewer_key)); CREATE TABLE memorabilia_views(memorabilia_id INTEGER,viewer_key TEXT,viewed_bucket TEXT,UNIQUE(memorabilia_id,viewer_key,viewed_bucket))");
    }
    const outputs=[];
    for(const [f,get,post,view] of [[before,oldMemoLikeGet,oldMemoLikePost,oldMemoView],[after,memoLikeGet,memoLikePost,memoView]]) {
      const out=[];
      for(const [handler,id,method,agent] of [[get,1,'GET','Mozilla/5.0'],[post,1,'POST','Mozilla/5.0'],[post,1,'POST','Mozilla/5.0'],[post,2,'POST','Mozilla/5.0'],[post,1,'POST','Googlebot'],[view,1,'GET','Mozilla/5.0'],[view,1,'GET','Mozilla/5.0'],[view,1,'GET','Googlebot']]) {
        const req=new Request('https://synthetic.invalid/api/memorabilia/'+id,{method,headers:{'CF-Connecting-IP':'192.0.2.33','User-Agent':agent}});
        const r=await handler({env:f.env,params:{id:String(id)},request:req});out.push([r.status,await r.json()]);
      }
      out.push(f.sqlite.prepare('SELECT view_count FROM memorabilia WHERE id=1').get());outputs.push(out);
    }
    assert.deepEqual(outputs[1],outputs[0]);
    assert.equal(outputs[1][3][0],404);
    assert.equal(outputs[1].at(-1).view_count,1);
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust memorabilia views atomically roll back and count concurrent viewers once', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("ALTER TABLE memorabilia ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0; CREATE TABLE memorabilia_views(memorabilia_id INTEGER,viewer_key TEXT,viewed_bucket TEXT,UNIQUE(memorabilia_id,viewer_key,viewed_bucket))");
    f.state.failOnSql=/UPDATE memorabilia SET view_count/;
    await assert.rejects(recordUniqueMemorabiliaView(f.env,1,'synthetic-viewer'));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_views').get().n,0);
    assert.equal(f.sqlite.prepare('SELECT view_count FROM memorabilia WHERE id=1').get().view_count,0);
    f.state.failOnSql=null;
    const result=await Promise.all(Array.from({length:5},()=>recordUniqueMemorabiliaView(f.env,1,'synthetic-viewer')));
    assert.equal(result.filter(Boolean).length,1);
    assert.equal(f.sqlite.prepare('SELECT view_count FROM memorabilia WHERE id=1').get().view_count,1);
  } finally {f.sqlite.close();}
});


test('Rust comment storage preserves pending, public filtering and password deletion', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("UPDATE memorabilia SET status='public' WHERE id=1; INSERT INTO memorabilia(id,slug,status) VALUES(2,'private','draft'); CREATE TABLE memorabilia_comments(id INTEGER PRIMARY KEY,memorabilia_id INTEGER,author_name TEXT,affiliation TEXT,password_hash TEXT,password_salt TEXT,content TEXT,ip_address TEXT,user_agent TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT)");
    }
    const results=[];
    for(const [f,get,post,remove] of [[before,oldMemoCommentsGet,oldMemoCommentsPost,oldMemoCommentDelete],[after,memoCommentsGet,memoCommentsPost,memoCommentDelete]]) {
      const out=[];
      const headers={'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.71','User-Agent':'Mozilla/5.0'};
      const submit=async (id,body)=>post({env:f.env,params:{id:String(id)},request:new Request('https://synthetic.invalid/api/memorabilia/'+id+'/comments',{method:'POST',headers,body:JSON.stringify(body)})});
      const body={author_name:'합성 사용자',affiliation:'합성 연맹',password:'secret123',content:'합성 댓글'};
      let r=await submit(2,body);out.push([r.status,await r.json()]);
      r=await submit(1,body);out.push([r.status,await r.json()]);
      const id=out.at(-1)[1].id;
      r=await get({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/memorabilia/1/comments')});out.push([r.status,await r.json()]);
      f.sqlite.prepare("UPDATE memorabilia_comments SET status='approved' WHERE id=?").run(id);
      r=await get({env:f.env,params:{id:'1'},request:new Request('https://synthetic.invalid/api/memorabilia/1/comments')});const publicBody=await r.json();out.push([r.status,publicBody.items.map(({created_at,...item})=>item),publicBody.total]);
      for(const password of ['wrong','secret123','secret123']) {
        r=await remove({env:f.env,params:{id:String(id)},request:new Request('https://synthetic.invalid/delete',{method:'POST',headers,body:JSON.stringify({password})})});out.push([r.status,await r.json()]);
      }
      out.push(f.sqlite.prepare('SELECT status FROM memorabilia_comments WHERE id=?').get(id));results.push(out);
    }
    assert.deepEqual(results[1],results[0]);
    assert.equal(results[1][0][0],404);
    assert.equal(results[1][2][1].total,0);
    assert(!JSON.stringify(results[1][3]).includes('password'));
    assert.deepEqual(results[1].slice(4,7).map(x=>x[0]),[403,200,410]);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust comment insertion surfaces DB failure without saving content', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("UPDATE memorabilia SET status='public' WHERE id=1; CREATE TABLE memorabilia_comments(id INTEGER PRIMARY KEY,memorabilia_id INTEGER,author_name TEXT,affiliation TEXT,password_hash TEXT,password_salt TEXT,content TEXT,ip_address TEXT,user_agent TEXT,status TEXT,created_at TEXT,deleted_at TEXT); CREATE TRIGGER reject_comment BEFORE INSERT ON memorabilia_comments BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const headers={'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.73','User-Agent':'Mozilla/5.0'};
    const req=new Request('https://synthetic.invalid/api/memorabilia/1/comments',{method:'POST',headers,body:JSON.stringify({author_name:'합성',affiliation:'합성 연맹',password:'secret123',content:'합성'})});
    const r=await memoCommentsPost({env:f.env,params:{id:'1'},request:req});
    assert.equal(r.status,500);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_comments').get().n,0);
  } finally {f.sqlite.close();}
});


test('Rust admin comments preserve counts, pagination, review transitions and permissions', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("CREATE TABLE memorabilia_comments(id INTEGER PRIMARY KEY,memorabilia_id INTEGER,author_name TEXT,affiliation TEXT,password_hash TEXT,password_salt TEXT,content TEXT,ip_address TEXT,user_agent TEXT,status TEXT,rejection_reason TEXT,created_at TEXT,reviewed_at TEXT,reviewed_by TEXT,deleted_at TEXT); INSERT INTO memorabilia_comments VALUES(1,1,'작성자','연맹','synthetic-hash','synthetic-salt','댓글','192.0.2.4','synthetic','pending',NULL,'2026-01-01',NULL,NULL,NULL),(2,1,'다른 작성자','연맹','hash','salt','댓글2','192.0.2.5','synthetic','approved',NULL,'2026-01-02',NULL,NULL,NULL)");
    }
    const outputs=[];
    for(const [f,get,patch] of [[before,oldAdminComments,oldAdminCommentPatch],[after,adminComments,adminCommentPatch]]) {
      const result=[];
      for(const suffix of ['?counts=1','?status=all&page=1&pageSize=1','?status=invalid']) {
        const r=await get({env:f.env,request:await request(f,'/api/admin/memorabilia-comments'+suffix,{},'GET')});result.push([r.status,await r.json()]);
      }
      for(const status of ['approved','rejected','deleted','approved']) {
        const r=await patch({env:f.env,params:{id:'1'},request:await request(f,'/api/admin/memorabilia-comments/1',{status,rejection_reason:'합성 사유'},'PATCH')});result.push([r.status,await r.json()]);
      }
      result.push(f.sqlite.prepare('SELECT status,rejection_reason,reviewed_by FROM memorabilia_comments WHERE id=1').get());outputs.push(result);
    }
    assert.deepEqual(outputs[1],outputs[0]);
    assert.equal(outputs[1][6][0],409);
    assert(!JSON.stringify(outputs[1][1]).includes('synthetic-hash'));
    const viewOnly=fixture(['view:memorabilia-comments']);
    try {const denied=await adminCommentPatch({env:viewOnly.env,params:{id:'1'},request:await request(viewOnly,'/api/admin/memorabilia-comments/1',{status:'approved'},'PATCH')});assert.equal(denied.status,403);} finally {viewOnly.sqlite.close();}
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('concurrent deletion cannot be reversed by a stale moderation request', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("CREATE TABLE memorabilia_comments(id INTEGER PRIMARY KEY,status TEXT,rejection_reason TEXT,reviewed_at TEXT,reviewed_by TEXT,deleted_at TEXT); INSERT INTO memorabilia_comments(id,status) VALUES(1,'pending')");
    const race=sql=>{if(sql.includes('UPDATE memorabilia_comments')) f.sqlite.exec("UPDATE memorabilia_comments SET status='deleted' WHERE id=1"); else f.state.beforeRun=race;};
    f.state.beforeRun=race;
    const r=await adminCommentPatch({env:f.env,params:{id:'1'},request:await request(f,'/api/admin/memorabilia-comments/1',{status:'approved'},'PATCH')});
    assert.equal(r.status,409);
    assert.equal(f.sqlite.prepare('SELECT status FROM memorabilia_comments WHERE id=1').get().status,'deleted');
  } finally {f.sqlite.close();}
});


test('Rust memorabilia bulk edits match legacy fields, relations, counters and FTS', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("UPDATE memorabilia SET event_id=1,issuer_ko='기존' WHERE id=1; UPDATE memorabilia_events SET name_en='Old',name_ko='이전' WHERE id=1; INSERT INTO memorabilia_events(id,name_en,name_ko,usage_count) VALUES(2,'Camp','야영',0); INSERT INTO memorabilia_tag_pool(id,label,usage_count) VALUES(1,'기존',1); INSERT INTO memorabilia_tags VALUES(1,1); INSERT INTO memorabilia_countries VALUES(1,'US')");
    }
    const output=[];
    for(const [f,handler] of [[before,oldMemoBulk],[after,memoBulk]]) {
      const results=[];
      for(const updates of [{event_id:2,issuer_ko:'',add_tags:['신규'],remove_tags:['기존'],add_country_codes:['KR'],remove_country_codes:['US']},{set_tags:['교체'],set_country_codes:['JP'],status:'public'},{add_tags:[],add_country_codes:[]}]) {
        const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1,999],updates},'POST')});results.push([r.status,await r.json()]);
      }
      results.push(f.sqlite.prepare('SELECT id,event_id,event_name_ko,issuer_ko,status FROM memorabilia').all());
      results.push(f.sqlite.prepare('SELECT id,usage_count FROM memorabilia_events ORDER BY id').all());
      results.push(f.sqlite.prepare('SELECT label,usage_count FROM memorabilia_tag_pool ORDER BY label').all());
      results.push(f.sqlite.prepare('SELECT country_code FROM memorabilia_countries ORDER BY country_code').all());
      results.push(f.sqlite.prepare('SELECT title_ko,event_name_ko,tags_text,country_names_text FROM memorabilia_fts').all());
      output.push(results);
    }
    assert.deepEqual(output[1],output[0]);
    assert.equal(output[1][0][1].updated,1);
    assert.equal(output[1][0][1].errors[0].error,'not_found');
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust memorabilia bulk row rolls back fields and relationships on failure', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("UPDATE memorabilia SET issuer_ko='기존' WHERE id=1; INSERT INTO memorabilia_tag_pool(id,label,usage_count) VALUES(1,'기존',1); INSERT INTO memorabilia_tags VALUES(1,1)");
    f.state.failOnSql=/INSERT OR IGNORE INTO memorabilia_tags/;
    const r=await memoBulk({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1],updates:{issuer_ko:'변경',set_tags:['신규']}},'POST')});
    const body=await r.json();
    assert.equal(body.updated,0);assert.equal(body.errors.length,1);
    assert.equal(f.sqlite.prepare('SELECT issuer_ko FROM memorabilia WHERE id=1').get().issuer_ko,'기존');
    assert.deepEqual(f.sqlite.prepare('SELECT tag_id FROM memorabilia_tags').all().map(x=>x.tag_id),[1]);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM memorabilia_tag_pool WHERE label='신규'").get().n,0);
  } finally {f.sqlite.close();}
});

test('Rust memorabilia bulk edit does not overwrite a concurrent row update', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("UPDATE memorabilia SET issuer_ko='기존' WHERE id=1");
    f.state.beforeBatch=()=>f.sqlite.exec("UPDATE memorabilia SET issuer_ko='동시 수정',updated_at='concurrent' WHERE id=1");
    const r=await memoBulk({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1],updates:{issuer_ko:'일괄 수정',add_tags:['신규']}},'POST')});
    const result=await r.json();
    assert.equal(result.updated,0);
    assert.equal(result.errors.length,1);
    assert.equal(f.sqlite.prepare('SELECT issuer_ko FROM memorabilia WHERE id=1').get().issuer_ko,'동시 수정');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_tags WHERE memorabilia_id=1').get().n,0);
  } finally {f.sqlite.close();}
});

test('search index replacement retains old row when the new FTS insert fails', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('기존 검색',1)");
    f.state.failOnSql=/INSERT INTO memorabilia_fts/;
    await assert.rejects(upsertMemoFts(f.env.DB,{id:1,title_ko:'새 검색',tags:[],country_codes:[]}));
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'기존 검색');
    f.state.failOnSql=null;
    await upsertMemoFts(f.env.DB,{id:1,title_ko:'새 검색',tags:[],country_codes:[]});
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'새 검색');
  } finally {f.sqlite.close();}
});

test('bulk update reports failed search index refresh while preserving the previous index', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('기존 검색',1)");
    f.state.failOnSql=/INSERT INTO memorabilia_fts/;
    const response=await memoBulk({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1],updates:{issuer_ko:'새 발행처'}},'POST')});
    const result=await response.json();
    assert.equal(result.updated,0);
    assert.equal(result.errors.length,1);
    assert.notEqual(f.sqlite.prepare('SELECT issuer_ko FROM memorabilia WHERE id=1').get().issuer_ko,'새 발행처');
    assert.deepEqual(result.fts_failed,[1]);
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'기존 검색');
  } finally {f.sqlite.close();}
});


test('search index refresh rejects concurrent changes to source fields and relations', async () => {
  for(const kind of ['title','tag','country','category']) {
    const f=fixture([], 'owner');
    try {
      seedMemorabilia(f);
      f.sqlite.exec("INSERT INTO memorabilia_categories(id,slug,label_en,label_ko) VALUES(4,'badge','Badge','배지'); UPDATE memorabilia SET category_id=4 WHERE id=1; INSERT INTO memorabilia_tag_pool(id,label) VALUES(1,'기존'); INSERT INTO memorabilia_tags VALUES(1,1); INSERT INTO memorabilia_countries VALUES(1,'KR'); INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('이전 색인',1)");
      f.state.beforeBatch=()=>{
        if(kind==='title')f.sqlite.exec("UPDATE memorabilia SET title_ko='동시 변경' WHERE id=1");
        if(kind==='tag')f.sqlite.exec("UPDATE memorabilia_tag_pool SET label='변경 태그' WHERE id=1");
        if(kind==='country')f.sqlite.exec("INSERT INTO memorabilia_countries VALUES(1,'US')");
        if(kind==='category')f.sqlite.exec("UPDATE memorabilia_categories SET label_ko='변경 분류' WHERE id=4");
      };
      await assert.rejects(syncFtsForId(f.env.DB,1),kind);
      assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'이전 색인');
      await syncFtsForId(f.env.DB,1);
      assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,kind==='title'?'동시 변경':'saved');
    } finally {f.sqlite.close();}
  }
});

test('search index refresh leaves existing index on source lookup failure', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('이전 색인',1); DROP TABLE memorabilia_countries");
    await assert.rejects(syncFtsForId(f.env.DB,1));
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'이전 색인');
    await syncFtsForId(f.env.DB,999);
  } finally {f.sqlite.close();}
});


test('Rust bulk replacement matches previews, literal wildcards and cascaded event names', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT");
      f.sqlite.exec("UPDATE memorabilia SET title_ko='100% 야영',issuer_ko='기존 단체',event_name_ko='기존 행사' WHERE id=1; UPDATE memorabilia_events SET name_ko='기존 행사' WHERE id=1");
    }
    const outputs=[];
    for(const [f,handler] of [[before,oldMemoReplace],[after,memoReplace]]) {
      const operations=[{field:'title_ko',find:'100%',replace:'전체'},{field:'name_ko',find:'기존',replace:'신규',_table:'memorabilia_events'},{field:'issuer_ko',find:'기존',replace:'새'}];
      const out=[];
      for(const dry_run of [true,false]) {const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/bulk-replace',{operations,dry_run},'POST')});out.push([r.status,await r.json()]);}
      out.push(f.sqlite.prepare('SELECT title_ko,issuer_ko,event_name_ko FROM memorabilia WHERE id=1').get());
      out.push(f.sqlite.prepare('SELECT name_ko FROM memorabilia_events WHERE id=1').get());
      out.push(f.sqlite.prepare('SELECT title_ko,issuer_ko,event_name_ko FROM memorabilia_fts WHERE memorabilia_id=1').get());outputs.push(out);
    }
    assert.deepEqual(outputs[1],outputs[0]);
    assert.equal(outputs[1][0][1].results[0].matched,1);
    assert.equal(outputs[1][2].event_name_ko,'신규 행사');
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('bulk replacement rejects unapproved table or field names before querying', async () => {
  const f=fixture([], 'owner');
  try {
    for(const operation of [{field:'title_ko',find:'x',replace:'y',_table:'memorabilia; DROP TABLE settings--'},{field:'name_ko',find:'x',replace:'y',_table:'memorabilia'}]) {
      const r=await memoReplace({env:f.env,request:await request(f,'/api/memorabilia/bulk-replace',{operations:[operation]},'POST')});
      assert.equal(r.status,400);
    }
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='settings'").get().n,1);
  } finally {f.sqlite.close();}
});

test('event name replacement rolls back if the linked memorabilia update fails', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("ALTER TABLE memorabilia_events ADD COLUMN updated_at TEXT; UPDATE memorabilia_events SET name_ko='기존 행사' WHERE id=1; UPDATE memorabilia SET event_name_ko='기존 행사' WHERE id=1; CREATE TRIGGER reject_cascade BEFORE UPDATE ON memorabilia BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const req=await request(f,'/api/memorabilia/bulk-replace',{operations:[{field:'name_ko',find:'기존',replace:'새',_table:'memorabilia_events'}]},'POST');
    await assert.rejects(memoReplace({env:f.env,request:req}));
    assert.equal(f.sqlite.prepare('SELECT name_ko FROM memorabilia_events WHERE id=1').get().name_ko,'기존 행사');
    assert.equal(f.sqlite.prepare('SELECT event_name_ko FROM memorabilia WHERE id=1').get().event_name_ko,'기존 행사');
  } finally {f.sqlite.close();}
});

test('bulk replacement reports search indexing failure without losing the old index', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("UPDATE memorabilia SET issuer_ko='이전 단체' WHERE id=1; INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('기존 색인',1)");
    f.state.failOnSql=/INSERT INTO memorabilia_fts/;
    const response=await memoReplace({env:f.env,request:await request(f,'/api/memorabilia/bulk-replace',{operations:[{field:'issuer_ko',find:'이전',replace:'변경'}]},'POST')});
    const result=await response.json();
    assert.deepEqual(result.fts_failed,[1]);
    assert.equal(f.sqlite.prepare('SELECT issuer_ko FROM memorabilia WHERE id=1').get().issuer_ko,'변경 단체');
    assert.equal(f.sqlite.prepare('SELECT title_ko FROM memorabilia_fts WHERE memorabilia_id=1').get().title_ko,'기존 색인');
  } finally {f.sqlite.close();}
});


test('Rust memorabilia suggestions preserve ranking, wildcard matching and limits', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("UPDATE memorabilia SET issuer_ko='한국 연맹',issuer_en='Korea Scouts' WHERE id=1; INSERT INTO memorabilia(id,slug,issuer_ko,issuer_en) VALUES(2,'next','한국 협회','Scout Korea'); INSERT INTO memorabilia_tag_pool(id,label,usage_count) VALUES(1,'야영',5),(2,'한국',10),(3,'야영 훈련',2)");
    }
    for(const [actual,old] of [[suggestIssuers,oldSuggestIssuers],[suggestTags,oldSuggestTags]]) {
      for(const query of ['', '한국','야영','%','  Korea  ','missing']) for(const limit of [1,8,-1]) {
        assert.deepEqual(await actual(after.env.DB,query,limit),await old(before.env.DB,query,limit),query+' '+limit);
      }
    }
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('autocomplete preserves query parsing, ranking and error behavior', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    f.sqlite.exec("UPDATE memorabilia SET issuer_ko='한국 연맹',issuer_en='Korea Scouts' WHERE id=1; INSERT INTO memorabilia_tag_pool(label,usage_count) VALUES('야영',5),('야외',2)");
    for(const suffix of ['', '?q=한국', '?type=tag', '?type=%20tag%20&q=야&limit=1x', '?type=unknown&q=x', '?q=%25&limit=-1', '?type=tag&limit=0', '?type=tag&limit=999', '?type=issuer&q=%EF%BB%BF한국%EF%BB%BF']) {
      const request=new Request('https://synthetic.invalid/api/memorabilia/autocomplete'+suffix);
      const old=await oldMemoAutocomplete({env:f.env,request}),current=await memoAutocomplete({env:f.env,request});
      assert.equal(current.status,old.status,suffix); assert.deepEqual(await current.json(),await old.json(),suffix);
    }
    f.sqlite.exec('DROP TABLE memorabilia_tag_pool');
    const failed=await memoAutocomplete({env:f.env,request:new Request('https://synthetic.invalid/api/memorabilia/autocomplete?type=tag')});
    assert.equal(failed.status,500); assert.deepEqual(await failed.json(),{items:[]});
  } finally {f.sqlite.close();}
});


test('Rust FTS candidates and glossary aliases preserve public search and filters', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("ALTER TABLE memorabilia ADD COLUMN view_count INTEGER DEFAULT 0; UPDATE memorabilia SET status='public',title_ko='캠프',title_en='Camp',year=2026,issuer_ko='합성 발행처' WHERE id=1; INSERT INTO memorabilia(id,slug,title_ko,status,year) VALUES(2,'private','캠프 비공개','draft',2026); INSERT INTO memorabilia_categories(id,slug,label_en,label_ko) VALUES(4,'badge','Badge','배지'); UPDATE memorabilia SET category_id=4 WHERE id=1; INSERT INTO memorabilia_tag_pool(id,label,usage_count) VALUES(1,'야영',1); INSERT INTO memorabilia_tags VALUES(1,1); INSERT INTO memorabilia_countries VALUES(1,'KR'); CREATE TABLE glossary_terms(term_ko TEXT,term_en TEXT,term_fr TEXT); INSERT INTO glossary_terms VALUES('캠프','camp','campement'); CREATE TABLE memorabilia_search_log(query TEXT,hits INTEGER,filters_json TEXT,client_ip TEXT)");
      await upsertMemoFts(f.env.DB,{id:1,title_ko:'캠프',title_en:'Camp',tags:['야영'],country_codes:['KR'],category_label_en:'Badge',category_label_ko:'배지'});
      await upsertMemoFts(f.env.DB,{id:2,title_ko:'캠프 비공개',tags:[],country_codes:[]});
    }
    for(const suffix of ['?q=camp','?q=캠프','?q=missing','?q=camp&country=KR&category=badge&tag=야영','?q=camp&year_from=2027','?country=KR&sort=title','?q=camp&sort=year_asc','?q=camp&sort=year_desc','?q=camp&sort=newest','?q=camp&event=1','?q=camp&issuer=합성','?q=camp&page=2&limit=1']) {
      const out=[];
      for(const [f,handler] of [[before,oldSearchMemorabilia],[after,searchMemorabilia]]) {
        const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/search'+suffix,{},'GET')});out.push([r.status,await r.json()]);
      }
      assert.deepEqual(out[1],out[0],suffix);
      assert(!out[1][1].results.some(item=>item.id===2));
    }
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust FTS candidate query keeps the 500 result cap', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    const insert=f.sqlite.prepare('INSERT INTO memorabilia_fts(title_en,memorabilia_id) VALUES(?,?)');
    for(let id=1;id<=510;id++)insert.run('Scout camp',id);
    const response=await queryRust({env:f.env,request:{url:'https://internal.invalid/'}},'memorabilia-search-candidates',{query:'"Scout"',limit:500});
    assert.equal(response.status,200);
    assert.equal((await response.json()).items.length,500);
  } finally {f.sqlite.close();}
});


test('Rust search facets retain earlier groups if a later facet query fails', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("ALTER TABLE memorabilia ADD COLUMN view_count INTEGER DEFAULT 0; UPDATE memorabilia SET status='public' WHERE id=1; INSERT INTO memorabilia_countries VALUES(1,'KR')");
      f.state.failAllOnSql=/SELECT c\.slug, c\.label_en, c\.label_ko, COUNT/;
    }
    const output=[];
    for(const [f,handler] of [[before,oldSearchMemorabilia],[after,searchMemorabilia]]) {
      const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/search',{},'GET')});output.push([r.status,await r.json()]);
    }
    assert.deepEqual(output[1],output[0]);
    assert.equal(output[1][1].facets.country.KR.count,1);
    assert.deepEqual(output[1][1].facets.category,{});
    assert.deepEqual(output[1][1].facets.tag,{});
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust search logging preserves query, filters and IP without blocking results', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("ALTER TABLE memorabilia ADD COLUMN view_count INTEGER DEFAULT 0; UPDATE memorabilia SET status='public',title_en='Camp' WHERE id=1; CREATE TABLE glossary_terms(term_ko TEXT,term_en TEXT,term_fr TEXT); CREATE TABLE memorabilia_search_log(query TEXT,hits INTEGER,filters_json TEXT,client_ip TEXT)");
      await upsertMemoFts(f.env.DB,{id:1,title_en:'Camp',tags:[],country_codes:[]});
    }
    for(const [f,handler] of [[before,oldSearchMemorabilia],[after,searchMemorabilia]]) {
      const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/search?q=camp&sort=title',{},'GET')});
      assert.equal(r.status,200);assert.equal((await r.json()).total,1);
    }
    for(let i=0;i<20 && !after.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_search_log').get().n;i++) await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(after.sqlite.prepare('SELECT query,hits,filters_json,client_ip FROM memorabilia_search_log').all(),before.sqlite.prepare('SELECT query,hits,filters_json,client_ip FROM memorabilia_search_log').all());
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('atomic bulk edit rejects concurrent tag, category and event changes', async () => {
  for(const kind of ['tag','category','event']) {
    const f=fixture([], 'owner');
    try {
      seedMemorabilia(f);
      f.sqlite.exec("UPDATE memorabilia SET issuer_ko='기존' WHERE id=1; INSERT INTO memorabilia_categories(id,slug,label_en,label_ko) VALUES(4,'badge','Badge','배지'); INSERT INTO memorabilia_events(id,name_en,name_ko,usage_count) VALUES(2,'Camp','야영',0); INSERT INTO memorabilia_tag_pool(id,label) VALUES(7,'기존 태그'); INSERT INTO memorabilia_fts(title_ko,memorabilia_id) VALUES('이전 색인',1)");
      f.state.beforeBatch=()=>{
        if(kind==='tag')f.sqlite.exec("DELETE FROM memorabilia_tag_pool WHERE id=7; INSERT INTO memorabilia_tag_pool(id,label) VALUES(9,'기존 태그')");
        if(kind==='category')f.sqlite.exec("UPDATE memorabilia_categories SET label_ko='변경 분류' WHERE id=4");
        if(kind==='event')f.sqlite.exec("UPDATE memorabilia_events SET name_ko='변경 행사' WHERE id=2");
      };
      const response=await memoBulk({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1],updates:{issuer_ko:'일괄 변경',category_id:4,event_id:2,set_tags:['기존 태그']}},'POST')});
      const result=await response.json();
      assert.equal(result.updated,0,kind);
      assert.equal(result.errors.length,1,kind);
      assert.equal(f.sqlite.prepare('SELECT issuer_ko FROM memorabilia WHERE id=1').get().issuer_ko,'기존',kind);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_tags WHERE memorabilia_id=1').get().n,0,kind);
    } finally {f.sqlite.close();}
  }
});

test('atomic bulk edit preserves maximum typical tags, countries and Korean search text', async () => {
  const f=fixture([], 'owner');
  try {
    seedMemorabilia(f);
    const tags=Array.from({length:30},(_,i)=>'합성태그'+i);
    const countries=['KR','US','JP','GB','FR','DE','CA','AU'];
    const response=await memoBulk({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1],updates:{issuer_ko:'새 발행처',set_tags:tags,set_country_codes:countries}},'POST')});
    const result=await response.json();
    assert.equal(result.updated,1);assert.equal(result.fts_synced,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_tags WHERE memorabilia_id=1').get().n,30);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM memorabilia_countries WHERE memorabilia_id=1').get().n,8);
    const index=f.sqlite.prepare('SELECT issuer_ko,tags_text,country_names_text,jamo_blob FROM memorabilia_fts WHERE memorabilia_id=1').get();
    assert.equal(index.issuer_ko,'새 발행처');
    assert(index.tags_text.includes('합성태그29'));assert(index.country_names_text.includes('KR'));assert(index.jamo_blob.includes('ㅂㅏㄹㅎㅐㅇㅊㅓ'));
  } finally {f.sqlite.close();}
});

test('atomic bulk index preserves tag pool order with existing and newly created tags', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      seedMemorabilia(f);
      f.sqlite.exec("INSERT INTO memorabilia_tag_pool(id,label) VALUES(2,'기존 둘'),(7,'기존 일'); INSERT INTO memorabilia_tags VALUES(1,7)");
    }
    const out=[];
    for(const [f,handler] of [[before,oldMemoBulk],[after,memoBulk]]) {
      const r=await handler({env:f.env,request:await request(f,'/api/memorabilia/bulk-update',{ids:[1],updates:{set_tags:['신규 첫','기존 일','기존 둘','신규 둘']}},'POST')});
      assert.equal((await r.json()).updated,1);
      out.push(f.sqlite.prepare('SELECT tags_text,jamo_blob,choseong_blob FROM memorabilia_fts WHERE memorabilia_id=1').get());
    }
    assert.deepEqual(out[1],out[0]);
    assert.equal(out[1].tags_text,'기존 둘 기존 일 신규 첫 신규 둘');
  } finally {before.sqlite.close();after.sqlite.close();}
});


test('Rust post reorder, history and cover preserve authorization and responses', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) {
      f.sqlite.exec("ALTER TABLE posts ADD COLUMN sort_order INTEGER; ALTER TABLE posts ADD COLUMN created_at TEXT; ALTER TABLE posts ADD COLUMN publish_at TEXT; ALTER TABLE posts ADD COLUMN updated_at TEXT; ALTER TABLE posts ADD COLUMN image_url TEXT; ALTER TABLE posts ADD COLUMN published INTEGER; INSERT INTO posts(id,title,category,published,image_url) VALUES(1,'공개','korea',1,'data:image/png;base64,aGVsbG8='),(2,'비공개','korea',0,'https://bpmedia.net/synthetic.png'),(3,'공개2','korea',1,'https://bpmedia.net/synthetic.png'); CREATE TABLE post_history(id INTEGER PRIMARY KEY,post_id INTEGER,action TEXT,summary TEXT,snapshot TEXT,before_snapshot TEXT,after_snapshot TEXT,created_at TEXT); INSERT INTO post_history VALUES(1,1,'update','합성',NULL,'{\"title\":\"전\"}','{\"title\":\"후\"}','2026-01-01')");
    }
    const outputs=[];
    for(const [f,reorder,reset,history,cover] of [[before,oldPostReorder,oldPostReset,oldPostHistory,oldPostCover],[after,postReorder,postReset,postHistory,postCover]]) {
      const out=[];
      let r=await reorder({env:f.env,request:await request(f,'/api/posts/reorder',{order:[3,1,1,'bad',999]},'PUT')});out.push([r.status,await r.json()]);
      out.push(f.sqlite.prepare('SELECT id,sort_order FROM posts ORDER BY id').all());
      for(const suffix of ['','?detail=full']) {r=await history({env:f.env,params:{id:'1'},request:await request(f,'/api/posts/1/history'+suffix,{},'GET')});out.push([r.status,await r.json()]);}
      for(const id of ['1','2','3','bad']) {r=await cover({env:f.env,params:{id},request:new Request('https://synthetic.invalid/api/posts/'+id+'/image')});out.push([r.status,r.headers.get('content-type'),r.headers.get('location'),await r.text()]);}
      r=await reset({env:f.env,request:await request(f,'/api/posts/reorder',{},'DELETE')});out.push([r.status,await r.json()]);
      out.push(f.sqlite.prepare('SELECT id,sort_order FROM posts ORDER BY id').all());outputs.push(out);
    }
    for(const index of [2,3]) {
      assert.match(outputs[1][index][1].post.updated_at,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
      outputs[1][index][1].post.updated_at=null;
    }
    assert.deepEqual(outputs[1],outputs[0]);
    assert.equal(outputs[1][1][0].sort_order,2);
    assert.equal(outputs[1][5][0],404);
    const denied=await postReorder({env:after.env,request:new Request('https://synthetic.invalid/api/posts/reorder',{method:'PUT',body:'{}'})});
    assert.equal(denied.status,401);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('Rust post reordering rolls back all positions on a database error', async () => {
  const f=fixture([], 'owner');
  try {
    f.sqlite.exec("ALTER TABLE posts ADD COLUMN sort_order INTEGER; INSERT INTO posts(id,sort_order) VALUES(1,10),(3,30); CREATE TRIGGER reject_reorder BEFORE UPDATE ON posts WHEN OLD.id=1 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const r=await postReorder({env:f.env,request:await request(f,'/api/posts/reorder',{order:[3,1]},'PUT')});
    assert.equal(r.status,500);
    assert.deepEqual(f.sqlite.prepare('SELECT id,sort_order FROM posts ORDER BY id').all().map(r=>r.sort_order),[10,30]);
  } finally {f.sqlite.close();}
});


test('a post unpublished during a like request cannot acquire a new like', async () => {
  const f=fixture([], 'owner');
  try {
    f.sqlite.exec("ALTER TABLE posts ADD COLUMN published INTEGER; INSERT INTO posts(id,published) VALUES(1,1); CREATE TABLE post_likes(id INTEGER PRIMARY KEY,post_id INTEGER,viewer_key TEXT,UNIQUE(post_id,viewer_key))");
    const race=sql=>{if(sql.includes('INSERT OR IGNORE INTO post_likes')) f.sqlite.exec('UPDATE posts SET published=0 WHERE id=1'); else f.state.beforeRun=race;};
    f.state.beforeRun=race;
    const req=new Request('https://synthetic.invalid/api/posts/1/like',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.81','User-Agent':'Mozilla/5.0'}});
    const r=await postLike({env:f.env,params:{id:'1'},request:req});
    assert.equal(r.status,404);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_likes').get().n,0);
  } finally {f.sqlite.close();}
});


test('Rust post history writes preserve snapshots and tolerate database errors', async () => {
  const before=fixture([], 'owner'),after=fixture([], 'owner');
  try {
    for(const f of [before,after]) f.sqlite.exec('CREATE TABLE post_history(post_id INTEGER,action TEXT,summary TEXT,snapshot TEXT,before_snapshot TEXT,after_snapshot TEXT)');
    const out=[];
    for(const [f,record] of [[before,oldRecordPostHistory],[after,recordPostHistory]]) {
      await record(f.env,1,'update',{id:1,title:'이전',content:'가'.repeat(10000)},{id:1,title:'변경',content:'나'.repeat(10000)},'합성 수정');
      await record(f.env,1,'',null,{id:1,title:'신규'},null);
      out.push(f.sqlite.prepare('SELECT * FROM post_history').all());
      f.sqlite.exec("CREATE TRIGGER reject_history BEFORE INSERT ON post_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      await assert.doesNotReject(record(f.env,1,'update',{id:1}, {id:1,title:'저장'},'실패'));
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM post_history').get().n,2);
    }
    assert.deepEqual(out[1],out[0]);
  } finally {before.sqlite.close();after.sqlite.close();}
});

test('post reordering advances revisions only when positions change', async () => {
  const f=fixture([], 'owner');
  try {
    f.sqlite.exec("ALTER TABLE posts ADD COLUMN sort_order INTEGER; ALTER TABLE posts ADD COLUMN updated_at TEXT; INSERT INTO posts(id,sort_order,updated_at) VALUES(1,7,'2099-01-01 00:00:00.000'),(2,NULL,'2099-01-01 00:00:00.000')");
    const run=async (method,body)=>method==='PUT'?postReorder({env:f.env,request:await request(f,'/api/posts/reorder',body,'PUT')}):postReset({env:f.env,request:await request(f,'/api/posts/reorder',{},'DELETE')});
    assert.equal((await run('PUT',{order:[1]})).status,200);
    const first=f.sqlite.prepare('SELECT updated_at FROM posts WHERE id=1').get().updated_at;
    assert(first>'2099-01-01 00:00:00.000');
    assert.equal((await run('PUT',{order:[1]})).status,200);
    assert.equal(f.sqlite.prepare('SELECT updated_at FROM posts WHERE id=1').get().updated_at,first);
    assert.equal((await run('DELETE')).status,200);
    assert(f.sqlite.prepare('SELECT updated_at FROM posts WHERE id=1').get().updated_at>first);
    assert.equal(f.sqlite.prepare('SELECT updated_at FROM posts WHERE id=2').get().updated_at,'2099-01-01 00:00:00.000');
  } finally {f.sqlite.close();}
});

test('admin hero read preserves legacy settings formats and media crops', async () => {
  for (const [hero, interval, media] of [
    ['1', '1000', '{bad'],
    ['["1x",2]', '16000', JSON.stringify({1:{fit:'contain',position_x:-5,zoom:180,mobile:{position_y:80}}})],
    [JSON.stringify({post_ids:[2,1],manual_position:'before_auto'}), '3400ms', JSON.stringify({2:{desktop:{zoom:65},mobile:{position_x:'34px'}}})],
    ['{broken', 'invalid', 'null'],
  ]) {
    const before=fixture([],'owner'), after=fixture([],'owner');
    try {
      const output=[];
      for (const [f,handler] of [[before,oldGetHero],[after,getHero]]) {
        f.sqlite.exec("ALTER TABLE posts ADD COLUMN subtitle TEXT; ALTER TABLE posts ADD COLUMN image_url TEXT; ALTER TABLE posts ADD COLUMN created_at TEXT; ALTER TABLE posts ADD COLUMN publish_at TEXT; ALTER TABLE posts ADD COLUMN published INTEGER; INSERT INTO posts VALUES(1,'합성 1','korea','','','2026-01-01',NULL,1),(2,'합성 2','apr','','','2026-01-02',NULL,1)");
        for (const [key,value] of [['hero',hero],['hero_interval',interval],['hero_media',media]]) f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key,value);
        const response=await handler({env:f.env,request:await request(f,'/api/settings/hero',null,'GET')});
        output.push({status:response.status,body:await response.json()});
      }
      assert.deepEqual(output[1],output[0],hero);
    } finally { before.sqlite.close(); after.sqlite.close(); }
  }
});

test('admin hero writes normalize legacy inputs and preserve existing media', async () => {
  const before=fixture([],'owner'), after=fixture([],'owner');
  try {
    const output=[];
    for (const [f,handler] of [[before,oldPutHero],[after,putHero]]) {
      f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('hero_media',JSON.stringify({1:{fit:'contain',position_x:'12px'},2:{desktop:{zoom:130}}}));
      const rows=[];
      for (const body of [
        {manual_post_ids:['1x',2,3],manual_position:'before_auto',interval_ms:'16000ms',if_revision:0},
        {post_ids:[2,1],interval_ms:'bad',media_map:{1:{fit:'contain',mobile:{position_x:110}},2:{zoom:55}},if_revision:1},
        {manual_post_ids:[1],interval_ms:1000,media_map:null,if_revision:2},
        {manual_post_ids:[1],if_revision:0},
      ]) {
        const response=await handler({env:f.env,request:await request(f,'/api/settings/hero',body,'PUT')});
        rows.push({status:response.status,body:await response.json()});
      }
      rows.push(f.sqlite.prepare('SELECT key,value FROM settings ORDER BY key').all());
      output.push(rows);
    }
    assert.deepEqual(output[1],output[0]);
    assert.deepEqual(output[1].slice(0,4).map(row=>row.status),[200,200,200,409]);
  } finally { before.sqlite.close(); after.sqlite.close(); }
});


test('picks order Rust preserves legacy parsing, deduplication and limits', async () => {
  const {onRequestGet:oldGet,onRequestPut:oldPut} = await import('./fixtures/rust-settings/picks-order.js');
  const {onRequestGet:newGet,onRequestPut:newPut} = await import('../functions/api/settings/picks-order.js');
  for (const body of [{items:['1x',1,-1,null,'3',3,2]}, {items:Array.from({length:30},(_,i)=>i+1)}, {items:'invalid'}, {}]) {
    const before=fixture([],'owner'), after=fixture([],'owner');
    try {
      const output=[];
      for (const [f,get,put] of [[before,oldGet,oldPut],[after,newGet,newPut]]) {
        f.sqlite.prepare("INSERT INTO settings(key,value) VALUES('picks_order','[1,1,\"2x\",-1]')").run();
        const getBefore=await get({env:f.env});
        const write=await put({env:f.env,request:await request(f,'/api/settings/picks-order',body,'PUT')});
        const getAfter=await get({env:f.env});
        output.push({before:await getBefore.json(),status:write.status,write:await write.json(),after:await getAfter.json(),stored:f.sqlite.prepare("SELECT value FROM settings WHERE key='picks_order'").get().value});
      }
      assert.deepEqual(output[1],output[0]);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('picks order preserves legacy JSON and numeric edge cases', async () => {
  const {onRequestGet:oldGet}=await import('./fixtures/rust-settings/picks-order.js');
  const {onRequestGet:newGet}=await import('../functions/api/settings/picks-order.js');
  for(const stored of ['[1,1e999,2]','[1,"\\ud800",2]','[0.0000001,1e21,"3x",null,true,[4],-1]','[1,{"toString":null},2]','{invalid','null']) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const results=[];
      for(const [f,handler] of [[before,oldGet],[after,newGet]]) {
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('picks_order',stored);
        results.push(await (await handler({env:f.env})).json());
      }
      assert.deepEqual(results[1],results[0],stored);
      if(stored==='[1,1e999,2]') assert.deepEqual(results[0],{items:[1,2]});
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('Rust image frame storage preserves legacy numeric coercion and defaults', async () => {
  const { queryRust } = await import('../functions/_shared/rust-server.js');
  const cases = [null, {}, {x:50,y:50}, {x:12.5,y:110}, {x:-2,y:49.5}, {x:'0x20',y:'Infinity'}, {x:null,y:'  '}, '{"x":"12.5","y":-1}', 'broken', {x:[5],y:true}];
  for (const raw of cases) {
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'post-image-frame',{raw});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).frame,normalizeImageFrame(raw));
    assert.deepEqual(await normalizeImageFrameRust(raw),normalizeImageFrame(raw));
    assert.equal(await serializeImageFrameForStoreRust(raw),serializeImageFrameForStore(raw));
  }
  const unusual='\ufeff{"x":21,"y":78}\ufeff';
  assert.equal(await serializeImageFrameForStoreRust(unusual),serializeImageFrameForStore(unusual));
});


test('Rust image frames preserve coercion and fallback across boundary pairs', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await normalizeImageFrameRust({x:1,y:2},{},async()=>respond({frame:{x:30,y:40}})),{x:30,y:40});
  for(const invalid of [null,{}, {frame:{x:-1,y:50}}, {frame:{x:1.5,y:50}}, {frame:{x:'10',y:50}}]) assert.deepEqual(await normalizeImageFrameRust({x:1,y:2},{},async()=>respond(invalid)),{x:1,y:2});
  assert.deepEqual(await normalizeImageFrameRust({x:1,y:2},{},async()=>{throw Error('synthetic');}),{x:1,y:2});
  let called=false;assert.deepEqual(await normalizeImageFrameRust({x:Infinity,y:10},{},async()=>{called=true;throw Error('unexpected');}),normalizeImageFrame({x:Infinity,y:10}));assert.equal(called,false);
  const values=[undefined,null,false,true,0,-0.5,0.5,49.5,100.5,-5,101,Infinity,NaN,'','  ','0x20','1e2','-2.5','Infinity','invalid',[5],[],{},'\ud800'];
  for(const x of values) for(const y of values) {
    const raw={x,y};assert.deepEqual(await normalizeImageFrameRust(raw,{},queryRust),normalizeImageFrame(raw));
  }
  for(const text of ['\ufeff{"x":21,"y":78}\ufeff','{"x":1e999,"y":-1}','{"x":null}','{}','[]','bad']) assert.deepEqual(await normalizeImageFrameRust(text),normalizeImageFrame(text));
});


test('Rust comment validation preserves all errors, UTF-16 limits, and whitespace', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const cases=[{}, {author_name:' 합성 ',affiliation:'연맹',password:'123456',content:' 테스트 '},
    {author_name:'😀'.repeat(21),affiliation:'가'.repeat(81),password:'12345',content:'😀'.repeat(501)},
    {author_name:'😀'.repeat(20),affiliation:'가'.repeat(80),password:'a'.repeat(128),content:'😀'.repeat(500)},
    {author_name:'a',affiliation:'b',password:'a'.repeat(129),content:'  '}];
  for (const raw of cases) {
    const normalized={author:String(raw.author_name||'').trim().length, affiliation:String(raw.affiliation||'').trim().length,password:String(raw.password||'').length,content:String(raw.content||'').trim().length};
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'memorabilia-comment-validate',normalized);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).errors,validateCommentSubmission(raw).errors);
    assert.deepEqual(await validateCommentSubmissionRust(raw),validateCommentSubmission(raw));
  }
});


test('Rust comment validation protects lengths, fallback and password privacy', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const invalid={author_name:'',affiliation:'',password:'x',content:''};
  assert.deepEqual(await validateCommentSubmissionRust(invalid,{},async()=>respond({errors:[]})),validateCommentSubmission(invalid));
  assert.deepEqual(await validateCommentSubmissionRust(invalid,{},async()=>{throw Error('synthetic');}),validateCommentSubmission(invalid));
  const boundaries=[0,1,5,6,39,40,41,79,80,81,127,128,129,999,1000,1001];
  let seed=111;const next=()=> (seed=(seed*48271)%2147483647);
  for(let i=0;i<160;i++) {
    const str=()=> '가'.repeat(boundaries[next()%boundaries.length]);
    const raw={author_name:str(),affiliation:str(),password:str(),content:str()};let calls=0;
    const result=await validateCommentSubmissionRust(raw,{},async(...args)=>{calls++;assert.deepEqual(Object.keys(args[2]).sort(),['affiliation','author','content','password']);assert(Object.values(args[2]).every(value=>typeof value==='number'));return queryRust(...args);});
    assert.equal(calls,1);assert.deepEqual(result,validateCommentSubmission(raw));
  }
});


test('Rust scoring rubric normalization preserves line endings, limits and UTF-16', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  for (const raw of ['', '  첫 줄  \r\n\r\n\r\n둘째\r ', '가'.repeat(19999)+'😀', 'a'.repeat(20001), ' \ufeff 합성 \ufeff ']) {
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'score-rubric-normalize',{text:raw});
    assert.equal(response.status,200);
    const {units}=await response.json();
    let output=''; for(let i=0;i<units.length;i+=4096) output+=String.fromCharCode(...units.slice(i,i+4096));
    assert.equal(output,normalizeScoreRubric(raw));
    assert.equal(await normalizeScoreRubricRust(raw),normalizeScoreRubric(raw));
  }
});


test('Rust editor-name normalization keeps required keys, ordering and UTF-16 limits', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const stored={' d ':' 합성 ',a:' 첫째 ',A:' 둘째 ',bad:'제외',z:12,B:'가'.repeat(59)+'😀'};
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'editors-normalize',{entries:Object.entries(stored)});
  assert.equal(response.status,200);
  const {entries}=await response.json();
  assert.deepEqual(entries.map(([key])=>key),['D','A','A','Z','B']);
  const expected={A:'둘째',B:('가'.repeat(59)+'😀').slice(0,60),C:'',D:'합성',Z:''};
  assert.deepEqual(await normalizeEditorsRust(stored),expected);
});


test('Rust editor settings preserve legacy casing, truncation, and failure fallback', async () => {
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await normalizeEditorsRust({A:'legacy'},{},async()=>json({entries:[['Z',[82]]]})),{A:'',B:'',C:'',Z:'R'});
  assert.deepEqual(await normalizeEditorsRust({A:' 합성 '},{},async()=>json({entries:[['AA',[]]]})),{A:'합성',B:'',C:''});
  assert.deepEqual(await normalizeEditorsRust({A:' 합성 '},{},async()=>json({entries:[[['A'],[]]]})),{A:'합성',B:'',C:''});
  assert.deepEqual(await normalizeEditorsRust({A:' 합성 '},{},async()=>{throw Error('synthetic');}),{A:'합성',B:'',C:''});
  let called=false;assert.deepEqual(await normalizeEditorsRust({A:'\ud800'},{},async()=>{called=true;throw Error('unexpected');}),{A:'\ud800',B:'',C:''});assert.equal(called,false);
  const cases=[{}, {' a ':'첫째',A:'둘째',z:'가'.repeat(59)+'😀',ß:'제외',İ:'제외'}, {a:'\ufeff 합성 \ufeff',b:0,c:null,d:['x'],F:{x:1}}, Object.fromEntries(Array.from({length:26},(_,i)=>[String.fromCharCode(65+i),' 값 '+i+' ']))];
  for(const stored of cases) {
    const before=fixture([],'owner'),after=fixture([],'owner');
    try {
      const out=[];
      for(const [f,handler] of [[before,oldGetEditors],[after,getEditors]]) {
        f.sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('editors',JSON.stringify(stored));
        const response=await handler({env:f.env,request:await request(f,'/api/settings/editors',null,'GET')});out.push({status:response.status,body:await response.json()});
      }
      assert.deepEqual(out[1],out[0]);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});


test('Rust WOSM public fields retain defaults, rounding and UTF-16 boundaries', async () => {
  const cases=[{m:{},c:{},n:null},{m:{country_en:'  custom  ',country_fr:''},c:{child_label:'  합성  ',helper_text:'가'.repeat(359)+'😀'},n:7.5},{m:{country_ko:'\ufeff 한국 \ufeff'},c:{section_region_label:'지역'},n:-1},{m:{country_en:12},c:{child_label:false},n:'0x10'}];
  for(const {m,c,n} of cases) {
    assert.deepEqual(await normalizeWosmFieldsRust(m,c,n),{mapping:normalizeWosmImportMapping(m),copy:normalizeWosmPublicCopy(c),count:normalizeWosmRegisteredCount(n)});
  }
});


test('WOSM fields use Rust while preserving defaults, rounding and fallback', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const expected=(m,c,n)=>({mapping:normalizeWosmImportMapping(m),copy:normalizeWosmPublicCopy(c),count:normalizeWosmRegisteredCount(n)});
  const m={country_en:' Country '},c={child_label:' 연맹 '},n=7.5;
  for(const invalid of [null,{fields:[],registered_count:8},{fields:Array(10).fill(null),registered_count:-1}]) assert.deepEqual(await normalizeWosmFieldsRust(m,c,n,{},async()=>respond(invalid)),expected(m,c,n));
  assert.deepEqual(await normalizeWosmFieldsRust(m,c,n,{},async()=>{throw Error('synthetic');}),expected(m,c,n));
  let called=false;const lone={child_label:'\ud800'};
  assert.deepEqual(await normalizeWosmFieldsRust(m,lone,n,{},async()=>{called=true;throw Error('unexpected');}),expected(m,lone,n));assert.equal(called,false);
  let seed=83;const next=()=> (seed=(seed*48271)%2147483647);
  const values=['',' 값 ',0,false,null,'😀','\ufeff 제목 \ufeff', '가'.repeat(400), ['x','y'], {x:1},'  '];
  const counts=[null,'',0,-1,7.5,'1.5','0x10','bad',' 2 ','1e6',1.2];
  const val=()=>values[next()%values.length];
  for(let trial=0;trial<100;trial++) {
    const mapping={country_ko:val(),country_en:val(),country_fr:val()};
    const copy={overview_template:val(),search_template:val(),section_meta_template:val(),helper_text:val(),child_label:val(),section_region_label:val(),section_language_label:val()};
    const count=counts[next()%counts.length];let calls=0;
    const actual=await normalizeWosmFieldsRust(mapping,copy,count,{},async(...args)=>{calls++;return queryRust(...args);});
    assert.equal(calls,1);assert.deepEqual(actual,expected(mapping,copy,count));
  }
});


test('Rust WOSM columns preserve custom fields, required columns and ordering', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const cases=[[],[{key:'new field',label:'사용자 정의',default_header:' Synthetic '},{key:'country_names',label:'국가',default_header:'ignored'},{key:'membership_category',label:'',default_header:''}], [{key:'z',label:'순번'},{key:'bad !!!',label:'가'.repeat(39)+'😀'},{key:' Z ',label:'duplicate'},{key:'',label:'정렬 순서'}]];
  for(const raw of cases) {
    const columns=raw.map(c=>[String(c.key||''),String(c.label||''),String(c.default_header||'')]);
    const defaults=DEFAULT_WOSM_MEMBERS.columns.map(c=>[c.key,c.label,c.type,c.default_header]);
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'wosm-columns-normalize',{columns,defaults});
    assert.equal(response.status,200);
    const result=(await response.json()).columns.map(c=>({key:c.key,label:String.fromCharCode(...c.label),type:c.type,system:c.system,default_header:String.fromCharCode(...c.header)}));
    assert.deepEqual(result,normalizeWosmMembersColumns(raw));
    assert.deepEqual(await normalizeWosmMembersColumnsRust(raw),normalizeWosmMembersColumns(raw));
  }
});


test('WOSM columns use Rust and preserve legacy ordering and fallback', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const root={key:'country_names',label:[82],type:'country_names',system:true,header:[]};
  assert.equal((await normalizeWosmMembersColumnsRust([],{},async()=>respond({columns:[root]})))[0].label,'R');
  for (const invalid of [null,{columns:[]},{columns:[root,root]},{columns:[{...root,system:false}]},{columns:[{...root,header:[65]}]}]) {
    assert.deepEqual(await normalizeWosmMembersColumnsRust([],{},async()=>respond(invalid)),normalizeWosmMembersColumns([]));
  }
  assert.deepEqual(await normalizeWosmMembersColumnsRust([],{},async()=>{throw Error('synthetic');}),normalizeWosmMembersColumns([]));
  const lone=[{key:'x',label:'\ud800'}];let called=false;
  assert.deepEqual(await normalizeWosmMembersColumnsRust(lone,{},async()=>{called=true;throw Error('unexpected');}),normalizeWosmMembersColumns(lone));
  assert.equal(called,false);
  let seed=57;const next=()=> (seed=(seed*48271)%2147483647);
  const values=['','Sort order','country_names','membership_category','status_description','정렬 기준','custom field','A-B','a b','😀','\ufeff test \ufeff',null,0,false,'x'.repeat(60)];
  const val=()=>values[next()%values.length];
  for(let trial=0;trial<100;trial++) {
    const raw=Array.from({length:next()%30},()=>({key:val(),label:val(),default_header:val()}));let calls=0;
    const actual=await normalizeWosmMembersColumnsRust(raw,{},async(...args)=>{calls++;return queryRust(...args);});
    assert.equal(calls,1);assert.deepEqual(actual,normalizeWosmMembersColumns(raw));
  }
});


test('Rust WOSM member normalization preserves translated names, extras and order', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const raw=[{country_en:' France ',country_ko:'France',country_fr:' France ',membership_category:' 정회원 ',extra_fields:{'A B':' 값 ','a-b':'덮어씀'},sort_order:3}, {country_en:'',country_ko:'',country_fr:''}];
  const payload={items:[{ko:'France',en:' France ',fr:' France ',membership:' 정회원 ',status:'',extras:[['A B',' 값 '],['a-b','덮어씀']],order:3},{ko:'',en:'',fr:'',membership:'',status:'',extras:[],order:null}]};
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'wosm-members-normalize',payload);
  assert.equal(response.status,200);
  const result=(await response.json()).items;
  assert.equal(result.length,1);
  assert.equal(String.fromCharCode(...result[0].ko),'프랑스');
  assert.equal(String.fromCharCode(...result[0].extras[0][1]),'덮어씀');
  assert.deepEqual(await sanitizeWosmMembersItemsRust(raw),sanitizeWosmMembersItems(raw));
  const edge=[{country_en:'unknown',country_ko:'가'.repeat(119)+'😀',extra_fields:{'회':'없음',' x ':'😀'.repeat(131)}}];
  assert.deepEqual(await sanitizeWosmMembersItemsRust(edge),sanitizeWosmMembersItems(edge));
  const allNames=Object.keys(COUNTRY_NAME_KO_MAP).map(country_en=>({country_en}));
  assert.deepEqual(await sanitizeWosmMembersItemsRust(allNames),sanitizeWosmMembersItems(allNames));
  const rows=allNames.map(({country_en})=>({ko:'',en:country_en,fr:'',membership:'',status:'',extras:[],order:null}));
  const allResponse=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'wosm-members-normalize',{items:rows});
  assert.equal(allResponse.status,200);
  const actualTranslations=(await allResponse.json()).items.map(row=>String.fromCharCode(...row.ko));
  assert.deepEqual(actualTranslations,sanitizeWosmMembersItems(allNames).map(row=>row.country_ko));
});


test('WOSM member normalization uses Rust and preserves legacy fallback', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const synthetic={ko:[82],en:[82],fr:[],membership:[],status:[],extras:[],order:0};
  assert.equal((await sanitizeWosmMembersItemsRust([{country_en:'legacy'}],{},async()=>respond({items:[synthetic]})))[0].country_en,'R');
  const raw=[{country_en:' France ',extra_fields:{'A B':' value '}}];
  for (const value of [null,{items:null},{items:[{...synthetic,order:null}]},{items:[{...synthetic,en:[-1]}]}]) {
    assert.deepEqual(await sanitizeWosmMembersItemsRust(raw,{},async()=>respond(value)),sanitizeWosmMembersItems(raw));
  }
  assert.deepEqual(await sanitizeWosmMembersItemsRust(raw,{},async()=>{throw Error('synthetic');}),sanitizeWosmMembersItems(raw));
  let called=false;
  const lone=[{country_en:'\ud800'}];
  assert.deepEqual(await sanitizeWosmMembersItemsRust(lone,{},async()=>{called=true;throw Error('unexpected');}),sanitizeWosmMembersItems(lone));
  assert.equal(called,false);
  let seed=41; const next=()=> (seed=(seed*48271)%2147483647);
  const words=['',' France ','Côte d’Ivoire','Korea, Republic of','대한민국','😀','\ufeff내용\ufeff','\u0085','a'.repeat(170),0,false,null,['x','y'],{x:1}];
  const val=()=>words[next()%words.length];
  for(let trial=0;trial<100;trial++) {
    const rows=Array.from({length:next()%20},()=>({country_en:val(),country_ko:val(),country_fr:val(),membership_category:val(),status_description:val(),sort_order:val(),extra_fields:{'A B':val(),'a-b':val(),'x':val()},'custom field':val()}));
    let calls=0;
    const actual=await sanitizeWosmMembersItemsRust(rows,{},async(...args)=>{calls++;return queryRust(...args);});
    assert.equal(calls,1);assert.deepEqual(actual,sanitizeWosmMembersItems(rows));
  }
});


test('combined Rust WOSM response matches normalization and aliases in one call', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const cases=[[],[{country_en:'France',country_ko:'France',extra_fields:{'A B':' 값 '},sort_order:3}], [{country_en:'x'.repeat(150)}], Object.keys(COUNTRY_NAME_KO_MAP).map(country_en=>({country_en}))];
  for(const raw of cases) {
    const once=sanitizeWosmMembersItems(raw);
    const items=once.map(item=>({ko:item.country_ko,en:item.country_en,fr:item.country_fr,membership:item.membership_category,status:item.status_description,extras:Object.entries(item.extra_fields),order:item.sort_order}));
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'wosm-members-response',{items});
    assert.equal(response.status,200);const result=await response.json();
    const decode=units=>String.fromCharCode(...units);
    const normalized=result.items.map(item=>({country_ko:decode(item.ko),country_en:decode(item.en),country_fr:decode(item.fr),membership_category:decode(item.membership),status_description:decode(item.status),extra_fields:Object.fromEntries(item.extras.map(([key,units])=>[key,decode(units)])),sort_order:item.order}));
    const expected=normalizeWosmMembersResponse(once,[],{},176,0,{}).items;
    assert.deepEqual(normalized,expected.map(({country_aliases,...item})=>item));
    assert.deepEqual(result.aliases,expected.map(item=>item.country_aliases));
  }
  const boundary={ko:'가'.repeat(119)+'😀',en:'synthetic',fr:'',membership:'',status:'',extras:[],order:0};
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'wosm-members-response',{items:[boundary]});
  assert.equal(response.ok,false);
});


test('built-in WOSM dictionary matches the shared source', () => {
  const dictionary=JSON.parse(readFileSync(new URL('../server-rust/src/wosm_country_dictionary.json',import.meta.url),'utf8'));
  assert.deepEqual(dictionary,{translations:COUNTRY_NAME_KO_MAP,aliases:COUNTRY_NAME_ALIAS_MAP});
});

test('Rust WOSM country aliases match source dictionaries and preserve order', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const raw=[{country_en:'Republic of Korea',country_ko:'대한민국',country_fr:'Corée'}, {country_en:'Côte d’Ivoire',country_ko:'',country_fr:'Côte d’Ivoire'}, {country_en:'Unknown land',country_ko:'미상',country_fr:''}];
  const legacy=normalizeWosmMembersResponse(raw,[],{},176,0,{});
  const items=legacy.items.map(row=>[row.country_ko,row.country_en,row.country_fr]);
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'wosm-country-aliases',{items});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).aliases,legacy.items.map(row=>row.country_aliases));
  assert.deepEqual(await normalizeWosmMembersResponseRust(raw,[],{},176,0,{}),legacy);
});


test('WOSM responses use Rust aliases with parity and safe fallback', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const raw=[{country_en:' France ',country_fr:' France '}];
  const args=[raw,[],{},176,3,{}];
  const expected=normalizeWosmMembersResponse(...args);
  assert.deepEqual((await normalizeWosmMembersResponseRust(...args,{},async(...query)=>{const actual=await (await queryRust(...query)).json();actual.aliases=[['Rust']];return respond(actual);})).items[0].country_aliases,['Rust']);
  for (const invalid of [null,{aliases:[]},{aliases:[['duplicate','duplicate']]},{aliases:[[' space ']]},{aliases:[[null]]}]) {
    assert.deepEqual(await normalizeWosmMembersResponseRust(...args,{},async()=>respond(invalid)),expected);
  }
  assert.deepEqual(await normalizeWosmMembersResponseRust(...args,{},async()=>{throw Error('synthetic');}),expected);
  const lone=[[{country_en:'\ud800'}],[],{},176,0,{}]; let called=false;
  assert.deepEqual(await normalizeWosmMembersResponseRust(...lone,{},async()=>{called=true;throw Error('unexpected');}),normalizeWosmMembersResponse(...lone));
  assert.equal(called,false);
  const names=[...Object.keys(COUNTRY_NAME_KO_MAP),...Object.keys(COUNTRY_NAME_ALIAS_MAP),'Côte d’Ivoire','France','대한민국','😀','\ufeff India \ufeff'];
  for(let i=0;i<names.length;i+=20) {
    const items=names.slice(i,i+20).map((name,index)=>({country_en:name,country_ko:index%3?'':name,country_fr:index%2?name:''}));
    const values=[items,[],{},176,5,{}];let calls=0;
    const actual=await normalizeWosmMembersResponseRust(...values,{},async(...query)=>{calls++;return queryRust(...query);});
    assert.equal(calls,1);assert.deepEqual(actual,normalizeWosmMembersResponse(...values));
  }
});


test('Rust reference sites preserve URL validation, region aliases and limits', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const raw=[{name:' 합성 ',url:' HTTPS://Example.COM:443/a ',summary:' 설명 ',related_federations:['europe','European','미분류','bogus']},{name:'가'.repeat(119)+'😀',url:'javascript:alert(1)',summary:'😀'.repeat(501),related_federations:['asia pacific','WOSM']},{name:'',url:'data:text/plain,abc',summary:''}];
  const items=raw.map(v=>({name:v.name,url:v.url,summary:v.summary,federations:v.related_federations||[]}));
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'reference-sites-normalize',{items});
  assert.equal(response.status,200);
  const output=(await response.json()).items.map(item=>({name:String.fromCharCode(...item.name),url:item.url,summary:String.fromCharCode(...item.summary),related_federations:item.related_federations}));
  assert.deepEqual(output,sanitizeReferenceSites(raw));
  assert.deepEqual(await sanitizeReferenceSitesRust(raw),sanitizeReferenceSites(raw));
  const many=Array.from({length:205},(_,i)=>({name:`site ${i}`}));
  assert.deepEqual(await sanitizeReferenceSitesRust(many),sanitizeReferenceSites(many));
});


test('reference-site Rust path preserves inputs, URL rules and fallback', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const raw=[{name:' 합성 ',url:'https://example.invalid/한글',related_federations:['europe','WOSM']}];
  const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  for(const invalid of [null,{items:null},{items:[{name:[],summary:[],url:'javascript:alert(1)',related_federations:[]}]},{items:[{name:[],summary:[],url:'',related_federations:[]}]}]) assert.deepEqual(await sanitizeReferenceSitesRust(raw,{},async()=>response(invalid)),sanitizeReferenceSites(raw));
  assert.deepEqual(await sanitizeReferenceSitesRust(raw,{},async()=>{throw Error('synthetic');}),sanitizeReferenceSites(raw));
  const lone=[{name:'\ud800'}];let called=false;
  assert.deepEqual(await sanitizeReferenceSitesRust(lone,{},async()=>{called=true;throw Error('unexpected');}),sanitizeReferenceSites(lone));assert.equal(called,false);
  let seed=97;const next=()=> (seed=(seed*48271)%2147483647);
  const values=['',' value ','한글','😀','\ufeff설명\ufeff',null,false,0,['a','b'],{x:1},'가'.repeat(1001)];
  const urls=['','https://example.invalid/한글','HTTP://EXAMPLE.invalid:80/a b','javascript:alert(1)','ftp://example.invalid/','https://example.invalid/'+ '한'.repeat(100),'https://user:pass@example.invalid:443/a?x=1#z','//example.invalid/a'];
  const regions=['europe','European','미분류','Asia Pacific','WOSM','',null,'arab'];
  const choose=list=>list[next()%list.length];
  for(let trial=0;trial<100;trial++) {
    const items=Array.from({length:next()%20},()=>({name:choose(values),summary:choose(values),url:choose(urls),related_federations:[choose(regions),choose(regions),choose(regions)]}));let calls=0;
    const actual=await sanitizeReferenceSitesRust(items,{},async(...args)=>{calls++;return queryRust(...args);});assert.equal(calls,1);assert.deepEqual(actual,sanitizeReferenceSites(items));
  }
});


test('Rust calendar tags preserve order, Unicode length and item limits', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const raw=[' 캠프 ','캠프','Camp','camp','😀'.repeat(20),'😀'.repeat(21),'\ufeff 교육 \ufeff',0,false,...Array.from({length:60},(_,i)=>`합성 ${i}`)];
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'calendar-tags-normalize',{items:raw.map(item=>String(item||''))});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).items,normalizeCalendarTags(raw));
  assert.deepEqual(await normalizeCalendarTagsRust(raw),normalizeCalendarTags(raw));
  assert.deepEqual(await normalizeCalendarTagsRust(['\ud83d']),normalizeCalendarTags(['\ud83d']));
});


test('calendar tags use Rust result and retain legacy fallback for invalid input or errors', async () => {
  const response = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await normalizeCalendarTagsRust(['legacy'], {}, async () => response({items:['Rust']})), ['Rust']);
  for (const invalid of [{items:null},{items:['dup','dup']},{items:[' not trimmed ']},{items:['x'.repeat(41)]}]) {
    assert.deepEqual(await normalizeCalendarTagsRust([' legacy '], {}, async () => response(invalid)), ['legacy']);
  }
  assert.deepEqual(await normalizeCalendarTagsRust([' legacy '], {}, async () => {throw new Error('synthetic');}), ['legacy']);
  let called = false;
  const lone = ['\ud800','\udc00'];
  assert.deepEqual(await normalizeCalendarTagsRust(lone, {}, async () => {called=true;throw new Error('unexpected');}), lone);
  assert.equal(called, false);
  let seed = 19;
  const next = () => (seed = (seed * 48271) % 2147483647);
  const words = ['', '가', '😀', '\ufeff행사\ufeff', '\u0085', 'A', ' a ', 0, false, null, ['x','y'], {x:1}, 'x'.repeat(40), '😀'.repeat(21)];
  for (let trial=0; trial<80; trial++) {
    const raw = Array.from({length:next()%100}, () => words[next()%words.length]);
    assert.deepEqual(await normalizeCalendarTagsRust(raw), normalizeCalendarTags(raw));
  }
});


test('Rust article tag settings preserve groups, duplicates, legacy worm and limits', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const raw={common:[' 합성 ','합성','Tag','tag','\ufeff공지\ufeff',...Array.from({length:110},(_,i)=>`태그 ${i}`)],categories:{korea:['한국','한국'],worm:['세계',' 세계 '],people:['😀']}};
  const groups=[raw.common,raw.categories.korea,[],raw.categories.worm,raw.categories.people];
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'tag-settings-normalize',{groups});
  assert.equal(response.status,200);
  const output=(await response.json()).groups;
  const legacy=normalizeTagSettings(raw);
  assert.deepEqual(output,[legacy.common,legacy.categories.korea,legacy.categories.apr,legacy.categories.wosm,legacy.categories.people]);
  assert.deepEqual(await normalizeTagSettingsRust(raw),legacy);
  assert.deepEqual(await normalizeTagSettingsRust(['\ud83d']),normalizeTagSettings(['\ud83d']));
});


test('article tag normalization uses Rust and preserves legacy edge cases and fallback', async () => {
  const response = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
  const rustGroups = [['Rust'],[],[],[],[]];
  assert.deepEqual(await normalizeTagSettingsRust(['legacy'], {}, async () => response({groups:rustGroups})), {common:['Rust'],categories:{korea:[],apr:[],wosm:[],people:[]}});
  for (const invalid of [null, [], [['dup','dup'],[],[],[],[]], [[' x '],[],[],[],[]], [Array(101).fill('x'),[],[],[],[]]]) {
    assert.deepEqual(await normalizeTagSettingsRust([' legacy '], {}, async () => response({groups:invalid})), normalizeTagSettings([' legacy ']));
  }
  assert.deepEqual(await normalizeTagSettingsRust([' legacy '], {}, async () => {throw new Error('synthetic');}), normalizeTagSettings([' legacy ']));
  let called = false;
  const lone = {common:['\ud800','\udc00'], categories:{worm:['\ud800']}};
  assert.deepEqual(await normalizeTagSettingsRust(lone, {}, async () => {called = true; throw new Error('unexpected');}), normalizeTagSettings(lone));
  assert.equal(called,false);
  let seed=37;
  const next=()=> (seed=(seed*48271)%2147483647);
  const words=['', '태그', '😀', '\ufeff행사\ufeff', '\u0085', 'A', ' a ', 0, false, null, ['x','y'], {x:1}];
  const make=()=>Array.from({length:next()%125},()=>words[next()%words.length]);
  for(let trial=0;trial<100;trial++) {
    const raw = trial%3===0 ? make() : {common:make(),categories:{korea:make(),apr:make(),...(trial%2 ? {worm:make()} : {wosm:make(),worm:make()}),people:make()}};
    assert.deepEqual(await normalizeTagSettingsRust(raw),normalizeTagSettings(raw));
  }
});


test('Rust article tag plans preserve category aliases and cross-category usage', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const current=normalizeTagSettings({common:['공통','삭제'],categories:{korea:['국내','이동'],apr:['이동'],wosm:['세계'],people:['인물']}});
  const next=normalizeTagSettings({common:['공통','세계'],categories:{korea:['국내'],apr:['이동'],wosm:['세계','새태그'],people:[]}});
  const groups=t=>[t.common,t.categories.korea,t.categories.apr,t.categories.wosm,t.categories.people];
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'tag-settings-plan',{current:groups(current),next:groups(next),category:'worm'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{items:['공통','세계','새태그'],removed:['삭제','인물']});
  assert.deepEqual(await tagSettingsPlanRust(current,next,'worm'),{items:['공통','세계','새태그'],removed:['삭제','인물']});
  assert.deepEqual(await tagSettingsPlanRust(current,next,'unknown'),{items:['공통','세계','국내'],removed:['삭제','인물']});
});


test('bulk removed-tag usage chooses first used tag and preserves full count', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const f=fixture([], 'owner');
  try {
    f.sqlite.exec('ALTER TABLE posts ADD COLUMN tag TEXT; ALTER TABLE posts ADD COLUMN updated_at TEXT');
    for(let i=1;i<=7;i++) f.sqlite.prepare('INSERT INTO posts(id,title,category,tag,updated_at) VALUES(?,?,?,?,?)').run(i,`합성 ${i}`,'korea',i%2?'둘째, 공통':'첫째','2026-01-01');
    const run=async removed=>{const r=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'removed-tag-usage',{removed}); assert.equal(r.status,200);return (await r.json()).usage;};
    const first=await run(['없음','첫째','둘째']); assert.equal(first.tag,'첫째'); assert.equal(first.count,3);
    const second=await run(['둘째','첫째']); assert.equal(second.tag,'둘째'); assert.equal(second.count,4);
    const common=await run(['공통']); assert.equal(common.count,4); assert.equal(common.posts.length,4);
    assert.equal(await run(['없는 태그']),null); assert.equal(await run([]),null);
    f.sqlite.prepare('INSERT INTO posts(id,title,category,tag,updated_at) VALUES(?,?,?,?,?)').run(9,'공백 합성','apr','정확 , 태그,공통','2026-01-02');
    for(const tag of ['정확','태그','공통','첫째']) {
      const direct=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'tag-usage',{tag});
      assert.equal(direct.status,200);
      assert.deepEqual(await run(['없는 태그',tag]),await direct.json());
    }
  } finally {f.sqlite.close();}
});


test('Rust atomic tag save preserves values under used tags and stale revisions', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const f=fixture([], 'owner');
  try {
    f.sqlite.exec('ALTER TABLE posts ADD COLUMN tag TEXT');
    const removed=Array.from({length:60},(_,i)=>`합성삭제${i}`);
    const run=async(value,expected,removed)=>{const r=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'tag-commit',{value,expected,removed});assert.equal(r.status,200);return (await r.json()).changes;};
    assert.equal(await run('first',null,removed),1);
    assert.equal(await run('stale','wrong',removed),0);
    f.sqlite.prepare('INSERT INTO posts(id,title,category,tag) VALUES(?,?,?,?)').run(1,'합성','korea','기타, '+removed[59]);
    assert.equal(await run('blocked','first',removed),0);
    assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='tags'").get().value,'first');
    f.sqlite.prepare('DELETE FROM posts WHERE id=1').run();
    assert.equal(await run('second','first',removed),1);
    assert.equal(f.sqlite.prepare("SELECT value FROM settings WHERE key='tags'").get().value,'second');
  } finally {f.sqlite.close();}
});


test('Rust board spacing matches parseInt defaults and clamping', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  for(const value of [undefined,null,'',' 12px','0x10','-2','41.9','5e2','Infinity',15.8,[18],{},'\ufeff 9']) {
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'board-gap-normalize',{value:String(value)});
    assert.equal(response.status,200);
    assert.equal((await response.json()).gap,sanitizeGap(value));
    assert.equal(await sanitizeGapRust(value),sanitizeGap(value));
  }
});


test('operations core Rust batch matches four individual queries', async () => {
  const f=fixture([],'owner');
  try {
    f.sqlite.exec("ALTER TABLE posts ADD COLUMN published INTEGER; ALTER TABLE posts ADD COLUMN publish_at TEXT; ALTER TABLE posts ADD COLUMN created_at TEXT; ALTER TABLE posts ADD COLUMN updated_at TEXT; CREATE TABLE operational_events(id INTEGER PRIMARY KEY,channel TEXT,type TEXT,level TEXT,actor TEXT,path TEXT,message TEXT,created_at TEXT); INSERT INTO posts(id,title,category,published,publish_at,created_at,updated_at) VALUES(1,'합성 예약','korea',1,datetime('now','+1 day'),datetime('now'),datetime('now')),(2,'합성 초안','apr',0,NULL,datetime('now'),datetime('now')); INSERT INTO operational_events VALUES(1,'admin','synthetic','error','actor','/x','합성 오류','2026-01-01'),(2,'admin','admin_login_success','info','actor','/x','합성 로그인','2026-01-02')");
    const context={env:f.env,request:{url:'https://synthetic.invalid/'}};
    const combined=await queryRust(context,'admin-operations-core',{});assert.equal(combined.status,200);const result=await combined.json();
    for(const kind of ['scheduled','drafts','errors','logins']) {const separate=await queryRust(context,'admin-operations',{kind});assert.equal(separate.status,200);assert.deepEqual(result[kind],(await separate.json()).rows);}
    assert.equal(result.scheduled[0].id,1);assert.equal(result.drafts[0].id,2);
    f.sqlite.exec('DROP TABLE operational_events');
    assert.equal((await queryRust(context,'admin-operations-core',{})).ok,false);
  } finally {f.sqlite.close();}
});


test('Rust operations dashboard matches scheduled posts, errors and release snapshots', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const input={scheduled:[{id:2,title:'합성 예약',category:'korea',publish_at:'2026-01-01'}],drafts:[{id:3,title:null,category:null,updated_at:'now'}],errors:[{id:4,type:'synthetic',level:'error',message:'합성'}],logins:[{id:5,type:'admin_login_success'}],settings:[{key:'sample',saved_at:'now'}],deployments:Array.from({length:10},(_,i)=>({id:String(i),latest_stage:i%2?'failure':'success',version:i?'':'direct'})),snapshots:[{id:'1',version:'snapshot',site_version:'v1'}],heartbeat:{value:'synthetic-time'}};
  const expected=assembleOperationsLegacy(input);
  const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'operations-assemble',input);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),expected);
  assert.deepEqual(await assembleOperationsRust(input),expected);
  assert.equal(expected.deployments.length,8);
  assert.equal(expected.deployments[1].version,'snapshot');
  assert.equal(expected.deploy_alerts.length,5);
});


test('operations dashboard uses Rust for ordinary records and falls back safely', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const empty={scheduled:[],drafts:[],errors:[],logins:[],settings:[],deployments:[],snapshots:[],heartbeat:null};
  const respond=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const output={...assembleOperationsLegacy(empty),scheduler_last_run:'Rust'};
  assert.deepEqual(await assembleOperationsRust(empty,{},async()=>respond(output)),output);
  assert.deepEqual(await assembleOperationsRust(empty,{},async()=>respond({scheduled_posts:[]})),assembleOperationsLegacy(empty));
  assert.deepEqual(await assembleOperationsRust(empty,{},async()=>{throw Error('synthetic');}),assembleOperationsLegacy(empty));
  for(const input of [{...empty,scheduled:[{id:1,title:'\ud800'}]},{...empty,deployments:[{id:'x',latest_stage:true}]}]) {let called=false;assert.deepEqual(await assembleOperationsRust(input,{},async()=>{called=true;throw Error('unexpected');}),assembleOperationsLegacy(input));assert.equal(called,false);}
  let seed=107;const next=()=> (seed=(seed*48271)%2147483647);
  const values=['','합성','failure','success',null,0,1,'😀'];const value=()=>values[next()%values.length];
  for(let trial=0;trial<100;trial++) {
    const rows=()=>Array.from({length:next()%12},()=>({id:value(),title:value(),category:value(),publish_at:value(),updated_at:value(),channel:value(),type:value(),level:value(),actor:value(),path:value(),message:value(),created_at:value(),key:value(),saved_at:value(),environment:value(),branch:value(),source:value(),url:value(),created_on:value(),latest_stage:value(),version:value(),site_version:value(),admin_version:value(),commit_message:value()}));
    const input={scheduled:rows(),drafts:rows(),errors:rows(),logins:rows(),settings:rows(),deployments:rows(),snapshots:rows(),heartbeat:{value:value()}};let calls=0;
    const actual=await assembleOperationsRust(input,{},async(...args)=>{calls++;return queryRust(...args);});assert.equal(calls,1);assert.deepEqual(actual,assembleOperationsLegacy(input));
  }
});


test('Rust KMS text analysis preserves legacy detection and escaped line endings', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const cases=['','# Feature Definition\nlegacy','## Calendar\n## Development Rule', '# 합성\r\n## 0. 문서 목적과 사용 순서\r\n본문', '# 합성\\n## 0. 문서 목적과 사용 순서\\n\\t\\"인용\\"', '# 합성\n## 0. 문서 목적과 사용 순서\n'+ '가'.repeat(50000), '내용 \ud83d'];
  for(const raw of cases) {
    const text=normalizeFeatureDefinitionContent(raw),expected={text,legacy:isLegacyFeatureDefinition(text)};
    assert.deepEqual(await analyzeFeatureDefinitionRust(raw),expected);
    if(raw.includes('\ud83d')) continue;
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'feature-definition-normalize',{text:raw});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),expected);
  }
});


test('Rust AI usage chart dates preserve custom KST bounds and 365-day limits', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const now=1793232000;
  for(const query of ['', 'days=1','days=0','days=400','days=bad','days=3.7','start=2026-10-01&end=2026-10-01','start=2026-02-28&end=2026-03-01','start=2026-02-30&end=2026-03-02','start=2025-01-01&end=2026-10-01','start=2026-10-02&end=2026-10-01','start=2026-10-01']) {
    const params=new URLSearchParams(query), expected=resolveAiUsageRangeLegacy(params,now);
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'ai-usage-range',{days:params.get('days'),start:String(params.get('start')||'').trim(),end:String(params.get('end')||'').trim(),nowSec:now});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),expected);
    assert.deepEqual(await resolveAiUsageRangeRust(params,now),expected);
    assert.deepEqual(await resolveAiUsageRangeRust(params,now,{},async()=>new Response('',{status:503})),expected);
  }
});


test('Rust AI score history filters preserve limits, case and UTF-16 truncation', async () => {
  const {queryRust}=await import('../functions/_shared/rust-server.js');
  const samples=['','limit=0&offset=-3','limit=400&offset=2px&grade=a&min_score=101','limit=bad&min_score=-4','grade=unknown&q='+encodeURIComponent(' 가'.repeat(80)+'😀'),'q='+encodeURIComponent('가'.repeat(119)+'😀'),'offset='+ '9'.repeat(400)];
  for(const query of samples) {
    const params=new URLSearchParams(query),expected=resolveScoreHistoryFiltersLegacy(params);
    assert.deepEqual(await resolveScoreHistoryFiltersRust(params),expected);
    assert.deepEqual(await resolveScoreHistoryFiltersRust(params,{},async()=>new Response('',{status:503})),expected);
    const response=await queryRust({env:{},request:{url:'https://synthetic.invalid/'}},'score-history-filters',{limit:params.get('limit'),offset:params.get('offset'),q:params.get('q'),grade:params.get('grade'),min_score:params.get('min_score')});
    assert.equal(response.status,200);
    const value=await response.json();
    if(!Number.isFinite(expected.offset)){assert.equal(value.fallback,true);continue;}
    assert.deepEqual({limit:value.limit,offset:value.offset,q:String.fromCharCode(...value.q_units),grade:value.grade,minScore:value.minScore},expected);
  }
});
