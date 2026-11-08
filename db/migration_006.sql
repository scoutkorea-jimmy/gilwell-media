-- Migration 006: published flag + view tracking
ALTER TABLE posts ADD COLUMN published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN views     INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS post_views (
  post_id   INTEGER NOT NULL,
  viewed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pv_post_time ON post_views(post_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_pv_time ON post_views(viewed_at);
