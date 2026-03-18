ALTER TABLE calendar_events ADD COLUMN event_category TEXT NOT NULL DEFAULT 'WOSM';
ALTER TABLE calendar_events ADD COLUMN country_name TEXT;
ALTER TABLE calendar_events ADD COLUMN latitude REAL;
ALTER TABLE calendar_events ADD COLUMN longitude REAL;
