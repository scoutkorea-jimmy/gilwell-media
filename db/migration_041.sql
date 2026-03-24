-- Dreampath: departments + event edit history

CREATE TABLE IF NOT EXISTS dp_departments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO dp_departments (name, sort_order) VALUES
  ('Management', 1), ('Development', 2), ('Design', 3),
  ('Marketing', 4), ('Operations', 5), ('Finance', 6), ('Legal', 7);

CREATE TABLE IF NOT EXISTS dp_event_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL REFERENCES dp_events(id) ON DELETE CASCADE,
  editor_name      TEXT    NOT NULL DEFAULT 'Unknown',
  prev_title       TEXT,
  prev_description TEXT,
  prev_start_date  TEXT,
  prev_end_date    TEXT,
  prev_type        TEXT,
  edit_note        TEXT    NOT NULL,
  edited_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_departments_order ON dp_departments(sort_order);
CREATE INDEX IF NOT EXISTS idx_dp_event_history_event ON dp_event_history(event_id, edited_at DESC);
