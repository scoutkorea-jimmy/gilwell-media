-- Gilwell Media · Migration 002
-- Run against production:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_002.sql

-- Add tag (글머리) column to posts
ALTER TABLE posts ADD COLUMN tag TEXT;

-- Default tags (글머리 목록)
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'tags',
  '["소식","공지","행사","보고","특집","단독","속보"]'
);
