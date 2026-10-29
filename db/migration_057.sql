-- Gilwell Media · Migration 057
-- Phase 5 — username self-rename quota + builtin preset permission tweaks.
--
-- 1. admin_users.member_self_rename_used (0/1): members can change their own
--    username exactly once. Owner can flip this flag back to 0 to grant them
--    another rename, or rename the account directly at any time.
-- 2. Rebalances three built-in presets based on the Phase 4 permission review:
--    - writer: drop view:editors (info minimisation) + gain write:homepage-issues
--    - marketing: gain write:calendar (events/launches often originate here)
--    - reader: unchanged
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_057.sql

ALTER TABLE admin_users ADD COLUMN member_self_rename_used INTEGER NOT NULL DEFAULT 0;

-- ── writer preset ──
UPDATE admin_user_presets
   SET permissions = '{"access_admin":true,"permissions":["view:dashboard","view:analytics-visits","view:marketing","view:analytics-tags","view:geo-audience","view:list","write:list","view:write","write:write","view:calendar","write:calendar","view:glossary","view:article-scorer","write:article-scorer","view:ai-score-history","view:wosm-members","view:hero","view:home-lead","view:picks","view:board-copy","view:banner","view:ticker","view:tags","view:meta","view:author","view:contributors","view:translations","view:releases","view:homepage-issues","write:homepage-issues","view:site-history"]}',
       updated_at = datetime('now')
 WHERE slug = 'writer' AND is_builtin = 1;

-- ── marketing preset ──
UPDATE admin_user_presets
   SET permissions = '{"access_admin":true,"permissions":["view:dashboard","view:analytics-visits","write:analytics-visits","view:marketing","write:marketing","view:analytics-tags","write:analytics-tags","view:geo-audience","write:geo-audience","view:list","view:write","view:calendar","write:calendar","view:glossary","view:article-scorer","view:ai-score-history","view:wosm-members","view:hero","write:hero","view:home-lead","write:home-lead","view:picks","write:picks","view:board-copy","write:board-copy","view:banner","write:banner","view:ticker","write:ticker","view:tags","write:tags","view:meta","write:meta","view:author","view:contributors","view:editors","view:translations","view:releases","view:homepage-issues","view:site-history"]}',
       updated_at = datetime('now')
 WHERE slug = 'marketing' AND is_builtin = 1;
