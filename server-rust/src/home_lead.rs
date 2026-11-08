use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    raw_mode: Option<String>,
    raw_post: Option<String>,
    old_media: Option<String>,
    old_revision: f64,
    next_mode: String,
    next_post: f64,
    next_post_text: String,
    next_media: Option<String>,
    last_run: String,
    revision: String,
    claim: String,
}
fn optional(value: Option<&String>) -> JsValue {
    value.map(|v| JsValue::from_str(v)).unwrap_or(JsValue::NULL)
}

pub async fn commit(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Options = req.json().await?;
    Response::from_json(&json!({"committed":commit_values(o, env).await?}))
}

async fn commit_values(o: Options, env: &Env) -> Result<bool> {
    let db = env.d1("DB")?;
    let owned = "EXISTS(SELECT 1 FROM settings WHERE key = 'home_lead_rev' AND value = ?)";
    let claim = o.claim.as_str();
    let mut statements=vec![db.prepare("INSERT INTO settings(key, value) SELECT 'home_lead_rev', ? WHERE (SELECT value FROM settings WHERE key = 'home_lead_mode') IS ? AND (SELECT value FROM settings WHERE key = 'home_lead_post') IS ? AND (SELECT value FROM settings WHERE key = 'home_lead_media') IS ? AND (? = 0 OR EXISTS(SELECT 1 FROM posts WHERE id = ? AND published = 1)) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?")
        .bind(&[claim.into(),optional(o.raw_mode.as_ref()),optional(o.raw_post.as_ref()),optional(o.old_media.as_ref()),JsValue::from_f64(o.next_post),JsValue::from_f64(o.next_post),JsValue::from_f64(o.old_revision)])?];
    let set_sql = |key: &str| {
        format!(
            "INSERT INTO settings(key, value) SELECT '{key}', ? WHERE {owned} ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
    };
    let mode = if o.next_mode == "manual" {
        "manual"
    } else {
        "auto"
    };
    statements.push(
        db.prepare(set_sql("home_lead_mode"))
            .bind(&[mode.into(), claim.into()])?,
    );
    if o.next_post != 0.0 {
        statements.push(
            db.prepare(set_sql("home_lead_post"))
                .bind(&[o.next_post_text.into(), claim.into()])?,
        );
    } else {
        statements.push(
            db.prepare(format!(
                "DELETE FROM settings WHERE key = 'home_lead_post' AND {owned}"
            ))
            .bind(&[claim.into()])?,
        );
    }
    if let Some(media) = o.next_media {
        statements.push(
            db.prepare(set_sql("home_lead_media"))
                .bind(&[media.into(), claim.into()])?,
        );
    } else {
        statements.push(
            db.prepare(format!(
                "DELETE FROM settings WHERE key = 'home_lead_media' AND {owned}"
            ))
            .bind(&[claim.into()])?,
        );
    }
    if !o.last_run.is_empty() {
        statements.push(
            db.prepare(set_sql("home_lead_auto_last_run"))
                .bind(&[o.last_run.into(), claim.into()])?,
        );
    }
    statements.push(
        db.prepare("UPDATE settings SET value = ? WHERE key = 'home_lead_rev' AND value = ?")
            .bind(&[o.revision.into(), claim.into()])?,
    );
    let results = db.batch(statements).await?;
    let changes = match results.first() {
        Some(result) => result.meta()?.and_then(|m| m.changes).unwrap_or(0),
        None => 0,
    };
    Ok(changes == 1)
}

#[derive(Deserialize)]
struct RefreshOptions {
    uuid: String,
}

struct State {
    mode: String,
    post: f64,
    revision: f64,
    raw_mode: Option<String>,
    raw_post: Option<String>,
    media: Option<String>,
}

async fn state(env: &Env) -> Result<State> {
    let rows = crate::post_routes::lead_settings(env).await?;
    let value = |key: &str| {
        rows.iter()
            .find(|row| row.get("key").and_then(Value::as_str) == Some(key))
            .and_then(|row| row.get("value"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    let raw_mode = value("home_lead_mode");
    let raw_post = value("home_lead_post");
    let parse = |text: Option<&str>| {
        let number = text
            .map(|v| worker::js_sys::parse_int(v, 10))
            .unwrap_or(0.0);
        if number.is_nan() { 0.0 } else { number }
    };
    Ok(State {
        mode: if raw_mode.as_deref() == Some("manual") {
            "manual".into()
        } else {
            "auto".into()
        },
        post: parse(raw_post.as_deref()),
        revision: parse(value("home_lead_rev").as_deref()),
        media: value("home_lead_media"),
        raw_mode,
        raw_post,
    })
}

fn number_text(n: f64) -> Result<String> {
    worker::js_sys::Number::from(n)
        .to_string_with_radix(10)
        .map(String::from)
        .map_err(|_| Error::RustError("Invalid lead number".into()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClearOptions {
    post_id: Option<f64>,
    uuid: String,
}

pub async fn clear(req: &mut Request, env: &Env) -> Result<Response> {
    let input: ClearOptions = req.json().await?;
    let previous = state(env).await?;
    if Some(previous.post) != input.post_id {
        return Response::from_json(&json!({"cleared":false}));
    }
    let revision = previous.revision + 1.0;
    if !revision.is_finite() {
        return Err(Error::RustError("Invalid lead revision".into()));
    }
    let revision_text = number_text(revision)?;
    let options = Options {
        raw_mode: previous.raw_mode,
        raw_post: previous.raw_post,
        old_media: previous.media,
        old_revision: previous.revision,
        next_mode: "auto".into(),
        next_post: 0.0,
        next_post_text: "0".into(),
        next_media: None,
        last_run: String::new(),
        revision: revision_text.clone(),
        claim: format!("{revision_text}|{}", input.uuid),
    };
    Response::from_json(&json!({"cleared":commit_values(options,env).await?}))
}

pub async fn refresh(req: &mut Request, env: &Env) -> Result<Response> {
    let input: RefreshOptions = req.json().await?;
    let previous = state(env).await?;
    if previous.mode == "manual" {
        return Response::from_json(
            &json!({"skipped":true,"mode":"manual","changed":false,"post_id":0,"previous_post_id":0,"reason":"수동 지정 모드","candidates":0}),
        );
    }
    let picked = crate::post_routes::lead_rank(env, 7).await?;
    let id = picked.get("id").and_then(Value::as_f64).unwrap_or(0.0);
    let candidates = picked.get("candidates").cloned().unwrap_or(json!(0));
    if id == 0.0 {
        return Response::from_json(
            &json!({"skipped":false,"mode":"auto","changed":false,"post_id":0,"previous_post_id":previous.post,"reason":"선정할 공개글이 없음","candidates":candidates}),
        );
    }
    let revision = previous.revision + 1.0;
    if !revision.is_finite() {
        return Err(Error::RustError("Invalid lead revision".into()));
    }
    let revision_text = number_text(revision)?;
    let changed = id != previous.post;
    let options = Options {
        raw_mode: previous.raw_mode,
        raw_post: previous.raw_post,
        old_media: previous.media.clone(),
        old_revision: previous.revision,
        next_mode: "auto".into(),
        next_post: id,
        next_post_text: number_text(id)?,
        next_media: if changed { None } else { previous.media },
        last_run: String::from(worker::js_sys::Date::new_0().to_iso_string()),
        revision: revision_text.clone(),
        claim: format!("{revision_text}|{}", input.uuid),
    };
    if !commit_values(options, env).await? {
        let latest = state(env).await?;
        return Response::from_json(
            &json!({"skipped":true,"mode":latest.mode,"changed":false,"post_id":latest.post,"previous_post_id":previous.post,"reason":"동시 운영 변경을 보존했습니다.","candidates":candidates}),
        );
    }
    Response::from_json(
        &json!({"skipped":false,"mode":"auto","changed":changed,"post_id":id,"previous_post_id":previous.post,"reason":picked.get("reason"),"candidates":candidates}),
    )
}
