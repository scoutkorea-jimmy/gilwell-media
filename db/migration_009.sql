-- migration_009.sql
-- Add sort_order for manual post ordering control

ALTER TABLE posts ADD COLUMN sort_order INTEGER DEFAULT NULL;
