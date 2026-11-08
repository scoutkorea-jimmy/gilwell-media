import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the shipped controller; expose only lexical state/functions in this test VM.
const source = readFileSync(new URL('../public/js/admin-memorabilia.js', import.meta.url), 'utf8');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { id, value: '', checked: false, hidden: true, disabled: false, textContent: '', innerHTML: '', style: {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, closest: () => null });
  return elements.get(id);
};
let confirmResult = false;
let confirmations = 0;
const pending = [];
let me = { role: 'owner' };
const context = vm.createContext({
  window: { AccountAdmin: { currentMe: () => me }, GW: {} },
  document: { querySelector: selector => selector === '.v3-panel.active' ? { id: 'panel-memorabilia' } : selector.startsWith('#') ? element(selector.slice(1)) : null,
    querySelectorAll: () => [], addEventListener: () => {}, body: { style: {} } },
  fetch: (url, options) => new Promise(resolve => pending.push({ url: String(url), options, resolve })),
  confirm: () => { confirmations++; return confirmResult; }, console, URLSearchParams, setTimeout, clearTimeout,
});
vm.runInContext(source.replace(/\}\)\(\);\s*$/, `window.__memo = { state, dialogs, busy, canWrite, dialogSnapshot, trackDialog, canCloseDialog, canLeave, hasUnsaved, loadList, loadCategories, loadEventsList, loadEventCategories, openEditor, saveCategory, addEventCategory }; })();`), context);
const api = context.window.__memo;

assert.equal(api.canWrite('memorabilia'), true);
me = { role: 'member', permissions: { permissions: ['view:memorabilia'] } };
assert.equal(api.canWrite('memorabilia'), false);
me = { role: 'member', permissions: { permissions: ['write:memorabilia'] } };
assert.equal(api.canWrite('memorabilia'), true);
me = { role: 'owner' };
element('memo-edit-modal').hidden = false;
api.trackDialog('memo-edit-modal');
api.state.uploads = 1;
assert.equal(api.canCloseDialog('memo-edit-modal'), false);
assert.equal(api.hasUnsaved(), true);
api.state.uploads = 0;
api.busy.add('memo-edit-modal');
assert.equal(api.canLeave(), false);
api.busy.clear();
api.state.images.push({ url: '/synthetic.png' });
assert.equal(api.hasUnsaved(), true);
assert.equal(api.canLeave(), false);
assert.equal(element('memo-edit-modal').hidden, false, 'cancel preserves the open dialog');
assert.equal(api.state.images.length, 1, 'cancel preserves inputs');
confirmResult = true;
assert.equal(api.canLeave(), true);
assert.equal(element('memo-edit-modal').hidden, true);
assert.equal(confirmations, 2, 'one confirmation per dirty navigation attempt');

api.state.listQuery = '찾기_%';
const first = api.loadList(1);
assert.match(pending[0].url, /scope=admin/);
assert.equal(new URL(pending[0].url, 'http://synthetic.local').searchParams.get('q'), '찾기_%');
api.state.listQuery = 'latest';
const second = api.loadList(1);
pending[1].resolve(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }));
await second;
pending[0].resolve(new Response(JSON.stringify({ items: [{ id: 999 }], total: 99 }), { status: 200 }));
await first;
assert.equal(api.state.total, 0, 'late list response cannot replace current search');
assert.equal(api.state.items.length, 0);

const failed = api.loadList();
pending[2].resolve(new Response(JSON.stringify({ error: 'list_failed' }), { status: 500 }));
await failed;
assert.equal(api.state.loadedOnce, false, 'failed initial load remains retryable');
assert.match(element('memo-list-wrap').innerHTML, /다시 시도/);
assert.doesNotMatch(element('memo-list-wrap').innerHTML, /첫 항목 추가/);

const catsFailed = api.loadCategories(false);
pending[3].resolve(new Response('{}', { status: 500 }));
await catsFailed;
assert.equal(api.state.catsLoadedOnce, false);
assert.match(element('memo-cat-list-wrap').innerHTML, /다시 시도/);
const eventsFailed = api.loadEventsList();
pending[4].resolve(new Response('{}', { status: 500 }));
await eventsFailed;
assert.equal(api.state.eventsLoadedOnce, false);
assert.match(api.state.eventsError, /불러오지 못했습니다/);
// A committed category POST followed by failed hydration must not erase other row edits.
element('memo-ev-cats-modal').hidden = false;
element('memo-ev-cat-new-en').value = 'New category';
element('memo-ev-cat-new-sort').value = '0';
element('memo-ev-cats-list-wrap').innerHTML = 'existing unsaved row inputs';
api.trackDialog('memo-ev-cats-modal');
const add = api.addEventCategory();
assert.equal(JSON.parse(pending[5].options.body).sort_order, 0);
pending[5].resolve(new Response(JSON.stringify({ id: 999 }), { status: 201 }));
for (let i = 0; i < 20 && pending.length < 7; i++) await new Promise(resolve => setTimeout(resolve, 0));
assert.match(pending[6].url, /event-categories/);
pending[6].resolve(new Response('{}', { status: 503 })); await add;
assert.equal(element('memo-ev-cats-list-wrap').innerHTML, 'existing unsaved row inputs');
assert.equal(element('memo-ev-cat-new-en').value, '');
assert.equal(api.busy.has('memo-ev-cats-modal'), false);
console.log('content-memorabilia-unit: permission, dirty/busy/upload guards, global q, stale response and retry checks passed');
