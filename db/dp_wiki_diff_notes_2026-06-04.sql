-- Per-change "변경 사유" memos, keyed to a (from,to) version pair + row_key. 2026-06-04.
CREATE TABLE IF NOT EXISTS dp_wiki_diff_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  from_version_id INTEGER NOT NULL,
  to_version_id INTEGER NOT NULL,
  row_key TEXT NOT NULL,
  old_excerpt TEXT,
  new_excerpt TEXT,
  note TEXT NOT NULL,
  author_id INTEGER,
  author_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_version_id, to_version_id, row_key)
);
