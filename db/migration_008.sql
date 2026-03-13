-- Migration 008: Add ai_assisted column to posts + ai_disclaimer setting
ALTER TABLE posts ADD COLUMN ai_assisted INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO settings (key, value)
VALUES ('ai_disclaimer', '본 글은 AI의 도움을 받아 작성되었습니다.');
