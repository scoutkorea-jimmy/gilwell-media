-- Gilwell Media · D1 Database Schema
-- ─────────────────────────────────────────────────────────────
-- Run once to initialise:
--   wrangler d1 execute gilwell-posts --file=./db/schema.sql
--
-- For remote (production) database add --remote flag:
--   wrangler d1 execute gilwell-posts --remote --file=./db/schema.sql
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- category must be one of the three board slugs
  category    TEXT    NOT NULL CHECK(category IN ('korea', 'apr', 'worm')),
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL DEFAULT '',
  -- optional: absolute https URL to a thumbnail/image
  image_url   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Speed up filtered board queries
CREATE INDEX IF NOT EXISTS idx_posts_category   ON posts (category);
-- Speed up chronological sort (newest first)
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
