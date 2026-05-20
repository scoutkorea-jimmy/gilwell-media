-- Gilwell Media · Migration 069
-- Admin login: exponential backoff state.
--
-- Adds last_attempt_at to admin_login_attempts so the login handler can
-- compute the per-IP cool-down window (60s, 120s, 240s, ... doubling
-- past 3 fails, capped at 24h) and decide when to auto-clear stale
-- counters (72h of inactivity).
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_069.sql

ALTER TABLE admin_login_attempts ADD COLUMN last_attempt_at INTEGER NOT NULL DEFAULT 0;

-- Seed last_attempt_at for any rows that pre-date this migration so the
-- 72-hour idle-reset rule applies immediately without forcing an
-- unnecessary lockout on legitimate operators.
UPDATE admin_login_attempts
   SET last_attempt_at = first_attempt_at
 WHERE last_attempt_at = 0;

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_last_attempt
  ON admin_login_attempts(last_attempt_at);
