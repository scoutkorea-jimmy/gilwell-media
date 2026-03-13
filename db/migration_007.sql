-- Migration 007: author field + author_name setting
ALTER TABLE posts ADD COLUMN author TEXT NOT NULL DEFAULT 'Editor.A';
INSERT OR IGNORE INTO settings (key, value) VALUES ('author_name', 'Editor.A');
