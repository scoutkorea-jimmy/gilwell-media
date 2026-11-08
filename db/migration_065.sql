-- Gilwell Media · Migration 065
-- Dreampath PMO decision log.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_065.sql

CREATE TABLE IF NOT EXISTS dp_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  decision TEXT NOT NULL,
  context TEXT,
  impact TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  decided_by TEXT NOT NULL DEFAULT 'Anonymous',
  decision_date TEXT NOT NULL DEFAULT (date('now')),
  next_review_date TEXT,
  related_post_id INTEGER REFERENCES dp_board_posts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_decisions_status ON dp_decisions(status, decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_dp_decisions_post ON dp_decisions(related_post_id);
