-- Generic cross-entity traceability links (PMO). 2026-06-04. Additive.
CREATE TABLE IF NOT EXISTS dp_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_type TEXT NOT NULL,
  a_id INTEGER NOT NULL,
  b_type TEXT NOT NULL,
  b_id INTEGER NOT NULL,
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(a_type, a_id, b_type, b_id)
);
CREATE INDEX IF NOT EXISTS idx_links_a ON dp_links(a_type, a_id);
CREATE INDEX IF NOT EXISTS idx_links_b ON dp_links(b_type, b_id);
