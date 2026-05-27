-- Gilwell Media · Migration 075
-- Scout Memorabilia — 이미지 출처(credit) 컬럼
--
-- 각 이미지(memorabilia_images)에 출처 텍스트를 1개 추가한다.
-- 운영자가 입력하면 도감 상세 페이지에서 이미지 하단에 노출, 비어 있으면 미노출.
-- 기존 컬럼 변경/삭제 없이 ADD COLUMN 만 사용 (CLAUDE.md DB 규칙 준수).
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_075.sql

ALTER TABLE memorabilia_images ADD COLUMN credit TEXT NOT NULL DEFAULT '';
