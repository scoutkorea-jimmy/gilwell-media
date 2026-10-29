-- Gilwell Media · Migration 068
-- Dreampath calendar recurring event occurrence exclusions.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_068.sql

CREATE TABLE IF NOT EXISTS dp_event_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES dp_events(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  created_by INTEGER REFERENCES dp_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_dp_event_exclusions_event ON dp_event_exclusions(event_id, occurrence_date);
