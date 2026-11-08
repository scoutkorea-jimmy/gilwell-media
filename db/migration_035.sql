CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip               TEXT PRIMARY KEY,
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_first_attempt
  ON admin_login_attempts(first_attempt_at);
