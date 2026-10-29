-- Gilwell Media · Migration 004
-- Run against production:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_004.sql

-- Add translations setting (stores admin-customized EN strings; {} = use defaults)
INSERT OR IGNORE INTO settings (key, value) VALUES ('translations', '{}');
