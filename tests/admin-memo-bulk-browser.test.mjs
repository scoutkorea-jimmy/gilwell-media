import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('memorabilia bulk actions handle archived categories and search failures', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = (await readFile('public/admin.html', 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await page.setContent(html);
    await page.evaluate(() => {
      window.AccountAdmin = { currentMe: () => ({ role: 'owner' }) };
      window.messages = [];
      window.GW = { toast: (message, options) => window.messages.push({ message, kind: options.kind }) };
      window.confirm = () => true;
      window.failed = true;
      window.fetch = async (url) => {
        let data;
        if (url.startsWith('/api/memorabilia/categories')) data = { items: [{ id: 1, label_ko: '활성', label_en: 'Active', archived: 0 }, { id: 2, label_ko: '보관', label_en: 'Archived', archived: 1 }] };
        else if (url === '/api/memorabilia/bulk-update') data = { updated: 1, skipped: 0, errors: [], fts_failed: window.failed ? [1] : [] };
        else if (url === '/api/memorabilia/bulk-replace') data = { dry_run: false, total_changed: 1, results: [{ table: 'memorabilia', field: 'issuer_ko', changed: 1 }], fts_failed: window.failed ? [1] : [] };
        else if (url.startsWith('/api/memorabilia?')) data = { items: [{ id: 1, title_ko: '테스트', status: 'draft' }], total: 1 };
        else throw new Error(`Unexpected request: ${url}`);
        return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
      };
    });
    await page.addScriptTag({ path: resolve('public/js/admin-memorabilia.js') });
    await page.evaluate(() => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      document.dispatchEvent(new CustomEvent('gw:admin-panel-shown', { detail: { panel: 'memorabilia' } }));
    });
    await page.waitForSelector('[data-memo-check="1"]', { state: 'attached' });
    const click = selector => page.$eval(selector, element => element.click());
    for (const failed of [true, false]) {
      await page.evaluate(value => { window.failed = value; }, failed);
      await click('[data-memo-check="1"]');
      await click('#memo-bulk-edit-open');
      assert.equal(await page.$eval('#memo-bulkedit-modal', el => el.hidden), false);
      assert.deepEqual(await page.$$eval('#memo-bulkedit-category option', options => options.map(option => option.value)), ['', '1']);
      await click('[data-bulk-toggle="status"]');
      await click('#memo-bulkedit-apply');
      await page.waitForFunction(count => window.messages.length >= count, failed ? 1 : 2);
      const message = await page.evaluate(() => window.messages.at(-1));
      assert.equal(message.kind, failed ? 'error' : 'success');
      assert.equal(message.message.includes('검색 반영 실패 1건'), failed);
      await page.waitForFunction(() => document.querySelector('#memo-bulkedit-modal').hidden);
      await page.waitForFunction(() => !document.querySelector('#memo-bulk-edit-open'));
    }
    await click('#memo-bulk-rule-add');
    await page.$eval('[data-bulk-find="0"]', el => { el.value = '전'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    for (const failed of [true, false]) {
      await page.evaluate(value => { window.failed = value; }, failed);
      await click('#memo-bulk-manual-apply');
      await page.waitForFunction(() => !document.querySelector('#memo-bulk-result-modal').hidden);
      const result = await page.$eval('#memo-bulk-result-summary', el => el.textContent);
      assert.equal(result.includes('검색 반영 실패 1건'), failed);
      assert.equal(result.includes('일부 검색 결과는 최신 변경을 반영하지 못했습니다.'), failed);
      await click('#memo-bulk-result-ok');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('event editor preserves typed input when the loaded record becomes stale',async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:900}});
    const html=(await readFile('public/admin.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    await page.setContent(html);
    await page.evaluate(()=>{
      window.AccountAdmin={currentMe:()=>({role:'owner'})};window.messages=[];
      window.GW={toast:(message,options)=>window.messages.push({message,kind:options.kind})};window.confirm=()=>true;
      window.remoteEvent={id:7,slug:'synthetic',name_en:'Original',name_ko:'기존 행사',category_id:null,start_year:2026,start_month:8,start_day:null,end_year:null,end_month:null,end_day:null,description_en:'',description_ko:'',archived:0,usage_count:0};
      window.patchBodies=[];
      const fields=['name_en','name_ko','category_id','start_year','start_month','start_day','end_year','end_month','end_day','description_en','description_ko','archived'];
      window.fetch=async(url,options={})=>{
        let body,status=200;
        if(url.startsWith('/api/memorabilia/event-categories')) body={items:[]};
        else if(url.startsWith('/api/memorabilia/events?')) body={items:[window.remoteEvent]};
        else if(url==='/api/memorabilia/events/7' && options.method==='PATCH') {
          const request=JSON.parse(options.body);window.patchBodies.push(request);
          if(JSON.stringify(request.expected_snapshot)!==JSON.stringify(fields.map(key=>window.remoteEvent[key]??null))) {status=409;body={error:'version_mismatch',details:['다른 운영자가 행사를 변경했습니다. 입력을 복사해 둔 후 창을 닫고 최신 내용을 확인해주세요.']};}
          else {window.remoteEvent.name_ko=request.name_ko;body={ok:true};}
        } else throw new Error('Unexpected request: '+url);
        return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
      };
    });
    await page.addScriptTag({path:resolve('public/js/admin-memorabilia.js')});
    await page.evaluate(()=>{document.dispatchEvent(new Event('DOMContentLoaded'));document.dispatchEvent(new CustomEvent('gw:admin-panel-shown',{detail:{panel:'memorabilia-events'}}));});
    await page.waitForSelector('[data-ev-edit="7"]',{state:'attached'});
    const click=selector=>page.$eval(selector,element=>element.click());
    await click('[data-ev-edit="7"]');
    await page.$eval('#memo-ev-name-ko',el=>{el.value='내가 입력한 행사';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.evaluate(()=>{window.remoteEvent.name_ko='먼저 저장된 행사';});
    await click('#memo-ev-edit-save');
    await page.waitForFunction(()=>window.messages.some(item=>item.message.includes('다른 운영자가')));
    assert.equal(await page.$eval('#memo-ev-edit-modal',el=>el.hidden),false);
    assert.equal(await page.$eval('#memo-ev-name-ko',el=>el.value),'내가 입력한 행사');
    assert.equal(await page.evaluate(()=>window.remoteEvent.name_ko),'먼저 저장된 행사');
    assert.equal(await page.evaluate(()=>window.patchBodies[0].expected_snapshot[1]),'기존 행사');
    assert.equal(await page.$eval('#memo-ev-edit-save',el=>el.disabled),false);
    await click('#memo-ev-edit-cancel');
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('gw:admin-panel-shown',{detail:{panel:'memorabilia-events'}})));
    await page.waitForFunction(()=>document.querySelector('#memo-ev-list-wrap')?.textContent.includes('먼저 저장된 행사'));
    await click('[data-ev-edit="7"]');
    await page.$eval('#memo-ev-name-ko',el=>{el.value='최신 편집';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await click('#memo-ev-edit-save');
    await page.waitForFunction(()=>document.querySelector('#memo-ev-edit-modal').hidden);
    assert.equal(await page.evaluate(()=>window.remoteEvent.name_ko),'최신 편집');
    assert.equal(await page.evaluate(()=>window.patchBodies[1].expected_snapshot[1]),'먼저 저장된 행사');
  } finally {await browser.close();}
});
