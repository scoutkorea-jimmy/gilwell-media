-- Gilwell Media · Migration 001
-- Run against production:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_001.sql

-- Add featured flag to posts
ALTER TABLE posts ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

-- Settings key-value store
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default ticker items (JSON array of strings)
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'ticker',
  '["길웰 미디어는 스카우트 운동의 소식을 기록하는 미디어입니다","한국스카우트연맹 및 세계스카우트연맹 소식을 전합니다","The BP Post · bpmedia.net"]'
);
