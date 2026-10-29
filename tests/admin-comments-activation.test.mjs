import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';

const handlers = new Map();
const requests = [];
const bindings = new Map();
const nodes = new Map(['memoc-filter-status', 'memoc-refresh-btn', 'memoc-table-wrap', 'memoc-counts', 'memoc-pagination', 'memo-comments-pending-badge'].map(id => [id, {
  innerHTML: '', textContent: '', hidden: true,
  addEventListener(type) { bindings.set(id + ':' + type, (bindings.get(id + ':' + type) || 0) + 1); },
}]));
const document = {
  readyState: 'loading',
  querySelector(selector) { return nodes.get(selector.slice(1)); },
  getElementById(id) { return nodes.get(id); },
  addEventListener(type, handler) { handlers.set(type, [...(handlers.get(type) || []), handler]); },
  dispatchEvent(event) { for (const handler of handlers.get(event.type) || []) handler(event); },
};
let otpAccepted = false;
let otpPrompts = 0;
document.addEventListener('gw:admin-otp-required', () => otpPrompts++);
const context = vm.createContext({
  document, console, setTimeout,
  sessionStorage: { getItem() { return null; } },
  CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
  async fetch(url, options) {
    assert.equal(options?.method || 'GET', 'GET');
    requests.push(url);
    if (url.includes('counts=1')) return Response.json({ counts: { pending: 0, approved: 0, rejected: 0, deleted: 0 } });
    return otpAccepted ? Response.json({ items: [], total: 0 }) : Response.json({ error: 'otp_required' }, { status: 401 });
  },
});
vm.runInContext(readFileSync(new URL('../public/js/admin-memorabilia-comments.js', import.meta.url), 'utf8'), context);

async function until(predicate) {
  for (let attempt = 0; attempt < 40; attempt++) { if (predicate()) return; await delay(5); }
  assert(predicate(), 'Expected comments activation result did not arrive');
}
const activate = panel => document.dispatchEvent({ type: 'gw:admin-panel-shown', detail: { panel } });
activate('card-news');
assert.equal(requests.length, 0);
activate('memorabilia-comments');
await until(() => otpPrompts === 1);
assert(nodes.get('memoc-table-wrap').innerHTML.includes('2단계 인증'));
otpAccepted = true;
activate('memorabilia-comments');
await until(() => nodes.get('memoc-table-wrap').innerHTML.includes('댓글이 없습니다'));
activate('memorabilia-comments');
await until(() => requests.length === 6);
assert.equal(requests.filter(url => !url.includes('counts=1')).length, 3);
assert.equal(bindings.get('memoc-filter-status:change'), 1);
assert.equal(bindings.get('memoc-refresh-btn:click'), 1);
console.log('Comments reload after OTP re-entry, without duplicate handlers or unrelated panel requests.');
