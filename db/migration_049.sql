-- migration_049: add missing columns to dp_post_approvals
-- The table was created with approved_at/approver_id instead of the expected schema.
-- Add the columns required by the current API code.
ALTER TABLE dp_post_approvals ADD COLUMN voted_at TEXT;
ALTER TABLE dp_post_approvals ADD COLUMN override_by TEXT;
ALTER TABLE dp_post_approvals ADD COLUMN override_note TEXT;
UPDATE dp_post_approvals SET voted_at = approved_at WHERE approved_at IS NOT NULL;
