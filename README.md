# 길웰 미디어 / The BP Post

Independent Scout Media — bpmedia.net

---

## Versioning

- Current site version: `V00.108.00`
- Current admin version: `V03.048.00`
- Format: `Va.bbb.cc`
- `a`: product stage decided by the owner; in the history UI this maps to `Super Nova`
- `bbb`: major functional change or structural update; in the history UI this maps to `Update`
- `cc`: fix-only increment; in the history UI this maps to `Hotfix` or `Bugfix`
- When `bbb` increases, `cc` resets to `00`

All static asset cache-busting query strings should follow this same version.

Operational references:
- `CHATGPT.md`  # 메인 홈페이지 AI 작업 기준 원본
- `docs/release-playbook.md`
- 관리자 페이지 `기능 정의서 / KMS` 페이지
- `docs/feature-definition.md` (보조 스냅샷)
- `docs/homepage-module-inventory.md`  # 홈페이지 UI / 코드 모듈 분해 기준

Optional production secrets:
- `CF_ANALYTICS_API_TOKEN`: enables Cloudflare-based footer metrics and admin analytics

Required app secrets:
- `ADMIN_PASSWORD`
- `ADMIN_SECRET`

---

## Project Structure

```
gilwell-media/
├── index.html              Homepage (all categories feed)
├── korea.html              Korea / KSA bulletin board
├── apr.html                APR bulletin board
├── wosm.html               WOSM bulletin board
├── people.html             Scout People board
├── wosm-members.html       WOSM member countries status page
├── glossary.html           Scout glossary board
├── glossary-raw            Search/index-friendly glossary raw view
├── admin.html              Admin panel (requires login)
├── kms.html                Admin-only feature definition / KMS page
├── CHATGPT.md              Homepage AI guide (canonical AI-facing guide)
├── css/style.css           Shared stylesheet
├── js/
│   ├── main.js             Shared utilities (GW namespace)
│   ├── board.js            Bulletin board component
│   ├── admin-v3.js         Admin panel logic
│   ├── post-page.js        Post detail interactions
│   ├── wosm-members.js     WOSM member countries page logic
│   └── kms.js              Feature definition / KMS page logic
├── img/                    Static assets (images, icons)
├── functions/
│   ├── _shared/auth.js     HMAC-SHA256 token utilities
│   └── api/
│       ├── _middleware.js  CORS headers for all /api/* routes
│       ├── admin/login.js  POST /api/admin/login
│       ├── settings/wosm-members.js  GET/PUT WOSM member countries data
│       └── posts/
│           ├── index.js    GET /api/posts, POST /api/posts
│           └── [id].js     GET/PUT/DELETE /api/posts/:id
├── db/schema.sql           D1 database schema
├── wrangler.toml           Local dev configuration
├── .dev.vars.example       Example local secrets file
└── .gitignore
```

---

## Architecture

| Layer | Technology |
|---|---|
| Hosting | Cloudflare Pages |
| API / Server Logic | Cloudflare Functions (inside `/functions/`) |
| Database | Cloudflare D1 (SQLite-compatible) |
| Auth | HMAC-SHA256 signed session tokens |
| Frontend | Plain HTML / CSS / Vanilla JS |

Homepage AI/documentation rules:
- Homepage work should follow `CHATGPT.md`
- KMS in the admin page is the operational source of truth
- `docs/feature-definition.md` is the repository snapshot of that KMS content
- `wosm-members` data is imported from WOSM-provided `xlsx` files and then maintained in the admin settings UI

**Auth flow:**
1. Admin POSTs password to `/api/admin/login`
2. Server compares password against `ADMIN_PASSWORD` secret (never exposed to browser)
3. On success, server issues a signed 24-hour admin session and sets the auth cookie server-side
4. Client keeps lightweight login state in `sessionStorage`, but authenticated requests use same-origin cookies
5. Admin write requests are sent with browser cookies, not a client-managed `Authorization: Bearer` flow
6. Server validates the signed session cookie before any mutation

---

## 1. Local Development

### Prerequisites
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/gilwell-media.git
cd gilwell-media

# Copy and fill in local secrets
cp .dev.vars.example .dev.vars
# Edit .dev.vars and set ADMIN_PASSWORD and ADMIN_SECRET

# Create a local D1 database
wrangler d1 create gilwell-posts

# Copy the database_id printed above into wrangler.toml
# [[d1_databases]] database_id = "abc123..."

# Apply the current schema snapshot for a fresh database
./scripts/bootstrap_local_db.sh gilwell-posts

# Start local dev server (serves static files + runs Functions)
wrangler pages dev . --d1 DB=gilwell-posts

# Verify the local D1 schema and seeded settings
./scripts/smoke_check.sh gilwell-posts
```

Open `http://localhost:8788` in your browser.

---

## 2. Connecting to GitHub

If not already done:

```bash
cd gilwell-media
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/gilwell-media.git
git branch -M main
git push -u origin main
```

---

## 3. Deploying on Cloudflare Pages

### First-time setup

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages → Create application → Pages**
3. Connect your GitHub account and select the `gilwell-media` repository
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (root)
5. Click **Save and Deploy**

### Connect D1 database

1. In the Pages project, go to **Settings → Functions → D1 database bindings**
2. Add a binding:
   - **Variable name:** `DB`
   - **D1 database:** select `gilwell-posts` (or create it first — see below)
3. Save

### Set environment secrets

In the Pages project, go to **Settings → Environment variables**:

| Variable | Value | Where |
|---|---|---|
| `ADMIN_PASSWORD` | Your chosen admin password | Production |
| `ADMIN_SECRET` | A long random string (see below) | Production |
| `CF_ANALYTICS_API_TOKEN` | Optional analytics token | Production |

Generate a strong `ADMIN_SECRET`:
```bash
openssl rand -hex 32
```

> **Important:** Set these as **Secret** (encrypted) variables, not plain text.

---

## 4. Creating the D1 Database

```bash
# Create the database (run once)
wrangler d1 create gilwell-posts

# Apply schema to the REMOTE production database
wrangler d1 execute gilwell-posts --remote --file=./db/schema.sql
```

After creation, copy the `database_id` into `wrangler.toml` for local dev, and bind it in the Cloudflare Pages dashboard for production.

### Upgrading an existing database

`db/schema.sql` is a full snapshot for fresh installs.
If your production database already exists, do not re-run `db/schema.sql`.
Instead, apply only the missing files from `db/migration_001.sql` onward, in order.

### Local helper scripts

- `./scripts/bootstrap_local_db.sh gilwell-posts`
- `./scripts/smoke_check.sh gilwell-posts`
- `./scripts/deploy_production.sh`
- `./scripts/post_deploy_check.sh`
- `node ./scripts/migrate_existing_images_to_r2.mjs gilwell-posts gilwell-media-images https://bpmedia.net`

### Production release flow

```bash
git switch main
git status --short
./scripts/deploy_production.sh
./scripts/post_deploy_check.sh https://bpmedia.net
```

Notes:
- Production deploys run from `main`
- `VERSION`, `ADMIN_VERSION`, `GW.APP_VERSION`, and admin version metadata must stay in sync
- Run `./scripts/sync_versions.sh` before release verification when you change version numbers
- When homepage rules change, update `CHATGPT.md`, KMS, `docs/feature-definition.md`, and changelog together

### Optional R2 binding for images

If you want new post cover images, inline editor images, and site share images to move out of D1 and into R2, add a Pages Functions binding:

| Variable name | Type | Purpose |
|---|---|---|
| `POST_IMAGES` | R2 bucket | Stores newly uploaded cover/share/inline images |

If the binding is missing, the app falls back to the previous in-DB image behavior.

---

## 5. Admin Login

1. Navigate to `/admin.html`
2. Enter the password you set as `ADMIN_PASSWORD` in Cloudflare
3. The password is sent to `/api/admin/login` and verified server-side
4. On success, a signed 24-hour admin session is issued and the browser keeps lightweight login state in `sessionStorage`
5. You can now create, edit, and delete posts

**Capabilities:**
- Post to any of the four boards: Korea, APR, WOSM, Scout People
- Set publish date, author, featured state, tags, subtitle, SEO tags, optional YouTube link
- Attach an optional cover image and limited inline body images
- Edit or delete existing posts and review analytics/version history
- Session expires after 24 hours (simply log in again)

**To change the admin password:**
Update the `ADMIN_PASSWORD` secret in Cloudflare Pages → Settings → Environment variables.
No code changes needed.

---

## 6. Data Model

```sql
posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT    NOT NULL,   -- 'korea' | 'apr' | 'wosm' | 'people'
  title        TEXT    NOT NULL,
  subtitle     TEXT,
  content      TEXT    NOT NULL,
  image_url    TEXT,
  youtube_url  TEXT,
  tag          TEXT,
  meta_tags    TEXT,
  published    INTEGER NOT NULL DEFAULT 1,
  featured     INTEGER NOT NULL DEFAULT 0,
  views        INTEGER NOT NULL DEFAULT 0,
  author       TEXT    NOT NULL DEFAULT 'Editor.A',
  ai_assisted  INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER,
  created_at   TEXT    NOT NULL,
  publish_at   TEXT,
  updated_at   TEXT    NOT NULL
)

settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)

post_views / post_likes / site_visits
  실조회수, 공감, 방문/유입 분석용 집계 테이블
```

---

## 7. API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/login` | — | Returns session token |
| GET | `/api/posts` | — | List posts (all or by `?category=`) |
| GET | `/api/posts/:id` | — | Fetch single post with full content |
| POST | `/api/posts` | ✓ | Create post |
| PUT | `/api/posts/:id` | ✓ | Update post |
| DELETE | `/api/posts/:id` | ✓ | Delete post |

---

## 8. Security Notes

- Admin password is stored only as a Cloudflare secret — never in source code or the browser
- All write endpoints (`POST`, `PUT`, `DELETE`) verify the token on the server before touching the database
- Session tokens are HMAC-SHA256 signed with `ADMIN_SECRET` and expire after 24 hours
- Image URLs are validated server-side (only `http://` and `https://` allowed)
- All user-visible text is HTML-escaped before rendering
- `.dev.vars` is in `.gitignore` — local secrets are never committed

---

## 9. Redeploy After Changes

Git 연동 자동 배포가 동작하는 구성이어도, 실제 운영에서는 자동 배포 지연이나 누락이 발생할 수 있습니다.
관리자 콘솔과 KMS 변경은 공개 사이트 production 검수 게이트와 분리합니다.
관리자(KMS 포함) 변경은 관리자 실환경에서 직접 확인하며, 공개 페이지 변경이 없으면 production 체크리스트 통과를 완료 조건으로 삼지 않습니다.

1. `git switch main`
2. `git status --short`
3. `./scripts/deploy_production.sh`
4. 라이브 `https://bpmedia.net/js/main.js?v=<VERSION>` 의 `GW.APP_VERSION` 확인
5. 관리자 전용 변경이면 `/admin` HTML에 연결된 `admin-v3.css/js` 쿼리 버전과 `GW.ADMIN_VERSION`을 함께 확인
6. `./scripts/post_deploy_check.sh https://bpmedia.net`
