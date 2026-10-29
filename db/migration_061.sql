-- Gilwell Media · Migration 061
-- Team board sub-tabs.
--
-- Each team board (slug like 'team_korea', 'team_nepal', ...) can define up
-- to 5 sub-tabs (enforced in the API, not the schema, so we can change the
-- cap without a migration). Posts carry a tab_slug that scopes them to a
-- single tab inside their board; moving a post to a different tab updates
-- this column. Moving a post across boards is still forbidden.
--
-- Per-tab write permission: `allowed_users` is a JSON array of usernames.
--   · NULL        → every team member (dept-matched, as before) can write
--   · []          → only board admins/moderators can write
--   · ["jimmy","sonny"] → only those usernames can write (plus admins)
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_061.sql

CREATE TABLE IF NOT EXISTS dp_board_tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  allowed_users TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_slug, slug)
);
CREATE INDEX IF NOT EXISTS idx_dp_board_tabs_board
  ON dp_board_tabs(board_slug, sort_order);

-- Posts remember which tab they belong to. Legacy rows stay NULL (= "All" /
-- implicit general tab). Moving a post writes to this column; the API
-- validates the target tab belongs to the same board_slug.
ALTER TABLE dp_board_posts ADD COLUMN tab_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_dp_board_posts_tab
  ON dp_board_posts(board, tab_slug);
