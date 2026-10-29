-- Dreampath: Profile avatar support

ALTER TABLE dp_users ADD COLUMN avatar_url TEXT;
ALTER TABLE dp_users ADD COLUMN avatar_pos TEXT NOT NULL DEFAULT '50 50';
