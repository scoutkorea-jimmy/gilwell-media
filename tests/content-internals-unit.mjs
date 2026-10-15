import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise shipped functions with deferred synthetic responses, never production APIs.
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(file, expose) {
  const nodes = new Map(), pending = [], events = new Map(), toasts = [];
  let allowed = false, confirmations = 0, me = { role: 'owner' };
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true, disabled: false, style: {}, dataset: {}, attrs: {}, fields: [],
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
        setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key] ?? null; }, removeAttribute(key) { delete this.attrs[key]; },
        querySelectorAll(selector) { return selector === 'input,textarea,select' ? this.fields : []; }, querySelector: () => null, addEventListener: () => {}, focus: () => {}, contains: () => false });
    }
    return nodes.get(id);
  };
  const context = vm.createContext({
    window: { location: { origin: 'https://synthetic.invalid', search: '' }, AccountAdmin: { currentMe: () => me }, addEventListener: (name, fn) => events.set(name, fn), setTimeout: () => 0, clearTimeout: () => {} },
    document: { readyState: 'loading', getElementById: node, querySelector: selector => selector.startsWith('#') ? node(selector.slice(1)) : null, querySelectorAll: () => [], addEventListener: () => {}, body: { style: {} } },
    GW: { escapeHtml: value => String(value ?? ''), showToast: (message, kind) => toasts.push([message, kind]), apiFetch: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) },
    fetch: (...args) => new Promise(resolve => pending.push({ args, resolve })),
    console, URLSearchParams, URL, Date, Intl, Promise, Response, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null },
    confirm: () => { confirmations++; return allowed; }, alert: () => {}, prompt: () => null,
  });
  context.window.GW = context.GW;
  context.window.confirm = context.confirm;
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, expose + '\n})();'), context);
  return { context, node, nodes, pending, events, toasts, api: context.window.__content, setMe: value => { me = value; }, approve: value => { allowed = value; }, get confirmations() { return confirmations; } };
}

const f = fixture('public/js/admin-v3.js', `
_apiFetch = GW.apiFetch;
window.__content = { loadDashboard:_loadDashboard, loadList:_loadList, loadCalendar:_loadCalendar, loadGlossary:_loadGlossary, loadHistory:_loadAiScoreHistory, saveCal:_saveCal, saveGlos:_saveGlos,
  openDialog:_contentOpenDialog, closeDialog:_contentCloseDialog, canWrite:_contentCanWrite, loadWosm:_loadWosmMembersUI, saveWosm:_saveWosmMembers, loadReferences:_loadReferenceSitesUI,
  submitReference:_submitReferenceSiteModal, loadRubric:_loadRubric, get dialogs(){return _contentDialogs;}, get wosm(){return _wosmMembers;}, get count(){return _wosmRegisteredCount;},
  setList(q,page=1){_listSearch=q;_listPage=page;}, setPanel(panel,section){_panel=panel;_settingsSection=section;}, setReference(draft,index){_referenceSiteModalDraft=draft;_referenceSiteModalIndex=index;},
  setRubric(text){_rubricSavedText=text;_rubricLastLoaded=text;}, get revision(){return _wosmMembersRevision;}, setWosm(items){_wosmMembers=items;},
  applyImport:_applyWosmImportMapping, get writeRevision(){return _writeChangeRevision;}, canLeave:V3.contentCanLeave, hasUnsaved:V3.contentHasUnsaved,
  setEditor(editor){_editor=editor;},clearEditor:_editorClear,setEditorData:_editorSetData,getEditorData:_editorGetData,get renderPending(){return _editorRenderPending;},get renderFailed(){return _editorRenderFailed;} };
`);
const api = f.api;
// Counts failures cannot leave an authoritative-looking stale badge or old pagination.
const comments = fixture('public/js/admin-memorabilia-comments.js', 'window.__content = { load, loadCounts, state, renderPagination };');
comments.api.state.total = 900; comments.api.renderPagination();
assert.match(comments.node('memoc-pagination').innerHTML, /data-page/);
comments.api.load(); assert.equal(comments.node('memoc-pagination').innerHTML, '');
comments.pending.shift().resolve(new Response('{}', { status: 503 })); await flush();
assert.match(comments.node('memoc-table-wrap').innerHTML, /실패/);
comments.node('memo-comments-pending-badge').hidden = false;
comments.api.loadCounts(); comments.api.loadCounts();
const staleCounts = comments.pending.shift(), failedCounts = comments.pending.shift();
failedCounts.resolve(new Response('{}', { status: 503 })); await flush();
staleCounts.resolve(new Response(JSON.stringify({ counts: { pending: 99, approved: 0, rejected: 0, deleted: 0 } }))); await flush();
assert.match(comments.node('memoc-counts').textContent, /불러오지 못했습니다/);
assert.equal(comments.node('memo-comments-pending-badge').hidden, true);
comments.api.loadCounts(); comments.pending.shift().resolve(new Response(JSON.stringify({ counts: { pending: 0, approved: 2, rejected: 0, deleted: 0 } }))); await flush();
assert.equal(comments.node('memoc-counts').textContent, '대기 0 · 승인 2 · 거부 0 · 삭제 0');
// Dashboard failure cannot claim healthy operations, and partial counts stay unknown.
api.loadDashboard();
f.pending.splice(0).forEach((request, index) => index === 1 || index === 2 || index === 4 ? request.reject(new Error('synthetic failure')) : request.resolve({}));
await flush();
assert.match(f.node('dash-ops-alerts').innerHTML, /불러오지 못했습니다/);
assert.equal(f.node('dash-stat-posts').textContent, '—');
assert.equal(f.node('dash-stat-pub').textContent, '—');
// List response inversion and last-page recovery use the actual loader.
api.setList('old'); api.loadList();
api.setList('new'); api.loadList();
const old = f.pending.shift(), current = f.pending.shift();
current.resolve({ total: 0, posts: [] }); await flush(); old.resolve({ total: 40, posts: [{ id: 1, title: 'obsolete' }] }); await flush();
assert.equal(f.node('list-count').textContent, '총 0건'); assert.doesNotMatch(f.node('list-tbody').innerHTML, /obsolete/);
api.setList('', 99); api.loadList(); f.pending.shift().resolve({ total: 0, posts: [] }); await flush();
assert.match(f.pending[0].args[0], /page=1(?:&|$)/); f.pending.shift().resolve({ total: 0, posts: [] }); await flush();
// Calendar preserves selected year and requests uncached admin data.
f.node('cal-filter-year').value = '2026'; api.loadCalendar();
assert.match(f.pending[0].args[0], /scope=admin/);
f.pending.shift().resolve({ items: [{ id: 1, title: '일정', start_at: '2026-10-15', updated_at: 'old' }] }); f.pending.shift().resolve({ items: [] }); await flush();
assert.equal(f.node('cal-filter-year').value, '2026');
// Glossary failure is distinct from empty, and the administrator uses no-store.
api.loadGlossary(); assert.match(f.pending[0].args[0], /scope=admin/); assert.equal(f.pending[0].args[1].cache, 'no-store');
f.pending.shift().reject(new Error('synthetic failure')); await flush(); assert.match(f.node('glos-list').innerHTML, /불러오기 실패/);
// Real calendar/glossary saves retain post-request typing, block closing during writes and preserve 409.
for (const [modal, ids, save] of [ ['cal-modal', ['cal-id','cal-title','cal-start'], api.saveCal], ['glos-modal', ['glos-id','glos-ko','glos-en','glos-fr','glos-desc'], api.saveGlos] ]) {
  f.node(modal).fields = ids.map(f.node); f.node(modal).style.display = 'flex';
  f.node(ids[0]).value = '1'; f.node(ids[1]).value = 'before'; if (modal === 'cal-modal') f.node('cal-start').value = '2026-10-15';
  api.openDialog(modal, modal === 'cal-modal' ? 'calendar' : 'glossary'); api.dialogs[modal].updatedAt = 'old';
  save(); const request = f.pending.shift(); assert.equal(JSON.parse(request.args[1].body).expected_updated_at, 'old');
  assert.equal(api.closeDialog(modal), false, 'save pending blocks modal close');
  f.node(ids[1]).value = 'typed during request'; request.resolve({ item: { id: 1, title: 'before', updated_at: 'new' } }); await flush();
  assert.equal(f.node(ids[1]).value, 'typed during request'); assert.equal(f.node(modal).style.display, 'flex'); assert.equal(api.dialogs[modal].updatedAt, 'new', JSON.stringify(f.toasts));
  // Drain the background list refresh before the next isolated save.
  f.pending.splice(0).forEach(r => r.resolve({ items: [] })); await flush();
  save(); f.pending.shift().reject(Object.assign(new Error('다른 변경'), { status: 409 })); await flush();
  assert.equal(f.node(ids[1]).value, 'typed during request'); assert.equal(f.node(modal).style.display, 'flex');
  assert.equal(api.closeDialog(modal), false, 'cancel preserves dirty inputs');
  f.approve(true); api.closeDialog(modal); f.approve(false);
}
// History older result cannot replace latest filters; errors clear pagination metadata.
api.loadHistory(); api.loadHistory(); const hOld = f.pending.shift(), hNew = f.pending.shift();
hNew.resolve({ stats: {}, items: [], pagination: { total: 0 } }); await flush(); hOld.resolve({ stats: {}, items: [{ input_title: 'obsolete history' }], pagination: { total: 99 } }); await flush();
assert.doesNotMatch(f.node('ai-score-history-list').innerHTML, /obsolete history/);
api.loadHistory(); f.pending.shift().reject(new Error('synthetic failure')); await flush(); assert.match(f.node('ai-score-history-pagination-meta').textContent, /조회 실패/);
// Zero registered countries is valid, and reference loading does not overwrite WOSM edits.
api.loadWosm(); f.pending.shift().resolve({ items: [{ country_en: 'Original' }], registered_count: 0, revision: 1 }); await flush(); assert.equal(api.count, 0);
api.setWosm([{ country_en: 'Unsaved' }]); api.loadReferences(); f.pending.shift().resolve({ items: [], revision: 1 }); f.pending.shift().resolve({ items: [{ country_en: 'Other' }], columns: [] }); await flush();
assert.equal(api.wosm[0].country_en, 'Unsaved');
api.setPanel('settings', 'wosm-members'); assert.equal(api.canLeave('list'), false); assert.equal(api.wosm[0].country_en, 'Unsaved');
// Rubric reload cancellation does not issue a request or erase draft text.
api.setRubric('saved'); f.node('rubric-textarea').value = 'unsaved'; const before = f.pending.length; api.loadRubric(); assert.equal(f.pending.length, before); assert.equal(f.node('rubric-textarea').value, 'unsaved');
f.setMe({ role: 'member', permissions: { permissions: ['view:calendar'] } }); assert.equal(api.canWrite('calendar'), false);

// Programmatic EditorJS render jobs serialize, never read partial blocks and recover after failure.
let active = 0, saves = 0, editorDocument = {blocks:[]}; const renders = [];
api.setEditor({isReady:Promise.resolve(),render(data){assert.equal(active,0,'render jobs cannot overlap');active++;return new Promise((resolve,reject)=>renders.push({data,resolve(){active--;editorDocument=data;resolve();},reject(){active--;reject(new Error('synthetic render failure'));}}));},async save(){assert.equal(active,0);saves++;return editorDocument;}});
const initialClear=api.clearEditor();await flush();assert.equal(active,1);
const replacement=api.setEditorData({blocks:[{type:'paragraph',data:{text:'replacement'}}]});const reading=api.getEditorData().then(value=>({value}),error=>({error}));
assert.equal(api.renderPending,2);assert.equal(f.node('v3-editorjs').inert,true);f.node('w-title').value='title typed during rendering';
renders.shift().resolve();await initialClear;await flush();assert.equal(saves,0,'read waits for latest queued render');assert.equal(active,1);
renders.shift().reject();await replacement;await flush();assert.equal(api.renderPending,0);assert.equal(api.renderFailed,true);assert.ok((await reading).error);assert.equal(f.node('w-title').value,'title typed during rendering');
const recovery=api.clearEditor();await flush();renders.shift().resolve();await recovery;assert.equal(api.renderFailed,false);assert.equal(f.node('v3-editorjs').inert,false);assert.equal(JSON.parse(await api.getEditorData()).blocks.length,0);assert.equal(saves,1);

const card = fixture('public/js/admin-cardnews.js', `window.__content = {state,loadList,openEditor,closeEditor,submitNew,wireEvents,canLeave};`);
card.api.wireEvents();
card.api.loadList(); card.pending.shift().resolve(new Response('{}', { status: 500 })); await flush(); assert.equal(card.api.state.loadedOnce, false); assert.match(card.node('cardnews-list-wrap').innerHTML, /다시 시도/);
card.api.openEditor(3, 'Synthetic'); const frame = card.node('cardnews-editor-frame'); frame.contentWindow = {};
const receive = card.events.get('message');
receive({ origin: 'https://attacker.invalid', source: frame.contentWindow, data: { type: '__edit_mode_set_keys' } }); assert.equal(card.api.state.dirty, false);
receive({ origin: 'https://synthetic.invalid', source: {}, data: { type: '__edit_mode_set_keys' } }); assert.equal(card.api.state.dirty, false);
const message = data => receive({ origin: 'https://synthetic.invalid', source: frame.contentWindow, data });
message({ type: '__edit_mode_set_keys' }); message({ type: '__card_news_saving', id: 3 });
assert.equal(card.api.closeEditor(), false); message({ type: '__edit_mode_set_keys' }); message({ type: '__card_news_saved', id: 3 }); assert.equal(card.api.state.dirty, true, 'older save cannot clear later iframe edits');
assert.equal(card.api.closeEditor(), false); assert.equal(card.api.state.editingId, 3);
console.log('content-internals-unit: dashboard/list/write guard/calendar/glossary/scorer rubric/history/WOSM/reference/card-news deferred contracts passed');
