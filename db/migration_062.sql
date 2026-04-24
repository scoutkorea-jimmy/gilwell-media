-- Gilwell Media · Migration 062
-- Dreampath post drafts + minutes approver notifications.
--
-- 1) dp_post_drafts — scratch pad per (user, board). API enforces a 3-row
--    cap per pair (owner 2026-04-24 spec) so a user can't accidentally fill
--    storage with forgotten drafts.
-- 2) dp_notifications — lightweight in-app notification feed. For now only
--    used by the Minutes flow ("Author X asked you to review minute Y")
--    but shaped generically so future alerts slot in.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_062.sql

CREATE TABLE IF NOT EXISTS dp_post_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  board TEXT NOT NULL,
  tab_slug TEXT,
  title TEXT,
  content TEXT,
  files TEXT,           -- JSON: [{url,name,type,size,is_image}]
  approvers TEXT,       -- JSON: array of display_names (minutes only)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dp_post_drafts_user_board
  ON dp_post_drafts(user_id, board, updated_at DESC);

CREATE TABLE IF NOT EXISTS dp_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,     -- recipient (dp_users.id)
  kind TEXT NOT NULL,           -- 'minutes_review' etc. — free-form for now
  title TEXT NOT NULL,
  body TEXT,
  ref_type TEXT,                -- 'post' | 'task' | ...
  ref_id INTEGER,               -- post_id when kind='minutes_review'
  actor_name TEXT,              -- who triggered this (display_name)
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dp_notifications_user
  ON dp_notifications(user_id, read_at, created_at DESC);
