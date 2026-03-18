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
  category     TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'wosm', 'people', 'glossary')),
  title        TEXT    NOT NULL,
  content      TEXT    NOT NULL DEFAULT '',
  image_url    TEXT,
  image_caption TEXT,
  gallery_images TEXT,
  youtube_url  TEXT,
  location_name TEXT,
  location_address TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  publish_at   TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  featured     INTEGER NOT NULL DEFAULT 0,
  tag          TEXT,
  special_feature TEXT,
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

CREATE TABLE IF NOT EXISTS settings_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  action     TEXT    NOT NULL DEFAULT 'update',
  summary    TEXT,
  snapshot   TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
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
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  visited_bucket TEXT,
  visited_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket     TEXT    NOT NULL CHECK(bucket IN ('가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하')),
  term_ko    TEXT    NOT NULL,
  term_en    TEXT    NOT NULL,
  term_fr    TEXT    NOT NULL,
  description_ko TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_publish_at ON posts (publish_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published);
CREATE INDEX IF NOT EXISTS idx_posts_special_feature ON posts (category, special_feature, publish_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts (featured);
CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts (sort_order);
CREATE INDEX IF NOT EXISTS idx_pv_post_time ON post_views(post_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_post_history_post_time ON post_history(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_time ON post_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_pv_viewer_post ON post_views(viewer_key, post_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_unique_bucket ON post_views(post_id, viewer_key, viewed_bucket);
CREATE INDEX IF NOT EXISTS idx_pl_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_sv_time ON site_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_path_time ON site_visits(path, visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_viewer_path_time ON site_visits(viewer_key, path, visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_referrer_host ON site_visits(referrer_host);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sv_unique_bucket ON site_visits(viewer_key, path, visited_bucket);
CREATE INDEX IF NOT EXISTS idx_glossary_bucket_sort ON glossary_terms(bucket, sort_order, term_ko);

INSERT OR IGNORE INTO settings (key, value) VALUES (
  'ticker',
  '["길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다","한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다","The BP Post · bpmedia.net"]'
);
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'tags',
  '{"common":["소식","공지","행사","보고","특집","단독","속보"],"categories":{"korea":[],"apr":[],"wosm":[],"people":[],"glossary":[]}}'
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('hero', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('hero_interval', '3000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('board_card_gap', '6');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'board_banner_events',
  '{"items":{"korea":{"event_name":"","event_date":""},"apr":{"event_name":"","event_date":""},"wosm":{"event_name":"","event_date":""},"people":{"event_name":"","event_date":""},"glossary":{"event_name":"","event_date":""}}}'
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('translations', '{}');
INSERT OR IGNORE INTO settings (key, value) VALUES ('author_name', 'Editor.A');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_disclaimer', '본 글은 AI의 도움을 받아 작성되었습니다.');
INSERT OR IGNORE INTO settings (key, value) VALUES ('contributors', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('editors', '{}');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'site_meta',
  '{"pages":{"home":{"title":"BP미디어 · bpmedia.net","description":"BP미디어는 전 세계 스카우트 소식과 활동을 기록하고 공유하는 독립 미디어 아카이브입니다. 한국스카우트연맹과 세계스카우트연맹 공식 채널이 아닌 자발적 스카우트 네트워크로 운영됩니다."},"korea":{"title":"Korea · BP미디어","description":"한국스카우트연맹 관련 소식을 전합니다."},"apr":{"title":"APR · BP미디어","description":"아시아태평양 지역 스카우트 소식을 전합니다."},"wosm":{"title":"WOSM · BP미디어","description":"세계스카우트연맹 관련 소식을 전합니다."},"people":{"title":"스카우트 인물 · BP미디어","description":"국내외 스카우트 인물을 조명하는 공간입니다."},"glossary":{"title":"스카우트 용어집 · BP미디어","description":"국문·영문·불어 3개 국어 기준의 스카우트 용어집입니다."},"contributors":{"title":"도움을 주신 분들 · BP미디어","description":"BP미디어 운영에 도움을 주신 분들을 소개합니다."},"search":{"title":"검색 · BP미디어","description":"BP미디어 기사와 페이지를 검색합니다."}},"footer":{"raw_text":"","title":"BP미디어","description":"BP미디어는 스카우트 네트워크의 자발적인 봉사로 운영됩니다.","domain_label":"bpmedia.net","tip_email":"story@bpmedia.net","contact_email":"info@bpmedia.net"},"image_url":null,"google_verification":"","naver_verification":""}'
);
