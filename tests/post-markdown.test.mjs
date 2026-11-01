import assert from 'node:assert/strict';
import { buildPostMarkdownResponse } from '../functions/_shared/post-markdown.js';
import { onRequestGet as llms } from '../functions/llms.txt.js';

const origin = 'https://bpmedia.net';
const postUrl = `${origin}/post/42`;
async function markdown(fields = {}) {
  const response = buildPostMarkdownResponse({
    origin, postUrl,
    post: { id: 42, title: '본문 보존', created_at: '2026-10-21 18:30:00', ...fields },
  });
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  return response.text();
}

const body = await markdown({
  author: '불러오는 중…',
  updated_at: '2026-10-20 01:00:00',
  content: JSON.stringify({ blocks: [
    { type: 'paragraph', data: { text: '자료출처: <a href="https://scout.org/example">공식 원문</a>' } },
    { type: 'list', data: { style: 'ordered', items: [
      { content: '상위 항목', items: [{ content: '하위 항목', items: [{ content: '세 번째 단계' }] }] },
      '다음 항목',
    ] } },
  ] }),
});
assert.match(body, /author: "BP미디어"/);
assert.match(body, /published: 2026-10-21T18:30:00\.000Z/);
assert.match(body, /updated: 2026-10-21T18:30:00\.000Z/);
assert.match(body, /_2026-10-22 · BP미디어_/);
assert.match(body, /1\. 상위 항목\n   1\. 하위 항목\n      1\. 세 번째 단계\n2\. 다음 항목/);
assert.match(body, /자료출처: \[공식 원문\]\(https:\/\/scout\.org\/example\)/);
assert.doesNotMatch(body, /https:\/\/scout\.org\/example"/);

const scheduled = await markdown({ publish_at: '2026-10-22 09:30:00', author: 'Editor A' });
assert.match(scheduled, /published: 2026-10-22T00:30:00\.000Z/);
assert.match(scheduled, /author: "Editor\.A"/);
assert.match(scheduled, /_2026-10-22 · Editor\.A_/);
const invalid = await markdown({ created_at: 'invalid', updated_at: 'invalid' });
assert.doesNotMatch(invalid, /^(?:published|updated):/m);
console.log('PASS article markdown dates, public authors, nested list text and source links');

const discovery = await llms({
  request: new Request(`${origin}/llms.txt`),
  env: { DB: Object.assign(new (class D1Database {})(), { prepare() { return { async all() { return { results: [{ id: 42, title: '[새 소식]', pubdate: '2026-10-22' }] }; } }; } }) },
});
const index = await discovery.text();
assert.ok(index.includes(`- [\\[새 소식\\]](${postUrl})`), 'title brackets cannot break the markdown link');
assert.ok(index.includes(`[편집 정책 원문](${origin}/editorial-policy)`));
assert.doesNotMatch(index, /별도 기록 없이 덮어쓰지 않고|schema.org\/Person/);
console.log('PASS machine discovery links and canonical editorial policy reference');
