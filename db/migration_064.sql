-- Gilwell Media · Migration 064
-- Hide/Blind posts on team boards.
--
-- `is_hidden=1` makes a post invisible to every non-admin. Admins still see
-- the row, greyed out with a "Blinded" badge, so they can unhide or delete
-- it. Used by the team board row-action "Hide" flow (2026-04-24 owner spec).
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_064.sql

ALTER TABLE dp_board_posts ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_dp_board_posts_hidden
  ON dp_board_posts(board, is_hidden);
