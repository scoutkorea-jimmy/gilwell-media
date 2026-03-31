-- migration_048: Multiple approvers for Meeting Minutes
CREATE TABLE IF NOT EXISTS dp_post_approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER NOT NULL REFERENCES dp_board_posts(id) ON DELETE CASCADE,
  approver_name TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending',
  voted_at      TEXT,
  override_by   TEXT,
  override_note TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, approver_name)
);
CREATE INDEX IF NOT EXISTS idx_dp_post_approvals_post ON dp_post_approvals(post_id);
