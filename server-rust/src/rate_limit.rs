use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;

pub async fn ensure(env: &Env) -> Result<Response> {
    env.d1("DB")?.prepare("CREATE TABLE IF NOT EXISTS api_rate_limit (bucket_key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start_at INTEGER NOT NULL)").run().await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct Limit {
    key: String,
    now: i64,
    limit: i64,
    window: i64,
}

pub async fn enforce(req: &mut Request, env: &Env) -> Result<Response> {
    let options: Limit = req.json().await?;
    if options.limit < 1 || options.window < 1 {
        return Err(Error::RustError("Invalid rate limit".into()));
    }
    let db = env.d1("DB")?;
    let sql = "INSERT INTO api_rate_limit (bucket_key, count, window_start_at) VALUES (?, 1, ?) ON CONFLICT(bucket_key) DO UPDATE SET count = CASE WHEN ? - window_start_at >= ? THEN 1 ELSE count + 1 END, window_start_at = CASE WHEN ? - window_start_at >= ? THEN ? ELSE window_start_at END WHERE ? - window_start_at >= ? OR count < ? RETURNING count, window_start_at";
    let now = options.now as f64;
    let window = options.window as f64;
    let row = db
        .prepare(sql)
        .bind(&[
            options.key.as_str().into(),
            now.into(),
            now.into(),
            window.into(),
            now.into(),
            window.into(),
            now.into(),
            now.into(),
            window.into(),
            (options.limit as f64).into(),
        ])?
        .first::<Value>(None)
        .await?;
    if let Some(row) = row {
        let count = row
            .get("count")
            .and_then(Value::as_i64)
            .ok_or_else(|| Error::RustError("Invalid rate count".into()))?;
        return Response::from_json(
            &json!({"ok":true,"remaining":options.limit-count,"windowSeconds":options.window}),
        );
    }
    let row = db
        .prepare("SELECT count, window_start_at FROM api_rate_limit WHERE bucket_key = ?")
        .bind(&[options.key.into()])?
        .first::<Value>(None)
        .await?
        .ok_or_else(|| Error::RustError("Rate bucket disappeared".into()))?;
    let start = row
        .get("window_start_at")
        .and_then(Value::as_i64)
        .ok_or_else(|| Error::RustError("Invalid rate window".into()))?;
    let retry = options
        .window
        .saturating_sub(options.now.saturating_sub(start))
        .max(1);
    Response::from_json(
        &json!({"ok":false,"retryAfter":retry,"windowSeconds":options.window,"limit":options.limit}),
    )
}
