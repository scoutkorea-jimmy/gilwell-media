-- Dreampath Knowledge Base (Document Wiki) — 2026-06-04
-- Additive only (CREATE TABLE / INDEX). No existing column changed.
CREATE TABLE IF NOT EXISTS dp_wiki_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_id INTEGER,
  created_by_name TEXT
);
CREATE TABLE IF NOT EXISTS dp_wiki_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT,
  source_file_url TEXT,
  source_file_name TEXT,
  change_context TEXT,
  char_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_by_id INTEGER,
  uploaded_by_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_wiki_versions_page ON dp_wiki_versions(page_id, version_no);
CREATE TABLE IF NOT EXISTS dp_wiki_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  user_name TEXT,
  status TEXT NOT NULL DEFAULT 'following',
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(version_id, user_id)
);
CREATE TABLE IF NOT EXISTS dp_wiki_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  parent_id INTEGER,
  author_id INTEGER,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
