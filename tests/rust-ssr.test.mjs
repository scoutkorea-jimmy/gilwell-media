import './register-rust-wasm.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { loadPublicPage as actual, renderPagination, pageHref, escapeText } from '../functions/_shared/public-page-ssr.js';
import { loadPublicPage as original } from './fixtures/rust-public-page-ssr.js';
import { renderMiniList, miniInput, renderHomeLeadStory, leadInput, renderHomeParts, resolveCanonical } from '../functions/[[path]].js';
import { queryRust } from '../functions/_shared/rust-server.js';
import { getNavLabel } from '../functions/_shared/nav-labels.js';
import { buildShareMetaBlock, buildShareMetaBlockRust } from '../functions/_shared/site-meta.js';
import { renderShell, renderShellRust } from '../functions/card-news/[id].js';
import { SCOUT_TOPICS, renderTopicNews, renderTopicNewsRust, buildTopicArticleList, renderTopicShell, renderTopicShellRust, renderTopicPageRust } from '../functions/topics/[slug].js';
import { renderFeatureLead, renderFeatureCard, renderFeatureRailItem, renderFeaturePartsRust, renderFeatureShellRust, renderFeaturePageRust } from '../functions/feature/[category]/[slug].js';

function fixture(fail=false) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE glossary_terms(id INTEGER,bucket TEXT,sort_order INTEGER,term_ko TEXT,term_en TEXT,term_fr TEXT,description_ko TEXT);
    INSERT INTO glossary_terms VALUES(2,'나',0,'나무','Tree','','<설명> & 안전'),(1,'가',0,'가족','','Family','내용');
    CREATE TABLE posts(id INTEGER,title TEXT,published INTEGER);
    INSERT INTO posts VALUES(1,'공개',1),(2,'비공개',0);
    CREATE TABLE calendar_events(title TEXT,start_at TEXT,end_at TEXT,location_name TEXT,related_post_id INTEGER);
    INSERT INTO calendar_events VALUES('<행사>','2026-01-02',NULL,'서울 & 경기',1),('비공개 연결','2026-01-01','2026-01-03','장소',2);
    CREATE TABLE memorabilia(id INTEGER,slug TEXT,title_ko TEXT,title_en TEXT,status TEXT,published_at TEXT,updated_at TEXT);
    INSERT INTO memorabilia VALUES(1,'한글 slug','<안전>','Safety','public','2026-01-01',NULL),(2,'hidden','비공개','','draft','2026-01-02',NULL),(3,'',NULL,'English','public','2026-01-03',NULL)`);
  const DB=Object.assign(new (class D1Database {})(),{prepare(sql){return {async all(){if(fail) throw new Error('synthetic DB failure');return {results:sqlite.prepare(sql).all()};}};}});
  return {sqlite,env:{DB}};
}

test('Rust card news shell matches legacy output and protects script contents',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  for(const edit of [true,false]) for(const title of ['', '제목 <script> & "@@DATA@@"', '\ud800']) {
    const options={id:123,title,data:{embed:!edit,text:'</script><script>unsafe</script>',surrogate:'\ud800'},v:'1.2.3',edit};
    let called=false;
    const actual=await renderShellRust(options,context,async (...args)=>{called=true;const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(actual,renderShell(options));
    assert.equal(called,title !== '\ud800');
    assert.ok(!actual.includes('</script><script>unsafe</script>'));
    assert.equal(await renderShellRust(options,context,async()=>new Response('',{status:503})),renderShell(options));
  }
});

test('Rust topic news matches legacy cards and safely falls back',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  const fixtures=[[],[{id:1,title:'</script><script>안전</script>',subtitle:'<부제>',image_url:'data:image/png;base64,AA',image_frame:'{"x":30,"y":70}',publish_at:'2026-10-01 10:00:00'}, {id:2,title:'두 번째',subtitle:[],image_url:'https://synthetic.invalid/x?a=1&b=2',created_at:'bad date'}, {id:3,title:'이미지 없음',image_url:'javascript:alert(1)'}, {id:4,title:null}, {id:5}]];
  for(const posts of fixtures) {
    let called=false;
    const result=await renderTopicNewsRust(posts,'https://synthetic.invalid','주제 <안전>',context,async (...args)=>{called=true;const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(called,true);
    assert.equal(result.html,renderTopicNews(posts,'https://synthetic.invalid'));
    assert.equal(result.articleList,buildTopicArticleList(posts,'https://synthetic.invalid','주제 <안전>'));
    assert.doesNotThrow(()=>JSON.parse(result.articleList));
    assert(!result.articleList.includes('</script>'));
    assert.deepEqual(await renderTopicNewsRust(posts,'https://synthetic.invalid','주제 <안전>',context,async()=>new Response('',{status:503})),result);
  }
  let called=false;
  const unusual=[{id:1,title:'\ud800'}];
  assert.deepEqual(await renderTopicNewsRust(unusual,'https://synthetic.invalid','주제',context,async()=>{called=true;throw new Error('unexpected');}),{html:renderTopicNews(unusual,'https://synthetic.invalid'),articleList:buildTopicArticleList(unusual,'https://synthetic.invalid','주제')});
  assert.equal(called,false);
  const legacy=[{id:6,title:{toJSON:key=>key,toString:()=>'<legacy>'}}];
  assert.deepEqual(await renderTopicNewsRust(legacy,'https://synthetic.invalid','주제',context,async()=>{throw new Error('unexpected');}),{html:renderTopicNews(legacy,'https://synthetic.invalid'),articleList:buildTopicArticleList(legacy,'https://synthetic.invalid','주제')});
});

test('Rust topic page shell matches all existing topics and fallback',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  for(const topic of SCOUT_TOPICS) {
    const options={topic,title:'<제목> & "@@META@@"',meta:'<meta name="test" content="@@TITLE@@">',articleList:'{"test":"\\u003c/script>"}',news:'<article>합성 기사</article>'};
    let called=false;
    const result=await renderTopicShellRust(options,context,async (...args)=>{called=true;const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(called,true);assert.equal(result,renderTopicShell(options));
    assert.equal(await renderTopicShellRust(options,context,async()=>new Response('',{status:503})),result);
  }
});

test('combined Rust topic page uses one invocation and matches separate rendering',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  for(const topic of SCOUT_TOPICS) for(const posts of [[],[{id:1,title:'</script><b>기사</b>',subtitle:'내용',created_at:'2026-01-01'}]]) {
    const options={topic,posts,origin:'https://synthetic.invalid',title:'주제 <기사>',meta:'<meta name="x" content="@@NEWS@@">'};
    const expected=renderTopicShell({...options,news:renderTopicNews(posts,options.origin),articleList:buildTopicArticleList(posts,options.origin,topic.name)});
    let calls=0;
    const value=await renderTopicPageRust(options,context,async (...args)=>{calls++;const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(calls,1);assert.equal(value,expected);
    assert.equal(await renderTopicPageRust(options,context,async()=>new Response('',{status:503})),expected);
  }
});

test('Rust feature stories and rail match legacy output and fallback',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  const items=[{id:1,title:'<기사> & "안전"',subtitle:'<부제>',image_url:'/img/a.png',tag:'<태그>',author:'기자 &',publish_at:'2026-01-02'}, {id:2,title:'둘째',content:'<b>텍스트</b> & 내용',created_at:'bad date'}, {id:3,title:'셋째',subtitle:[],image_url:'https://synthetic.invalid/a?x=1&y=2'}];
  for(const category of [{label:'<분야>',color:'#123456'},{label:'',color:'bad'}]) {
    const expected={lead:renderFeatureLead(items[0],category,'https://synthetic.invalid'),cards:items.slice(1).map(item=>renderFeatureCard(item,category,'https://synthetic.invalid')).join(''),rail:items.map((item,index)=>renderFeatureRailItem(item,index===0)).join('')};
    let called=false;
    const result=await renderFeaturePartsRust(items,category,'https://synthetic.invalid',context,async (...args)=>{called=true;const response=await queryRust(...args);assert.equal(response.ok,true);return response;});
    assert.equal(called,true);assert.deepEqual(result,expected);
    assert.deepEqual(await renderFeaturePartsRust(items,category,'https://synthetic.invalid',context,async()=>new Response('',{status:503})),expected);
  }
  let called=false;
  const unusual=[{id:1,title:'\ud800'}],category={label:'분야',color:'#123'};
  await renderFeaturePartsRust(unusual,category,'https://synthetic.invalid',context,async()=>{called=true;throw new Error('unexpected');});
  assert.equal(called,false);
});

test('Rust feature shell inserts values once and uses fallback on failure',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  const template=readFileSync(new URL('../server-rust/src/feature_shell.html',import.meta.url),'utf8');
  const values=Array.from({length:32},(_,i)=>`value-${i}-@@31@@`);
  const expected=template.replace(/@@(\d+)@@/g,(_,i)=>values[Number(i)]);
  let called=false;
  assert.equal(await renderFeatureShellRust(values,()=>{throw new Error('unexpected fallback');},context,async (...args)=>{called=true;const response=await queryRust(...args);assert.equal(response.ok,true);return response;}),expected);
  assert.equal(called,true);
  assert.equal(await renderFeatureShellRust(values,()=>'fallback',context,async()=>new Response('',{status:503})),'fallback');
  called=false;
  assert.equal(await renderFeatureShellRust(['\ud800'],()=>'fallback',context,async()=>{called=true;throw new Error('unexpected');}),'fallback');
  assert.equal(called,false);
});

test('combined Rust feature page matches separate rendering in one invocation',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}}, category={label:'<분야>',color:'#123456'}, origin='https://synthetic.invalid';
  for(const items of [[{id:1,title:'<기사>'}],[{id:1,title:'<기사>'},{id:2,title:'둘째',subtitle:'부제',image_url:'/test.png'}]]) {
    const values=Array.from({length:32},(_,i)=>`value-${i}-@@27@@`);
    const parts=await renderFeaturePartsRust(items,category,origin,context);
    const separate=values.slice();separate[25]=parts.lead;separate[26]=parts.cards?`<div class="feature-page-grid">${parts.cards}</div>`:'';separate[27]=parts.rail;
    const expected=await renderFeatureShellRust(separate,()=>{throw new Error('unexpected');},context);
    let calls=0;
    assert.equal(await renderFeaturePageRust(items,category,origin,values,()=>{throw new Error('unexpected');},context,async (...args)=>{calls++;const response=await queryRust(...args);assert.equal(response.ok,true);return response;}),expected);
    assert.equal(calls,1);
    assert.equal(await renderFeaturePageRust(items,category,origin,values,()=>'fallback',context,async()=>new Response('',{status:503})),'fallback');
  }
});

test('Rust canonical paths and page titles preserve legacy output and failure fallback',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  const fail=async()=>new Response('',{status:503});
  for(const [path,key,page] of [['/','home',1],['/index.html','home',1],['/korea.html','korea',1],['/korea','korea',2],['/latest','latest',100000],['/memorabilia/abc','memorabilia',4],['/wosm-members.html','wosm_members',2],['/privacy.html','privacy',1],['/search','search',2],['/foo','other',3],...['apr','wosm','people','glossary','calendar','contributors','about','editorial_policy','jamboree16'].map(key=>['/'+key,key,1])]) {
    const expected=await resolveCanonical(context,path,key,page,'제목 & 안전',fail);
    const actual=await resolveCanonical(context,path,key,page,'제목 & 안전');
    assert.deepEqual(actual,expected);
    const meta={pageKey:key,title:'제목 <안전>',description:'설명 & 본문',url:'https://synthetic.invalid'+actual.path,imageUrl:'https://synthetic.invalid/image.png',itemListElements:[{url:'https://synthetic.invalid/post/1',title:'<기사>'}]};
    assert.equal(buildShareMetaBlock({...meta,descriptor:actual.descriptor}),buildShareMetaBlock(meta));
    assert.deepEqual(await resolveCanonical(context,path,key,page,'제목 & 안전',async()=>Response.json({})),expected);
  }
  let called=false;
  const value=await resolveCanonical(context,'/korea','korea',2,'\ud800',async()=>{called=true;throw new Error('unexpected');});
  assert.equal(called,false);assert.equal(value.title.charCodeAt(0),0xd800);
});

test('Rust share meta rendering matches legacy HTML and safely falls back',async()=>{
  const context={env:{},request:{url:'https://synthetic.invalid/'}};
  for(const pageKey of ['home','latest','korea','apr','wosm','people','search','glossary','memorabilia','wosm_members','calendar','contributors','about','editorial_policy','jamboree16','topics','privacy']) for(const imageUrl of ['', 'https://synthetic.invalid/img/og-default.png?x=1','https://synthetic.invalid/picture.webp','https://synthetic.invalid/x.jpeg','data:image/png;base64,abc','data:image/','data:image/;x','   ']) {
    const options={pageKey,title:'제목 <안전> & "확인"',description:'</script> & 설명',url:'https://synthetic.invalid/?x=1&y=2',imageUrl,googleVerification:'<검증>',naverVerification:'test',itemListElements:[{url:'https://synthetic.invalid/post/1',title:'<기사>'}]};
    const expected=buildShareMetaBlock(options);
    let rendered=false;
    assert.equal(await buildShareMetaBlockRust(options,context,async (...args)=>{const result=await queryRust(...args);assert.equal(result.ok,true);rendered=true;return result;}),expected);
    assert.equal(rendered,true);
    for(const match of expected.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) assert.doesNotThrow(()=>JSON.parse(match[1]));
    for(const fail of [async()=>new Response('',{status:503}),async()=>Response.json({})]) assert.equal(await buildShareMetaBlockRust(options,context,fail),expected);
  }
  for(const options of [{pageKey:'home'}, {pageKey:'latest',itemListElements:[{}, {url:null,title:'<기사>'}]}, {pageKey:'search',url:'',description:'',title:''}]) {
    let rendered=false;
    assert.equal(await buildShareMetaBlockRust(options,context,async (...args)=>{const result=await queryRust(...args);assert.equal(result.ok,true);rendered=true;return result;}),buildShareMetaBlock(options));
    assert.equal(rendered,true);
  }
  const item={url:'/post/1',title:'기사'};item.extra=item;
  const circular={pageKey:'home',itemListElements:[item]};
  assert.equal(await buildShareMetaBlockRust(circular,context),buildShareMetaBlock(circular));
  const unusual={pageKey:'home',title:'\ud800',description:'설명',url:'https://synthetic.invalid/'};
  let called=false;assert.equal(await buildShareMetaBlockRust(unusual,context,async()=>{called=true;throw new Error('unexpected');}),buildShareMetaBlock(unusual));assert.equal(called,false);
});

test('public SSR preserves escaping, ordering and public-only links and records',async()=>{
  for(const key of ['glossary','calendar','memorabilia']) {
    const before=fixture(),after=fixture();
    try {
      const url=new URL('https://synthetic.invalid/'+key);
      const prior=await original(before.env,url,key),next=await actual(after.env,url,key);
      assert.deepEqual(next,prior,key);
      const text=Object.values(next.parts).join('');
      if(key==='calendar') {assert.match(text,/&lt;행사&gt;/);assert.doesNotMatch(text,/href="\/post\/2"/);}
      if(key==='memorabilia') {assert.match(text,/%ED%95%9C%EA%B8%80%20slug/);assert.doesNotMatch(text,/비공개/);}
      if(key==='glossary') assert.match(text,/&lt;설명&gt; &amp; 안전/);
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('public SSR reports D1 failures to the existing page fallback',async()=>{
  for(const key of ['glossary','calendar','memorabilia']) {
    const f=fixture(true);
    try {await assert.rejects(actual(f.env,new URL('https://synthetic.invalid/'+key),key));}
    finally {f.sqlite.close();}
  }
});


test('public SSR preserves empty-state output',async()=>{
  for(const [key,table] of [['glossary','glossary_terms'],['calendar','calendar_events'],['memorabilia','memorabilia']]) {
    const before=fixture(),after=fixture();
    try {
      for(const f of [before,after]) f.sqlite.exec(`DELETE FROM ${table}`);
      const url=new URL('https://synthetic.invalid/'+key);
      assert.deepEqual(await actual(after.env,url,key),await original(before.env,url,key));
    } finally {before.sqlite.close();after.sqlite.close();}
  }
});

test('Rust home SSR mini lists preserve HTML escaping, dates, tags and empty output',async()=>{
  const f=fixture();
  try {
    const posts=[
      {id:1,title:'<기사> & "안전"',category:'korea',tag:'한국,가나다,<script>',image_url:'https://example.invalid/?a=1&b="x"',created_at:'2026-01-01T18:30:00Z'},
      {id:2,title:'English',category:'apr',tag:'',image_url:'https://example.invalid/logo.png',image_is_placeholder:true,publish_at:'invalid'},
      {id:3,title:'',category:'other',tag:'',image_url:'',created_at:''},
      {id:4,title:'태그',category:'evil"<&',tag:'<img>, &태그, 가나다',image_url:'',created_at:'2026-02-01'},
      {id:5,title:'정렬',category:'korea',tag:' 나, Apple,가, apple, \ufeff다\ufeff,가,A',image_url:'',created_at:'2026-02-01'},
      {id:6,title:'세계',category:'wosm',tag:'',image_url:'',created_at:'2026-02-01'},
      {id:7,title:'인물',category:'people',tag:'',image_url:'',created_at:'2026-02-01'},
      {id:8,title:'시간 경계',category:'korea',created_at:'2026-01-01T15:30:00Z'},
      {id:9,title:'시간대',category:'korea',publish_at:'2026-06-01T22:20:00-04:00'},
      {id:10,title:'구형 날짜',category:'korea',created_at:'1988-06-01 14:00:00'},
    ];
    const nav={korea:{ko:'한국 <소식> &'},apr:{ko:'Asia Pacific'}};
    const sections={full:miniInput(posts,nav,{}),hidden:miniInput(posts,nav,{hideCategoryChip:true}),empty:miniInput([],nav,{})};
    const categoryLabels=Object.fromEntries(['korea','apr','wosm','people'].map(key=>[key,String(getNavLabel(nav,key,'ko') || '')]));
    const expected={full:renderMiniList(posts,nav,{}),hidden:renderMiniList(posts,nav,{hideCategoryChip:true}),empty:renderMiniList([],nav,{})};
    for (const lead of [null,{...posts[0],subtitle:' 부제 <안전> ',author:'작성자 &',content:'본문 <b>내용</b>'},{...posts[1],content:'가'.repeat(218)+'😀끝'},{...posts[4],content:'텍스트'},{...posts[3],content:'본문'}, {...posts[0],content:JSON.stringify({blocks:[{data:{text:'첫째 <b>둘째</b>'}},{data:{items:['셋',null,{content:'x'}]}}]})}, {...posts[0],content:'<script>hidden</script>',subtitle:' 부제 '}, {...posts[0],content:'{broken "blocks" <p>본문</p>'}]) {
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'home-ssr-minis',{sections,categoryLabels,leadCandidates:[leadInput(lead,nav)]});
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{...expected,lead:renderHomeLeadStory(lead,nav).toWellFormed(),heroPreloadUrl:lead?.image_url && !lead.image_is_placeholder ? lead.image_url : ''});
    }
  } finally {f.sqlite.close();}
});

test('Rust home SSR selects lead fallback, preload and popular fallback',async()=>{
  const f=fixture();
  try {
    const nav={};
    const posts=Array.from({length:5},(_,i)=>({id:i+1,title:'기사 '+i,category:'korea',content:'본문',image_url:'https://example.invalid/'+i}));
    const sections={latest:miniInput(posts,nav,{}),popular:[],picks:miniInput(posts.slice(2),nav,{})};
    const categoryLabels=Object.fromEntries(['korea','apr','wosm','people'].map(key=>[key,String(getNavLabel(nav,key,'ko') || '')]));
    const candidates=[null,leadInput(posts[2],nav),leadInput(posts[0],nav)];
    const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/'}},'home-ssr-minis',{sections,categoryLabels,leadCandidates:candidates});
    assert.equal(response.status,200);
    const output=await response.json();
    assert.equal(output.latest,renderMiniList(posts.slice(0,3),nav,{}));
    assert.equal(output.popular,renderMiniList(posts.slice(0,4),nav,{}));
    assert.equal(output.picks,renderMiniList(posts.slice(2,6),nav,{}));
    assert.equal(output.lead,renderHomeLeadStory(posts[2],nav));
    assert.equal(output.heroPreloadUrl,posts[2].image_url);
  } finally {f.sqlite.close();}
});

test('home SSR preserves loaded articles when Rust rendering fails',async()=>{
  const f=fixture();
  try {
    const post={id:1,title:'<합성 기사>',category:'korea',tag:'나,가',image_url:'https://example.invalid/image',content:'가'.repeat(218)+'😀끝',created_at:'2026-01-01T15:30:00Z'};
    const data={lead:null,latest:[post],popular:[],picks:[post],korea:[post],apr:[],wosm:[],people:[]};
    const normal=await renderHomeParts(f.env,{},data);
    for (const fail of [async()=>new Response('',{status:500}),async()=>{throw new Error('synthetic failure')},async()=>new Response('{}',{status:200})]) {
      const fallback=await renderHomeParts(f.env,{},data,fail);
      assert.deepEqual(fallback,normal);
      assert(fallback.latest.includes('&lt;합성 기사&gt;'));
      assert(fallback.lead.includes('가'.repeat(218)+'�…'));
    }
  } finally {f.sqlite.close();}
});


test('Rust board SSR preserves card escaping, empty state, and pagination links',async()=>{
  const f=fixture();
  try {
    const url=new URL('https://synthetic.invalid/korea?page=3&tag=%ED%95%9C%EA%B8%80&sort=popular');
    const posts=[{id:1,title:'<기사> & "안전"',subtitle:'부제 <script>'},{id:2,title:null,subtitle:''}];
    for (const [rows,page,total] of [[posts,3,10],[[],1,0],[posts,1,1],[posts,10,10]]) {
      const response=await queryRust({env:f.env,request:{url:url.href}},'public-board-render',{posts:rows,page,total_pages:total,url:url.href});
      const result=await response.json();
      const expected=rows.map(post=>`<article class="post-card no-thumb"><div class="post-card-body"><div class="post-card-head"><h3><a class="post-card-title-link" href="/post/${Number(post.id)}">${escapeText(post.title)}</a></h3></div>${post.subtitle ? `<p class="post-card-subtitle">${escapeText(post.subtitle)}</p>` : ''}</div></article>`).join('') || '<p class="board-empty">해당 조건의 기사가 없습니다.</p>';
      assert.equal(result.board,expected);
      assert.equal(result.pagination,renderPagination(url,page,total));
      for (const suffix of ['?page=3&page=7&q=a%20b&x=~', '?q=%ED%95%9C%EA%B8%80&empty=&q=2', '?page=3&bad=%FF&plus=a+b', '?', '?page=3']) {
        const varied=new URL('https://synthetic.invalid/korea'+suffix);
        const check=await queryRust({env:f.env,request:{url:varied.href}},'public-board-render',{posts:rows,page,total_pages:total,url:varied.href});
        assert.equal((await check.json()).pagination,renderPagination(varied,page,total),suffix);
      }
    }
  } finally {f.sqlite.close();}
});


test('Rust privacy SSR preserves escaped text and removes script and style content',async()=>{
  const f=fixture();
  try {
    for (const html of ['', '<h2>제목 &amp; 소개</h2><p>개인 <b>정보</b> & 안전</p>', '<SCRIPT type="text/javascript">alert(1)</SCRIPT><style>hidden</style><p>&lt;img&gt;</p>', '<p>  첫째  </p>\n\n<li> 둘째 \uFEFF</li>', '<p>미완성 태그 <bad> 내용']) {
      const text=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:p|h[1-6]|li)>/gi,'\n').replace(/<[^>]*>/g,'');
      const expected='<h1>개인정보처리방침</h1>'+text.split(/\n+/).filter(s=>s.trim()).map(s=>`<p>${escapeText(s.trim())}</p>`).join('');
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/privacy'}},'privacy-render',{html});
      assert.equal((await response.json()).privacy,expected);
    }
  } finally {f.sqlite.close();}
});


test('Rust members SSR preserves table, cards, fallback fields and escaping',async()=>{
  const f=fixture();
  try {
    const columns=[{key:'country_names',label:'국가 <이름>'},{key:'membership_category',label:'분류 & 종류'},{key:'region',label:'지역'}];
    const rows=[{country_ko:'한국 <안전>',country_en:'Korea & Republic',country_fr:'',membership_category:'',extra_fields:{region:'<아시아>',membership_category:'회원'}},{country_ko:'',country_en:'English',country_fr:'Français',extra_fields:{}}];
    for (const data of [{rows,columns},{rows:[],columns},{rows,columns:[]}]) {
      const valueFor=(row,column)=>column.key==='country_names'?[row.country_ko,row.country_en,row.country_fr].filter(Boolean).join(' · '):row[column.key]||row.extra_fields?.[column.key]||'—';
      const expected={membersCount:`${data.rows.length}개 회원 연맹`,membersHead:'<tr>'+data.columns.map(c=>`<th scope="col">${escapeText(c.label)}</th>`).join('')+'</tr>',members:data.rows.map(row=>'<tr>'+data.columns.map(c=>`<td>${escapeText(valueFor(row,c))}</td>`).join('')+'</tr>').join(''),membersCards:data.rows.map(row=>`<article class="members-card"><h2>${escapeText(row.country_ko||row.country_en)}</h2><dl>${data.columns.filter(c=>c.key!=='country_names').map(c=>`<dt>${escapeText(c.label)}</dt><dd>${escapeText(valueFor(row,c))}</dd>`).join('')}</dl></article>`).join('')};
      const response=await queryRust({env:f.env,request:{url:'https://synthetic.invalid/wosm-members'}},'members-render',data);
      assert.deepEqual(await response.json(),expected);
    }
  } finally {f.sqlite.close();}
});
