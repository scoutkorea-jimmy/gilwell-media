-- Migration 076: Scout Memorabilia view counting (조회수)
-- 2026-05-30 · Site
-- posts.views / post_views 패턴을 그대로 미러링한다.
-- 상세 slug 응답이 CDN 5분 캐시라, 조회 기록은 비캐시 view 엔드포인트가 담당한다.

ALTER TABLE memorabilia ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS memorabilia_views (
  memorabilia_id INTEGER NOT NULL,
  viewer_key     TEXT,
  viewed_bucket  TEXT,
  viewed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_views_item_time
  ON memorabilia_views(memorabilia_id, viewed_at);

-- 12시간 버킷당 (항목, 뷰어) 1회만 카운트되도록 중복 차단
CREATE UNIQUE INDEX IF NOT EXISTS idx_memorabilia_views_unique_bucket
  ON memorabilia_views(memorabilia_id, viewer_key, viewed_bucket);
