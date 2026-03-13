-- Migration 005: Add meta_tags column for SEO keywords per post
ALTER TABLE posts ADD COLUMN meta_tags TEXT;
