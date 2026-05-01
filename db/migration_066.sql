-- Gilwell Media · Migration 066
-- Dreampath PMO action items: trace tasks back to posts/comments.
-- The production dp_tasks table already has source_type and related_post_id
-- from earlier task automation work; this migration adds the missing
-- source_ref_id pointer and indexes the trace fields.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_066.sql

ALTER TABLE dp_tasks ADD COLUMN source_ref_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_dp_tasks_related_post ON dp_tasks(related_post_id);
CREATE INDEX IF NOT EXISTS idx_dp_tasks_source ON dp_tasks(source_type, source_ref_id);
