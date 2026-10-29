use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;

pub async fn ensure(env: &Env) -> Result<Response> {
    let db = env.d1("DB")?;
    db.prepare("CREATE TABLE IF NOT EXISTS homepage_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, issue_type TEXT NOT NULL DEFAULT 'issue', status TEXT NOT NULL DEFAULT 'open', severity TEXT NOT NULL DEFAULT 'medium', area TEXT NOT NULL DEFAULT 'homepage', source_path TEXT, summary TEXT, impact TEXT, cause TEXT, action_items TEXT, reporter TEXT, occurred_at TEXT, last_seen_at TEXT, occurrence_count INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT)").run().await?;
    let columns = match db.prepare("PRAGMA table_info(homepage_issues)").all().await {
        Ok(result) => result.results::<Value>().unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    for (name, kind) in [
        ("last_seen_at", "TEXT"),
        ("occurrence_count", "INTEGER NOT NULL DEFAULT 1"),
    ] {
        if columns.iter().any(|row| {
            row.get("name")
                .and_then(Value::as_str)
                .is_some_and(|value| super::trim(value) == name)
        }) {
            continue;
        }
        if let Err(error) = db
            .prepare(format!(
                "ALTER TABLE homepage_issues ADD COLUMN {name} {kind}"
            ))
            .run()
            .await
            && !error.to_string().contains("duplicate column name")
        {
            return Err(error);
        }
    }
    db.prepare("CREATE INDEX IF NOT EXISTS idx_homepage_issues_status_updated ON homepage_issues(status, updated_at DESC)").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_homepage_issues_severity_updated ON homepage_issues(severity, updated_at DESC)").run().await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Lookup {
    title: String,
    issue_type: String,
    area: String,
    source_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentLookup {
    source_path: String,
}

pub async fn recent_count(req: &mut Request, env: &Env) -> Result<Response> {
    let options: RecentLookup = req.json().await?;
    let row = env.d1("DB")?.prepare("SELECT occurrence_count FROM homepage_issues WHERE status IN ('open','monitoring') AND source_path = ? AND datetime(last_seen_at) > datetime('now', '-10 minutes') ORDER BY datetime(updated_at) DESC LIMIT 1").bind(&[options.source_path.into()])?.first::<Value>(None).await?;
    Response::from_json(&json!({"row":row}))
}

pub async fn find(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Lookup = req.json().await?;
    let row = env.d1("DB")?.prepare(
        "SELECT * FROM homepage_issues WHERE title = ? AND issue_type = ? AND area = ? AND COALESCE(source_path, '') = ? AND status IN ('open', 'monitoring') ORDER BY datetime(updated_at) DESC, id DESC LIMIT 1"
    ).bind(&[o.title.into(), o.issue_type.into(), o.area.into(), o.source_path.into()])?
        .first::<Value>(None).await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct Write {
    action: String,
    bindings: Vec<Value>,
}

pub async fn write(req: &mut Request, env: &Env) -> Result<Response> {
    let options: Write = req.json().await?;
    let db = env.d1("DB")?;
    let args = super::post_routes::post_bindings(&options.bindings)?;
    let id = match options.action.as_str() {
        "update" if args.len() == 10 => {
            db.prepare("UPDATE homepage_issues SET status = ?, severity = ?, summary = ?, impact = ?, cause = ?, action_items = ?, reporter = ?, occurred_at = COALESCE(occurred_at, ?), last_seen_at = ?, occurrence_count = COALESCE(occurrence_count, 1) + 1, updated_at = datetime('now') WHERE id = ?").bind(&args)?.run().await?;
            options.bindings[9]
                .as_f64()
                .ok_or_else(|| Error::RustError("Invalid issue id".into()))?
        }
        "create" if args.len() == 14 => {
            let result = db.prepare("INSERT INTO homepage_issues (title, issue_type, status, severity, area, source_path, summary, impact, cause, action_items, reporter, occurred_at, last_seen_at, occurrence_count, resolved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))").bind(&args)?.run().await?;
            result.meta()?.and_then(|m| m.last_row_id).unwrap_or(0) as f64
        }
        _ => return Err(Error::RustError("Invalid issue write".into())),
    };
    let row = db
        .prepare("SELECT * FROM homepage_issues WHERE id = ?")
        .bind(&[id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct List {
    q: String,
    status: String,
    limit: f64,
}

pub async fn list(req: &mut Request, env: &Env) -> Result<Response> {
    let options: List = req.json().await?;
    let mut conditions = Vec::new();
    let mut args = Vec::<worker::wasm_bindgen::JsValue>::new();
    if !options.q.is_empty() {
        conditions.push("(title LIKE ? OR summary LIKE ? OR impact LIKE ? OR cause LIKE ? OR action_items LIKE ? OR source_path LIKE ? OR reporter LIKE ?)");
        let pattern = format!("%{}%", options.q);
        args.extend((0..7).map(|_| pattern.as_str().into()));
    }
    if !options.status.is_empty() && options.status != "all" {
        conditions.push("status = ?");
        args.push(options.status.into());
    }
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    args.push(options.limit.into());
    let sql = format!(
        "SELECT * FROM homepage_issues {where_clause} ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'monitoring' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END ASC, CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC, datetime(updated_at) DESC, id DESC LIMIT ?"
    );
    let items = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
struct IssueId {
    id: f64,
}

pub async fn get(req: &mut Request, env: &Env) -> Result<Response> {
    let options: IssueId = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT * FROM homepage_issues WHERE id = ?")
        .bind(&[options.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    id: f64,
    status: String,
    resolved_at: Option<String>,
}

pub async fn status(req: &mut Request, env: &Env) -> Result<Response> {
    let options: Status = req.json().await?;
    let db = env.d1("DB")?;
    let resolved = options
        .resolved_at
        .as_deref()
        .map(worker::wasm_bindgen::JsValue::from_str)
        .unwrap_or(worker::wasm_bindgen::JsValue::NULL);
    db.prepare("UPDATE homepage_issues SET status = ?, resolved_at = ?, updated_at = datetime('now') WHERE id = ?").bind(&[options.status.into(), resolved, options.id.into()])?.run().await?;
    let row = db
        .prepare("SELECT * FROM homepage_issues WHERE id = ?")
        .bind(&[options.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct HistorySource {
    source: String,
    limit: f64,
}

pub async fn history_source(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HistorySource = req.json().await?;
    let db = env.d1("DB")?;
    let results = read_history_source(&db, &options.source, options.limit).await?;
    Response::from_json(&json!({"results":results}))
}

async fn read_history_source(db: &D1Database, source: &str, limit: f64) -> Result<Vec<Value>> {
    let sql = match source {
        "operational" => {
            "SELECT id, channel, type, level, actor, ip, path, message, details, created_at FROM operational_events ORDER BY datetime(created_at) DESC, id DESC LIMIT ?"
        }
        "issues" => {
            "SELECT * FROM homepage_issues ORDER BY datetime(updated_at) DESC, id DESC LIMIT ?"
        }
        "settings" => {
            "SELECT id, key, value, saved_at FROM settings_history ORDER BY datetime(saved_at) DESC, id DESC LIMIT ?"
        }
        "posts" => {
            "SELECT id, post_id, action, summary, before_snapshot, after_snapshot, created_at FROM post_history ORDER BY datetime(created_at) DESC, id DESC LIMIT ?"
        }
        _ => return Err(Error::RustError("Invalid site history source".into())),
    };
    db.prepare(sql)
        .bind(&[limit.into()])?
        .all()
        .await?
        .results::<Value>()
}

#[derive(Deserialize)]
struct HistorySourcesOptions {
    limit: f64,
}

pub async fn history_sources(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HistorySourcesOptions = req.json().await?;
    let db = env.d1("DB")?;
    let (operational, issues, settings, posts) = futures_util::join!(
        read_history_source(&db, "operational", options.limit),
        read_history_source(&db, "issues", options.limit.min(200.0)),
        read_history_source(&db, "settings", options.limit.min(150.0)),
        read_history_source(&db, "posts", options.limit.min(150.0)),
    );
    let result = |value: Result<Vec<Value>>| match value {
        Ok(rows) => json!({"results": rows}),
        Err(_) => json!({"results": [], "failed": true}),
    };
    Response::from_json(
        &json!({"operational":result(operational),"issues":result(issues),"settings":result(settings),"posts":result(posts)}),
    )
}

#[derive(Deserialize)]
struct HistoryMergeEntry {
    #[serde(default)]
    item: Value,
    #[serde(default)]
    settings: Option<Value>,
    #[serde(default)]
    post: Option<Value>,
    #[serde(default)]
    issue: Option<Value>,
    #[serde(default)]
    operational: Option<Value>,
    time: i64,
}

#[derive(Deserialize)]
struct HistoryMergeInput {
    entries: Vec<HistoryMergeEntry>,
    limit: usize,
}

fn history_entity(item: &Value) -> Option<String> {
    match item.get("entity_id")? {
        Value::String(value) if !value.is_empty() => Some(value.clone()),
        Value::Number(value) if value.as_f64().is_some_and(|n| n != 0.0) => Some(value.to_string()),
        _ => None,
    }
}

fn settings_history(row: &Value) -> Value {
    let string_or_empty = |field: &str| match row.get(field) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) if n.as_i64() != Some(0) => n.to_string(),
        _ => String::new(),
    };
    let raw_key = string_or_empty("key");
    let key = super::trim(&raw_key);
    let label = match key {
        "site_meta" => "메타/SEO",
        "board_copy" => "게시판 설명",
        "hero" => "히어로 기사",
        "hero_interval" => "히어로 전환 주기",
        "hero_media" => "히어로 미디어",
        "nav_labels" => "메뉴명",
        "translations" => "번역 문구",
        "ticker" => "헤드라인 티커",
        "author_name" => "기본 작성자",
        "ai_disclaimer" => "AI 안내 문구",
        "board_banner_events" => "게시판 배너",
        "board_card_gap" => "게시판 간격",
        "calendar_copy" => "캘린더 안내문",
        "calendar_tags" => "캘린더 태그",
        "editors" => "에디터 실명",
        "feature_definition" => "기능 정의서",
        "tags" => "글머리 태그",
        "home_lead" => "메인 스토리",
        "wosm_members" => "세계연맹 회원국",
        "reference_sites" => "기사 참고 사이트",
        "contributors" => "기고자",
        "" => "설정",
        _ => key,
    };
    let search = format!("{key} {label} {}", string_or_empty("value"));
    let search = String::from(worker::js_sys::JsString::from(search).to_lower_case());
    json!({
        "id":format!("settings-{}", string_or_empty("id")), "kind":"settings_history", "group":"settings",
        "source":"settings", "level":"info", "status":"", "occurred_at":string_or_empty("saved_at"),
        "title":format!("{label} 설정 변경"), "problem":format!("관리자에서 {label} 설정을 저장했습니다."),
        "suspected_cause":"설정 저장 직전 값이 히스토리 테이블에 보관된 이력입니다.",
        "detail":if key.is_empty() { String::new() } else { format!("key={key}") },
        "path":format!("/api/settings/{key}"), "actor":"admin", "entity_id":key,
        "entity_action":"settings_change", "search_text":search,
    })
}

fn issue_history(issue: &Value) -> Value {
    let field = |name: &str| issue.get(name).and_then(Value::as_str).unwrap_or("");
    let area = field("area");
    let normalized_area =
        String::from(worker::js_sys::JsString::from(super::trim(area)).to_lower_case());
    let source = match normalized_area.as_str() {
        "site" | "admin" | "homepage" | "api" | "data" | "ui" | "mobile" | "accessibility"
        | "analytics" | "post" | "settings" => normalized_area.as_str(),
        _ => "other",
    };
    let fallback = |names: &[&str], default: &str| {
        names
            .iter()
            .map(|name| field(name))
            .find(|value| !value.is_empty())
            .unwrap_or(default)
            .to_owned()
    };
    let occurred = fallback(
        &["updated_at", "last_seen_at", "occurred_at", "created_at"],
        "",
    );
    let title = fallback(&["title"], "사이트 이슈");
    let problem = fallback(
        &["summary", "impact", "title"],
        "사이트 이슈가 기록되었습니다.",
    );
    let cause = fallback(
        &["cause"],
        "자동 감지 또는 수동 보고로 누적된 사이트 이슈입니다.",
    );
    let detail = [field("source_path"), field("action_items")]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
    let search = [
        "title",
        "summary",
        "impact",
        "cause",
        "action_items",
        "source_path",
        "reporter",
        "area",
        "status",
    ]
    .into_iter()
    .map(field)
    .collect::<Vec<_>>()
    .join(" ");
    let search = String::from(worker::js_sys::JsString::from(search).to_lower_case());
    let id = issue.get("id").and_then(Value::as_i64).unwrap_or(0);
    json!({"id":format!("issue-{}",if id==0 {String::new()} else {id.to_string()}),"kind":"homepage_issue",
        "group":if field("issue_type")=="error" {"error"} else {"issue"},"source":source,
        "level":fallback(&["severity"],"medium"),"status":fallback(&["status"],"open"),"occurred_at":occurred,
        "title":title,"problem":problem,"suspected_cause":cause,"detail":detail,"path":field("source_path"),
        "actor":field("reporter"),"search_text":search})
}

fn operational_history(value: &Value) -> Value {
    let row = &value["row"];
    let details = &value["details"];
    let meta = &value["meta"];
    fn field<'a>(object: &'a Value, name: &str) -> &'a str {
        object.get(name).and_then(Value::as_str).unwrap_or("")
    }
    let lower = |s: &str| String::from(worker::js_sys::JsString::from(s).to_lower_case());
    let event = super::trim(field(row, "type"));
    let level = field(row, "level");
    let channel = field(row, "channel");
    let path = field(row, "path");
    let actor = field(row, "actor");
    let message = field(row, "message");
    let action = match event {
        "post_created" => "create",
        "post_updated" => "update",
        "post_status_changed" => "status",
        "post_deleted" => "delete",
        _ => "",
    };
    let group = if event.contains("login_") {
        "auth"
    } else if event == "settings_change" {
        "settings"
    } else if event.contains("post_") {
        "content"
    } else if lower(level) == "error" {
        "error"
    } else if lower(channel) == "admin" {
        "settings"
    } else {
        "issue"
    };
    let area = field(details, "area");
    let area = if area.is_empty() { "site" } else { area };
    let normalized_area = lower(super::trim(area));
    let source = if !action.is_empty() {
        "post"
    } else if event == "settings_change" {
        "settings"
    } else if path.starts_with("/api/admin/") {
        "admin"
    } else if path.starts_with("/api/settings/") {
        "settings"
    } else if path.starts_with("/api/posts") {
        "post"
    } else if path.starts_with("/api/analytics") {
        "analytics"
    } else if event == "api_error" {
        "api"
    } else if lower(channel) == "admin" {
        "admin"
    } else {
        match normalized_area.as_str() {
            "site" | "admin" | "homepage" | "api" | "data" | "ui" | "mobile" | "accessibility"
            | "analytics" | "post" | "settings" => normalized_area.as_str(),
            _ => "other",
        }
    };
    let title = match event {
        "admin_login_failed" => "관리자 로그인 실패",
        "admin_login_success" => "관리자 로그인 성공",
        "dreampath_login_failed" => "Dreampath 로그인 실패",
        "dreampath_login_success" => "Dreampath 로그인 성공",
        "settings_change" => "설정 변경",
        "post_created" => "게시글 생성",
        "post_updated" => "게시글 수정",
        "post_status_changed" => "게시글 상태 변경",
        "post_deleted" => "게시글 삭제",
        "api_error" => "API 오류",
        "homepage_issue_report" => "사이트 이슈 자동 보고",
        _ => {
            if !message.is_empty() {
                message
            } else if !event.is_empty() {
                event
            } else {
                "운영 이벤트"
            }
        }
    };
    let cause = if !field(meta, "cause").is_empty() {
        field(meta, "cause").to_owned()
    } else if !field(meta, "key").is_empty() {
        format!(
            "설정 키 `{}` 저장 과정에서 남은 운영 이력입니다.",
            field(meta, "key")
        )
    } else if !field(meta, "summary").is_empty() {
        field(meta, "summary").to_owned()
    } else if event == "api_error" && !path.is_empty() {
        format!("API `{path}` 처리 중 예외가 발생한 것으로 보입니다.")
    } else if event == "admin_login_failed" {
        "비밀번호 불일치 또는 자동화된 로그인 시도로 추정됩니다.".into()
    } else if event == "admin_login_success" {
        "정상 관리자 인증 성공 기록입니다.".into()
    } else if event == "settings_change" {
        "관리자 설정 저장으로 발생한 변경 이력입니다.".into()
    } else if event.starts_with("post_") {
        "관리자 콘텐츠 편집 작업으로 발생한 운영 이력입니다.".into()
    } else if !message.is_empty() {
        message.into()
    } else {
        "운영 이벤트 원인을 확인할 수 없습니다.".into()
    };
    let detail = [
        path.to_owned(),
        if actor.is_empty() {
            String::new()
        } else {
            format!("actor={actor}")
        },
        if field(meta, "revision").is_empty() {
            String::new()
        } else {
            format!("revision={}", field(meta, "revision"))
        },
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join(" · ");
    let entity = if event.starts_with("post_") {
        json!(meta.get("post_id").and_then(Value::as_i64).unwrap_or(0))
    } else if event == "settings_change" {
        json!(super::trim(field(meta, "key")))
    } else {
        json!(0)
    };
    let raw_id = row
        .get("id")
        .filter(|v| !v.is_null() && v.as_i64() != Some(0))
        .map(crate::post_routes::js_string)
        .unwrap_or_default();
    let level = super::trim(if level.is_empty() { "info" } else { level });
    let search = lower(&[event, message, path, actor, source, field(details, "stack")].join(" "));
    json!({"id":format!("ops-{raw_id}"),"kind":"operational","group":group,"source":source,"level":if level.is_empty(){"info"}else{level},"status":"","occurred_at":field(row,"created_at"),"title":title,"problem":if !message.is_empty(){message}else if !event.is_empty(){event}else{"운영 이벤트"},"suspected_cause":cause,"detail":detail,"path":path,"actor":actor,"event_type":event,"entity_id":entity,"entity_action":action,"search_text":search})
}

fn post_history(value: &Value) -> Value {
    let row = &value["row"];
    let current = &value["current"];
    let text = |object: &Value, field: &str| match object.get(field) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) if n.as_i64() != Some(0) => n.to_string(),
        _ => String::new(),
    };
    let id = row.get("post_id").and_then(Value::as_i64).unwrap_or(0);
    let path = if id == 0 {
        String::new()
    } else {
        format!("/post/{id}")
    };
    let raw_title = text(current, "title");
    let trimmed_title = super::trim(&raw_title);
    let title = if trimmed_title.is_empty() {
        format!(
            "게시글 #{}",
            if id == 0 {
                String::new()
            } else {
                id.to_string()
            }
        )
    } else {
        trimmed_title.to_owned()
    };
    let raw_action = text(row, "action");
    let action = match super::trim(&raw_action) {
        "" => "update",
        value => value,
    };
    let label = match action {
        "create" => "게시글 생성",
        "update" => "게시글 수정",
        "status" => "게시글 상태 변경",
        "delete" => "게시글 삭제",
        _ => "게시글 변경",
    };
    let raw_summary = text(row, "summary");
    let summary = match super::trim(&raw_summary) {
        "" => "관리자 콘텐츠 편집 작업으로 남은 변경 이력입니다.",
        value => value,
    };
    let category = text(current, "category");
    let detail = [
        if category.is_empty() {
            String::new()
        } else {
            format!("category={category}")
        },
        path.clone(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" · ");
    let search = format!("{action} {title} {raw_summary} {category} {path}");
    let search = String::from(worker::js_sys::JsString::from(search).to_lower_case());
    json!({"id":format!("post-history-{}",text(row,"id")),"kind":"post_history","group":"content","source":"post",
        "level":if action == "status" {"info"} else {"medium"},"status":action,"occurred_at":text(row,"created_at"),
        "title":title,"problem":format!("{label} · {title}"),"suspected_cause":summary,"detail":detail,"path":path,
        "actor":"","event_type":action,"entity_id":id,"entity_action":action,"search_text":search})
}

pub async fn history_merge(req: &mut Request) -> Result<Response> {
    use std::collections::HashSet;
    let mut input: HistoryMergeInput = req.json().await?;
    for entry in &mut input.entries {
        if let Some(row) = &entry.settings {
            entry.item = settings_history(row);
        } else if let Some(post) = &entry.post {
            entry.item = post_history(post);
        } else if let Some(issue) = &entry.issue {
            entry.item = issue_history(issue);
        } else if let Some(operational) = &entry.operational {
            entry.item = operational_history(operational);
        }
    }
    let mut posts = HashSet::new();
    let mut settings = HashSet::new();
    for entry in &input.entries {
        let item = &entry.item;
        if item.get("kind").and_then(Value::as_str) != Some("operational") {
            continue;
        }
        let Some(entity) = history_entity(item) else {
            continue;
        };
        let Some(action) = item
            .get("entity_action")
            .and_then(Value::as_str)
            .filter(|x| !x.is_empty())
        else {
            continue;
        };
        if action == "settings_change" {
            settings.insert(entity);
        } else {
            posts.insert((entity, action.to_owned()));
        }
    }
    input.entries.retain(|entry| {
        let item = &entry.item;
        let Some(entity) = history_entity(item) else {
            return true;
        };
        match item.get("kind").and_then(Value::as_str) {
            Some("settings_history") => !settings.contains(&entity),
            Some("post_history") => match item
                .get("entity_action")
                .and_then(Value::as_str)
                .filter(|x| !x.is_empty())
            {
                Some(action) => !posts.contains(&(entity, action.to_owned())),
                None => true,
            },
            _ => true,
        }
    });
    input
        .entries
        .sort_by_key(|entry| std::cmp::Reverse(entry.time));
    let items: Vec<Value> = input
        .entries
        .into_iter()
        .take(input.limit)
        .map(|entry| entry.item)
        .collect();
    let mut groups = serde_json::Map::new();
    for name in ["error", "issue", "auth", "settings", "content"] {
        groups.insert(
            name.to_string(),
            json!(
                items
                    .iter()
                    .filter(|item| item.get("group").and_then(Value::as_str) == Some(name))
                    .count()
            ),
        );
    }
    Response::from_json(&json!({"items":items,"groups":groups}))
}
