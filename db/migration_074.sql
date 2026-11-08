-- Gilwell Media · Migration 074
-- Scout Memorabilia — 행사 카탈로그 카테고리(분류)
--
-- 행사 카탈로그(memorabilia_events) 에 분류 컬럼을 추가한다. 예: 세계잼버리,
-- 아시아-태평양 잼버리, 한국잼버리, 세계총회, 지역총회, 야영대회, 기념행사 등.
-- 분류는 별도 테이블(memorabilia_event_categories) 로 관리해 라벨·정렬·아카이브
-- 모두 운영자 콘솔에서 수정 가능. ON DELETE SET NULL 로 분류 삭제 시 행사는 보존.
--
-- 디자인:
--   · memorabilia_event_categories 는 memorabilia_categories 와 동일 패턴 (slug,
--     label_en/ko, sort_order, archived).
--   · memorabilia_events.category_id INTEGER NULL REFERENCES … ON DELETE SET NULL.
--   · 기본 분류 8개 시드 — 운영자가 KMS 정책에 따라 수정/추가/숨김 가능.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_074.sql

--------------------------------------------------------------------------------
-- 1) 행사 카테고리 (memorabilia_event_categories)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_event_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  label_en    TEXT    NOT NULL DEFAULT '',
  label_ko    TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 999,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_event_categories_archived
  ON memorabilia_event_categories(archived);

CREATE INDEX IF NOT EXISTS idx_memorabilia_event_categories_sort
  ON memorabilia_event_categories(sort_order ASC, label_ko ASC);

--------------------------------------------------------------------------------
-- 2) memorabilia_events.category_id 컬럼 추가
--------------------------------------------------------------------------------
ALTER TABLE memorabilia_events
  ADD COLUMN category_id INTEGER REFERENCES memorabilia_event_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memorabilia_events_category
  ON memorabilia_events(category_id);

--------------------------------------------------------------------------------
-- 3) 기본 분류 시드 (8개) — 운영자가 수정·추가·아카이브 가능
--    sort_order 는 10 간격 (사이 끼워넣기 여유).
--------------------------------------------------------------------------------
INSERT OR IGNORE INTO memorabilia_event_categories (slug, label_en, label_ko, sort_order) VALUES
  ('world-jamboree',       'World Jamboree',                 '세계잼버리',           10),
  ('regional-jamboree',    'Regional Jamboree',              '지역잼버리 (APR 등)',  20),
  ('national-jamboree',    'National Jamboree',              '한국잼버리',           30),
  ('world-conference',     'World Scout Conference',         '세계스카우트총회',     40),
  ('regional-conference',  'Regional Scout Conference',      '지역스카우트총회',     50),
  ('camping',              'Camping Event',                  '야영대회',             60),
  ('commemoration',        'Commemoration / Anniversary',    '기념행사',             70),
  ('other',                'Other',                          '기타',                999);
