PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'wosm', 'people')),
  title         TEXT    NOT NULL,
  content       TEXT    NOT NULL DEFAULT '',
  image_url     TEXT,
  image_caption TEXT,
  youtube_url   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  featured      INTEGER NOT NULL DEFAULT 0,
  tag           TEXT,
  subtitle      TEXT,
  meta_tags     TEXT,
  published     INTEGER NOT NULL DEFAULT 1,
  views         INTEGER NOT NULL DEFAULT 0,
  author        TEXT    NOT NULL DEFAULT 'Editor.A',
  ai_assisted   INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER DEFAULT NULL
);

INSERT INTO posts_new (
  id, category, title, content, image_url, image_caption, youtube_url,
  created_at, updated_at, featured, tag, subtitle, meta_tags,
  published, views, author, ai_assisted, sort_order
)
SELECT
  id,
  CASE WHEN category = 'worm' THEN 'wosm' ELSE category END,
  title, content, image_url, image_caption, youtube_url,
  created_at, updated_at, featured, tag, subtitle, meta_tags,
  published, views, author, ai_assisted, sort_order
FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts (featured);
CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts (sort_order);

UPDATE settings
SET value = replace(value, '"worm"', '"wosm"')
WHERE key IN ('tags', 'board_banner_events', 'site_meta');

UPDATE settings
SET value = replace(
  replace(
    replace(
      replace(
        replace(value, 'nav.worm', 'nav.wosm'),
        'board.worm.', 'board.wosm.'
      ),
      'link.worm', 'link.wosm'
    ),
    'stat.worm', 'stat.wosm'
  ),
  '/worm.html', '/wosm.html'
)
WHERE key = 'translations';

PRAGMA foreign_keys = ON;
