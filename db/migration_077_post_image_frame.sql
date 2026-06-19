-- migration_077_post_image_frame.sql
-- 게시글 대표 이미지의 "프레이밍(초점 위치)"을 글 단위로 저장.
-- 목차/리스트 미리보기 썸네일(object-position)과 OG 공유 이미지 크롭(Cloudflare gravity)에
-- 동일하게 적용되는 단일 초점값.
-- 저장 포맷(JSON): { "x": 0-100, "y": 0-100 }  (퍼센트, 기본 중앙 50/50 = NULL)
ALTER TABLE posts ADD COLUMN image_frame TEXT;
