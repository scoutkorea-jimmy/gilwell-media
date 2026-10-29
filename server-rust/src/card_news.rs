use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
struct Options {
    operation: String,
    id: Option<f64>,
    title: Option<String>,
    slug: Option<String>,
    data: Option<String>,
    expected: Option<String>,
    size: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeeklyOptions {
    operation: String,
    slug: Option<String>,
    title: Option<String>,
    data: Option<String>,
    size: Option<f64>,
    utc_start: Option<String>,
    utc_end: Option<String>,
    start: Option<String>,
    end: Option<String>,
    public_date_expr: Option<String>,
}

pub async fn weekly(req: &mut Request, env: &Env) -> Result<Response> {
    let options: WeeklyOptions = req.json().await?;
    let db = env.d1("DB")?;
    match options.operation.as_str() {
        "find" => {
            let slug = options
                .slug
                .ok_or_else(|| Error::RustError("Missing weekly slug".into()))?;
            let row = db
                .prepare("SELECT id,title FROM card_news WHERE slug=?")
                .bind(&[slug.into()])?
                .first::<Value>(None)
                .await?;
            Response::from_json(&json!({"row":row}))
        }
        "insert" => {
            let title = options
                .title
                .ok_or_else(|| Error::RustError("Missing weekly title".into()))?;
            let slug = options
                .slug
                .ok_or_else(|| Error::RustError("Missing weekly slug".into()))?;
            let data = options
                .data
                .ok_or_else(|| Error::RustError("Missing weekly data".into()))?;
            let size = options
                .size
                .ok_or_else(|| Error::RustError("Missing weekly size".into()))?;
            db.prepare("INSERT OR IGNORE INTO card_news(title,slug,r2_key,size_bytes,published,data) VALUES(?,?,'',?,0,?)").bind(&[title.into(),slug.as_str().into(),JsValue::from_f64(size),data.into()])?.run().await?;
            let row = db
                .prepare("SELECT id,title FROM card_news WHERE slug=?")
                .bind(&[slug.into()])?
                .first::<Value>(None)
                .await?;
            Response::from_json(&json!({"row":row}))
        }
        "candidates" => {
            let date = options
                .public_date_expr
                .ok_or_else(|| Error::RustError("Missing public date expression".into()))?;
            let utc_start = options
                .utc_start
                .ok_or_else(|| Error::RustError("Missing period start".into()))?;
            let utc_end = options
                .utc_end
                .ok_or_else(|| Error::RustError("Missing period end".into()))?;
            let start = options
                .start
                .ok_or_else(|| Error::RustError("Missing local start".into()))?;
            let end = options
                .end
                .ok_or_else(|| Error::RustError("Missing local end".into()))?;
            let sql = format!(
                "SELECT id, category, title, subtitle, content, image_url, image_caption, tag, updated_at, {date} AS public_date, ((SELECT COUNT(*) FROM site_visits WHERE path LIKE '/post/%' AND CAST(SUBSTR(path,7) AS INTEGER)=posts.id AND datetime(visited_at)>=datetime(?) AND datetime(visited_at)<=datetime(?)) +3*(SELECT COUNT(*) FROM post_likes WHERE post_id=posts.id AND datetime(liked_at)>=datetime(?) AND datetime(liked_at)<=datetime(?))) AS attention_score FROM posts WHERE published=1 AND {date}>=? AND {date}<=? AND image_url IS NOT NULL AND trim(image_url)<>'' AND category IN ('korea','apr','wosm','people') ORDER BY attention_score DESC, public_date DESC, id DESC LIMIT 60"
            );
            let rows = db
                .prepare(sql)
                .bind(&[
                    utc_start.as_str().into(),
                    utc_end.as_str().into(),
                    utc_start.into(),
                    utc_end.into(),
                    start.into(),
                    end.into(),
                ])?
                .all()
                .await?
                .results::<Value>()?;
            Response::from_json(&json!({"results":rows}))
        }
        _ => Err(Error::RustError("Invalid weekly card operation".into())),
    }
}

pub async fn admin(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Options = req.json().await?;
    let db = env.d1("DB")?;
    match o.operation.as_str() {
        "list" => {
            let rows = db.prepare("SELECT id, title, slug, size_bytes, published, created_at, updated_at, (data IS NOT NULL AND data != '') AS has_data FROM card_news ORDER BY created_at DESC, id DESC").all().await?.results::<Value>()?;
            Response::from_json(&json!({"items":rows}))
        }
        "clone-source" => {
            let row = db
                .prepare("SELECT title, data FROM card_news WHERE id = ?")
                .bind(&[JsValue::from_f64(o.id.unwrap_or(0.0))])?
                .first::<Value>(None)
                .await?;
            Response::from_json(&json!({"row":row}))
        }
        "detail" | "edit-source" | "delete-source" => {
            let sql = match o.operation.as_str() {
                "detail" => {
                    "SELECT id, title, slug, data, published, created_at, updated_at FROM card_news WHERE id = ?"
                }
                "edit-source" => "SELECT data FROM card_news WHERE id = ?",
                _ => "SELECT id, title, r2_key FROM card_news WHERE id = ?",
            };
            let row = db
                .prepare(sql)
                .bind(&[JsValue::from_f64(o.id.unwrap_or(0.0))])?
                .first::<Value>(None)
                .await?;
            Response::from_json(&json!({"row":row}))
        }
        "update" | "weekly-update" => {
            let data = o
                .data
                .ok_or_else(|| Error::RustError("Missing card data".into()))?;
            let id = JsValue::from_f64(o.id.unwrap_or(0.0));
            let (sql, args) = if o.operation == "weekly-update" {
                (
                    "UPDATE card_news SET data=?,size_bytes=?,updated_at=datetime('now') WHERE id=? AND data=?",
                    vec![
                        data.into(),
                        JsValue::from_f64(o.size.unwrap_or(0.0)),
                        id,
                        o.expected.map(JsValue::from).unwrap_or(JsValue::NULL),
                    ],
                )
            } else if let Some(title) = o.title {
                (
                    "UPDATE card_news SET data=?,title=?,updated_at=datetime('now') WHERE id=?",
                    vec![data.into(), title.into(), id],
                )
            } else {
                (
                    "UPDATE card_news SET data=?,updated_at=datetime('now') WHERE id=?",
                    vec![data.into(), id],
                )
            };
            let result = db.prepare(sql).bind(&args)?.run().await?;
            Response::from_json(
                &json!({"changes":result.meta()?.and_then(|m|m.changes).unwrap_or(0)}),
            )
        }
        "delete" => {
            let result = db
                .prepare("DELETE FROM card_news WHERE id = ?")
                .bind(&[JsValue::from_f64(o.id.unwrap_or(0.0))])?
                .run()
                .await?;
            Response::from_json(
                &json!({"changes":result.meta()?.and_then(|m|m.changes).unwrap_or(0)}),
            )
        }
        "create" => {
            let title = o
                .title
                .ok_or_else(|| Error::RustError("Missing card title".into()))?;
            let slug = o
                .slug
                .ok_or_else(|| Error::RustError("Missing card slug".into()))?;
            let data = o
                .data
                .ok_or_else(|| Error::RustError("Missing card data".into()))?;
            let result = db.prepare("INSERT INTO card_news (title, slug, r2_key, size_bytes, data) VALUES (?, ?, '', 0, ?)").bind(&[title.into(),slug.into(),data.into()])?.run().await?;
            Response::from_json(&json!({"id":result.meta()?.and_then(|m|m.last_row_id)}))
        }
        _ => Err(Error::RustError("Invalid card news operation".into())),
    }
}

#[derive(Deserialize)]
struct ArticleOptions {
    sort: String,
    category: Option<String>,
    start: String,
    end: String,
    limit: u32,
    #[serde(default)]
    project: bool,
}

pub async fn articles(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ArticleOptions = req.json().await?;
    let rows = article_query(&o, env).await?;
    if o.project {
        if let Some(items) = crate::card_excerpt::project(&rows) {
            return Response::from_json(&json!({"items":items,"projected":true}));
        }
        return Response::from_json(&json!({"items":rows,"projected":false}));
    }
    Response::from_json(&json!({"items":rows}))
}

async fn article_query(o: &ArticleOptions, env: &Env) -> Result<Vec<Value>> {
    let pub_kst = "COALESCE(p.publish_at, datetime(p.created_at, '+9 hours'))";
    let order = match o.sort.as_str() {
        "recent" => format!("{pub_kst} DESC, p.id DESC"),
        "likes" => "likes DESC, views DESC, p.id DESC".into(),
        _ => "views DESC, likes DESC, p.id DESC".into(),
    };
    let category = o.category.as_ref().filter(|v| {
        matches!(
            v.as_str(),
            "korea" | "apr" | "wosm" | "people" | "help" | "notice" | "column"
        )
    });
    let mut where_clause = String::from("p.published = 1");
    let mut args: Vec<JsValue> = Vec::new();
    if let Some(category) = category {
        where_clause.push_str(" AND p.category = ?");
        args.push(category.as_str().into());
    }
    where_clause.push_str(&format!(" AND {pub_kst} >= ? AND {pub_kst} <= ?"));
    args.extend([
        o.start.as_str().into(),
        o.end.as_str().into(),
        JsValue::from_f64(o.limit.clamp(1, 100) as f64),
    ]);
    let sql = format!(
        "SELECT p.id, p.title, p.subtitle, p.category, p.author, p.publish_at, p.created_at, p.image_url, p.image_caption, p.content, COALESCE(p.views, 0) AS views, (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes FROM posts p WHERE {where_clause} ORDER BY {order} LIMIT ?"
    );
    env.d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArticleRequest {
    sort: Option<String>,
    category: Option<String>,
    limit: Option<String>,
    start: Option<String>,
    end: Option<String>,
    fallback_start: String,
    fallback_end: String,
}

fn kst_input(raw: Option<&str>, fallback_seconds: &str) -> Option<String> {
    let input = String::from(worker::js_sys::JsString::from(raw.unwrap_or("")).trim())
        .replacen('T', " ", 1);
    let bytes = input.as_bytes();
    if !(bytes.len() == 16 || bytes.len() == 19) {
        return None;
    }
    for (i, byte) in bytes.iter().enumerate() {
        let valid = match i {
            4 | 7 => *byte == b'-',
            10 => *byte == b' ',
            13 | 16 => *byte == b':',
            _ => byte.is_ascii_digit(),
        };
        if !valid {
            return None;
        }
    }
    Some(if bytes.len() == 16 {
        format!("{input}:{fallback_seconds}")
    } else {
        input
    })
}

pub async fn articles_request(req: &mut Request, env: &Env) -> Result<Response> {
    let input: ArticleRequest = req.json().await?;
    let lower = |s: &str| String::from(worker::js_sys::JsString::from(s).to_lower_case());
    let sort = lower(
        input
            .sort
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or("views"),
    );
    let category = lower(input.category.as_deref().unwrap_or(""));
    let parsed = input
        .limit
        .as_deref()
        .map(|v| worker::js_sys::parse_int(v, 10))
        .unwrap_or(f64::NAN);
    let limit = if parsed.is_nan() || parsed < 1.0 {
        30
    } else if parsed > 100.0 {
        100
    } else {
        parsed as u32
    };
    let start = kst_input(input.start.as_deref(), "00").unwrap_or(input.fallback_start);
    let end = kst_input(input.end.as_deref(), "59").unwrap_or(input.fallback_end);
    let options = ArticleOptions {
        sort: sort.clone(),
        category: if category.is_empty() {
            None
        } else {
            Some(category.clone())
        },
        start: start.clone(),
        end: end.clone(),
        limit,
        project: true,
    };
    let rows = article_query(&options, env).await?;
    let projected = crate::card_excerpt::project(&rows);
    Response::from_json(
        &json!({"items":projected.as_ref().unwrap_or(&rows),"projected":projected.is_some(),"sort":sort,"start":start,"end":end,"category":if category.is_empty(){None}else{Some(category)},"scope":"total"}),
    )
}
