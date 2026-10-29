use serde::Deserialize;
use serde_json::{Value, json};
use worker::{
    js_sys,
    wasm_bindgen::{JsCast, JsValue},
    *,
};

#[derive(Deserialize)]
struct UploadValidation {
    header: String,
    length: usize,
    limit: usize,
}

pub async fn validate_upload(req: &mut Request) -> Result<Response> {
    let input: UploadValidation = req.json().await?;
    if input.length == 0 {
        return Response::from_json(&json!({"code":"missing_data_url","status":400}));
    }
    if !input.header.starts_with("data:image/") {
        return Response::from_json(&json!({"code":"invalid_data_url","status":400}));
    }
    let mime = String::from(js_sys::JsString::from(&input.header[5..]).to_lower_case());
    if ![
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
    ]
    .contains(&mime.as_str())
    {
        return Response::from_json(
            &json!({"code":"unsupported_type","status":415,"extra":{"detected":if mime.is_empty(){"unknown"}else{&mime}}}),
        );
    }
    if input.length > input.limit {
        return Response::from_json(
            &json!({"code":"too_large","status":413,"extra":{"received_bytes":input.length,"limit_bytes":input.limit}}),
        );
    }
    Response::from_json(&json!({"valid":true}))
}

#[derive(Deserialize)]
struct CountryCatalogInput {
    entries: Vec<(String, String)>,
}

pub async fn country_catalog(req: &mut Request) -> Result<Response> {
    let mut input: CountryCatalogInput = req.json().await?;
    let ko = js_sys::Array::new();
    ko.push(&"ko".into());
    let options = js_sys::Object::new();
    input.entries.sort_by(|a, b| {
        js_sys::JsString::from(a.1.as_str())
            .locale_compare(&b.1, &ko, &options)
            .cmp(&0)
    });
    let en = js_sys::Array::new();
    en.push(&"en".into());
    js_sys::Reflect::set(&options, &"type".into(), &"region".into())
        .map_err(|_| Error::RustError("Invalid country display options".into()))?;
    let display = js_sys::Intl::DisplayNames::new(&en, &options);
    let items: Vec<Value> = input
        .entries
        .into_iter()
        .map(|(code, name_ko)| {
            let name_en = display
                .of(&code)
                .map(String::from)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| code.clone());
            json!({"code":code,"name_ko":name_ko,"name_en":name_en})
        })
        .collect();
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListOptions {
    include_drafts: bool,
    pattern: Option<String>,
    event_id: Option<f64>,
    random: bool,
    page_size: f64,
    offset: f64,
}
pub async fn list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ListOptions = req.json().await?;
    let mut where_parts = Vec::new();
    let mut args = Vec::<JsValue>::new();
    if let Some(pattern) = o.pattern.as_ref() {
        where_parts
            .push("(LOWER(m.title_en) LIKE ? ESCAPE '\\' OR LOWER(m.title_ko) LIKE ? ESCAPE '\\')");
        args.extend([pattern.into(), pattern.into()]);
    }
    if !o.include_drafts {
        where_parts.push("m.status = 'public'");
    }
    if let Some(event) = o.event_id {
        where_parts.push("m.event_id = ?");
        args.push(JsValue::from_f64(event));
    }
    let condition = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };
    let order = if o.random {
        "ORDER BY RANDOM()"
    } else {
        "ORDER BY COALESCE(m.published_at, m.updated_at) DESC, m.id DESC"
    };
    let sql = format!(
        "SELECT m.id, m.slug, m.title_en, m.title_ko, m.has_event, m.event_id, m.event_name_en, m.event_name_ko, m.year, m.status, m.category_id, m.published_at, m.updated_at, c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko, (SELECT url FROM memorabilia_images WHERE memorabilia_id = m.id ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) AS primary_image_url, (SELECT json_group_array(p.label) FROM memorabilia_tags mt JOIN memorabilia_tag_pool p ON p.id = mt.tag_id WHERE mt.memorabilia_id = m.id) AS tags_json FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id = m.category_id {condition} {order} LIMIT ? OFFSET ?"
    );
    let db = env.d1("DB")?;
    let mut list_args = args.clone();
    list_args.extend([JsValue::from_f64(o.page_size), JsValue::from_f64(o.offset)]);
    let rows = db
        .prepare(sql)
        .bind(&list_args)?
        .all()
        .await?
        .results::<Value>()?;
    let total = db
        .prepare(format!(
            "SELECT COUNT(*) AS n FROM memorabilia m {condition}"
        ))
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"rows":rows,"total":total}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetailOptions {
    id: Option<f64>,
    slug: Option<String>,
    include_drafts: bool,
    #[serde(default)]
    hydrate: bool,
}

fn js_json(raw: Option<&Value>) -> Option<Value> {
    let raw = match raw {
        None | Some(Value::Null) => return Some(Value::Null),
        Some(Value::String(s)) => s,
        _ => return None,
    };
    let parsed = match js_sys::JSON::parse(raw) {
        Ok(value) => value,
        Err(_) => return Some(Value::Null),
    };
    let serialized = js_sys::JSON::stringify(&parsed).ok()?.as_string()?;
    serde_json::from_str(&serialized).ok()
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}

fn detail_item(
    row: &Value,
    images: &[Value],
    countries: &[Value],
    tags: &[Value],
    event: &Option<Value>,
    related_data: (&[f64], &[Value]),
    labels: &std::collections::HashMap<String, String>,
) -> Option<Value> {
    let parsed_ids = js_json(row.get("related_memorabilia_json"))?;
    if truthy(&parsed_ids) && !parsed_ids.is_array() {
        return None;
    }
    let links = js_json(row.get("related_links_json"))?;
    let code_label = |code: &Value| -> Option<Value> {
        match code {
            Value::Null => Some(Value::Null),
            Value::String(s) if s.len() == 2 && s.bytes().all(|c| c.is_ascii_alphabetic()) => {
                Some(json!(labels.get(s).filter(|v| !v.is_empty()).unwrap_or(s)))
            }
            _ => None,
        }
    };
    let mut related = Vec::new();
    let key = |n: f64| {
        if n == 0.0 {
            0.0_f64.to_bits()
        } else {
            n.to_bits()
        }
    };
    let by_id = related_data
        .1
        .iter()
        .filter_map(|row| {
            row.get("id")
                .and_then(Value::as_f64)
                .map(|id| (key(id), row))
        })
        .collect::<std::collections::HashMap<_, _>>();
    for id in related_data.0 {
        if let Some(found) = by_id.get(&key(*id)) {
            let mut item = (*found).clone();
            let code = item.get("country_code").unwrap_or(&Value::Null);
            let label = if truthy(code) {
                code_label(code)?
            } else {
                json!("")
            };
            item.as_object_mut()?
                .insert("country_label_ko".into(), label);
            related.push(item);
        }
    }
    let country_codes = countries
        .iter()
        .map(|r| r.get("country_code").cloned().unwrap_or(Value::Null))
        .collect::<Vec<_>>();
    let country_labels = country_codes
        .iter()
        .map(code_label)
        .collect::<Option<Vec<_>>>()?;
    let tag_labels = tags
        .iter()
        .map(|r| r.get("label").cloned().unwrap_or(Value::Null))
        .collect::<Vec<_>>();
    let ids = related
        .iter()
        .map(|r| r.get("id").cloned().unwrap_or(Value::Null))
        .collect::<Vec<_>>();
    let mut item = row.clone();
    let result = item.as_object_mut()?;
    result.insert("event".into(), event.clone().unwrap_or(Value::Null));
    result.insert(
        "related_links".into(),
        if truthy(&links) { links } else { json!([]) },
    );
    result.insert("related_memorabilia".into(), json!(related));
    result.insert("related_memorabilia_ids".into(), json!(ids));
    result.insert("images".into(), json!(images));
    result.insert("country_codes".into(), json!(country_codes));
    result.insert("country_labels_ko".into(), json!(country_labels));
    result.insert("tags".into(), json!(tag_labels));
    Some(item)
}
pub async fn detail(req: &mut Request, env: &Env) -> Result<Response> {
    let o: DetailOptions = req.json().await?;
    Response::from_json(&detail_data(o, env).await?)
}

async fn detail_data(o: DetailOptions, env: &Env) -> Result<Value> {
    let db = env.d1("DB")?;
    let (condition, arg) = match (o.id, o.slug.as_ref()) {
        (Some(id), None) => ("m.id = ?", JsValue::from_f64(id)),
        (None, Some(slug)) => ("m.slug = ?", JsValue::from_str(slug)),
        _ => return Err(Error::RustError("Invalid memorabilia identifier".into())),
    };
    let sql = format!(
        "SELECT m.*, c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id = m.category_id WHERE {condition}"
    );
    let row = db.prepare(sql).bind(&[arg])?.first::<Value>(None).await?;
    let row = match row {
        Some(row)
            if o.include_drafts || row.get("status").and_then(Value::as_str) == Some("public") =>
        {
            row
        }
        _ => return Ok(json!({"row":null})),
    };
    let id = row
        .get("id")
        .and_then(Value::as_f64)
        .ok_or_else(|| Error::RustError("Invalid memorabilia ID".into()))?;
    let id_arg = [JsValue::from_f64(id)];
    let images=db.prepare("SELECT id, url, alt_en, alt_ko, credit, is_primary, sort_order FROM memorabilia_images WHERE memorabilia_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC").bind(&id_arg)?.all().await?.results::<Value>()?;
    let countries=db.prepare("SELECT country_code FROM memorabilia_countries WHERE memorabilia_id = ? ORDER BY country_code").bind(&id_arg)?.all().await?.results::<Value>()?;
    let tags=db.prepare("SELECT p.id, p.label FROM memorabilia_tag_pool p JOIN memorabilia_tags mt ON mt.tag_id = p.id WHERE mt.memorabilia_id = ? ORDER BY p.label").bind(&id_arg)?.all().await?.results::<Value>()?;
    let event = if let Some(event_id) = row
        .get("event_id")
        .and_then(Value::as_f64)
        .filter(|id| *id != 0.0)
    {
        db.prepare("SELECT id, slug, name_en, name_ko, start_year, start_month, start_day, end_year, end_month, end_day, description_en, description_ko, usage_count FROM memorabilia_events WHERE id = ?").bind(&[JsValue::from_f64(event_id)])?.first::<Value>(None).await?
    } else {
        None
    };
    let mut related_ids = Vec::new();
    if let Some(raw) = row.get("related_memorabilia_json").and_then(Value::as_str)
        && let Ok(parsed) = js_sys::JSON::parse(raw)
        && js_sys::Array::is_array(&parsed)
    {
        let parse = js_sys::Reflect::get(&js_sys::global(), &"parseInt".into())
            .map_err(|_| Error::RustError("parseInt unavailable".into()))?
            .dyn_into::<js_sys::Function>()
            .map_err(|_| Error::RustError("parseInt unavailable".into()))?;
        for item in js_sys::Array::from(&parsed).iter() {
            let value = parse
                .call2(&JsValue::UNDEFINED, &item, &JsValue::from_f64(10.0))
                .map_err(|_| Error::RustError("invalid related ID".into()))?
                .as_f64()
                .unwrap_or(f64::NAN);
            if value.is_finite() && value != id {
                related_ids.push(value);
            }
        }
    }
    let related_rows = related_query(&db, &related_ids).await?;
    let event = event.map(event_with_period);
    let item = o
        .hydrate
        .then(|| {
            static LABELS: std::sync::OnceLock<std::collections::HashMap<String, String>> =
                std::sync::OnceLock::new();
            let labels = LABELS.get_or_init(|| {
                serde_json::from_str(include_str!("country_labels.json"))
                    .expect("generated country labels")
            });
            detail_item(
                &row,
                &images,
                &countries,
                &tags,
                &event,
                (&related_ids, &related_rows),
                labels,
            )
        })
        .flatten();
    if let Some(item) = item {
        return Ok(json!({"item":item}));
    }
    Ok(
        json!({"row":row,"images":images,"countries":countries,"tags":tags,"event":event,"relatedRows":related_rows}),
    )
}

#[derive(Deserialize)]
struct PublicSlug {
    slug: String,
}

pub async fn public_slug(req: &mut Request, env: &Env) -> Result<Response> {
    let input: PublicSlug = req.json().await?;
    let truncated = js_sys::JsString::from(input.slug.as_str())
        .trim()
        .slice(0, 120);
    let units = (0..truncated.length())
        .map(|i| truncated.char_code_at(i) as u16)
        .collect::<Vec<_>>();
    let Ok(slug) = String::from_utf16(&units) else {
        return Response::empty().map(|r| r.with_status(409));
    };
    let (status, value) = if slug.is_empty() {
        (400, json!({"error":"invalid_slug"}))
    } else {
        let data = detail_data(
            DetailOptions {
                id: None,
                slug: Some(slug),
                include_drafts: false,
                hydrate: true,
            },
            env,
        )
        .await?;
        if let Some(item) = data.get("item") {
            (200, json!({"item":item}))
        } else if data.get("row").is_some_and(Value::is_null) {
            (404, json!({"error":"not_found"}))
        } else {
            return Response::empty().map(|r| r.with_status(409));
        }
    };
    let mut response = Response::from_json(&value)?.with_status(status);
    response
        .headers_mut()
        .set("Content-Type", "application/json; charset=utf-8")?;
    if status == 200 {
        response.headers_mut().set(
            "Cache-Control",
            "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
        )?;
    }
    Ok(response)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetailResponse {
    id: f64,
    include_drafts: bool,
}

pub async fn id_response(req: &mut Request, env: &Env) -> Result<Response> {
    let input: DetailResponse = req.json().await?;
    let data = detail_data(
        DetailOptions {
            id: Some(input.id),
            slug: None,
            include_drafts: input.include_drafts,
            hydrate: true,
        },
        env,
    )
    .await?;
    let (status, value) = if let Some(item) = data.get("item") {
        (200, json!({"item":item}))
    } else if data.get("row").is_some_and(Value::is_null) {
        (404, json!({"error":"not_found"}))
    } else {
        return Response::empty().map(|r| r.with_status(409));
    };
    let mut response = Response::from_json(&value)?.with_status(status);
    response
        .headers_mut()
        .set("Content-Type", "application/json; charset=utf-8")?;
    if status == 200 && input.include_drafts {
        response.headers_mut().set("Cache-Control", "no-store")?;
    }
    Ok(response)
}

#[derive(Deserialize)]
struct RelatedOptions {
    ids: Vec<f64>,
}
pub async fn related(req: &mut Request, env: &Env) -> Result<Response> {
    let o: RelatedOptions = req.json().await?;
    let rows = related_query(&env.d1("DB")?, &o.ids).await?;
    Response::from_json(&json!({"rows":rows}))
}

async fn related_query(db: &D1Database, ids: &[f64]) -> Result<Vec<Value>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT m.id, m.slug, m.title_en, m.title_ko, m.year, m.category_id, c.label_ko AS category_label_ko, c.label_en AS category_label_en, (SELECT country_code FROM memorabilia_countries WHERE memorabilia_id = m.id ORDER BY country_code LIMIT 1) AS country_code, (SELECT url FROM memorabilia_images WHERE memorabilia_id = m.id ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) AS image_url FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id = m.category_id WHERE m.id IN ({placeholders}) AND m.status = 'public'"
    );
    let args: Vec<JsValue> = ids.iter().map(|id| JsValue::from_f64(*id)).collect();
    let rows = db
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    Ok(rows)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateOptions {
    values: Vec<Value>,
    previous_updated: Option<String>,
    old_event_id: Option<f64>,
    new_event_id: Option<f64>,
    countries: Vec<String>,
    tags: Vec<String>,
    images: Vec<Image>,
    related: Vec<RelatedPatch>,
    fts: Vec<Value>,
    claim: String,
    tag_snapshots: Vec<TagSnapshot>,
    category_snapshot: Option<CategorySnapshot>,
    event_snapshot: Option<EventSnapshot>,
}
#[derive(Deserialize)]
struct TagSnapshot {
    label: String,
    id: Option<f64>,
}
#[derive(Deserialize)]
struct CategorySnapshot {
    id: f64,
    exists: bool,
    en: Option<String>,
    ko: Option<String>,
}
#[derive(Deserialize)]
struct EventSnapshot {
    id: f64,
    en: Option<String>,
    ko: Option<String>,
}
#[derive(Deserialize)]
struct Image {
    url: String,
    alt_en: String,
    alt_ko: String,
    credit: String,
    is_primary: f64,
    sort_order: f64,
}
#[derive(Deserialize)]
struct RelatedPatch {
    id: f64,
    previous: Option<String>,
    value: String,
    change: bool,
}
fn maybe(v: Option<&String>) -> JsValue {
    v.map(|s| JsValue::from_str(s)).unwrap_or(JsValue::NULL)
}
pub async fn update(req: &mut Request, env: &Env) -> Result<Response> {
    let o: UpdateOptions = req.json().await?;
    if o.values.len() != 25
        || o.fts.len() != 16
        || o.countries.len() > 8
        || o.tags.len() > 30
        || o.images.len() > 20
        || o.related.len() > 12
    {
        return Err(Error::RustError("Invalid memorabilia update values".into()));
    }
    let id = o.values[22]
        .as_f64()
        .ok_or_else(|| Error::RustError("Invalid memorabilia id".into()))?;
    let db = env.d1("DB")?;
    let claim = o.claim.as_str();
    let guard = "EXISTS(SELECT 1 FROM memorabilia WHERE id = ? AND updated_at = ?)";
    let guarded = |mut v: Vec<JsValue>| {
        v.push(JsValue::from_f64(id));
        v.push(JsValue::from_str(claim));
        v
    };
    let mut args = crate::post_routes::post_bindings(&o.values)?;
    args.insert(20, JsValue::from_str(claim));
    args.push(maybe(o.previous_updated.as_ref()));
    let sql = "UPDATE memorabilia SET title_en = ?, title_ko = ?, has_event = ?, event_id = ?, event_name_en = ?, event_name_ko = ?, year = ?, category_id = ?, material_en = ?, material_ko = ?, size_text = ?, issuer_en = ?, issuer_ko = ?, description_en = ?, description_ko = ?, description_plain_en = ?, description_plain_ko = ?, related_links_json = ?, related_memorabilia_json = ?, status = ?, updated_at = ?, published_at = CASE WHEN ? = 'public' AND published_at IS NULL THEN datetime('now') WHEN ? = 'draft' THEN published_at ELSE published_at END WHERE id = ? AND (? IS NULL OR updated_at = ?) AND updated_at IS ?";
    let mut stmts = vec![db.prepare(sql).bind(&args)?];
    // Invalid JSON deliberately aborts the D1 batch when a prepared dependency changed.
    for tag in &o.tag_snapshots {
        let mut check = guarded(vec![]);
        check.extend([
            tag.label.as_str().into(),
            tag.id.map(JsValue::from_f64).unwrap_or(JsValue::NULL),
        ]);
        stmts.push(db.prepare(format!("SELECT CASE WHEN {guard} AND (SELECT id FROM memorabilia_tag_pool WHERE label = ?) IS NOT ? THEN json('invalid') ELSE NULL END")).bind(&check)?);
    }
    if let Some(category) = &o.category_snapshot {
        let mut check = guarded(vec![]);
        check.push(JsValue::from_f64(category.id));
        let condition = if category.exists {
            check.extend([maybe(category.en.as_ref()), maybe(category.ko.as_ref())]);
            "NOT EXISTS(SELECT 1 FROM memorabilia_categories WHERE id = ? AND label_en IS ? AND label_ko IS ?)"
        } else {
            "EXISTS(SELECT 1 FROM memorabilia_categories WHERE id = ?)"
        };
        stmts.push(
            db.prepare(format!(
                "SELECT CASE WHEN {guard} AND {condition} THEN json('invalid') ELSE NULL END"
            ))
            .bind(&check)?,
        );
    }
    if let Some(event) = &o.event_snapshot {
        let mut check = guarded(vec![]);
        check.extend([
            JsValue::from_f64(event.id),
            maybe(event.en.as_ref()),
            maybe(event.ko.as_ref()),
        ]);
        stmts.push(db.prepare(format!("SELECT CASE WHEN {guard} AND NOT EXISTS(SELECT 1 FROM memorabilia_events WHERE id = ? AND name_en IS ? AND name_ko IS ?) THEN json('invalid') ELSE NULL END")).bind(&check)?);
    }
    if o.old_event_id != o.new_event_id {
        if let Some(old) = o.old_event_id {
            stmts.push(db.prepare(format!("UPDATE memorabilia_events SET usage_count = MAX(usage_count - 1, 0) WHERE id = ? AND {guard}")).bind(&guarded(vec![JsValue::from_f64(old)]))?);
        }
        if let Some(new) = o.new_event_id {
            stmts.push(db.prepare(format!("UPDATE memorabilia_events SET usage_count = usage_count + 1 WHERE id = ? AND {guard}")).bind(&guarded(vec![JsValue::from_f64(new)]))?);
        }
    }
    stmts.push(
        db.prepare(format!(
            "DELETE FROM memorabilia_countries WHERE memorabilia_id = ? AND {guard}"
        ))
        .bind(&guarded(vec![JsValue::from_f64(id)]))?,
    );
    for code in &o.countries {
        stmts.push(db.prepare(format!("INSERT OR IGNORE INTO memorabilia_countries (memorabilia_id, country_code) SELECT ?, ? WHERE {guard}")).bind(&guarded(vec![JsValue::from_f64(id),code.into()]))?);
    }
    stmts.push(
        db.prepare(format!(
            "DELETE FROM memorabilia_tags WHERE memorabilia_id = ? AND {guard}"
        ))
        .bind(&guarded(vec![JsValue::from_f64(id)]))?,
    );
    for tag in &o.tags {
        stmts.push(
            db.prepare(format!(
                "INSERT OR IGNORE INTO memorabilia_tag_pool (label) SELECT ? WHERE {guard}"
            ))
            .bind(&guarded(vec![tag.into()]))?,
        );
        stmts.push(db.prepare(format!("INSERT OR IGNORE INTO memorabilia_tags (memorabilia_id, tag_id) SELECT ?, id FROM memorabilia_tag_pool WHERE label = ? AND {guard}")).bind(&guarded(vec![JsValue::from_f64(id),tag.into()]))?);
    }
    stmts.push(db.prepare(format!("UPDATE memorabilia_tag_pool SET usage_count = (SELECT COUNT(*) FROM memorabilia_tags WHERE tag_id = memorabilia_tag_pool.id), updated_at = datetime('now') WHERE id IN (SELECT tag_id FROM memorabilia_tags WHERE memorabilia_id = ?) AND {guard}")).bind(&guarded(vec![JsValue::from_f64(id)]))?);
    stmts.push(
        db.prepare(format!(
            "DELETE FROM memorabilia_images WHERE memorabilia_id = ? AND {guard}"
        ))
        .bind(&guarded(vec![JsValue::from_f64(id)]))?,
    );
    for img in &o.images {
        stmts.push(db.prepare(format!("INSERT INTO memorabilia_images (memorabilia_id, url, alt_en, alt_ko, credit, is_primary, sort_order) SELECT ?, ?, ?, ?, ?, ?, ? WHERE {guard}")).bind(&guarded(vec![JsValue::from_f64(id),img.url.as_str().into(),img.alt_en.as_str().into(),img.alt_ko.as_str().into(),img.credit.as_str().into(),JsValue::from_f64(img.is_primary),JsValue::from_f64(img.sort_order)]))?);
    }
    for related in &o.related {
        let mut checks = guarded(vec![]);
        checks.extend([
            JsValue::from_f64(related.id),
            maybe(related.previous.as_ref()),
        ]);
        stmts.push(db.prepare(format!("SELECT CASE WHEN {guard} AND NOT EXISTS(SELECT 1 FROM memorabilia WHERE id = ? AND related_memorabilia_json IS ?) THEN json('invalid') ELSE NULL END")).bind(&checks)?);
        if related.change {
            stmts.push(
                db.prepare(format!(
                    "UPDATE memorabilia SET related_memorabilia_json = ? WHERE id = ? AND {guard}"
                ))
                .bind(&guarded(vec![
                    related.value.as_str().into(),
                    JsValue::from_f64(related.id),
                ]))?,
            );
        }
    }
    stmts.push(
        db.prepare(format!(
            "DELETE FROM memorabilia_fts WHERE memorabilia_id = ? AND {guard}"
        ))
        .bind(&guarded(vec![JsValue::from_f64(id)]))?,
    );
    let fts = crate::post_routes::post_bindings(&o.fts)?;
    stmts.push(db.prepare(format!("INSERT INTO memorabilia_fts(title_en,title_ko,event_name_en,event_name_ko,issuer_en,issuer_ko,material_en,material_ko,description_plain_en,description_plain_ko,tags_text,country_names_text,category_label_text,jamo_blob,choseong_blob,memorabilia_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE {guard}")).bind(&guarded(fts))?);
    stmts.push(db.prepare("UPDATE memorabilia SET updated_at = CASE WHEN julianday(?) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f', ?, '+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f', 'now') END WHERE id = ? AND updated_at = ? RETURNING id, updated_at").bind(&[maybe(o.previous_updated.as_ref()),maybe(o.previous_updated.as_ref()),JsValue::from_f64(id),claim.into()])?);
    let result = db.batch(stmts).await?;
    let updated = result
        .last()
        .ok_or_else(|| Error::RustError("Missing update result".into()))?
        .results::<Value>()?;
    Response::from_json(&json!({"row":updated.first()}))
}

#[derive(Deserialize)]
struct DeleteOptions {
    id: f64,
}
pub async fn delete(req: &mut Request, env: &Env) -> Result<Response> {
    let o: DeleteOptions = req.json().await?;
    let db = env.d1("DB")?;
    let arg = [JsValue::from_f64(o.id)];
    let stmts=vec![
        db.prepare("DELETE FROM memorabilia_fts WHERE memorabilia_id = ?").bind(&arg)?,
        db.prepare("UPDATE memorabilia_events SET usage_count = MAX(usage_count - 1, 0) WHERE id = (SELECT event_id FROM memorabilia WHERE id = ?) AND id <> 0").bind(&arg)?,
        db.prepare("DELETE FROM memorabilia WHERE id = ?").bind(&arg)?,
    ];
    db.batch(stmts).await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateOptions {
    values: Vec<Value>,
    claim: String,
    slug_base: String,
    event_id: Option<f64>,
    countries: Vec<String>,
    tags: Vec<String>,
    images: Vec<Image>,
    related: Vec<CreateRelated>,
    fts: Vec<Value>,
    tag_snapshots: Vec<TagSnapshot>,
    category_snapshot: Option<CategorySnapshot>,
    event_snapshot: Option<EventSnapshot>,
}
#[derive(Deserialize)]
struct CreateRelated {
    id: f64,
    previous: Option<String>,
    normalized: String,
    limited: String,
}
pub async fn create(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CreateOptions = req.json().await?;
    if o.values.len() != 23
        || o.fts.len() != 16
        || o.countries.len() > 8
        || o.tags.len() > 30
        || o.images.len() > 20
        || o.related.len() > 12
    {
        return Err(Error::RustError("Invalid memorabilia create values".into()));
    }
    let db = env.d1("DB")?;
    let claim = o.claim.as_str();
    let target = "(SELECT id FROM memorabilia WHERE slug = ?)";
    let mut stmts=vec![db.prepare("INSERT INTO memorabilia (slug,title_en,title_ko,has_event,event_id,event_name_en,event_name_ko,year,category_id,material_en,material_ko,size_text,issuer_en,issuer_ko,description_en,description_ko,description_plain_en,description_plain_ko,related_links_json,related_memorabilia_json,status,created_by,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),CASE WHEN ? = 'public' THEN datetime('now') ELSE NULL END)").bind(&crate::post_routes::post_bindings(&o.values)?)?];
    for tag in &o.tag_snapshots {
        stmts.push(db.prepare("SELECT CASE WHEN (SELECT id FROM memorabilia_tag_pool WHERE label = ?) IS NOT ? THEN json('invalid') ELSE NULL END").bind(&[tag.label.as_str().into(),tag.id.map(JsValue::from_f64).unwrap_or(JsValue::NULL)])?);
    }
    if let Some(category) = &o.category_snapshot {
        let mut args = vec![JsValue::from_f64(category.id)];
        let condition = if category.exists {
            args.extend([maybe(category.en.as_ref()), maybe(category.ko.as_ref())]);
            "NOT EXISTS(SELECT 1 FROM memorabilia_categories WHERE id = ? AND label_en IS ? AND label_ko IS ?)"
        } else {
            "EXISTS(SELECT 1 FROM memorabilia_categories WHERE id = ?)"
        };
        stmts.push(
            db.prepare(format!(
                "SELECT CASE WHEN {condition} THEN json('invalid') ELSE NULL END"
            ))
            .bind(&args)?,
        );
    }
    if let Some(event) = &o.event_snapshot {
        stmts.push(db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memorabilia_events WHERE id = ? AND name_en IS ? AND name_ko IS ?) THEN json('invalid') ELSE NULL END").bind(&[JsValue::from_f64(event.id),maybe(event.en.as_ref()),maybe(event.ko.as_ref())])?);
    }
    if let Some(event) = o.event_id {
        stmts.push(
            db.prepare("UPDATE memorabilia_events SET usage_count = usage_count + 1 WHERE id = ?")
                .bind(&[JsValue::from_f64(event)])?,
        );
    }
    for code in &o.countries {
        stmts.push(db.prepare(format!("INSERT OR IGNORE INTO memorabilia_countries (memorabilia_id,country_code) VALUES ({target},?)")).bind(&[claim.into(),code.into()])?);
    }
    for tag in &o.tags {
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO memorabilia_tag_pool (label) VALUES (?)")
                .bind(&[tag.into()])?,
        );
        stmts.push(db.prepare(format!("INSERT OR IGNORE INTO memorabilia_tags (memorabilia_id,tag_id) SELECT {target},id FROM memorabilia_tag_pool WHERE label = ?")).bind(&[claim.into(),tag.into()])?);
    }
    stmts.push(db.prepare(format!("UPDATE memorabilia_tag_pool SET usage_count = (SELECT COUNT(*) FROM memorabilia_tags WHERE tag_id = memorabilia_tag_pool.id), updated_at = datetime('now') WHERE id IN (SELECT tag_id FROM memorabilia_tags WHERE memorabilia_id = {target})")).bind(&[claim.into()])?);
    for image in &o.images {
        stmts.push(db.prepare(format!("INSERT INTO memorabilia_images (memorabilia_id,url,alt_en,alt_ko,credit,is_primary,sort_order) VALUES ({target},?,?,?,?,?,?)")).bind(&[claim.into(),image.url.as_str().into(),image.alt_en.as_str().into(),image.alt_ko.as_str().into(),image.credit.as_str().into(),JsValue::from_f64(image.is_primary),JsValue::from_f64(image.sort_order)])?);
    }
    for related in &o.related {
        stmts.push(db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memorabilia WHERE id = ? AND related_memorabilia_json IS ?) THEN json('invalid') ELSE NULL END").bind(&[JsValue::from_f64(related.id),maybe(related.previous.as_ref())])?);
        let sql = format!(
            "UPDATE memorabilia SET related_memorabilia_json = CASE WHEN json_array_length(?) >= 12 THEN ? ELSE json_insert(?, '$[#]', {target}) END WHERE id = ? AND NOT EXISTS(SELECT 1 FROM json_each(?) WHERE value = {target})"
        );
        stmts.push(db.prepare(sql).bind(&[
            related.normalized.as_str().into(),
            related.limited.as_str().into(),
            related.normalized.as_str().into(),
            claim.into(),
            JsValue::from_f64(related.id),
            related.normalized.as_str().into(),
            claim.into(),
        ])?);
    }
    let mut fts = crate::post_routes::post_bindings(&o.fts[..15])?;
    fts.push(claim.into());
    stmts.push(db.prepare(format!("INSERT INTO memorabilia_fts(title_en,title_ko,event_name_en,event_name_ko,issuer_en,issuer_ko,material_en,material_ko,description_plain_en,description_plain_ko,tags_text,country_names_text,category_label_text,jamo_blob,choseong_blob,memorabilia_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,{target})")).bind(&fts)?);
    stmts.push(
        db.prepare("UPDATE memorabilia SET slug = ? || '-' || id WHERE slug = ? RETURNING id")
            .bind(&[o.slug_base.into(), claim.into()])?,
    );
    let result = db.batch(stmts).await?;
    let rows = result
        .last()
        .ok_or_else(|| Error::RustError("Missing create result".into()))?
        .results::<Value>()?;
    let id = rows
        .first()
        .and_then(|r| r.get("id"))
        .cloned()
        .ok_or_else(|| Error::RustError("Missing created id".into()))?;
    Response::from_json(&json!({"id":id}))
}

pub async fn categories_list(env: &Env) -> Result<Response> {
    let items = env.d1("DB")?.prepare("SELECT id, slug, label_en, label_ko, sort_order, archived FROM memorabilia_categories ORDER BY archived ASC, sort_order ASC, id ASC").all().await?.results::<Value>()?;
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkSnapshot {
    id: f64,
    labels: Vec<String>,
    has_category: bool,
    category_id: Option<f64>,
    event_id: Option<f64>,
}

#[derive(Deserialize)]
struct FtsSnapshotRequest {
    id: f64,
}

pub async fn fts_snapshot(req: &mut Request, env: &Env) -> Result<Response> {
    let input: FtsSnapshotRequest = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(input.id);
    let row = db.prepare("SELECT m.*, c.label_en AS category_label_en, c.label_ko AS category_label_ko FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id = m.category_id WHERE m.id = ?").bind(std::slice::from_ref(&id))?.first::<Value>(None).await?;
    if row.is_none() {
        return Response::from_json(&json!({"row":null}));
    }
    let countries = db
        .prepare("SELECT country_code FROM memorabilia_countries WHERE memorabilia_id = ?")
        .bind(std::slice::from_ref(&id))?
        .all()
        .await?
        .results::<Value>()?;
    let tags = db.prepare("SELECT p.id, p.label FROM memorabilia_tag_pool p JOIN memorabilia_tags mt ON mt.tag_id = p.id WHERE mt.memorabilia_id = ?").bind(&[id])?.all().await?.results::<Value>()?;
    Response::from_json(&json!({"row":row,"countries":countries,"tags":tags}))
}

pub async fn bulk_snapshot(req: &mut Request, env: &Env) -> Result<Response> {
    let input: BulkSnapshot = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(input.id);
    let row = db.prepare("SELECT m.*, c.label_en AS category_label_en, c.label_ko AS category_label_ko FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id=m.category_id WHERE m.id=?").bind(std::slice::from_ref(&id))?.first::<Value>(None).await?;
    let Some(row) = row else {
        return Response::from_json(&json!({"row":null}));
    };
    let countries = db
        .prepare("SELECT country_code FROM memorabilia_countries WHERE memorabilia_id=?")
        .bind(std::slice::from_ref(&id))?
        .all()
        .await?
        .results::<Value>()?;
    let tags = db.prepare("SELECT p.id,p.label FROM memorabilia_tag_pool p JOIN memorabilia_tags mt ON mt.tag_id=p.id WHERE mt.memorabilia_id=? ORDER BY p.id").bind(&[id])?.all().await?.results::<Value>()?;
    let mut tag_snapshots = Vec::new();
    for label in input.labels {
        let tag = db
            .prepare("SELECT id FROM memorabilia_tag_pool WHERE label=?")
            .bind(&[label.as_str().into()])?
            .first::<Value>(None)
            .await?;
        tag_snapshots.push(json!({"label":label,"id":tag.and_then(|v|v.get("id").cloned())}));
    }
    let category_id = if input.has_category {
        input.category_id
    } else {
        row.get("category_id").and_then(Value::as_f64)
    };
    let category = if let Some(id) = category_id.filter(|id| *id != 0.0) {
        db.prepare("SELECT label_en,label_ko FROM memorabilia_categories WHERE id=?")
            .bind(&[id.into()])?
            .first::<Value>(None)
            .await?
    } else {
        None
    };
    let event = if let Some(id) = input.event_id.filter(|id| *id != 0.0) {
        db.prepare("SELECT name_en,name_ko FROM memorabilia_events WHERE id=?")
            .bind(&[id.into()])?
            .first::<Value>(None)
            .await?
    } else {
        None
    };
    Response::from_json(
        &json!({"row":row,"countries":countries,"tags":tags,"tagSnapshots":tag_snapshots,"category":category,"event":event}),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditSnapshot {
    id: Option<f64>,
    event_id: Option<f64>,
    category_id: Option<f64>,
    tags: Vec<String>,
    related: Vec<f64>,
}

pub async fn edit_snapshot(req: &mut Request, env: &Env) -> Result<Response> {
    let input: EditSnapshot = req.json().await?;
    let db = env.d1("DB")?;
    let existing = if let Some(id) = input.id {
        let row = db
            .prepare("SELECT id, status, event_id, updated_at FROM memorabilia WHERE id = ?")
            .bind(&[id.into()])?
            .first::<Value>(None)
            .await?;
        if row.is_none() {
            return Response::from_json(&json!({"existing":null}));
        }
        row
    } else {
        None
    };
    let event = if let Some(id) = input.event_id {
        db.prepare("SELECT name_en, name_ko FROM memorabilia_events WHERE id = ?")
            .bind(&[id.into()])?
            .first::<Value>(None)
            .await?
    } else {
        None
    };
    let tag_rows = if input.tags.is_empty() {
        Vec::new()
    } else {
        let placeholders = vec!["?"; input.tags.len()].join(",");
        let args = input
            .tags
            .iter()
            .map(|tag| JsValue::from_str(tag))
            .collect::<Vec<_>>();
        db.prepare(format!(
            "SELECT id, label FROM memorabilia_tag_pool WHERE label IN ({placeholders})"
        ))
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?
    };
    let category = if let Some(id) = input.category_id {
        db.prepare("SELECT label_en, label_ko FROM memorabilia_categories WHERE id = ?")
            .bind(&[id.into()])?
            .first::<Value>(None)
            .await?
    } else {
        None
    };
    let mut related = Vec::new();
    for id in input.related {
        if input.id == Some(id) {
            continue;
        }
        if let Some(row) = db
            .prepare("SELECT related_memorabilia_json FROM memorabilia WHERE id = ?")
            .bind(&[id.into()])?
            .first::<Value>(None)
            .await?
        {
            related.push(json!({"id":id,"row":row}));
        }
    }
    Response::from_json(
        &json!({"existing":existing,"event":event,"tagRows":tag_rows,"category":category,"related":related}),
    )
}

#[derive(Deserialize)]
struct CategoryCreate {
    slug: String,
    label_en: String,
    label_ko: String,
    sort_order: f64,
}

pub async fn category_create(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryCreate = req.json().await?;
    let result = env.d1("DB")?.prepare("INSERT INTO memorabilia_categories (slug, label_en, label_ko, sort_order) VALUES (?, ?, ?, ?) RETURNING id, slug, label_en, label_ko, sort_order, archived").bind(&[o.slug.into(),o.label_en.into(),o.label_ko.into(),o.sort_order.into()])?.first::<Value>(None).await;
    match result {
        Ok(row) => Response::from_json(&json!({"row":row})),
        Err(error) if error.to_string().contains("UNIQUE") => {
            Response::from_json(&json!({"conflict":true}))
        }
        Err(error) => Err(error),
    }
}

#[derive(Deserialize)]
struct CategoryUpdate {
    id: f64,
    label_en: Option<String>,
    label_ko: Option<String>,
    sort_order: Option<f64>,
    archived: Option<f64>,
}

pub async fn category_update(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryUpdate = req.json().await?;
    let mut sets = Vec::new();
    let mut args = Vec::<JsValue>::new();
    if let Some(value) = o.label_en {
        sets.push("label_en = ?");
        args.push(value.into());
    }
    if let Some(value) = o.label_ko {
        sets.push("label_ko = ?");
        args.push(value.into());
    }
    if let Some(value) = o.sort_order {
        sets.push("sort_order = ?");
        args.push(value.into());
    }
    if let Some(value) = o.archived {
        sets.push("archived = ?");
        args.push(value.into());
    }
    if sets.is_empty() {
        return Err(Error::RustError("Missing category fields".into()));
    }
    sets.push("updated_at = datetime('now')");
    args.push(o.id.into());
    let sql = format!(
        "UPDATE memorabilia_categories SET {} WHERE id = ? RETURNING id, slug, label_en, label_ko, sort_order, archived",
        sets.join(", ")
    );
    let row = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct CategoryId {
    id: f64,
}

pub async fn category_delete(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(o.id);
    let results = db.batch(vec![
        db.prepare("SELECT COUNT(*) AS n FROM memorabilia WHERE category_id = ?").bind(std::slice::from_ref(&id))?,
        db.prepare("UPDATE memorabilia_categories SET archived = 1, updated_at = datetime('now') WHERE id = ? AND EXISTS (SELECT 1 FROM memorabilia WHERE category_id = ?)").bind(&[id.clone(),id.clone()])?,
        db.prepare("DELETE FROM memorabilia_categories WHERE id = ? AND NOT EXISTS (SELECT 1 FROM memorabilia WHERE category_id = ?)").bind(&[id.clone(),id])?,
    ]).await?;
    let count = results[0]
        .results::<Value>()?
        .first()
        .and_then(|v| v.get("n"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Response::from_json(&json!({"in_use":count}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventCategoryList {
    include_archived: bool,
}

pub async fn event_category_list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventCategoryList = req.json().await?;
    let filter = if o.include_archived {
        ""
    } else {
        "WHERE archived = 0"
    };
    let sql = format!(
        "SELECT c.id, c.slug, c.label_en, c.label_ko, c.sort_order, c.archived, c.created_at, c.updated_at, (SELECT COUNT(*) FROM memorabilia_events e WHERE e.category_id = c.id) AS usage_count FROM memorabilia_event_categories c {filter} ORDER BY c.sort_order ASC, c.label_ko ASC"
    );
    let items = env.d1("DB")?.prepare(sql).all().await?.results::<Value>()?;
    Response::from_json(&json!({"items":items}))
}

pub async fn event_category_get(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = env.d1("DB")?.prepare("SELECT id, slug, label_en, label_ko, sort_order, archived FROM memorabilia_event_categories WHERE id = ?").bind(&[o.id.into()])?.first::<Value>(None).await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct EventCategoryUpdate {
    id: f64,
    label_en: String,
    label_ko: String,
    sort_order: Option<f64>,
    archived: Option<f64>,
}

pub async fn event_category_update(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventCategoryUpdate = req.json().await?;
    let args = [
        o.label_en.into(),
        o.label_ko.into(),
        o.sort_order.map(JsValue::from_f64).unwrap_or(JsValue::NULL),
        o.archived.map(JsValue::from_f64).unwrap_or(JsValue::NULL),
        o.id.into(),
    ];
    env.d1("DB")?.prepare("UPDATE memorabilia_event_categories SET label_en = ?, label_ko = ?, sort_order = ?, archived = ?, updated_at = datetime('now') WHERE id = ?").bind(&args)?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

pub async fn event_category_delete(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    env.d1("DB")?
        .prepare("DELETE FROM memorabilia_event_categories WHERE id = ?")
        .bind(&[o.id.into()])?
        .run()
        .await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct EventCategorySlug {
    slug: String,
}

pub async fn event_category_exists(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventCategorySlug = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT 1 FROM memorabilia_event_categories WHERE slug = ?")
        .bind(&[o.slug.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"exists":row.is_some()}))
}

#[derive(Deserialize)]
struct EventCategoryCreate {
    slug: String,
    label_en: String,
    label_ko: String,
    sort_order: f64,
    archived: f64,
}

pub async fn event_category_create(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventCategoryCreate = req.json().await?;
    let result = env.d1("DB")?.prepare("INSERT INTO memorabilia_event_categories (slug, label_en, label_ko, sort_order, archived) VALUES (?, ?, ?, ?, ?)").bind(&[o.slug.into(),o.label_en.into(),o.label_ko.into(),o.sort_order.into(),o.archived.into()])?.run().await;
    match result {
        Ok(result) => Response::from_json(&json!({"id":result.meta()?.and_then(|m|m.last_row_id)})),
        Err(error) => {
            let original = error.to_js_value();
            let message = worker::js_sys::Reflect::get(&original, &JsValue::from_str("message"))
                .ok()
                .and_then(|v| v.as_string())
                .filter(|s| !s.is_empty())
                .or_else(|| original.as_string())
                .unwrap_or_else(|| error.to_string());
            Response::from_json(&json!({"error":message}))
        }
    }
}

pub(crate) const EVENT_COLUMNS: &str = "e.id, e.slug, e.name_en, e.name_ko, e.category_id, cat.slug AS category_slug, cat.label_en AS category_label_en, cat.label_ko AS category_label_ko, e.start_year, e.start_month, e.start_day, e.end_year, e.end_month, e.end_day, e.description_en, e.description_ko, e.archived, (SELECT COUNT(*) FROM memorabilia m WHERE m.event_id = e.id) AS usage_count, e.created_at, e.updated_at";

#[derive(Deserialize)]
struct EventsList {
    archived: bool,
}

fn event_period(row: &Value, english: bool) -> String {
    let get = |key: &str| row.get(key).filter(|v| !v.is_null());
    let text = |v: &Value| crate::post_routes::js_string(v);
    let month = |v: &Value| {
        let index = text(v);
        [
            "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]
        .get(index.parse::<usize>().unwrap_or(usize::MAX))
        .filter(|_| {
            index == "0" || (!index.starts_with('0') && index.chars().all(|c| c.is_ascii_digit()))
        })
        .copied()
        .unwrap_or("undefined")
        .to_owned()
    };
    let side = |prefix: &str| {
        let Some(y) = get(&format!("{prefix}_year")) else {
            return String::new();
        };
        let Some(m) = get(&format!("{prefix}_month")) else {
            return if english {
                text(y)
            } else {
                format!("{}년", text(y))
            };
        };
        let d = get(&format!("{prefix}_day"));
        if english {
            match d {
                Some(d) => format!("{} {}, {}", month(m), text(d), text(y)),
                None => format!("{} {}", month(m), text(y)),
            }
        } else {
            match d {
                Some(d) => format!("{}년 {}월 {}일", text(y), text(m), text(d)),
                None => format!("{}년 {}월", text(y), text(m)),
            }
        }
    };
    let start = side("start");
    let end = side("end");
    if start.is_empty() {
        return if end.is_empty() {
            end
        } else {
            format!("~ {end}")
        };
    }
    if end.is_empty() || start == end {
        return start;
    }
    let sy = get("start_year");
    let ey = get("end_year");
    let sm = get("start_month");
    let em = get("end_month");
    let sd = get("start_day");
    let ed = get("end_day");
    if let (Some(sy), Some(ey), Some(sm), Some(em), Some(sd), Some(ed)) = (sy, ey, sm, em, sd, ed)
        && sy == ey
        && sm == em
    {
        return if english {
            format!("{} {} – {}, {}", month(sm), text(sd), text(ed), text(sy))
        } else {
            format!(
                "{}년 {}월 {}일 ~ {}일",
                text(sy),
                text(sm),
                text(sd),
                text(ed)
            )
        };
    }
    if let (Some(sy), Some(ey), Some(sm), Some(em)) = (sy, ey, sm, em)
        && sy == ey
    {
        if english {
            return if let Some(day) = ed {
                let start_day = sd
                    .filter(|v| match v {
                        Value::Number(n) => n.as_f64() != Some(0.0),
                        Value::Bool(b) => *b,
                        Value::String(s) => !s.is_empty(),
                        _ => true,
                    })
                    .map(text)
                    .unwrap_or_default();
                format!(
                    "{} {} – {} {}, {}",
                    month(sm),
                    start_day,
                    month(em),
                    text(day),
                    text(sy)
                )
                .replace("  ", " ")
            } else {
                format!("{} – {} {}", month(sm), month(em), text(sy))
            };
        }
        return if let Some(day) = ed {
            format!("{start} ~ {}월 {}일", text(em), text(day))
        } else {
            format!("{start} ~ {}월", text(em))
        };
    }
    format!("{start} {} {end}", if english { "–" } else { "~" })
}

fn event_with_period(mut row: Value) -> Value {
    let ko = event_period(&row, false);
    let en = event_period(&row, true);
    if let Some(obj) = row.as_object_mut() {
        obj.insert("period_text".into(), json!(ko));
        obj.insert("period_text_en".into(), json!(en));
    }
    row
}

pub async fn events_list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventsList = req.json().await?;
    let filter = if o.archived {
        ""
    } else {
        "WHERE e.archived = 0"
    };
    let sql = format!(
        "SELECT {EVENT_COLUMNS} FROM memorabilia_events e LEFT JOIN memorabilia_event_categories cat ON cat.id = e.category_id {filter} ORDER BY COALESCE(cat.sort_order, 999) ASC, COALESCE(e.start_year, 0) DESC, COALESCE(e.start_month, 0) DESC, COALESCE(e.start_day, 0) DESC, e.id DESC"
    );
    let items: Vec<Value> = env
        .d1("DB")?
        .prepare(sql)
        .all()
        .await?
        .results::<Value>()?
        .into_iter()
        .map(event_with_period)
        .collect();
    Response::from_json(&json!({"items":items}))
}

pub async fn event_get(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = event_lookup(env, o.id).await?;
    Response::from_json(&json!({"row":row}))
}

async fn event_lookup(env: &Env, id: f64) -> Result<Option<Value>> {
    let row = env.d1("DB")?.prepare(format!("SELECT {EVENT_COLUMNS} FROM memorabilia_events e LEFT JOIN memorabilia_event_categories cat ON cat.id = e.category_id WHERE e.id = ?")).bind(&[id.into()])?.first::<Value>(None).await?;
    Ok(row.map(event_with_period))
}

pub async fn event_response(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let (status, value) = match event_lookup(env, o.id).await? {
        Some(item) => (200, json!({"item":item})),
        None => (404, json!({"error":"not_found"})),
    };
    let mut response = Response::from_json(&value)?.with_status(status);
    response
        .headers_mut()
        .set("Content-Type", "application/json; charset=utf-8")?;
    Ok(response)
}

#[derive(Deserialize)]
struct EventBindings {
    bindings: Vec<Value>,
    #[serde(default)]
    expected: Option<Vec<Value>>,
}

pub async fn event_create(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventBindings = req.json().await?;
    if o.bindings.len() != 13 {
        return Err(Error::RustError("Invalid event values".into()));
    }
    let db = env.d1("DB")?;
    let base = o.bindings[0]
        .as_str()
        .ok_or_else(|| Error::RustError("Invalid event slug".into()))?;
    let mut slug = base.to_owned();
    for _ in 0..5 {
        let existing = db
            .prepare("SELECT 1 FROM memorabilia_events WHERE slug = ?")
            .bind(&[slug.as_str().into()])?
            .first::<Value>(None)
            .await?;
        if existing.is_none() {
            break;
        }
        let random = js_sys::Number::from(js_sys::Math::random())
            .to_string_with_radix(36)
            .map_err(|_| Error::RustError("Unable to generate event slug".into()))?;
        slug = format!("{base}-{}", String::from(random.slice(2, 5)));
    }
    let mut bindings = o.bindings;
    bindings[0] = json!(slug);
    let args = super::post_routes::post_bindings(&bindings)?;
    let result = db.prepare("INSERT INTO memorabilia_events (slug, name_en, name_ko, category_id, start_year, start_month, start_day, end_year, end_month, end_day, description_en, description_ko, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(&args)?.run().await;
    match result {
        Ok(result) => Response::from_json(
            &json!({"id":result.meta()?.and_then(|m|m.last_row_id),"slug":slug}),
        ),
        Err(error) => Response::from_json(&json!({"error":js_error_message(&error)})),
    }
}

pub async fn event_update(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventBindings = req.json().await?;
    if o.bindings.len() != 13 {
        return Err(Error::RustError("Invalid event values".into()));
    }
    let mut args = super::post_routes::post_bindings(&o.bindings)?;
    let guarded = o.expected.is_some();
    let guard = if let Some(expected) = o.expected {
        if expected.len() != 12 {
            return Err(Error::RustError("Invalid event snapshot".into()));
        }
        args.extend(super::post_routes::post_bindings(&expected)?);
        " AND name_en IS ? AND name_ko IS ? AND category_id IS ? AND start_year IS ? AND start_month IS ? AND start_day IS ? AND end_year IS ? AND end_month IS ? AND end_day IS ? AND description_en IS ? AND description_ko IS ? AND archived IS ?"
    } else {
        ""
    };
    let sql = format!(
        "UPDATE memorabilia_events SET name_en = ?, name_ko = ?, category_id = ?, start_year = ?, start_month = ?, start_day = ?, end_year = ?, end_month = ?, end_day = ?, description_en = ?, description_ko = ?, archived = ?, updated_at = datetime('now') WHERE id = ?{guard}"
    );
    let result = env.d1("DB")?.prepare(sql).bind(&args)?.run().await;
    match result {
        Ok(result) if guarded && result.meta()?.and_then(|m| m.changes).unwrap_or(0) == 0 => {
            Response::from_json(&json!({"conflict":true}))
        }
        Ok(_) => Response::from_json(&json!({"ok":true})),
        Err(error) => Response::from_json(&json!({"error":js_error_message(&error)})),
    }
}

pub async fn event_delete(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    env.d1("DB")?
        .prepare("DELETE FROM memorabilia_events WHERE id = ?")
        .bind(&[o.id.into()])?
        .run()
        .await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventsBulkUpdate {
    ids: Vec<f64>,
    has_category: bool,
    category_id: Option<f64>,
    archived: Option<f64>,
}

pub async fn events_bulk_validate(req: &mut Request, env: &Env) -> Result<Response> {
    let body: Value = req.json().await?;
    let ids: Vec<f64> = body
        .get("ids")
        .and_then(Value::as_array)
        .map(|ids| {
            ids.iter()
                .map(|id| js_sys::parse_int(&crate::post_routes::js_string(id), 10))
                .filter(|n| n.is_finite())
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Response::from_json(
            &json!({"error":"no_ids","detail":"하나 이상의 행사를 선택하세요."}),
        );
    }
    let updates = body
        .get("updates")
        .filter(|v| v.is_object() || v.is_array());
    let Some(updates) = updates else {
        return Response::from_json(
            &json!({"error":"no_updates","detail":"변경할 필드를 지정하세요."}),
        );
    };
    let mut category = Value::Null;
    let has_category = updates.get("category_id").is_some();
    if let Some(value) = updates.get("category_id").filter(|v| !v.is_null()) {
        let id = js_sys::parse_int(&crate::post_routes::js_string(value), 10);
        if !id.is_finite() {
            return Response::from_json(&json!({"error":"invalid_category_id"}));
        }
        let row = env.d1("DB")?.prepare("SELECT id, slug, label_en, label_ko, sort_order, archived FROM memorabilia_event_categories WHERE id = ?").bind(&[id.into()])?.first::<Value>(None).await?;
        if row.is_none() {
            return Response::from_json(&json!({"error":"category_not_found"}));
        }
        category = json!(id);
    }
    let archived = updates
        .get("archived")
        .map(|v| match v {
            Value::Null => false,
            Value::Bool(b) => *b,
            Value::Number(n) => n.as_f64() != Some(0.0),
            Value::String(s) => !s.is_empty(),
            _ => true,
        })
        .map(u8::from);
    if !has_category && archived.is_none() {
        return Response::from_json(
            &json!({"error":"no_updates","detail":"체크된 필드가 없습니다."}),
        );
    }
    Response::from_json(
        &json!({"ids":ids,"hasCategory":has_category,"categoryId":category,"archived":archived}),
    )
}

pub async fn events_bulk_update(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventsBulkUpdate = req.json().await?;
    if o.ids.is_empty() || (!o.has_category && o.archived.is_none()) {
        return Err(Error::RustError("Invalid event bulk update".into()));
    }
    let mut sets = Vec::new();
    let mut args = Vec::<JsValue>::new();
    if o.has_category {
        sets.push("category_id = ?");
        args.push(
            o.category_id
                .map(JsValue::from_f64)
                .unwrap_or(JsValue::NULL),
        );
    }
    if let Some(archived) = o.archived {
        sets.push("archived = ?");
        args.push(archived.into());
    }
    sets.push("updated_at = datetime('now')");
    let placeholders = vec!["?"; o.ids.len()].join(",");
    args.extend(o.ids.iter().map(|id| JsValue::from_f64(*id)));
    let sql = format!(
        "UPDATE memorabilia_events SET {} WHERE id IN ({placeholders})",
        sets.join(", ")
    );
    match env.d1("DB")?.prepare(sql).bind(&args)?.run().await {
        Ok(result) => Response::from_json(
            &json!({"updated":result.meta()?.and_then(|m|m.changes).unwrap_or(0)}),
        ),
        Err(error) => {
            let original = error.to_js_value();
            let message = worker::js_sys::Reflect::get(&original, &JsValue::from_str("message"))
                .ok()
                .and_then(|v| v.as_string())
                .filter(|s| !s.is_empty())
                .or_else(|| original.as_string())
                .unwrap_or_else(|| error.to_string());
            Response::from_json(&json!({"error":message}))
        }
    }
}

pub(crate) fn js_error_message(error: &Error) -> String {
    let original = error.to_js_value();
    worker::js_sys::Reflect::get(&original, &JsValue::from_str("message"))
        .ok()
        .and_then(|v| v.as_string())
        .filter(|s| !s.is_empty())
        .or_else(|| original.as_string())
        .unwrap_or_else(|| error.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoView {
    id: f64,
    viewer_key: String,
    view_bucket: String,
}

pub async fn view_record(req: &mut Request, env: &Env) -> Result<Response> {
    let o: MemoView = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(o.id);
    let results = db.batch(vec![
        db.prepare("INSERT OR IGNORE INTO memorabilia_views (memorabilia_id, viewer_key, viewed_bucket) VALUES (?, ?, ?)").bind(&[id.clone(),o.viewer_key.into(),o.view_bucket.into()])?,
        db.prepare("UPDATE memorabilia SET view_count = view_count + 1 WHERE id = ? AND changes() = 1").bind(&[id])?,
    ]).await?;
    let counted = results[0].meta()?.and_then(|m| m.changes).unwrap_or(0) > 0;
    Response::from_json(&json!({"counted":counted}))
}

pub async fn view_get(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT view_count FROM memorabilia WHERE id = ?")
        .bind(&[o.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

pub async fn public_check(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT id FROM memorabilia WHERE id = ? AND status = 'public'")
        .bind(&[o.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoLike {
    id: f64,
    viewer_key: Option<String>,
}

pub async fn like_stats(req: &mut Request, env: &Env) -> Result<Response> {
    let o: MemoLike = req.json().await?;
    let key = o.viewer_key.map(JsValue::from).unwrap_or(JsValue::NULL);
    let row = env.d1("DB")?.prepare("SELECT COUNT(*) AS count, COALESCE(MAX(CASE WHEN viewer_key = ? THEN 1 ELSE 0 END),0) AS liked FROM memorabilia_likes WHERE memorabilia_id = ?").bind(&[key,o.id.into()])?.first::<Value>(None).await?;
    let likes = row
        .as_ref()
        .and_then(|v| v.get("count"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let liked = row
        .as_ref()
        .and_then(|v| v.get("liked"))
        .and_then(Value::as_i64)
        .unwrap_or(0)
        != 0;
    Response::from_json(&json!({"likes":likes,"liked":liked}))
}

pub async fn like_toggle(req: &mut Request, env: &Env) -> Result<Response> {
    let o: MemoLike = req.json().await?;
    let key = o
        .viewer_key
        .ok_or_else(|| Error::RustError("Missing viewer key".into()))?;
    let db = env.d1("DB")?;
    let args = [JsValue::from_f64(o.id), key.into()];
    let existing = db
        .prepare(
            "SELECT id FROM memorabilia_likes WHERE memorabilia_id = ? AND viewer_key = ? LIMIT 1",
        )
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    let sql = if existing.is_some() {
        "DELETE FROM memorabilia_likes WHERE memorabilia_id = ? AND viewer_key = ?"
    } else {
        "INSERT OR IGNORE INTO memorabilia_likes (memorabilia_id, viewer_key) VALUES (?, ?)"
    };
    db.prepare(sql).bind(&args)?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct CommentList {
    id: f64,
    limit: f64,
}

#[derive(Deserialize)]
struct CommentLengths {
    author: usize,
    affiliation: usize,
    password: usize,
    content: usize,
}

pub async fn validate_comment(req: &mut Request) -> Result<Response> {
    let o: CommentLengths = req.json().await?;
    let mut errors = Vec::new();
    if o.author == 0 {
        errors.push("이름을 입력해주세요.");
    } else if o.author > 40 {
        errors.push("이름은 40자 이하여야 합니다.");
    }
    if o.affiliation == 0 {
        errors.push("소속연맹을 입력해주세요.");
    } else if o.affiliation > 80 {
        errors.push("소속연맹은 80자 이하여야 합니다.");
    }
    if o.password == 0 {
        errors.push("비밀번호를 입력해주세요.");
    } else if o.password < 6 {
        errors.push("비밀번호는 6자 이상이어야 합니다.");
    } else if o.password > 128 {
        errors.push("비밀번호가 너무 깁니다.");
    }
    if o.content == 0 {
        errors.push("내용을 입력해주세요.");
    } else if o.content > 1000 {
        errors.push("내용은 1000자 이하여야 합니다.");
    }
    Response::from_json(&json!({"errors":errors}))
}

fn comment_public(row: &Value) -> Value {
    let mut result = serde_json::Map::new();
    for key in [
        "id",
        "memorabilia_id",
        "author_name",
        "affiliation",
        "content",
        "created_at",
    ] {
        if let Some(value) = row.get(key) {
            result.insert(key.to_owned(), value.clone());
        }
    }
    Value::Object(result)
}

fn comment_admin(row: &Value) -> Value {
    let mut result = serde_json::Map::new();
    for key in [
        "id",
        "memorabilia_id",
        "author_name",
        "affiliation",
        "content",
        "ip_address",
        "status",
        "created_at",
    ] {
        if let Some(value) = row.get(key) {
            result.insert(key.to_owned(), value.clone());
        }
    }
    for key in [
        "memorabilia_title_ko",
        "memorabilia_title_en",
        "memorabilia_slug",
        "user_agent",
        "rejection_reason",
        "reviewed_at",
        "reviewed_by",
        "deleted_at",
    ] {
        let value = row
            .get(key)
            .filter(|value| truthy(value))
            .cloned()
            .unwrap_or(Value::Null);
        result.insert(key.to_owned(), value);
    }
    Value::Object(result)
}

pub async fn comments_list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CommentList = req.json().await?;
    let db = env.d1("DB")?;
    let rows = db.prepare("SELECT id, memorabilia_id, author_name, affiliation, content, created_at, COUNT(*) OVER () AS total_count FROM memorabilia_comments WHERE memorabilia_id = ? AND status = 'approved' AND EXISTS (SELECT 1 FROM memorabilia m WHERE m.id = memorabilia_comments.memorabilia_id AND m.status = 'public') ORDER BY created_at DESC LIMIT ?").bind(&[o.id.into(),o.limit.into()])?.all().await?.results::<Value>()?;
    let total = rows
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let items: Vec<Value> = rows.iter().map(comment_public).collect();
    Response::from_json(&json!({"items":items,"total":total}))
}

pub async fn comment_create(req: &mut Request, env: &Env) -> Result<Response> {
    let o: EventBindings = req.json().await?;
    if o.bindings.len() != 8 {
        return Err(Error::RustError("Invalid comment values".into()));
    }
    let mut args = super::post_routes::post_bindings(&o.bindings)?;
    args.push(args[0].clone());
    let result = env.d1("DB")?.prepare("INSERT INTO memorabilia_comments (memorabilia_id, author_name, affiliation, password_hash, password_salt, content, ip_address, user_agent, status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending' WHERE EXISTS (SELECT 1 FROM memorabilia WHERE id = ? AND status = 'public')").bind(&args)?.run().await?;
    let meta = result.meta()?;
    let created = meta.as_ref().and_then(|m| m.changes).unwrap_or(0) > 0;
    Response::from_json(
        &json!({"created":created,"id":if created {meta.and_then(|m|m.last_row_id)} else {None}}),
    )
}

pub async fn comment_get_secret(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = env.d1("DB")?.prepare("SELECT id, password_hash, password_salt, status FROM memorabilia_comments WHERE id = ?").bind(&[o.id.into()])?.first::<Value>(None).await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct CommentDelete {
    id: f64,
    hash: String,
    salt: String,
}

pub async fn comment_delete(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CommentDelete = req.json().await?;
    let db = env.d1("DB")?;
    let result = db.prepare("UPDATE memorabilia_comments SET status = 'deleted', deleted_at = datetime('now') WHERE id = ? AND status != 'deleted' AND password_hash = ? AND password_salt = ?")
        .bind(&[o.id.into(),o.hash.into(),o.salt.into()])?.run().await?;
    let changed = result.meta()?.and_then(|m| m.changes).unwrap_or(0) > 0;
    let status = if changed {
        None
    } else {
        db.prepare("SELECT status FROM memorabilia_comments WHERE id = ?")
            .bind(&[o.id.into()])?
            .first::<Value>(None)
            .await?
    };
    Response::from_json(
        &json!({"changed":changed,"status":status.and_then(|r|r.get("status").cloned())}),
    )
}

pub async fn comments_admin_counts(env: &Env) -> Result<Response> {
    let results = env
        .d1("DB")?
        .prepare("SELECT status, COUNT(*) AS count FROM memorabilia_comments GROUP BY status")
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"results":results}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminCommentList {
    status: String,
    page_size: f64,
    offset: f64,
}

pub async fn comments_admin_list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: AdminCommentList = req.json().await?;
    let filter = if o.status == "all" {
        ""
    } else {
        "WHERE c.status = ?"
    };
    let mut args = Vec::<JsValue>::new();
    if o.status != "all" {
        args.push(o.status.into());
    }
    let db = env.d1("DB")?;
    let mut list_args = args.clone();
    list_args.extend([o.page_size.into(), o.offset.into()]);
    let sql = format!(
        "SELECT c.id, c.memorabilia_id, c.author_name, c.affiliation, c.content, c.ip_address, c.user_agent, c.status, c.rejection_reason, c.created_at, c.reviewed_at, c.reviewed_by, c.deleted_at, m.title_ko AS memorabilia_title_ko, m.title_en AS memorabilia_title_en, m.slug AS memorabilia_slug FROM memorabilia_comments c LEFT JOIN memorabilia m ON m.id = c.memorabilia_id {filter} ORDER BY c.created_at DESC LIMIT ? OFFSET ?"
    );
    let items = db
        .prepare(sql)
        .bind(&list_args)?
        .all()
        .await?
        .results::<Value>()?;
    let items: Vec<Value> = items.iter().map(comment_admin).collect();
    let count = db
        .prepare(format!(
            "SELECT COUNT(*) AS count FROM memorabilia_comments c {filter}"
        ))
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    let total = count
        .as_ref()
        .and_then(|v| v.get("count"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Response::from_json(&json!({"items":items,"total":total}))
}

pub async fn comment_status(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT id, status FROM memorabilia_comments WHERE id = ?")
        .bind(&[o.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModerateComment {
    id: f64,
    status: String,
    reason: Option<String>,
    reviewer_label: Option<String>,
}

pub async fn comment_moderate(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ModerateComment = req.json().await?;
    let reviewer = o
        .reviewer_label
        .as_deref()
        .map(JsValue::from_str)
        .unwrap_or(JsValue::NULL);
    let db = env.d1("DB")?;
    let result = if o.status == "deleted" {
        db.prepare("UPDATE memorabilia_comments SET status = 'deleted', reviewed_at = datetime('now'), reviewed_by = ?, deleted_at = datetime('now') WHERE id = ?").bind(&[reviewer,o.id.into()])?.run().await?
    } else if o.status == "approved" || o.status == "rejected" {
        let reason = if o.status == "rejected" {
            o.reason
                .as_deref()
                .map(JsValue::from_str)
                .unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        };
        db.prepare("UPDATE memorabilia_comments SET status = ?, rejection_reason = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ? AND status != 'deleted'").bind(&[o.status.into(),reason,reviewer,o.id.into()])?.run().await?
    } else {
        return Err(Error::RustError("Invalid comment status".into()));
    };
    Response::from_json(&json!({"changed":result.meta()?.and_then(|m|m.changes).unwrap_or(0)>0}))
}

#[derive(Deserialize)]
struct BulkRow {
    id: f64,
    updates: serde_json::Map<String, Value>,
    fts: Vec<Value>,
    snapshot: FtsSnapshot,
    #[serde(rename = "tagSnapshots")]
    tag_snapshots: Vec<TagSnapshot>,
    #[serde(rename = "categorySnapshot")]
    category_snapshot: Option<CategorySnapshot>,
    #[serde(rename = "eventSnapshot")]
    event_snapshot: Option<CategorySnapshot>,
}

pub async fn bulk_row(req: &mut Request, env: &Env) -> Result<Response> {
    let o: BulkRow = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(o.id);
    let existing = db
        .prepare("SELECT id,event_id,updated_at FROM memorabilia WHERE id = ?")
        .bind(std::slice::from_ref(&id))?
        .first::<Value>(None)
        .await?;
    let Some(existing) = existing else {
        return Response::from_json(&json!({"error":"not_found"}));
    };
    let old_event = existing.get("event_id").cloned().unwrap_or(Value::Null);
    let old_updated = existing.get("updated_at").cloned().unwrap_or(Value::Null);
    if o.fts.len() != 16 || o.fts[15].as_f64() != Some(o.id) {
        return Err(Error::RustError("Invalid bulk search index".into()));
    }
    let mut stmts = vec![fts_snapshot_guard(&db, &o.snapshot, &o.fts[15])?];
    for tag in &o.tag_snapshots {
        stmts.push(db.prepare("SELECT CASE WHEN (SELECT id FROM memorabilia_tag_pool WHERE label = ?) IS NOT ? THEN json('invalid') ELSE NULL END").bind(&[tag.label.as_str().into(),tag.id.map(JsValue::from_f64).unwrap_or(JsValue::NULL)])?);
    }
    for (table, snapshot) in [
        ("memorabilia_categories", &o.category_snapshot),
        ("memorabilia_events", &o.event_snapshot),
    ] {
        if let Some(snapshot) = snapshot {
            let (en, ko) = if table == "memorabilia_events" {
                ("name_en", "name_ko")
            } else {
                ("label_en", "label_ko")
            };
            let sql = if snapshot.exists {
                format!(
                    "SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM {table} WHERE id=? AND {en} IS ? AND {ko} IS ?) THEN json('invalid') ELSE NULL END"
                )
            } else {
                format!(
                    "SELECT CASE WHEN EXISTS(SELECT 1 FROM {table} WHERE id=?) THEN json('invalid') ELSE NULL END"
                )
            };
            let mut args = vec![snapshot.id.into()];
            if snapshot.exists {
                args.extend([maybe(snapshot.en.as_ref()), maybe(snapshot.ko.as_ref())]);
            }
            stmts.push(db.prepare(sql).bind(&args)?);
        }
    }
    let guard =
        super::post_routes::post_bindings(&[Value::from(o.id), old_event.clone(), old_updated])?;
    stmts.push(db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memorabilia WHERE id = ? AND event_id IS ? AND updated_at IS ?) THEN json('invalid') ELSE NULL END").bind(&guard)?);
    let mut sets = Vec::new();
    let mut args = Vec::<JsValue>::new();
    for key in [
        "status",
        "category_id",
        "has_event",
        "event_id",
        "year",
        "issuer_en",
        "issuer_ko",
        "material_en",
        "material_ko",
        "size_text",
    ] {
        if let Some(value) = o.updates.get(key) {
            sets.push(format!("{key} = ?"));
            args.extend(super::post_routes::post_bindings(std::slice::from_ref(
                value,
            ))?);
        }
    }
    if let Some(event) = o
        .updates
        .get("event_id")
        .and_then(Value::as_f64)
        .filter(|v| *v != 0.0)
    {
        let ev = db
            .prepare("SELECT name_en,name_ko FROM memorabilia_events WHERE id = ?")
            .bind(&[event.into()])?
            .first::<Value>(None)
            .await?;
        if let Some(ev) = ev {
            let en = ev.get("name_en").and_then(Value::as_str).unwrap_or("");
            let ko = ev.get("name_ko").and_then(Value::as_str).unwrap_or("");
            stmts.push(db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memorabilia_events WHERE id = ? AND name_en IS ? AND name_ko IS ?) THEN json('invalid') ELSE NULL END").bind(&[event.into(),super::post_routes::post_bindings(&[ev.get("name_en").cloned().unwrap_or(Value::Null)])?.remove(0),super::post_routes::post_bindings(&[ev.get("name_ko").cloned().unwrap_or(Value::Null)])?.remove(0)])?);
            sets.extend(["event_name_en = ?".into(), "event_name_ko = ?".into()]);
            args.extend([en.into(), ko.into()]);
        }
    }
    let main_changed = !sets.is_empty();
    if main_changed {
        sets.push("updated_at = datetime('now')".into());
        args.push(id.clone());
        stmts.push(
            db.prepare(format!(
                "UPDATE memorabilia SET {} WHERE id = ?",
                sets.join(", ")
            ))
            .bind(&args)?,
        );
    }
    let mut affected = Vec::new();
    if let Some(new_event) = o.updates.get("event_id").filter(|new| *new != &old_event) {
        if let Some(old) = old_event.as_f64().filter(|v| *v != 0.0) {
            stmts.push(db.prepare("UPDATE memorabilia_events SET usage_count = MAX(usage_count - 1, 0) WHERE id = ?").bind(&[old.into()])?);
            affected.push(old);
        }
        if let Some(new) = new_event.as_f64().filter(|v| *v != 0.0) {
            stmts.push(
                db.prepare(
                    "UPDATE memorabilia_events SET usage_count = usage_count + 1 WHERE id = ?",
                )
                .bind(&[new.into()])?,
            );
            affected.push(new);
        }
    }
    let tags_set = o.updates.get("set_tags").and_then(Value::as_array);
    let tags_add = o.updates.get("add_tags").and_then(Value::as_array);
    let tags_remove = o.updates.get("remove_tags").and_then(Value::as_array);
    let tags_changed = tags_set.is_some()
        || tags_add.is_some_and(|v| !v.is_empty())
        || tags_remove.is_some_and(|v| !v.is_empty());
    if tags_set.is_some() {
        stmts.push(
            db.prepare("DELETE FROM memorabilia_tags WHERE memorabilia_id = ?")
                .bind(std::slice::from_ref(&id))?,
        );
    }
    for label in tags_set.or(tags_add).into_iter().flatten() {
        let label = label
            .as_str()
            .ok_or_else(|| Error::RustError("Invalid tag".into()))?;
        stmts.push(
            db.prepare("INSERT OR IGNORE INTO memorabilia_tag_pool (label) VALUES (?)")
                .bind(&[label.into()])?,
        );
        stmts.push(db.prepare("INSERT OR IGNORE INTO memorabilia_tags (memorabilia_id,tag_id) SELECT ?,id FROM memorabilia_tag_pool WHERE label = ?").bind(&[id.clone(),label.into()])?);
    }
    if tags_set.is_none() {
        for label in tags_remove.into_iter().flatten() {
            let label = label
                .as_str()
                .ok_or_else(|| Error::RustError("Invalid tag".into()))?;
            stmts.push(db.prepare("DELETE FROM memorabilia_tags WHERE memorabilia_id = ? AND tag_id IN (SELECT id FROM memorabilia_tag_pool WHERE label = ?)").bind(&[id.clone(),label.into()])?);
        }
    }
    if tags_changed {
        stmts.push(db.prepare("UPDATE memorabilia_tag_pool SET usage_count = (SELECT COUNT(*) FROM memorabilia_tags WHERE tag_id = memorabilia_tag_pool.id), updated_at = datetime('now')"));
    }
    let countries_set = o.updates.get("set_country_codes").and_then(Value::as_array);
    let countries_add = o.updates.get("add_country_codes").and_then(Value::as_array);
    let countries_remove = o
        .updates
        .get("remove_country_codes")
        .and_then(Value::as_array);
    let countries_changed = countries_set.is_some()
        || countries_add.is_some_and(|v| !v.is_empty())
        || countries_remove.is_some_and(|v| !v.is_empty());
    if countries_set.is_some() {
        stmts.push(
            db.prepare("DELETE FROM memorabilia_countries WHERE memorabilia_id = ?")
                .bind(std::slice::from_ref(&id))?,
        );
    }
    for code in countries_set.or(countries_add).into_iter().flatten() {
        let code = code
            .as_str()
            .ok_or_else(|| Error::RustError("Invalid country".into()))?;
        stmts.push(db.prepare("INSERT OR IGNORE INTO memorabilia_countries (memorabilia_id,country_code) VALUES (?,?)").bind(&[id.clone(),code.into()])?);
    }
    if countries_set.is_none() {
        for code in countries_remove.into_iter().flatten() {
            let code = code
                .as_str()
                .ok_or_else(|| Error::RustError("Invalid country".into()))?;
            stmts.push(db.prepare("DELETE FROM memorabilia_countries WHERE memorabilia_id = ? AND country_code = ?").bind(&[id.clone(),code.into()])?);
        }
    }
    let changed = main_changed || tags_changed || countries_changed;
    if changed && !main_changed {
        stmts.push(
            db.prepare("UPDATE memorabilia SET updated_at = datetime('now') WHERE id = ?")
                .bind(std::slice::from_ref(&id))?,
        );
    }
    let fts = super::post_routes::post_bindings(&o.fts)?;
    stmts.push(
        db.prepare("DELETE FROM memorabilia_fts WHERE memorabilia_id = ?")
            .bind(std::slice::from_ref(&id))?,
    );
    stmts.push(db.prepare("INSERT INTO memorabilia_fts(title_en,title_ko,event_name_en,event_name_ko,issuer_en,issuer_ko,material_en,material_ko,description_plain_en,description_plain_ko,tags_text,country_names_text,category_label_text,jamo_blob,choseong_blob,memorabilia_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(&fts)?);
    match db.batch(stmts).await {
        Ok(_) => Response::from_json(&json!({"changed":changed,"affectedEventIds":affected})),
        Err(error) => Response::from_json(&json!({"error":js_error_message(&error)})),
    }
}

#[derive(Deserialize)]
struct FtsUpsert {
    values: Vec<Value>,
    snapshot: Option<FtsSnapshot>,
}

#[derive(Deserialize)]
struct FtsSnapshot {
    values: Vec<Value>,
    countries: Vec<String>,
    tags: Vec<Value>,
}

fn fts_snapshot_guard(
    db: &D1Database,
    snapshot: &FtsSnapshot,
    target: &Value,
) -> Result<D1PreparedStatement> {
    if snapshot.values.len() != 15 || &snapshot.values[0] != target {
        return Err(Error::RustError("Invalid search index snapshot".into()));
    }
    let countries =
        serde_json::to_string(&snapshot.countries).map_err(|e| Error::RustError(e.to_string()))?;
    let tags =
        serde_json::to_string(&snapshot.tags).map_err(|e| Error::RustError(e.to_string()))?;
    let mut guard = super::post_routes::post_bindings(&snapshot.values)?;
    guard.extend([
        countries.as_str().into(),
        countries.as_str().into(),
        tags.as_str().into(),
        tags.as_str().into(),
    ]);
    db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id=m.category_id WHERE m.id IS ? AND m.updated_at IS ? AND m.title_en IS ? AND m.title_ko IS ? AND m.event_name_en IS ? AND m.event_name_ko IS ? AND m.issuer_en IS ? AND m.issuer_ko IS ? AND m.material_en IS ? AND m.material_ko IS ? AND m.description_plain_en IS ? AND m.description_plain_ko IS ? AND m.category_id IS ? AND c.label_en IS ? AND c.label_ko IS ? AND (SELECT COUNT(*) FROM memorabilia_countries WHERE memorabilia_id=m.id)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM memorabilia_countries mc WHERE mc.memorabilia_id=m.id AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE j.value=mc.country_code)) AND (SELECT COUNT(*) FROM memorabilia_tags WHERE memorabilia_id=m.id)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM memorabilia_tags mt JOIN memorabilia_tag_pool p ON p.id=mt.tag_id WHERE mt.memorabilia_id=m.id AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.id')=p.id AND json_extract(j.value,'$.label') IS p.label))) THEN json('invalid') ELSE NULL END").bind(&guard)
}

#[derive(Deserialize)]
struct MaintenanceInput {
    kind: String,
    id: Value,
}

pub async fn maintenance(req: &mut Request, env: &Env) -> Result<Response> {
    let input: MaintenanceInput = req.json().await?;
    let sql = match input.kind.as_str() {
        "delete_fts" => "DELETE FROM memorabilia_fts WHERE memorabilia_id = ?",
        "refresh_event_usage" => {
            "UPDATE memorabilia_events SET usage_count = (SELECT COUNT(*) FROM memorabilia WHERE event_id = ?) WHERE id = ?"
        }
        _ => {
            return Err(Error::RustError(
                "Invalid memorabilia maintenance operation".into(),
            ));
        }
    };
    let mut args = super::post_routes::post_bindings(&[input.id])?;
    if input.kind == "refresh_event_usage" {
        args.push(args[0].clone());
    }
    env.d1("DB")?.prepare(sql).bind(&args)?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

pub async fn fts_upsert(req: &mut Request, env: &Env) -> Result<Response> {
    let o: FtsUpsert = req.json().await?;
    if o.values.len() != 16 {
        return Err(Error::RustError("Invalid search index values".into()));
    }
    let args = super::post_routes::post_bindings(&o.values)?;
    let db = env.d1("DB")?;
    let mut statements = Vec::new();
    if let Some(snapshot) = o.snapshot {
        statements.push(fts_snapshot_guard(&db, &snapshot, &o.values[15])?);
    }
    statements.push(
        db.prepare("DELETE FROM memorabilia_fts WHERE memorabilia_id = ?")
            .bind(&[args[15].clone()])?,
    );
    statements.push(db.prepare("INSERT INTO memorabilia_fts(title_en,title_ko,event_name_en,event_name_ko,issuer_en,issuer_ko,material_en,material_ko,description_plain_en,description_plain_ko,tags_text,country_names_text,category_label_text,jamo_blob,choseong_blob,memorabilia_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(&args)?);
    db.batch(statements).await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplaceOperation {
    table: String,
    field: String,
    find: String,
    replace: String,
    like_pattern: String,
    replacement_pattern: String,
    dry_run: bool,
}

pub async fn bulk_replace(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ReplaceOperation = req.json().await?;
    let memo_fields = [
        "title_en",
        "title_ko",
        "issuer_en",
        "issuer_ko",
        "event_name_en",
        "event_name_ko",
        "material_en",
        "material_ko",
        "size_text",
        "description_en",
        "description_ko",
        "description_plain_en",
        "description_plain_ko",
    ];
    let event_fields = ["name_en", "name_ko", "description_en", "description_ko"];
    if !((o.table == "memorabilia" && memo_fields.contains(&o.field.as_str()))
        || (o.table == "memorabilia_events" && event_fields.contains(&o.field.as_str())))
    {
        return Err(Error::RustError("Invalid replacement field".into()));
    }
    let db = env.d1("DB")?;
    let pattern = JsValue::from_str(&o.like_pattern);
    let where_sql = format!("{} LIKE ? ESCAPE '\\'", o.field);
    if o.dry_run {
        let row = db
            .prepare(format!(
                "SELECT COUNT(*) AS n FROM {} WHERE {where_sql}",
                o.table
            ))
            .bind(&[pattern])?
            .first::<Value>(None)
            .await?;
        let matched = row
            .as_ref()
            .and_then(|v| v.get("n"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        return Response::from_json(&json!({"matched":matched}));
    }
    let mut statements = Vec::new();
    let is_memo = o.table == "memorabilia";
    if is_memo {
        statements.push(
            db.prepare(format!("SELECT id FROM memorabilia WHERE {where_sql}"))
                .bind(std::slice::from_ref(&pattern))?,
        );
    }
    statements.push(
        db.prepare(format!(
            "UPDATE {} SET {} = REPLACE({}, ?, ?), updated_at = datetime('now') WHERE {where_sql}",
            o.table, o.field, o.field
        ))
        .bind(&[
            o.find.as_str().into(),
            o.replace.as_str().into(),
            pattern.clone(),
        ])?,
    );
    let cascade = if o.table == "memorabilia_events" && o.field == "name_en" {
        Some("event_name_en")
    } else if o.table == "memorabilia_events" && o.field == "name_ko" {
        Some("event_name_ko")
    } else {
        None
    };
    if let Some(field) = cascade {
        statements.push(db.prepare(format!("UPDATE memorabilia SET {field} = REPLACE({field}, ?, ?), updated_at = datetime('now') WHERE {field} LIKE ? ESCAPE '\\'")).bind(&[o.find.as_str().into(),o.replace.as_str().into(),pattern])?);
        statements.push(
            db.prepare(format!(
                "SELECT id FROM memorabilia WHERE {field} LIKE ? ESCAPE '\\'"
            ))
            .bind(&[o.replacement_pattern.into()])?,
        );
    }
    let results = db.batch(statements).await?;
    let update_index = usize::from(is_memo);
    let ids = if is_memo {
        results[0]
            .results::<Value>()?
            .into_iter()
            .filter_map(|r| r.get("id").cloned())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let changed = results[update_index]
        .meta()?
        .and_then(|m| m.changes)
        .unwrap_or(0);
    let cascaded_changed = if cascade.is_some() {
        results[update_index + 1]
            .meta()?
            .and_then(|m| m.changes)
            .unwrap_or(0)
    } else {
        0
    };
    let cascaded_ids = if cascaded_changed > 0 {
        results[update_index + 2]
            .results::<Value>()?
            .into_iter()
            .filter_map(|r| r.get("id").cloned())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    Response::from_json(
        &json!({"ids":ids,"changed":changed,"cascadedChanged":cascaded_changed,"cascadedField":cascade,"cascadedIds":cascaded_ids}),
    )
}

#[derive(Deserialize)]
struct Suggest {
    r#type: String,
    prefix: String,
    limit: f64,
}

pub async fn suggest(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Suggest = req.json().await?;
    suggest_items(o, env).await
}

#[derive(Deserialize)]
struct Autocomplete {
    url: String,
}

pub async fn autocomplete(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Autocomplete = req.json().await?;
    let url = Url::parse(&input.url).map_err(|error| Error::RustError(error.to_string()))?;
    let param = |key| {
        url.query_pairs()
            .find(|(name, _)| name == key)
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default()
    };
    let raw_type = param("type");
    let kind = crate::trim(if raw_type.is_empty() {
        "issuer"
    } else {
        &raw_type
    });
    if kind != "issuer" && kind != "tag" {
        return Response::from_json(&json!({"items":[]}));
    }
    let raw_query = param("q");
    let trimmed = crate::trim(&raw_query);
    let prefix = String::from(
        worker::js_sys::JsString::from(trimmed).slice(0, if kind == "issuer" { 80 } else { 60 }),
    );
    let raw_limit = param("limit");
    let parsed = worker::js_sys::parse_int(
        if raw_limit.is_empty() {
            "8"
        } else {
            &raw_limit
        },
        10,
    );
    let limit = if parsed.is_nan() || parsed == 0.0 {
        8.0
    } else {
        parsed.min(20.0)
    };
    suggest_items(
        Suggest {
            r#type: kind.into(),
            prefix,
            limit,
        },
        env,
    )
    .await
}

async fn suggest_items(o: Suggest, env: &Env) -> Result<Response> {
    let pattern = format!("%{}%", o.prefix);
    let (sql, args) = match (o.r#type.as_str(), o.prefix.is_empty()) {
        ("issuer", false) => (
            "SELECT DISTINCT v FROM (SELECT issuer_ko AS v FROM memorabilia WHERE issuer_ko LIKE ? AND issuer_ko != '' UNION SELECT issuer_en AS v FROM memorabilia WHERE issuer_en LIKE ? AND issuer_en != '') ORDER BY v LIMIT ?",
            vec![
                pattern.as_str().into(),
                pattern.as_str().into(),
                o.limit.into(),
            ],
        ),
        ("issuer", true) => return Response::from_json(&json!({"items":[]})),
        ("tag", true) => (
            "SELECT label, usage_count FROM memorabilia_tag_pool ORDER BY usage_count DESC, label ASC LIMIT ?",
            vec![o.limit.into()],
        ),
        ("tag", false) => (
            "SELECT label FROM memorabilia_tag_pool WHERE label LIKE ? ORDER BY usage_count DESC, label ASC LIMIT ?",
            vec![pattern.as_str().into(), o.limit.into()],
        ),
        _ => return Err(Error::RustError("Invalid suggestion type".into())),
    };
    let field = if o.r#type == "issuer" { "v" } else { "label" };
    let items = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?
        .into_iter()
        .map(|row| row.get(field).cloned().unwrap_or(Value::Null))
        .collect::<Vec<_>>();
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
struct SearchAlias {
    token: String,
}

pub async fn search_alias(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SearchAlias = req.json().await?;
    let token = JsValue::from_str(&o.token);
    let row = env.d1("DB")?.prepare("SELECT term_ko, term_en, term_fr FROM glossary_terms WHERE term_ko = ? OR term_en = ? COLLATE NOCASE OR term_fr = ? COLLATE NOCASE LIMIT 1").bind(&[token.clone(),token.clone(),token])?.first::<Value>(None).await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct SearchCandidates {
    query: String,
    limit: f64,
}

pub async fn search_candidates(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SearchCandidates = req.json().await?;
    if o.limit < 0.0 || o.limit > 500.0 {
        return Err(Error::RustError("Invalid candidate limit".into()));
    }
    let items=env.d1("DB")?.prepare("SELECT memorabilia_id, bm25(memorabilia_fts) AS score FROM memorabilia_fts WHERE memorabilia_fts MATCH ? ORDER BY score ASC LIMIT ?").bind(&[o.query.into(),o.limit.into()])?.all().await?.results::<Value>()?;
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResults {
    candidate_ids: Option<Vec<Value>>,
    countries: Vec<String>,
    categories: Vec<String>,
    event_ids: Vec<f64>,
    tags: Vec<String>,
    issuer: String,
    year_from: Option<f64>,
    year_to: Option<f64>,
    sort: String,
    page_size: f64,
    offset: f64,
}

pub async fn search_results(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SearchResults = req.json().await?;
    let mut conditions = vec!["m.status = 'public'".to_owned()];
    let mut args = Vec::<JsValue>::new();
    if let Some(candidates) = &o.candidate_ids {
        if candidates.is_empty() || candidates.len() > 500 {
            return Err(Error::RustError("Invalid search candidates".into()));
        }
        conditions.push(format!(
            "m.id IN ({})",
            vec!["?"; candidates.len()].join(",")
        ));
        args.extend(super::post_routes::post_bindings(candidates)?);
    }
    if !o.countries.is_empty() {
        conditions.push(format!(
            "m.id IN (SELECT memorabilia_id FROM memorabilia_countries WHERE country_code IN ({}))",
            vec!["?"; o.countries.len()].join(",")
        ));
        args.extend(o.countries.iter().map(|v| v.as_str().into()));
    }
    if !o.categories.is_empty() {
        conditions.push(format!(
            "m.category_id IN (SELECT id FROM memorabilia_categories WHERE slug IN ({}))",
            vec!["?"; o.categories.len()].join(",")
        ));
        args.extend(o.categories.iter().map(|v| v.as_str().into()));
    }
    if !o.event_ids.is_empty() {
        conditions.push(format!(
            "m.event_id IN ({})",
            vec!["?"; o.event_ids.len()].join(",")
        ));
        args.extend(o.event_ids.iter().map(|v| JsValue::from_f64(*v)));
    }
    for tag in &o.tags {
        conditions.push("m.id IN (SELECT mt.memorabilia_id FROM memorabilia_tags mt JOIN memorabilia_tag_pool tp ON tp.id = mt.tag_id WHERE tp.label = ?)".into());
        args.push(tag.as_str().into());
    }
    if !o.issuer.is_empty() {
        conditions.push("(m.issuer_ko LIKE ? OR m.issuer_en LIKE ?)".into());
        let value = format!("%{}%", o.issuer);
        args.extend([value.as_str().into(), value.as_str().into()]);
    }
    if let Some(year) = o.year_from {
        conditions.push("m.year >= ?".into());
        args.push(year.into());
    }
    if let Some(year) = o.year_to {
        conditions.push("m.year <= ?".into());
        args.push(year.into());
    }
    let where_sql = format!("WHERE {}", conditions.join(" AND "));
    let order = match o.sort.as_str() {
        "newest" => "COALESCE(m.published_at, m.updated_at) DESC, m.id DESC".to_owned(),
        "year_asc" => "m.year ASC NULLS LAST, m.id DESC".to_owned(),
        "year_desc" => "m.year DESC NULLS LAST, m.id DESC".to_owned(),
        "title" => "COALESCE(NULLIF(m.title_en, ''), m.title_ko) ASC, m.id DESC".to_owned(),
        _ => {
            if let Some(candidates) = &o.candidate_ids {
                let mut cases = String::new();
                for (index, id) in candidates.iter().enumerate() {
                    let number = id
                        .as_i64()
                        .or_else(|| id.as_str().and_then(|s| s.parse::<i64>().ok()))
                        .ok_or_else(|| Error::RustError("Invalid candidate id".into()))?;
                    cases.push_str(&format!(" WHEN {number} THEN {index}"));
                }
                format!("CASE m.id{cases} ELSE 999999 END ASC")
            } else {
                "COALESCE(m.published_at, m.updated_at) DESC, m.id DESC".to_owned()
            }
        }
    };
    let db = env.d1("DB")?;
    let mut result_args = args.clone();
    result_args.extend([o.page_size.into(), o.offset.into()]);
    let sql = format!(
        "SELECT m.id, m.slug, m.title_en, m.title_ko, m.event_name_en, m.event_name_ko, m.year, m.has_event, m.view_count, c.slug AS category_slug, c.label_en AS category_label_en, c.label_ko AS category_label_ko, (SELECT url FROM memorabilia_images WHERE memorabilia_id = m.id ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) AS primary_image_url FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id = m.category_id {where_sql} ORDER BY {order} LIMIT ? OFFSET ?"
    );
    let results = db
        .prepare(sql)
        .bind(&result_args)?
        .all()
        .await?
        .results::<Value>()?;
    let total_row = db
        .prepare(format!(
            "SELECT COUNT(*) AS n FROM memorabilia m {where_sql}"
        ))
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    let total = total_row
        .as_ref()
        .and_then(|v| v.get("n"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let mut countries = Vec::<Value>::new();
    let mut categories = Vec::<Value>::new();
    let mut tags = Vec::<Value>::new();
    let country_sql = format!(
        "SELECT mc.country_code, COUNT(DISTINCT m.id) AS n FROM memorabilia m JOIN memorabilia_countries mc ON mc.memorabilia_id = m.id LEFT JOIN memorabilia_categories c ON c.id = m.category_id {where_sql} GROUP BY mc.country_code ORDER BY n DESC LIMIT 30"
    );
    if let Ok(result) = db.prepare(country_sql).bind(&args)?.all().await {
        countries = result.results::<Value>()?;
        let cat_sql = format!(
            "SELECT c.slug, c.label_en, c.label_ko, COUNT(*) AS n FROM memorabilia m LEFT JOIN memorabilia_categories c ON c.id = m.category_id {where_sql} AND c.id IS NOT NULL GROUP BY c.slug ORDER BY n DESC"
        );
        if let Ok(result) = db.prepare(cat_sql).bind(&args)?.all().await {
            categories = result.results::<Value>()?;
            let tag_sql = format!(
                "SELECT tp.label, COUNT(*) AS n FROM memorabilia m JOIN memorabilia_tags mt ON mt.memorabilia_id = m.id JOIN memorabilia_tag_pool tp ON tp.id = mt.tag_id LEFT JOIN memorabilia_categories c ON c.id = m.category_id {where_sql} GROUP BY tp.label ORDER BY n DESC LIMIT 20"
            );
            if let Ok(result) = db.prepare(tag_sql).bind(&args)?.all().await {
                tags = result.results::<Value>()?;
            }
        }
    }
    Response::from_json(
        &json!({"results":results,"total":total,"countries":countries,"categories":categories,"tags":tags}),
    )
}

#[derive(Deserialize)]
struct SearchLog {
    query: String,
    hits: f64,
    filters: String,
    ip: Option<String>,
}

pub async fn search_log(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SearchLog = req.json().await?;
    let ip =
        o.ip.as_deref()
            .map(JsValue::from_str)
            .unwrap_or(JsValue::NULL);
    env.d1("DB")?.prepare("INSERT INTO memorabilia_search_log (query,hits,filters_json,client_ip) VALUES (?, ?, ?, ?)").bind(&[o.query.into(),o.hits.into(),o.filters.into(),ip])?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

pub async fn version(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CategoryId = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT updated_at FROM memorabilia WHERE id = ?")
        .bind(&[JsValue::from_f64(o.id)])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"row":row}))
}
