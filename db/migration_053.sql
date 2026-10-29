-- Gilwell Media · Migration 053
-- Add reply_to_id for threaded replies (child posts / child notes)
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_053.sql

ALTER TABLE dp_board_posts ADD COLUMN reply_to_id INTEGER REFERENCES dp_board_posts(id) ON DELETE CASCADE;
ALTER TABLE dp_notes ADD COLUMN reply_to_id INTEGER REFERENCES dp_notes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_dp_board_posts_reply ON dp_board_posts(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_dp_notes_reply ON dp_notes(reply_to_id);
