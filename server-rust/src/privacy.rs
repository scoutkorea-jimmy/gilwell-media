use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

const HTML: &str = "privacy_policy_html";
const UPDATED: &str = "privacy_policy_updated_at";

pub async fn snapshot(env: &Env) -> Result<Response> {
    let rows = env
        .d1("DB")?
        .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, 'privacy_policy_rev')")
        .bind(&[HTML.into(), UPDATED.into()])?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"results":rows}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitOptions {
    previous_html: Option<String>,
    previous_updated: Option<String>,
    previous_revision: f64,
    revision: String,
    claim: String,
    html: Option<String>,
    timestamp: Option<String>,
}
fn option(value: Option<&String>) -> JsValue {
    value.map(|v| JsValue::from_str(v)).unwrap_or(JsValue::NULL)
}

pub async fn commit(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CommitOptions = req.json().await?;
    if o.html.is_some() != o.timestamp.is_some() {
        return Err(Error::RustError("Invalid privacy state".into()));
    }
    let db = env.d1("DB")?;
    let owned = "EXISTS(SELECT 1 FROM settings WHERE key = 'privacy_policy_rev' AND value = ?)";
    let mut statements=vec![
        db.prepare("INSERT INTO settings(key, value) SELECT 'privacy_policy_rev', ? WHERE (SELECT value FROM settings WHERE key = ?) IS ? AND (SELECT value FROM settings WHERE key = ?) IS ? ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?")
            .bind(&[o.claim.as_str().into(),HTML.into(),option(o.previous_html.as_ref()),UPDATED.into(),option(o.previous_updated.as_ref()),JsValue::from_f64(o.previous_revision)])?,
        db.prepare(format!("INSERT INTO settings_history(key, value) SELECT key, value FROM settings WHERE key = ? AND {owned}"))
            .bind(&[HTML.into(),o.claim.as_str().into()])?,
    ];
    if let (Some(html), Some(timestamp)) = (o.html.as_ref(), o.timestamp.as_ref()) {
        let sql = format!(
            "INSERT INTO settings(key, value) SELECT ?, ? WHERE {owned} ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        );
        statements.push(db.prepare(&sql).bind(&[
            HTML.into(),
            html.into(),
            o.claim.as_str().into(),
        ])?);
        statements.push(db.prepare(sql).bind(&[
            UPDATED.into(),
            timestamp.into(),
            o.claim.as_str().into(),
        ])?);
    } else {
        statements.push(
            db.prepare(format!(
                "DELETE FROM settings WHERE key IN (?, ?) AND {owned}"
            ))
            .bind(&[HTML.into(), UPDATED.into(), o.claim.as_str().into()])?,
        );
    }
    statements.push(
        db.prepare("UPDATE settings SET value = ? WHERE key = 'privacy_policy_rev' AND value = ?")
            .bind(&[o.revision.into(), o.claim.into()])?,
    );
    let results = db.batch(statements).await?;
    let changes = match results.first() {
        Some(result) => result.meta()?.and_then(|meta| meta.changes).unwrap_or(0),
        None => 0,
    };
    Response::from_json(&json!({"committed":changes==1}))
}
