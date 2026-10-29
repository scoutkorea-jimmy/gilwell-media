-- Dreampath v2: User accounts, calendar events, board posts, emergency contacts

CREATE TABLE IF NOT EXISTS dp_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT,
  role          TEXT    NOT NULL DEFAULT 'member',
  email         TEXT,
  phone         TEXT,
  department    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed the admin account (password_hash NULL triggers bootstrap in auth.js)
INSERT OR IGNORE INTO dp_users (username, display_name, role, password_hash)
VALUES ('jimmy', 'Jimmy (Admin)', 'admin', NULL);

CREATE TABLE IF NOT EXISTS dp_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  type        TEXT NOT NULL DEFAULT 'general',
  created_by  INTEGER REFERENCES dp_users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_board_posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board       TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT,
  file_url    TEXT,
  file_name   TEXT,
  author_id   INTEGER REFERENCES dp_users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'Unknown',
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role_title  TEXT,
  phone       TEXT,
  email       TEXT,
  department  TEXT,
  note        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_users_username ON dp_users(username);
CREATE INDEX IF NOT EXISTS idx_dp_events_date ON dp_events(start_date);
CREATE INDEX IF NOT EXISTS idx_dp_posts_board ON dp_board_posts(board, pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dp_contacts_order ON dp_contacts(sort_order);
