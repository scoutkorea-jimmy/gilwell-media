-- Sign-off workflow on wiki versions: read-acknowledgement + version approval. 2026-06-04.
CREATE TABLE IF NOT EXISTS dp_wiki_signoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                      -- 'ack' | 'approval'
  assignee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'rejected'
  note TEXT,
  requested_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acted_at TEXT,
  UNIQUE(version_id, kind, assignee_name)
);
