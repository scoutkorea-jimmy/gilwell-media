-- Add real document version label (e.g. "v1.2") parsed from the filename, so
-- the UI shows the actual version instead of the internal upload counter.
-- Additive only. 2026-06-04.
ALTER TABLE dp_wiki_versions ADD COLUMN version_label TEXT;
