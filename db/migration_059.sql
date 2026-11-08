-- Gilwell Media · Migration 059
-- Dreampath permission presets — per-page view/write granularity assignable
-- to dp_users via preset_id. Mirrors the admin console pattern from 056.
--
-- Pages: home, announcements, calendar, documents, minutes, tasks, notes,
--        teams, contacts, rules, versions. (users/reference are admin-only.)
-- Format: permissions column holds JSON
--   {"permissions": ["view:home", "write:tasks", ...]}
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_059.sql

CREATE TABLE IF NOT EXISTS dp_permission_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '{"permissions":[]}',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link users to a preset (admin role bypasses preset entirely).
ALTER TABLE dp_users ADD COLUMN preset_id INTEGER REFERENCES dp_permission_presets(id);

-- Master — full edit on every page (non-admin can still get near-admin).
INSERT OR IGNORE INTO dp_permission_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'master',
  'Master',
  'All pages: view + write. Equivalent to admin for feature access, but does not include user/preset management.',
  '{"permissions":["view:home","write:home","view:announcements","write:announcements","view:calendar","write:calendar","view:documents","write:documents","view:minutes","write:minutes","view:tasks","write:tasks","view:notes","write:notes","view:teams","write:teams","view:contacts","write:contacts","view:rules","view:versions"]}',
  1
);

-- Manager — edit content, view operations, no reference/users.
INSERT OR IGNORE INTO dp_permission_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'manager',
  'Manager',
  'Edit announcements/documents/minutes/tasks/notes/teams/contacts. View the rest.',
  '{"permissions":["view:home","view:announcements","write:announcements","view:calendar","write:calendar","view:documents","write:documents","view:minutes","write:minutes","view:tasks","write:tasks","view:notes","write:notes","view:teams","write:teams","view:contacts","write:contacts","view:rules","view:versions"]}',
  1
);

-- Content Editor — write on content boards + tasks, view everything else.
INSERT OR IGNORE INTO dp_permission_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'editor',
  'Content Editor',
  'Write posts on Announcements/Documents/Minutes and manage own Tasks/Notes. Read-only elsewhere.',
  '{"permissions":["view:home","view:announcements","write:announcements","view:calendar","view:documents","write:documents","view:minutes","write:minutes","view:tasks","write:tasks","view:notes","write:notes","view:teams","view:contacts","view:rules","view:versions"]}',
  1
);

-- Viewer — read everything, write nothing.
INSERT OR IGNORE INTO dp_permission_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'viewer',
  'Viewer',
  'Read-only access to every non-admin page. No write or delete permissions.',
  '{"permissions":["view:home","view:announcements","view:calendar","view:documents","view:minutes","view:tasks","view:notes","view:teams","view:contacts","view:rules","view:versions"]}',
  1
);
