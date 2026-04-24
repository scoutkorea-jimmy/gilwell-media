-- Gilwell Media · Migration 060
-- Dreampath permission hardening (Phase 5 follow-up):
--   1. Assign the built-in "Viewer" preset to every member currently sitting on
--      preset_id = NULL. Fixes the transitional loophole where a member with
--      no preset was granted implicit all-view access by the frontend.
--   2. Tighten dp_board_posts so parent_post_id (revision chain) and
--      reply_to_id (discussion thread) cannot both be set on the same row.
--      Enforcement is a BEFORE INSERT / BEFORE UPDATE trigger because SQLite
--      can't add a CHECK constraint to an existing table without a full
--      table rewrite, and a table rewrite here is heavier than we need.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_060.sql

-- 1. Back-fill members without a preset to the Viewer default. Admins are
--    skipped because preset is ignored when role = admin anyway. Owners
--    can reassign to Manager/Editor/Master afterwards via the admin console.
UPDATE dp_users
   SET preset_id = (SELECT id FROM dp_permission_presets WHERE slug = 'viewer')
 WHERE preset_id IS NULL
   AND role != 'admin'
   AND (SELECT id FROM dp_permission_presets WHERE slug = 'viewer') IS NOT NULL;

-- 2. Prevent parent_post_id + reply_to_id from coexisting. SQLite triggers
--    run inside the insert/update statement and can ABORT with an error.
DROP TRIGGER IF EXISTS dp_board_posts_no_dual_thread_ins;
CREATE TRIGGER dp_board_posts_no_dual_thread_ins
BEFORE INSERT ON dp_board_posts
FOR EACH ROW
WHEN NEW.parent_post_id IS NOT NULL AND NEW.reply_to_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'parent_post_id and reply_to_id are mutually exclusive');
END;

DROP TRIGGER IF EXISTS dp_board_posts_no_dual_thread_upd;
CREATE TRIGGER dp_board_posts_no_dual_thread_upd
BEFORE UPDATE ON dp_board_posts
FOR EACH ROW
WHEN NEW.parent_post_id IS NOT NULL AND NEW.reply_to_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'parent_post_id and reply_to_id are mutually exclusive');
END;
