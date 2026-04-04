CREATE TABLE IF NOT EXISTS post_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  action     TEXT    NOT NULL DEFAULT 'update',
  summary    TEXT,
  snapshot   TEXT,
  before_snapshot TEXT,
  after_snapshot TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_post_history_post_time ON post_history(post_id, created_at DESC);
