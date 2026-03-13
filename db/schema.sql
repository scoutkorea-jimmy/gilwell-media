-- Gilwell Media · D1 Database Schema
-- Snapshot of the CURRENT schema for fresh installs.
--
-- Fresh database:
--   wrangler d1 execute gilwell-posts --file=./db/schema.sql
--
-- Existing legacy database:
--   apply only the missing migration_*.sql files instead of re-running this
--   snapshot file against production.

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'worm')),
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

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_views (
  post_id   INTEGER NOT NULL,
  viewed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts (featured);
CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts (sort_order);
CREATE INDEX IF NOT EXISTS idx_pv_post_time ON post_views(post_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_pv_time ON post_views(viewed_at);

INSERT OR IGNORE INTO settings (key, value) VALUES (
  'ticker',
  '["길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다","한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다","The BP Post · bpmedia.net"]'
);
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'tags',
  '{"common":["소식","공지","행사","보고","특집","단독","속보"],"categories":{"korea":[],"apr":[],"worm":[]}}'
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('hero', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('translations', '{}');
INSERT OR IGNORE INTO settings (key, value) VALUES ('author_name', 'Editor.A');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_disclaimer', '본 글은 AI의 도움을 받아 작성되었습니다.');
INSERT OR IGNORE INTO settings (key, value) VALUES ('contributors', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('editors', '{}');
