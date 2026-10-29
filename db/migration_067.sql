-- Gilwell Media · Migration 067
-- Dreampath PMO risk / issue register.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_067.sql

CREATE TABLE IF NOT EXISTS dp_risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'risk',
  status TEXT NOT NULL DEFAULT 'open',
  probability TEXT NOT NULL DEFAULT 'medium',
  impact TEXT NOT NULL DEFAULT 'medium',
  severity TEXT NOT NULL DEFAULT 'medium',
  owner TEXT,
  mitigation TEXT,
  due_date TEXT,
  related_post_id INTEGER REFERENCES dp_board_posts(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL DEFAULT 'Anonymous',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_risks_status ON dp_risks(status, severity, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dp_risks_post ON dp_risks(related_post_id);
