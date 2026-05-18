-- Gilwell Media · Migration 069
-- Unify all contact emails (tip / inquiry / privacy / glossary fallback) to
-- scoutkorea@kakao.com. This rewrites the live site_meta.footer block so the
-- public footer reflects the new address immediately without a code deploy.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_069.sql

UPDATE settings
   SET value = json_set(
     json_set(value, '$.footer.tip_email', 'scoutkorea@kakao.com'),
     '$.footer.contact_email', 'scoutkorea@kakao.com'
   )
 WHERE key = 'site_meta';
