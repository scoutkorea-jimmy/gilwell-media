-- Gilwell Media · Migration 070
-- Drafts (임시저장) — D1 backend.
--
-- localStorage 단일 슬롯 → D1 다중 슬롯 (운영자당 최대 10개, 14일 TTL) 전환.
-- 이미지(cover/gallery)는 client에서 base64로 들어와도 API 저장 시점에 R2 업로드 →
-- image_url 필드에는 짧은 /api/images/<key> URL만 저장 (D1 1MB cell 한도 안전).
--
-- 격리: owner_editor_code 컬럼으로 각 운영자가 자기 드래프트만 본다.
-- LRU: 11번째 저장 시 가장 오래된 한 건 삭제 (API 레이어에서 처리).
-- TTL: 14일 이전 row는 list 호출 시 lazy 삭제.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_070.sql

CREATE TABLE IF NOT EXISTS drafts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_editor_code    TEXT    NOT NULL,
  editing_post_id      INTEGER,
  title                TEXT    NOT NULL DEFAULT '',
  subtitle             TEXT,
  category             TEXT,
  tag                  TEXT,
  meta_tags            TEXT,
  author               TEXT,
  publish_at           TEXT,
  youtube_url          TEXT,
  image_url            TEXT,
  image_caption        TEXT,
  gallery_images       TEXT,
  location_name        TEXT,
  location_address     TEXT,
  special_feature      TEXT,
  manual_related_posts TEXT,
  published_flag       INTEGER NOT NULL DEFAULT 1,
  featured_flag        INTEGER NOT NULL DEFAULT 0,
  ai_assisted          INTEGER NOT NULL DEFAULT 0,
  content              TEXT    NOT NULL DEFAULT '',
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drafts_owner_updated
  ON drafts(owner_editor_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_drafts_updated_at
  ON drafts(updated_at);
