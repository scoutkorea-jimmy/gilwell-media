ALTER TABLE posts ADD COLUMN publish_at TEXT;

UPDATE posts
   SET publish_at = created_at
 WHERE publish_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_publish_at ON posts (publish_at DESC);
