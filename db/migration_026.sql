-- Add special feature grouping support for posts
ALTER TABLE posts ADD COLUMN special_feature TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_special_feature
ON posts (category, special_feature, publish_at DESC, created_at DESC);
