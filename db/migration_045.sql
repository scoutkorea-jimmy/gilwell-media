CREATE TABLE IF NOT EXISTS operational_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT NOT NULL DEFAULT 'site',
  type       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'info',
  actor      TEXT,
  ip         TEXT,
  path       TEXT,
  message    TEXT,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operational_events_time
  ON operational_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_events_level_type
  ON operational_events(level, type, created_at DESC);
