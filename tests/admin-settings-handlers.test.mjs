import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken } from '../functions/_shared/auth.js';
import { onRequestPut as presetPut } from '../functions/api/admin/presets/[id].js';
import { onRequestPut as userPut } from '../functions/api/admin/users/[id].js';
import * as privacy from '../functions/api/settings/privacy-policy.js';
import * as homeBanners from '../functions/api/settings/home-banners.js';
import * as contributors from '../functions/api/settings/contributors.js';
import { loadAllHomeBanners } from '../functions/_shared/home-banners.js';
import { refreshAutoHomeLead, clearHomeLeadForPost, readHomeLeadState } from '../functions/_shared/home-lead-auto.js';

const SECRET = 'local-only-settings-test-key-never-production';
const gates = [['hero', 'hero'], ['home-lead', 'home-lead'], ['site-meta', 'meta'], ['board-copy', 'board-copy'], ['author', 'author'], ['ai-disclaimer', 'author'], ['board-banner', 'banner'], ['ticker', 'ticker'], ['translations', 'translations']];
const handlers = Object.fromEntries(await Promise.all(gates.map(async ([path]) => [path, await import('../functions/api/settings/' + path + '.js')])));

function fixture({ role = 'member', permissions = [], access = true, otp = 0 } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL);
    CREATE TABLE admin_users(id INTEGER PRIMARY KEY,username TEXT,display_name TEXT,role TEXT,status TEXT,permissions TEXT,token_min_iat INTEGER DEFAULT 0,totp_enabled INTEGER DEFAULT 0,editor_code TEXT,ai_daily_limit INTEGER,must_change_password INTEGER DEFAULT 0,member_self_rename_used INTEGER DEFAULT 0,created_at TEXT,updated_at TEXT,last_login_at TEXT,deleted_at TEXT);
    CREATE TABLE admin_user_presets(id INTEGER PRIMARY KEY,slug TEXT,name TEXT,description TEXT,is_builtin INTEGER,permissions TEXT,updated_at TEXT);
    CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,image_url TEXT,published INTEGER,publish_at TEXT,created_at TEXT,category TEXT,views INTEGER,subtitle TEXT,content TEXT,image_caption TEXT,tag TEXT,author TEXT,youtube_url TEXT);
    CREATE TABLE post_views(post_id INTEGER,viewed_at TEXT);`);
  sql.exec(`CREATE TABLE home_banners(id INTEGER PRIMARY KEY AUTOINCREMENT,image_url TEXT,link_url TEXT,title TEXT,sort_order INTEGER,active INTEGER,starts_at TEXT,ends_at TEXT,created_at TEXT DEFAULT (datetime('now')),updated_at TEXT);`);
  sql.prepare('INSERT INTO admin_users(id,username,display_name,role,status,permissions,totp_enabled,updated_at) VALUES(1,?,?,?,?,?,?,?)').run('fixture-admin', 'Fixture', role, 'active', JSON.stringify({ access_admin: access, permissions }), otp, '2026-10-15 00:00:00');
  const state = { writes: [], batches: [], batchResults: [], beforeBatch: null, beforeSettingsWrite: null, failAt: -1 };
  const db = {
    prepare(query) {
      let args = [];
      return { query, get args() { return args; }, bind(...values) { args = values; return this; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async run() { if (/^SELECT\b/.test(query.trim())) return { success: true, results: sql.prepare(query).all(...args), meta: { changes: 0 } }; state.writes.push(query); if (/^INSERT INTO settings\s*\(/.test(query.trim()) && state.beforeSettingsWrite) { const hook = state.beforeSettingsWrite; state.beforeSettingsWrite = null; hook(); } const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
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
  };
  return { sql, state, env: { DB: db, ADMIN_SECRET: SECRET }, role };
}
function set(f, key, value) { f.sql.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
function get(f, key) { return f.sql.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
async function request(f, handler, path, body, { method = 'PUT', anonymous = false, id = '2' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!anonymous) headers.Cookie = 'admin_token=' + await createToken(SECRET, { role: f.role, uid: 1, username: 'fixture-admin' });
  return handler({ env: f.env, params: { id }, request: new Request('https://local-test.invalid' + path, { method, headers, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }) });
}

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

test('user permission compare rejects stale modal, permits matching snapshot', async () => {
  const f = fixture({ role: 'owner' }); const old = { access_admin: true, permissions: ['view:hero'] };
  f.sql.prepare('INSERT INTO admin_users(id,username,role,status,permissions) VALUES(2,?,?,?,?)').run('member-two', 'member', 'active', JSON.stringify(old));
  let response = await request(f, userPut, '/api/admin/users/2', { permissions: { access_admin: true, permissions: [] }, if_permissions: { access_admin: true, permissions: ['view:ticker'] } });
  assert.equal(response.status, 409);
  response = await request(f, userPut, '/api/admin/users/2', { permissions: { access_admin: false, permissions: [] }, if_permissions: old });
  assert.equal(response.status, 200); assert.equal(JSON.parse(f.sql.prepare('SELECT permissions FROM admin_users WHERE id=2').get().permissions).access_admin, false);
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
  assert.equal(await clearHomeLeadForPost(f.env, 2), true); const cleared = await readHomeLeadState(f.env); assert.equal(cleared.mode, 'manual'); assert.equal(cleared.postId, 0); assert.equal(cleared.mediaValue, null);
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
});

test('site history source failures are represented separately from legitimate empty data', async () => {
  const f = fixture({ role: 'owner' }); const mod = await import('../functions/api/admin/site-history.js');
  const response = await request(f, mod.onRequestGet, '/api/admin/site-history?limit=350', undefined, { method: 'GET' });
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.partial, true); assert.equal(data.sources.operational, true); assert.equal(data.sources.issues, true); assert.equal(data.sources.settings, false); assert.equal(data.sources.posts, false); assert.deepEqual(data.items, []); assert.equal(data.limit, 350);
});
