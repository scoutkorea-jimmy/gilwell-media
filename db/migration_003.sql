-- Gilwell Media · Migration 003
-- Run against production:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_003.sql

-- Add subtitle column to posts
ALTER TABLE posts ADD COLUMN subtitle TEXT;

-- Add hero setting (stores selected post ID; 0 = none selected)
INSERT OR IGNORE INTO settings (key, value) VALUES ('hero', '0');
