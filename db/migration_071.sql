-- Gilwell Media · Migration 071
-- Scout Memorabilia Encyclopedia (스카우트 기념품 도감)
--
-- Site/Admin · Encyclopedia 묶음의 첫 카탈로그.
-- 검색 우선: FTS5 + 자모/초성 보조 컬럼.
-- 다국어: 핵심 텍스트 필드는 KO/EN 페어로 저장. 한쪽 비어 있어도 동작.
--
-- 주변 데이터 재사용:
--   · 국가 코드 — functions/_shared/country-code-labels.js 와 동일한 ISO-2 코드
--   · 용어 검색 동의어 — glossary_terms (term_ko ↔ term_en) 를 검색 시 alias 로 활용
--
-- FTS 동기화는 SQL 트리거가 아니라 application layer (functions/_shared/memorabilia-search.js)
-- 에서 처리한다 — 자모 분해·초성 추출은 JS 로직이라 SQLite 측에서 호출할 수 없음.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_071.sql

--------------------------------------------------------------------------------
-- 1) 분류 enum — 관리자가 태그처럼 추가/편집 가능
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  label_en    TEXT    NOT NULL,
  label_ko    TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO memorabilia_categories(slug, label_en, label_ko, sort_order) VALUES
  ('patch',       'Patch',       '패치',  10),
  ('badge',       'Badge',       '뱃지',  20),
  ('medal',       'Medal',       '메달',  30),
  ('neckerchief', 'Neckerchief', '항건',  40),
  ('uniform',     'Uniform',     '제복',  50),
  ('stamp',       'Stamp',       '우표',  60),
  ('booklet',     'Booklet',     '책자',  70),
  ('other',       'Other',       '기타', 999);

--------------------------------------------------------------------------------
-- 2) 메인 테이블
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT    NOT NULL UNIQUE,

  title_en              TEXT    NOT NULL DEFAULT '',
  title_ko              TEXT    NOT NULL DEFAULT '',

  has_event             INTEGER NOT NULL DEFAULT 0,
  event_name_en         TEXT    NOT NULL DEFAULT '',
  event_name_ko         TEXT    NOT NULL DEFAULT '',

  year                  INTEGER,                                  -- 4자리 연도, NULL 허용

  category_id           INTEGER REFERENCES memorabilia_categories(id) ON DELETE SET NULL,

  material_en           TEXT    NOT NULL DEFAULT '',
  material_ko           TEXT    NOT NULL DEFAULT '',

  size_text             TEXT    NOT NULL DEFAULT '',              -- 자유 텍스트 ("가로 7cm, 세로 5cm")

  issuer_en             TEXT    NOT NULL DEFAULT '',
  issuer_ko             TEXT    NOT NULL DEFAULT '',

  description_en        TEXT    NOT NULL DEFAULT '',              -- Editor.js JSON (EN)
  description_ko        TEXT    NOT NULL DEFAULT '',              -- Editor.js JSON (KO)
  description_plain_en  TEXT    NOT NULL DEFAULT '',              -- 검색용 plaintext (EN)
  description_plain_ko  TEXT    NOT NULL DEFAULT '',              -- 검색용 plaintext (KO)

  related_links_json    TEXT    NOT NULL DEFAULT '[]',            -- [{label_en, label_ko, url}, ...]

  status                TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'public')),

  created_by            TEXT,                                     -- admin editor code (감사용)
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  published_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_status_published
  ON memorabilia(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_memorabilia_year      ON memorabilia(year);
CREATE INDEX IF NOT EXISTS idx_memorabilia_category  ON memorabilia(category_id);
CREATE INDEX IF NOT EXISTS idx_memorabilia_updated   ON memorabilia(updated_at DESC);

--------------------------------------------------------------------------------
-- 3) 이미지 — 다중, 대표 1장 플래그
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_images (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  memorabilia_id   INTEGER NOT NULL REFERENCES memorabilia(id) ON DELETE CASCADE,
  url              TEXT    NOT NULL,
  alt_en           TEXT    NOT NULL DEFAULT '',
  alt_ko           TEXT    NOT NULL DEFAULT '',
  is_primary       INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_images_item
  ON memorabilia_images(memorabilia_id, sort_order);
-- 대표 이미지 빠른 조회 (목록 카드용)
CREATE INDEX IF NOT EXISTS idx_memorabilia_images_primary
  ON memorabilia_images(memorabilia_id) WHERE is_primary = 1;

--------------------------------------------------------------------------------
-- 4) 국가 (다중) — ISO-2 코드. country-code-labels.js 와 동일 키 사용
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_countries (
  memorabilia_id  INTEGER NOT NULL REFERENCES memorabilia(id) ON DELETE CASCADE,
  country_code    TEXT    NOT NULL,
  PRIMARY KEY (memorabilia_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_countries_code
  ON memorabilia_countries(country_code);

--------------------------------------------------------------------------------
-- 5) 태그 풀 + 연결 테이블 — 도감 전용 풀 (사이트 기사 태그와 별도)
--    사이트 통합 태그는 settings.tags JSON 에 살아 있으므로, 도감 자동완성에선
--    "기사 태그 + 도감 태그" 두 소스를 합쳐 추천한다 (API 레이어에서 처리).
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_tag_pool (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT    NOT NULL UNIQUE,
  usage_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_tag_pool_usage
  ON memorabilia_tag_pool(usage_count DESC);

CREATE TABLE IF NOT EXISTS memorabilia_tags (
  memorabilia_id  INTEGER NOT NULL REFERENCES memorabilia(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES memorabilia_tag_pool(id) ON DELETE CASCADE,
  PRIMARY KEY (memorabilia_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_tags_tag
  ON memorabilia_tags(tag_id);

--------------------------------------------------------------------------------
-- 6) FTS5 검색 인덱스
--    트리거 동기화 대신 application layer 에서 직접 upsert.
--    tokenize = trigram — 한글·영문·숫자 모두에 균등하게 동작 (SQLite 3.34+).
--    jamo_blob — 자모 분해본 (예: '잼버리' → 'ㅈㅐㅁㅂㅓㄹㅣ'), 한국어 부분 일치
--    choseong_blob — 초성만 (예: '잼버리' → 'ㅈㅂㄹ'), 초성 검색
--------------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS memorabilia_fts USING fts5(
  title_en,
  title_ko,
  event_name_en,
  event_name_ko,
  issuer_en,
  issuer_ko,
  material_en,
  material_ko,
  description_plain_en,
  description_plain_ko,
  tags_text,
  country_names_text,
  category_label_text,
  jamo_blob,
  choseong_blob,
  memorabilia_id UNINDEXED,
  tokenize = 'trigram'
);

--------------------------------------------------------------------------------
-- 7) 검색 로그 — 인기 검색어·zero-result 분석
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memorabilia_search_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  query         TEXT    NOT NULL,
  hits          INTEGER NOT NULL DEFAULT 0,
  filters_json  TEXT,
  client_ip     TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memorabilia_search_log_recent
  ON memorabilia_search_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memorabilia_search_log_zero
  ON memorabilia_search_log(created_at DESC) WHERE hits = 0;
