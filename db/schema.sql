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
  category     TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'worm', 'people')),
  title        TEXT    NOT NULL,
  content      TEXT    NOT NULL DEFAULT '',
  image_url    TEXT,
  image_caption TEXT,
  youtube_url  TEXT,
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
  viewer_key TEXT,
  viewed_bucket TEXT,
  viewed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    INTEGER NOT NULL,
  viewer_key TEXT    NOT NULL,
  liked_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, viewer_key)
);

CREATE TABLE IF NOT EXISTS site_visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer_key    TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  referrer_host TEXT    NOT NULL DEFAULT 'direct',
  referrer_url  TEXT,
  visited_bucket TEXT,
  visited_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts (featured);
CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts (sort_order);
CREATE INDEX IF NOT EXISTS idx_pv_post_time ON post_views(post_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_pv_time ON post_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_pv_viewer_post ON post_views(viewer_key, post_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_unique_bucket ON post_views(post_id, viewer_key, viewed_bucket);
CREATE INDEX IF NOT EXISTS idx_pl_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_sv_time ON site_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_path_time ON site_visits(path, visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_viewer_path_time ON site_visits(viewer_key, path, visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_referrer_host ON site_visits(referrer_host);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sv_unique_bucket ON site_visits(viewer_key, path, visited_bucket);

INSERT OR IGNORE INTO settings (key, value) VALUES (
  'ticker',
  '["길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다","한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다","The BP Post · bpmedia.net"]'
);
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'tags',
  '{"common":["소식","공지","행사","보고","특집","단독","속보"],"categories":{"korea":[],"apr":[],"worm":[],"people":[]}}'
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('hero', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('hero_interval', '3000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('board_card_gap', '6');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'board_banner_events',
  '{"items":{"korea":{"event_name":"","event_date":""},"apr":{"event_name":"","event_date":""},"worm":{"event_name":"","event_date":""},"people":{"event_name":"","event_date":""}}}'
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('translations', '{}');
INSERT OR IGNORE INTO settings (key, value) VALUES ('author_name', 'Editor.A');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_disclaimer', '본 글은 AI의 도움을 받아 작성되었습니다.');
INSERT OR IGNORE INTO settings (key, value) VALUES ('contributors', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('editors', '{}');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'site_meta',
  '{"pages":{"home":{"title":"BP미디어 · bpmedia.net","description":"스카우트 운동의 소식을 기록하는 독립 미디어입니다."},"korea":{"title":"Korea · BP미디어","description":"한국스카우트연맹 관련 소식을 전합니다."},"apr":{"title":"APR · BP미디어","description":"아시아태평양 지역 스카우트 소식을 전합니다."},"worm":{"title":"WOSM · BP미디어","description":"세계스카우트연맹 관련 소식을 전합니다."},"people":{"title":"스카우트 인물 · BP미디어","description":"국내외 스카우트 인물을 조명하는 공간입니다."},"contributors":{"title":"도움을 주신 분들 · BP미디어","description":"BP미디어 운영에 도움을 주신 분들을 소개합니다."},"search":{"title":"검색 · BP미디어","description":"BP미디어 기사와 페이지를 검색합니다."}},"image_url":null,"google_verification":"","naver_verification":""}'
);
