-- Gilwell Media · Migration 051
-- WOSM member countries setting seed
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_051.sql

INSERT OR IGNORE INTO settings (key, value) VALUES ('wosm_members', '[]');
INSERT OR IGNORE INTO settings (key, value) VALUES ('wosm_members_rev', '0');
