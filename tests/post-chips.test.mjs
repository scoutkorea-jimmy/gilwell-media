// Run: node --import ./tests/register-rust-wasm.mjs tests/post-chips.test.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet } from '../functions/post/[id].js';

for (const category of ['korea', 'apr', 'wosm', 'people']) {
  for (const tag of ['소식, 홍콩연맹, , 행사', null, '<script>bad</script>,A&B']) {
    const post = { id: 440, published: 1, category, title: '칩 검증 기사', tag, meta_tags: '본문태그', content: '기사 본문', created_at: '2026-10-02 00:00:00' };
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE posts(id INTEGER PRIMARY KEY, published INTEGER, category TEXT, title TEXT, tag TEXT, meta_tags TEXT, content TEXT, created_at TEXT, publish_at TEXT, updated_at TEXT, subtitle TEXT, image_url TEXT, image_frame TEXT, image_caption TEXT, views INTEGER, author TEXT, author_user_id INTEGER, special_feature TEXT, featured INTEGER, sort_order INTEGER, related_posts_manual TEXT, manual_related_posts TEXT, gallery_images TEXT, youtube_url TEXT, location_name TEXT, location_address TEXT, ai_assisted INTEGER);
      CREATE TABLE post_likes(post_id INTEGER,liked_at TEXT,viewer_key TEXT);
      CREATE TABLE post_views(post_id INTEGER,viewed_at TEXT,viewer_key TEXT,viewed_bucket TEXT);
      CREATE TABLE post_engagement(post_id INTEGER,engaged_seconds INTEGER,viewer_key TEXT,session_key TEXT,updated_at TEXT);
      CREATE TABLE site_visits(path TEXT,visited_at TEXT,viewer_key TEXT);
      CREATE TABLE admin_users(id INTEGER,display_name TEXT,status TEXT,deleted_at TEXT)`);
    sqlite.prepare('INSERT INTO posts(id,published,category,title,tag,meta_tags,content,created_at) VALUES(?,?,?,?,?,?,?,?)').run(post.id,post.published,post.category,post.title,post.tag,post.meta_tags,post.content,post.created_at);
    const DB = Object.assign(new (class D1Database {})(), { prepare(sql) {
      let args = [];
      return { sql, get args() { return args; }, bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { const result=sqlite.prepare(sql).run(...args); return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}; },
      };
    }, async batch(statements) { return Promise.all(statements.map(statement => statement.run())); } });
    const response = await onRequestGet({ params: { id: '440' }, request: new Request('https://bpmedia.net/post/440', { headers: { 'User-Agent': 'Googlebot' } }), env: { DB } });
    assert.equal(response.status, 200);
    const html = await response.text();
    const meta = html.match(/<div class="post-page-meta">([\s\S]*?)<\/div>/)[1];
    const chips = [...meta.matchAll(/<span class="post-kicker tag-[^"]+-kicker">(.*?)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(chips, tag === null ? [] : tag.startsWith('<') ? ['&lt;script&gt;bad&lt;/script&gt;', 'A&amp;B'] : ['소식', '홍콩연맹', '행사']);
    assert.ok(!meta.includes('<script>bad</script>'));
    assert.ok(!meta.includes('본문태그')); // SEO tags stay below the article.
    assert.ok(html.includes('data-tag="본문태그"'));
    sqlite.close();
  }
}
console.log('PASS: article SSR restores header chips in all 4 categories, skips blanks, escapes HTML and preserves bottom tags');
