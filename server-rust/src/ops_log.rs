use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;

async fn setup(db: &D1Database) -> Result<()> {
    db.prepare("CREATE TABLE IF NOT EXISTS operational_events (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL DEFAULT 'site', type TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', actor TEXT, ip TEXT, path TEXT, message TEXT, details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_operational_events_time ON operational_events(created_at DESC)").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_operational_events_level_type ON operational_events(level, type, created_at DESC)").run().await?;
    Ok(())
}

pub async fn ensure(env: &Env) -> Result<Response> {
    setup(&env.d1("DB")?).await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct Input {
    values: Vec<Value>,
}

pub async fn write(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Input = req.json().await?;
    if input.values.len() != 8 {
        return Err(Error::RustError("Invalid operational event".into()));
    }
    let args = crate::post_routes::post_bindings(&input.values)?;
    let db = env.d1("DB")?;
    setup(&db).await?;
    db.prepare("INSERT INTO operational_events (channel, type, level, actor, ip, path, message, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(&args)?.run().await?;
    Response::from_json(&json!({"ok":true}))
}
