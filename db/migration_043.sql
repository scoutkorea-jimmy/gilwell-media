-- Dreampath: Calendar time, user profile fields, fix jimmy display name

-- Calendar: add time fields to events
ALTER TABLE dp_events ADD COLUMN start_time TEXT;
ALTER TABLE dp_events ADD COLUMN end_time   TEXT;

-- Users: add emergency contact profile fields
ALTER TABLE dp_users ADD COLUMN role_title      TEXT;
ALTER TABLE dp_users ADD COLUMN emergency_note  TEXT;

-- Fix Jimmy's seeded display name
UPDATE dp_users SET display_name = 'Jimmy' WHERE username = 'jimmy' AND display_name = 'Jimmy (Admin)';
