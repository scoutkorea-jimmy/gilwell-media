PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'wosm', 'people', 'glossary')),
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
  id, category, title, content, image_url, image_caption, youtube_url,
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
SET value = json_set(
  CASE
    WHEN json_type(value, '$.categories') IS NULL THEN json_object('common', json('[]'), 'categories', json('{}'))
    ELSE value
  END,
  '$.categories.glossary',
  COALESCE(json_extract(value, '$.categories.glossary'), json('[]'))
)
WHERE key = 'tags';

UPDATE settings
SET value = json_set(
  CASE
    WHEN json_type(value, '$.items') IS NULL THEN json_object('items', json('{}'))
    ELSE value
  END,
  '$.items.glossary',
  COALESCE(json_extract(value, '$.items.glossary'), json('{"event_name":"","event_date":""}'))
)
WHERE key = 'board_banner_events';

UPDATE settings
SET value = json_set(
  CASE
    WHEN json_type(value, '$.pages') IS NULL THEN json_object('pages', json('{}'))
    ELSE value
  END,
  '$.pages.glossary',
  COALESCE(
    json_extract(value, '$.pages.glossary'),
    json('{"title":"스카우트 용어 번역집 · BP미디어","description":"국문·영문·불어 3개 국어 기준의 스카우트 용어 번역집입니다."}')
  )
)
WHERE key = 'site_meta';

PRAGMA foreign_keys = ON;
