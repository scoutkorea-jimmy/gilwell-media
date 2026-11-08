ALTER TABLE calendar_events ADD COLUMN title_original TEXT;
ALTER TABLE calendar_events ADD COLUMN event_tags TEXT;
ALTER TABLE calendar_events ADD COLUMN related_post_id INTEGER;
ALTER TABLE calendar_events ADD COLUMN start_has_time INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_events ADD COLUMN end_has_time INTEGER NOT NULL DEFAULT 0;
