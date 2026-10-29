use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityInput {
    kind: String,
    raw: Value,
    allow_owner: bool,
}

#[derive(Deserialize)]
struct PermissionsInput {
    raw: Value,
    slugs: Vec<String>,
}

pub async fn validate_permissions(req: &mut Request) -> Result<Response> {
    let input: PermissionsInput = req.json().await?;
    if !input.raw.is_object() && !input.raw.is_array() {
        return Response::from_json(&json!({"ok":false,"error":"permissions는 객체여야 합니다."}));
    }
    let access = input.raw.get("access_admin").is_some_and(|v| match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    });
    let items = input
        .raw
        .get("permissions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let pattern = worker::js_sys::RegExp::new(r"^(view|write):([a-z0-9-]+)$", "");
    let mut cleaned = std::collections::BTreeSet::new();
    for entry in items.iter().filter_map(Value::as_str) {
        let Some(parts) = pattern.exec(entry) else {
            return Response::from_json(
                &json!({"ok":false,"error":format!("잘못된 권한 토큰: {entry}")}),
            );
        };
        let slug = String::from(parts.get(2));
        if !input.slugs.contains(&slug) {
            return Response::from_json(
                &json!({"ok":false,"error":format!("알 수 없는 메뉴 slug: {slug}")}),
            );
        }
        cleaned.insert(entry.to_owned());
    }
    Response::from_json(&json!({"ok":true,"value":{"access_admin":access,"permissions":cleaned}}))
}

#[allow(deprecated)]
pub async fn validate_identity(req: &mut Request) -> Result<Response> {
    let input: IdentityInput = req.json().await?;
    let raw = if input.raw.is_null() {
        String::new()
    } else {
        crate::post_routes::js_string(&input.raw)
    };
    if input.kind == "ai-limit" {
        if input.raw.is_null() || input.raw == "" {
            return Response::from_json(&json!({"ok":true,"value":null}));
        }
        let number = match &input.raw {
            Value::Bool(v) => {
                if *v {
                    1.0
                } else {
                    0.0
                }
            }
            _ => worker::js_sys::Number::new(&JsValue::from_str(&raw)).value_of(),
        };
        return Response::from_json(
            &if !number.is_finite() || !(0.0..=10000.0).contains(&number) {
                json!({"ok":false,"error":"AI 일일 한도는 0–10000 범위여야 합니다. 비우면 기본값(10) 적용."})
            } else {
                json!({"ok":true,"value":number.floor()})
            },
        );
    }
    if input.kind == "editor" && (input.raw.is_null() || input.raw == "") {
        return Response::from_json(&json!({"ok":true,"value":null}));
    }
    let name = if input.kind == "password" {
        raw.as_str()
    } else {
        crate::trim(&raw)
    };
    let name = if input.kind == "username" || input.kind == "status" {
        String::from(worker::js_sys::JsString::from(name).to_lower_case())
    } else {
        name.to_owned()
    };
    let len = name.encode_utf16().count();
    let error = match input.kind.as_str() {
        "username" if name.is_empty() => Some("아이디를 입력해주세요.".to_owned()),
        "username" if len < 3 => Some("아이디는 최소 3자 이상이어야 합니다.".to_owned()),
        "username" if len > 32 => Some("아이디는 최대 32자 이하여야 합니다.".to_owned()),
        "username"
            if !name
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_') =>
        {
            Some("아이디는 영문 소문자·숫자·언더스코어(_)만 사용할 수 있습니다.".to_owned())
        }
        "username" if !input.allow_owner && name == "owner" => {
            Some("아이디 \"owner\"는 시스템 예약어입니다.".to_owned())
        }
        "username"
            if [
                "admin",
                "administrator",
                "system",
                "root",
                "null",
                "undefined",
                "support",
                "bpmedia",
            ]
            .contains(&name.as_str()) =>
        {
            Some(format!(
                "아이디 \"{name}\"은(는) 예약되어 있어 사용할 수 없습니다."
            ))
        }
        "display" if name.is_empty() => Some("표시 이름을 입력해주세요.".to_owned()),
        "display" if len > 60 => Some("표시 이름은 최대 60자까지 입력 가능합니다.".to_owned()),
        "password" if name.is_empty() => Some("비밀번호를 입력해주세요.".to_owned()),
        "password" if len < 8 => Some("비밀번호는 최소 8자 이상이어야 합니다.".to_owned()),
        "password" if len > 256 => Some("비밀번호는 최대 256자 이하여야 합니다.".to_owned()),
        "editor" if len > 32 => Some("편집자 코드는 최대 32자까지 입력 가능합니다.".to_owned()),
        "status" if name != "active" && name != "disabled" => {
            Some("status는 active 또는 disabled여야 합니다.".to_owned())
        }
        "username" | "display" | "password" | "editor" | "status" => None,
        _ => return Err(Error::RustError("Invalid identity validation".into())),
    };
    Response::from_json(&if let Some(error) = error {
        json!({"ok":false,"error":error})
    } else {
        json!({"ok":true,"value":if input.kind=="editor" && name.is_empty(){Value::Null}else{json!(name)}})
    })
}

#[derive(Deserialize)]
struct Input {
    operation: String,
    id: Option<f64>,
    username: Option<String>,
    editor_code: Option<String>,
}

pub async fn read(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Input = req.json().await?;
    let db = env.d1("DB")?;
    if input.operation == "list" {
        let rows = db.prepare("SELECT id, username, display_name, role, permissions, editor_code, ai_daily_limit, status, must_change_password, member_self_rename_used, created_at, last_login_at, deleted_at FROM admin_users ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, status = 'deleted', created_at DESC").all().await?.results::<Value>()?;
        return Response::from_json(&json!({"items":rows}));
    }
    let row = match input.operation.as_str() {
        "id" => db.prepare("SELECT id, username, display_name, role, permissions, editor_code, ai_daily_limit, status, must_change_password, token_min_iat, member_self_rename_used, created_at, last_login_at FROM admin_users WHERE id = ? AND status != 'deleted'").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "created-row" => db.prepare("SELECT id, username, display_name, role, permissions, editor_code, ai_daily_limit, status, must_change_password, created_at, last_login_at FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "detail" => db.prepare("SELECT id, username, display_name, role, permissions, editor_code, ai_daily_limit, status, must_change_password, member_self_rename_used, created_at, last_login_at, deleted_at FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "updated-row" => db.prepare("SELECT id, username, display_name, role, permissions, editor_code, ai_daily_limit, status, must_change_password, created_at, last_login_at, deleted_at FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "delete-target" => db.prepare("SELECT id, username, role, status FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "restore-target" => db.prepare("SELECT id, username, status FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "password-user" => db.prepare("SELECT id, username, display_name, role, password_hash, status FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "totp-enabled" => db.prepare("SELECT totp_enabled FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "totp-pending" => db.prepare("SELECT totp_secret, totp_enabled FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "totp-full" => db.prepare("SELECT totp_secret, totp_enabled, totp_backup_codes FROM admin_users WHERE id = ?").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "me" => db.prepare("SELECT id, username, display_name, role, permissions, editor_code, ai_daily_limit, status, must_change_password, created_at, last_login_at FROM admin_users WHERE id = ? AND status != 'deleted'").bind(&[JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "username-clash" => db.prepare("SELECT id FROM admin_users WHERE username = ? AND id != ?").bind(&[input.username.ok_or_else(|| Error::RustError("Missing username".into()))?.into(),JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "editor-clash" => db.prepare("SELECT id FROM admin_users WHERE editor_code = ? AND status != 'deleted' AND id != ?").bind(&[input.editor_code.ok_or_else(|| Error::RustError("Missing editor code".into()))?.into(),JsValue::from_f64(input.id.ok_or_else(|| Error::RustError("Missing admin id".into()))?)])?.first::<Value>(None).await?,
        "username" => db.prepare("SELECT id, username, display_name, password_hash, role, permissions, editor_code, ai_daily_limit, status, must_change_password, token_min_iat, member_self_rename_used, created_at, last_login_at FROM admin_users WHERE username = ? AND status != 'deleted'").bind(&[input.username.ok_or_else(|| Error::RustError("Missing username".into()))?.into()])?.first::<Value>(None).await?,
        "owner-count" => db.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND status = 'active'").first::<Value>(None).await?,
        "username-any" => db.prepare("SELECT id, status FROM admin_users WHERE username = ?").bind(&[input.username.ok_or_else(|| Error::RustError("Missing username".into()))?.into()])?.first::<Value>(None).await?,
        "editor-code" => db.prepare("SELECT id FROM admin_users WHERE editor_code = ? AND status != 'deleted'").bind(&[input.editor_code.ok_or_else(|| Error::RustError("Missing editor code".into()))?.into()])?.first::<Value>(None).await?,
        _ => return Err(Error::RustError("Invalid admin lookup".into())),
    };
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct AccountMutation {
    operation: String,
    id: f64,
    value: Option<String>,
    epoch: Option<f64>,
    previous: Option<String>,
}

pub async fn account_mutation(req: &mut Request, env: &Env) -> Result<Response> {
    let input: AccountMutation = req.json().await?;
    let id = JsValue::from_f64(input.id);
    let db = env.d1("DB")?;
    let result = match input.operation.as_str() {
        "restore" => db.prepare("UPDATE admin_users SET status = 'active', deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(&[id])?.run().await?,
        "password-reset" => db.prepare("UPDATE admin_users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?").bind(&[input.value.ok_or_else(|| Error::RustError("Missing password hash".into()))?.into(),id])?.run().await?,
        "password-change" => db.prepare("UPDATE admin_users SET password_hash = ?, must_change_password = 0, token_min_iat = ?, updated_at = datetime('now') WHERE id = ?").bind(&[input.value.ok_or_else(|| Error::RustError("Missing password hash".into()))?.into(),JsValue::from_f64(input.epoch.ok_or_else(|| Error::RustError("Missing token epoch".into()))?),id])?.run().await?,
        "self-rename" => db.prepare("UPDATE admin_users SET username = ?, member_self_rename_used = 1, updated_at = datetime('now') WHERE id = ?").bind(&[input.value.ok_or_else(|| Error::RustError("Missing username".into()))?.into(),id])?.run().await?,
        "totp-start" => db.prepare("UPDATE admin_users SET totp_secret = ?, totp_enabled = 0, totp_backup_codes = NULL, updated_at = datetime('now') WHERE id = ?").bind(&[input.value.ok_or_else(|| Error::RustError("Missing secret".into()))?.into(),id])?.run().await?,
        "totp-confirm" => db.prepare("UPDATE admin_users SET totp_enabled = 1, totp_backup_codes = ?, totp_enrolled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(&[input.value.ok_or_else(|| Error::RustError("Missing backup codes".into()))?.into(),id])?.run().await?,
        "totp-disable" => db.prepare("UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0, totp_backup_codes = NULL, totp_enrolled_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(&[id])?.run().await?,
        "totp-consume" => db.prepare("UPDATE admin_users SET totp_backup_codes = ? WHERE id = ? AND totp_backup_codes = ?").bind(&[input.value.ok_or_else(|| Error::RustError("Missing backup codes".into()))?.into(),id,input.previous.ok_or_else(|| Error::RustError("Missing previous backup codes".into()))?.into()])?.run().await?,
        _ => return Err(Error::RustError("Invalid account mutation".into())),
    };
    Response::from_json(
        &json!({"success":true,"changes":result.meta()?.and_then(|meta|meta.changes)}),
    )
}

#[derive(Deserialize)]
struct Login {
    operation: String,
    key: Option<String>,
    values: Option<Vec<Value>>,
}

pub async fn login(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Login = req.json().await?;
    let db = env.d1("DB")?;
    if input.operation == "rate-read" {
        let row = db.prepare("SELECT attempt_count, first_attempt_at, last_attempt_at FROM admin_login_attempts WHERE ip = ?").bind(&[input.key.ok_or_else(|| Error::RustError("Missing rate key".into()))?.into()])?.first::<Value>(None).await?;
        return Response::from_json(&json!({"row":row}));
    }
    let (sql, count) = match input.operation.as_str() {
        "rate-write" => (
            "INSERT INTO admin_login_attempts (ip, attempt_count, first_attempt_at, last_attempt_at) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET attempt_count = admin_login_attempts.attempt_count + 1, first_attempt_at = CASE WHEN admin_login_attempts.attempt_count > 0 AND admin_login_attempts.first_attempt_at != 0 THEN admin_login_attempts.first_attempt_at ELSE excluded.first_attempt_at END, last_attempt_at = excluded.last_attempt_at",
            4,
        ),
        "rate-clear" => ("DELETE FROM admin_login_attempts WHERE ip = ?", 1),
        "bootstrap" => (
            "INSERT INTO admin_users (username, display_name, password_hash, role, permissions, status, must_change_password) VALUES (?, ?, ?, 'owner', ?, 'active', 0)",
            4,
        ),
        "last-login" => (
            "UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?",
            1,
        ),
        _ => return Err(Error::RustError("Invalid login operation".into())),
    };
    let values = input
        .values
        .ok_or_else(|| Error::RustError("Missing login values".into()))?;
    if values.len() != count {
        return Err(Error::RustError("Invalid login values".into()));
    }
    let result = db
        .prepare(sql)
        .bind(&crate::post_routes::post_bindings(&values)?)?
        .run()
        .await?;
    Response::from_json(&json!({"id":result.meta()?.and_then(|meta|meta.last_row_id)}))
}

#[derive(Deserialize)]
struct Delete {
    id: f64,
    hard: bool,
    username: String,
    anonymized: String,
}

pub async fn delete(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Delete = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(input.id);
    if input.hard {
        let names = [
            JsValue::from_str(&input.anonymized),
            JsValue::from_str(&input.username),
        ];
        let columns = db
            .prepare("PRAGMA table_info(settings_history)")
            .all()
            .await?
            .results::<Value>()?;
        if columns.is_empty() {
            return Err(Error::RustError("Missing settings history".into()));
        }
        let mut statements = vec![
            db.prepare("UPDATE operational_events SET actor = ? WHERE actor = ?")
                .bind(&names)?,
            db.prepare("UPDATE ai_usage_log SET actor = ? WHERE actor = ?")
                .bind(&names)?,
        ];
        if columns
            .iter()
            .any(|column| column.get("name").and_then(Value::as_str) == Some("actor"))
        {
            statements.push(
                db.prepare("UPDATE settings_history SET actor = ? WHERE actor = ?")
                    .bind(&names)?,
            );
        }
        statements.push(
            db.prepare("DELETE FROM admin_users WHERE id = ?")
                .bind(&[id])?,
        );
        db.batch(statements).await?;
    } else {
        db.prepare("UPDATE admin_users SET status = 'deleted', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(&[id])?.run().await?;
    }
    Response::from_json(&json!({"success":true}))
}

#[derive(Deserialize)]
struct Update {
    fields: Vec<String>,
    values: Vec<Value>,
    id: f64,
    guarded: bool,
    previous: Value,
}

pub async fn update(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Update = req.json().await?;
    let allowed = [
        "username = ?",
        "member_self_rename_used = 0",
        "display_name = ?",
        "editor_code = ?",
        "ai_daily_limit = ?",
        "permissions = ?",
        "must_change_password = ?",
        "status = ?",
        "updated_at = datetime('now')",
    ];
    if input.fields.is_empty()
        || input
            .fields
            .iter()
            .any(|field| !allowed.contains(&field.as_str()))
        || input
            .fields
            .iter()
            .filter(|field| field.contains('?'))
            .count()
            != input.values.len()
    {
        return Err(Error::RustError("Invalid admin update fields".into()));
    }
    let mut values = input.values;
    values.push(json!(input.id));
    if input.guarded {
        values.push(input.previous);
    }
    let sql = format!(
        "UPDATE admin_users SET {} WHERE id = ?{}",
        input.fields.join(", "),
        if input.guarded {
            " AND permissions = ?"
        } else {
            ""
        }
    );
    let result = env
        .d1("DB")?
        .prepare(sql)
        .bind(&crate::post_routes::post_bindings(&values)?)?
        .run()
        .await?;
    Response::from_json(&json!({"changes":result.meta()?.and_then(|meta|meta.changes)}))
}

#[derive(Deserialize)]
struct Create {
    values: Vec<Value>,
}

pub async fn create(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Create = req.json().await?;
    if input.values.len() != 8 {
        return Err(Error::RustError("Invalid admin create values".into()));
    }
    let args = crate::post_routes::post_bindings(&input.values)?;
    let result = env.d1("DB")?.prepare("INSERT INTO admin_users (username, display_name, password_hash, role, permissions, editor_code, ai_daily_limit, status, must_change_password, created_by) VALUES (?, ?, ?, 'member', ?, ?, ?, 'active', ?, ?)").bind(&args)?.run().await?;
    Response::from_json(&json!({"id":result.meta()?.and_then(|meta|meta.last_row_id)}))
}

#[derive(Deserialize)]
struct Activity {
    username: String,
    before: Option<f64>,
    limit: f64,
}

pub async fn activity(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Activity = req.json().await?;
    let mut args = vec![JsValue::from_str(&input.username)];
    let filter = if let Some(before) = input.before {
        args.push(JsValue::from_f64(before));
        " AND id < ?"
    } else {
        ""
    };
    args.push(JsValue::from_f64(input.limit));
    let sql = format!(
        "SELECT id, channel, type, level, ip, path, message, details, created_at FROM operational_events WHERE actor = ?{filter} ORDER BY id DESC LIMIT ?"
    );
    let entries = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"entries":entries}))
}

#[derive(Deserialize)]
struct Export {
    username: String,
}

pub async fn export(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Export = req.json().await?;
    let db = env.d1("DB")?;
    let ops = async { db.prepare("SELECT id, channel, type, level, ip, path, message, details, created_at FROM operational_events WHERE actor = ? ORDER BY created_at DESC LIMIT 500").bind(&[input.username.as_str().into()])?.all().await?.results::<Value>() }.await.unwrap_or_default();
    let ai = async { db.prepare("SELECT id, created_at, endpoint, model, input_chars, output_chars, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_code FROM ai_usage_log WHERE actor = ? ORDER BY created_at DESC LIMIT 500").bind(&[input.username.as_str().into()])?.all().await?.results::<Value>() }.await.unwrap_or_default();
    let pattern = format!("%{}%", input.username);
    let history = async { db.prepare("SELECT id, post_id, action, summary, created_at FROM post_history WHERE summary LIKE ? OR action IN ('create', 'update', 'delete') AND id IN (SELECT post_history.id FROM post_history JOIN operational_events oe ON oe.type LIKE 'post_%' AND oe.actor = ? AND datetime(oe.created_at) = datetime(post_history.created_at)) ORDER BY created_at DESC LIMIT 200").bind(&[pattern.as_str().into(),input.username.as_str().into()])?.all().await?.results::<Value>() }.await;
    let history = match history { Ok(rows) => rows, Err(_) => async { db.prepare("SELECT id, post_id, action, summary, created_at FROM post_history WHERE summary LIKE ? ORDER BY created_at DESC LIMIT 200").bind(&[pattern.into()])?.all().await?.results::<Value>() }.await.unwrap_or_default() };
    let settings = async { db.prepare("SELECT id, setting_key, actor, created_at, message FROM settings_history WHERE actor = ? ORDER BY created_at DESC LIMIT 200").bind(&[input.username.into()])?.all().await?.results::<Value>() }.await.unwrap_or_default();
    Response::from_json(&json!({"ops":ops,"ai":ai,"history":history,"settings":settings}))
}
