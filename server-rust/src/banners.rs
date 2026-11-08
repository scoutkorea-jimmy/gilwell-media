use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

const COLUMNS: &str = "id, image_url, link_url, title, sort_order, active, starts_at, ends_at";
#[derive(Deserialize)]
struct ListOptions {
    active: bool,
}
pub async fn list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ListOptions = req.json().await?;
    let db = env.d1("DB")?;
    let rows = if o.active {
        let sql = format!(
            "SELECT {COLUMNS} FROM home_banners WHERE active = 1 AND (starts_at IS NULL OR trim(starts_at) = '' OR datetime(starts_at) <= datetime('now')) AND (ends_at IS NULL OR trim(ends_at) = '' OR datetime(ends_at) >= datetime('now')) ORDER BY sort_order ASC, id ASC LIMIT ?"
        );
        db.prepare(sql)
            .bind(&[JsValue::from_f64(2.0)])?
            .all()
            .await?
            .results::<Value>()?
    } else {
        let sql = format!(
            "SELECT {COLUMNS}, created_at, updated_at FROM home_banners ORDER BY sort_order ASC, id ASC"
        );
        db.prepare(sql).all().await?.results::<Value>()?
    };
    Response::from_json(&json!({"rows":rows}))
}
pub async fn snapshot(env: &Env) -> Result<Response> {
    let db = env.d1("DB")?;
    let result=db.batch(vec![db.prepare(format!("SELECT {COLUMNS}, created_at, updated_at FROM home_banners ORDER BY sort_order ASC, id ASC")),db.prepare("SELECT value FROM settings WHERE key = 'home_banners_rev'")]).await?;
    let banners = result[0].results::<Value>()?;
    let revision = result[1].results::<Value>()?;
    Response::from_json(&json!({"banners":banners,"revisionRows":revision}))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitOptions {
    current_rev: f64,
    next_rev: String,
    claim: String,
    rows: Vec<Banner>,
}
#[derive(Deserialize)]
struct Banner {
    image_url: String,
    link_url: String,
    title: String,
    sort_order: f64,
    active: f64,
    starts_at: String,
    ends_at: String,
}
fn nonempty(s: &str) -> JsValue {
    if s.is_empty() {
        JsValue::NULL
    } else {
        JsValue::from_str(s)
    }
}
pub async fn commit(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CommitOptions = req.json().await?;
    if o.rows.len() > 2 {
        return Err(Error::RustError("Too many banners".into()));
    }
    let db = env.d1("DB")?;
    let claim = o.claim.as_str();
    let mut stmts=vec![db.prepare("INSERT INTO settings(key, value) VALUES('home_banners_rev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?").bind(&[claim.into(),JsValue::from_f64(o.current_rev)])?,
        db.prepare("DELETE FROM home_banners WHERE EXISTS(SELECT 1 FROM settings WHERE key = 'home_banners_rev' AND value = ?)").bind(&[claim.into()])?];
    for r in &o.rows {
        stmts.push(db.prepare("INSERT INTO home_banners (image_url, link_url, title, sort_order, active, starts_at, ends_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now') WHERE EXISTS(SELECT 1 FROM settings WHERE key = 'home_banners_rev' AND value = ?)")
            .bind(&[r.image_url.as_str().into(),nonempty(&r.link_url),r.title.as_str().into(),JsValue::from_f64(r.sort_order),JsValue::from_f64(r.active),nonempty(&r.starts_at),nonempty(&r.ends_at),claim.into()])?);
    }
    stmts.push(
        db.prepare("UPDATE settings SET value = ? WHERE key = 'home_banners_rev' AND value = ?")
            .bind(&[o.next_rev.into(), claim.into()])?,
    );
    let result = db.batch(stmts).await?;
    let changes = match result.first() {
        Some(row) => row.meta()?.and_then(|m| m.changes).unwrap_or(0),
        None => 0,
    };
    Response::from_json(&json!({"committed":changes==1}))
}
