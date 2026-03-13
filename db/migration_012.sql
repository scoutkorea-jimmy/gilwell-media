CREATE TABLE IF NOT EXISTS site_visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer_key    TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  referrer_host TEXT    NOT NULL DEFAULT 'direct',
  referrer_url  TEXT,
  visited_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sv_time ON site_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_path_time ON site_visits(path, visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_viewer_path_time ON site_visits(viewer_key, path, visited_at);
CREATE INDEX IF NOT EXISTS idx_sv_referrer_host ON site_visits(referrer_host);
