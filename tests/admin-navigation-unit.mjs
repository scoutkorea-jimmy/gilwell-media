import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const admin = readFileSync(new URL('../public/js/admin-v3.js', import.meta.url), 'utf8');
const account = readFileSync(new URL('../public/js/admin-account.js', import.meta.url), 'utf8');
const navigation = admin.slice(admin.indexOf('  var PANEL_LABELS ='), admin.indexOf('     PRIVACY POLICY —'));
// Keep the extracted production section syntactically complete before its next comment.
const navigationCode = navigation.slice(0, navigation.lastIndexOf('  /*'));
const accountNavigation = account.slice(account.indexOf('  function _syncOwnerOnlyNav()'), account.indexOf('  function _renderMyProfile()'));

class Node {
  constructor(kind, parent = null, dataset = {}) {
    this.kind = kind; this.parentElement = parent; this.dataset = dataset;
    this.children = []; this.attrs = {}; this.style = {}; this.open = false;
    this.textContent = ''; this.classes = new Set();
    this.value = ''; this.checked = false;
    if (parent) parent.children.push(this);
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force = !this.classes.has(name)) => {
        if (force) this.classes.add(name); else this.classes.delete(name);
        return force;
      },
    };
  }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  closest(selector) {
    const kind = selector === '.v3-nav-section' ? 'section' : 'group';
    for (let node = this; node; node = node.parentElement) if (node.kind === kind) return node;
    return null;
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector) { return this.descendants().filter(node => node.kind === 'item'); }
  querySelector() { return this.children.find(node => node.kind === 'heading') || null; }
}

function fixture(role = 'owner', permissions = []) {
  const nav = new Node('nav');
  const article = new Node('section', nav); const heading = new Node('heading', article); heading.textContent = '기사 운영';
  const group = new Node('group', article); const nested = new Node('group', group);
  const write = new Node('item', nested, { panel: 'write' });
  const empty = new Node('group', article); const denied = new Node('item', empty, { panel: 'marketing' });
  const accountSection = new Node('section', nav); const accountHeading = new Node('heading', accountSection); accountHeading.textContent = '운영·설정';
  const accountItem = new Node('item', accountSection, { panel: 'account-me' });
  const settings = new Node('section', nav); const settingsHeading = new Node('heading', settings); settingsHeading.textContent = '노출 관리';
  const homeBanners = new Node('item', settings, { panel: 'settings', settingsSection: 'home-banners' });
  const items = [write, denied, accountItem, homeBanners];
  const ids = new Map();
  const panelNames = ['dashboard', 'write', 'list', 'settings', 'account-me', 'account-users', 'account-presets', 'site-history', 'marketing', 'analytics-visits', 'memorabilia'];
  const panels = panelNames.map(name => { const node = new Node('panel'); ids.set('panel-' + name, node); return node; });
  const sections = ['hero', 'picks', 'home-banners', 'privacy-policy', 'nav-labels'].map(name => { const node = new Node('settings'); node.id = 'settings-' + name; ids.set(node.id, node); return node; });
  for (const id of ['v3-panel-title', 'v3-sidebar', 'v3-menu-toggle']) ids.set(id, new Node('element'));
  ids.get('v3-sidebar').classList.add('is-menu-open');
  ids.get('v3-menu-toggle').setAttribute('aria-expanded', 'true');
  ids.get('panel-write').classList.add('active');
  write.setAttribute('data-perm-slug', 'write');
  denied.setAttribute('data-perm-slug', 'marketing');
  homeBanners.setAttribute('data-perm-slug', 'home-banners');
  const context = {
    V3: {}, me: role ? { role, permissions: { permissions } } : null,
    _state: {}, _panel: 'write', _settingsSection: 'hero', _writeDirty: false,
    _draftSaveInflight: false, _writeDraftDebounce: null, _writeEnhanceInited: true,
    _editingId: null, loads: [], confirmations: [], toasts: [], resets: 0, otpCalls: [], events: [],
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    confirm: message => { context.confirmations.push(message); return context.confirmAnswer ?? true; },
    GW: { showToast: (...args) => context.toasts.push(args) },
    _el: id => ids.get(id),
    _otpGate: (...args) => { context.otpCalls.push(args); return context.otpAnswer ?? true; },
    _stopDraftTimer: () => { context._writeDraftDebounce = null; },
    _startDraftTimer: () => {},
    _initWriteEnhancementsOnce: () => { context._writeEnhanceInited = true; },
    _resetWrite: () => { context.resets++; },
    _scheduleDraftSave: () => { context._writeDraftDebounce = 1; },
    _loadAuthorOptions: () => {},
    _refreshDraftListCache: () => Promise.resolve([]),
    _syncAnalyticsAutoRefresh: () => {},
    _renderOtpCard: () => {},
    document: {
      getElementById: id => ids.get(id),
      dispatchEvent: event => { context.events.push(event); return true; },
      querySelectorAll: selector => {
        if (selector === '.v3-panel') return panels;
        if (selector === '.v3-settings-section') return sections;
        if (selector === '#v3-nav .v3-nav-item') return items;
        if (selector === '#v3-nav .v3-nav-group') return [group, nested, empty];
        if (selector === '#v3-nav .v3-nav-section') return [article, accountSection, settings];
        if (selector === '[data-perm-slug]') return items.filter(node => node.hasAttribute('data-perm-slug'));
        if (selector === '[data-owner-only="1"]') return [];
        throw new Error('Unexpected selector ' + selector);
      },
    },
  };
  for (const name of ['Dashboard', 'HomepageIssues', 'SiteHistory', 'List', 'Calendar', 'Glossary', 'AnalyticsVisits', 'AnalyticsTags', 'GeoAudience', 'Marketing', 'Releases', 'Hero', 'HomeLeadUI', 'TagSettingsUI', 'MetaUI', 'BoardCopy', 'AuthorUI', 'BannerUI', 'HomeBannersUI', 'TickerUI', 'ContributorsUI', 'EditorsUI', 'NavLabelsUI', 'TranslationsUI', 'WosmMembersUI', 'ReferenceSitesUI', 'PrivacyPolicyUI']) {
    context['_load' + name] = () => context.loads.push(name);
  }
  context._initArticleScorer = () => {}; context._loadAiScoreHistory = () => {};
  context.window = context;
  context.AccountAdmin = { currentMe: () => context.me };
  vm.createContext(context); vm.runInContext(navigationCode, context);
  return { context, ids, group, nested, empty, article, accountSection, settings, items, write, denied };
}

{
  const f = fixture();
  assert.equal(f.context.V3.showPanel('write'), true);
  assert.equal(f.group.open, true); assert.equal(f.nested.open, true);
  assert.equal(f.write.getAttribute('aria-current'), 'page');
  assert.equal(f.context.resets, 0, 'Reopening navigation must preserve the existing draft');
  assert.equal(f.ids.get('v3-panel-title').textContent, '기사 운영 · 새 글 작성');
  assert.equal(f.ids.get('v3-menu-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(f.context.events.length, 1, 'A successful show emits exactly one extension load event');
  assert.equal(f.context.events[0].type, 'gw:admin-panel-shown');
  assert.equal(f.context.events[0].detail.panel, 'write');
  assert.equal(f.context.events[0].detail.settingsSection, null);
  assert.equal(f.context.V3.showPanel('settings', 'home-banners'), true);
  assert.equal(f.ids.get('v3-panel-title').textContent, '노출 관리 · 홈 배너');
  assert.equal(f.write.hasAttribute('aria-current'), false);
}

{
  const f = fixture('member', ['view:hero']);
  f.context._panel = 'dashboard';
  assert.equal(f.context.V3.showPanel('settings'), true);
  assert.deepEqual(f.context.loads, ['Hero']);
  f.context.V3.showPanel('settings', 'home-banners');
  assert.equal(f.context._panel, 'account-me');
  assert.deepEqual(f.context.loads, ['Hero'], 'Unauthorized settings must never load');
  f.context.V3.showPanel('settings', 'nav-labels');
  assert.equal(f.context.loads.includes('NavLabelsUI'), false);
  f.context.V3.showPanel('account-users');
  assert.equal(f.context._panel, 'account-me');
  assert.equal(f.context.events.length, 1, 'Rejected calls do not emit extension load events');
}

{
  const f = fixture('member', []);
  f.context.V3.showPanel('settings', 'account-security');
  assert.equal(f.context._panel, 'account-me');
  assert.deepEqual(f.context.otpCalls.at(-1), ['account-me', undefined]);
  assert.equal(f.context.loads.length, 0);
  assert.equal(f.context.V3.showPanel('settings', 'picks'), true);
  assert.equal(f.context._panel, 'account-me', 'Picks retains its independent permission');
}

for (const blocked of ['dirty', 'saving', 'otp']) {
  const f = fixture();
  if (blocked === 'dirty') { f.context._writeDirty = true; f.context.confirmAnswer = false; }
  if (blocked === 'saving') f.context._draftSaveInflight = true;
  if (blocked === 'otp') f.context.otpAnswer = false;
  assert.equal(f.context.V3.showPanel('site-history'), false);
  assert.equal(f.context._panel, 'write');
  assert.equal(f.ids.get('panel-write').classList.contains('active'), true);
  assert.equal(f.ids.get('v3-menu-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(f.context.loads.length, 0);
  assert.equal(f.context.events.length, 0, 'Cancelled, saving, or OTP-pending navigation cannot start extension loaders');
}

{
  const f = fixture(); f.context._writeDirty = true;
  assert.equal(f.context.V3.showPanel('list'), true);
  assert.equal(f.context.confirmations.length, 1);
  assert.equal(f.context.V3.showPanel(undefined), false, 'External links do not empty the current panel');
  assert.equal(f.context.V3.showPanel('settings', 'unknown-section'), false);
  assert.equal(f.context.V3.showPanel('settings', 'picks'), true);
  assert.equal(f.context.loads.includes('PicksUI'), false, 'Automatic recommendation info must never invoke manual loaders');
  assert.equal(f.context.V3.showPanel('analytics'), true);
  assert.equal(f.context._panel, 'analytics-visits', 'Legacy analysis alias uses the real panel and permission');
}

{
  const f = fixture('member', ['view:write']);
  f.context._state.me = f.context.me;
  vm.runInContext(accountNavigation, f.context);
  f.context._syncPermissionNav();
  assert.equal(f.empty.hasAttribute('hidden'), true);
  assert.equal(f.group.hasAttribute('hidden'), false);
  assert.equal(f.article.hasAttribute('hidden'), false);
  assert.equal(f.settings.hasAttribute('hidden'), true);
  assert.equal(f.accountSection.hasAttribute('hidden'), false, 'Self account remains accessible');
  f.context._state.me = null; f.context._syncPermissionNav();
  assert.equal(f.group.hasAttribute('hidden'), true);
  assert.equal(f.article.hasAttribute('hidden'), true);
  f.context._state.me = { role: 'owner' }; f.context._syncPermissionNav();
  assert.equal(f.empty.hasAttribute('hidden'), false, 'Groups recover when permissions change');
  assert.equal(f.settings.hasAttribute('hidden'), false);
}

{
  const f = fixture();
  const writeCode = admin.slice(admin.indexOf('  V3.openWrite = function'), admin.indexOf('  V3.editPost = function'));
  vm.runInContext(writeCode, f.context);
  f.context._writeDirty = true; f.context.confirmAnswer = false;
  f.context.V3.openWrite();
  assert.equal(f.context.resets, 0, 'Declining new article preserves the current article');
  f.context.V3.cancelWrite();
  assert.equal(f.context._panel, 'write');
  assert.equal(f.context.confirmations.length, 2, 'Each attempted navigation asks once');
  const editCode = admin.slice(admin.indexOf('  V3.editPost = function'), admin.indexOf('  function _savePost()'));
  vm.runInContext(editCode, f.context);
  f.context.V3.editPost(42);
  assert.equal(f.context._editingId, null, 'Declining article replacement keeps the current editing identity');
  assert.equal(f.context.resets, 0);
  f.context._draftSaveInflight = true; f.context.confirmAnswer = true;
  f.context.V3.openWrite(); f.context.V3.editPost(42);
  assert.equal(f.context._editingId, null, 'No reset or article replacement can race with an in-flight draft save');
  assert.equal(f.context.resets, 0);
}

{
  const f = fixture();
  const compatibility = admin.slice(admin.indexOf('  V3._addPick = V3._removePick'), admin.indexOf('  function _setControlValue('));
  vm.runInContext(compatibility, f.context);
  f.context.V3._addPick(42); f.context.V3._removePick(42);
  assert.equal(f.context.toasts.length, 2);
  assert.equal(f.context.loads.length, 0);
  assert.equal(admin.includes("_apiFetch('/api/settings/picks-order'"), false);
  assert.equal(admin.includes('body: JSON.stringify({ featured: !!enabled })'), false);
}

{
  const f = fixture(); let toggle;
  f.context._bindEl = (id, type, handler) => { toggle = handler; };
  const toggleCode = admin.slice(admin.indexOf("    _bindEl('v3-menu-toggle'"), admin.indexOf('    // Dashboard refresh'));
  vm.runInContext(toggleCode, f.context);
  toggle.call(f.ids.get('v3-menu-toggle'));
  assert.equal(f.ids.get('v3-menu-toggle').getAttribute('aria-expanded'), 'false');
  toggle.call(f.ids.get('v3-menu-toggle'));
  assert.equal(f.ids.get('v3-menu-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(f.ids.get('v3-sidebar').classList.contains('is-menu-open'), true);
}

{
  const f = fixture(); let beforeUnload;
  f.context.addEventListener = (type, handler) => { beforeUnload = handler; };
  const unloadCode = admin.slice(admin.indexOf("    window.addEventListener('beforeunload'"), admin.indexOf("    document.addEventListener('keydown'", admin.indexOf("    window.addEventListener('beforeunload'")));
  vm.runInContext(unloadCode, f.context);
  for (const state of ['clean', 'dirty', 'saving']) {
    f.context._writeDirty = state === 'dirty'; f.context._draftSaveInflight = state === 'saving';
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    beforeUnload(event);
    assert.equal(event.prevented, state !== 'clean');
  }
}

{
  const f = fixture(); const cleared = [];
  f.context._draftTimer = 11; f.context._writeDraftDebounce = 12;
  f.context.clearInterval = id => cleared.push(id);
  f.context.clearTimeout = id => cleared.push(id);
  f.context.setInterval = () => 13;
  const timers = admin.slice(admin.indexOf('  function _startDraftTimer()'), admin.indexOf('  // 발행(publish) 성공 시 호출'));
  vm.runInContext(timers, f.context);
  f.context._startDraftTimer();
  assert.deepEqual(cleared, [11]);
  assert.equal(f.context._writeDraftDebounce, 12, 'Reopening write preserves a scheduled draft save');
  f.context._stopDraftTimer();
  assert.deepEqual(cleared, [11, 13, 12]);
}

function deferredWrites() {
  const f = fixture(); const c = f.context; const timers = new Map(); const requests = []; const statuses = [];
  let nextTimer = 0;
  const fields = [...admin.matchAll(/(?:_el|document\.getElementById)\('(w-[^']+|write-publish-btn|write-panel-title)'\)/g)].map(match => match[1]);
  fields.forEach(id => f.ids.set(id, new Node('field')));
  f.ids.get('w-title').value = 'First snapshot';
  Object.assign(c, {
    _writeChangeRevision: 0, _writeLastDraftSavedAt: 0, _draftSavePending: false, _currentDraftId: 3,
    _draftTimer: null, _coverDataUrl: null, _galleryImages: [], _selectedWriteTags: [], _metaTags: [], _relatedPosts: [],
    _heroPostIds: [], _homeLeadPost: null, _coverFrame: { x: 50, y: 50 }, _editingOriginalUpdatedAt: '',
    _editorGetData: () => Promise.resolve('{}'), _draftContentLooksMeaningful: () => true,
    _setDraftStatus: (state, message) => statuses.push({ state, message }), _relativeTimeKo: () => '방금 전',
    _setButtonBusy: button => button.classList.add('is-busy'),
    _clearButtonBusy: button => button.classList.remove('is-busy'),
    _syncWriteFeaturedState: () => {}, _clampFramePct: value => value,
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: () => {},
    _apiFetch: (url, options) => {
      if (options.method === 'DELETE') { requests.push({ url, options }); return Promise.resolve({}); }
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  });
  const draftCode = admin.slice(admin.indexOf('  function _collectDraftPayload('), admin.indexOf('  function _setDraftStatus('))
    + admin.slice(admin.indexOf('  function _saveDraftNow()'), admin.indexOf('  // Editor.js JSON content'));
  vm.runInContext(draftCode, c);
  vm.runInContext(admin.slice(admin.indexOf('  function _savePost()'), admin.indexOf('  function _syncWriteFeaturedState()')), c);
  vm.runInContext(admin.slice(admin.indexOf('  V3.openWrite = function'), admin.indexOf('  V3.editPost = function')), c);
  return { ...f, timers, requests, statuses };
}

{
  const f = deferredWrites(); const c = f.context;
  c._scheduleDraftSave(); const oldTimer = c._writeDraftDebounce;
  const saving = c._saveDraftNow(); await Promise.resolve();
  assert.equal(f.timers.has(oldTimer), false, 'Manual save replaces its scheduled invocation');
  assert.equal(c._writeDraftDebounce, null);
  f.ids.get('w-title').value = 'Newest typing'; c._coverDataUrl = 'data:new-cover';
  c._scheduleDraftSave(); const newTimer = c._writeDraftDebounce;
  f.requests[0].resolve({ draft: { id: 3, image_url: '/old-cover' } }); await saving;
  assert.equal(c._writeDirty, true, 'The older response cannot mark newer edits saved');
  assert.equal(f.statuses.at(-1).state, 'dirty');
  assert.equal(c._writeDraftDebounce, newTimer, 'The latest scheduled save remains queued');
  assert.equal(c._coverDataUrl, 'data:new-cover', 'The older response cannot replace a newer cover');
  assert.ok(c._writeLastDraftSavedAt > 0, 'Timestamp still records the completed server snapshot');
  c.confirmAnswer = false; c.V3.openWrite();
  assert.equal(c.resets, 0); assert.equal(c.confirmations.length, 1);
  const latestSave = c._saveDraftNow(); await Promise.resolve();
  f.requests[1].resolve({ draft: { id: 3, image_url: '/new-cover' } }); await latestSave;
  assert.equal(c._writeDirty, false); assert.equal(c._writeDraftDebounce, null);
  assert.equal(f.statuses.at(-1).state, 'saved');
  assert.equal(c._canLeaveWrite(), true);
}

{
  const f = deferredWrites(); const c = f.context;
  const saving = c._saveDraftNow(); await Promise.resolve();
  c._scheduleDraftSave(); f.timers.get(c._writeDraftDebounce).fn();
  assert.equal(c._draftSavePending, true);
  f.requests[0].resolve({ draft: { id: 3 } }); await saving;
  assert.equal(f.timers.get(c._writeDraftDebounce).ms, 100, 'The queued retry uses the cancellable debounce slot');
  c._stopDraftTimer();
  assert.equal(c._writeDraftDebounce, null); assert.equal(f.timers.size, 0);
  assert.equal(f.requests.length, 1, 'Cancelling the retry makes no additional request');
}

{
  const f = deferredWrites(); const c = f.context;
  c._draftSaveInflight = true;
  assert.equal(c._savePost(), undefined); assert.equal(f.requests.length, 0);
  c._draftSaveInflight = false;
  f.ids.get('w-published').checked = true;
  const publishing = c._savePost(); await Promise.resolve();
  assert.equal(f.requests[0].url, '/api/posts');
  assert.equal(c._canLeaveWrite(), false, 'Article replacement waits for publication too');
  c.V3.openWrite(); assert.equal(c.resets, 0);
  f.ids.get('w-title').value = 'Typed while publishing';
  f.ids.get('w-published').checked = false; c._scheduleDraftSave();
  f.timers.get(c._writeDraftDebounce).fn();
  assert.equal(f.requests.length, 1, 'Autosave waits while publication is in flight');
  assert.equal(f.timers.get(c._writeDraftDebounce).ms, 100);
  f.requests[0].resolve({ post: { id: 42, published: 1, featured: 0, updated_at: 'synthetic-time' } });
  await publishing;
  assert.equal(c._editingId, 42); assert.equal(c._currentDraftId, null);
  assert.equal(c._writeDirty, true); assert.equal(f.ids.get('w-title').value, 'Typed while publishing');
  assert.equal(f.ids.get('w-published').checked, false, 'The publication response preserves newer input controls');
  const resumed = c._saveDraftNow(); await Promise.resolve();
  const latest = f.requests.at(-1);
  assert.equal(latest.url, '/api/admin/drafts');
  assert.equal(JSON.parse(latest.options.body).editing_post_id, 42, 'The resumed save belongs to the newly saved article');
  assert.equal(JSON.parse(latest.options.body).title, 'Typed while publishing');
  latest.resolve({ draft: { id: 4 } }); await resumed;
  assert.equal(c._writeDirty, false); assert.equal(c._currentDraftId, 4);
}

{
  const f = deferredWrites(); const c = f.context;
  c._scheduleDraftSave(); const publishing = c._savePost(); await Promise.resolve();
  f.requests[0].reject(new Error('Synthetic publication failure')); await publishing;
  assert.equal(c._writeDirty, true);
  assert.ok(f.timers.has(c._writeDraftDebounce), 'Publication failure resumes autosave for unsaved input');
}

{
  const f = fixture(); const c = f.context;
  const modalCode = admin.slice(admin.indexOf('  function _openCalModal('), admin.indexOf('  function _closeCalModal()'));
  for (const match of modalCode.matchAll(/document\.getElementById\('([^']+)'\)/g)) f.ids.set(match[1], new Node('field'));
  const dialog = new Node('dialog'); dialog.scrollTop = 320;
  f.ids.get('cal-modal').querySelector = () => dialog;
  for (const name of ['_renderCalTags', '_renderCalTagPresets', '_renderCalTargetGroups', '_renderCalRelatedPosts', '_syncCalCategoryUi', '_renderCalGeoPreview']) c[name] = () => {};
  vm.runInContext(modalCode, c); c._openCalModal(null);
  assert.equal(dialog.scrollTop, 0, 'Reopening calendar begins at the title and dates');
  assert.equal(f.ids.get('cal-modal').style.display, 'flex');
}

console.log('Admin navigation assertions passed: permissions, groups, guard, OTP, mobile, compatibility, deferred autosave/publication.');
