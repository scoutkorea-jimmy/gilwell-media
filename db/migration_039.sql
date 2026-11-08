-- Dreampath: Version history table

CREATE TABLE IF NOT EXISTS dp_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version     TEXT    NOT NULL,
  aa          INTEGER NOT NULL DEFAULT 1,
  bbb         INTEGER NOT NULL DEFAULT 0,
  cc          INTEGER NOT NULL DEFAULT 0,
  type        TEXT    NOT NULL DEFAULT 'feature',
  description TEXT,
  released_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO dp_versions (version, aa, bbb, cc, type, description)
VALUES ('01.000.00', 1, 0, 0, 'initial', 'Initial release: calendar, boards (announcements/documents/minutes), emergency contacts, user management');

CREATE INDEX IF NOT EXISTS idx_dp_versions_released ON dp_versions(released_at DESC);
