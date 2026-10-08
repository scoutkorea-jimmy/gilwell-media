// Run: node tests/scout-topics.test.mjs (SQL executes against Python's SQLite).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { SCOUT_TOPICS, onRequestGet, onRequestHead, renderTopicLinks } from '../functions/topics/[slug].js';
import { onRequestGet as sitemap } from '../functions/sitemap.xml/index.js';

const rows = [
  { id: 1, title: '컵 스카우트 캠프', content: '', published: 1, image_url: 'https://example.org/a.jpg', image_frame: '{"x":30,"y":70}' },
  { id: 2, title: '지역 소식', content: 'Venture Scouts 활동', published: 1 },
  { id: 3, title: '로버무트 안내', content: '', published: 1 },
  { id: 4, title: '컵스카우트 비공개 초안', content: '', published: 0 },
  { id: 5, title: '컵스카우트 <script>evil</script>', content: '', published: 1, image_url: 'data:image/png;base64,AA' },
  { id: 6, title: '컵스카우트 최신 기사', content: '', published: 1 },
  { id: 7, title: 'Venture Scouts 초안', content: '', published: 0 },
].map(row => ({ ...row, created_at: '2026-09-01 01:00:00', publish_at: row.id === 6 ? '2026-10-01 10:00:00' : null }));

function database(data = rows) {
  return { prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() { return null; },
      async all() {
        const result = spawnSync('python3', ['-c', `
import sqlite3,json,sys
data=json.load(sys.stdin)
db=sqlite3.connect(':memory:'); db.row_factory=sqlite3.Row
db.executescript('CREATE TABLE posts(id INTEGER, title TEXT, content TEXT, published INTEGER, image_url TEXT, image_frame TEXT, subtitle TEXT, tag TEXT, meta_tags TEXT, category TEXT, special_feature TEXT, created_at TEXT, publish_at TEXT, updated_at TEXT); CREATE TABLE glossary_terms(created_at TEXT, updated_at TEXT);')
for row in data['rows']:
 db.execute('INSERT INTO posts ('+','.join(row)+') VALUES ('+','.join('?' for _ in row)+')',list(row.values()))
print(json.dumps([dict(row) for row in db.execute(data['sql'],data['params'])]))
`], { input: JSON.stringify({ sql, params, rows: data }), encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return { results: JSON.parse(result.stdout) };
      },
    };
  } };
}
function context(slug, db = database()) {
  return { params: { slug }, request: new Request(`https://bpmedia.net/topics/${slug}`), env: { DB: db } };
}

const ages = { 'cub-scouts': '6~12세', scouts: '12~15세', 'venture-scouts': '15~18세', 'rover-scouts': '18~24세' };
for (const topic of SCOUT_TOPICS) {
  const response = await onRequestGet(context(topic.slug));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(`<h1 id="topic-title">${topic.name}</h1>`));
  assert.ok(html.includes(`<link rel="canonical" href="https://bpmedia.net/topics/${topic.slug}"`));
  assert.ok(html.includes('index,follow'));
  assert.ok(html.includes(ages[topic.slug]));
  assert.equal((html.match(/class="topic-stage-card"/g)||[]).length,4);
  assert.equal((html.match(/class="topic-activity-card"/g)||[]).length,3);
  assert.ok(html.includes('활동의 분위기를 담은 AI 일러스트'));
  assert.ok(html.includes(`/img/topics/${topic.slug}.webp`));
  assert.ok(html.includes('class="masthead"') && html.includes('data-managed-nav'));
  assert.ok(html.includes('GW.bootstrapStandardPage()'));
  assert.ok(html.indexOf('/css/topics.css') < html.indexOf('/css/m3-site.css'));
  assert.ok(html.includes('연령은 부문별 소개의 안내 기준'));
  assert.ok(html.includes('확인일 2026년 10월 8일'));
  assert.ok(!html.includes('/post/4') && !html.includes('/post/7'));
  assert.ok(html.includes(`href="/topics/${topic.slug}" aria-current="page"`));
  for (const script of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(script[1]);
  if (topic.slug === 'cub-scouts') {
    assert.ok(html.includes('/post/1')); // spaced Korean name
    assert.ok(html.includes('src="https://example.org/a.jpg"'));
    assert.ok(html.includes('object-position:30% 70%'));
    assert.ok(html.includes('https://bpmedia.net/api/posts/5/image'));
    assert.ok(!html.includes('src="data:image'));
    assert.ok(html.includes('&lt;script&gt;evil&lt;/script&gt;'));
    assert.ok(!html.includes('<script>evil</script>'));
    assert.ok(html.indexOf('/post/6') < html.indexOf('/post/1'));
    assert.ok(html.includes('2026년 10월 1일'));
  }
  if (topic.slug === 'venture-scouts') assert.ok(html.includes('/post/2')); // English name in content
  if (topic.slug === 'rover-scouts') assert.ok(html.includes('/post/3')); // event alias
  const head = await onRequestHead(context(topic.slug));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
}
assert.equal((await onRequestGet(context('not-a-topic'))).status, 404);
assert.equal((await onRequestGet(context('__proto__'))).status, 404);
assert.ok((await (await onRequestGet(context('cub-scouts', database([])))).text()).includes('아직 관련 기사가 없습니다'));
const brokenDB = { prepare() { throw new Error('test database unavailable'); } };
const originalError = console.error;
console.error = () => {};
try {
  const failed = await onRequestGet(context('cub-scouts', brokenDB));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
} finally { console.error = originalError; }
assert.ok(renderTopicLinks('컵 스카우트 이야기').includes('/topics/cub-scouts'));
assert.ok(!renderTopicLinks('컵 스카우트 이야기').includes('/topics/rover-scouts'));
const sitemapResponse = await sitemap({ request: new Request('https://bpmedia.net/sitemap.xml'), env: { DB: database() } });
assert.match(sitemapResponse.headers.get('content-type'), /^application\/xml/);
const xml = await sitemapResponse.text();
assert.ok(xml.includes('<loc>https://bpmedia.net/post/1</loc>'));
assert.ok(!xml.includes('<loc>https://bpmedia.net/post/4</loc>'));
assert.ok(!/<html|<!doctype html/i.test(xml));
for (const topic of SCOUT_TOPICS) {
  assert.ok(xml.includes(`<loc>https://bpmedia.net/topics/${topic.slug}</loc>`));
  for (const file of ['public/index.html', 'public/glossary.html']) assert.ok(readFileSync(file, 'utf8').includes(`/topics/${topic.slug}`));
}
console.log('PASS: four topic pages, real SQLite matching, published-only filtering, escaping, dates, HEAD/404/503, internal links and sitemap');
