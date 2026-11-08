ALTER TABLE post_views ADD COLUMN viewer_key TEXT;
CREATE TABLE IF NOT EXISTS post_likes (
  post_id    INTEGER NOT NULL,
  viewer_key TEXT    NOT NULL,
  liked_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, viewer_key)
);
CREATE INDEX IF NOT EXISTS idx_pv_viewer_post ON post_views(viewer_key, post_id);
CREATE INDEX IF NOT EXISTS idx_pl_post ON post_likes(post_id);
