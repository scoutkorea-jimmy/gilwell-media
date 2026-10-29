CREATE TABLE IF NOT EXISTS glossary_terms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket     TEXT    NOT NULL CHECK(bucket IN ('가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하')),
  term_ko    TEXT    NOT NULL,
  term_en    TEXT    NOT NULL,
  term_fr    TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_glossary_bucket_sort ON glossary_terms(bucket, sort_order, term_ko);
