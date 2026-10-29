use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{BTreeSet, HashSet};
use worker::{js_sys, wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TagOptions {
    category: Option<String>,
    days_arg: Option<String>,
}

pub async fn tags(req: &mut Request, env: &Env) -> Result<Response> {
    let o: TagOptions = req.json().await?;
    tags_for(o, env).await
}

#[derive(Deserialize)]
struct TagQuery {
    url: String,
}

pub async fn tags_query(req: &mut Request, env: &Env) -> Result<Response> {
    let o: TagQuery = req.json().await?;
    let url = Url::parse(&o.url).map_err(|e| Error::RustError(e.to_string()))?;
    let param = |key| {
        url.query_pairs()
            .find(|(name, _)| name == key)
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default()
    };
    let category = param("category");
    let category = if category == "worm" {
        "wosm"
    } else {
        &category
    };
    if !category.is_empty() && !["korea", "apr", "wosm", "people"].contains(&category) {
        return Response::from_json(&json!({"tags":[]}));
    }
    let days = js_sys::parse_int(&param("days"), 10);
    let days_arg = if days > 0.0 {
        Some(format!(
            "-{} days",
            String::from(
                js_sys::Number::from(days)
                    .to_string_with_radix(10)
                    .map_err(|_| Error::RustError("Invalid days".into()))?
            )
        ))
    } else {
        None
    };
    tags_for(
        TagOptions {
            category: if category.is_empty() {
                None
            } else {
                Some(category.into())
            },
            days_arg,
        },
        env,
    )
    .await
}

async fn tags_for(o: TagOptions, env: &Env) -> Result<Response> {
    let mut conditions = vec!["published = 1", "tag IS NOT NULL", "tag != ''"];
    let mut args = Vec::<JsValue>::new();
    if let Some(category) = &o.category {
        conditions.push("category = ?");
        args.push(category.into());
    }
    if let Some(days) = &o.days_arg {
        conditions.push("datetime(created_at) >= datetime(?, ?)");
        args.extend(["now".into(), days.into()]);
    }
    let rows = env
        .d1("DB")?
        .prepare(format!(
            "SELECT tag FROM posts WHERE {}",
            conditions.join(" AND ")
        ))
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let mut unique = BTreeSet::<String>::new();
    for row in rows {
        let value = row
            .get("tag")
            .and_then(Value::as_str)
            .ok_or_else(|| Error::RustError("Invalid tag value".into()))?;
        for tag in value.split(',') {
            let tag = super::trim(tag);
            if !tag.is_empty() {
                unique.insert(tag.into());
            }
        }
    }
    let mut tags: Vec<String> = unique.into_iter().collect();
    tags.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    Response::from_json(&json!({"tags":tags}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureOptions {
    category: Option<String>,
    is_admin: bool,
}

pub async fn features(req: &mut Request, env: &Env) -> Result<Response> {
    let o: FeatureOptions = req.json().await?;
    features_for(o, env).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureQuery {
    url: String,
    is_admin: bool,
}

pub async fn features_query(req: &mut Request, env: &Env) -> Result<Response> {
    let input: FeatureQuery = req.json().await?;
    let url = Url::parse(&input.url).map_err(|error| Error::RustError(error.to_string()))?;
    let category = url
        .query_pairs()
        .find(|(key, _)| key == "category")
        .map(|(_, value)| value.into_owned())
        .filter(|value| ["korea", "apr", "wosm", "people"].contains(&value.as_str()));
    features_for(
        FeatureOptions {
            category,
            is_admin: input.is_admin,
        },
        env,
    )
    .await
}

async fn features_for(o: FeatureOptions, env: &Env) -> Result<Response> {
    let filter = if o.category.is_some() {
        "AND category = ?"
    } else {
        ""
    };
    let published = if o.is_admin { "" } else { "AND published = 1" };
    let sql = format!(
        "SELECT DISTINCT special_feature FROM posts WHERE special_feature IS NOT NULL AND special_feature != '' {filter} {published} ORDER BY special_feature ASC"
    );
    let args: Vec<JsValue> = o
        .category
        .as_ref()
        .map(|v| vec![v.into()])
        .unwrap_or_default();
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let items: Vec<Value> = rows
        .into_iter()
        .filter_map(|row| row.get("special_feature").cloned())
        .filter(|v| !v.is_null() && v != &json!(false) && v != &json!(0) && v != &json!(""))
        .collect();
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureCollectionOptions {
    category: String,
    slug: String,
    limit: Option<f64>,
    public_date_expr: String,
}

pub async fn feature_collection(req: &mut Request, env: &Env) -> Result<Response> {
    let options: FeatureCollectionOptions = req.json().await?;
    let sql = format!(
        "SELECT id, category, title, subtitle, tag, image_url, image_caption, created_at, publish_at, special_feature, content, author FROM posts WHERE published = 1 AND category = ? AND special_feature IS NOT NULL AND special_feature != '' ORDER BY {} DESC, id DESC",
        options.public_date_expr
    );
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&[options.category.as_str().into()])?
        .all()
        .await?
        .results::<Value>()?;
    let items = rows
        .into_iter()
        .filter(|row| {
            row.get("special_feature")
                .and_then(Value::as_str)
                .is_some_and(|name| crate::seo::feature_slug(name) == options.slug)
        })
        .collect::<Vec<_>>();
    if items.is_empty() {
        return Response::from_json(&json!({"collection":null}));
    }
    let name = items[0]
        .get("special_feature")
        .cloned()
        .unwrap_or(json!(""));
    let end = options
        .limit
        .map(|value| (value as usize).min(items.len()))
        .unwrap_or(items.len());
    Response::from_json(
        &json!({"collection":{"category":options.category,"special_feature":name,"slug":options.slug,"items":&items[..end]}}),
    )
}

#[derive(Deserialize)]
struct TopicOptions {
    aliases: Vec<String>,
}

pub async fn topic_posts(req: &mut Request, env: &Env) -> Result<Response> {
    let options: TopicOptions = req.json().await?;
    if options.aliases.is_empty() || options.aliases.len() > 10 {
        return Err(Error::RustError("Invalid topic aliases".into()));
    }
    let searchable = "replace(COALESCE(title,'') || ' ' || COALESCE(subtitle,'') || ' ' || COALESCE(tag,'') || ' ' || COALESCE(meta_tags,'') || ' ' || COALESCE(content,''), ' ', '')";
    let conditions = vec![format!("{searchable} LIKE ?"); options.aliases.len()].join(" OR ");
    let sql = format!(
        "SELECT id, title, subtitle, image_url, image_frame, publish_at, created_at FROM posts WHERE published = 1 AND ({conditions}) ORDER BY datetime(COALESCE(NULLIF(publish_at, ''), created_at)) DESC, id DESC LIMIT 18"
    );
    let args = options
        .aliases
        .iter()
        .map(|alias| JsValue::from_str(alias))
        .collect::<Vec<_>>();
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"posts":rows}))
}

#[derive(Deserialize)]
struct PopularOptions {
    origin: String,
}

pub async fn popular(req: &mut Request, env: &Env) -> Result<Response> {
    let options: PopularOptions = req.json().await?;
    let rows = env.d1("DB")?.prepare(
        "WITH likes_by_post AS (SELECT post_id, COUNT(*) AS likes FROM post_likes GROUP BY post_id),
         base AS (SELECT p.id, p.category, p.title, p.subtitle, p.image_url, p.created_at, p.publish_at, p.tag, p.views,
                  COALESCE(l.likes, 0) AS likes FROM posts p LEFT JOIN likes_by_post l ON l.post_id = p.id WHERE p.published = 1),
         maxima AS (SELECT MAX(views) AS max_views, MAX(likes) AS max_likes FROM base)
         SELECT base.*, ROUND(((CAST(base.views AS REAL) / CASE WHEN COALESCE(maxima.max_views, 0) > 0 THEN maxima.max_views ELSE 1 END) * 50) +
         ((CAST(base.likes AS REAL) / CASE WHEN COALESCE(maxima.max_likes, 0) > 0 THEN maxima.max_likes ELSE 1 END) * 50), 2) AS popularity_score
         FROM base CROSS JOIN maxima ORDER BY popularity_score DESC, likes DESC, views DESC, id DESC LIMIT 8"
    ).all().await?.results::<Value>()?;
    let rows: Vec<Value> = rows
        .into_iter()
        .map(|row| post_image(row, &options.origin))
        .collect();
    Response::from_json(&json!({"posts":rows}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HomeOptions {
    category: Option<String>,
    featured: bool,
    limit: u32,
    columns: String,
    public_date_expr: String,
    #[serde(default)]
    card: bool,
    origin: Option<String>,
}

pub async fn normalize_image_frame(req: &mut Request) -> Result<Response> {
    let input: Value = req.json().await?;
    Response::from_json(&json!({"frame":image_frame(input.get("raw"))}))
}

#[allow(deprecated)]
fn image_frame(raw: Option<&Value>) -> Value {
    let source = match raw {
        Some(Value::String(text)) => String::from(js_sys::JsString::from(text.as_str()).trim()),
        Some(value) => match serde_json::to_string(value) {
            Ok(text) => text,
            Err(_) => return Value::Null,
        },
        None => return Value::Null,
    };
    let parsed = match js_sys::JSON::parse(&source) {
        Ok(value) if value.is_object() && !value.is_null() => value,
        _ => return Value::Null,
    };
    let x = js_sys::Reflect::get(&parsed, &JsValue::from_str("x")).unwrap_or(JsValue::UNDEFINED);
    let y = js_sys::Reflect::get(&parsed, &JsValue::from_str("y")).unwrap_or(JsValue::UNDEFINED);
    if (x.is_null() || x.is_undefined()) && (y.is_null() || y.is_undefined()) {
        return Value::Null;
    }
    let percent = |value: &JsValue| {
        let n = js_sys::Number::new(value).value_of();
        if !n.is_finite() {
            return 50.0;
        }
        let result = js_sys::Math::round(n).clamp(0.0, 100.0);
        if result == 0.0 { 0.0 } else { result }
    };
    json!({"x":percent(&x),"y":percent(&y)})
}

pub(crate) fn post_image(mut post: Value, origin: &str) -> Value {
    let Some(id) = post
        .get("id")
        .filter(|id| match id {
            Value::Null | Value::Bool(false) => false,
            Value::Number(n) => n.as_f64() != Some(0.0),
            Value::String(s) => !s.is_empty(),
            _ => true,
        })
        .map(js_string)
    else {
        return post;
    };
    let frame = image_frame(post.get("image_frame"));
    let url = post.get("image_url").and_then(Value::as_str).unwrap_or("");
    let resolved = if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_owned())
    } else if url.starts_with("data:") {
        Some(format!("{origin}/api/posts/{id}/image"))
    } else {
        None
    };
    let has_asset = resolved.is_some();
    if let Some(obj) = post.as_object_mut() {
        obj.insert(
            "image_url".into(),
            json!(resolved.unwrap_or_else(|| format!("{origin}/img/logo.png"))),
        );
        obj.insert("image_is_placeholder".into(), json!(!has_asset));
        obj.insert("image_has_real_asset".into(), json!(has_asset));
        obj.insert("image_frame".into(), frame);
    }
    post
}

#[derive(Deserialize)]
struct HeroManualOptions {
    ids: Vec<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HomeHeroOptions {
    ids: Vec<f64>,
    position: String,
    interval_ms: Value,
    media: Value,
    origin: String,
    public_date_expr: String,
}

pub async fn home_hero(req: &mut Request, env: &Env) -> Result<Response> {
    let o: HomeHeroOptions = req.json().await?;
    let db = env.d1("DB")?;
    home_hero_render(o, &db).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HomeHeroLoadOptions {
    origin: String,
    public_date_expr: String,
}

pub async fn home_hero_from_settings(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HomeHeroLoadOptions = req.json().await?;
    let db = env.d1("DB")?;
    let rows = db
        .prepare(
            "SELECT key, value FROM settings WHERE key IN ('hero', 'hero_interval', 'hero_media')",
        )
        .all()
        .await?
        .results::<Value>()?;
    let raw = |key: &str| {
        rows.iter()
            .find(|row| row.get("key").and_then(Value::as_str) == Some(key))
            .and_then(|row| row.get("value"))
            .and_then(Value::as_str)
            .unwrap_or("")
    };
    let hero = hero_settings(raw("hero"))?;
    let interval = js_sys::parse_int(raw("hero_interval"), 10);
    let interval = if interval.is_finite() {
        interval.clamp(2000.0, 15000.0)
    } else {
        3000.0
    };
    let options = HomeHeroOptions {
        ids: hero
            .get("manual_post_ids")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_f64)
            .collect(),
        position: hero
            .get("manual_position")
            .and_then(Value::as_str)
            .unwrap_or("after_auto")
            .to_owned(),
        interval_ms: json!(interval),
        media: hero_media(raw("hero_media"))?,
        origin: options.origin,
        public_date_expr: options.public_date_expr,
    };
    home_hero_render(options, &db).await
}

async fn home_hero_render(o: HomeHeroOptions, db: &D1Database) -> Result<Response> {
    let mut manual = Vec::<Value>::new();
    for id in o.ids {
        if let Some(row) = db.prepare("SELECT id, category, title, subtitle, image_url, created_at, publish_at FROM posts WHERE id = ? AND published = 1").bind(&[id.into()])?.first::<Value>(None).await? { manual.push(row); }
    }
    let exclusions: Vec<f64> = manual
        .iter()
        .filter_map(|p| p.get("id").and_then(Value::as_f64))
        .filter(|n| n.is_finite() && *n > 0.0)
        .collect();
    let mut conditions = vec!["published = 1".to_owned()];
    let mut args: Vec<JsValue> = Vec::new();
    if !exclusions.is_empty() {
        conditions.push(format!(
            "id NOT IN ({})",
            vec!["?"; exclusions.len()].join(", ")
        ));
        args.extend(exclusions.iter().map(|id| JsValue::from_f64(*id)));
    }
    args.push(3.into());
    let sql = format!(
        "SELECT id, category, title, subtitle, image_url, created_at, publish_at FROM posts WHERE {} ORDER BY {} DESC, id DESC LIMIT ?",
        conditions.join(" AND "),
        o.public_date_expr
    );
    let automatic = db
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let default_media = json!({"fit":"cover","desktop":{"position_x":50,"position_y":50,"zoom":100},"mobile":{"position_x":50,"position_y":50,"zoom":100}});
    let shape = |mut post: Value, manual: bool| {
        let id = post.get("id").map(js_string).unwrap_or_default();
        let url = post.get("image_url").and_then(Value::as_str).unwrap_or("");
        let resolved = if url.starts_with("http://") || url.starts_with("https://") {
            Some(url.to_owned())
        } else if url.starts_with("data:") {
            Some(format!("{}/api/posts/{id}/image", o.origin))
        } else {
            None
        };
        let asset = resolved.is_some();
        let media = if manual {
            o.media
                .get(&id)
                .filter(|v| !v.is_null() && *v != &json!(false))
                .cloned()
                .unwrap_or_else(|| default_media.clone())
        } else {
            default_media.clone()
        };
        if let Some(obj) = post.as_object_mut() {
            obj.insert(
                "image_url".into(),
                json!(resolved.unwrap_or_else(|| format!("{}/img/logo.png", o.origin))),
            );
            obj.insert("image_is_placeholder".into(), json!(!asset));
            obj.insert("image_has_real_asset".into(), json!(asset));
            obj.insert("image_frame".into(), Value::Null);
            obj.insert("media".into(), media);
        }
        post
    };
    let manual = manual.into_iter().map(|p| shape(p, true));
    let automatic = automatic.into_iter().map(|p| shape(p, false));
    let posts: Vec<Value> = if o.position == "before_auto" {
        manual.chain(automatic).take(5).collect()
    } else {
        automatic.chain(manual).take(5).collect()
    };
    Response::from_json(&json!({"posts":posts,"interval_ms":o.interval_ms}))
}

pub async fn hero_manual(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HeroManualOptions = req.json().await?;
    let db = env.d1("DB")?;
    let mut rows = Vec::<Value>::new();
    for id in options.ids {
        let post = db.prepare("SELECT id, category, title, subtitle, image_url, created_at, publish_at FROM posts WHERE id = ? AND published = 1")
            .bind(&[JsValue::from_f64(id)])?.first::<Value>(None).await?;
        if let Some(post) = post {
            rows.push(post);
        }
    }
    Response::from_json(&json!({"posts":rows}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeroAutoOptions {
    excluded: Vec<f64>,
    limit: u32,
    public_date_expr: String,
}

pub async fn hero_auto(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HeroAutoOptions = req.json().await?;
    let mut conditions = vec!["published = 1".to_owned()];
    let mut args = Vec::<JsValue>::new();
    if !options.excluded.is_empty() {
        conditions.push(format!(
            "id NOT IN ({})",
            vec!["?"; options.excluded.len()].join(", ")
        ));
        args.extend(options.excluded.iter().map(|v| JsValue::from_f64(*v)));
    }
    args.push(JsValue::from_f64(options.limit.into()));
    let sql = format!(
        "SELECT id, category, title, subtitle, image_url, created_at, publish_at FROM posts WHERE {} ORDER BY {} DESC, id DESC LIMIT ?",
        conditions.join(" AND "),
        options.public_date_expr
    );
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"posts":rows}))
}

#[derive(Deserialize)]
struct HomeLeadOptions {
    id: f64,
    columns: String,
    #[serde(default)]
    card: bool,
    origin: Option<String>,
}

#[derive(Deserialize)]
struct FooterOptions {
    today: bool,
}

#[derive(Deserialize)]
struct HydrateOptions {
    ids: Vec<f64>,
    columns: String,
    #[serde(default)]
    card: bool,
    origin: Option<String>,
}

#[derive(Deserialize)]
struct LeadRankOptions {
    days: u32,
}

#[derive(Deserialize)]
struct HomeSettingOptions {
    key: String,
    #[serde(default)]
    normalize: bool,
}

pub(crate) fn js_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => v.to_string(),
        Value::Object(_) => "[object Object]".into(),
        Value::Array(values) => values
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
    }
}

pub(crate) fn post_excerpt(post: &Value, limit: u32) -> js_sys::JsString {
    let get = |key: &str| {
        post.get(key)
            .filter(|value| match value {
                Value::Null | Value::Bool(false) => false,
                Value::String(s) => !s.is_empty(),
                Value::Number(n) => n.as_f64() != Some(0.0),
                _ => true,
            })
            .map(js_string)
            .unwrap_or_default()
    };
    let raw = get("content");
    let subtitle = get("subtitle");
    let trimmed = super::trim(&raw);
    let editor = if trimmed.starts_with('{') && trimmed.contains("\"blocks\"") {
        serde_json::from_str::<Value>(trimmed)
            .ok()
            .and_then(|doc| doc.get("blocks").and_then(Value::as_array).cloned())
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|block| {
                        let data = block.get("data")?;
                        if let Some(text) = data.get("text").and_then(Value::as_str) {
                            return if text.is_empty() {
                                None
                            } else {
                                Some(text.to_owned())
                            };
                        }
                        data.get("items")
                            .and_then(Value::as_array)
                            .map(|items| {
                                items
                                    .iter()
                                    .map(|item| {
                                        if item.is_null() {
                                            String::new()
                                        } else {
                                            js_string(item)
                                        }
                                    })
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            })
                            .filter(|text| !text.is_empty())
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default()
    } else {
        String::new()
    };
    let source = if editor.is_empty() { &raw } else { &editor };
    let mut text = js_sys::JsString::from(source.as_str());
    for (pattern, replacement, flags) in [
        (r"<style[\s\S]*?</style>", " ", "gi"),
        (r"<script[\s\S]*?</script>", " ", "gi"),
        (r"<[^>]+>", " ", "g"),
        (r"&nbsp;", " ", "gi"),
        (r"&amp;", "&", "gi"),
        (r"&lt;", "<", "gi"),
        (r"&gt;", ">", "gi"),
        (r"&quot;", "\"", "gi"),
        (r"&#39;", "'", "gi"),
        (r"\s+", " ", "g"),
    ] {
        text = text.replace_by_pattern(&js_sys::RegExp::new(pattern, flags), replacement);
    }
    text = text.trim();
    if text.length() == 0 {
        text = js_sys::JsString::from(subtitle.as_str()).trim();
    }
    if text.length() > limit {
        text = text
            .slice(0, limit - 1)
            .trim()
            .concat(&js_sys::JsString::from("…"));
    }
    text
}

fn home_card(mut post: Value) -> Value {
    let text = post_excerpt(&post, 420);
    let Some(object) = post.as_object_mut() else {
        return post;
    };
    object.remove("content");
    let last = if text.length() > 1 {
        text.char_code_at(text.length() - 2) as u32
    } else {
        0
    };
    if (0xd800..=0xdbff).contains(&last) && text.char_code_at(text.length() - 1) == 0x2026 as f64 {
        let units: Vec<u16> = (0..text.length())
            .map(|i| text.char_code_at(i) as u16)
            .collect();
        object.insert("excerpt".into(), json!({"__utf16":units}));
    } else {
        object.insert("excerpt".into(), Value::String(String::from(text)));
    }
    post
}

fn card_response(data: &Value) -> Result<Response> {
    let raw = serde_json::to_string(data).map_err(|e| Error::RustError(e.to_string()))?;
    let root =
        js_sys::JSON::parse(&raw).map_err(|_| Error::RustError("Invalid card JSON".into()))?;
    let property = |obj: &JsValue, key: &str| {
        js_sys::Reflect::get(obj, &JsValue::from_str(key)).unwrap_or(JsValue::UNDEFINED)
    };
    let restore = |post: &JsValue| -> Result<()> {
        if post.is_null() || post.is_undefined() {
            return Ok(());
        }
        let excerpt = property(post, "excerpt");
        if !excerpt.is_object() {
            return Ok(());
        }
        let units = property(&excerpt, "__utf16");
        if !js_sys::Array::is_array(&units) {
            return Ok(());
        }
        let units = js_sys::Array::from(&units)
            .iter()
            .filter_map(|v| v.as_f64().map(|n| n as u16))
            .collect::<Vec<_>>();
        let text = js_sys::JsString::from_char_code(&units);
        js_sys::Reflect::set(post, &JsValue::from_str("excerpt"), &text)
            .map_err(|_| Error::RustError("Invalid card excerpt".into()))?;
        Ok(())
    };
    for key in [
        "posts", "picks", "popular", "latest", "korea", "apr", "wosm", "people",
    ] {
        let posts = property(&root, key);
        if js_sys::Array::is_array(&posts) {
            for post in js_sys::Array::from(&posts).iter() {
                restore(&post)?;
            }
        }
    }
    restore(&property(&root, "post"))?;
    let json = js_sys::JSON::stringify(&root)
        .map_err(|_| Error::RustError("Unable to serialize card".into()))?;
    Response::ok(String::from(json))
}

pub(crate) fn hero_settings(raw: &str) -> Result<Value> {
    use worker::wasm_bindgen::JsCast;
    let value = String::from(js_sys::JsString::from(raw).trim());
    let parsed = js_sys::JSON::parse(&value).unwrap_or(JsValue::NULL);
    let property = |name: &str| {
        js_sys::Reflect::get(&parsed, &JsValue::from_str(name)).unwrap_or(JsValue::UNDEFINED)
    };
    let ids = if value.starts_with('{') {
        let manual = property("manual_post_ids");
        let old = property("post_ids");
        if js_sys::Array::is_array(&manual) {
            manual
        } else if js_sys::Array::is_array(&old) {
            old
        } else {
            js_sys::Array::new().into()
        }
    } else if value.starts_with('[') {
        if js_sys::Array::is_array(&parsed) {
            parsed.clone()
        } else {
            js_sys::Array::new().into()
        }
    } else {
        let single = js_sys::Array::new();
        single.push(&JsValue::from_str(&value));
        single.into()
    };
    let parse_int: js_sys::Function =
        js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("parseInt"))
            .map_err(|_| Error::RustError("Unable to access parseInt".into()))?
            .dyn_into()
            .map_err(|_| Error::RustError("Invalid parseInt function".into()))?;
    let mut parsed_ids = Vec::new();
    for id in js_sys::Array::from(&ids).iter() {
        let parsed = parse_int
            .call2(&JsValue::UNDEFINED, &id, &JsValue::from_f64(10.0))
            .map_err(|_| Error::RustError("Invalid hero ID conversion".into()))?;
        parsed_ids.push(parsed.as_f64().unwrap_or(f64::NAN));
    }
    let ids: Vec<f64> = parsed_ids
        .into_iter()
        .filter(|id| id.is_finite() && *id > 0.0)
        .take(2)
        .collect();
    let position = if value.starts_with('{')
        && property("manual_position").as_string().as_deref() == Some("before_auto")
    {
        "before_auto"
    } else {
        "after_auto"
    };
    Ok(json!({"manual_post_ids":ids,"manual_position":position}))
}

fn media_number(value: Option<&Value>, minimum: f64, maximum: f64, fallback: f64) -> f64 {
    let number = value
        .map(|v| js_sys::parse_int(&js_string(v), 10))
        .unwrap_or(f64::NAN);
    if number.is_finite() {
        number.clamp(minimum, maximum)
    } else {
        fallback
    }
}

fn home_media(raw: &Value) -> Value {
    let base_x = media_number(raw.get("position_x"), 0.0, 100.0, 50.0);
    let base_y = media_number(raw.get("position_y"), 0.0, 100.0, 50.0);
    let base_zoom = media_number(raw.get("zoom"), 60.0, 150.0, 100.0);
    let variant = |key: &str| {
        let view = raw
            .get(key)
            .filter(|v| v.is_object() || v.is_array())
            .unwrap_or(raw);
        json!({"position_x":media_number(view.get("position_x"),0.0,100.0,base_x),
               "position_y":media_number(view.get("position_y"),0.0,100.0,base_y),
               "zoom":media_number(view.get("zoom"),60.0,150.0,base_zoom)})
    };
    json!({"fit":if raw.get("fit").and_then(Value::as_str) == Some("contain") { "contain" } else { "cover" },
           "desktop":variant("desktop"), "mobile":variant("mobile")})
}

pub async fn normalize_hero_write(req: &mut Request) -> Result<Response> {
    let input: Value = req.json().await?;
    let ids: Vec<f64> = input
        .get("ids")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|id| js_sys::parse_int(&js_string(id), 10))
        .filter(|id| id.is_finite() && *id > 0.0)
        .take(2)
        .collect();
    let position = if input.get("position").and_then(Value::as_str) == Some("before_auto") {
        "before_auto"
    } else {
        "after_auto"
    };
    let interval = input
        .get("interval")
        .map(|v| js_sys::parse_int(&js_string(v), 10))
        .unwrap_or(f64::NAN);
    let interval = if interval.is_finite() {
        interval.clamp(2000.0, 15000.0)
    } else {
        3000.0
    };
    let requested = input.get("media").filter(|v| v.is_array() || v.is_object());
    let existing = input.get("existing").and_then(Value::as_str).unwrap_or("");
    let source = requested
        .map(|v| v.to_string())
        .unwrap_or_else(|| existing.to_string());
    let normalized = hero_media(&source)?;
    let mut media = serde_json::Map::new();
    if let Some(map) = normalized.as_object() {
        for id in &ids {
            let key = id.to_string();
            if let Some(item) = map.get(&key) {
                media.insert(key, item.clone());
            }
        }
    }
    Response::from_json(&json!({"ids":ids,"position":position,"interval":interval,"media":media}))
}

pub async fn normalize_home_media(req: &mut Request) -> Result<Response> {
    let input: Value = req.json().await?;
    Response::from_json(&home_media(input.get("media").unwrap_or(&Value::Null)))
}

fn home_media_from_js(raw: &JsValue) -> Result<Value> {
    use worker::wasm_bindgen::JsCast;
    let root = if raw.is_object() && !raw.is_null() {
        raw.clone()
    } else {
        JsValue::UNDEFINED
    };
    let get = |value: &JsValue, key: &str| {
        js_sys::Reflect::get(value, &JsValue::from_str(key)).unwrap_or(JsValue::UNDEFINED)
    };
    let parse: js_sys::Function =
        js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("parseInt"))
            .map_err(|_| Error::RustError("Unable to access parseInt".into()))?
            .dyn_into()
            .map_err(|_| Error::RustError("Invalid parseInt function".into()))?;
    let number = |value: &JsValue, minimum: f64, maximum: f64, fallback: f64| -> Result<f64> {
        let n = parse
            .call2(&JsValue::UNDEFINED, value, &JsValue::from_f64(10.0))
            .map_err(|_| Error::RustError("Invalid media number".into()))?
            .as_f64()
            .unwrap_or(f64::NAN);
        Ok(if n.is_finite() {
            let value = n.clamp(minimum, maximum);
            if value == 0.0 { 0.0 } else { value }
        } else {
            fallback
        })
    };
    let base_x = number(&get(&root, "position_x"), 0.0, 100.0, 50.0)?;
    let base_y = number(&get(&root, "position_y"), 0.0, 100.0, 50.0)?;
    let base_zoom = number(&get(&root, "zoom"), 60.0, 150.0, 100.0)?;
    let variant = |key: &str| -> Result<Value> {
        let candidate = get(&root, key);
        let view = if candidate.is_object() && !candidate.is_null() {
            candidate
        } else {
            root.clone()
        };
        Ok(
            json!({"position_x":number(&get(&view,"position_x"),0.0,100.0,base_x)?,"position_y":number(&get(&view,"position_y"),0.0,100.0,base_y)?,"zoom":number(&get(&view,"zoom"),60.0,150.0,base_zoom)?}),
        )
    };
    Ok(
        json!({"fit":if get(&root,"fit").as_string().as_deref()==Some("contain") {"contain"} else {"cover"},"desktop":variant("desktop")?,"mobile":variant("mobile")?}),
    )
}

pub(crate) fn hero_media(raw: &str) -> Result<Value> {
    use worker::wasm_bindgen::JsCast;
    let value = js_sys::JSON::parse(raw).unwrap_or(JsValue::NULL);
    let mut map = serde_json::Map::new();
    if value.is_object() && !value.is_null() {
        let object: js_sys::Object = value.clone().unchecked_into();
        for key in js_sys::Object::keys(&object).iter() {
            let key = key
                .as_string()
                .ok_or_else(|| Error::RustError("Invalid hero media key".into()))?;
            let item = js_sys::Reflect::get(&value, &JsValue::from_str(&key))
                .unwrap_or(JsValue::UNDEFINED);
            map.insert(key, home_media_from_js(&item)?);
        }
    }
    Ok(Value::Object(map))
}

pub async fn home_setting(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HomeSettingOptions = req.json().await?;
    if !matches!(
        options.key.as_str(),
        "translations" | "ticker" | "hero" | "hero_interval" | "hero_media"
    ) {
        return Err(Error::RustError("Invalid home setting".into()));
    }
    let row = env
        .d1("DB")?
        .prepare("SELECT value FROM settings WHERE key = ?")
        .bind(&[options.key.as_str().into()])?
        .first::<Value>(None)
        .await?;
    let mut result = json!({"row":row});
    if options.normalize && options.key == "hero" {
        let raw = row
            .as_ref()
            .and_then(|r| r.get("value"))
            .and_then(Value::as_str)
            .unwrap_or("");
        result["normalized"] = hero_settings(raw)?;
        return Response::from_json(&result);
    }
    if options.normalize && options.key == "hero_media" {
        let raw = row
            .as_ref()
            .and_then(|r| r.get("value"))
            .and_then(Value::as_str)
            .unwrap_or("");
        result["normalized"] = hero_media(raw)?;
        return Response::from_json(&result);
    }
    if options.normalize && options.key == "hero_interval" {
        let raw = row
            .as_ref()
            .and_then(|r| r.get("value"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let interval = js_sys::parse_int(raw, 10);
        result["normalized"] = json!(if interval.is_finite() {
            interval.clamp(2000.0, 15000.0)
        } else {
            3000.0
        });
        return Response::from_json(&result);
    }
    if options.normalize {
        let raw = row
            .as_ref()
            .and_then(|r| r.get("value"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty());
        let fallback = if options.key == "translations" {
            "{}"
        } else {
            "[]"
        };
        if row.is_none() && options.key == "translations" {
            result["normalized"] = json!({});
        }
        if row.is_some() {
            let source = raw.unwrap_or(fallback);
            if let Ok(parsed) = serde_json::from_str::<Value>(source) {
                let normalized = match (options.key.as_str(), parsed) {
                    ("translations", Value::Object(object)) => {
                        let source = object
                            .get("strings")
                            .and_then(Value::as_object)
                            .unwrap_or(&object);
                        let strings = source
                            .iter()
                            .filter(|(key, _)| !key.starts_with("nav.") && *key != "__proto__")
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect();
                        Some(Value::Object(strings))
                    }
                    ("ticker", value @ Value::Array(_)) => Some(value),
                    _ => None,
                };
                if let Some(normalized) = normalized {
                    result["normalized"] = normalized;
                } else {
                    result["error"] = json!(if options.key == "translations" {
                        "Translations settings must be an object"
                    } else {
                        "Ticker settings must be an array"
                    });
                }
            } else if let Err(error) = js_sys::JSON::parse(source) {
                let message = js_sys::Reflect::get(&error, &"message".into())
                    .ok()
                    .and_then(|v| v.as_string())
                    .unwrap_or_else(|| "Invalid JSON".into());
                result["error"] = json!(message);
            }
        }
    }
    Response::from_json(&result)
}

pub(crate) async fn lead_settings(env: &Env) -> Result<Vec<Value>> {
    let rows = env.d1("DB")?.prepare("SELECT key, value FROM settings WHERE key IN ('home_lead_post', 'home_lead_media', 'home_lead_mode', 'home_lead_rev')")
        .all().await?.results::<Value>()?;
    Ok(rows)
}

fn lead_media(rows: &[Value]) -> Result<Value> {
    let raw = rows
        .iter()
        .find(|row| row.get("key").and_then(Value::as_str) == Some("home_lead_media"))
        .and_then(|row| row.get("value"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let parsed = js_sys::JSON::parse(raw).unwrap_or(JsValue::NULL);
    home_media_from_js(&parsed)
}

pub async fn home_lead_state(env: &Env) -> Result<Response> {
    let rows = lead_settings(env).await?;
    Response::from_json(&json!({"items":rows,"normalized_media":lead_media(&rows)?}))
}

pub async fn home_lead_rank(req: &mut Request, env: &Env) -> Result<Response> {
    let options: LeadRankOptions = req.json().await?;
    Response::from_json(&lead_rank(env, options.days).await?)
}

pub(crate) async fn lead_rank(env: &Env, days: u32) -> Result<Value> {
    let rows = env.d1("DB")?.prepare("SELECT posts.id, COUNT(pv.post_id) AS views FROM posts LEFT JOIN post_views pv ON pv.post_id = posts.id AND pv.viewed_at >= datetime('now', ?) WHERE posts.published = 1 GROUP BY posts.id")
        .bind(&[format!("-{} day",days).into()])?.all().await?.results::<Value>()?;
    let score = rows
        .iter()
        .filter_map(|row| row.get("views").and_then(Value::as_u64))
        .max()
        .unwrap_or(0);
    let tied: Vec<Value> = rows
        .iter()
        .filter(|row| row.get("views").and_then(Value::as_u64).unwrap_or(0) == score)
        .filter_map(|row| row.get("id").cloned())
        .collect();
    let picked = if tied.is_empty() {
        0
    } else {
        let index = (js_sys::Math::random() * tied.len() as f64).floor() as usize;
        tied[index].as_i64().unwrap_or(0)
    };
    let reason = if rows.is_empty() {
        "선정할 공개글이 없음".to_string()
    } else {
        format!(
            "최근 {}일 조회수 1위{}",
            days,
            if tied.len() > 1 {
                " (동률 무작위 선정)"
            } else {
                ""
            }
        )
    };
    Ok(json!({"id":picked,"score":score,"reason":reason,"candidates":rows.len()}))
}

pub async fn home_hydrate(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HydrateOptions = req.json().await?;
    if options.ids.is_empty() {
        return Response::from_json(&json!({"posts":[]}));
    }
    let placeholders = vec!["?"; options.ids.len()].join(", ");
    let sql = format!(
        "SELECT {} FROM posts WHERE id IN ({placeholders})",
        options.columns
    );
    let args: Vec<JsValue> = options.ids.iter().map(|v| JsValue::from_f64(*v)).collect();
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let rows: Vec<Value> = if options.card {
        rows.into_iter().map(home_card).collect()
    } else {
        rows
    };
    let rows = match options.origin {
        Some(origin) => rows
            .into_iter()
            .map(|row| post_image(row, &origin))
            .collect(),
        None => rows,
    };
    let data = json!({"posts":rows});
    if options.card {
        card_response(&data)
    } else {
        Response::from_json(&data)
    }
}

async fn footer_row(env: &Env, today: bool) -> Result<Option<Value>> {
    let day = if today {
        "AND datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours'))"
    } else {
        ""
    };
    let sql = format!(
        "SELECT COUNT(DISTINCT viewer_key) AS u, COUNT(*) AS v FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html') {day}"
    );
    env.d1("DB")?.prepare(sql).first::<Value>(None).await
}

pub async fn footer_count(req: &mut Request, env: &Env) -> Result<Response> {
    let options: FooterOptions = req.json().await?;
    let row = footer_row(env, options.today).await?;
    Response::from_json(&row.unwrap_or_else(|| json!({"u":0,"v":0})))
}

#[derive(Deserialize)]
struct HomeFooterOptions {
    #[serde(default)]
    strict: bool,
}

pub async fn home_footer_analytics(req: &mut Request, env: &Env) -> Result<Response> {
    use std::{
        future::{Future, poll_fn},
        task::Poll,
    };
    let options: HomeFooterOptions = req.json().await?;
    let mut today_future = Box::pin(footer_row(env, true));
    let mut total_future = Box::pin(footer_row(env, false));
    let mut today = None;
    let mut total = None;
    poll_fn(|cx| {
        if today.is_none()
            && let Poll::Ready(result) = today_future.as_mut().poll(cx)
        {
            today = Some(result);
        }
        if total.is_none()
            && let Poll::Ready(result) = total_future.as_mut().poll(cx)
        {
            total = Some(result);
        }
        if today.is_some() && total.is_some() {
            Poll::Ready(())
        } else {
            Poll::Pending
        }
    })
    .await;
    if options.strict
        && (today.as_ref().is_some_and(Result::is_err)
            || total.as_ref().is_some_and(Result::is_err))
    {
        return Err(Error::RustError("SSR footer query failed".into()));
    }
    let get = |row: &Option<Result<Option<Value>>>, key: &str| {
        row.as_ref()
            .and_then(|result| result.as_ref().ok())
            .and_then(Option::as_ref)
            .and_then(|r| r.get(key))
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
    };
    let tu = get(&today, "u");
    let tv = get(&today, "v");
    let au = get(&total, "u");
    let av = get(&total, "v");
    let mut output = json!({"provider":"site_visits","provider_label":"공개 페이지 전체 방문 집계","today_unique":tu,"today_views":tv,"total_unique":au,"today_visits":tu,"total_visits":au,"total_pageviews":av,"measured_basis":"site_visits"});
    if options.strict {
        let format = |value: f64| {
            #[allow(deprecated)]
            let number = js_sys::Number::new(&JsValue::from_f64(value));
            String::from(number.to_locale_string("ko-KR"))
        };
        output["ssr_footer"] =
            json!({"totalVisitors":format(au),"totalViews":format(av),"todayVisitors":format(tu)});
    }
    Response::from_json(&output)
}

#[derive(Deserialize)]
struct HomeLeadSelectionOptions {
    columns: String,
    origin: String,
}

pub async fn home_lead(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HomeLeadSelectionOptions = req.json().await?;
    let rows = lead_settings(env).await?;
    let value = |key: &str| {
        rows.iter()
            .find(|row| row.get("key").and_then(Value::as_str) == Some(key))
            .and_then(|row| row.get("value"))
    };
    let mut id = value("home_lead_post")
        .map(|v| js_sys::parse_int(&js_string(v), 10))
        .filter(|n| !n.is_nan())
        .unwrap_or(0.0);
    if id == 0.0 && value("home_lead_mode").and_then(Value::as_str) != Some("manual") {
        id = lead_rank(env, 7)
            .await?
            .get("id")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
    }
    let post = if id == 0.0 {
        None
    } else {
        let sql = format!(
            "SELECT {} FROM posts WHERE id = ? AND published = 1",
            options.columns
        );
        env.d1("DB")?
            .prepare(sql)
            .bind(&[JsValue::from_f64(id)])?
            .first::<Value>(None)
            .await?
            .map(home_card)
            .map(|row| post_image(row, &options.origin))
    };
    card_response(&json!({"post":post,"media":lead_media(&rows)?}))
}

pub async fn home_lead_post(req: &mut Request, env: &Env) -> Result<Response> {
    let options: HomeLeadOptions = req.json().await?;
    let sql = format!(
        "SELECT {} FROM posts WHERE id = ? AND published = 1",
        options.columns
    );
    let post = env
        .d1("DB")?
        .prepare(sql)
        .bind(&[JsValue::from_f64(options.id)])?
        .first::<Value>(None)
        .await?;
    let post = if options.card {
        post.map(home_card)
    } else {
        post
    };
    let post = match options.origin {
        Some(origin) => post.map(|row| post_image(row, &origin)),
        None => post,
    };
    let data = json!({"post":post});
    if options.card {
        card_response(&data)
    } else {
        Response::from_json(&data)
    }
}

#[derive(Deserialize)]
struct DetailOptions {
    id: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LikeOptions {
    post_id: f64,
    viewer_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewOptions {
    post_id: f64,
    viewer_key: String,
    view_bucket: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManualRelatedOptions {
    ids: Option<Vec<f64>>,
    raw_json: Option<String>,
    post_id: Option<f64>,
    limit: Option<f64>,
    limit_kind: Option<String>,
}

pub async fn related_manual(req: &mut Request, env: &Env) -> Result<Response> {
    let options: ManualRelatedOptions = req.json().await?;
    let ids = if let Some(ids) = options.ids {
        ids
    } else {
        use worker::wasm_bindgen::JsCast;
        let raw = js_sys::JSON::parse(options.raw_json.as_deref().unwrap_or("null"))
            .map_err(|_| Error::RustError("Invalid related input".into()))?;
        let parsed: JsValue = if raw.is_string() {
            let parse: js_sys::Function = js_sys::Reflect::get(
                &js_sys::Reflect::get(&js_sys::global(), &"JSON".into())
                    .map_err(|_| Error::RustError("JSON unavailable".into()))?,
                &"parse".into(),
            )
            .map_err(|_| Error::RustError("JSON parse unavailable".into()))?
            .unchecked_into();
            match parse.call1(&JsValue::UNDEFINED, &raw) {
                Ok(value) => value,
                Err(_) => {
                    let text: js_sys::JsString = raw.unchecked_into();
                    text.split(",").into()
                }
            }
        } else {
            raw
        };
        let mut ids = Vec::new();
        if js_sys::Array::is_array(&parsed) {
            let parse_int: js_sys::Function =
                js_sys::Reflect::get(&js_sys::global(), &"parseInt".into())
                    .map_err(|_| Error::RustError("parseInt unavailable".into()))?
                    .unchecked_into();
            for item in js_sys::Array::from(&parsed).iter() {
                let value = if item.is_object() && !item.is_null() {
                    js_sys::Reflect::get(&item, &"id".into()).unwrap_or(JsValue::UNDEFINED)
                } else {
                    item
                };
                let id = parse_int
                    .call2(&JsValue::UNDEFINED, &value, &JsValue::from_f64(10.0))
                    .ok()
                    .and_then(|value| value.as_f64())
                    .unwrap_or(f64::NAN);
                if id.is_finite() && id >= 1.0 && !ids.contains(&id) && Some(id) != options.post_id
                {
                    ids.push(id);
                }
            }
        }
        let end = match options.limit_kind.as_deref() {
            Some("inf") => ids.len() as f64,
            Some("-inf" | "nan") => 0.0,
            _ => options.limit.unwrap_or(0.0).trunc(),
        };
        let end = if end < 0.0 {
            (ids.len() as f64 + end).max(0.0)
        } else {
            end.min(ids.len() as f64)
        };
        ids.truncate(end as usize);
        ids
    };
    if ids.is_empty() {
        return Response::from_json(&json!({"items":[]}));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let args: Vec<JsValue> = ids.iter().map(|id| JsValue::from_f64(*id)).collect();
    let sql = format!(
        "SELECT id, title, category, created_at, publish_at FROM posts WHERE published = 1 AND id IN ({placeholders})"
    );
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let items: Vec<Value> = ids
        .iter()
        .filter_map(|id| {
            rows.iter()
                .find(|row| row.get("id").and_then(Value::as_f64) == Some(*id))
        })
        .map(|row| {
            let mut item = serde_json::Map::new();
            if let Some(id) = row.get("id") {
                item.insert("id".into(), id.clone());
            }
            for key in ["title", "category", "publish_at", "created_at"] {
                let value = row
                    .get(key)
                    .filter(|value| match value {
                        Value::Null | Value::Bool(false) => false,
                        Value::String(s) => !s.is_empty(),
                        Value::Number(n) => n.as_f64() != Some(0.0),
                        _ => true,
                    })
                    .cloned()
                    .unwrap_or_else(|| json!(""));
                item.insert(key.into(), value);
            }
            Value::Object(item)
        })
        .collect();
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoRelatedOptions {
    post_id: f64,
    category: String,
    excluded: Vec<f64>,
    tag: String,
    meta_tags: String,
    title: String,
    public_date_expr: String,
    base_category: Value,
    limit: Option<f64>,
    #[serde(default)]
    unbounded: bool,
    #[serde(default)]
    manual_items: Vec<Value>,
    total_limit: Option<f64>,
}

pub async fn related_auto(req: &mut Request, env: &Env) -> Result<Response> {
    let o: AutoRelatedOptions = req.json().await?;
    let anchor_tag_terms: Vec<String> = related_terms(&[o.tag.clone(), o.meta_tags.clone()], false)
        .into_iter()
        .take(6)
        .collect();
    let anchor_title_terms: Vec<String> = related_terms(std::slice::from_ref(&o.title), true)
        .into_iter()
        .take(8)
        .collect();
    let terms: Vec<String> = anchor_tag_terms
        .iter()
        .chain(&anchor_title_terms)
        .take(10)
        .cloned()
        .collect();
    let mut sql = "SELECT id, title, category, created_at, publish_at, tag, meta_tags FROM posts WHERE published = 1 AND id != ?".to_owned();
    let mut args = vec![JsValue::from_f64(o.post_id)];
    if !o.excluded.is_empty() {
        sql.push_str(&format!(
            " AND id NOT IN ({})",
            vec!["?"; o.excluded.len()].join(", ")
        ));
        args.extend(o.excluded.iter().map(|id| JsValue::from_f64(*id)));
    }
    if !terms.is_empty() {
        let patterns = vec![
            "LOWER(COALESCE(tag, '')) LIKE ? OR LOWER(COALESCE(meta_tags, '')) LIKE ? OR LOWER(COALESCE(title, '')) LIKE ?";
            terms.len()
        ];
        sql.push_str(&format!(" AND (category = ? OR {})", patterns.join(" OR ")));
        args.push(o.category.into());
        for term in &terms {
            let pattern = JsValue::from_str(&format!("%{term}%"));
            args.extend([pattern.clone(), pattern.clone(), pattern]);
        }
    } else if !o.category.is_empty() {
        sql.push_str(" AND category = ?");
        args.push(o.category.into());
    }
    sql.push_str(&format!(" ORDER BY {} DESC LIMIT ?", o.public_date_expr));
    args.push(JsValue::from_f64(if terms.is_empty() {
        20.0
    } else {
        40.0
    }));
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let tag_anchor: HashSet<_> = anchor_tag_terms.iter().cloned().collect();
    let title_anchor: HashSet<_> = anchor_title_terms.iter().cloned().collect();
    let mut ranked: Vec<_> = rows.into_iter().filter_map(|row| {
        let title = string_or_empty(row.get("title"));
        if title.is_empty() { return None; }
        let tags: HashSet<_> = related_terms(&[string_or_empty(row.get("tag")), string_or_empty(row.get("meta_tags"))], false).into_iter().collect();
        let titles: HashSet<_> = related_terms(std::slice::from_ref(&title), true).into_iter().collect();
        let score = tag_anchor.intersection(&tags).count() * 100
            + title_anchor.intersection(&titles).count() * 20
            + if row.get("category") == Some(&o.base_category) { 20 } else { 0 };
        let published = string_or_empty(row.get("publish_at"));
        let created = string_or_empty(row.get("created_at"));
        let date = if published.is_empty() { created.clone() } else { published.clone() };
        Some((score, date, json!({"id": row.get("id"), "title": title,
            "category": string_or_empty(row.get("category")), "publish_at": published, "created_at": created})))
    }).collect();
    ranked.sort_by(|a, b| {
        b.0.cmp(&a.0).then_with(|| {
            let result = js_sys::JsString::from(b.1.as_str()).locale_compare(
                &a.1,
                &js_sys::Array::new(),
                &js_sys::Object::new(),
            );
            result.cmp(&0)
        })
    });
    let limit = if o.unbounded {
        usize::MAX
    } else {
        o.limit.unwrap_or(0.0).max(0.0) as usize
    };
    let mut items = o.manual_items;
    items.extend(ranked.into_iter().take(limit).map(|(_, _, item)| item));
    if let Some(total) = o.total_limit {
        items.truncate(total.max(0.0) as usize);
    }
    Response::from_json(&json!({"items":items}))
}

fn string_or_empty(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) if value.as_f64() != Some(0.0) => value.to_string(),
        Some(Value::Bool(true)) => "true".into(),
        _ => String::new(),
    }
}

fn related_terms(values: &[String], title: bool) -> Vec<String> {
    let split = js_sys::RegExp::new(if title { r"\s+" } else { r"[\s,]+" }, "");
    let strip_title = js_sys::RegExp::new(r"[^a-z0-9가-힣\s]", "g");
    let strip_hash = js_sys::RegExp::new(r"^#+", "");
    let strip_wildcards = js_sys::RegExp::new(r"[%_\\]", "g");
    let mut out = Vec::new();
    for value in values {
        let input = js_sys::JsString::from(value.as_str());
        let input = if title {
            input.to_lower_case().replace_by_pattern(&strip_title, " ")
        } else {
            input
        };
        for item in input.split_by_pattern(&split).iter() {
            let item = js_sys::JsString::from(item).trim();
            let item = if title {
                item
            } else {
                item.to_lower_case()
                    .replace_by_pattern(&strip_hash, "")
                    .replace_by_pattern(&strip_wildcards, "")
            };
            let length = item.length();
            if length >= 2 && (title || length <= 64) {
                let term = String::from(item);
                if !out.contains(&term) {
                    out.push(term);
                }
            }
        }
    }
    out
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeatureRelatedOptions {
    post_id: f64,
    category: String,
    feature: Option<String>,
    feature_units: Option<Vec<u16>>,
    limit: f64,
    public_date_expr: String,
}

pub async fn related_feature(req: &mut Request, env: &Env) -> Result<Response> {
    let o: FeatureRelatedOptions = req.json().await?;
    let category = crate::trim(&o.category);
    let raw = if let Some(units) = &o.feature_units {
        js_sys::JsString::from_char_code(units)
    } else {
        js_sys::JsString::from(o.feature.as_deref().unwrap_or(""))
    };
    let feature = raw
        .trim()
        .replace_by_pattern(&js_sys::RegExp::new(r"\s+", "g"), " ")
        .slice(0, 120);
    if category.is_empty() || feature.length() == 0 {
        return Response::from_json(&json!({"items":[]}));
    }
    let sql = format!(
        "SELECT id, category, title, subtitle, tag, image_url, image_caption, created_at, publish_at, special_feature FROM posts WHERE published = 1 AND category = ? AND COALESCE(special_feature, '') = ? AND id != ? ORDER BY {} DESC, id DESC LIMIT ?",
        o.public_date_expr
    );
    let args = [
        category.into(),
        feature.into(),
        JsValue::from_f64(o.post_id),
        JsValue::from_f64(o.limit),
    ];
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let rows: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let mut item = serde_json::Map::new();
            for key in ["id", "category"] {
                if let Some(value) = row.get(key) {
                    item.insert(key.into(), value.clone());
                }
            }
            for key in [
                "title",
                "subtitle",
                "tag",
                "image_url",
                "image_caption",
                "created_at",
                "publish_at",
                "special_feature",
            ] {
                let value = row
                    .get(key)
                    .filter(|value| match value {
                        Value::Null | Value::Bool(false) => false,
                        Value::String(s) => !s.is_empty(),
                        Value::Number(n) => n.as_f64() != Some(0.0),
                        _ => true,
                    })
                    .cloned()
                    .unwrap_or_else(|| json!(""));
                item.insert(key.into(), value);
            }
            Value::Object(item)
        })
        .collect();
    Response::from_json(&json!({"items":rows}))
}

pub async fn views(req: &mut Request, env: &Env) -> Result<Response> {
    let options: ViewOptions = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(options.post_id);
    let results=db.batch(vec![
        db.prepare("INSERT OR IGNORE INTO post_views (post_id, viewer_key, viewed_bucket) VALUES (?, ?, ?)").bind(&[id.clone(),options.viewer_key.into(),options.view_bucket.into()])?,
        db.prepare("UPDATE posts SET views = views + 1 WHERE id = ? AND changes() = 1").bind(&[id])?,
    ]).await?;
    let changed = results[0].meta()?.and_then(|m| m.changes).unwrap_or(0) > 0;
    Response::from_json(&json!({"counted":changed}))
}

pub async fn likes(req: &mut Request, env: &Env) -> Result<Response> {
    let options: LikeOptions = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(options.post_id);
    let (sql, args) = if let Some(key) = &options.viewer_key {
        (
            "SELECT COUNT(*) AS count, COALESCE(MAX(CASE WHEN viewer_key = ? THEN 1 ELSE 0 END), 0) AS liked FROM post_likes WHERE post_id = ?",
            vec![key.into(), id],
        )
    } else {
        (
            "SELECT COUNT(*) AS count, 0 AS liked FROM post_likes WHERE post_id = ?",
            vec![id],
        )
    };
    let row = db.prepare(sql).bind(&args)?.first::<Value>(None).await?;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatsOptions {
    public_date_expr: String,
    today: Option<String>,
    now_ms: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RailWeights {
    recent7: f64,
    days8to14: f64,
    older_than30: f64,
}

#[derive(Deserialize)]
struct RailOptions {
    limit: usize,
    weights: RailWeights,
}

struct RailRow {
    id: i64,
    v7: f64,
    v14: f64,
    v30: f64,
    old: f64,
    published: String,
}

pub async fn home_rails(req: &mut Request, env: &Env) -> Result<Response> {
    let options: RailOptions = req.json().await?;
    let (picks, popular) = rank_home_rails(&options, env).await?;
    Response::from_json(&json!({"pickIds":picks,"popularIds":popular}))
}

async fn rank_home_rails(options: &RailOptions, env: &Env) -> Result<(Vec<i64>, Vec<i64>)> {
    let values = env.d1("DB")?.prepare(
        "SELECT posts.id AS id,
         SUM(CASE WHEN pv.viewed_at >= datetime('now','-7 day') THEN 1 ELSE 0 END) AS v7,
         SUM(CASE WHEN pv.viewed_at >= datetime('now','-14 day') AND pv.viewed_at < datetime('now','-7 day') THEN 1 ELSE 0 END) AS v14,
         SUM(CASE WHEN pv.viewed_at >= datetime('now','-30 day') AND pv.viewed_at < datetime('now','-14 day') THEN 1 ELSE 0 END) AS v30,
         SUM(CASE WHEN pv.viewed_at < datetime('now','-30 day') THEN 1 ELSE 0 END) AS vold,
         COALESCE(posts.publish_at, posts.created_at) AS pub FROM posts LEFT JOIN post_views pv ON pv.post_id = posts.id
         WHERE posts.published = 1 GROUP BY posts.id"
    ).all().await?.results::<Value>()?;
    let rows: Vec<RailRow> = values
        .iter()
        .map(|v| RailRow {
            id: v["id"].as_i64().unwrap_or(0),
            v7: v["v7"].as_f64().unwrap_or(0.0),
            v14: v["v14"].as_f64().unwrap_or(0.0),
            v30: v["v30"].as_f64().unwrap_or(0.0),
            old: v["vold"].as_f64().unwrap_or(0.0),
            published: v["pub"].as_str().unwrap_or("").to_owned(),
        })
        .collect();
    let by_date = |a: &&RailRow, b: &&RailRow| {
        b.published
            .encode_utf16()
            .cmp(a.published.encode_utf16())
            .then_with(|| b.id.cmp(&a.id))
    };
    let mut ranked: Vec<&RailRow> = rows.iter().filter(|r| r.v7 + r.v14 + r.v30 > 0.0).collect();
    ranked.sort_by(|a, b| {
        (b.v7 + b.v14 + b.v30)
            .total_cmp(&(a.v7 + a.v14 + a.v30))
            .then_with(|| by_date(a, b))
    });
    let mut picks: Vec<i64> = ranked.iter().take(options.limit).map(|r| r.id).collect();
    if picks.len() < options.limit {
        let mut by_latest: Vec<&RailRow> = rows.iter().collect();
        by_latest.sort_by(by_date);
        for row in by_latest {
            if picks.len() >= options.limit {
                break;
            }
            if !picks.contains(&row.id) {
                picks.push(row.id);
            }
        }
    }
    let score = |r: &RailRow| {
        r.v7 * options.weights.recent7
            + r.v14 * options.weights.days8to14
            + r.old * options.weights.older_than30
    };
    let mut other: Vec<&RailRow> = rows.iter().filter(|r| !picks.contains(&r.id)).collect();
    other.sort_by(|a, b| score(b).total_cmp(&score(a)).then_with(|| by_date(a, b)));
    let popular: Vec<i64> = other.iter().take(options.limit).map(|r| r.id).collect();
    Ok((picks, popular))
}

#[derive(Deserialize)]
struct RailCardsOptions {
    #[serde(flatten)]
    rank: RailOptions,
    columns: String,
    origin: String,
    #[serde(default)]
    card: bool,
}

pub async fn home_rails_cards(req: &mut Request, env: &Env) -> Result<Response> {
    let options: RailCardsOptions = req.json().await?;
    let (picks, popular) = rank_home_rails(&options.rank, env).await?;
    let ids: Vec<i64> = picks.iter().chain(popular.iter()).copied().collect();
    let mut by_id = std::collections::HashMap::new();
    if !ids.is_empty() {
        let sql = format!(
            "SELECT {} FROM posts WHERE id IN ({})",
            options.columns,
            vec!["?"; ids.len()].join(", ")
        );
        let args: Vec<JsValue> = ids.iter().map(|id| JsValue::from_f64(*id as f64)).collect();
        for row in env
            .d1("DB")?
            .prepare(sql)
            .bind(&args)?
            .all()
            .await?
            .results::<Value>()?
        {
            if let Some(id) = row.get("id").and_then(Value::as_i64) {
                let row = if options.card { home_card(row) } else { row };
                by_id.insert(id, post_image(row, &options.origin));
            }
        }
    }
    let cards = |ids: &[i64]| {
        ids.iter()
            .filter_map(|id| by_id.get(id).cloned())
            .collect::<Vec<_>>()
    };
    card_response(&json!({"picks":cards(&picks),"popular":cards(&popular)}))
}

pub async fn stats(req: &mut Request, env: &Env) -> Result<Response> {
    let options: StatsOptions = req.json().await?;
    let today = options
        .now_ms
        .map(|now| {
            let iso = String::from(
                js_sys::Date::new(&JsValue::from_f64(now + 9.0 * 60.0 * 60.0 * 1000.0))
                    .to_iso_string(),
            );
            iso[..10].to_owned()
        })
        .or(options.today);
    let date = if today.is_some() {
        "date(?)"
    } else {
        "date('now', '+9 hours')"
    };
    let args: Vec<JsValue> = today.as_ref().map(|v| vec![v.into()]).unwrap_or_default();
    let sql = format!(
        "SELECT
        COUNT(CASE WHEN category = 'korea' AND published = 1 THEN 1 END) AS korea,
        COUNT(CASE WHEN category = 'apr' AND published = 1 THEN 1 END) AS apr,
        COUNT(CASE WHEN category = 'wosm' AND published = 1 THEN 1 END) AS wosm,
        COUNT(CASE WHEN category = 'people' AND published = 1 THEN 1 END) AS people,
        COUNT(CASE WHEN published = 1 AND date({}) = {date} THEN 1 END) AS today FROM posts",
        options.public_date_expr
    );
    let row = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    Response::from_json(
        &row.unwrap_or_else(|| json!({"korea":0,"apr":0,"wosm":0,"people":0,"today":0})),
    )
}

#[derive(Deserialize)]
struct PublicPostInput {
    post: Value,
    origin: String,
}

pub async fn public_post(req: &mut Request) -> Result<Response> {
    let input: PublicPostInput = req.json().await?;
    let mut post = input.post;
    let author = post
        .get("author")
        .filter(|value| match value {
            Value::Null | Value::Bool(false) => false,
            Value::String(s) => !s.is_empty(),
            Value::Number(n) => n.as_f64() != Some(0.0),
            _ => true,
        })
        .map(js_string)
        .unwrap_or_default();
    post["author"] = json!(export_author(&author));
    let post = post_image(post, &input.origin);
    let mut result = serde_json::Map::new();
    for key in [
        "id",
        "category",
        "title",
        "subtitle",
        "content",
        "image_url",
        "image_caption",
        "image_frame",
        "image_is_placeholder",
        "image_has_real_asset",
        "gallery_images",
        "youtube_url",
        "location_name",
        "location_address",
        "tag",
        "author",
        "ai_assisted",
        "created_at",
        "publish_at",
        "updated_at",
        "views",
        "likes",
        "liked",
        "special_feature",
        "meta_tags",
        "related_posts",
        "manual_related_posts",
        "manual_related_post_ids",
        "related_posts_json",
        "special_feature_posts",
    ] {
        if let Some(value) = post.get(key) {
            result.insert(key.into(), value.clone());
        }
    }
    Response::from_json(&json!({"post":result}))
}

pub async fn detail(req: &mut Request, env: &Env) -> Result<Response> {
    let options: DetailOptions = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT * FROM posts WHERE id = ?")
        .bind(&[JsValue::from_f64(options.id)])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"post":row}))
}

async fn home_post_rows(o: &HomeOptions, env: &Env) -> Result<Vec<Value>> {
    let mut conditions = vec!["published = 1"];
    let mut args = Vec::<JsValue>::new();
    if let Some(category) = &o.category {
        conditions.push("category = ?");
        args.push(category.into());
    }
    if o.featured {
        conditions.push("featured = 1");
    }
    args.push(JsValue::from_f64(o.limit.into()));
    let sql = format!(
        "SELECT {} FROM posts WHERE {} ORDER BY {} DESC, id DESC LIMIT ?",
        o.columns,
        conditions.join(" AND "),
        o.public_date_expr
    );
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let rows: Vec<Value> = if o.card {
        rows.into_iter().map(home_card).collect()
    } else {
        rows
    };
    let rows = match &o.origin {
        Some(origin) => rows
            .into_iter()
            .map(|row| post_image(row, origin))
            .collect(),
        None => rows,
    };
    Ok(rows)
}

pub async fn home_posts(req: &mut Request, env: &Env) -> Result<Response> {
    let o: HomeOptions = req.json().await?;
    let rows = home_post_rows(&o, env).await?;
    let data = json!({"posts":rows});
    if o.card {
        card_response(&data)
    } else {
        Response::from_json(&data)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HomeSectionsOptions {
    columns: String,
    public_date_expr: String,
    origin: String,
}

pub async fn home_sections(req: &mut Request, env: &Env) -> Result<Response> {
    let input: HomeSectionsOptions = req.json().await?;
    let options = |category: Option<&str>| HomeOptions {
        category: category.map(str::to_owned),
        featured: false,
        limit: 4,
        columns: input.columns.clone(),
        public_date_expr: input.public_date_expr.clone(),
        card: true,
        origin: Some(input.origin.clone()),
    };
    let opts = [
        options(None),
        options(Some("korea")),
        options(Some("apr")),
        options(Some("wosm")),
        options(Some("people")),
    ];
    let (latest, korea, apr, wosm, people) = futures_util::join!(
        home_post_rows(&opts[0], env),
        home_post_rows(&opts[1], env),
        home_post_rows(&opts[2], env),
        home_post_rows(&opts[3], env),
        home_post_rows(&opts[4], env)
    );
    let mut data = serde_json::Map::new();
    for (key, result) in [
        ("latest", latest),
        ("korea", korea),
        ("apr", apr),
        ("wosm", wosm),
        ("people", people),
    ] {
        data.insert(
            key.into(),
            match result {
                Ok(rows) => json!(rows),
                Err(_) => Value::Null,
            },
        );
    }
    card_response(&Value::Object(data))
}

#[derive(Deserialize)]
struct CreateOptions {
    bindings: Vec<Value>,
    #[serde(rename = "publishGuard", default)]
    publish_guard: bool,
    #[serde(rename = "memberGuardUid", default)]
    member_guard_uid: Option<f64>,
    #[serde(rename = "tokenGuard", default)]
    token_guard: Option<TokenGuard>,
}

#[derive(Deserialize)]
struct TokenGuard {
    uid: Option<f64>,
    iat: f64,
    #[serde(default)]
    exp: Option<f64>,
}

async fn post_snapshot_expression(db: &D1Database) -> Result<String> {
    let columns = db
        .prepare("PRAGMA table_info(posts)")
        .all()
        .await?
        .results::<Value>()?;
    let mut pairs = Vec::new();
    for column in &columns {
        let name = column
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| Error::RustError("Invalid post column".into()))?;
        pairs.push(format!(
            "'{}', p.\"{}\"",
            name.replace('\u{27}', "''"),
            name.replace('"', "\"\"")
        ));
    }
    if pairs.is_empty() || pairs.len() > 63 {
        return Err(Error::RustError("Unsupported post schema".into()));
    }
    Ok(format!("json_object({})", pairs.join(", ")))
}

fn member_permission_query(allow_list: bool) -> String {
    let allowed = if allow_list {
        "'write:write','write:list'"
    } else {
        "'write:write'"
    };
    format!(
        "SELECT EXISTS(SELECT 1 FROM admin_users u WHERE u.id=? AND u.status='active' AND u.deleted_at IS NULL AND CASE WHEN json_valid(u.permissions) THEN CASE WHEN (CASE json_type(u.permissions,'$.access_admin') WHEN 'true' THEN 1 WHEN 'integer' THEN json_extract(u.permissions,'$.access_admin') != 0 WHEN 'real' THEN json_extract(u.permissions,'$.access_admin') != 0 WHEN 'text' THEN length(json_extract(u.permissions,'$.access_admin')) > 0 WHEN 'array' THEN 1 WHEN 'object' THEN 1 ELSE 0 END) AND json_type(u.permissions,'$.permissions')='array' THEN EXISTS(SELECT 1 FROM json_each(u.permissions,'$.permissions') WHERE type='text' AND value IN ({allowed})) ELSE 0 END ELSE 0 END)"
    )
}

fn member_guard(db: &D1Database, uid: f64, allow_list: bool) -> Result<D1PreparedStatement> {
    if !uid.is_finite() || uid <= 0.0 {
        return Err(Error::RustError("Invalid member guard".into()));
    }
    let query = member_permission_query(allow_list);
    db.prepare(format!(
        "SELECT CASE WHEN ({query})=0 THEN json('member access revoked') ELSE NULL END"
    ))
    .bind(&[JsValue::from_f64(uid)])
}

async fn member_allowed(db: &D1Database, uid: f64, allow_list: bool) -> Result<bool> {
    let query = member_permission_query(allow_list);
    let row = db
        .prepare(format!("SELECT ({query}) AS allowed"))
        .bind(&[JsValue::from_f64(uid)])?
        .first::<Value>(None)
        .await?;
    Ok(row
        .and_then(|row| row.get("allowed").and_then(Value::as_i64))
        .unwrap_or(0)
        == 1)
}

const TOKEN_VALID_SQL: &str = "SELECT ((? IS NULL OR ? >= (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))) AND (COALESCE(CAST((SELECT value FROM settings WHERE key='admin_token_min_iat') AS INTEGER),0) = 0 OR COALESCE(CAST((SELECT value FROM settings WHERE key='admin_token_min_iat') AS INTEGER),0) <= ?) AND (? IS NULL OR EXISTS (SELECT 1 FROM admin_users u WHERE u.id=? AND u.status='active' AND u.deleted_at IS NULL AND (COALESCE(CAST(u.token_min_iat AS REAL),0)<=0 OR COALESCE(CAST(u.token_min_iat AS REAL),0)<=?))))";

fn token_guard_args(guard: &TokenGuard) -> Result<Vec<JsValue>> {
    if !guard.iat.is_finite()
        || guard.exp.is_some_and(|exp| !exp.is_finite())
        || guard.uid.is_some_and(|uid| !uid.is_finite() || uid <= 0.0)
    {
        return Err(Error::RustError("Invalid token guard".into()));
    }
    let uid = guard.uid.map(JsValue::from_f64).unwrap_or(JsValue::NULL);
    let exp = guard.exp.map(JsValue::from_f64).unwrap_or(JsValue::NULL);
    Ok(vec![
        exp.clone(),
        exp,
        JsValue::from_f64(guard.iat),
        uid.clone(),
        uid,
        JsValue::from_f64(guard.iat),
    ])
}

fn token_guard(db: &D1Database, guard: &TokenGuard) -> Result<D1PreparedStatement> {
    db.prepare(format!(
        "SELECT CASE WHEN ({TOKEN_VALID_SQL})=0 THEN json('token revoked') ELSE NULL END"
    ))
    .bind(&token_guard_args(guard)?)
}

async fn token_valid(db: &D1Database, guard: &TokenGuard) -> Result<bool> {
    let row = db
        .prepare(format!("SELECT ({TOKEN_VALID_SQL}) AS valid"))
        .bind(&token_guard_args(guard)?)?
        .first::<Value>(None)
        .await?;
    Ok(row
        .and_then(|row| row.get("valid").and_then(Value::as_i64))
        .unwrap_or(0)
        == 1)
}

fn publish_switch_guard(db: &D1Database) -> D1PreparedStatement {
    db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'publish_kill_switch' AND lower(CAST(value AS TEXT)) = 'on') THEN json('publish blocked') ELSE NULL END")
}

async fn publish_switch_on(db: &D1Database) -> Result<bool> {
    let row = db
        .prepare("SELECT value FROM settings WHERE key = 'publish_kill_switch'")
        .first::<Value>(None)
        .await?;
    Ok(row
        .and_then(|row| row.get("value").cloned())
        .map(|value| js_string(&value).to_lowercase() == "on")
        .unwrap_or(false))
}

pub async fn create(req: &mut Request, env: &Env) -> Result<Response> {
    let options: CreateOptions = req.json().await?;
    if options.bindings.len() != 21 {
        return Err(Error::RustError("Invalid post bindings".into()));
    }
    let args = post_bindings_utf16(&options.bindings)?;
    let db = env.d1("DB")?;
    let snapshot = post_snapshot_expression(&db).await?;
    let insert=db.prepare("INSERT INTO posts (category, title, subtitle, content, image_url, image_caption, image_frame, gallery_images, youtube_url, location_name, location_address, tag, special_feature, meta_tags, manual_related_posts, author, author_user_id, ai_assisted, published, featured, created_at, publish_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))").bind(&args)?;
    let history=db.prepare(format!("INSERT INTO post_history (post_id, action, summary, snapshot, before_snapshot, after_snapshot) SELECT p.id, 'create', '게시글 생성', {snapshot}, NULL, {snapshot} FROM posts p WHERE p.id = last_insert_rowid()"));
    let guard = db.prepare("SELECT CASE WHEN changes() != 1 THEN json('invalid') ELSE NULL END");
    let needs_featured = options.bindings[19].as_i64() == Some(1);
    let mut statements = Vec::new();
    if let Some(guard) = &options.token_guard {
        statements.push(token_guard(&db, guard)?);
    }
    if let Some(uid) = options.member_guard_uid {
        statements.push(member_guard(&db, uid, false)?);
    }
    if options.publish_guard {
        statements.push(publish_switch_guard(&db));
    }
    // Integer overflow is a distinct D1 batch abort for the featured limit.
    if needs_featured {
        statements.push(db.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM posts WHERE featured = 1 AND published = 1) >= 4 THEN abs(-9223372036854775808) ELSE 0 END"));
    }
    statements.extend([insert, history, guard]);
    let results = match db.batch(statements).await {
        Ok(results) => results,
        Err(error)
            if options.token_guard.is_some()
                && error.to_string().to_lowercase().contains("malformed json")
                && !token_valid(&db, options.token_guard.as_ref().unwrap())
                    .await
                    .unwrap_or(true) =>
        {
            return Response::from_json(&json!({"sessionRevoked":true}));
        }
        Err(error)
            if options.member_guard_uid.is_some()
                && error.to_string().to_lowercase().contains("malformed json")
                && !member_allowed(&db, options.member_guard_uid.unwrap_or(0.0), false)
                    .await
                    .unwrap_or(true) =>
        {
            return Response::from_json(&json!({"accessRevoked":true}));
        }
        Err(error)
            if options.publish_guard
                && error.to_string().to_lowercase().contains("malformed json")
                && publish_switch_on(&db).await.unwrap_or(false) =>
        {
            return Response::from_json(&json!({"publishBlocked":true}));
        }
        Err(error) if needs_featured && error.to_string().contains("integer overflow") => {
            return Response::from_json(&json!({"featuredLimit":true}));
        }
        Err(error) => return Err(error),
    };
    let index = usize::from(options.token_guard.is_some())
        + usize::from(options.member_guard_uid.is_some())
        + usize::from(options.publish_guard)
        + usize::from(needs_featured);
    let id = results[index]
        .meta()?
        .and_then(|m| m.last_row_id)
        .unwrap_or(0);
    let history_written = results[index + 1]
        .meta()?
        .and_then(|m| m.changes)
        .unwrap_or(0);
    if id == 0 || history_written != 1 {
        return Err(Error::RustError("Post history missing".into()));
    }
    Response::from_json(&json!({"id":id}))
}

#[derive(Deserialize)]
struct DeleteOptions {
    id: f64,
}

pub async fn delete(req: &mut Request, env: &Env) -> Result<Response> {
    let options: DeleteOptions = req.json().await?;
    let db = env.d1("DB")?;
    let id = JsValue::from_f64(options.id);
    let mut statements = Vec::new();
    for (table, column, sql) in [
        (
            "post_views",
            "post_id",
            "DELETE FROM post_views WHERE post_id = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)",
        ),
        (
            "post_likes",
            "post_id",
            "DELETE FROM post_likes WHERE post_id = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)",
        ),
        (
            "post_history",
            "post_id",
            "DELETE FROM post_history WHERE post_id = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)",
        ),
        (
            "post_engagement",
            "post_id",
            "DELETE FROM post_engagement WHERE post_id = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)",
        ),
        (
            "site_visits",
            "path",
            "DELETE FROM site_visits WHERE path = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)",
        ),
        (
            "calendar_events",
            "related_post_id",
            "UPDATE calendar_events SET related_post_id = NULL WHERE related_post_id = ? AND EXISTS (SELECT 1 FROM posts WHERE id = ?)",
        ),
    ] {
        let columns = db
            .prepare(format!("PRAGMA table_info({table})"))
            .all()
            .await?
            .results::<Value>()?;
        if columns
            .iter()
            .any(|item| item.get("name").and_then(Value::as_str) == Some(column))
        {
            let key = if table == "site_visits" {
                JsValue::from_str(&format!("/post/{}", options.id as i64))
            } else {
                id.clone()
            };
            statements.push(db.prepare(sql).bind(&[key, id.clone()])?);
        }
    }
    statements.push(db.prepare("DELETE FROM posts WHERE id = ?").bind(&[id])?);
    let results = db.batch(statements).await?;
    let changes = results
        .last()
        .and_then(|result| result.meta().ok().flatten())
        .and_then(|meta| meta.changes)
        .unwrap_or(0);
    Response::from_json(&json!({"changes":changes}))
}

fn post_bindings_utf16(values: &[Value]) -> Result<Vec<JsValue>> {
    values
        .iter()
        .map(|value| {
            if let Some(units) = value
                .as_object()
                .filter(|object| object.len() == 1)
                .and_then(|object| object.get("__post_utf16"))
                .and_then(Value::as_array)
            {
                let units: Vec<u16> = units
                    .iter()
                    .map(|v| {
                        v.as_u64()
                            .filter(|n| *n <= 65535)
                            .map(|n| n as u16)
                            .ok_or_else(|| Error::RustError("Invalid post UTF-16 binding".into()))
                    })
                    .collect::<Result<_>>()?;
                Ok(js_sys::JsString::from_char_code(&units).into())
            } else {
                Ok(post_bindings(std::slice::from_ref(value))?.remove(0))
            }
        })
        .collect()
}

pub(super) fn post_bindings(values: &[Value]) -> Result<Vec<JsValue>> {
    values
        .iter()
        .map(|v| match v {
            Value::Null => Ok(JsValue::NULL),
            Value::String(s) => Ok(JsValue::from_str(s)),
            Value::Number(n) => n
                .as_f64()
                .map(JsValue::from_f64)
                .ok_or_else(|| Error::RustError("Invalid number".into())),
            _ => Err(Error::RustError("Invalid post binding".into())),
        })
        .collect()
}

#[derive(Deserialize)]
struct UpdateOptions {
    id: f64,
    fields: Vec<String>,
    values: Vec<Value>,
    action: String,
    summary: String,
    #[serde(rename = "expectedUpdatedAt")]
    expected_updated_at: Option<String>,
    claim: String,
    #[serde(rename = "featuredGuard", default)]
    featured_guard: bool,
    #[serde(rename = "publishGuard", default)]
    publish_guard: bool,
    #[serde(rename = "ownerGuardUid", default)]
    owner_guard_uid: Option<f64>,
    #[serde(rename = "memberGuardUid", default)]
    member_guard_uid: Option<f64>,
    #[serde(rename = "tokenGuard", default)]
    token_guard: Option<TokenGuard>,
}

pub async fn update(req: &mut Request, env: &Env) -> Result<Response> {
    let o: UpdateOptions = req.json().await?;
    const ALLOWED: &[&str] = &[
        "category = ?",
        "title = ?",
        "subtitle = ?",
        "content = ?",
        "image_url = ?",
        "gallery_images = ?",
        "image_caption = ?",
        "image_frame = ?",
        "youtube_url = ?",
        "location_name = ?",
        "location_address = ?",
        "meta_tags = ?",
        "tag = ?",
        "special_feature = ?",
        "author_user_id = ?",
        "author = ?",
        "ai_assisted = ?",
        "sort_order = ?",
        "manual_related_posts = ?",
        "publish_at = ?",
        "published = ?",
        "featured = ?",
        "updated_at = datetime('now')",
    ];
    if o.fields.is_empty()
        || o.fields.iter().any(|f| !ALLOWED.contains(&f.as_str()))
        || o.fields.iter().filter(|f| f.ends_with(" = ?")).count() != o.values.len()
    {
        return Err(Error::RustError("Invalid post update fields".into()));
    }
    if !matches!(o.action.as_str(), "update" | "status") {
        return Err(Error::RustError("Invalid post history action".into()));
    }
    if !o.claim.starts_with("post-history:") || o.claim.len() > 80 {
        return Err(Error::RustError("Invalid history claim".into()));
    }
    let db = env.d1("DB")?;
    let snapshot = post_snapshot_expression(&db).await?;
    let id = JsValue::from_f64(o.id);
    let expected = o
        .expected_updated_at
        .as_deref()
        .map(JsValue::from_str)
        .unwrap_or(JsValue::NULL);
    let claim = JsValue::from_str(&o.claim);
    let mut args = post_bindings_utf16(&o.values)?;
    args.extend([id.clone(), expected.clone(), expected.clone()]);
    let fields=o.fields.iter().map(|field| if field=="updated_at = datetime('now')" { "updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f',updated_at,'+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f','now') END" } else {field.as_str()}).collect::<Vec<_>>().join(", ");
    let before=db.prepare(format!("INSERT INTO post_history (post_id, action, summary, snapshot, before_snapshot, after_snapshot) SELECT p.id, ?, ?, {snapshot}, {snapshot}, ? FROM posts p WHERE p.id = ? AND (? IS NULL OR TRIM(COALESCE(p.updated_at,'')) = ?)")).bind(&[o.action.into(),o.summary.into(),claim.clone(),id.clone(),expected.clone(),expected.clone()])?;
    let guard=db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM posts WHERE id=? AND (? IS NULL OR TRIM(COALESCE(updated_at,''))=?)) AND changes()!=1 THEN json('invalid') ELSE NULL END").bind(&[id.clone(),expected.clone(),expected.clone()])?;
    let update=db.prepare(format!("UPDATE posts SET {fields} WHERE id = ? AND (? IS NULL OR TRIM(COALESCE(updated_at,'')) = ?)")).bind(&args)?;
    let after=db.prepare(format!("UPDATE post_history SET snapshot = (SELECT {snapshot} FROM posts p WHERE p.id=?), after_snapshot = (SELECT {snapshot} FROM posts p WHERE p.id=?) WHERE post_id=? AND after_snapshot=? AND changes()=1")).bind(&[id.clone(),id.clone(),id.clone(),claim.clone()])?;
    let final_guard=db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM post_history WHERE post_id=? AND after_snapshot=?) THEN json('invalid') ELSE NULL END").bind(&[id.clone(),claim])?;
    let mut statements = Vec::new();
    if let Some(guard) = &o.token_guard {
        statements.push(token_guard(&db, guard)?);
    }
    if let Some(uid) = o.member_guard_uid {
        statements.push(member_guard(&db, uid, true)?);
    }
    if let Some(uid) = o.owner_guard_uid {
        if !uid.is_finite() || uid <= 0.0 {
            return Err(Error::RustError("Invalid owner guard".into()));
        }
        statements.push(db.prepare("SELECT CASE WHEN EXISTS (SELECT 1 FROM posts WHERE id=? AND author_user_id IS NOT ?) THEN json('ownership changed') ELSE NULL END").bind(&[id.clone(),JsValue::from_f64(uid)])?);
    }
    if o.publish_guard {
        statements.push(publish_switch_guard(&db));
    }
    if o.featured_guard {
        statements.push(db.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM posts WHERE id = ? AND featured = 1 AND published = 1) AND (SELECT COUNT(*) FROM posts WHERE featured = 1 AND published = 1) >= 4 THEN abs(-9223372036854775808) ELSE 0 END").bind(std::slice::from_ref(&id))?);
    }
    statements.extend([before, guard, update, after, final_guard]);
    let results = match db.batch(statements).await {
        Ok(results) => results,
        Err(error)
            if o.token_guard.is_some()
                && error.to_string().to_lowercase().contains("malformed json")
                && !token_valid(&db, o.token_guard.as_ref().unwrap())
                    .await
                    .unwrap_or(true) =>
        {
            return Response::from_json(&json!({"sessionRevoked":true}));
        }
        Err(error)
            if o.member_guard_uid.is_some()
                && error.to_string().to_lowercase().contains("malformed json")
                && !member_allowed(&db, o.member_guard_uid.unwrap_or(0.0), true)
                    .await
                    .unwrap_or(true) =>
        {
            return Response::from_json(&json!({"accessRevoked":true}));
        }
        Err(error)
            if o.owner_guard_uid.is_some()
                && error.to_string().to_lowercase().contains("malformed json")
                && {
                    let owner = db
                        .prepare("SELECT author_user_id FROM posts WHERE id = ?")
                        .bind(std::slice::from_ref(&id))?
                        .first::<Value>(None)
                        .await?;
                    owner
                        .map(|row| {
                            row.get("author_user_id").and_then(Value::as_f64) != o.owner_guard_uid
                        })
                        .unwrap_or(false)
                } =>
        {
            return Response::from_json(&json!({"ownershipChanged":true}));
        }
        Err(error)
            if o.publish_guard
                && error.to_string().to_lowercase().contains("malformed json")
                && publish_switch_on(&db).await.unwrap_or(false) =>
        {
            return Response::from_json(&json!({"publishBlocked":true}));
        }
        Err(error) if o.featured_guard && error.to_string().contains("integer overflow") => {
            return Response::from_json(&json!({"featuredLimit":true}));
        }
        Err(error) => return Err(error),
    };
    let changes = results[usize::from(o.token_guard.is_some())
        + usize::from(o.member_guard_uid.is_some())
        + usize::from(o.owner_guard_uid.is_some())
        + usize::from(o.publish_guard)
        + usize::from(o.featured_guard)
        + 2]
    .meta()?
    .and_then(|m| m.changes)
    .unwrap_or(0);
    if changes == 0 && o.expected_updated_at.is_some() {
        let current = db
            .prepare("SELECT updated_at FROM posts WHERE id=?")
            .bind(&[id])?
            .first::<Value>(None)
            .await?;
        if let Some(row) = current {
            return Response::from_json(
                &json!({"changes":0,"conflict":true,"serverUpdatedAt":row.get("updated_at").and_then(Value::as_str).unwrap_or("").trim()}),
            );
        }
    }
    Response::from_json(&json!({"changes":changes}))
}

async fn visit_counts(env: &Env) -> Result<Value> {
    let row = env.d1("DB")?.prepare(
        "SELECT COUNT(DISTINCT CASE WHEN datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours')) THEN viewer_key END) AS today_unique,
         COUNT(CASE WHEN datetime(visited_at, '+9 hours') >= datetime(date('now', '+9 hours')) THEN 1 END) AS today_views,
         COUNT(DISTINCT viewer_key) AS total_unique, COUNT(*) AS total_views FROM site_visits
         WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html')"
    ).first::<Value>(None).await?;
    Ok(row.unwrap_or_else(
        || json!({"today_unique":0,"today_views":0,"total_unique":0,"total_views":0}),
    ))
}

pub async fn visit_analytics(env: &Env) -> Result<Response> {
    Response::from_json(&visit_counts(env).await?)
}

pub async fn visit_analytics_response(env: &Env) -> Result<Response> {
    let row = visit_counts(env).await?;
    let count = |key| row.get(key).and_then(Value::as_i64).unwrap_or(0);
    let today_unique = count("today_unique");
    let today_views = count("today_views");
    let total_unique = count("total_unique");
    let total_views = count("total_views");
    let kst = js_sys::Date::new(&JsValue::from_f64(
        js_sys::Date::now() + 9.0 * 60.0 * 60.0 * 1000.0,
    ));
    let date = String::from(kst.to_iso_string());
    Response::from_json(
        &json!({"provider":"site_visits","provider_label":"공개 페이지 전체 방문 집계","today_unique":today_unique,"today_views":today_views,"total_unique":total_unique,"today_visits":today_unique,"total_visits":total_unique,"total_pageviews":total_views,"measured_basis":"site_visits","measured_timezone":"Asia/Seoul","measured_date":&date[..10]}),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportOptions {
    days: Option<String>,
    limit: Option<String>,
    category: Option<String>,
    public_date_expr: String,
    origin: String,
}

fn export_iso(value: &str, utc: bool) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let date = value.replacen(' ', "T", 1);
    let zoned = if js_sys::RegExp::new(r"Z$|[+-]\d{2}:\d{2}$", "").test(&date) {
        date
    } else {
        format!("{date}{}", if utc { "Z" } else { "+09:00" })
    };
    let parsed = js_sys::Date::new(&JsValue::from_str(&zoned));
    if parsed.get_time().is_nan() {
        None
    } else {
        Some(String::from(parsed.to_iso_string()))
    }
}

pub(crate) fn export_author(value: &str) -> String {
    let name = super::trim(value);
    if name.is_empty()
        || js_sys::RegExp::new(r"^(?:불러오는 중[.…]*|loading[.…]*)$", "i").test(name)
    {
        return "BP미디어".into();
    }
    if js_sys::RegExp::new(r"^Editor[ .]+([A-Z])$", "i").test(name) {
        return format!(
            "Editor.{}",
            name.chars().last().unwrap_or_default().to_ascii_uppercase()
        );
    }
    name.to_owned()
}

pub async fn article_export(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ExportOptions = req.json().await?;
    let clamp = |raw: Option<&str>, min: f64, max: f64, fallback: u32| {
        let number = raw
            .map(|value| js_sys::parse_int(value, 10))
            .unwrap_or(f64::NAN);
        if number.is_finite() {
            number.clamp(min, max) as u32
        } else {
            fallback
        }
    };
    let days = clamp(o.days.as_deref(), 1.0, 365.0, 90);
    let limit = clamp(o.limit.as_deref(), 1.0, 2000.0, 500);
    let category = o
        .category
        .as_deref()
        .map(super::trim)
        .map(|v| String::from(js_sys::JsString::from(v).to_lower_case()))
        .filter(|v| matches!(v.as_str(), "korea" | "apr" | "wosm" | "people"));
    let filter = if category.is_some() {
        "AND category = ?"
    } else {
        ""
    };
    let sql = format!(
        "SELECT id, category, title, subtitle, author, meta_tags, tag, image_url, location_name, location_address, ai_assisted, publish_at, created_at, updated_at, views FROM posts WHERE published = 1 AND {date} <= datetime('now', '+9 hours') AND {date} >= datetime('now', '+9 hours', ?) {filter} ORDER BY {date} DESC, id DESC LIMIT ?",
        date = o.public_date_expr
    );
    let mut args = vec![JsValue::from_str(&format!("-{} days", days))];
    if let Some(category) = &category {
        args.push(JsValue::from_str(category));
    }
    args.push(JsValue::from_f64(limit.into()));
    let items = env
        .d1("DB")?
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let mut lines = vec![json!({"@type":"export_meta", "publisher":"BP미디어", "publisher_url":o.origin, "license":format!("{}/editorial-policy",o.origin), "generated_at":String::from(js_sys::Date::new_0().to_iso_string()), "window_days":days, "category":category.as_deref().unwrap_or("all"), "row_count":items.len(), "row_cap":limit, "schema_hint":"Each subsequent line is a JSON object representing one NewsArticle summary. Full article bodies are not included — fetch GET {url} for HTML or include the URL in your citation."}).to_string()];
    for row in items {
        let text = |key: &str| {
            row.get(key)
                .filter(|value| match value {
                    Value::Null | Value::Bool(false) => false,
                    Value::String(s) => !s.is_empty(),
                    Value::Number(n) => n.as_f64() != Some(0.0),
                    _ => true,
                })
                .map(js_string)
                .unwrap_or_default()
        };
        let id = row.get("id").cloned().unwrap_or(Value::Null);
        let id_text = js_string(&id);
        let publish = text("publish_at");
        let created = text("created_at");
        let updated = text("updated_at");
        let pub_iso = if publish.is_empty() {
            export_iso(&created, true)
        } else {
            export_iso(&publish, false)
        };
        let mod_raw = export_iso(
            if updated.is_empty() {
                &created
            } else {
                &updated
            },
            true,
        );
        let mod_iso = match (&mod_raw, &pub_iso) {
            (Some(m), Some(p)) if m < p => pub_iso.clone(),
            (Some(_), _) => mod_raw,
            _ => pub_iso.clone(),
        };
        let csv = |key| {
            text(key)
                .split([',', '|'])
                .map(super::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        };
        let image = text("image_url");
        let image = if image.is_empty() {
            None
        } else if js_sys::RegExp::new(r"^https?://", "i").test(&image) {
            Some(image)
        } else {
            Some(format!("{}/api/posts/{id_text}/image", o.origin))
        };
        let location = |key| {
            let value = text(key);
            if value.is_empty() { None } else { Some(value) }
        };
        let ai = row.get("ai_assisted").is_some_and(|v| match v {
            Value::Null | Value::Bool(false) => false,
            Value::String(s) => !s.is_empty(),
            Value::Number(n) => n.as_f64() != Some(0.0),
            _ => true,
        });
        #[allow(deprecated)]
        let views = js_sys::Number::new(&JsValue::from_str(&text("views"))).value_of();
        lines.push(json!({"id":id,"url":format!("{}/post/{id_text}",o.origin),"category":row.get("category"),"title":text("title"),"subtitle":text("subtitle"),"author_code":export_author(&text("author")),"ai_assisted":ai,"keywords":csv("meta_tags"),"tags":csv("tag"),"location_name":location("location_name"),"location_address":location("location_address"),"image_url":image,"published_at":pub_iso,"modified_at":mod_iso,"views":views,"language":"ko-KR"}).to_string());
    }
    Response::ok(lines.join("\n") + "\n")
}

pub async fn publish_due(env: &Env) -> Result<Response> {
    let db = env.d1("DB")?;
    let date_expr = "COALESCE(datetime(replace(publish_at, 'T', ' ')), datetime(publish_at))";
    let sql = format!(
        "SELECT id, category FROM posts WHERE published = 0 AND publish_at IS NOT NULL AND {date_expr} IS NOT NULL AND {date_expr} <= datetime('now', '+9 hours') ORDER BY {date_expr} ASC, id ASC LIMIT 50"
    );
    let rows = db.prepare(sql).all().await?.results::<Value>()?;
    let ids: Vec<f64> = rows
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_f64))
        .filter(|id| *id > 0.0)
        .collect();
    if ids.is_empty() {
        return Response::from_json(&json!({"published":[]}));
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let update = format!(
        "UPDATE posts SET published = 1, updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f',updated_at,'+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f','now') END WHERE id IN ({placeholders}) AND published = 0 AND publish_at IS NOT NULL AND {date_expr} IS NOT NULL AND {date_expr} <= datetime('now', '+9 hours') RETURNING id, category"
    );
    let args: Vec<JsValue> = ids.iter().map(|id| JsValue::from_f64(*id)).collect();
    let updated = db
        .prepare(update)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let published = rows
        .into_iter()
        .filter(|row| updated.iter().any(|u| u.get("id") == row.get("id")))
        .collect::<Vec<_>>();
    Response::from_json(&json!({"published":published}))
}

#[derive(Deserialize)]
struct Reorder {
    ids: Vec<f64>,
}

pub async fn reorder(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Reorder = req.json().await?;
    let db = env.d1("DB")?;
    let mut statements = Vec::new();
    for (index, id) in o.ids.iter().enumerate() {
        statements.push(
            db.prepare("UPDATE posts SET sort_order = ?, updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f',updated_at,'+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f','now') END WHERE id = ? AND sort_order IS NOT ?")
                .bind(&[JsValue::from_f64(index as f64), JsValue::from_f64(*id), JsValue::from_f64(index as f64)])?,
        );
    }
    db.batch(statements).await?;
    Response::from_json(&json!({"ok":true}))
}

pub async fn reorder_reset(env: &Env) -> Result<Response> {
    env.d1("DB")?
        .prepare("UPDATE posts SET sort_order = NULL, updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f',updated_at,'+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f','now') END WHERE sort_order IS NOT NULL")
        .run()
        .await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct PostId {
    id: f64,
}

pub async fn history(req: &mut Request, env: &Env) -> Result<Response> {
    let o: PostId = req.json().await?;
    let db = env.d1("DB")?;
    let args = [JsValue::from_f64(o.id)];
    let post = db
        .prepare("SELECT id, title, created_at, publish_at, updated_at FROM posts WHERE id = ?")
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    if post.is_none() {
        return Response::from_json(&json!({"post":null,"items":[]}));
    }
    let items=db.prepare("SELECT id, action, summary, snapshot, before_snapshot, after_snapshot, created_at FROM post_history WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 50").bind(&args)?.all().await?.results::<Value>()?;
    Response::from_json(&json!({"post":post,"items":items}))
}

pub async fn cover(req: &mut Request, env: &Env) -> Result<Response> {
    let o: PostId = req.json().await?;
    let post = env
        .d1("DB")?
        .prepare("SELECT image_url FROM posts WHERE id = ? AND published = 1")
        .bind(&[o.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"post":post}))
}

pub async fn og_cover(req: &mut Request, env: &Env) -> Result<Response> {
    let o: PostId = req.json().await?;
    let post = env
        .d1("DB")?
        .prepare("SELECT image_url, image_frame FROM posts WHERE id = ? AND published = 1")
        .bind(&[o.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"post":post}))
}

pub async fn public_check(req: &mut Request, env: &Env) -> Result<Response> {
    let o: PostId = req.json().await?;
    let post = env
        .d1("DB")?
        .prepare("SELECT id FROM posts WHERE id = ? AND published = 1")
        .bind(&[o.id.into()])?
        .first::<Value>(None)
        .await?;
    Response::from_json(&json!({"post":post}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostLikeAdd {
    id: f64,
    viewer_key: String,
}

pub async fn like_add(req: &mut Request, env: &Env) -> Result<Response> {
    let o: PostLikeAdd = req.json().await?;
    let db = env.d1("DB")?;
    let args = [JsValue::from_f64(o.id), o.viewer_key.into()];
    let existing = db
        .prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND viewer_key = ? LIMIT 1")
        .bind(&args)?
        .first::<Value>(None)
        .await?;
    if existing.is_none() {
        let result=db.prepare("INSERT OR IGNORE INTO post_likes (post_id,viewer_key) SELECT ?,? WHERE EXISTS (SELECT 1 FROM posts WHERE id = ? AND published = 1)").bind(&[args[0].clone(),args[1].clone(),args[0].clone()])?.run().await?;
        if result.meta()?.and_then(|m| m.changes).unwrap_or(0) == 0 {
            let post = db
                .prepare("SELECT id FROM posts WHERE id = ? AND published = 1")
                .bind(&[args[0].clone()])?
                .first::<Value>(None)
                .await?;
            if post.is_none() {
                return Response::from_json(&json!({"notPublic":true}));
            }
        }
    }
    Response::from_json(&json!({"ok":true}))
}

pub async fn history_record(req: &mut Request, env: &Env) -> Result<Response> {
    let o: CreateOptions = req.json().await?;
    if o.bindings.len() != 6 {
        return Err(Error::RustError("Invalid post history values".into()));
    }
    let args = post_bindings(&o.bindings)?;
    env.d1("DB")?.prepare("INSERT INTO post_history (post_id, action, summary, snapshot, before_snapshot, after_snapshot) VALUES (?, ?, ?, ?, ?, ?)").bind(&args)?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct AdminReadOptions {
    kind: String,
    id: Option<f64>,
}

pub async fn admin_read(req: &mut Request, env: &Env) -> Result<Response> {
    let o: AdminReadOptions = req.json().await?;
    let db = env.d1("DB")?;
    let (sql, bind_id) = match o.kind.as_str() {
        "post" => ("SELECT * FROM posts WHERE id = ?", true),
        "delete-source" => (
            "SELECT category, image_url, gallery_images, content FROM posts WHERE id = ?",
            true,
        ),
        "author" => (
            "SELECT id, editor_code FROM admin_users WHERE id = ? AND status != 'deleted'",
            true,
        ),
        "featured-count" => (
            "SELECT COUNT(*) AS n FROM posts WHERE featured = 1 AND published = 1",
            false,
        ),
        _ => return Err(Error::RustError("Invalid post admin query".into())),
    };
    let stmt = db.prepare(sql);
    let row = if bind_id {
        stmt.bind(&[JsValue::from_f64(o.id.unwrap_or(0.0))])?
            .first::<Value>(None)
            .await?
    } else {
        stmt.first::<Value>(None).await?
    };
    Response::from_json(&json!({"row":row}))
}
