import './register-rust-wasm.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createToken } from '../functions/_shared/auth.js';
import * as current from '../functions/api/glossary/index.js';
import * as legacy from './fixtures/rust-glossary/index.js';
import * as currentId from '../functions/api/glossary/[id].js';
import * as legacyId from './fixtures/rust-glossary/[id].js';
import { onRequestGet as bot } from '../functions/api/glossary/bot.js';
import { onRequestGet as legacyBot } from './fixtures/rust-glossary/bot.js';

const SECRET = 'synthetic-rust-glossary-tests-only';
const schema = `CREATE TABLE glossary_terms(id INTEGER PRIMARY KEY, bucket TEXT CHECK(bucket IN ('가','나','다','라','마','바','사','아','자','차','카','타','파','하')), term_ko TEXT, term_en TEXT, term_fr TEXT, description_ko TEXT, sort_order INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start_at INTEGER NOT NULL)`;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const user = { id: 77, role: 'member', status: 'active', username: 'synthetic', permissions: JSON.stringify({ access_admin: true, permissions: ['view:glossary'] }) };
  const state = { fail: false, glossaryWrites: 0 };
  const DB = Object.assign(new (class D1Database {})(), {
    prepare(sql) {
      let args = [];
      const check = () => { if (state.fail) throw new Error('synthetic database failure'); };
      return {
        bind(...values) { args = values; return this; },
        async all() { check(); return { results: sqlite.prepare(sql).all(...args) }; },
        async first() {
          check();
          if (sql.includes('FROM admin_users')) return user;
          if (/^(INSERT|UPDATE|DELETE).*glossary_terms/s.test(sql)) state.glossaryWrites++;
          return sqlite.prepare(sql).get(...args) || null;
        },
        async run() {
          check();
          if (sql.includes('glossary_terms')) state.glossaryWrites++;
          const r = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
      };
    },
  });
  return { sqlite, state, user, env: { DB, ADMIN_SECRET: SECRET } };
}

function seed(f) {
  const insert = f.sqlite.prepare('INSERT INTO glossary_terms(id,bucket,term_ko,term_en,term_fr,description_ko,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const terms = [
    ['하이킹','Hiking','','설명: 야외 활동',0], ['까치','Bird','','국문 된소리',0],
    ['가족','Family','','한국어 설명',0], ['','Scout','Éclaireur','국문 미확정',0],
    ['123 활동','Number','','숫자',0], ['스카우트','Scout','','한국어 설명',3],
    ['가족','Family 2','','같은 용어',0], ['—','Unknown','','영어만',0],
    ['ΟΣ','Greek','','Σ',0], ['가방','2 day','','영문 숫자 시작',0],
    ['  나무 ','Tree','','들여쓰기',null], ['', '', '', null, null],
  ];
  terms.forEach((values, i) => insert.run(i + 1, '가', ...values, '2026-10-29 00:00:00', '2999-01-01 00:00:00.000'));
}

async function ctx(f, path, method = 'GET', body, role = 'anonymous', id) {
  const token = role === 'anonymous' ? null : await createToken(SECRET, role === 'owner' ? { role: 'full' } : { role: 'member', uid: 77 });
  return {
    env: f.env, params: { id },
    request: new Request('https://synthetic.invalid' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: 'admin_token=' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  };
}

async function comparable(response) {
  const type = response.headers.get('content-type');
  const body = type.includes('json') ? await response.json() : await response.text();
  if (body.generated_at) {
    assert.match(body.generated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    delete body.generated_at;
  }
  return { status: response.status, type, cache: response.headers.get('cache-control'), body };
}

test('Rust public listing, sorting, search, grouping and bot exports match existing handlers', async () => {
  const f = fixture(); seed(f);
  try {
    for (const suffix of ['', '?scope=admin', '?bucket=가', '?bucket=all&view=grouped', '?q=scout&view=buckets', '?q=한국어', '?q=ος', '?q=%EF%BB%BFscout%EF%BB%BF', '?bucket=국문%20미확정%20용어', '?q=%25%27%20OR%201=1']) {
      const oldResult = await comparable(await legacy.onRequestGet(await ctx(f, '/api/glossary' + suffix)));
      const result = await comparable(await current.onRequestGet(await ctx(f, '/api/glossary' + suffix)));
      assert.deepEqual(result, oldResult, suffix || 'flat');
    }
    for (const format of ['json','text','txt',' JSON ']) {
      const path = '/api/glossary/bot?format=' + encodeURIComponent(format);
      assert.deepEqual(await comparable(await bot(await ctx(f, path))), await comparable(await legacyBot(await ctx(f, path))), format);
    }
    assert.equal(f.state.glossaryWrites, 0);
  } finally { f.sqlite.close(); }
});

test('Rust inserts preserve classification, validation, storage CHECK and coercion', async () => {
  for (const body of [
    { term_ko: '가족', description_ko: '설명', sort_order: '12' },
    { term_en: 'Scout', term_fr: 'Éclaireur' },
    { term_ko: '123' }, { term_ko: '가방', term_en: '2 day' },
    { term_ko: '-', term_fr: 'Scout', sort_order: '' },
    { term_ko: '가'.repeat(130), description_ko: '😀'.repeat(450), sort_order: 10001 },
    { term_ko: '😀'.repeat(61), bucket: '기타', description_ko: 'a'+'😀'.repeat(450) },
    { term_ko: 'Latin', bucket: '나', sort_order: '2.5' }, {}, { bucket: '기타' },
  ]) {
    const results = [];
    for (const handler of [legacy.onRequestPost, current.onRequestPost]) {
      const f = fixture();
      try {
        const result = await comparable(await handler(await ctx(f, '/api/glossary', 'POST', body, 'owner')));
        if (result.body.item) { delete result.body.item.created_at; delete result.body.item.updated_at; }
        results.push({ result, stored: f.sqlite.prepare('SELECT bucket,term_ko,term_en,term_fr,description_ko,sort_order FROM glossary_terms').all() });
      } finally { f.sqlite.close(); }
    }
    assert.deepEqual(results[1], results[0], JSON.stringify(body).slice(0,100));
  }
});

test('Rust updates preserve conflict detection, timestamps, IDs, missing rows and deletion', async () => {
  for (const [id, body, method] of [
    ['1', {term_ko:'나무',expected_updated_at:'old'}, 'PUT'],
    ['1', {term_ko:'나무',expected_updated_at:'2999-01-01 00:00:00.000'}, 'PUT'],
    ['999', {term_ko:'나무'}, 'PUT'], ['0',{term_ko:'나무'},'PUT'],
    ['1abc', {term_en:'Scout'}, 'PUT'], ['1',undefined,'DELETE'], ['999',undefined,'DELETE'],
    ['999999999999999999999', {term_en:'Scout'}, 'PUT'], ['999999999999999999999', undefined, 'DELETE'],
  ]) {
    const results = [];
    for (const handlers of [legacyId, currentId]) {
      const f = fixture(); seed(f);
      try {
        const handler = method === 'PUT' ? handlers.onRequestPut : handlers.onRequestDelete;
        results.push({ result: await comparable(await handler(await ctx(f, '/api/glossary/' + id, method, body, 'owner', id))), rows: f.sqlite.prepare('SELECT * FROM glossary_terms ORDER BY id').all() });
      } finally { f.sqlite.close(); }
    }
    assert.deepEqual(results[1],results[0], id + ' ' + method);
  }
});

test('anonymous, view-only, expired and corrupted sessions cannot mutate through Rust adapters', async (t) => {
  const f = fixture(); seed(f);
  try {
    for (const [role,status] of [['anonymous',401], ['member',403]]) {
      for (const [method,handler,path,id] of [
        ['POST',current.onRequestPost,'/api/glossary'],
        ['PUT',currentId.onRequestPut,'/api/glossary/1','1'],
        ['DELETE',currentId.onRequestDelete,'/api/glossary/1','1'],
      ]) {
        assert.equal((await handler(await ctx(f,path,method,{term_ko:'나무'},role,id))).status,status);
      }
    }
    const context = await ctx(f,'/api/glossary','POST',{term_ko:'나무'},'owner');
    const oldClock = t.mock.method(Date,'now',()=>946684800000);
    const expired = await createToken(SECRET,{role:'full'});
    oldClock.mock.restore();
    for (const token of [expired,expired+'invalid']) {
      context.request.headers.set('Cookie','admin_token='+token);
      assert.equal((await current.onRequestPost(context)).status,401);
    }
    assert.equal(f.state.glossaryWrites,0);
  } finally { f.sqlite.close(); }
});

test('database failures preserve public response shapes without details', async () => {
  const f = fixture(); f.state.fail = true;
  try {
    for (const [a,b,path] of [[current.onRequestGet,legacy.onRequestGet,'/api/glossary'],[bot,legacyBot,'/api/glossary/bot']]) {
      assert.deepEqual(await comparable(await a(await ctx(f,path))),await comparable(await b(await ctx(f,path))));
    }
  } finally { f.sqlite.close(); }
});
