-- Dreampath: per-post file attachments and edit history

CREATE TABLE IF NOT EXISTS dp_post_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES dp_board_posts(id) ON DELETE CASCADE,
  file_url   TEXT    NOT NULL,
  file_name  TEXT    NOT NULL,
  file_type  TEXT    NOT NULL DEFAULT 'application/octet-stream',
  file_size  INTEGER NOT NULL DEFAULT 0,
  is_image   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_post_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES dp_board_posts(id) ON DELETE CASCADE,
  editor_name  TEXT    NOT NULL DEFAULT 'Unknown',
  prev_title   TEXT,
  prev_content TEXT,
  edit_note    TEXT,
  edited_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_post_files_post ON dp_post_files(post_id);
CREATE INDEX IF NOT EXISTS idx_dp_post_history_post ON dp_post_history(post_id, edited_at DESC);
