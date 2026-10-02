// Run: node tests/post-chips.test.mjs
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/post/[id].js';

for (const category of ['korea', 'apr', 'wosm', 'people']) {
  for (const tag of ['소식, 홍콩연맹, , 행사', null, '<script>bad</script>,A&B']) {
    const post = { id: 440, published: 1, category, title: '칩 검증 기사', tag, meta_tags: '본문태그', content: '기사 본문', created_at: '2026-10-02 00:00:00' };
    const DB = { prepare(sql) { return {
      bind() { return this; },
      async first() { return sql.includes('SELECT * FROM posts') ? post : sql.includes('COUNT(*)') ? { count: 0 } : { value: '{}' }; },
      async all() { return { results: [] }; },
    }; } };
    const response = await onRequestGet({ params: { id: '440' }, request: new Request('https://bpmedia.net/post/440', { headers: { 'User-Agent': 'Googlebot' } }), env: { DB } });
    assert.equal(response.status, 200);
    const html = await response.text();
    const meta = html.match(/<div class="post-page-meta">([\s\S]*?)<\/div>/)[1];
    const chips = [...meta.matchAll(/<span class="post-kicker tag-[^"]+-kicker">(.*?)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(chips, tag === null ? [] : tag.startsWith('<') ? ['&lt;script&gt;bad&lt;/script&gt;', 'A&amp;B'] : ['소식', '홍콩연맹', '행사']);
    assert.ok(!meta.includes('<script>bad</script>'));
    assert.ok(!meta.includes('본문태그')); // SEO tags stay below the article.
    assert.ok(html.includes('data-tag="본문태그"'));
  }
}
console.log('PASS: article SSR restores header chips in all 4 categories, skips blanks, escapes HTML and preserves bottom tags');
