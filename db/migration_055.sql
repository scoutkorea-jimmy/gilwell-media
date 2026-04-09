-- Gilwell Media · Migration 055
-- Add geo audience columns to site_visits for admin geo dashboard
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_055.sql

ALTER TABLE site_visits ADD COLUMN country_code TEXT;
ALTER TABLE site_visits ADD COLUMN country_name TEXT;
ALTER TABLE site_visits ADD COLUMN city_name TEXT;
ALTER TABLE site_visits ADD COLUMN region_code TEXT;
ALTER TABLE site_visits ADD COLUMN continent_code TEXT;
ALTER TABLE site_visits ADD COLUMN latitude REAL;
ALTER TABLE site_visits ADD COLUMN longitude REAL;

CREATE INDEX IF NOT EXISTS idx_site_visits_country_code ON site_visits(country_code);
CREATE INDEX IF NOT EXISTS idx_site_visits_city_name ON site_visits(city_name);
