CREATE TABLE IF NOT EXISTS settings_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
