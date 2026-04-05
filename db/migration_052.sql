-- Gilwell Media · Migration 052
-- Replies table for board posts and notes
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_052.sql

CREATE TABLE IF NOT EXISTS dp_replies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type TEXT    NOT NULL CHECK(parent_type IN ('post', 'note')),
  parent_id   INTEGER NOT NULL,
  content     TEXT    NOT NULL,
  author_id   INTEGER REFERENCES dp_users(id) ON DELETE SET NULL,
  author_name TEXT    NOT NULL DEFAULT 'Unknown',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_replies_parent ON dp_replies(parent_type, parent_id, created_at ASC);
