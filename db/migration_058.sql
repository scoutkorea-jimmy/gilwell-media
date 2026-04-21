-- Gilwell Media · Migration 058
-- Phase 5 follow-up — add view:kms to all three built-in presets so the
-- KMS sidebar link remains visible for writer/reader/marketing after the
-- new permission-based hiding kicks in.
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_058.sql

UPDATE admin_user_presets
   SET permissions = json_set(
         permissions,
         '$.permissions',
         (SELECT json_group_array(value)
            FROM (
              SELECT DISTINCT value FROM json_each(json_extract(permissions, '$.permissions'))
              UNION ALL
              SELECT 'view:kms'
            )
         )
       ),
       updated_at = datetime('now')
 WHERE is_builtin = 1
   AND json_extract(permissions, '$.permissions') NOT LIKE '%"view:kms"%';
