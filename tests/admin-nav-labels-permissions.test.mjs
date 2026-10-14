import assert from 'node:assert/strict';
import test from 'node:test';
import { createToken } from '../functions/_shared/auth.js';
import { DEFAULT_NAV_LABELS } from '../functions/_shared/nav-labels.js';
import { onRequestPut } from '../functions/api/settings/nav-labels.js';

const TEST_ONLY_SECRET = 'test-only-nav-labels-hmac-key-never-used-in-production';
const PREVIOUS_LABELS = JSON.stringify({ 'nav.home': { ko: '기존 홈', en: 'Previous Home' } });

function fixture({ role = 'member', accessAdmin = true, permissions = [] } = {}) {
  const user = {
    id: 17, username: 'local-test-user', role, status: 'active', token_min_iat: 0,
    permissions: JSON.stringify({ access_admin: accessAdmin, permissions }),
  };
  const state = { settings: PREVIOUS_LABELS, writes: [], history: [], events: [], unexpected: [] };
  const env = {
    ADMIN_SECRET: TEST_ONLY_SECRET,
    DB: {
      prepare(query) {
        const sql = query.replace(/\s+/g, ' ').trim();
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() {
            if (sql.includes("key = 'admin_token_min_iat'")) return null;
            if (sql.includes('FROM admin_users')) {
              assert.equal(args[0], user.id);
              return { ...user };
            }
            if (sql.includes("key = 'nav_labels'")) return { value: state.settings };
            if (sql.includes('FROM api_rate_limit')) return null;
            state.unexpected.push(sql);
            assert.fail(`Unexpected fake D1 read: ${sql}`);
          },
          async run() {
            state.writes.push({ sql, args });
            if (sql.startsWith('CREATE TABLE IF NOT EXISTS ') || sql.startsWith('CREATE INDEX IF NOT EXISTS ')) {
              return { success: true };
            }
            if (sql.startsWith('INSERT INTO api_rate_limit ')) return { success: true };
            if (sql.startsWith('INSERT INTO settings (')) state.settings = args[0];
            else if (sql.startsWith('INSERT INTO settings_history ')) state.history.push(args);
            else if (sql.startsWith('INSERT INTO operational_events ')) state.events.push(args);
            else {
              state.unexpected.push(sql);
              assert.fail(`Unexpected fake D1 write: ${sql}`);
            }
            return { success: true };
          },
        };
      },
    },
  };
  return { env, state, user };
}

async function put(f, body = JSON.stringify({ labels: {} }), authenticated = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (authenticated) {
    const token = await createToken(TEST_ONLY_SECRET, {
      role: f.user.role, uid: f.user.id, username: f.user.username,
    });
    headers.Cookie = `admin_token=${token}`;
  }
  const response = await onRequestPut({
    env: f.env,
    request: new Request('https://local-test.invalid/api/settings/nav-labels', { method: 'PUT', headers, body }),
  });
  assert.deepEqual(f.state.unexpected, []);
  return response;
}

function assertNoSettingChanges(state) {
  assert.equal(state.settings, PREVIOUS_LABELS);
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.events, []);
}

test('anonymous PUT returns 401 without D1 writes', async () => {
  const f = fixture();
  const response = await put(f, undefined, false);
  assert.equal(response.status, 401);
  assert.deepEqual(f.state.writes, []);
  assertNoSettingChanges(f.state);
});

test('translations view permission cannot write menu labels', async () => {
  const f = fixture({ permissions: ['view:translations'] });
  const response = await put(f);
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /쓰기 권한/);
  assert.deepEqual(f.state.writes, []);
  assertNoSettingChanges(f.state);
});

test('menu write permission cannot bypass disabled admin access', async () => {
  const f = fixture({ accessAdmin: false, permissions: ['view:translations', 'write:translations'] });
  const response = await put(f);
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /관리자 접근 권한/);
  assert.deepEqual(f.state.writes, []);
  assertNoSettingChanges(f.state);
});

test('translations writer persists normalized labels and previous-value audit', async () => {
  const f = fixture({ permissions: ['write:translations'] });
  const response = await put(f, JSON.stringify({ labels: {
    'nav.home': { ko: '  운영 홈  ', en: 'X'.repeat(90) },
    'nav.latest': { ko: '   ', en: null },
    unknown: { ko: '저장하면 안 되는 항목', en: 'Unknown' },
  } }));
  assert.equal(response.status, 200);
  const { labels } = await response.json();
  assert.deepEqual(labels['nav.home'], { ko: '운영 홈', en: 'X'.repeat(80) });
  assert.deepEqual(labels['nav.latest'], DEFAULT_NAV_LABELS['nav.latest']);
  assert.deepEqual(labels['nav.apr'], DEFAULT_NAV_LABELS['nav.apr']);
  assert.deepEqual(Object.keys(labels).sort(), Object.keys(DEFAULT_NAV_LABELS).sort());
  assert.deepEqual(JSON.parse(f.state.settings), labels);
  assert.deepEqual(f.state.history, [['nav_labels', PREVIOUS_LABELS]]);
  assert.equal(f.state.events.length, 1);
  const [channel, type, level, , , path, message, details] = f.state.events[0];
  assert.deepEqual([channel, type, level, path, message], [
    'admin', 'settings_change', 'info', '/api/settings/nav-labels', '메뉴명 설정 변경',
  ]);
  assert.deepEqual(JSON.parse(details), { labels, key: 'nav_labels' });
  assert.ok(f.state.writes.some(({ sql, args }) => sql.startsWith('INSERT INTO api_rate_limit ') && args[0] === 'admin-write:translations:uid:17'));
});

test('owner PUT succeeds without member menu permissions', async () => {
  const f = fixture({ role: 'owner', accessAdmin: false });
  const response = await put(f);
  assert.equal(response.status, 200);
  const { labels } = await response.json();
  assert.deepEqual(labels, DEFAULT_NAV_LABELS);
  assert.deepEqual(JSON.parse(f.state.settings), DEFAULT_NAV_LABELS);
  assert.deepEqual(f.state.history, [['nav_labels', PREVIOUS_LABELS]]);
  assert.equal(f.state.events.length, 1);
});

test('authorized malformed JSON returns 400 without settings or audit changes', async () => {
  const f = fixture({ permissions: ['write:translations'] });
  const response = await put(f, '{invalid JSON');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Invalid JSON body');
  assertNoSettingChanges(f.state);
  assert.ok(f.state.writes.every(({ sql }) => !/INSERT INTO (settings|settings_history|operational_events)\b/.test(sql)));
});
