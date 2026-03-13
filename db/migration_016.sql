ALTER TABLE post_views ADD COLUMN viewed_bucket TEXT;
ALTER TABLE site_visits ADD COLUMN visited_bucket TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_unique_bucket ON post_views(post_id, viewer_key, viewed_bucket);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sv_unique_bucket ON site_visits(viewer_key, path, visited_bucket);
