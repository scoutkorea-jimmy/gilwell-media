-- Gilwell Media · Migration 054
-- Add parent_id for nested comments (replies to comments)
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_054.sql

ALTER TABLE dp_post_comments ADD COLUMN parent_id INTEGER REFERENCES dp_post_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_dp_comments_parent ON dp_post_comments(parent_id);
