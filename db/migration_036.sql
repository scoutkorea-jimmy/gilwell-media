CREATE TABLE IF NOT EXISTS post_engagement (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id         INTEGER NOT NULL,
  viewer_key      TEXT    NOT NULL,
  session_key     TEXT    NOT NULL,
  engaged_seconds INTEGER NOT NULL DEFAULT 0,
  first_seen_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_post_engagement_post_time ON post_engagement(post_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_engagement_time ON post_engagement(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_engagement_viewer ON post_engagement(viewer_key, updated_at DESC);
