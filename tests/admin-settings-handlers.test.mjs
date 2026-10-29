import * as oldHomeBanners from './fixtures/rust-settings/home-banners.js';
import './register-rust-wasm.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken, hashAdminPassword, verifyAdminPasswordHash, verifyToken } from '../functions/_shared/auth.js';
import { loadAdminUserById, loadAdminUserByUsername, countActiveOwners, serializeAdminUser } from '../functions/_shared/admin-users.js';
import { validateIdentityRust, validatePermissionsRust, validatePermissions, validateUsername, validateDisplayName, validatePassword, validateEditorCode, validateAiDailyLimit, validateStatus } from '../functions/_shared/admin-user-validation.js';
import { onRequestPut as presetPut } from '../functions/api/admin/presets/[id].js';
import * as presetCatalog from '../functions/api/admin/presets.js';
import * as users from '../functions/api/admin/users/index.js';
import { onRequestGet as actualActivity } from '../functions/api/admin/users/[id]/activity.js';
import { onRequestGet as originalActivity } from './fixtures/rust-user-activity.js';
import { onRequestGet as actualExport } from '../functions/api/admin/users/[id]/export.js';
import { onRequestGet as originalExport } from './fixtures/rust-user-export.js';
import { onRequestPut as userPut, onRequestDelete as userDelete } from '../functions/api/admin/users/[id].js';
import { onRequestPost as userRestore } from '../functions/api/admin/users/[id]/restore.js';
import { onRequestPost as userReset } from '../functions/api/admin/users/[id]/password-reset.js';
import { onRequestPut as selfRename } from '../functions/api/admin/users/me/username.js';
import { onRequestGet as userMe } from '../functions/api/admin/users/me.js';
import { onRequestGet as metaTagPool } from '../functions/api/admin/meta-tag-pool.js';
import { onRequestGet as originalMetaTagPool } from './fixtures/rust-meta-tag-pool.js';
import { onRequestPost as changePassword } from '../functions/api/admin/password.js';
import * as totpHandlers from '../functions/api/admin/totp/index.js';
import { onRequestPost as confirmTotp } from '../functions/api/admin/totp/confirm.js';
import { onRequestPost as verifyTotpCode } from '../functions/api/admin/totp/verify.js';
import { totp } from '../functions/_shared/totp.js';
import { onRequestPost as adminLogin } from '../functions/api/admin/login.js';
import { requireOtp, issueOtpToken } from '../functions/_shared/otp-session.js';
import * as rawGlossary from '../functions/glossary-raw.js';
import * as originalRawGlossary from './fixtures/rust-glossary-raw.js';
import * as llmsTxt from '../functions/llms.txt.js';
import * as originalLlmsTxt from './fixtures/rust-llms-txt.js';
import * as robotsTxt from '../functions/robots.txt.js';
import * as originalRobotsTxt from './fixtures/rust-robots-txt.js';
import * as originalBoardBanner from './fixtures/rust-board-banner.js';
import * as originalTranslations from './fixtures/rust-translations.js';
import { queryRust } from '../functions/_shared/rust-server.js';
import { DEFAULT_BOARD_COPY, normalizeBoardCopy } from '../functions/_shared/board-copy.js';
import { normalizeNavLabels, normalizeNavLabelsRust, loadNavLabels } from '../functions/_shared/nav-labels.js';
import { loadSiteMeta, normalizeSiteMeta, LEGACY_HOME_TITLES, LEGACY_HOME_DESCRIPTIONS } from '../functions/_shared/site-meta.js';
import { buildPostMarkdownResponse, buildRustPostMarkdownResponse } from '../functions/_shared/post-markdown.js';
import * as privacy from '../functions/api/settings/privacy-policy.js';
import * as homeBanners from '../functions/api/settings/home-banners.js';
import * as contributors from '../functions/api/settings/contributors.js';
import { loadAllHomeBanners } from '../functions/_shared/home-banners.js';
import { selectAutoHomeLeadId, refreshAutoHomeLead, clearHomeLeadForPost, readHomeLeadState } from '../functions/_shared/home-lead-auto.js';
import { refreshAutoHomeLead as originalRefreshLead, clearHomeLeadForPost as originalClearLead } from './fixtures/rust-home-lead-auto.js';

const SECRET = 'local-only-settings-test-key-never-production';
const gates = [['hero', 'hero'], ['home-lead', 'home-lead'], ['site-meta', 'meta'], ['board-copy', 'board-copy'], ['author', 'author'], ['ai-disclaimer', 'author'], ['board-banner', 'banner'], ['ticker', 'ticker'], ['translations', 'translations']];
const handlers = Object.fromEntries(await Promise.all(gates.map(async ([path]) => [path, await import('../functions/api/settings/' + path + '.js')])));

function fixture({ role = 'member', permissions = [], access = true, otp = 0 } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL);
    CREATE TABLE admin_users(id INTEGER PRIMARY KEY,username TEXT,display_name TEXT,password_hash TEXT,role TEXT,status TEXT,permissions TEXT,token_min_iat INTEGER DEFAULT 0,totp_enabled INTEGER DEFAULT 0,totp_secret TEXT,totp_backup_codes TEXT,totp_enrolled_at TEXT,editor_code TEXT,ai_daily_limit INTEGER,must_change_password INTEGER DEFAULT 0,member_self_rename_used INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,last_login_at TEXT,deleted_at TEXT,created_by INTEGER);
    CREATE TABLE admin_user_presets(id INTEGER PRIMARY KEY,slug TEXT,name TEXT,description TEXT,is_builtin INTEGER,permissions TEXT,updated_at TEXT);
    CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,image_url TEXT,published INTEGER,publish_at TEXT,created_at TEXT,category TEXT,views INTEGER,subtitle TEXT,content TEXT,image_caption TEXT,tag TEXT,author TEXT,youtube_url TEXT);
    CREATE TABLE post_views(post_id INTEGER,viewed_at TEXT);`);
  sql.exec(`CREATE TABLE home_banners(id INTEGER PRIMARY KEY AUTOINCREMENT,image_url TEXT,link_url TEXT,title TEXT,sort_order INTEGER,active INTEGER,starts_at TEXT,ends_at TEXT,created_at TEXT DEFAULT (datetime('now')),updated_at TEXT);`);
  sql.prepare('INSERT INTO admin_users(id,username,display_name,role,status,permissions,totp_enabled,updated_at) VALUES(1,?,?,?,?,?,?,?)').run('fixture-admin', 'Fixture', role, 'active', JSON.stringify({ access_admin: access, permissions }), otp, '2026-10-15 00:00:00');
  const state = { writes: [], batches: [], batchResults: [], beforeBatch: null, beforeSettingsWrite: null, failNextSiteMetaRead: false, failAt: -1 };
  const db = Object.assign(new (class D1Database {})(), {
    prepare(query) {
      let args = [];
      return { query, get args() { return args; }, bind(...values) { args = values; return this; },
        async first() { if (/^INSERT INTO api_rate_limit/.test(query.trim())) state.writes.push(query); if (state.failNextSiteMetaRead && query.includes('SELECT value FROM settings WHERE key = ?') && args[0] === 'site_meta') { state.failNextSiteMetaRead = false; throw new Error('synthetic uncertain metadata read'); } return sql.prepare(query).get(...args) || null; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async run() { if (/^SELECT\b/.test(query.trim())) return { success: true, results: sql.prepare(query).all(...args), meta: { changes: 0 } }; state.writes.push(query); if (/^INSERT INTO settings\s*\(/.test(query.trim()) && state.beforeSettingsWrite) { const hook = state.beforeSettingsWrite; state.beforeSettingsWrite = null; hook(); } if (/^UPDATE admin_users SET/.test(query.trim()) && state.beforeUserUpdate) { const hook = state.beforeUserUpdate; state.beforeUserUpdate = null; hook(); } const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      if (state.beforeBatch && statements.some((statement) => /^(INSERT|UPDATE|DELETE)\b/.test(statement.query.trim()))) { const hook = state.beforeBatch; state.beforeBatch = null; hook(); }
      state.batches.push(statements.map((statement) => statement.query));
      sql.exec('BEGIN');
      try {
        const results = [];
        for (let i = 0; i < statements.length; i++) { if (state.failAt === i) throw new Error('fixture transaction failure'); results.push(await statements[i].run()); }
        sql.exec('COMMIT'); state.batchResults.push(results); return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  });
  return { sql, state, env: { DB: db, ADMIN_SECRET: SECRET }, role };
}
function set(f, key, value) { f.sql.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
function get(f, key) { return f.sql.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
async function request(f, handler, path, body, { method = 'PUT', anonymous = false, id = '2' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!anonymous) headers.Cookie = 'admin_token=' + await createToken(SECRET, { role: f.role, uid: 1, username: 'fixture-admin' });
  return handler({ env: f.env, params: { id }, request: new Request('https://local-test.invalid' + path, { method, headers, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }) });
}

test('admin user lookups preserve fields, soft deletion, owner count and errors', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.prepare('UPDATE admin_users SET password_hash=? WHERE id=1').run('synthetic-hash');
    f.sql.exec("INSERT INTO admin_users(id,username,display_name,password_hash,role,status,permissions) VALUES(2,'disabled','Disabled','hash-2','owner','disabled','{}'),(3,'deleted','Deleted','hash-3','owner','deleted','{}'),(4,'member','Member','hash-4','member','active','{}')");
    const byId=await loadAdminUserById(f.env,'1');
    assert.equal(byId.username,'fixture-admin');
    assert.equal(Object.hasOwn(byId,'password_hash'),false);
    assert.equal((await loadAdminUserByUsername(f.env,' FIXTURE-ADMIN ')).password_hash,'synthetic-hash');
    assert.equal((await loadAdminUserById(f.env,2)).status,'disabled');
    assert.equal(await loadAdminUserById(f.env,3),null);
    assert.equal(await loadAdminUserByUsername(f.env,'deleted'),null);
    assert.equal(await loadAdminUserById(f.env,'invalid'),null);
    assert.equal(await countActiveOwners(f.env),1);
    const prepare=f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare=query=>{const stmt=prepare(query);if(query.includes('FROM admin_users')) stmt.first=async()=>{throw new Error('synthetic user lookup failure');};return stmt;};
    await assert.rejects(loadAdminUserById(f.env,1));
    await assert.rejects(loadAdminUserByUsername(f.env,'member'));
    await assert.rejects(countActiveOwners(f.env));
  } finally {f.sql.close();}
});

test('Rust account identity validation matches existing constraints and errors', async () => {
  const f=fixture({role:'owner'});
  try {
    const cases=[null,'',' A ','OWNER','Admin','valid_name','가나다','a'.repeat(33),'a'.repeat(32),'😀'.repeat(31),'\ufeff  Scout  \ufeff',42,false,['one','two'],{name:'example'}];
    for(const raw of cases) {
      for(const allowOwner of [false,true]) assert.deepEqual(await validateIdentityRust(f.env,'username',raw,allowOwner),validateUsername(raw,{allowOwner}),JSON.stringify([raw,allowOwner]));
      assert.deepEqual(await validateIdentityRust(f.env,'display',raw),validateDisplayName(raw),JSON.stringify(raw));
    }
    const extra=[null,'',' ','pass','password','😀'.repeat(129),'Editor.A','x'.repeat(33),'ACTIVE','disabled','bad',0,-1,1.9,10000,10001,'0x10','Infinity',false,true,[],[5],{x:1}];
    for(const raw of extra) for(const [kind,legacy] of [['password',validatePassword],['editor',validateEditorCode],['ai-limit',validateAiDailyLimit],['status',validateStatus]]) {
      assert.deepEqual(await validateIdentityRust(f.env,kind,raw),legacy(raw),JSON.stringify([kind,raw]));
    }
  } finally {f.sql.close();}
});

test('Rust permission validation matches allowlist, malformed tokens and ordering', async () => {
  const f=fixture({role:'owner'});
  try {
    for(const raw of [null, false, 'bad', [], {}, {access_admin:[],permissions:['view:hero','write:ticker','view:hero',null,42]}, {access_admin:false,permissions:['view:unknown']}, {access_admin:true,permissions:['admin:hero']}, {access_admin:'false',permissions:['view:hero\n']}, {access_admin:0,permissions:'view:hero'}, {access_admin:true,permissions:['write:hero','view:hero']}]) {
      assert.deepEqual(await validatePermissionsRust(f.env,raw),validatePermissions(raw),JSON.stringify(raw));
    }
  } finally {f.sql.close();}
});

test('owner user list preserves order, visibility and duplicate checks', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.exec("UPDATE admin_users SET created_at='2024-01-01',password_hash='synthetic-secret' WHERE id=1; INSERT INTO admin_users(id,username,display_name,role,status,permissions,editor_code,password_hash,created_at,deleted_at) VALUES(2,'activeuser','Active','member','active','{}','Editor.A','secret-a','2025-01-01',NULL),(3,'deleteduser','Deleted','member','deleted','{}','Editor.B','secret-b','2026-01-01','2026-01-02'),(4,'otheruser','Other','member','active','{}',NULL,'secret-c','2026-02-01',NULL)");
    const fullToken=await createToken(SECRET,{role:'full',uid:1,username:'fixture-admin'});
    const response=await users.onRequestGet({env:f.env,request:new Request('https://local-test.invalid/api/admin/users',{headers:{Cookie:'admin_token='+fullToken}})});
    assert.equal(response.status,200);
    const payload=await response.json();
    const expected=f.sql.prepare("SELECT id,username,display_name,role,permissions,editor_code,ai_daily_limit,status,must_change_password,member_self_rename_used,created_at,last_login_at,deleted_at FROM admin_users ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,status='deleted',created_at DESC").all().map(row=>serializeAdminUser(row));
    assert.deepEqual(payload.users,expected);
    assert.deepEqual(payload.users.map(user=>user.id),[1,4,2,3]);
    assert(!JSON.stringify(payload).includes('synthetic-secret'));
    const base={username:'deleteduser',display_name:'합성 사용자',password:'synthetic-password',editor_code:null};
    let rejected=await request(f,users.onRequestPost,'/api/admin/users',base);
    assert.equal(rejected.status,409);
    assert.match((await rejected.json()).error,/복구/);
    rejected=await request(f,users.onRequestPost,'/api/admin/users',{...base,username:'newuser',editor_code:'Editor.A'});
    assert.equal(rejected.status,409);
    assert.match((await rejected.json()).error,/편집자 코드/);
    const memberToken=await createToken(SECRET,{role:'member',uid:4,username:'otheruser'});
    const memberGet=await users.onRequestGet({env:f.env,request:new Request('https://local-test.invalid/api/admin/users',{headers:{Cookie:'admin_token='+memberToken}})});
    assert.equal(memberGet.status,403);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_users').get().n,4);
  } finally {f.sql.close();}
});

test('admin creation preserves password protection, authorization and failed writes', async () => {
  const f=fixture({role:'owner'});
  const body={username:'newmember',display_name:'합성 사용자',password:'synthetic-password',editor_code:'Editor.X',ai_daily_limit:7,must_change_password:false};
  try {
    const unauthorized=await request(f,users.onRequestPost,'/api/admin/users',body,{method:'POST',anonymous:true});
    assert.equal(unauthorized.status,401);
    const response=await request(f,users.onRequestPost,'/api/admin/users',body,{method:'POST'});
    assert.equal(response.status,201);
    const payload=await response.json();
    assert.equal(payload.user.username,'newmember');
    assert.equal(payload.user.role,'member');
    assert.equal(payload.user.status,'active');
    assert(!JSON.stringify(payload).includes('synthetic-password'));
    assert.equal(Object.hasOwn(payload.user,'password_hash'),false);
    const row=f.sql.prepare('SELECT * FROM admin_users WHERE username=?').get('newmember');
    assert.equal(row.created_by,1);
    assert.equal(row.ai_daily_limit,7);
    assert.equal(row.must_change_password,0);
    assert.equal(await verifyAdminPasswordHash(body.password,JSON.parse(row.password_hash)),true);
    f.sql.exec("CREATE TRIGGER reject_synthetic_user BEFORE INSERT ON admin_users WHEN NEW.username='rejected' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const failed=await request(f,users.onRequestPost,'/api/admin/users',{...body,username:'rejected',editor_code:null},{method:'POST'});
    assert.equal(failed.status,500);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_users WHERE username=?').get('rejected').n,0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_users WHERE username=?').get('newmember').n,1);
  } finally { f.sql.close(); }
});

test('user activity and export preserve access, cursor, private scope and missing-source fallbacks', async () => {
  for (const hasOps of [true,false]) {
    const f=fixture({role:'owner'});
    try {
      f.sql.exec(`INSERT INTO admin_users(id,username,display_name,role,status,permissions) VALUES(2,'membertwo','Member','member','active','{"access_admin":true,"permissions":[]}'),(3,'otheruser','Other','member','active','{"access_admin":true,"permissions":[]}'); CREATE TABLE ai_usage_log(id INTEGER,created_at TEXT,endpoint TEXT,model TEXT,input_chars INTEGER,output_chars INTEGER,prompt_tokens INTEGER,completion_tokens INTEGER,total_tokens INTEGER,latency_ms INTEGER,status TEXT,error_code TEXT,actor TEXT); INSERT INTO ai_usage_log(id,created_at,actor) VALUES(1,'2026-01-02','membertwo'),(2,'2026-01-03','otheruser'); CREATE TABLE post_history(id INTEGER,post_id INTEGER,action TEXT,summary TEXT,created_at TEXT); INSERT INTO post_history VALUES(1,4,'update','edited by membertwo','2026-01-02'),(2,5,'update','other only','2026-01-03'); CREATE TABLE settings_history(id INTEGER,setting_key TEXT,actor TEXT,created_at TEXT,message TEXT); INSERT INTO settings_history VALUES(1,'hero','membertwo','2026-01-02','changed'),(2,'hero','otheruser','2026-01-03','other')`);
      if(hasOps) f.sql.exec("CREATE TABLE operational_events(id INTEGER,channel TEXT,type TEXT,level TEXT,actor TEXT,ip TEXT,path TEXT,message TEXT,details TEXT,created_at TEXT); INSERT INTO operational_events VALUES(1,'admin','post_update','info','membertwo','192.0.2.1','/x','first','{}','2026-01-02'),(2,'admin','event','info','membertwo','192.0.2.2','/y','second','{}','2026-01-03'),(3,'admin','event','info','otheruser','192.0.2.3','/z','private','{}','2026-01-04')");
      const member=await createToken(SECRET,{role:'member',uid:2,username:'membertwo'});
      const other=await createToken(SECRET,{role:'member',uid:3,username:'otheruser'});
      const owner=await createToken(SECRET,{role:'full',uid:1,username:'fixture-admin'});
      const run=async(handler,path,token,id='2')=>handler({env:f.env,params:{id},request:new Request('https://local-test.invalid'+path,{headers:{Cookie:'admin_token='+token}})});
      for(const path of ['/api/admin/users/2/activity?limit=1','/api/admin/users/2/activity?before=2&limit=2']) {
        const old=await run(originalActivity,path,member), current=await run(actualActivity,path,member);
        assert.equal(current.status,old.status);
        assert.deepEqual(await current.json(),await old.json());
      }
      const oldExport=await run(originalExport,'/api/admin/users/2/export',member);
      const newExport=await run(actualExport,'/api/admin/users/2/export',member);
      assert.equal(newExport.status,200);
      assert.equal(newExport.headers.get('content-disposition'),oldExport.headers.get('content-disposition'));
      const previous=await oldExport.json(),current=await newExport.json();
      delete previous.generated_at;delete current.generated_at;
      assert.deepEqual(current,previous);
      assert.equal(current.counts.ai_usage_log,1);
      assert.equal(current.counts.post_history,1);
      assert(!JSON.stringify(current).includes('192.0.2.3'));
      assert.equal((await run(actualActivity,'/api/admin/users/2/activity',other)).status,403);
      assert.equal((await run(actualExport,'/api/admin/users/2/export',other)).status,403);
      assert.equal((await run(actualExport,'/api/admin/users/2/export',owner)).status,200);
    } finally {f.sql.close();}
  }
});

for (const [path, slug] of gates) test(path + ': exact write permission, disabled access, anonymous and rate limit', async () => {
  let f = fixture({ permissions: ['view:' + slug] });
  assert.equal((await request(f, handlers[path].onRequestPut, '/api/settings/' + path, '{invalid')).status, 403);
  assert.equal(f.state.writes.length, 0);
  f = fixture({ permissions: ['write:' + slug], access: false });
  assert.equal((await request(f, handlers[path].onRequestPut, '/api/settings/' + path, '{invalid')).status, 403);
  f = fixture({ permissions: ['write:' + slug] });
  assert.equal((await request(f, handlers[path].onRequestPut, '/api/settings/' + path, '{invalid', { anonymous: true })).status, 401);
  assert.equal((await request(f, handlers[path].onRequestPut, '/api/settings/' + path, '{invalid')).status, 400);
  assert.ok(f.state.writes.some((query) => query.includes('INSERT INTO api_rate_limit')));
});

test('actual author handler normalizes and records former value', async () => {
  const f = fixture({ permissions: ['write:author'] }); set(f, 'author_name', 'Previous');
  assert.equal((await request(f, handlers.author.onRequestPut, '/api/settings/author', { author: '  New author  ' })).status, 200);
  assert.equal(get(f, 'author_name'), 'New author');
  assert.deepEqual(f.sql.prepare('SELECT key,value FROM settings_history').all().map((row) => ({ ...row })), [{ key: 'author_name', value: 'Previous' }]);
});

for (const [path, key, rev, payload] of [
  ['board-copy', 'board_copy', 'board_copy_rev', { korea: { description: 'New copy' } }],
  ['site-meta', 'site_meta', 'site_meta_rev', { pages: { home: { title: 'New title' } }, footer: { raw_text: 'Retained footer' }, image_url: 'https://local-test.invalid/retained.png' }],
  ['feature-definition', 'feature_definition', 'feature_definition_rev', { content: '# Fixture\n\n## 0. 문서 목적과 사용 순서\nNew document' }],
]) test(path + ': actual D1 SQL CAS winner, stale request and racing writer preserve data/history', async () => {
  const mod = await import('../functions/api/settings/' + path + '.js');
  const f = fixture({ role: 'owner' }); set(f, key, path === 'feature-definition' ? 'Previous document' : '{}'); set(f, rev, '2');
  const response = await request(f, mod.onRequestPut, '/api/settings/' + path, { ...payload, if_revision: 2 });
  assert.equal(response.status, 200); assert.equal(get(f, rev), '3');
  const saved = get(f, key); const historyCount = f.sql.prepare('SELECT COUNT(*) n FROM settings_history').get().n;
  assert.equal((await request(f, mod.onRequestPut, '/api/settings/' + path, { ...payload, if_revision: 2 })).status, 409);
  assert.equal(get(f, key), saved);
  f.state.beforeBatch = () => set(f, rev, '4');
  assert.equal((await request(f, mod.onRequestPut, '/api/settings/' + path, { ...payload, if_revision: 3 })).status, 409);
  assert.equal(get(f, key), saved); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM settings_history').get().n, historyCount);
});

test('preset batch preserves cohort scope, individual access and rollback', async () => {
  const f = fixture({ role: 'owner' });
  const old = JSON.stringify({ access_admin: true, permissions: ['view:hero'] });
  f.sql.prepare('INSERT INTO admin_user_presets VALUES(1,?,?,?,?,?,?)').run('fixture', 'Fixture', '', 0, old, '2026-10-15 00:00:00');
  for (const [id, access, perms, status, role] of [[2, true, ['view:hero'], 'active', 'member'], [3, false, ['view:hero'], 'active', 'member'], [4, true, ['view:ticker'], 'active', 'member'], [5, true, ['view:hero'], 'disabled', 'member'], [6, true, ['view:hero'], 'active', 'owner']]) {
    f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(?,?,?,?,?)').run(id, 'fixture-' + id, role, status, JSON.stringify({ access_admin: access, permissions: perms }));
  }
  const next = { access_admin: false, permissions: ['view:ticker'] };
  let response = await request(f, presetPut, '/api/admin/presets/1', { name: 'Updated', permissions: next, if_permissions: JSON.parse(old) }, { id: '1' });
  assert.equal(response.status, 200); assert.equal((await response.json()).propagated_members, 1);
  assert.deepEqual(JSON.parse(f.sql.prepare('SELECT permissions FROM admin_users WHERE id=2').get().permissions), { access_admin: true, permissions: ['view:ticker'] });
  assert.equal(JSON.parse(f.sql.prepare('SELECT permissions FROM admin_users WHERE id=3').get().permissions).access_admin, false);
  const before = f.sql.prepare('SELECT permissions FROM admin_user_presets WHERE id=1').get().permissions;
  f.state.failAt = 0;
  response = await request(f, presetPut, '/api/admin/presets/1', { name: 'Failing', permissions: { access_admin: true, permissions: [] } }, { id: '1' });
  assert.equal(response.status, 500); assert.equal(f.sql.prepare('SELECT permissions FROM admin_user_presets WHERE id=1').get().permissions, before);
});

test('preset catalog shapes sorted permissions and malformed stored data', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.exec('ALTER TABLE admin_user_presets ADD COLUMN created_at TEXT');
    const insert=f.sql.prepare('INSERT INTO admin_user_presets(id,slug,name,description,is_builtin,permissions,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?)');
    insert.run(1,'fixture','Fixture',null,0,'{"access_admin":true,"permissions":["z","a",{"z":1,"a":2},3]}',null,null);
    insert.run(2,'broken','Broken','',1,'{broken','2026-01-01','2026-01-01');
    const response=await request(f,presetCatalog.onRequestGet,'/api/admin/presets',null,{method:'GET'});
    assert.equal(response.status,200);
    const actual=(await response.json()).presets;
    const expected=f.sql.prepare('SELECT id,slug,name,description,permissions,is_builtin,created_at,updated_at FROM admin_user_presets ORDER BY is_builtin DESC,id ASC').all().map(row=>{
      let parsed;try{parsed=JSON.parse(row.permissions||'{}');}catch{parsed={};}
      return {id:row.id,slug:row.slug,name:row.name,description:row.description||'',is_builtin:!!row.is_builtin,permissions:{access_admin:!!(parsed&&parsed.access_admin),permissions:Array.isArray(parsed&&parsed.permissions)?parsed.permissions.slice().sort():[]},created_at:row.created_at||null,updated_at:row.updated_at||null};
    });
    assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  } finally {f.sql.close();}
});

test('Rust preset cohort matches exact permission sets and excludes other users', async () => {
  const f=fixture({role:'owner'});
  try {
    const old=JSON.stringify({access_admin:true,permissions:['view:hero','view:ticker']});
    const matches=JSON.stringify({permissions:['view:ticker','view:hero'],access_admin:true});
    const different=JSON.stringify({access_admin:false,permissions:['view:hero','view:ticker']});
    f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(?,?,?,?,?)').run(2,'matched','member','active',matches);
    f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(?,?,?,?,?)').run(3,'different','member','active',different);
    f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(?,?,?,?,?)').run(4,'disabled','member','disabled',matches);
    f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(?,?,?,?,?)').run(5,'otherowner','owner','active',matches);
    const response=await queryRust({env:f.env,request:{url:'https://local-test.invalid/'}},'preset-mutation',{operation:'matching-members',id:1,old_permissions:old,next_permissions:['view:calendar']});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).members,[{id:2,previous:matches,next:JSON.stringify({access_admin:true,permissions:['view:calendar']})}]);
  } finally {f.sql.close();}
});

test('preset input normalization matches identifier, reserved and name rules', async () => {
  const f=fixture({role:'owner'});
  try {
    const ctx={env:f.env,request:{url:'https://local-test.invalid/'}};
    for(const body of [{slug:'',name:'x'},{slug:'A',name:'x'},{slug:'writer',name:'x'},{slug:' OK-NAME ',name:' 합성 ',description:' 메모 '},{slug:'valid',name:'  '},{slug:'valid',name:42,description:'가'.repeat(520)},{slug:'😀😀',name:'x'}]) {
      const slug=String(body.slug||'').trim().toLowerCase(),name=String(body.name||'').trim(),description=String(body.description||'').trim().slice(0,500);
      const expected=!/^[a-z0-9-]{2,40}$/.test(slug)?{error:'slug는 영문 소문자·숫자·하이픈 2~40자여야 합니다.',status:400}:['writer','reader','marketing'].includes(slug)?{error:'이 slug는 빌트인 프리셋으로 예약되어 있습니다.',status:409}:!name?{error:'프리셋 이름을 입력해주세요.',status:400}:{slug,name,description};
      const response=await queryRust(ctx,'preset-normalize',{operation:'create',body}); assert.deepEqual(await response.json(),expected);
    }
    for(const body of [{},{name:'  '},{name:' 이름 ',description:'설명 '},{name:null},{description:7}]) {
      const name=String(body.name||'').trim(),description=String(body.description||'').trim().slice(0,500);
      const expected=body.name!==undefined&&!name?{error:'프리셋 이름은 비워둘 수 없습니다.',status:400}:{name,description};
      const response=await queryRust(ctx,'preset-normalize',{operation:'update',body}); assert.deepEqual(await response.json(),expected);
    }
  } finally {f.sql.close();}
});

test('preset permission snapshot comparison matches legacy semantics', async () => {
  const f=fixture({role:'owner'});
  try {
    const ctx={env:f.env,request:{url:'https://local-test.invalid/'}};
    const canonical=value=>JSON.stringify({access_admin:!!(value&&value.access_admin),permissions:(Array.isArray(value&&value.permissions)?value.permissions:[]).filter(v=>typeof v==='string').sort()});
    const parse=raw=>{if(raw&&typeof raw==='object')return raw;if(typeof raw!=='string'||!raw.trim())return {access_admin:false,permissions:[]};try{return JSON.parse(raw);}catch{return {access_admin:false,permissions:[]};}};
    for(const [expected,stored] of [[{access_admin:true,permissions:['view:ticker','view:hero']},'{"permissions":["view:hero","view:ticker"],"access_admin":true}'],[null,'{broken'],['{"access_admin":true}','{"access_admin":true}'],[{access_admin:false,permissions:[]},'null'],[{access_admin:true,permissions:['view:hero','view:hero']},'{"access_admin":true,"permissions":["view:hero"]}'],[{access_admin:[],permissions:[1,'x']},'{"access_admin":true,"permissions":["x"]}']]) {
      const result=await queryRust(ctx,'preset-permissions-compare',{expected,stored});
      assert.equal((await result.json()).matches,canonical(expected)===canonical(parse(stored)),JSON.stringify([expected,stored]));
    }
  } finally {f.sql.close();}
});

test('user permission compare rejects stale modal, permits matching snapshot', async () => {
  const f = fixture({ role: 'owner' }); const old = { access_admin: true, permissions: ['view:hero'] };
  f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(2,?,?,?,?)').run('member-two', 'member', 'active', JSON.stringify(old));
  let response = await request(f, userPut, '/api/admin/users/2', { permissions: { access_admin: true, permissions: [] }, if_permissions: { access_admin: true, permissions: ['view:ticker'] } });
  assert.equal(response.status, 409);
  response = await request(f, userPut, '/api/admin/users/2', { permissions: { access_admin: false, permissions: [] }, if_permissions: old });
  assert.equal(response.status, 200); assert.equal(JSON.parse(f.sql.prepare('SELECT permissions FROM admin_users WHERE id=2').get().permissions).access_admin, false);
});

test('admin update retains duplicate checks and concurrent permission protection', async () => {
  const f=fixture({role:'owner'});
  const old={access_admin:true,permissions:['view:hero']};
  try {
    f.sql.prepare('INSERT INTO admin_users(id,username,display_name,role,status,permissions,editor_code) VALUES(2,?,?,?,?,?,?)').run('membertwo','Original','member','active',JSON.stringify(old),'Editor.A');
    f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions,editor_code) VALUES(3,?,?,?,?,?)').run('otheruser','member','active','{}','Editor.B');
    assert.equal((await request(f,userPut,'/api/admin/users/2',{username:'otheruser'})).status,409);
    assert.equal((await request(f,userPut,'/api/admin/users/2',{editor_code:'Editor.B'})).status,409);
    f.state.beforeUserUpdate=()=>f.sql.prepare('UPDATE admin_users SET permissions=? WHERE id=2').run(JSON.stringify({access_admin:true,permissions:['view:ticker']}));
    const raced=await request(f,userPut,'/api/admin/users/2',{display_name:'Must not save',permissions:{access_admin:false,permissions:[]},if_permissions:old});
    assert.equal(raced.status,409);
    assert.equal(f.sql.prepare('SELECT display_name FROM admin_users WHERE id=2').get().display_name,'Original');
    const updated=await request(f,userPut,'/api/admin/users/2',{username:'renamed',display_name:'변경됨',editor_code:null,ai_daily_limit:9,must_change_password:true});
    assert.equal(updated.status,200);
    const result=(await updated.json()).user;
    assert.equal(result.username,'renamed');
    assert.equal(result.display_name,'변경됨');
    assert.equal(result.editor_code,null);
    assert.equal(f.sql.prepare('SELECT ai_daily_limit FROM admin_users WHERE id=2').get().ai_daily_limit,9);
    f.sql.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON admin_users WHEN OLD.id=2 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    assert.equal((await request(f,userPut,'/api/admin/users/2',{display_name:'Failed'})).status,500);
    assert.equal(f.sql.prepare('SELECT display_name FROM admin_users WHERE id=2').get().display_name,'변경됨');
  } finally { f.sql.close(); }
});

test('account deletion protects owners, retains articles and rolls back failed anonymization', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.exec(`CREATE TABLE operational_events(id INTEGER PRIMARY KEY,channel TEXT,type TEXT,level TEXT,actor TEXT,ip TEXT,path TEXT,message TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE ai_usage_log(id INTEGER PRIMARY KEY,actor TEXT);
      CREATE TABLE settings_history(id INTEGER PRIMARY KEY,actor TEXT);
      ALTER TABLE posts ADD COLUMN author_user_id INTEGER;
      INSERT INTO admin_users(id,username,role,status,permissions,token_min_iat) VALUES(2,'membertwo','member','active','{}',0),(3,'memberthree','member','active','{}',0);
      INSERT INTO posts(id,title,author_user_id) VALUES(10,'Synthetic',3);
      INSERT INTO operational_events(id,type,level,actor) VALUES(10,'synthetic','info','memberthree');
      INSERT INTO ai_usage_log VALUES(10,'memberthree'); INSERT INTO settings_history VALUES(10,'memberthree');`);
    assert.equal((await request(f,userDelete,'/api/admin/users/1',{}, {method:'DELETE',id:'1'})).status,409);
    const soft=await request(f,userDelete,'/api/admin/users/2',{}, {method:'DELETE',id:'2'});
    assert.equal(soft.status,200);
    const softRow=f.sql.prepare('SELECT status,deleted_at,token_min_iat FROM admin_users WHERE id=2').get();
    assert.equal(softRow.status,'deleted'); assert(softRow.deleted_at); assert(softRow.token_min_iat>0);
    f.state.failAt=2;
    const failed=await request(f,userDelete,'/api/admin/users/3?hard=1',{}, {method:'DELETE',id:'3'});
    assert.equal(failed.status,500);
    assert.equal(f.sql.prepare('SELECT username FROM admin_users WHERE id=3').get().username,'memberthree');
    assert.equal(f.sql.prepare('SELECT actor FROM operational_events WHERE id=10').get().actor,'memberthree');
    assert.equal(f.sql.prepare('SELECT actor FROM ai_usage_log WHERE id=10').get().actor,'memberthree');
    f.state.failAt=-1;
    const hard=await request(f,userDelete,'/api/admin/users/3?hard=1',{}, {method:'DELETE',id:'3'});
    assert.equal(hard.status,200);
    assert.equal((await hard.json()).anonymized_as,'[deleted:3]');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_users WHERE id=3').get().n,0);
    for (const table of ['operational_events','ai_usage_log','settings_history']) assert.equal(f.sql.prepare(`SELECT actor FROM ${table} WHERE id=10`).get().actor,'[deleted:3]');
    assert.equal(f.sql.prepare('SELECT author_user_id FROM posts WHERE id=10').get().author_user_id,3);
  } finally { f.sql.close(); }
});

test('hard delete accepts the standard settings history schema without actor', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.exec(`CREATE TABLE operational_events(id INTEGER PRIMARY KEY,channel TEXT,type TEXT,level TEXT,actor TEXT,ip TEXT,path TEXT,message TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE ai_usage_log(id INTEGER PRIMARY KEY,actor TEXT);
      CREATE TABLE settings_history(id INTEGER PRIMARY KEY,key TEXT,value TEXT,saved_at TEXT);
      INSERT INTO admin_users(id,username,role,status,permissions) VALUES(2,'membertwo','member','active','{}');
      INSERT INTO operational_events(id,type,actor) VALUES(10,'synthetic','membertwo');
      INSERT INTO ai_usage_log VALUES(10,'membertwo');
      INSERT INTO settings_history VALUES(10,'hero','original','2026-01-01');`);
    const result=await request(f,userDelete,'/api/admin/users/2?hard=1',{}, {method:'DELETE',id:'2'});
    assert.equal(result.status,200);
    assert.equal(f.sql.prepare('SELECT actor FROM operational_events WHERE id=10').get().actor,'[deleted:2]');
    assert.equal(f.sql.prepare('SELECT actor FROM ai_usage_log WHERE id=10').get().actor,'[deleted:2]');
    assert.equal(f.sql.prepare('SELECT value FROM settings_history WHERE id=10').get().value,'original');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_users WHERE id=2').get().n,0);
  } finally { f.sql.close(); }
});

test('account restore, password reset and self rename preserve guards and data', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.prepare('INSERT INTO admin_users(id,username,display_name,role,status,permissions,deleted_at,token_min_iat) VALUES(2,?,?,?,?,?,?,0)').run('membertwo','Synthetic','member','deleted',JSON.stringify({access_admin:true,permissions:[]}),'2026-01-01');
    assert.equal((await request(f,userReset,'/api/admin/users/2/password-reset',{}, {method:'POST',id:'2'})).status,404);
    f.sql.exec("CREATE TRIGGER reject_account_update BEFORE UPDATE ON admin_users WHEN OLD.id=2 BEGIN SELECT RAISE(ABORT,'synthetic account failure'); END");
    assert.equal((await request(f,userRestore,'/api/admin/users/2/restore',{}, {method:'POST',id:'2'})).status,500);
    assert.equal(f.sql.prepare('SELECT status FROM admin_users WHERE id=2').get().status,'deleted');
    f.sql.exec('DROP TRIGGER reject_account_update');
    const restored=await request(f,userRestore,'/api/admin/users/2/restore',{}, {method:'POST',id:'2'});
    assert.equal(restored.status,200);
    assert.equal(f.sql.prepare('SELECT deleted_at FROM admin_users WHERE id=2').get().deleted_at,null);
    assert.equal((await request(f,userRestore,'/api/admin/users/2/restore',{}, {method:'POST',id:'2'})).status,409);
    f.sql.exec("CREATE TRIGGER reject_account_update BEFORE UPDATE ON admin_users WHEN OLD.id=2 BEGIN SELECT RAISE(ABORT,'synthetic account failure'); END");
    assert.equal((await request(f,userReset,'/api/admin/users/2/password-reset',{password:'synthetic-password'}, {method:'POST',id:'2'})).status,500);
    assert.equal(f.sql.prepare('SELECT password_hash FROM admin_users WHERE id=2').get().password_hash,null);
    f.sql.exec('DROP TRIGGER reject_account_update');
    const reset=await request(f,userReset,'/api/admin/users/2/password-reset',{password:'synthetic-password'}, {method:'POST',id:'2'});
    assert.equal(reset.status,200);
    assert.equal((await reset.json()).temp_password,'synthetic-password');
    const stored=f.sql.prepare('SELECT password_hash,must_change_password,token_min_iat FROM admin_users WHERE id=2').get();
    assert.equal(await verifyAdminPasswordHash('synthetic-password',JSON.parse(stored.password_hash)),true);
    assert.equal(stored.must_change_password,1); assert(stored.token_min_iat>0);
    assert.equal((await request(f,userReset,'/api/admin/users/1/password-reset',{}, {method:'POST',id:'1'})).status,409);
  } finally { f.sql.close(); }
  const member=fixture();
  try {
    const profile=await request(member,userMe,'/api/admin/users/me',null,{method:'GET'});
    assert.equal(profile.status,200); assert.equal((await profile.json()).user.username,'fixture-admin');
    member.sql.exec("CREATE TRIGGER reject_self_rename BEFORE UPDATE ON admin_users WHEN OLD.id=1 BEGIN SELECT RAISE(ABORT,'synthetic account failure'); END");
    assert.equal((await request(member,selfRename,'/api/admin/users/me/username',{username:'renamed'})).status,500);
    assert.equal(member.sql.prepare('SELECT member_self_rename_used FROM admin_users WHERE id=1').get().member_self_rename_used,0);
    member.sql.exec('DROP TRIGGER reject_self_rename');
    const renamed=await request(member,selfRename,'/api/admin/users/me/username',{username:'renamed'});
    assert.equal(renamed.status,200); assert.equal((await renamed.json()).user.username,'renamed');
    assert.equal(member.sql.prepare('SELECT member_self_rename_used FROM admin_users WHERE id=1').get().member_self_rename_used,1);
    assert.equal((await request(member,selfRename,'/api/admin/users/me/username',{username:'secondname'})).status,409);
  } finally { member.sql.close(); }
});

test('meta tag pool matches original frequency, Korean sorting, whitespace and access', async () => {
  const f=fixture({role:'owner'});
  try {
    f.sql.exec("ALTER TABLE posts ADD COLUMN meta_tags TEXT; INSERT INTO posts(id,meta_tags) VALUES(1,' 나,가,가,,　서울　'),(2,'가,다,나,\ufeff서울\ufeff'),(3,NULL),(4,'')");
    for(const limit of ['', '?limit=10', '?limit=500', '?limit=bad']) {
      const old=await request(f,originalMetaTagPool,'/api/admin/meta-tag-pool'+limit,null,{method:'GET'});
      const current=await request(f,metaTagPool,'/api/admin/meta-tag-pool'+limit,null,{method:'GET'});
      assert.equal(current.status,old.status);
      assert.deepEqual(await current.json(),await old.json());
    }
    assert.equal((await request(f,metaTagPool,'/api/admin/meta-tag-pool',null,{method:'GET',anonymous:true})).status,401);
    f.sql.exec('DROP TABLE posts');
    assert.equal((await request(f,metaTagPool,'/api/admin/meta-tag-pool',null,{method:'GET'})).status,500);
  } finally { f.sql.close(); }
});

test('board banner normalization preserves legacy fields, malformed data and object order', async () => {
  const f=fixture({role:'owner'});
  try {
    const current=handlers['board-banner'];
    const variants=[null,'{malformed',JSON.stringify({items:{worm:{event_name:'  세계 행사  ',event_date:'2026-02-31'},korea:{event_name:123,event_date:'bad'}}}),JSON.stringify({items:{wosm:{event_name:' WOSM ',event_date:'2027-01-02'},worm:{event_name:'이전'},apr:{event_name:'🌏'.repeat(20),event_date:'2026-2-03'}}})];
    for(const raw of variants) {
      if(raw===null) f.sql.prepare("DELETE FROM settings WHERE key='board_banner_events'").run(); else set(f,'board_banner_events',raw);
      const old=await originalBoardBanner.onRequestGet({env:f.env,request:new Request('https://local-test.invalid/api/settings/board-banner')});
      const actual=await current.onRequestGet({env:f.env,request:new Request('https://local-test.invalid/api/settings/board-banner')});
      assert.equal(actual.status,old.status); assert.equal(await actual.text(),await old.text());
    }
  } finally {f.sql.close();}
});

test('ticker and AI disclaimer input normalization match existing behavior', async () => {
  const f=fixture({role:'owner'});
  try {
    for(const body of [{items:[]},{items:'bad'},{items:['  하나  ',' ',null,false,42,['A','B'],{x:1},...Array.from({length:23},(_,i)=>'항목'+i)]}]) {
      const response=await queryRust({env:f.env,request:{url:'https://local-test.invalid/'}},'settings-text-normalize',{kind:'ticker',body});
      const expected=!Array.isArray(body.items)||!body.items.length?{error:'항목 배열을 입력해주세요'}:{items:body.items.map(s=>String(s).trim()).filter(Boolean).slice(0,20)};
      assert.deepEqual(await response.json(),expected);
    }
    for(const body of [{},{text:''},{text:'   '},{text:'\ufeff합성 문구\ufeff'},{text:42},{text:'가'.repeat(550)}]) {
      const response=await queryRust({env:f.env,request:{url:'https://local-test.invalid/'}},'settings-text-normalize',{kind:'ai-disclaimer',body});
      const text=body.text && typeof body.text==='string'?body.text.trim().slice(0,500):'본 글은 AI의 도움을 받아 작성되었습니다.';
      assert.deepEqual(await response.json(),{text});
    }
  } finally {f.sql.close();}
});

test('author and board copy normalization preserve defaults, legacy values and order', async () => {
  const f=fixture({role:'owner'});
  const context={env:f.env,request:{url:'https://local-test.invalid/'}};
  try {
    for(const body of [{},{author:''},{author:'   '},{author:'  Editor.Z  '},{author:42},{author:'a'.repeat(80)}]) {
      const response=await queryRust(context,'settings-text-normalize',{kind:'author',body});
      const author=body.author && typeof body.author==='string'?body.author.trim().slice(0,60):'Editor.A';
      assert.deepEqual(await response.json(),{author});
    }
    const defaults=Object.entries(DEFAULT_BOARD_COPY).map(([key,value])=>({key,description:value.description}));
    for(const raw of [null,'bad json',JSON.stringify({korea:{description:' 한국 '},wosm:{description:''}}),{latest:{description:123},apr:{description:'\ufeff문구\ufeff'},calendar:{description:'가'.repeat(650)}},[]]) {
      const response=await queryRust(context,'board-copy-normalize',{raw,defaults});
      const {entries}=await response.json();
      const actual=Object.fromEntries(entries.map(entry=>[entry.key,{description:entry.description}]));
      assert.equal(JSON.stringify(actual),JSON.stringify(normalizeBoardCopy(raw)));
    }
  } finally {f.sql.close();}
});

test('Rust navigation labels match legacy multilingual defaults and types', async () => {
  const f=fixture({role:'owner'});
  try {
    for(const raw of [null,{},[],{'nav.home':{ko:'  홈  ',en:'  Home  '},'nav.korea':{ko:'',en:'K'.repeat(100)}},{'nav.home':{ko:0,en:false},'nav.latest':{ko:['한','둘'],en:{value:'text'}}}]) {
      assert.equal(JSON.stringify(await normalizeNavLabelsRust(f.env,raw)),JSON.stringify(normalizeNavLabels(raw)));
      set(f,'nav_labels',JSON.stringify(raw));
      assert.deepEqual(await loadNavLabels(f.env),normalizeNavLabels(raw));
    }
    set(f,'nav_labels','{broken');
    assert.deepEqual(await loadNavLabels(f.env),normalizeNavLabels({}));
  } finally {f.sql.close();}
});

test('translations preserve locked keys, nested ordering and legacy values', async () => {
  const f=fixture({role:'owner'});
  try {
    const current=handlers.translations;
    for(const raw of ['{}','["one","two"]','null','{"z":{"ko":"한글","en":"English"},"nav.home":"blocked","constructor":"blocked","__proto__":"blocked","a":null,"2":"two"}']) {
      set(f,'translations',raw);
      const old=await originalTranslations.onRequestGet({env:f.env}),actual=await current.onRequestGet({env:f.env});
      assert.equal(actual.status,old.status); assert.equal(await actual.text(),await old.text());
    }
    set(f,'translations','{invalid');
    assert.equal((await current.onRequestGet({env:f.env})).status,500);
  } finally {f.sql.close();}
});

test('site metadata normalization preserves legacy upgrades, URLs, email and defaults', async () => {
  const f=fixture({role:'owner'});
  try {
    const defaults=normalizeSiteMeta(null), pageKeys=Object.keys(defaults.pages);
    const cases=[null,{}, {pages:{home:{title:LEGACY_HOME_TITLES[0],description:LEGACY_HOME_DESCRIPTIONS[0]},worm:{title:'세계',description:'설명'}},footer:{title:'  미디어 ',tip_email:'x@example.com',contact_email:'bad'},image_url:'  https://example.com/image.png  ',google_verification:'  abc  '},
      {pages:{home:{title:' '.repeat(10),description:'가'.repeat(300)},korea:{title:123,description:'새 소식'}},footer:{raw_text:'가'.repeat(4100),tip_email:'a@@example.com'},image_url:'javascript:alert(1)'},
      {pages:{wosm:{title:'WOSM'},worm:{title:'이전'}},image_url:'data:image/png;base64,AA==',naver_verification:'확인'},
    ];
    for(const raw of cases) {
      const response=await queryRust({env:f.env,request:{url:'https://local-test.invalid/'}},'site-meta-normalize',{raw,defaults,pageKeys,legacyTitles:LEGACY_HOME_TITLES,legacyDescriptions:LEGACY_HOME_DESCRIPTIONS});
      assert.equal(response.status,200);
      const result=await response.json(),pages={},footer={};
      for(const page of result.pages) pages[page.key]={title:page.title,description:page.description};
      for(const field of result.footer) footer[field.key]=field.value;
      const actual={pages,footer,image_url:result.image_url,google_verification:result.google_verification,naver_verification:result.naver_verification};
      assert.equal(JSON.stringify(actual),JSON.stringify(normalizeSiteMeta(raw)));
      set(f,'site_meta',JSON.stringify(raw));
      assert.deepEqual(await loadSiteMeta(f.env),normalizeSiteMeta(raw));
    }
    set(f,'site_meta','{invalid');
    assert.deepEqual(await loadSiteMeta(f.env),normalizeSiteMeta(null));
  } finally {f.sql.close();}
});

test('password change validates current password, preserves failed writes and rotates session', async () => {
  const f=fixture();
  try {
    const hash=JSON.stringify(await hashAdminPassword('synthetic-old-password'));
    f.sql.prepare('UPDATE admin_users SET password_hash=?,must_change_password=1 WHERE id=1').run(hash);
    const oldToken=await createToken(SECRET,{role:'member',uid:1,username:'fixture-admin'});
    const body={currentPassword:'synthetic-old-password',newPassword:'synthetic-new-password',confirmPassword:'synthetic-new-password'};
    const send=body=>changePassword({env:f.env,request:new Request('https://local-test.invalid/api/admin/password',{method:'POST',headers:{Cookie:'admin_token='+oldToken,'Content-Type':'application/json'},body:JSON.stringify(body)})});
    assert.equal((await send({...body,currentPassword:'incorrect'})).status,401);
    assert.equal(f.sql.prepare('SELECT password_hash FROM admin_users WHERE id=1').get().password_hash,hash);
    f.sql.exec("CREATE TRIGGER reject_password BEFORE UPDATE ON admin_users WHEN OLD.id=1 BEGIN SELECT RAISE(ABORT,'synthetic password failure'); END");
    assert.equal((await send(body)).status,500);
    assert.equal(f.sql.prepare('SELECT password_hash FROM admin_users WHERE id=1').get().password_hash,hash);
    f.sql.exec('DROP TRIGGER reject_password');
    const changed=await send(body);
    assert.equal(changed.status,200);
    const row=f.sql.prepare('SELECT password_hash,must_change_password,token_min_iat FROM admin_users WHERE id=1').get();
    assert.equal(await verifyAdminPasswordHash(body.newPassword,JSON.parse(row.password_hash)),true);
    assert.equal(row.must_change_password,0); assert(row.token_min_iat>0);
    assert.equal(await verifyToken(oldToken,f.env),false);
    const cookie=changed.headers.get('set-cookie'); assert.match(cookie,/HttpOnly/);
    const replacement=cookie.match(/admin_token=([^;]+)/)[1];
    assert.equal(await verifyToken(replacement,f.env),true);
    assert(!JSON.stringify(await changed.json()).includes(body.newPassword));
  } finally { f.sql.close(); }
});

test('TOTP enroll, backup consumption and disable keep one-time guarantees', async () => {
  const f=fixture();
  try {
    assert.equal((await request(f,totpHandlers.onRequestGet,'/api/admin/totp',null,{method:'GET',anonymous:true})).status,401);
    const started=await request(f,totpHandlers.onRequestPost,'/api/admin/totp',{}, {method:'POST'});
    assert.equal(started.status,200);
    const {secret}=await started.json();
    const code=await totp(secret,Math.floor(Date.now()/1000));
    assert.equal((await request(f,confirmTotp,'/api/admin/totp/confirm',{code:'00000000'},{method:'POST'})).status,401);
    const confirmed=await request(f,confirmTotp,'/api/admin/totp/confirm',{code},{method:'POST'});
    assert.equal(confirmed.status,200);
    const backups=(await confirmed.json()).backup_codes;
    assert.equal(backups.length,8);
    const verify=backup=>request(f,verifyTotpCode,'/api/admin/totp/verify',{code:backup},{method:'POST'});
    const used=await verify(backups[0]); assert.equal(used.status,200); assert.equal((await used.json()).used_backup,true);
    assert.equal((await verify(backups[0])).status,401);
    f.state.beforeUserUpdate=()=>f.sql.prepare('UPDATE admin_users SET totp_backup_codes=? WHERE id=1').run('[]');
    const raced=await verify(backups[1]); assert.equal(raced.status,401); assert.equal(raced.headers.get('set-cookie'),null);
    assert.equal((await request(f,totpHandlers.onRequestDelete,'/api/admin/totp',{code},{method:'DELETE'})).status,200);
    const row=f.sql.prepare('SELECT totp_enabled,totp_secret,totp_backup_codes FROM admin_users WHERE id=1').get();
    assert.equal(row.totp_enabled,0); assert.equal(row.totp_secret,null); assert.equal(row.totp_backup_codes,null);
  } finally { f.sql.close(); }
});

test('sensitive OTP gate rejects unavailable status without bypassing enrollment', async () => {
  const f=fixture({role:'owner',otp:1});
  try {
    const token=await createToken(SECRET,{role:'full',uid:1});
    const otp=await issueOtpToken(SECRET,1);
    const req=new Request('https://local-test.invalid/api/admin/users',{headers:{Cookie:'admin_token='+token,'X-Admin-Otp':otp}});
    assert.equal(await requireOtp(req,f.env),null);
    const prepare=f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare=query=>{const stmt=prepare(query);if(query.startsWith('SELECT totp_enabled FROM admin_users')) stmt.first=async()=>{throw new Error('synthetic OTP lookup failure');};return stmt;};
    const blocked=await requireOtp(req,f.env);
    assert.equal(blocked.status,503); assert.equal((await blocked.json()).error,'server_unavailable');
    f.env.DB.prepare=prepare;
    assert.equal(await requireOtp(req,f.env),null);
  } finally { f.sql.close(); }
});

test('raw glossary matches original HTML, ordering, escaping and HEAD', async () => {
  const f=fixture();
  try {
    f.sql.exec("CREATE TABLE glossary_terms(id INTEGER PRIMARY KEY,bucket TEXT,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER,created_at TEXT,updated_at TEXT); INSERT INTO glossary_terms VALUES(1,'가','나무','tree','','<script>x</script>',2,NULL,NULL),(2,'나','가족','family','','합성',1,NULL,NULL)");
    for(const [method,handler] of [['GET','onRequestGet'],['HEAD','onRequestHead']]) {
      const request=new Request('https://local-test.invalid/glossary-raw',{method});
      const old=await originalRawGlossary[handler]({env:f.env,request});
      const current=await rawGlossary[handler]({env:f.env,request});
      assert.equal(current.status,old.status); assert.equal(current.headers.get('content-type'),old.headers.get('content-type'));
      const body=await current.text(); assert.equal(body,await old.text());
      if(method==='GET') { assert(body.includes('&lt;script&gt;x&lt;/script&gt;')); assert(body.indexOf('가족')<body.indexOf('나무')); }
    }
  } finally { f.sql.close(); }
});

test('Rust raw glossary cards preserve Korean sorting, escaping and unusual-data fallback',async()=>{
  const f=fixture();
  try {
    f.sql.exec('CREATE TABLE glossary_terms(id INTEGER PRIMARY KEY,bucket TEXT,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT,sort_order INTEGER,created_at TEXT,updated_at TEXT)');
    const insert=f.sql.prepare('INSERT INTO glossary_terms(id,bucket,term_ko,term_en,term_fr,description_ko,sort_order) VALUES(?,?,?,?,?,?,?)');
    for(const row of [[1,'나','  가방','Bag','','<script> & "',2],[2,'가','까치','Magpie','','설명',2],[3,'다','나무','Tree','','',1],[4,'unknown','English','A&B','',null,0],[5,'가','','','Français','프랑스',0],[6,'가','가방','Bag','','같은 이름',2]]) insert.run(...row);
    const request=new Request('https://local-test.invalid/glossary-raw');
    const direct=await queryRust({env:f.env,request},'glossary-raw-render',{});
    const rendered=await direct.json();assert.equal(rendered.rendered,true);assert.equal(rendered.count,6);
    assert.match(rendered.cards,/&lt;script&gt; &amp; &quot;/);
    const pageInput={title:'<안전>',meta:'<meta content="@@COUNT@@">',links:'<a>@@TITLE@@</a>'};
    const page=await (await queryRust({env:f.env,request},'glossary-raw-page',pageInput)).json();
    assert.equal(page.rendered,true);
    assert.equal(page.html,rawGlossary.renderGlossaryRawShell({title:pageInput.title,metaBlock:pageInput.meta,links:pageInput.links,count:6,cards:rendered.cards,date:new Date().toISOString().slice(0,10)}));
    assert.equal(await (await rawGlossary.onRequestGet({request,env:f.env})).text(),await (await originalRawGlossary.onRequestGet({request,env:f.env})).text());
    f.sql.prepare('UPDATE glossary_terms SET sort_order=? WHERE id=1').run('legacy-invalid');
    const fallback=await (await queryRust({env:f.env,request},'glossary-raw-render',{})).json();
    assert.equal(fallback.rendered,false);
    assert.equal((await (await queryRust({env:f.env,request},'glossary-raw-page',pageInput)).json()).rendered,false);
    assert.equal(await (await rawGlossary.onRequestGet({request,env:f.env})).text(),await (await originalRawGlossary.onRequestGet({request,env:f.env})).text());
    const prepare=f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('FROM glossary_terms')) stmt.all=async()=>{throw new Error('synthetic glossary failure');};return stmt;};
    assert.equal(await (await rawGlossary.onRequestGet({request,env:f.env})).text(),await (await originalRawGlossary.onRequestGet({request,env:f.env})).text());
  } finally {f.sql.close();}
});

test('Rust markdown wrapper preserves article metadata, content and sources', async () => {
  const f=fixture();
  try {
    const posts=[
      {id:1,title:' 합성 "기사" ',subtitle:'부제',author:'Editor.Z',category:'korea',publish_at:'2026-10-01 01:02:03',updated_at:'2026-10-02',tag:'스카우트;캠프|세계',meta_tags:'첫째,둘째',location_name:'서울',image_url:'/synthetic.png',image_caption:'[설명]',content:JSON.stringify({blocks:[{type:'header',data:{level:2,text:'제목'}},{type:'paragraph',data:{text:'본문 <b>강조</b>'}},{type:'paragraph',data:{text:'자료출처: https://example.com/source'}}]})},
      {id:2,title:' 빈 기사 ',author:'',category:'',created_at:'2025-01-01',image_url:'//example.invalid/a',content:'<p>합성 &amp; 본문</p>'},
      {id:3,title:'제목',tag:'',meta_tags:'',content:'',image_url:null},
      {id:4,title:'출처',content:JSON.stringify({blocks:[{type:'paragraph',data:{text:'자료출처: https://example.invalid/a), https://example.invalid/b.\nhttps://example.invalid/a'}},{type:'header',data:{text:'Source: https://excluded.invalid'}},{type:'paragraph',data:{text:'Source： https://example.invalid/c;'}}]})},
      {id:5,title:'일반 텍스트',content:'본문\n\n출처: https://example.invalid/a] https://example.invalid/b,\n\n추가 문장'},
      {id:6,title:'잘못된 데이터',content:'{broken\nSource: https://example.invalid/a)'},
      {id:7,title:'모든 블록',content:JSON.stringify({blocks:[
        {type:'header',data:{level:'9',text:'<i>머리</i>'}},
        {type:'paragraph',data:{text:'앞 <a href="https://example.invalid/a"><b>링크</b></a> &amp; <mark>표시</mark><br>다음'}},
        {type:'list',data:{style:'ordered',items:['첫째',{content:'<strong>둘째</strong>'}]}},
        {type:'quote',data:{text:'인용<br>두 줄',caption:'<em>작성자</em>'}},
        {type:'image',data:{file:{url:'/photo.png'},caption:'[사진]'}},
        {type:'image',data:{url:'relative.jpg',caption:''}},
        {type:'embed',data:{source:'https://example.invalid/video',caption:'영상'}},
        {type:'delimiter',data:{}},{type:'code',data:{language:'rust',code:'fn main() {}'}},
        {type:'raw',data:{html:'<p>일반 &nbsp; 본문</p>'}},{type:'unknown',data:{text:'무시'}},
      ]})},
    ];
    for(const post of posts) {
      const origin='https://local-test.invalid',postUrl=origin+'/post/'+post.id;
      const old=buildPostMarkdownResponse({post,postUrl,origin});
      const current=await buildRustPostMarkdownResponse({post,postUrl,origin,env:f.env,request:new Request(postUrl+'.md')});
      assert.equal(current.status,old.status); assert.equal(current.headers.get('content-type'),old.headers.get('content-type'));
      assert.equal(await current.text(),await old.text());
    }
    for(const blocks of [[null],[{type:'list',data:{items:[null]}}]]) {
      const post={id:8,title:'손상된 합성 기사',content:JSON.stringify({blocks})};
      const origin='https://local-test.invalid',postUrl=origin+'/post/8';
      assert.throws(()=>buildPostMarkdownResponse({post,postUrl,origin}));
      await assert.rejects(buildRustPostMarkdownResponse({post,postUrl,origin,env:f.env,request:new Request(postUrl+'.md')}));
    }
  } finally {f.sql.close();}
});

test('robots.txt retains exact crawler groups and sitemap origins', async () => {
  const f=fixture();
  try {
    for(const origin of ['https://local-test.invalid','http://preview.invalid:8788']) {
      const request=new Request(origin+'/robots.txt');
      const old=await originalRobotsTxt.onRequestGet({request,env:f.env});
      const current=await robotsTxt.onRequestGet({request,env:f.env});
      assert.equal(current.status,old.status); assert.equal(current.headers.get('cache-control'),old.headers.get('cache-control'));
      const body=await current.text(); assert.equal(body,await old.text());
      assert(body.includes('Allow: /api/posts/*/image')); assert(body.includes('Disallow: /api/'));
    }
  } finally {f.sql.close();}
});

test('llms.txt retains legacy public-date filtering, output and fallback', async () => {
  const f=fixture();
  try {
    f.sql.exec("INSERT INTO posts(id,title,subtitle,category,published,publish_at,created_at) VALUES(1,'공개 기사','줄바꿈\n설명','korea',1,datetime('now','+8 hours'),datetime('now','-1 day')),(2,'미래 기사','','korea',1,datetime('now','+10 hours'),datetime('now','-1 day')),(3,'비공개 기사','','korea',0,datetime('now','-1 day'),datetime('now','-1 day')),(4,'UTC 기사','','apr',1,NULL,datetime('now','-2 hours'))");
    for(const handler of ['onRequestGet','onRequestHead']) {
      const request=new Request('https://local-test.invalid/llms.txt',{method:handler==='onRequestHead'?'HEAD':'GET'});
      const old=await originalLlmsTxt[handler]({request,env:f.env}), current=await llmsTxt[handler]({request,env:f.env});
      assert.equal(current.status,old.status); assert.equal(current.headers.get('x-robots-tag'),old.headers.get('x-robots-tag'));
      const body=await current.text(); assert.equal(body,await old.text());
      assert(body.includes('공개 기사')); assert(body.includes('UTC 기사')); assert(!body.includes('미래 기사')); assert(!body.includes('비공개 기사'));
    }
    f.sql.exec('DROP TABLE posts');
    const fallback=await llmsTxt.onRequestGet({request:new Request('https://local-test.invalid/llms.txt'),env:f.env});
    assert.equal(fallback.status,200); assert((await fallback.text()).includes('일시적으로 실패'));
  } finally {f.sql.close();}
});

test('login rate limiting and owner bootstrap retain existing behavior', async () => {
  const f=fixture();
  try {
    f.env.ADMIN_PASSWORD='synthetic-bootstrap-password';
    f.sql.exec('CREATE TABLE admin_login_attempts(ip TEXT PRIMARY KEY,attempt_count INTEGER NOT NULL,first_attempt_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL)');
    f.sql.prepare('UPDATE admin_users SET password_hash=? WHERE id=1').run(JSON.stringify(await hashAdminPassword('synthetic-member-password')));
    const send=(username,password,ip='192.0.2.1')=>adminLogin({env:f.env,request:new Request('https://local-test.invalid/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({username,password})})});
    for(let i=1;i<=3;i++) { assert.equal((await send('fixture-admin','wrong')).status,401); assert.equal(f.sql.prepare('SELECT attempt_count FROM admin_login_attempts WHERE ip=?').get('192.0.2.1').attempt_count,i); }
    const blocked=await send('fixture-admin','synthetic-member-password'); assert.equal(blocked.status,429); assert(Number(blocked.headers.get('Retry-After'))>0);
    f.sql.prepare('UPDATE admin_login_attempts SET last_attempt_at=? WHERE ip=?').run(Math.floor(Date.now()/1000)-72*60*60,'192.0.2.1');
    const success=await send('fixture-admin','synthetic-member-password'); assert.equal(success.status,200);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_login_attempts WHERE ip=?').get('192.0.2.1').n,0);
    assert(f.sql.prepare('SELECT last_login_at FROM admin_users WHERE id=1').get().last_login_at);
    const bootstrap=await send('owner','synthetic-bootstrap-password','192.0.2.2'); assert.equal(bootstrap.status,200);
    const owner=f.sql.prepare("SELECT role,password_hash FROM admin_users WHERE username='owner'").get();
    assert.equal(owner.role,'owner'); assert.equal(await verifyAdminPasswordHash('synthetic-bootstrap-password',JSON.parse(owner.password_hash)),true);
    f.sql.exec('DROP TABLE admin_login_attempts');
    const unavailable=await send('fixture-admin','synthetic-member-password','192.0.2.3');
    assert.equal(unavailable.status,503); assert.equal((await unavailable.json()).code,'server_unavailable'); assert.equal(unavailable.headers.get('set-cookie'),null);
    f.sql.exec('CREATE TABLE admin_login_attempts(ip TEXT PRIMARY KEY,attempt_count INTEGER NOT NULL,first_attempt_at INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL)');
    f.sql.exec("CREATE TRIGGER reject_attempt BEFORE INSERT ON admin_login_attempts BEGIN SELECT RAISE(ABORT,'synthetic rate write failure'); END");
    assert.equal((await send('fixture-admin','wrong','192.0.2.3')).status,503);
    f.sql.exec('DROP TRIGGER reject_attempt');
    const parallel=await Promise.all([send('fixture-admin','wrong','192.0.2.4'),send('fixture-admin','wrong','192.0.2.4'),send('fixture-admin','wrong','192.0.2.4')]);
    assert(parallel.every(response=>response.status===401));
    assert.equal(f.sql.prepare('SELECT attempt_count FROM admin_login_attempts WHERE ip=?').get('192.0.2.4').attempt_count,3);
    f.sql.prepare('INSERT INTO admin_login_attempts VALUES(?,?,?,?)').run('192.0.2.3',1,1,Math.floor(Date.now()/1000));
    f.sql.exec("CREATE TRIGGER reject_clear BEFORE DELETE ON admin_login_attempts BEGIN SELECT RAISE(ABORT,'synthetic rate clear failure'); END");
    const failedClear=await send('fixture-admin','synthetic-member-password','192.0.2.3');
    assert.equal(failedClear.status,503); assert.equal(failedClear.headers.get('set-cookie'),null);
    f.sql.exec('DROP TRIGGER reject_clear');
    assert.equal((await send('fixture-admin','synthetic-member-password','192.0.2.3')).status,200);
  } finally { f.sql.close(); }
});

test('privacy replacement/reset retain previous HTML; OTP, length and script guards remain', async () => {
  const f = fixture({ role: 'owner' }); set(f, 'privacy_policy_html', '<p>Previous</p>');
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: '<p>Updated</p>' })).status, 200);
  assert.equal((await request(f, privacy.onRequestDelete, '/api/settings/privacy-policy', {}, { method: 'DELETE' })).status, 200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM settings_history').get().n, 2);
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: '<script>x</script>' })).status, 400);
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: 'x'.repeat(100001) })).status, 400);
  f.sql.prepare('UPDATE admin_users SET totp_enabled=1 WHERE id=1').run();
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: '<p>Blocked</p>' })).status, 401);
});

test('home banner actual upload uses URL string; replacement CAS supports empty table and loser preserves rows', async () => {
  const f = fixture({ role: 'owner' }); const uploaded = [], removed = [];
  f.env.POST_IMAGES = { put: async (key) => uploaded.push(key), delete: async (key) => removed.push(key) };
  const banner = { image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z6sAAAAASUVORK5CYII=', title: 'Fixture banner', active: 1, sort_order: 0 };
  let response = await request(f, homeBanners.onRequestPut, '/api/settings/home-banners', { banners: [banner], if_revision: 0, if_snapshot: [] });
  assert.equal(response.status, 200); const saved = (await response.json()).banners;
  assert.equal(typeof saved[0].image_url, 'string'); assert.match(saved[0].image_url, /\/api\/images\/banner-/); assert.equal(uploaded.length, 1);
  f.state.beforeBatch = () => set(f, 'home_banners_rev', '2');
  response = await request(f, homeBanners.onRequestPut, '/api/settings/home-banners', { banners: [banner], if_revision: 1, if_snapshot: saved });
  assert.equal(response.status, 409); assert.deepEqual(await loadAllHomeBanners(f.env), saved); assert.equal(removed.length, 1); assert.notEqual(removed[0], uploaded[0]);
  response = await request(f, homeBanners.onRequestPut, '/api/settings/home-banners', { banners: [], if_revision: 2, if_snapshot: saved });
  assert.equal(response.status, 200); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM home_banners').get().n, 0);
});

test('hero and contributors existing revision SQL is atomic and retains former snapshots', async () => {
  const f = fixture({ role: 'owner' });
  let response = await request(f, handlers.hero.onRequestPut, '/api/settings/hero', { manual_post_ids: [], interval_ms: 3000, if_revision: 0 });
  assert.equal(response.status, 200); assert.equal(get(f, 'hero_rev'), '1');
  response = await request(f, contributors.onRequestPut, '/api/settings/contributors', { items: [{ name: 'Fixture', note: 'Help' }], if_revision: 0 });
  assert.equal(response.status, 200); const saved = get(f, 'contributors');
  f.state.beforeBatch = () => set(f, 'contributors_rev', '2');
  response = await request(f, contributors.onRequestPut, '/api/settings/contributors', { items: [], if_revision: 1 });
  assert.equal(response.status, 409); assert.equal(get(f, 'contributors'), saved);
});

test('public fallback remains; admin query cannot save after a failed settings read', async () => {
  for (const path of ['author', 'ai-disclaimer', 'board-banner', 'ticker', 'board-copy', 'site-meta']) {
    const f = fixture(); f.sql.exec('DROP TABLE settings');
    const response = await request(f, handlers[path].onRequestGet, '/api/settings/' + path + '?scope=admin', undefined, { method: 'GET' });
    assert.equal(response.status, 500, path);
    const publicResponse = await request(f, handlers[path].onRequestGet, '/api/settings/' + path, undefined, { method: 'GET' });
    assert.equal(publicResponse.status, path === 'site-meta' ? 500 : 200, path);
  }
});

test('rate limit denies the 61st setting mutation before payload writes', async () => {
  const f = fixture({ permissions: ['write:author'] });
  f.sql.prepare('INSERT INTO api_rate_limit VALUES(?,?,?)').run('admin-write:author:uid:1', 60, Math.floor(Date.now() / 1000));
  const response = await request(f, handlers.author.onRequestPut, '/api/settings/author', { author: 'Forbidden sixty first' });
  assert.equal(response.status, 429); assert.equal(get(f, 'author_name'), undefined);
});

for (const [path, key, previous, changed, payload] of [
  ['author', 'author_name', 'Old author', 'Changed author', { author: 'New author' }],
  ['ai-disclaimer', 'ai_disclaimer', 'Old disclaimer', 'Changed disclaimer', { text: 'New disclaimer' }],
  ['board-banner', 'board_banner_events', { items: { korea: { event_name: 'Old', event_date: '2026-10-15' } } }, { items: { korea: { event_name: 'Changed', event_date: '2026-10-15' } } }, { items: { korea: { event_name: 'New', event_date: '2026-10-15' } } }],
  ['ticker', 'ticker', ['Old ticker'], ['Changed ticker'], { items: ['New ticker'] }],
  ['editors', 'editors', { A: 'Old author', B: '', C: '' }, { A: 'Changed author', B: '', C: '' }, { editors: { A: 'New author', B: '', C: '' } }],
  ['translations', 'translations', { 'fixture.key': { ko: 'Old', en: 'Old' } }, { 'fixture.key': { ko: 'Changed', en: 'Changed' } }, { strings: { 'fixture.key': { ko: 'New', en: 'New' } } }],
  ['nav-labels', 'nav_labels', { 'nav.home': { ko: 'Old', en: 'Old' } }, { 'nav.home': { ko: 'Changed', en: 'Changed' } }, { labels: { 'nav.home': { ko: 'New', en: 'New' } } }],
  ['tags', 'tags', { common: ['Same'], categories: { korea: [] } }, { common: ['Same'], categories: { korea: ['Changed'] } }, { common: ['Same', 'New'], categories: { korea: ['Changed'] } }],
]) test(path + ': source handler rejects stale snapshot and racing value; fresh snapshot persists once', async () => {
  const mod = await import('../functions/api/settings/' + path + '.js'); const f = fixture({ role: 'owner' });
  const serialize = (value) => typeof value === 'string' ? value : JSON.stringify(value);
  set(f, key, serialize(previous));
  const old = await (await request(f, mod.onRequestGet, '/api/settings/' + path + '?scope=admin', undefined, { method: 'GET' })).json();
  set(f, key, serialize(changed));
  assert.equal((await request(f, mod.onRequestPut, '/api/settings/' + path, { ...payload, if_current: old })).status, 409);
  assert.equal(get(f, key), serialize(changed));
  const current = await (await request(f, mod.onRequestGet, '/api/settings/' + path + '?scope=admin', undefined, { method: 'GET' })).json();
  f.state.beforeSettingsWrite = () => set(f, key, serialize(previous));
  assert.equal((await request(f, mod.onRequestPut, '/api/settings/' + path, { ...payload, if_current: current })).status, 409);
  assert.equal(get(f, key), serialize(previous));
  set(f, key, serialize(changed));
  assert.equal((await request(f, mod.onRequestPut, '/api/settings/' + path, { ...payload, if_current: current })).status, 200);
});

test('home lead manual/clear/media/auto are atomic; cron and deleted-post cleanup cannot erase a concurrent manual selection', async () => {
  const f = fixture({ role: 'owner' });
  f.sql.exec(`INSERT INTO posts(id,title,published,created_at,category) VALUES(1,'Fixture old',1,'2025-01-01','korea'),(2,'Fixture new',1,datetime('now'),'apr');`);
  f.sql.exec("INSERT INTO post_views VALUES(2,datetime('now'));");
  set(f, 'home_lead_mode', 'auto'); set(f, 'home_lead_post', '1'); set(f, 'home_lead_media', '{"fit":"cover"}'); set(f, 'home_lead_rev', '2');
  let response = await request(f, handlers['home-lead'].onRequestPut, '/api/settings/home-lead', { post_id: 1, media: { fit: 'contain' }, if_revision: 2 });
  assert.equal(response.status, 200); assert.equal(get(f, 'home_lead_mode'), 'manual'); assert.equal(get(f, 'home_lead_rev'), '3'); assert.equal(JSON.parse(get(f, 'home_lead_media')).fit, 'contain');
  const media = get(f, 'home_lead_media');
  assert.equal((await request(f, handlers['home-lead'].onRequestPut, '/api/settings/home-lead', { post_id: null, if_revision: 2 })).status, 409);
  f.state.failAt = 3;
  assert.equal((await request(f, handlers['home-lead'].onRequestPut, '/api/settings/home-lead', { post_id: null, if_revision: 3 })).status, 500);
  assert.equal(get(f, 'home_lead_post'), '1'); assert.equal(get(f, 'home_lead_mode'), 'manual'); assert.equal(get(f, 'home_lead_media'), media); assert.equal(get(f, 'home_lead_rev'), '3');
  f.state.failAt = -1;
  f.state.beforeBatch = () => { set(f, 'home_lead_post', '2'); set(f, 'home_lead_media', '{"fit":"cover"}'); set(f, 'home_lead_rev', '4'); };
  assert.equal((await request(f, handlers['home-lead'].onRequestPut, '/api/settings/home-lead', { post_id: null, if_revision: 3 })).status, 409);
  assert.equal(get(f, 'home_lead_post'), '2'); assert.equal(get(f, 'home_lead_rev'), '4');
  assert.ok(f.state.batchResults.at(-1).every(result => result.meta.changes === 0));
  response = await request(f, handlers['home-lead'].onRequestPut, '/api/settings/home-lead', { media: { fit: 'contain' }, if_revision: 4 });
  assert.equal(response.status, 200); assert.equal(get(f, 'home_lead_mode'), 'manual'); assert.equal(get(f, 'home_lead_post'), '2');
  response = await request(f, handlers['home-lead'].onRequestPut, '/api/settings/home-lead', { mode: 'auto', if_revision: 5 });
  assert.equal(response.status, 200); assert.equal(get(f, 'home_lead_mode'), 'auto'); assert.equal(get(f, 'home_lead_post'), '2'); assert.equal(JSON.parse(get(f, 'home_lead_media')).fit, 'contain');
  f.state.beforeBatch = () => { set(f, 'home_lead_mode', 'manual'); set(f, 'home_lead_post', '1'); set(f, 'home_lead_media', '{"fit":"contain"}'); set(f, 'home_lead_rev', '7'); };
  const cron = await refreshAutoHomeLead(f.env);
  assert.equal(cron.skipped, true); assert.equal(cron.changed, false); assert.equal(cron.mode, 'manual'); assert.equal(get(f, 'home_lead_post'), '1'); assert.equal(get(f, 'home_lead_rev'), '7');
  assert.ok(f.state.batchResults.at(-1).every(result => result.meta.changes === 0));
  f.state.beforeBatch = () => { set(f, 'home_lead_post', '2'); set(f, 'home_lead_media', '{"fit":"cover"}'); set(f, 'home_lead_rev', '8'); };
  assert.equal(await clearHomeLeadForPost(f.env, 1), false); assert.equal(get(f, 'home_lead_post'), '2'); assert.equal(get(f, 'home_lead_media'), '{"fit":"cover"}');
  assert.equal(await clearHomeLeadForPost(f.env, 2), true); const cleared = await readHomeLeadState(f.env); assert.equal(cleared.mode, 'auto'); assert.equal(cleared.postId, 0); assert.equal(cleared.mediaValue, null);
});

test('Rust lead cleanup preserves legacy matches and untouched nonmatches', async () => {
  for (const [stored,requested] of [['1',1],['1',2],['1','1tail'],['0',0]]) {
    const before=fixture(),after=fixture();
    try {
      for (const f of [before,after]) {
        set(f,'home_lead_mode','manual');set(f,'home_lead_post',stored);
        set(f,'home_lead_media','{"fit":"contain"}');set(f,'home_lead_rev','3');
      }
      assert.equal(await clearHomeLeadForPost(after.env,requested),await originalClearLead(before.env,requested));
      for (const key of ['home_lead_mode','home_lead_post','home_lead_media','home_lead_rev']) assert.equal(get(after,key),get(before,key),`${stored} ${requested} ${key}`);
    } finally {before.sql.close();after.sql.close();}
  }
});

test('Rust auto lead refresh matches legacy manual, empty, unchanged and changed cases', async () => {
  for (const scenario of ['manual','empty','unchanged','changed']) {
    const before=fixture(),after=fixture();
    try {
      for (const f of [before,after]) {
        if (scenario!=='empty') f.sql.exec("INSERT INTO posts(id,title,published,created_at,category) VALUES(1,'합성',1,datetime('now'),'korea')");
        set(f,'home_lead_mode',scenario==='manual'?'manual':'auto');
        set(f,'home_lead_post',scenario==='unchanged'?'1':'2');
        set(f,'home_lead_media','{"fit":"contain"}');
        set(f,'home_lead_rev','3');
      }
      const expected=await originalRefreshLead(before.env);
      const actual=await refreshAutoHomeLead(after.env);
      assert.deepEqual(actual,expected,scenario);
      for (const key of ['home_lead_mode','home_lead_post','home_lead_media','home_lead_rev']) assert.equal(get(after,key),get(before,key),`${scenario} ${key}`);
      assert.equal(Boolean(get(after,'home_lead_auto_last_run')),Boolean(get(before,'home_lead_auto_last_run')));
    } finally {before.sql.close();after.sql.close();}
  }
});

test('privacy stale/racing/reset/failed transaction preserves exact content, timestamp and history', async () => {
  const f = fixture({ role: 'owner' }); set(f, 'privacy_policy_html', '<p>Original policy</p>'); set(f, 'privacy_policy_updated_at', '2026-10-15T00:00:00Z'); set(f, 'privacy_policy_rev', '3');
  const original = await (await request(f, privacy.onRequestGet, '/api/settings/privacy-policy?scope=admin', undefined, { method: 'GET' })).json();
  assert.equal(original.revision, 3);
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: '<p>Stale</p>', if_revision: 2, if_current: original })).status, 409);
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: '<p>Updated policy</p>', if_revision: 3, if_current: original })).status, 200);
  f.state.beforeBatch = () => { set(f, 'privacy_policy_html', '<p>Concurrent policy</p>'); set(f, 'privacy_policy_updated_at', '2026-10-15T01:00:00Z'); set(f, 'privacy_policy_rev', '5'); };
  assert.equal((await request(f, privacy.onRequestDelete, '/api/settings/privacy-policy', { if_revision: 4 }, { method: 'DELETE' })).status, 409);
  assert.equal(get(f, 'privacy_policy_html'), '<p>Concurrent policy</p>'); assert.equal(get(f, 'privacy_policy_updated_at'), '2026-10-15T01:00:00Z'); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM settings_history').get().n, 1);
  assert.ok(f.state.batchResults.at(-1).every(result => result.meta.changes === 0));
  f.state.failAt = 2;
  assert.equal((await request(f, privacy.onRequestPut, '/api/settings/privacy-policy', { html: '<p>Rolled back</p>', if_revision: 5 })).status, 500);
  assert.equal(get(f, 'privacy_policy_rev'), '5'); assert.equal(get(f, 'privacy_policy_html'), '<p>Concurrent policy</p>'); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM settings_history').get().n, 1);
  f.state.failAt = -1;
  assert.equal((await request(f, privacy.onRequestDelete, '/api/settings/privacy-policy', { if_revision: 5 }, { method: 'DELETE' })).status, 200);
  assert.equal(get(f, 'privacy_policy_html'), undefined); assert.equal(get(f, 'privacy_policy_updated_at'), undefined); assert.equal(get(f, 'privacy_policy_rev'), '6'); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM settings_history').get().n, 2);
});

test('site meta cleans only newly uploaded unreferenced images on CAS loss and rollback', async () => {
  const f = fixture({ role: 'owner' }); const uploaded = [], removed = [];
  f.env.POST_IMAGES = { put: async key => uploaded.push(key), delete: async key => removed.push(key) };
  const original = JSON.stringify({ image_url: 'https://local-test.invalid/api/images/existing-kept' });
  const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z6sAAAAASUVORK5CYII=';
  set(f, 'site_meta', original); set(f, 'site_meta_rev', '1');
  f.state.beforeBatch = () => set(f, 'site_meta_rev', '2');
  assert.equal((await request(f, handlers['site-meta'].onRequestPut, '/api/settings/site-meta', { image_url: data, if_revision: 1 })).status, 409);
  assert.equal(get(f, 'site_meta'), original); assert.deepEqual(removed, [uploaded[0]]); assert.notEqual(removed[0], 'existing-kept');
  f.state.failAt = 1;
  assert.equal((await request(f, handlers['site-meta'].onRequestPut, '/api/settings/site-meta', { image_url: data, if_revision: 2 })).status, 500);
  assert.equal(get(f, 'site_meta'), original); assert.deepEqual(removed, uploaded); assert.equal(get(f, 'site_meta_rev'), '2');
  f.state.beforeBatch = () => { f.state.failNextSiteMetaRead = true; };
  assert.equal((await request(f, handlers['site-meta'].onRequestPut, '/api/settings/site-meta', { image_url: data, if_revision: 2 })).status, 500);
  assert.equal(uploaded.length,3);
  assert.deepEqual(removed,uploaded.slice(0,2));
  assert.equal(get(f, 'site_meta'), original);
});

test('site history source failures are represented separately from legitimate empty data', async () => {
  const f = fixture({ role: 'owner' }); const mod = await import('../functions/api/admin/site-history.js');
  const response = await request(f, mod.onRequestGet, '/api/admin/site-history?limit=350', undefined, { method: 'GET' });
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.partial, true); assert.equal(data.sources.operational, true); assert.equal(data.sources.issues, true); assert.equal(data.sources.settings, false); assert.equal(data.sources.posts, false); assert.deepEqual(data.items, []); assert.equal(data.limit, 350);
});


test('auto lead ranks all public articles by 7-day views, randomizes only ties and preserves manual mode', async () => {
  const f = fixture({role:'owner'});
  f.sql.exec(`INSERT INTO posts(id,title,published,created_at) VALUES(1,'Old public',1,'2025-01-01'),(2,'New public',1,datetime('now')),(3,'Private',0,datetime('now'));
    INSERT INTO post_views VALUES(1,datetime('now','-1 day')),(1,datetime('now','-6 day')),(2,datetime('now','-8 day')),(2,datetime('now','-8 day')),(2,datetime('now')),(3,datetime('now')),(3,datetime('now')),(3,datetime('now'));`);
  let picked = await selectAutoHomeLeadId(f.env);
  assert.equal(picked.id,1); assert.equal(picked.score,2); assert.equal(picked.candidates,2);
  f.sql.exec("INSERT INTO post_views VALUES(2,datetime('now'))");
  const random = Math.random;
  try {
    Math.random = () => 0; assert.equal((await selectAutoHomeLeadId(f.env)).id,1);
    Math.random = () => 0.999; assert.equal((await selectAutoHomeLeadId(f.env)).id,2);
  } finally { Math.random = random; }
  set(f,'home_lead_mode','manual');set(f,'home_lead_post','1');
  assert.equal((await refreshAutoHomeLead(f.env)).skipped,true);assert.equal(get(f,'home_lead_post'),'1');
  f.sql.exec('DELETE FROM post_views');assert.equal((await selectAutoHomeLeadId(f.env)).score,0);
  f.sql.exec('DELETE FROM posts');assert.equal((await selectAutoHomeLeadId(f.env)).id,0);
});


test('home banners replacement and public data match legacy handler',async()=>{
  const output=[];
  for(const mod of [oldHomeBanners,homeBanners]) {
    const f=fixture({role:'owner'});
    const states=[];
    for(const [handler,method,body] of [[mod.onRequestGet,'GET',undefined],[mod.onRequestPut,'PUT',{banners:[{image_url:'https://example.invalid/banner.png',title:'합성 배너',active:true}],if_revision:0}],[mod.onRequestPut,'PUT',{banners:[],if_revision:0}],[mod.onRequestGet,'GET',undefined]]) {
      const res=await request(f,handler,'/api/settings/home-banners',body,{method});
      const data=await res.json();
      for(const banner of data.banners||[]) {delete banner.created_at;delete banner.updated_at;}
      states.push({status:res.status,body:data});
    }
    states.push(f.sql.prepare('SELECT image_url,link_url,title,sort_order,active,starts_at,ends_at FROM home_banners').all());
    output.push(states);f.sql.close();
  }
  assert.deepEqual(output[1],output[0]);
  assert.deepEqual(output[1].slice(0,4).map(x=>x.status),[200,200,409,200]);
});
