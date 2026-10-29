use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, wasm_bindgen::JsValue, *};

const TEXT_FIELDS: [(&str, usize, usize); 12] = [
    ("title", 1, 400),
    ("subtitle", 2, 400),
    ("category", 3, 40),
    ("tag", 4, 1000),
    ("meta_tags", 5, 2000),
    ("author", 6, 100),
    ("publish_at", 7, 32),
    ("youtube_url", 8, 500),
    ("image_caption", 10, 500),
    ("location_name", 12, 200),
    ("location_address", 13, 400),
    ("special_feature", 14, 200),
];

fn bindings(
    fields: &[Value],
    units: Option<&std::collections::HashMap<String, Vec<u16>>>,
) -> Result<Vec<JsValue>> {
    let mut args = crate::post_routes::post_bindings(fields)?;
    if let Some(units) = units {
        for (name, index, limit) in TEXT_FIELDS {
            let value = units
                .get(name)
                .ok_or_else(|| Error::RustError("Missing draft text".into()))?;
            args[index] = js_sys::JsString::from_char_code(&value[..value.len().min(limit)]).into();
        }
    }
    Ok(args)
}

#[derive(Deserialize)]
struct TextInput {
    units: std::collections::HashMap<String, Vec<u16>>,
}

pub async fn normalize_text(req: &mut Request) -> Result<Response> {
    let input: TextInput = req.json().await?;
    let mut units = std::collections::HashMap::new();
    for (name, _, limit) in TEXT_FIELDS {
        let value = input
            .units
            .get(name)
            .ok_or_else(|| Error::RustError("Missing draft text".into()))?;
        units.insert(name, value.iter().take(limit).copied().collect::<Vec<_>>());
    }
    Response::from_json(&json!({"units":units}))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}

fn serialize(row: Value) -> Value {
    let mut out = serde_json::Map::new();
    for key in ["id", "editing_post_id"] {
        out.insert(key.into(), row.get(key).cloned().unwrap_or(Value::Null));
    }
    for key in [
        "title",
        "subtitle",
        "category",
        "tag",
        "meta_tags",
        "author",
        "publish_at",
        "youtube_url",
        "image_url",
        "image_caption",
        "gallery_images",
        "location_name",
        "location_address",
        "special_feature",
        "manual_related_posts",
        "content",
        "created_at",
        "updated_at",
    ] {
        let value = row
            .get(key)
            .filter(|v| truthy(v))
            .cloned()
            .unwrap_or_else(|| Value::String(String::new()));
        out.insert(key.into(), value);
    }
    for key in ["published_flag", "featured_flag", "ai_assisted"] {
        out.insert(key.into(), Value::Bool(row.get(key).is_some_and(truthy)));
    }
    Value::Object(out)
}

#[derive(Deserialize)]
struct CreateOptions {
    owner: String,
    fields: Vec<Value>,
    text_units: Option<std::collections::HashMap<String, Vec<u16>>>,
}

pub async fn create(req: &mut Request, env: &Env) -> Result<Response> {
    let options: CreateOptions = req.json().await?;
    if options.fields.len() != 20 || options.owner.is_empty() {
        return Err(Error::RustError("Invalid draft creation".into()));
    }
    let db = env.d1("DB")?;
    let mut args = vec![JsValue::from_str(&options.owner)];
    args.extend(bindings(&options.fields, options.text_units.as_ref())?);
    let insert = db.prepare("INSERT INTO drafts (owner_editor_code, editing_post_id, title, subtitle, category, tag, meta_tags, author, publish_at, youtube_url, image_url, image_caption, gallery_images, location_name, location_address, special_feature, manual_related_posts, published_flag, featured_flag, ai_assisted, content) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(&args)?;
    let prune = db.prepare("DELETE FROM drafts WHERE owner_editor_code = ? AND id IN (SELECT id FROM drafts WHERE owner_editor_code = ? AND id != last_insert_rowid() ORDER BY datetime(updated_at) DESC, id DESC LIMIT -1 OFFSET 9)")
        .bind(&[options.owner.as_str().into(), options.owner.as_str().into()])?;
    let select = db
        .prepare("SELECT * FROM drafts WHERE id=last_insert_rowid() AND owner_editor_code=?")
        .bind(&[options.owner.as_str().into()])?;
    let results = db.batch(vec![insert, prune, select]).await?;
    let id = results
        .first()
        .and_then(|result| result.meta().ok().flatten())
        .and_then(|meta| meta.last_row_id)
        .unwrap_or(0);
    let row = results
        .get(2)
        .ok_or_else(|| Error::RustError("Draft result missing".into()))?
        .results::<Value>()?
        .into_iter()
        .next()
        .map(serialize);
    Response::from_json(&json!({"id":id,"draft":row}))
}

#[derive(Deserialize)]
struct DraftOptions {
    operation: String,
    owner: Option<String>,
    id: Option<f64>,
    fields: Option<Vec<Value>>,
    text_units: Option<std::collections::HashMap<String, Vec<u16>>>,
}

pub async fn operation(req: &mut Request, env: &Env) -> Result<Response> {
    let options: DraftOptions = req.json().await?;
    let db = env.d1("DB")?;
    if options.operation == "cleanup" || options.operation == "list" {
        let deleted = db
            .prepare("DELETE FROM drafts WHERE datetime(updated_at) < datetime('now', '-14 days')")
            .run()
            .await?;
        if options.operation == "cleanup" {
            return Response::from_json(
                &json!({"deleted":deleted.meta()?.and_then(|m| m.changes).unwrap_or(0)}),
            );
        }
    }
    let owner = options
        .owner
        .filter(|v| !v.is_empty())
        .ok_or_else(|| Error::RustError("Missing draft owner".into()))?;
    match options.operation.as_str() {
        "list" => {
            let rows = db.prepare("SELECT * FROM drafts WHERE owner_editor_code = ? ORDER BY datetime(updated_at) DESC, id DESC LIMIT 10").bind(&[owner.into()])?.all().await?.results::<Value>()?;
            Response::from_json(
                &json!({"drafts":rows.into_iter().map(serialize).collect::<Vec<_>>()}),
            )
        }
        "get" => {
            let row = db
                .prepare("SELECT * FROM drafts WHERE id = ? AND owner_editor_code = ?")
                .bind(&[JsValue::from_f64(options.id.unwrap_or(0.0)), owner.into()])?
                .first::<Value>(None)
                .await?;
            Response::from_json(&json!({"draft":row.map(serialize)}))
        }
        "delete" => {
            let result = db
                .prepare("DELETE FROM drafts WHERE id = ? AND owner_editor_code = ?")
                .bind(&[JsValue::from_f64(options.id.unwrap_or(0.0)), owner.into()])?
                .run()
                .await?;
            Response::from_json(
                &json!({"changes":result.meta()?.and_then(|m|m.changes).unwrap_or(0)}),
            )
        }
        "update" => {
            let fields = options
                .fields
                .ok_or_else(|| Error::RustError("Missing draft fields".into()))?;
            if fields.len() != 20 {
                return Err(Error::RustError("Invalid draft fields".into()));
            }
            let mut args = bindings(&fields, options.text_units.as_ref())?;
            args.extend([JsValue::from_f64(options.id.unwrap_or(0.0)), owner.into()]);
            let row = db.prepare("UPDATE drafts SET editing_post_id=?, title=?, subtitle=?, category=?, tag=?, meta_tags=?, author=?, publish_at=?, youtube_url=?, image_url=?, image_caption=?, gallery_images=?, location_name=?, location_address=?, special_feature=?, manual_related_posts=?, published_flag=?, featured_flag=?, ai_assisted=?, content=?, updated_at=datetime('now') WHERE id=? AND owner_editor_code=? RETURNING *").bind(&args)?.first::<Value>(None).await?;
            Response::from_json(&json!({"draft":row.map(serialize)}))
        }
        _ => Err(Error::RustError("Invalid draft operation".into())),
    }
}
