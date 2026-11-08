import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as page } from '../functions/[[path]].js';
import { onRequest as list } from '../functions/api/calendar/index.js';
import { onRequest as item } from '../functions/api/calendar/[id].js';
import { onRequest as copy } from '../functions/api/settings/calendar-copy.js';
import { onRequest as tags } from '../functions/api/settings/calendar-tags.js';
import { NAV_STRUCTURE, NAV_ITEMS, SITE_PAGE_KEY_BY_PATH } from '../functions/_shared/site-structure.mjs';
import { ADMIN_MENUS } from '../functions/_shared/admin-users.js';

test('retired calendar requests return 410 without reading or mutating any data', async () => {
  const targets = [[page,'/calendar'],[page,'/calendar.html'],[page,'/calendar/'],[list,'/api/calendar'],[item,'/api/calendar/1'],[copy,'/api/settings/calendar-copy'],[tags,'/api/settings/calendar-tags']];
  for (const [handler,path] of targets) for (const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']) {
    const context = { request:new Request('https://synthetic.invalid'+path,{method}), get env(){throw new Error('Archived data must not be accessed');}, next(){throw new Error('Retired routes must not fall through to a 200 SPA');} };
    const response = await handler(context);
    assert.equal(response.status,410,`${method} ${path}`);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-robots-tag'),'noindex');
    if (method === 'HEAD') assert.equal(await response.text(),'');
    else assert.match(await response.text(),/캘린더 기능이 종료되었습니다/);
  }
});

test('public navigation and admin permission catalog no longer offer a calendar', () => {
  assert(!NAV_ITEMS.some(item => item.href === '/calendar'));
  assert(!NAV_STRUCTURE.some(item => item.children?.some(child => child.href === '/calendar')));
  assert.equal(SITE_PAGE_KEY_BY_PATH['/calendar'],undefined);
  assert(!ADMIN_MENUS.flatMap(group => group.items).some(item => item.slug === 'calendar'));
});
