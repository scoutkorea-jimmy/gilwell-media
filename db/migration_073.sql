-- Gilwell Media · Migration 073
-- Scout Memorabilia — 좋아요 + 댓글 (승인제)
--
-- 기념품 도감 상세 페이지에 두 가지 공개 인터랙션을 도입한다:
--   (1) 좋아요   — 익명, IP 해시(viewer_key) 기준 1인 1좋아요 (post_likes 패턴 동일)
--   (2) 댓글     — 누구나 작성 가능, 관리자 승인 후 게시. 작성자 이름·소속연맹·
--                  비밀번호(PBKDF2-SHA256) 필수, 본인이 비밀번호로 직접 삭제 가능.
--                  IP 평문 보관 (관리자 모더레이션 감사용, 처리방침 명시).
--
-- 보안/프라이버시:
--   · password_hash: PBKDF2-SHA256, 100,000 iter, 16-byte salt, base64 인코딩.
--   · ip_address: 평문 저장. 90일 보관 (운영 정책). 처리방침 §댓글 작성 참조.
--   · status='deleted' soft-delete — 작성자 본인 또는 관리자가 trigger.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_073.sql

--------------------------------------------------------------------------------
-- 1) 좋아요 (memorabilia_likes)
--    post_likes 와 동형: viewer_key = SHA256(ip + ADMIN_SECRET) — 동일 IP 재방문
--    1좋아요만. ON DELETE CASCADE 로 도감 항목 삭제 시 함께 정리.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_likes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  memorabilia_id  INTEGER NOT NULL REFERENCES memorabilia(id) ON DELETE CASCADE,
  viewer_key      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(memorabilia_id, viewer_key)
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_likes_mid
  ON memorabilia_likes(memorabilia_id);


--------------------------------------------------------------------------------
-- 2) 댓글 (memorabilia_comments)
--    승인제: status 흐름 pending → approved | rejected | deleted.
--    approved 만 공개 노출. pending/rejected 는 관리자 큐에만 표시.
--    deleted 는 작성자 자가 삭제 또는 관리자 삭제 후 soft-delete 상태.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_comments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  memorabilia_id  INTEGER NOT NULL REFERENCES memorabilia(id) ON DELETE CASCADE,

  -- 작성자 정보 (모두 필수)
  author_name     TEXT    NOT NULL,           -- 이름 (1~40자)
  affiliation     TEXT    NOT NULL,           -- 소속연맹 (1~80자, free-form)

  -- 비밀번호 (PBKDF2-SHA256, 100k iter, base64)
  password_hash   TEXT    NOT NULL,
  password_salt   TEXT    NOT NULL,           -- 16바이트 random salt, base64

  content         TEXT    NOT NULL,           -- 1~1000자 (plain text, 줄바꿈 허용)

  -- 감사 / 모더레이션 메타
  ip_address      TEXT    NOT NULL,           -- 평문 IP (90일 보관, 처리방침 명시)
  user_agent      TEXT,                       -- 모더레이션 보조용 (nullable)

  status          TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','approved','rejected','deleted')),
  rejection_reason TEXT,                      -- 거부 사유 (관리자 모더레이션 메모)

  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at     TEXT,                       -- 승인/거부 시각
  reviewed_by     TEXT,                       -- 처리한 관리자 username/code
  deleted_at      TEXT                        -- soft-delete 시각
);

-- 공개 페이지: WHERE memorabilia_id = ? AND status = 'approved' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_memorabilia_comments_mid_status
  ON memorabilia_comments(memorabilia_id, status, created_at DESC);

-- 관리자 큐: WHERE status = 'pending' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_memorabilia_comments_status_created
  ON memorabilia_comments(status, created_at DESC);
