-- admin_users 2FA(TOTP) 컬럼 — 추가만(기존 컬럼 불변). 미등록 사용자는 NULL/0 = OTP 비활성.
ALTER TABLE admin_users ADD COLUMN totp_secret TEXT;
ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN totp_backup_codes TEXT;
ALTER TABLE admin_users ADD COLUMN totp_enrolled_at TEXT;
