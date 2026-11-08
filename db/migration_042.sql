-- Dreampath: Post comments

CREATE TABLE IF NOT EXISTS dp_post_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES dp_board_posts(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES dp_users(id) ON DELETE CASCADE,
  author_name TEXT    NOT NULL DEFAULT 'Unknown',
  content     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_comments_post ON dp_post_comments(post_id, created_at);
