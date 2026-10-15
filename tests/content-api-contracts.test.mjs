import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createToken } from '../functions/_shared/auth.js';
import { onRequestPut as putWosm, onRequestGet as getWosm } from '../functions/api/settings/wosm-members.js';
import { onRequestPut as putTags } from '../functions/api/settings/calendar-tags.js';
import { onRequestPut as putCopy } from '../functions/api/settings/calendar-copy.js';
import { onRequestPut as putReferences, onRequestGet as getReferences } from '../functions/api/settings/reference-sites.js';
import { onRequestGet as getGlossary } from '../functions/api/glossary/index.js';
import { onRequestGet as getCalendar } from '../functions/api/calendar/index.js';
import { onRequestPut as putCalendar } from '../functions/api/calendar/[id].js';
import { onRequestPut as putGlossary } from '../functions/api/glossary/[id].js';
import { onRequestPatch as patchMemorabilia, onRequestGet as getMemorabilia } from '../functions/api/memorabilia/[id].js';
import { onRequestGet as listMemorabilia } from '../functions/api/memorabilia/index.js';
import { onRequestGet as listPosts } from '../functions/api/posts/index.js';

const SECRET = 'isolated-content-contracts-only-never-production';
function fixture(permissions = [], role = 'member') {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)');
  sqlite.exec('CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL)');
  sqlite.exec('CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,category TEXT)');
  const calendarSource = readFileSync(new URL('../functions/_shared/calendar.js', import.meta.url), 'utf8');
  sqlite.exec(calendarSource.match(/CREATE TABLE IF NOT EXISTS calendar_events \([\s\S]+?\n    \)/)[0]);
  sqlite.exec('ALTER TABLE calendar_events ADD COLUMN target_groups TEXT');
  const user = { id: 77, role, status: 'active', username: 'synthetic_content', token_min_iat: 0, permissions: JSON.stringify({ access_admin: true, permissions }) };
  const state = { writes: [], batches: [] };
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        sql, get args() { return args; }, bind(...values) { args = values; return this; },
        async first() { if (sql.includes('FROM admin_users')) return user; if (state.forceRevision && (sql.includes("wosm_members_rev") || args[0] === 'reference_sites_rev')) return {value:'0'}; return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { state.writes.push(sql); const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      const results = []; sqlite.exec('BEGIN');
      try {
        for (const statement of statements) {
          state.writes.push(statement.sql);
          const result = sqlite.prepare(statement.sql).run(...statement.args);
          results.push({ success:true, meta:{changes:Number(result.changes)} });
        }
        sqlite.exec('COMMIT'); state.batches.push(results.map(result => result.meta.changes)); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, state, env: { DB, ADMIN_SECRET: SECRET }, user };
}
async function request(f, path, body, method = 'PUT') {
  const token = await createToken(SECRET, { role: f.user.role === 'owner' ? 'full' : f.user.role, uid: f.user.id, username: f.user.username });
  return new Request('https://synthetic.invalid' + path, { method, headers: { Cookie: 'admin_token=' + token, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}
function seedMemorabilia(f) {
  f.sqlite.exec(`CREATE TABLE memorabilia(id INTEGER PRIMARY KEY,slug TEXT,title_en TEXT,title_ko TEXT,has_event INTEGER,event_id INTEGER,event_name_en TEXT,event_name_ko TEXT,year INTEGER,category_id INTEGER,material_en TEXT,material_ko TEXT,size_text TEXT,issuer_en TEXT,issuer_ko TEXT,description_en TEXT,description_ko TEXT,description_plain_en TEXT,description_plain_ko TEXT,related_links_json TEXT,related_memorabilia_json TEXT,status TEXT,updated_at TEXT,published_at TEXT,created_at TEXT,created_by INTEGER);INSERT INTO memorabilia(id,slug,title_ko,event_id,status,updated_at) VALUES(1,'synthetic','saved',1,'draft','old');CREATE TABLE memorabilia_events(id INTEGER PRIMARY KEY,usage_count INTEGER,name_en TEXT,name_ko TEXT,slug TEXT,start_year INTEGER,start_month INTEGER,start_day INTEGER,end_year INTEGER,end_month INTEGER,end_day INTEGER,archived INTEGER,country_codes_json TEXT);INSERT INTO memorabilia_events(id,usage_count) VALUES(1,5);
CREATE TABLE memorabilia_categories(id INTEGER PRIMARY KEY,label_en TEXT,label_ko TEXT,slug TEXT,sort_order INTEGER,archived INTEGER);
CREATE TABLE memorabilia_countries(memorabilia_id INTEGER,country_code TEXT);
CREATE TABLE memorabilia_tags(memorabilia_id INTEGER,tag_id INTEGER);
CREATE TABLE memorabilia_tag_pool(id INTEGER PRIMARY KEY,label TEXT UNIQUE,usage_count INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE memorabilia_images(id INTEGER PRIMARY KEY,memorabilia_id INTEGER,url TEXT,alt_en TEXT,alt_ko TEXT,credit TEXT,is_primary INTEGER,sort_order INTEGER);
CREATE VIRTUAL TABLE memorabilia_fts USING fts5(title_en,title_ko,event_name_en,event_name_ko,issuer_en,issuer_ko,material_en,material_ko,description_plain_en,description_plain_ko,tags_text,country_names_text,category_label_text,jamo_blob,choseong_blob,memorabilia_id UNINDEXED)`);
  f.sqlite.exec('ALTER TABLE memorabilia_events ADD COLUMN description_en TEXT;ALTER TABLE memorabilia_events ADD COLUMN description_ko TEXT');
}

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
  f.sqlite.exec(`CREATE TABLE memorabilia(id INTEGER PRIMARY KEY,title_en TEXT,title_ko TEXT,has_event INTEGER,event_id INTEGER,event_name_en TEXT,event_name_ko TEXT,year INTEGER,category_id INTEGER,material_en TEXT,material_ko TEXT,size_text TEXT,issuer_en TEXT,issuer_ko TEXT,description_en TEXT,description_ko TEXT,description_plain_en TEXT,description_plain_ko TEXT,related_links_json TEXT,related_memorabilia_json TEXT,status TEXT,updated_at TEXT,published_at TEXT);INSERT INTO memorabilia(id,title_ko,event_id,status,updated_at) VALUES(1,'saved',1,'draft','old');CREATE TABLE memorabilia_events(id INTEGER PRIMARY KEY,usage_count INTEGER);INSERT INTO memorabilia_events VALUES(1,5)`);
  const prepare=f.env.DB.prepare.bind(f.env.DB);let raced=false;
  f.env.DB.prepare=sql=>{const statement=prepare(sql),first=statement.first.bind(statement);if(/UPDATE memorabilia SET/.test(sql))statement.first=async()=>{raced=true;f.sqlite.exec("UPDATE memorabilia SET updated_at='newer' WHERE id=1");return first();};return statement;};
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
