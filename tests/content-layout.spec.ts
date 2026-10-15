import { expect, test, type Page } from '@playwright/test';
import { openSyntheticAdmin, assertRenderedBounds, SYNTHETIC_POST } from './admin-reorganization-fixture';
import { readFileSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = 'http://127.0.0.1:8794';
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
  '/api/admin/card-news': {items:Array.from({length:6},(_,index)=>({id:index+1,title:'2026년 스카우트 국제 교류와 지역사회 활동을 함께 전하는 주간 카드뉴스 '+(index+1),created_at:'2026-10-15 01:00:00',has_data:1}))},
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

const artifacts = 'work/content-layout-20261015';
mkdirSync(artifacts,{recursive:true});
const days = ['월','화','수','목','금','토','일'].map((label,key)=>({key,label}));
const heatmap = {weekdays:days,hours:Array.from({length:24},(_,i)=>i),cells:days.flatMap(day=>Array.from({length:24},(_,hour)=>({weekday:day.key,hour,visits:hour+day.key+1,pageviews:hour*2+1,intensity:(hour+1)/24,publish_count:hour===9?2:0}))),max_visits:30,range_label:'합성 최근7일'};
for(const width of [5120,2560,1920,390,280]) test(`content layout all14 visible and readable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width>1000?1440:900});
  const {state,controls}=await open(page);
  if(process.env.ADMIN_LAYOUT_PREVIEW_CSS) await page.addStyleTag({content:readFileSync(process.env.ADMIN_LAYOUT_PREVIEW_CSS,'utf8')});
  await page.route(ORIGIN+'/api/admin/analytics**',route=>route.fulfill({json:{today:{visits:124,views:233},summary:{},heatmap}}));
  await page.route(ORIGIN+'/api/admin/ai-usage**',route=>route.fulfill({json:{today:{calls:3,est_tokens:1500},week:{calls:18,est_tokens:9000},month:{calls:74,est_tokens:37000},byDay:Array.from({length:14},(_,i)=>({date:'2026-10-'+String(i+2).padStart(2,'0'),calls:i%5+1})),chart_days:14}}));
  await page.route(ORIGIN+'/api/posts?**',route=>route.fulfill({json:{posts:Array.from({length:8},(_,index)=>({...SYNTHETIC_POST,id:101+index,title:'국제 스카우트 교류와 지역사회 활동으로 함께 배우는 청소년의 성장 이야기 '+(index+1),subtitle:'긴 기사 제목과 부제목, 공개 상태를 전체 내용으로 확인합니다.',views:124+index})),total:8}}));
  await page.route(ORIGIN+'/api/admin/ai-score-history**',route=>route.fulfill({json:{items:Array.from({length:6},(_,i)=>({id:i+1,input_title:'스카우트 지도자와 청소년이 함께 준비하는 지역사회 활동과 국제교류의 의미를 살펴보다 '+i,overall_score:85,overall_grade:'A',actor:'합성 편집자',created_at_kst:'2026-10-15 10:00:00',overall_summary:'평가 요약입니다.',categories:[]})),pagination:{total:6,offset:0,limit:30},stats:{total:6,avg_score:85}}}));
  const measurements=[];
  for(const [panel,section] of destinations){
    await enter(page,panel,section);
    await assertRenderedBounds(page,panel+(section?' '+section:''));
    await expect(page.locator('.v3-panel.active details.v3-content-advanced')).toHaveCount(0);
    if(panel==='dashboard'){await page.locator('#dash-refresh-btn').click();await expect(page.locator('#dash-traffic-heatmap [role="gridcell"]')).toHaveCount(168);await expect(page.locator('#dash-traffic-heatmap')).toBeVisible();}
    if(panel==='list'){
      await expect(page.locator('#list-tbody tr')).toHaveCount(8);
      expect(await page.locator('#list-tbody .v3-table-title').first().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('normal');
      await expect(page.locator('#list-cat')).toHaveValue('all');
      await expect(page.locator('#list-cat option:checked')).toHaveText('전체 카테고리');
      const category=await page.locator('#list-cat option').nth(1).getAttribute('value');
      const filtered=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/posts'&&new URL(request.url()).searchParams.get('category')===category);
      await page.locator('#list-cat').selectOption(category!);await filtered;
      const reset=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/posts'&&!new URL(request.url()).searchParams.has('category'));
      await page.locator('#list-cat').selectOption('all');await reset;
      await expect(page.locator('#list-tbody tr')).toHaveCount(8);
    }
    if(panel==='article-scorer'){await expect(page.locator('#rubric-textarea')).toBeVisible();await expect(page.locator('#rubric-textarea')).toHaveValue('합성 평가 기준');await expect(page.locator('#ai-usage-chart')).toBeVisible();}
    if(panel==='card-news'){await expect(page.locator('.v3-cardnews-row')).toHaveCount(6);await expect(page.locator('.v3-cardnews-title').first()).toContainText('주간 카드뉴스');}
    if(panel==='settings'&&section==='wosm-members'){
      await expect(page.locator('#wosm-public-helper-text')).toBeVisible();
      const counts=await page.locator('#wosm-members-editor .v3-members-head').evaluate(el=>({children:el.children.length,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,display:getComputedStyle(el).display}));if(width>1400)expect(counts.columns).toBe(counts.children);
      const columnActions=page.locator('#wosm-columns-editor .v3-members-actions').first();
      await expect(columnActions.getByRole('button',{name:'위로',exact:true})).toBeVisible();
      expect(await columnActions.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
    }
    if(panel==='memorabilia'&&width<700){await expect(page.locator('#memo-list-select-all')).toBeVisible();await page.locator('#memo-list-select-all').check();await expect(page.locator('#memo-bulk-toolbar')).toBeVisible();await page.locator('#memo-list-select-all').uncheck();}
    measurements.push(await page.locator('.v3-panel.active').evaluate((el,key)=>({key,width:el.getBoundingClientRect().width,scroll:el.scrollWidth,height:el.getBoundingClientRect().height,first:el.children[1]?.getBoundingClientRect().top}),section||panel));
    await page.screenshot({path:`${artifacts}/${width}-${section||panel}.png`});
  }
  expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);expect(controls.writes).toEqual([]);
  writeFileSync(`${artifacts}/${width}-metrics.json`,JSON.stringify(measurements,null,2));
});

test('AI usage chart keeps readable label sizes when its container resizes',async({page})=>{
  const {state,controls}=await open(page);
  if(process.env.ADMIN_LAYOUT_PREVIEW_CSS) await page.addStyleTag({content:readFileSync(process.env.ADMIN_LAYOUT_PREVIEW_CSS,'utf8')});
  await page.route(ORIGIN+'/api/admin/ai-usage**',route=>{
    const params=new URL(route.request().url()).searchParams,start=params.get('start'),end=params.get('end');
    const days=start&&end?Math.round((Date.parse(end)-Date.parse(start))/86400000)+1:Number(params.get('days'))||14;
    const byDay=Array.from({length:days},(_,index)=>({date:start?new Date(Date.parse(start)+index*86400000).toISOString().slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-(days-1-index)*86400000)),calls:index%5+1}));
    return route.fulfill({json:{byDay,chart_days:days,chart_range:start?{mode:'custom',start_kst:start,end_kst:end}:undefined,today:{calls:3},week:{calls:18},month:{calls:74}}});
  });
  await page.setViewportSize({width:280,height:900});await enter(page,'article-scorer');
  const chart=page.locator('#ai-usage-chart');await expect(chart.locator('circle.chart-point')).toHaveCount(14);
  const sizes=[];
  for(const width of [280,390,1920]){
    await page.setViewportSize({width,height:width>1000?1440:900});
    await expect.poll(()=>chart.evaluate(svg=>Math.abs(svg.viewBox.baseVal.width-svg.getBoundingClientRect().width)<1)).toBeTruthy();
    sizes.push(await chart.evaluate((svg,width)=>({width,svgWidth:svg.getBoundingClientRect().width,labels:Array.from(svg.querySelectorAll('text')).map(label=>{const transform=label.getScreenCTM()!,font=parseFloat(getComputedStyle(label).fontSize);return{text:label.textContent,x:font*Math.hypot(transform.a,transform.b),y:font*Math.hypot(transform.c,transform.d)};})}),width));
    await chart.screenshot({path:`${artifacts}/ai-usage-readable-${width}.png`});
  }
  writeFileSync(`${artifacts}/ai-usage-label-metrics.json`,JSON.stringify(sizes,null,2));
  for(const measurement of sizes)for(const label of measurement.labels){expect(label.x,`${measurement.width}px ${label.text} horizontal font`).toBeGreaterThanOrEqual(11.9);expect(label.y,`${measurement.width}px ${label.text} vertical font`).toBeGreaterThanOrEqual(11.9);}
  for(const days of [7,30,90]){
    await page.locator(`[data-ai-usage-range="${days}"]`).click();await expect(chart.locator('circle.chart-point')).toHaveCount(days);await expect(page.locator('#ai-usage-trend-range-label')).toHaveText(`최근 ${days}일`);
  }
  await page.locator('#ai-usage-custom-toggle-btn').click();await page.locator('#ai-usage-custom-start').fill('2026-10-01');await page.locator('#ai-usage-custom-end').fill('2026-10-07');await page.locator('#ai-usage-custom-apply-btn').click();
  await expect(chart.locator('circle.chart-point')).toHaveCount(7);await expect(page.locator('#ai-usage-trend-range-label')).toHaveText('2026-10-01 ~ 2026-10-07 (7일)');
  expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);expect(controls.writes).toEqual([]);
});

const wosmWideFields = [
  ['custom_membership','회원 자격','정식 회원국'], ['custom_note','상태 설명','정식 회원연맹 · 정기 갱신 확인'],
  ['region','지역연맹','Asia-Pacific'], ['official_languages','공식 언어','한국어 · English'],
  ['joined_year','가입 연도','1922'], ['nso_name','회원연맹','합성 스카우트 연맹'],
] as const;

async function openWideWosm(page:Page,role:'owner'|'member'='owner') {
  const fixture=await open(page,role);
  const items=Array.from({length:230},(_,index)=>({country_ko:'합성 국가 '+String(index+1).padStart(3,'0'),country_en:'Example Country '+(index+1),
    extra_fields:Object.fromEntries(wosmWideFields.map(([key,,value])=>[key,value])),sort_order:index}));
  const columns=[{key:'country_names',label:'국가명',type:'country_names',system:true,default_header:''},
    ...wosmWideFields.map(([key,label])=>({key,label,type:'field',system:false,default_header:label}))];
  const saves:any[]=[];let reads=0;
  await page.route(ORIGIN+'/api/settings/wosm-members**',async route=>{
    if(route.request().method()==='GET'){reads++;return route.fulfill({json:{items,columns,registered_count:176,revision:17}});}
    expect(route.request().method()).toBe('PUT');const body=route.request().postDataJSON();saves.push(body);
    return route.fulfill({json:{...body,revision:18}});
  });
  await enter(page,'settings','wosm-members');
  await expect(page.locator('#wosm-members-meta')).toContainText('총 230개 항목');
  return {...fixture,saves,getReads:()=>reads};
}

for(const width of [1465,1920,280]) test(`WOSM six custom columns keep usable editing widths at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:1049});
  const {state,controls,saves,getReads}=await openWideWosm(page);
  const editor=page.locator('#wosm-members-editor'),rows=editor.locator('.v3-members-row');
  await expect(rows).toHaveCount(230);await expect(page.locator('#wosm-columns-editor .v3-members-row')).toHaveCount(7);
  expect(await rows.first().locator('[data-wosm-field]').evaluateAll(fields=>fields.map(field=>field.getAttribute('data-wosm-field')))).toEqual(['country_ko','country_en',...wosmWideFields.map(([key])=>key)]);
  const metrics=await page.evaluate(()=>{
    const records=document.querySelector('.v3-wosm-records')!,workspace=document.querySelector('.v3-wosm-workspace')!,config=workspace.querySelector('section')!,editor=document.querySelector('#wosm-members-editor')!;
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d')!;
    return {records:records.getBoundingClientRect().width,workspace:workspace.getBoundingClientRect().width,recordsBottom:records.getBoundingClientRect().bottom,configTop:config.getBoundingClientRect().top,
      editor:[editor.clientWidth,editor.scrollWidth],fields:Array.from(records.querySelector('.v3-members-row')!.querySelectorAll('input,textarea')).map(field=>{
        const input=field as HTMLInputElement,style=getComputedStyle(input);context.font=style.fontSize+' '+style.fontFamily;
        return {key:input.dataset.wosmField,width:input.getBoundingClientRect().width,font:parseFloat(style.fontSize),height:input.getBoundingClientRect().height,
          value:input.value,textarea:input.tagName==='TEXTAREA',textWidth:context.measureText(input.value).width,available:input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};
      }),configWidths:Array.from(document.querySelectorAll('#wosm-columns-editor input')).map(input=>input.getBoundingClientRect().width)};
  });
  expect(Math.abs(metrics.records-metrics.workspace)).toBeLessThan(1);expect(metrics.configTop).toBeGreaterThan(metrics.recordsBottom+20);
  for(const field of metrics.fields){expect(field.width,field.key).toBeGreaterThanOrEqual(159);expect(field.font).toBeGreaterThanOrEqual(14);expect(field.height).toBeGreaterThanOrEqual(48);
    if(!field.textarea)expect(field.textWidth,field.key+' representative text fits').toBeLessThanOrEqual(field.available+1);
  }
  expect(Math.min(...metrics.configWidths)).toBeGreaterThanOrEqual(140);
  if(width===1465)expect(metrics.editor[1]).toBeGreaterThan(metrics.editor[0]+200);
  if(width===1920||width===280)expect(metrics.editor[1]).toBeLessThanOrEqual(metrics.editor[0]+1);
  expect(await page.locator('.v3-wosm-workspace').evaluate(node=>!!node.querySelector('details'))).toBe(false);
  await assertRenderedBounds(page,'WOSM six custom columns '+width);
  await page.locator('#settings-wosm-members h2').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath(`synthetic-wosm-six-custom-${width}.png`)});
  await page.locator('#wosm-member-nso_name-0').focus();
  if(width===1465)expect(await editor.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
  const lastField=await page.locator('#wosm-member-nso_name-0').boundingBox(),region=await editor.boundingBox();
  expect(lastField!.x).toBeGreaterThanOrEqual(region!.x);expect(lastField!.x+lastField!.width).toBeLessThanOrEqual(region!.x+region!.width+1);
  await page.screenshot({path:testInfo.outputPath(`synthetic-wosm-six-custom-last-field-${width}.png`)});
  await page.locator('#wosm-columns-editor').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath(`synthetic-wosm-column-settings-${width}.png`)});
  writeFileSync(testInfo.outputPath('synthetic-wosm-six-custom-metrics.json'),JSON.stringify(metrics,null,2));
  const reads=getReads();
  await page.locator('#wosm-members-search').fill('합성 국가 230');await expect(rows).toHaveCount(1);
  await page.locator('#wosm-member-custom_membership-229').fill('합성 수정 값');await page.locator('#wosm-members-search').fill('');await expect(rows).toHaveCount(230);
  await expect(page.locator('#wosm-member-custom_membership-229')).toHaveValue('합성 수정 값');
  if(width===1465){
    await page.locator('#wosm-members-add-btn').click();await expect(rows).toHaveCount(231);
    await page.locator('[data-wosm-remove="230"]').click();await expect(rows).toHaveCount(230);
    await page.locator('[data-wosm-column-index="1"][data-wosm-column-move="down"]').click();
    expect(await rows.first().locator('[data-wosm-field]').nth(2).getAttribute('data-wosm-field')).toBe('custom_note');
    await page.locator('[data-wosm-column-index="2"][data-wosm-column-move="up"]').click();
    expect(await rows.first().locator('[data-wosm-field]').nth(2).getAttribute('data-wosm-field')).toBe('custom_membership');
    await page.locator('#wosm-members-save-btn').click();await expect.poll(()=>saves.length).toBe(1);
    expect(saves[0].if_revision).toBe(17);expect(saves[0].items).toHaveLength(230);expect(saves[0].columns).toHaveLength(7);
    expect(saves[0].items[229].extra_fields.custom_membership).toBe('합성 수정 값');
    expect(Object.keys(saves[0].items[229].extra_fields).sort()).toEqual(wosmWideFields.map(([key])=>key).sort());
    await expect(page.locator('#wosm-members-save-btn')).not.toHaveClass(/is-busy/);
  }else expect(saves).toEqual([]);
  expect(getReads()).toBe(reads);expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);expect(controls.writes).toEqual([]);
});

test('WOSM wide editor preserves read-only fields and searchable rows',async({page})=>{
  await page.setViewportSize({width:1465,height:1049});const {state,controls,saves}=await openWideWosm(page,'member');
  await expect(page.locator('#wosm-members-save-btn')).toBeDisabled();await expect(page.locator('#wosm-columns-save-btn')).toBeDisabled();
  expect(await page.locator('#settings-wosm-members').evaluate(section=>Array.from(section.querySelectorAll('input:not([type="search"]),textarea,button')).every(control=>(control as HTMLInputElement).disabled))).toBe(true);
  await page.locator('#wosm-members-search').fill('합성 국가 230');await expect(page.locator('#wosm-members-editor .v3-members-row')).toHaveCount(1);
  await expect(page.locator('#wosm-member-country_ko-229')).toHaveValue('합성 국가 230');
  await assertRenderedBounds(page,'read-only wide WOSM');expect(saves).toEqual([]);expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);expect(controls.writes).toEqual([]);
});

for(const width of [1465,1920,820,390,280])test(`memorabilia long event names and bilingual titles remain readable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1049});const {state,controls}=await open(page);
  const eventName='27th Asia-Pacific Regional Scout Jamboree International Friendship Camp';
  const subtitle='제27회 아시아태평양 지역 잼버리 공식 참가자 패치와 우정의 기념품';
  const tags=['Asia-Pacific','국제 교류','참가자 패치','Jamboree','우정','2027'];
  const items=Array.from({length:24},(_,i)=>({...memo,id:i+1,title_en:'27th Asia-Pacific Regional Scout Jamboree Official Participant Badge '+(i+1),title_ko:subtitle,has_event:1,event_name_en:eventName,event_name_ko:'제27회 아시아태평양 지역 잼버리 국제 우정 캠프',year:2027,category_label_ko:'기념 패치',status:i%2?'public':'draft',tags}));
  await page.route(ORIGIN+'/api/memorabilia?**',route=>route.fulfill({json:{items,total:24}}));await enter(page,'memorabilia');
  const rows=page.locator('[data-memo-row]');await expect(rows).toHaveCount(24);await assertRenderedBounds(page,'memorabilia long bilingual event names');
  const first=rows.first();await expect(first.locator('[data-label]')).toHaveCount(9);await expect(first.locator('[data-label="제목"]')).toContainText(subtitle);await expect(first.locator('[data-label="행사명"] strong')).toHaveText(eventName);await expect(first.locator('.memo-tag-mini')).toHaveText(tags);
  const measured=await first.evaluate(row=>({width:innerWidth,rowWidth:row.getBoundingClientRect().width,height:row.getBoundingClientRect().height,columns:Array.from(row.children).map(cell=>({label:cell.getAttribute('data-label'),width:cell.getBoundingClientRect().width})),bodyOverflow:document.documentElement.scrollWidth-innerWidth}));
  if(width>=1100){
    expect(measured.columns.find(cell=>cell.label==='행사명')!.width).toBeGreaterThanOrEqual(180);expect(measured.columns.find(cell=>cell.label==='제목')!.width).toBeGreaterThanOrEqual(300);
    expect(await page.locator('#memo-list-wrap').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
    for(const [selector,word] of [['[data-label="행사명"] strong','International'],['.memo-tag-mini','Asia-Pacific']]){
      expect(await first.locator(selector).first().evaluate((el,word)=>{const node=el.firstChild!,index=node.textContent!.indexOf(word),range=document.createRange();range.setStart(node,index);range.setEnd(node,index+word.length);return range.getClientRects().length;},word)).toBe(1);
    }
  }
  if(width<700){expect(await first.locator('[data-label="행사명"]').evaluate(el=>getComputedStyle(el).display)).toBe('block');await expect(page.locator('#memo-list-select-all')).toBeVisible();}
  await page.locator('#memo-list-select-all').check();await expect(page.locator('.memo-row-check:checked')).toHaveCount(24);await page.locator('#memo-list-select-all').uncheck();
  writeFileSync(`${artifacts}/memo-columns-${width}.json`,JSON.stringify(measured,null,2));await page.screenshot({path:`${artifacts}/memo-columns-${width}.png`});
  expect(state.pageErrors).toEqual([]);expect(state.externalApi).toEqual([]);expect(controls.writes).toEqual([]);
});
