import './register-rust-wasm.mjs';
import { expect, test, type Page } from '@playwright/test';
import { openSyntheticAdmin, assertRenderedBounds, SYNTHETIC_POST } from './admin-reorganization-fixture';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createToken } from '../functions/_shared/auth.js';
import { onRequestGet as renderCardnews } from '../functions/card-news/[id].js';

const ORIGIN = 'http://127.0.0.1:8791';
const destinations = [
  ['dashboard',null],['list',null],['write',null],['calendar',null],['card-news',null],['article-scorer',null],['ai-score-history',null],['glossary',null],
  ['settings','wosm-members'],['settings','reference-sites'],['memorabilia',null],['memorabilia-categories',null],['memorabilia-events',null],['memorabilia-comments',null],
] as const;
const cal = {id:1,title:'합성 일정 · 긴 행사명과 개최 지역을 함께 표시하는 검증 '.repeat(5),start_at:'2026-10-15',event_category:'KOR',event_tags:[],target_groups:[],related_posts:[],updated_at:'current'};
const glossary = {id:1,term_ko:'가족 스카우트',term_en:'Family Scouting',term_fr:'',description_ko:'합성 용어 설명',bucket:'가',updated_at:'current'};
const memo = {id:1,title_en:'Synthetic badge title '.repeat(8),title_ko:'합성 패치의 긴 제목과 상세 식별 정보 '.repeat(6),status:'draft',images:[],related_links:[],tags:[],country_codes:[],category_id:1,updated_at:'current'};
const category = {id:1,slug:'badge',label_en:'LongSyntheticCategoryWithoutSpacesForResponsiveVerification',label_ko:'합성 패치 분류의 긴 이름',sort_order:0};
const event = {id:1,slug:'synthetic',name_en:'Synthetic event',name_ko:'합성 행사',start_year:2026,start_month:10,end_year:2026,end_month:10,country_codes:[],category_id:1,usage_count:1};
const data: Record<string,unknown> = {
  '/api/admin/operations': {scheduled_posts:[],draft_posts:[],recent_errors:[],recent_logins:[],recent_settings:[],deployments:[]},
  '/api/calendar': {items:[cal]}, '/api/glossary': {items:[glossary]},
  '/api/settings/wosm-members': {items:[{country_ko:'대한민국',country_en:'Republic of Korea',extra_fields:{},sort_order:0}],columns:[{key:'country_names',label:'국가명',type:'country_names',system:true}],registered_count:0,revision:1},
  '/api/settings/reference-sites': {items:[{name:'합성 자료실',url:'https://example.invalid/'+ 'long-path/'.repeat(25),summary:'긴 설명을 줄바꿈하고 읽을 수 있는지 확인하는 합성 문장입니다. '.repeat(10),related_federations:['Asia-Pacific']}],revision:1},
  '/api/settings/score-rubric': {content:'합성 평가 기준',isDefault:true},
  '/api/admin/ai-score-history': {items:[{id:1,input_title:'합성 채점 기록',score:80,grade:'B',created_at_kst:'2026-10-15 10:00:00',categories:[]}],pagination:{total:1,offset:0,limit:30,has_more:false},stats:{total:1}},
  '/api/admin/card-news': {items:[{id:1,title:'합성 카드뉴스',created_at:'2026-10-15 01:00:00',has_data:1}]},
  '/api/memorabilia': {items:[memo],total:1}, '/api/memorabilia/1': {item:memo}, '/api/memorabilia/categories': {items:[category]},
  '/api/memorabilia/events': {items:[event]}, '/api/memorabilia/event-categories': {items:[{id:1,slug:'camp',label_en:'Camp',label_ko:'캠프',sort_order:0,archived:0,usage_count:1}]},
  '/api/admin/memorabilia-comments': {items:[{id:1,content:'검증용 긴 댓글과 저장된 줄바꿈입니다. '.repeat(20),status:'pending',author_name:'합성 이름',affiliation:'긴 소속 이름 '.repeat(6),created_at:'2026-10-15 01:00:00',memorabilia_id:1,memorabilia_title_ko:'합성 패치 이름 '.repeat(12),memorabilia_slug:'synthetic'}],total:1},
};
async function open(page: Page, role:'owner'|'member'='owner', populated=true) {
  // Reuse existing production-blocking fixture at a distinct local port.
  const proxy = new Proxy(page, { get(target,key) {
    if (key === 'route') return async (pattern:any, handler:any) => target.route(pattern, route => handler(new Proxy(route,{get(real,prop){
      if (prop === 'request') return () => new Proxy(real.request(),{get(request,member){if(member==='url') return () => request.url().replace(ORIGIN,'http://127.0.0.1:8767'); const value=(request as any)[member];return typeof value==='function'?value.bind(request):value;}});
      const value=(real as any)[prop];return typeof value==='function'?value.bind(real):value;
    }})));
    const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
  }});
  const permissions = destinations.flatMap(([panel,section])=>['view:'+(section||panel)]);
  const state = await openSyntheticAdmin(proxy,{role,permissions,populated});
  const controls = {errors:new Set<string>(),writes:[] as string[],reads:[] as string[],lastPost:null as any,deferPost:false,post:null as null|{release:()=>Promise<void>},deferred:null as null|{path:string,body:any,release:(status:number)=>Promise<void>}};
  await page.route(ORIGIN+'/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if (req.method()==='GET') {
      if (!(path in data) && path!=='/api/posts' && !path.startsWith('/api/posts/')) return route.fallback();
      controls.reads.push(req.url());
      if(controls.errors.has(path)) return route.fulfill({status:503,json:{error:'합성 조회 실패'}});
      if(path==='/api/posts') return route.fulfill({json:{posts:populated?[{...SYNTHETIC_POST,meta_tags:'합성,검증',updated_at:'current'}]:[],total:populated?1:0}});
      if(path==='/api/posts/101') {
        const respond=()=>route.fulfill({json:{post:{...SYNTHETIC_POST,meta_tags:'합성,검증',updated_at:'current'}}});
        if(controls.deferPost){controls.post={release:async()=>{await respond();controls.post=null;}};return;}
        return respond();
      }
      if(path.startsWith('/api/posts/')) return route.fulfill({json:{history:[]}});
      if(path==='/api/admin/memorabilia-comments' && url.searchParams.has('counts')) return route.fulfill({json:{counts:{pending:1,approved:0,rejected:0,deleted:0}}});
      return route.fulfill({json:populated?data[path]:{items:[],total:0,revision:0,columns:[],registered_count:0,pagination:{total:0}}});
    }
    controls.writes.push(req.method()+' '+path);
    if(path==='/api/posts'&&req.method()==='POST'){controls.lastPost=req.postDataJSON();return route.fulfill({json:{post:{...SYNTHETIC_POST,...controls.lastPost,id:103,updated_at:'new'}}});}
    if(['/api/calendar/1','/api/glossary/1','/api/settings/reference-sites','/api/settings/wosm-members','/api/memorabilia/1','/api/memorabilia/categories/1','/api/memorabilia/events/1','/api/admin/card-news/1'].includes(path)) {
      const body=req.postDataJSON();
      controls.deferred={path,body,release:async status=>{await route.fulfill({status,json:status===409?{error:path==='/api/memorabilia/1'?'version_mismatch':'다른 변경이 감지되었습니다',reason:'다른 변경이 감지되었습니다'}:path.includes('calendar')?{item:{...cal,...body,updated_at:'new'}}:path.includes('glossary')?{item:{...glossary,...body,updated_at:'new'}}:path.includes('reference-sites')?{items:body.items,revision:2}:path.includes('wosm-members')?{...data[path] as any,...body,revision:2}:path.includes('categories')?{item:{...category,...body}}:path.includes('events')?{ok:true,id:1}:{id:1,updated_at:'new'}}); controls.deferred=null;}};
      return;
    }
    // Every mutation is synthetic. AI requests fail locally and are never paid.
    return route.fulfill({status:path.includes('ai-score')||path.includes('score-article')?503:200,json:{ok:true,item:memo,items:[],updated:1,revision:2}});
  });
  return {state,controls};
}
async function enter(page:Page,panel:string,section:string|null=null) {
  await expect(page.locator('#v3-editorjs[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(({panel,section})=>(window as any).V3.showPanel(panel,section),{panel,section});
  await expect(page.locator('#panel-'+panel)).toHaveClass(/active/);
  if(section) await expect(page.locator('#settings-'+section)).toHaveClass(/active/);
  await expect(page.locator('.v3-panel.active .v3-loading:visible')).toHaveCount(0);
}

for(const width of [280,320,390,820,1280]) test(`all 14 internal menus populated remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900}); const {state,controls}=await open(page);
  for(const [panel,section] of destinations) {await enter(page,panel,section); await assertRenderedBounds(page,panel+(section?' '+section:''));}
  await enter(page,'memorabilia');await page.locator('#memo-list-select-all').check();await assertRenderedBounds(page,'selected memorabilia');
  await page.locator('[data-memo-edit="1"]').click();await expect(page.locator('#memo-edit-modal')).toBeVisible();await expect(page.locator('#memo-material-en')).toBeVisible();await expect(page.locator('#memo-desc-ko')).toBeVisible();
  const modalBounds=await page.locator('#memo-edit-modal .v3-modal').evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth,document:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(modalBounds.scroll).toBeLessThanOrEqual(modalBounds.client+1);expect(modalBounds.document).toBeLessThanOrEqual(modalBounds.viewport+1);
  expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);expect(controls.writes).toEqual([]);
  await page.screenshot({path:`test-results/content-internals/content-${width}.png`,fullPage:true});
});

test('real embedded React card-news editor reports dirty, pending, failed and saved versions to its host',async({page})=>{
  const {state,controls}=await open(page);page.on('dialog',dialog=>dialog.dismiss());
  const apiSource=readFileSync(new URL('../functions/api/admin/card-news/index.js',import.meta.url),'utf8');
  const defaults=vm.runInNewContext('('+apiSource.match(/const DEFAULT_DATA = ([\s\S]+?);\n\nfunction json/)![1]+')');
  const secret='synthetic-card-shell-only-never-production';const token=await createToken(secret,{role:'owner',uid:1,username:'synthetic'});
  const env={ADMIN_SECRET:secret,DB:Object.assign(new (class D1Database {})(),{prepare(sql:string){return{bind(){return this;},async first(){if(sql.includes('FROM admin_users'))return{id:1,role:'owner',status:'active',token_min_iat:0,permissions:'{"access_admin":true,"permissions":[]}'};if(sql.includes('FROM card_news'))return{title:'합성 카드뉴스',data:JSON.stringify(defaults)};return null;}};}})};
  await page.route(ORIGIN+'/card-news/1**',async route=>{const response=await renderCardnews({env,params:{id:'1'},request:new Request(route.request().url(),{headers:{Cookie:'admin_token='+token}})});expect(response.status).toBe(200);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
  await enter(page,'card-news');await page.locator('[data-cn-edit="1"]').click();const frame=page.frameLocator('#cardnews-editor-frame');
  await expect(frame.getByRole('button',{name:/서버에 저장|서버 저장/})).toBeVisible();const input=frame.locator('input.twk-field[type="text"]:visible').first();await input.fill('서버에 보낼 합성 주차');await expect(page.locator('#cardnews-editor-status')).toContainText('저장하지 않은 변경');
  await frame.getByRole('button',{name:/서버에 저장|서버 저장/}).click();await expect.poll(()=>!!controls.deferred).toBe(true);await expect(page.locator('#cardnews-editor-status')).toContainText('저장 중');await page.locator('#cardnews-editor-back').click();await expect(page.locator('#cardnews-editor-view')).toBeVisible();
  await input.fill('저장 도중 추가 입력');await controls.deferred!.release(200);await expect(page.locator('#cardnews-editor-status')).toContainText('추가 변경');await expect(input).toHaveValue('저장 도중 추가 입력');
  await frame.getByRole('button',{name:/서버에 저장|서버 저장/}).click();await expect.poll(()=>!!controls.deferred).toBe(true);await controls.deferred!.release(409);await expect(page.locator('#cardnews-editor-status')).toContainText('저장 실패');await expect(input).toHaveValue('저장 도중 추가 입력');
  expect(state.externalApi).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('calendar and glossary defer saves, preserve later typing and 409 input, dirty navigation cancels',async({page})=>{
  const {state,controls}=await open(page);page.on('dialog',dialog=>dialog.dismiss());
  for(const [panel,modal,input,save,invoke] of [['calendar','cal-modal','cal-title','cal-save-btn','_openCalEvent'],['glossary','glos-modal','glos-ko','glos-save-btn','_openGlosItem']]) {
    await enter(page,panel);await page.evaluate(({invoke})=>(window as any).V3[invoke](1),{invoke});
    await page.locator('#'+input).fill('보내는 입력');await page.locator('#'+save).click();await expect.poll(()=>!!controls.deferred).toBe(true);
    await page.locator('#'+input).fill('저장 중 추가 입력');await page.locator('#'+modal+' .v3-modal-close').click();await expect(page.locator('#'+modal)).toBeVisible();
    await controls.deferred!.release(200);await expect(page.locator('#'+save)).not.toHaveClass(/is-busy/);await expect(page.locator('#'+input)).toHaveValue('저장 중 추가 입력');
    await page.locator('#'+save).click();await expect.poll(()=>!!controls.deferred).toBe(true);await controls.deferred!.release(409);await expect(page.locator('#'+save)).not.toHaveClass(/is-busy/);await expect(page.locator('#'+input)).toHaveValue('저장 중 추가 입력');
    await page.evaluate(()=>(window as any).V3.showPanel('list'));await expect(page.locator('#panel-'+panel)).toHaveClass(/active/);
    await page.evaluate(()=>{(window as any).__originalConfirm=(window as any).confirm;(window as any).confirm=()=>true;});await page.locator('#'+modal+' .v3-modal-close').click();await page.evaluate(()=>{(window as any).confirm=(window as any).__originalConfirm;});
  }
  expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);
});

test('all content read-only roles suppress mutations including dynamically rendered controls',async({page})=>{
  const {state,controls}=await open(page,'member');
  for(const [panel,section] of destinations.filter(([panel])=>panel!=='write')) await enter(page,panel,section);
  await enter(page,'calendar');await page.evaluate(()=>(window as any).V3._openCalEvent(1));
  await expect(page.locator('#cal-save-btn')).toBeHidden();await expect(page.locator('#cal-title')).toBeDisabled();await page.locator('#cal-modal-close').click();
  await enter(page,'glossary');await page.evaluate(()=>(window as any).V3._openGlosItem(1));await expect(page.locator('#glos-save-btn')).toBeHidden();await expect(page.locator('#glos-ko')).toBeDisabled();await page.locator('#glos-modal-close').click();
  await enter(page,'card-news');await expect(page.locator('[data-cn-edit]')).toHaveCount(0);await expect(page.locator('[data-cn-copy]')).toHaveCount(0);await expect(page.locator('[data-cn-del]')).toHaveCount(0);
  await enter(page,'memorabilia-comments');await expect(page.locator('#memoc-table-wrap button[data-action]')).toHaveCount(0);await expect(page.locator('#memoc-table-wrap')).toContainText('읽기 전용');
  expect(controls.writes).toEqual([]);expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);
});

test('comments rejected prompt cancellation sends zero PATCH and scorer searches server rather than cached100',async({page})=>{
  const {state,controls}=await open(page);page.on('dialog',dialog=>dialog.dismiss());
  await enter(page,'memorabilia-comments');await page.locator('[data-action="reject"]').click();expect(controls.writes).toEqual([]);
  await expect(page.locator('#memoc-counts')).toContainText('대기 1 · 승인 0');
  for(const width of [280,320,390,820,1280]) {await page.setViewportSize({width,height:900});await assertRenderedBounds(page);await expect(page.locator('#memoc-table-wrap')).toContainText('검증용 긴 댓글');}
  controls.errors.add('/api/admin/memorabilia-comments');await page.locator('#memoc-refresh-btn').click();await expect(page.locator('#memoc-counts')).toContainText('불러오지 못했습니다');await expect(page.locator('#memoc-table-wrap')).toContainText('실패');await expect(page.locator('#memoc-pagination button')).toHaveCount(0);await expect(page.locator('#memo-comments-pending-badge')).toBeHidden();
  controls.errors.delete('/api/admin/memorabilia-comments');await page.locator('#memoc-refresh-btn').click();await expect(page.locator('#memoc-counts')).toContainText('대기 1 · 승인 0');await expect(page.locator('#memoc-table-wrap')).toContainText('검증용 긴 댓글');
  await enter(page,'article-scorer');await page.locator('#scorer-search-input').fill('오래된 기사');await expect.poll(()=>controls.reads.some(url=>url.includes('/api/posts?')&&new URL(url).searchParams.get('q')==='오래된 기사')).toBe(true);
  expect(controls.reads.some(url=>url.includes('limit=300'))).toBe(false);expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);
});

test('all 14 empty menus and failed reads remain distinct and retryable',async({page})=>{
  const {state,controls}=await open(page,'owner',false);
  for(const [panel,section] of destinations) await enter(page,panel,section);
  const failures = [
    ['list',null,'/api/posts','#list-tbody'],['calendar',null,'/api/calendar','#cal-list'],['glossary',null,'/api/glossary','#glos-list'],
    ['card-news',null,'/api/admin/card-news','#cardnews-list-wrap'],['ai-score-history',null,'/api/admin/ai-score-history','#ai-score-history-list'],
    ['settings','wosm-members','/api/settings/wosm-members','#wosm-members-editor'],['settings','reference-sites','/api/settings/reference-sites','#reference-sites-saved-list'],
    ['memorabilia',null,'/api/memorabilia','#memo-list-wrap'],['memorabilia-categories',null,'/api/memorabilia/categories','#memo-cat-list-wrap'],
    ['memorabilia-events',null,'/api/memorabilia/events','#memo-ev-list-wrap'],['memorabilia-comments',null,'/api/admin/memorabilia-comments','#memoc-table-wrap'],
  ] as const;
  for(const [panel,section,path,selector] of failures) {
    controls.errors.add(path);await enter(page,panel,section);await expect(page.locator(selector)).toContainText(/실패|못했습니다/);
    controls.errors.delete(path);await enter(page,'dashboard');await enter(page,panel,section);await expect(page.locator(selector)).not.toContainText(/실패|못했습니다/);
  }
  controls.errors.add('/api/admin/operations');await enter(page,'dashboard');await page.locator('#dash-refresh-btn').click();await expect(page.locator('#dash-ops-alerts')).toContainText('불러오지 못했습니다');
  controls.errors.add('/api/settings/score-rubric');await enter(page,'article-scorer');controls.errors.add('/api/posts');await page.locator('#scorer-search-input').fill('검색 실패');await expect(page.locator('#scorer-post-list')).toContainText('기사 검색 실패');
  await expect(page.locator('#rubric-textarea')).toBeVisible();await expect(page.locator('#rubric-textarea')).toHaveValue('');await expect(page.locator('#rubric-textarea')).toBeEnabled();
  await enter(page,'list');controls.errors.add('/api/posts/101');await page.evaluate(()=>(window as any).V3.editPost(101));await expect(page.locator('#write-panel-title')).toContainText('불러오지 못했습니다');await expect(page.locator('#write-publish-btn')).toBeDisabled();
  expect(state.externalApi).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('late article hydration cannot overwrite a new document and autocomplete Escape only closes suggestions',async({page})=>{
  const {state,controls}=await open(page);controls.deferPost=true;
  await page.evaluate(()=>(window as any).V3.editPost(101));await expect.poll(()=>!!controls.post).toBe(true);
  await page.evaluate(()=>(window as any).V3.openWrite());await page.locator('#w-title').fill('새 문서의 제목');
  await controls.post!.release();await expect(page.locator('#w-title')).toHaveValue('새 문서의 제목');
  await page.locator('#w-metatag-input').focus();await page.evaluate(()=>{const box=document.getElementById('w-metatag-suggestions')!;box.hidden=false;box.innerHTML='<div class="v3-metatag-suggestion" data-name="합성">합성</div>';});
  await page.locator('#w-metatag-input').press('Escape');await expect(page.locator('#w-metatag-suggestions')).toBeHidden();await expect(page.locator('#panel-write')).toHaveClass(/active/);await expect(page.locator('#w-title')).toHaveValue('새 문서의 제목');
  await expect(page.locator('#v3-editorjs')).toHaveAttribute('aria-busy','false');await page.locator('#v3-editorjs .ce-paragraph').first().fill('새 문서 본문을 실제 EditorJS에 입력했습니다.');
  await page.locator('#write-publish-btn').click();await expect.poll(()=>!!controls.lastPost).toBe(true);expect(controls.lastPost.title).toBe('새 문서의 제목');expect(controls.lastPost.content).toContain('새 문서 본문');
  expect(state.externalApi).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('WOSM zero value, unsaved row and reference modal preserve later typing and conflict input',async({page})=>{
  const {state,controls}=await open(page);page.on('dialog',dialog=>dialog.dismiss());
  await enter(page,'settings','wosm-members');await expect(page.locator('#wosm-registered-count')).toHaveValue('0');
  const country=page.locator('#wosm-member-country_ko-0');await country.fill('저장할 국가');await page.locator('#wosm-members-save-btn').click();await expect.poll(()=>!!controls.deferred).toBe(true);await country.fill('저장 중 새 국가');await controls.deferred!.release(200);await expect(page.locator('#wosm-members-save-btn')).not.toHaveClass(/is-busy/);await expect(page.locator('#wosm-members-save-btn')).toBeEnabled();await expect(country).toHaveValue('저장 중 새 국가');
  await page.locator('#wosm-members-save-btn').click();await expect.poll(()=>!!controls.deferred).toBe(true);await controls.deferred!.release(409);await expect(page.locator('#wosm-members-save-btn')).not.toHaveClass(/is-busy/);await expect(page.locator('#wosm-members-save-btn')).toBeEnabled();await expect(country).toHaveValue('저장 중 새 국가');
  await page.evaluate(()=>(window as any).V3.showPanel('settings','reference-sites'));await expect(page.locator('#settings-wosm-members')).toHaveClass(/active/);
  await page.evaluate(()=>{(window as any).__originalConfirm=confirm;(window as any).confirm=()=>true;});await enter(page,'settings','reference-sites');await page.evaluate(()=>{(window as any).confirm=(window as any).__originalConfirm;});
  await page.locator('[data-refsite-edit="0"]').click();await page.locator('#refsite-modal-name').fill('저장할 사이트');await page.locator('#refsite-modal-submit').click();await expect.poll(()=>!!controls.deferred).toBe(true);await page.locator('#refsite-modal-name').fill('저장 중 새 사이트');await controls.deferred!.release(200);await expect(page.locator('#refsite-modal-submit')).not.toHaveClass(/is-busy/);await expect(page.locator('#refsite-modal-submit')).toBeEnabled();await expect(page.locator('#refsite-modal')).toBeVisible();await expect(page.locator('#refsite-modal-name')).toHaveValue('저장 중 새 사이트');
  await page.locator('#refsite-modal-submit').click();await expect.poll(()=>!!controls.deferred).toBe(true);await controls.deferred!.release(409);await expect(page.locator('#refsite-modal-submit')).not.toHaveClass(/is-busy/);await expect(page.locator('#refsite-modal-submit')).toBeEnabled();await expect(page.locator('#refsite-modal-name')).toHaveValue('저장 중 새 사이트');
  expect(state.externalApi).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('memorabilia, category and event saves keep newer edits and zero sorting',async({page})=>{
  const {state,controls}=await open(page);page.on('dialog',dialog=>dialog.dismiss());
  for(const [panel,selector,modal,input,save] of [
    ['memorabilia','[data-memo-edit="1"]','memo-edit-modal','memo-title-ko','memo-edit-save'],
    ['memorabilia-categories','[data-cat-edit="1"]','memo-cat-edit-modal','memo-cat-label-ko','memo-cat-edit-save'],
    ['memorabilia-events','[data-ev-edit="1"]','memo-ev-edit-modal','memo-ev-name-ko','memo-ev-edit-save'],
  ]) {
    await enter(page,panel);await page.locator(selector).click();await expect(page.locator('#'+modal)).toBeVisible();if(panel==='memorabilia-categories') await expect(page.locator('#memo-cat-sort')).toHaveValue('0');
    await page.locator('#'+input).fill('저장할 이름');await page.locator('#'+save).click();await expect.poll(()=>!!controls.deferred).toBe(true);await page.locator('#'+input).fill('저장 중 새 이름');await controls.deferred!.release(200);await expect(page.locator('#'+save)).toBeEnabled();await expect(page.locator('#'+modal)).toBeVisible();await expect(page.locator('#'+input)).toHaveValue('저장 중 새 이름');
    if(panel==='memorabilia'){await page.locator('#'+save).click();await expect.poll(()=>!!controls.deferred).toBe(true);await controls.deferred!.release(409);await expect(page.locator('#'+save)).toBeEnabled();await expect(page.locator('#'+input)).toHaveValue('저장 중 새 이름');}
    await page.evaluate(()=>{(window as any).__originalConfirm=confirm;(window as any).confirm=()=>true;});await page.locator('#'+modal+' .v3-modal-close').first().click();await page.evaluate(()=>{(window as any).confirm=(window as any).__originalConfirm;});
  }
  expect(state.externalApi).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('Admin image picker cancellation writes nothing and processing blocks save and document replacement',async({page})=>{
  const {state,controls}=await open(page);await page.evaluate(()=>(window as any).V3.openWrite());await expect(page.locator('#v3-editorjs')).toHaveAttribute('aria-busy','false');
  const cancelledChooser=page.waitForEvent('filechooser');await page.locator('#w-cover-btn').click();const cancelled=await cancelledChooser;await cancelled.element().dispatchEvent('cancel');expect(controls.writes).toEqual([]);
  await page.locator('#w-title').fill('이미지 처리 보호 검증');await page.locator('#v3-editorjs .ce-paragraph').first().fill('실제 본문입니다.');
  await page.evaluate(()=>{(window as any).GW.optimizeImageFile=()=>new Promise(resolve=>(window as any).__finishImage=()=>resolve({dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}));});
  const chooser=page.waitForEvent('filechooser');await page.locator('#w-cover-btn').click();await (await chooser).setFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__finishImage==='function')).toBe(true);
  await page.locator('#write-publish-btn').click();expect(controls.writes.filter(path=>path==='POST /api/posts')).toEqual([]);
  await page.evaluate(()=>{(window as any).__originalConfirm=confirm;(window as any).confirm=()=>true;(window as any).V3.showPanel('list');(window as any).V3.openWrite();(window as any).confirm=(window as any).__originalConfirm;});await expect(page.locator('#panel-write')).toHaveClass(/active/);await expect(page.locator('#w-title')).toHaveValue('이미지 처리 보호 검증');
  await page.evaluate(()=>(window as any).__finishImage());await expect(page.locator('#w-cover-preview img').first()).toHaveAttribute('src',/^data:image/);await expect(page.locator('#w-draft-line')).toHaveClass(/is-saved/);await page.locator('#write-publish-btn').click();await expect.poll(()=>!!controls.lastPost).toBe(true);expect(controls.lastPost.image_data).toMatch(/^data:image/);
  expect(state.externalApi).toEqual([]);expect(state.pageErrors).toEqual([]);
});
