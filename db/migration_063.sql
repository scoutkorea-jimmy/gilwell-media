-- Gilwell Media · Migration 063
-- dp_notifications schema alignment.
--
-- Background: an earlier (never-used) feature left a dp_notifications table
-- with a different shape (source_key/message/link_post_id/is_read columns).
-- Migration 062's CREATE TABLE IF NOT EXISTS therefore no-op'd, and the
-- Minutes-approver notification writes in posts.js / notifications.js were
-- hitting the old schema and 500-ing. There's only one stale row in the
-- table so the safest path is to drop + recreate with the intended shape.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_063.sql

DROP TABLE IF EXISTS dp_notifications;

CREATE TABLE dp_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,           -- 'minutes_review' etc.
  title TEXT NOT NULL,
  body TEXT,
  ref_type TEXT,                -- 'post' | 'task' | ...
  ref_id INTEGER,
  actor_name TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dp_notifications_user
  ON dp_notifications(user_id, read_at, created_at DESC);
