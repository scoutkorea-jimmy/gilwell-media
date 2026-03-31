-- migration_047: Meeting Minutes approver, approval status, User last login
ALTER TABLE dp_board_posts ADD COLUMN approver_name TEXT;
ALTER TABLE dp_board_posts ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE dp_users ADD COLUMN last_login_at TEXT;
