import './register-rust-wasm.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken } from '../functions/_shared/auth.js';
import { onRequestPut as putLayout } from '../functions/api/settings/board-layout.js';
import { onRequestPut as putRubric } from '../functions/api/settings/score-rubric.js';

const SECRET = 'isolated-settings-permission-test-only';
const cases = [
  { handler: putLayout, path: '/api/settings/board-layout', menu: 'board-copy', key: 'board_card_gap', body: { gap_px: 35 }, stored: '35' },
  { handler: putRubric, path: '/api/settings/score-rubric', menu: 'article-scorer', key: 'score_rubric', body: { content: '합성 평가 기준입니다.' }, stored: '합성 평가 기준입니다.' },
];

function fixture(permissions) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)');
  db.exec('CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL)');
  const user = { id: 77, role: 'member', status: 'active', username: 'synthetic_settings', token_min_iat: 0, permissions: JSON.stringify({ access_admin: true, permissions }) };
  const writes = [];
  const env = { ADMIN_SECRET: SECRET, DB: Object.assign(new (class D1Database {})(), { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { if (/^INSERT INTO api_rate_limit/.test(sql.trim())) writes.push(sql); if (sql.includes('FROM admin_users')) return user; return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { writes.push(sql); const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
  } }) };
  return { db, writes, env };
}

async function request(path, body, authenticated = true) {
  const token = authenticated ? await createToken(SECRET, { role: 'member', uid: 77, username: 'synthetic_settings' }) : null;
  return new Request('https://synthetic.invalid' + path, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: 'admin_token=' + token } : {}) }, body: JSON.stringify(body),
  });
}

for (const item of cases) {
  test(`${item.path}: anonymous and view-only users cannot write settings`, async () => {
    const f = fixture(['view:' + item.menu]);
    try {
      for (const [authenticated, expected] of [[false, 401], [true, 403]]) {
        const response = await item.handler({ env: f.env, request: await request(item.path, item.body, authenticated) });
        assert.equal(response.status, expected);
        assert.equal(f.writes.length, 0);
        assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 0);
      }
    } finally { f.db.close(); }
  });

  test(`${item.path}: matching write permission saves the intended setting`, async () => {
    const f = fixture(['write:' + item.menu]);
    try {
      const response = await item.handler({ env: f.env, request: await request(item.path, item.body) });
      assert.equal(response.status, 200);
      assert.equal(f.db.prepare('SELECT value FROM settings WHERE key=?').get(item.key)?.value, item.stored);
      assert(f.writes.some(sql => sql.includes('INSERT INTO settings (key, value)')));
      assert(f.writes.some(sql => sql.includes('api_rate_limit')));
    } finally { f.db.close(); }
  });
}
