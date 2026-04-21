-- Gilwell Media · Migration 056
-- Admin user/permission system (Phase 1 — schema only)
--
-- Introduces admin_users (per-user login, role, fine-grained permissions)
-- and admin_user_presets (owner-editable permission templates).
-- Adds posts.author_user_id FK for author-user mapping.
-- Seeds 3 built-in presets (글쟁이·뷰어·마케팅) and publish_kill_switch=off.
--
-- Owner row is NOT seeded here — that happens lazily on first successful login
-- in Phase 2 (writes the currently valid env.ADMIN_PASSWORD hash to DB).
--
-- Usage:
--   wrangler d1 execute gilwell-posts --remote --file=./db/migration_056.sql

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  permissions TEXT NOT NULL DEFAULT '{"access_admin":false,"permissions":[]}',
  editor_code TEXT,
  ai_daily_limit INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','deleted')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  token_min_iat INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  last_login_at TEXT,
  created_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_editor_code
  ON admin_users(editor_code) WHERE editor_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_user_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE posts ADD COLUMN author_user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_posts_author_user_id ON posts(author_user_id);

-- Built-in preset: 글쟁이 (writer)
INSERT OR IGNORE INTO admin_user_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'writer',
  '글쟁이',
  '본인 글 작성·수정·발행, 나머지는 보기만. 운영 설정·노출·사용자 관리 접근 불가.',
  '{"access_admin":true,"permissions":["view:dashboard","view:analytics-visits","view:marketing","view:analytics-tags","view:geo-audience","view:list","write:list","view:write","write:write","view:calendar","write:calendar","view:glossary","view:article-scorer","write:article-scorer","view:ai-score-history","view:wosm-members","view:hero","view:home-lead","view:picks","view:board-copy","view:banner","view:ticker","view:tags","view:meta","view:author","view:contributors","view:editors","view:translations","view:releases","view:homepage-issues","view:site-history"]}',
  1
);

-- Built-in preset: 뷰어 (reader)
INSERT OR IGNORE INTO admin_user_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'reader',
  '뷰어',
  '모든 메뉴 보기만 가능. 쓰기 권한 일체 없음. 파트너 데모·감사 목적에 적합.',
  '{"access_admin":true,"permissions":["view:dashboard","view:analytics-visits","view:marketing","view:analytics-tags","view:geo-audience","view:list","view:write","view:calendar","view:glossary","view:article-scorer","view:ai-score-history","view:wosm-members","view:hero","view:home-lead","view:picks","view:board-copy","view:banner","view:ticker","view:tags","view:meta","view:author","view:contributors","view:editors","view:translations","view:releases","view:homepage-issues","view:site-history"]}',
  1
);

-- Built-in preset: 마케팅 (marketing)
INSERT OR IGNORE INTO admin_user_presets (slug, name, description, permissions, is_builtin)
VALUES (
  'marketing',
  '마케팅 담당',
  '분석·노출·SEO·태그 관리 + 모든 메뉴 보기. 게시글 작성·삭제, 사용자 관리는 불가.',
  '{"access_admin":true,"permissions":["view:dashboard","view:analytics-visits","write:analytics-visits","view:marketing","write:marketing","view:analytics-tags","write:analytics-tags","view:geo-audience","write:geo-audience","view:list","view:write","view:calendar","view:glossary","view:article-scorer","view:ai-score-history","view:wosm-members","view:hero","write:hero","view:home-lead","write:home-lead","view:picks","write:picks","view:board-copy","write:board-copy","view:banner","write:banner","view:ticker","write:ticker","view:tags","write:tags","view:meta","write:meta","view:author","view:contributors","view:editors","view:translations","view:releases","view:homepage-issues","view:site-history"]}',
  1
);

-- Publish kill switch: default off. When on, only owner can change post status
-- to published/scheduled. Members retain draft/hidden toggle on own posts.
INSERT OR IGNORE INTO settings (key, value) VALUES ('publish_kill_switch', 'off');
