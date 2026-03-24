-- Dreampath: Project collaboration board tables

CREATE TABLE IF NOT EXISTS dp_resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  url         TEXT,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  added_by    TEXT NOT NULL DEFAULT '익명',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  assignee    TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',
  priority    TEXT NOT NULL DEFAULT 'normal',
  due_date    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  content     TEXT,
  type        TEXT NOT NULL DEFAULT 'note',
  status      TEXT NOT NULL DEFAULT 'open',
  priority    TEXT NOT NULL DEFAULT 'normal',
  added_by    TEXT NOT NULL DEFAULT '익명',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dp_discussions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id INTEGER NOT NULL REFERENCES dp_milestones(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  author       TEXT NOT NULL DEFAULT '익명',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dp_resources_created ON dp_resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dp_tasks_status ON dp_tasks(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_dp_notes_status ON dp_notes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dp_milestones_order ON dp_milestones(sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_dp_discussions_milestone ON dp_discussions(milestone_id, created_at);
