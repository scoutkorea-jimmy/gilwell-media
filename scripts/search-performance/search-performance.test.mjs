import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseNaverSearchPerformance } from '../../functions/_shared/naver-search-performance.js';
import { googleReportPeriod, fetchGoogleSearchPerformance } from '../../functions/_shared/google-search-performance.js';
import { validateReport, onRequestGet, onRequestPost } from '../../functions/api/admin/search-performance.js';
import { createToken } from '../../functions/_shared/auth.js';

const pasted = {action:'import-naver',data_through:'2026-10-09',total_clicks:8,row_count:2,complete:true,text:'No\t검색 키워드\t클릭\t노출\tCTR(%)\n1\t\n예시 검색어\n\t3\t3\t100\n2\t예시 검색어 2\t1\t2\t50'};
const report = () => parseNaverSearchPerformance(pasted);

test('Naver paste parser preserves spaces and zero clicks, handles repeated headers and checks completeness', () => {
  assert.equal(validateReport(report()).row_count,2);
  assert.equal(report().rows[0].keyword,'예시 검색어');
  const text='No\t검색 키워드\t클릭\t노출\tCTR(%)\n1\t123\t0\t1,200\t0%\nNo\t검색 키워드\t클릭\t노출\tCTR(%)\n2\t두 번째 검색어\t0\t1\t0.0';
  assert.equal(parseNaverSearchPerformance({...pasted,text}).rows[0].impressions,1200);
  assert.equal(parseNaverSearchPerformance({...pasted,row_count:0,text:''}).rows.length,0);
  for(const change of [{row_count:3},{complete:false},{complete:'true'},{text:text.replace('2\t두','3\t두')},{text:text.replace('1,200','1.2천')},{text:text.replace('0%','101%')}]) assert.throws(()=>parseNaverSearchPerformance({...pasted,...change}));
});
test('report boundary rejects duplicates, invalid counts/site/date, future dates and partial rows', () => {
  for (const change of [{site:'other.net'},{row_count:3},{data_through:'2026-02-30'},{data_through:'2999-01-01'},{total_clicks:1},{period_days:3},{rows:[{keyword:'a',clicks:2,impressions:1},{keyword:'b',clicks:0,impressions:1}]},{rows:[{keyword:'a',clicks:0,impressions:1},{keyword:'a',clicks:0,impressions:1}]}]) assert.throws(()=>validateReport({...report(),...change}));
});
test('Google date range uses Pacific calendar days across KST day and DST boundaries',()=>{
  assert.deepEqual(googleReportPeriod(new Date('2026-10-10T01:00:00Z')),{startDate:'2026-09-09',endDate:'2026-10-06'});
  assert.deepEqual(googleReportPeriod(new Date('2026-03-09T01:00:00Z')),{startDate:'2026-02-06',endDate:'2026-03-05'});
});

const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']);
const der=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
const account={type:'service_account',client_email:'test@isolated.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(der).toString('base64')+'\n-----END PRIVATE KEY-----'};
const apiEnv={GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON:JSON.stringify(account)};
function mockGoogleFetch(pages,totalClicks=13){
  let queries=0;
  return async(url,options)=>{
    assert.equal(options.redirect,'manual');
    if(url==='https://oauth2.googleapis.com/token'){
      const assertion=options.body.get('assertion');const parts=assertion.split('.');
      const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
      assert.equal(claims.scope,'https://www.googleapis.com/auth/webmasters.readonly');
      assert.equal(claims.aud,url);assert.equal(claims.exp-claims.iat,3600);
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts.slice(0,2).join('.'))),true);
      return Response.json({access_token:'isolated-test-access-token'});
    }
    assert.equal(url,'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Abpmedia.net/searchAnalytics/query');
    assert.equal(options.headers.Authorization,'Bearer isolated-test-access-token');
    const query=JSON.parse(options.body);assert.equal(query.dataState,'final');assert.equal(query.type,'web');assert.equal(query.aggregationType,'byProperty');
    if(!query.dimensions)return Response.json({rows:[{clicks:totalClicks}]});
    assert.equal(query.startRow,queries*5000);return Response.json({rows:pages[queries++]||[]});
  };
}
test('Google server signs read-only JWT and fetches every API page without exposing private credentials', async()=>{
  const original=globalThis.fetch;
  try{
    const rows=Array.from({length:5001},(_,i)=>({keys:['sample '+i],clicks:0,impressions:1}));
    globalThis.fetch=mockGoogleFetch([rows.slice(0,5000),rows.slice(5000)]);
    const result=validateReport(await fetchGoogleSearchPerformance(apiEnv));
    assert.equal(result.row_count,5001);assert.equal(result.total_clicks,13);assert.equal(result.source,'google_api');
    assert.equal(JSON.stringify(result).includes('PRIVATE KEY'),false);
    globalThis.fetch=mockGoogleFetch([[],],0);
    assert.equal((await fetchGoogleSearchPerformance(apiEnv)).row_count,0);
    await assert.rejects(fetchGoogleSearchPerformance({}),/연결 설정/);
    await assert.rejects(fetchGoogleSearchPerformance({GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON:'invalid'}),/설정이 올바르지/);
    globalThis.fetch=async()=>Response.json({error:'secret should not escape'},{status:403});
    await assert.rejects(fetchGoogleSearchPerformance(apiEnv),error=>error.message.includes('권한')&&!error.message.includes('secret'));
    globalThis.fetch=mockGoogleFetch([rows.slice(0,5000),rows.slice(0,5000),rows.slice(0,1)]);
    await assert.rejects(fetchGoogleSearchPerformance(apiEnv),/한도/);
  }finally{globalThis.fetch=original;}
});

const sql = new DatabaseSync(':memory:');
sql.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE api_rate_limit(bucket_key TEXT PRIMARY KEY,count INTEGER,window_start_at INTEGER)');
let failBatch=false;
const DB={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};},async run(){return{meta:sql.prepare(query).run(...this.args)};}};},async batch(statements){if(failBatch)throw new Error('isolated DB failure');sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const env={DB,ADMIN_SECRET:'isolated-test-only-secret'};
const owner=await createToken(env.ADMIN_SECRET,'full');const member=await createToken(env.ADMIN_SECRET,'member');
const request=(token,body,type='application/json')=>new Request('https://bpmedia.net/api/admin/search-performance',{method:body===undefined?'GET':'POST',headers:{...(token?{Cookie:`admin_token=${token}`} : {}),'Content-Type':type},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
test('API gates, bounded input, history/stale/DB failure preservation and independent Google sync',async()=>{
  for(const handler of [onRequestGet,onRequestPost]){
    assert.equal((await handler({env,request:request(null,handler===onRequestPost?pasted:undefined)})).status,401);
    assert.equal((await handler({env,request:request(member,handler===onRequestPost?pasted:undefined)})).status,403);
  }
  for(const [body,type,status] of [[pasted,'text/plain',415],['x'.repeat(1024*1024+1),'application/json',413],['{','application/json',400],[report(),'application/json',400],[{action:'fetch-google'},'application/json',503]]) assert.equal((await onRequestPost({env,request:request(owner,body,type)})).status,status);
  assert.equal((await onRequestPost({env,request:request(owner,pasted)})).status,200);
  const first=sql.prepare('SELECT value FROM settings').get().value;
  assert.equal((await onRequestPost({env,request:request(owner,{...pasted,data_through:'2026-10-08'})})).status,409);
  assert.equal(sql.prepare('SELECT value FROM settings').get().value,first);
  assert.equal((await onRequestPost({env,request:request(owner,{...pasted,row_count:3})})).status,400);
  assert.equal((await onRequestPost({env,request:request(owner,{...pasted,total_clicks:14})})).status,200);
  assert.equal(sql.prepare('SELECT value FROM settings_history').get().value,first);
  const latest=sql.prepare('SELECT value FROM settings').get().value;failBatch=true;
  assert.equal((await onRequestPost({env,request:request(owner,{...pasted,total_clicks:15})})).status,500);
  assert.equal(sql.prepare('SELECT value FROM settings').get().value,latest);failBatch=false;
  const original=globalThis.fetch;
  try{
    globalThis.fetch=mockGoogleFetch([[{keys:['sample'],clicks:1,impressions:2}]],13);
    assert.equal((await onRequestPost({env:{...env,...apiEnv},request:request(owner,{action:'fetch-google'})})).status,200);
    globalThis.fetch=async()=>Response.json({error:'test'},{status:403});
    assert.equal((await onRequestPost({env:{...env,...apiEnv},request:request(owner,{action:'fetch-google'})})).status,502);
  }finally{globalThis.fetch=original;}
  assert.equal(sql.prepare('SELECT value FROM settings WHERE key=?').get('search_performance_naver').value,latest);
  const res=await onRequestGet({env,request:request(owner)});assert.equal(res.headers.get('Cache-Control'),'no-store');
  const data=await res.json();assert.equal(data.reports.length,2);assert.equal(data.google_configured,false);
});
test('Admin renderer escapes hostile terms and clamps pagination/filters', () => {
  const js=readFileSync(new URL('../../public/js/admin-v3.js',import.meta.url),'utf8');
  const source=js.slice(js.indexOf('  var _searchPerformanceReports ='),js.indexOf('  var _tagInsightsCache ='));
  const nodes=new Map();
  const context={document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',disabled:false});return nodes.get(id);}},GW:{escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}};
  vm.createContext(context);vm.runInContext(source,context);
  context._searchPerformanceReports=[{engine:'google',rows:Array.from({length:51},(_,i)=>({keyword:i===0?'<img src=x onerror=alert(1)>':`word ${i}`,clicks:1,impressions:2}))}];
  vm.runInContext('_renderSearchPerformanceRows()',context);
  assert.match(nodes.get('search-performance-rows').innerHTML,/&lt;img/);
  assert.equal(nodes.get('search-performance-next').disabled,false);
  vm.runInContext('_searchPerformancePage=99;_renderSearchPerformanceRows()',context);
  assert.match(nodes.get('search-performance-page').textContent,/2 \/ 2/);
  nodes.get('search-performance-query').value='missing';vm.runInContext('_renderSearchPerformanceRows()',context);
  assert.match(nodes.get('search-performance-rows').innerHTML,/조건에 맞는/);
});
