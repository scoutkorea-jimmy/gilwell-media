-- 홈 팝업 배너 (2026-07-22)
--
-- 홈 진입 시 화면 중앙에 뜨는 이미지 배너. 최대 2개까지만 노출한다
-- (개수 제한은 API 에서도 강제 — functions/api/settings/home-banners.js).
--
-- 노출 조건: active = 1 AND (starts_at IS NULL OR now >= starts_at)
--                        AND (ends_at   IS NULL OR now <= ends_at)
-- 시각은 다른 테이블과 같이 UTC 문자열로 저장한다.
CREATE TABLE IF NOT EXISTS home_banners (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url   TEXT    NOT NULL,
  link_url    TEXT,
  title       TEXT    NOT NULL DEFAULT '',   -- 이미지 대체 텍스트(접근성). 비우지 말 것
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  starts_at   TEXT,
  ends_at     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_home_banners_active
  ON home_banners (active, sort_order, id);
