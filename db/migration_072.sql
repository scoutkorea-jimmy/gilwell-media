-- Gilwell Media · Migration 072
-- Scout Memorabilia — Events Catalog (행사 카탈로그)
--
-- 기념품의 "행사명" 을 공통 카탈로그로 분리. 같은 행사(예: 25th World Scout
-- Jamboree)에 속한 여러 기념품(패치·뱃지·메달 등)이 같은 행사 레코드를
-- 공유하도록 한다. 행사 자체의 메타(기간·설명) 도 함께 관리.
--
-- 호환성:
--   · 기존 memorabilia.event_name_en / event_name_ko 컬럼은 denormalized cache 로
--     유지한다. 이는 (1) 검색 인덱스 (2) event_id 가 NULL 인 레거시 데이터
--     (3) 이벤트가 나중에 이름이 바뀌어도 과거 항목에서 빠르게 표시 가능 의도.
--   · 새로운 event_id 컬럼이 채워지면 application layer 가 카탈로그를 source of
--     truth 로 본다.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_072.sql

--------------------------------------------------------------------------------
-- 1) Events catalog
--    날짜는 연/월/일 별도 컬럼 + NULL 허용. precision 은 컬럼 존재로 판별.
--    예) 연도만 알 때: start_year=2026, start_month=NULL, start_day=NULL
--        월까지만:    start_year=2026, start_month=8,    start_day=NULL
--        일까지:      start_year=2026, start_month=8,    start_day=4
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,

  name_en         TEXT    NOT NULL DEFAULT '',
  name_ko         TEXT    NOT NULL DEFAULT '',

  start_year      INTEGER,
  start_month     INTEGER,
  start_day       INTEGER,
  end_year        INTEGER,
  end_month       INTEGER,
  end_day         INTEGER,

  description_en  TEXT    NOT NULL DEFAULT '',
  description_ko  TEXT    NOT NULL DEFAULT '',

  archived        INTEGER NOT NULL DEFAULT 0,
  usage_count     INTEGER NOT NULL DEFAULT 0,    -- 참조 중인 memorabilia 개수 cache

  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_events_name_en   ON memorabilia_events(name_en);
CREATE INDEX IF NOT EXISTS idx_memorabilia_events_name_ko   ON memorabilia_events(name_ko);
CREATE INDEX IF NOT EXISTS idx_memorabilia_events_start     ON memorabilia_events(start_year DESC, start_month DESC, start_day DESC);
CREATE INDEX IF NOT EXISTS idx_memorabilia_events_archived  ON memorabilia_events(archived);

--------------------------------------------------------------------------------
-- 2) memorabilia.event_id (FK)
--    SET NULL on delete — 행사 삭제 시 항목은 보존, 행사 연결만 끊는다.
--    NULL 허용 — 행사 카탈로그를 쓰지 않는 항목도 그대로 작동.
--------------------------------------------------------------------------------
ALTER TABLE memorabilia ADD COLUMN event_id INTEGER REFERENCES memorabilia_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memorabilia_event ON memorabilia(event_id);
