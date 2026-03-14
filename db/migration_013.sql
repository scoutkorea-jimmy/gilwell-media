PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'wosm', 'people')),
  title        TEXT    NOT NULL,
  content      TEXT    NOT NULL DEFAULT '',
  image_url    TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  featured     INTEGER NOT NULL DEFAULT 0,
  tag          TEXT,
  subtitle     TEXT,
  meta_tags    TEXT,
  published    INTEGER NOT NULL DEFAULT 1,
  views        INTEGER NOT NULL DEFAULT 0,
  author       TEXT    NOT NULL DEFAULT 'Editor.A',
  ai_assisted  INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER DEFAULT NULL
);

INSERT INTO posts_new (
  id, category, title, content, image_url, created_at, updated_at,
  featured, tag, subtitle, meta_tags, published, views, author, ai_assisted, sort_order
)
SELECT
  id, category, title, content, image_url, created_at, updated_at,
  featured, tag, subtitle, meta_tags, published, views, author, ai_assisted, sort_order
FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts (featured);
CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts (sort_order);

PRAGMA foreign_keys = ON;
