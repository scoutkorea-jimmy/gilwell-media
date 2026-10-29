use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, wasm_bindgen::JsValue, *};

fn banner_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64() != Some(0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}

#[derive(Deserialize)]
struct TextInput {
    kind: String,
    body: Value,
}

#[derive(Deserialize)]
struct CalendarCopyInput {
    raw: Value,
    defaults: Vec<(String, String)>,
}

pub async fn calendar_copy(req: &mut Request) -> Result<Response> {
    let input: CalendarCopyInput = req.json().await?;
    let entries: Vec<(String, String)> = input
        .defaults
        .into_iter()
        .map(|(key, fallback)| {
            let value = input
                .raw
                .get(&key)
                .and_then(Value::as_str)
                .map(crate::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(&fallback)
                .to_owned();
            (key, value)
        })
        .collect();
    Response::from_json(&json!({"entries":entries}))
}

pub async fn normalize_text(req: &mut Request) -> Result<Response> {
    let input: TextInput = req.json().await?;
    match input.kind.as_str() {
        "ticker" => {
            let Some(items) = input
                .body
                .get("items")
                .and_then(Value::as_array)
                .filter(|items| !items.is_empty())
            else {
                return Response::from_json(&json!({"error":"항목 배열을 입력해주세요"}));
            };
            let items: Vec<String> = items
                .iter()
                .map(crate::post_routes::js_string)
                .map(|value| crate::trim(&value).to_owned())
                .filter(|value| !value.is_empty())
                .take(20)
                .collect();
            Response::from_json(&json!({"items":items}))
        }
        "ai-disclaimer" => {
            let raw = input
                .body
                .get("text")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty());
            let text = raw
                .map(|value| {
                    String::from(worker::js_sys::JsString::from(crate::trim(value)).slice(0, 500))
                })
                .unwrap_or_else(|| "본 글은 AI의 도움을 받아 작성되었습니다.".into());
            Response::from_json(&json!({"text":text}))
        }
        "author" => {
            let raw = input
                .body
                .get("author")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty());
            let author = raw
                .map(|value| {
                    String::from(worker::js_sys::JsString::from(crate::trim(value)).slice(0, 60))
                })
                .unwrap_or_else(|| "Editor.A".into());
            Response::from_json(&json!({"author":author}))
        }
        _ => Err(Error::RustError("Invalid text normalization".into())),
    }
}

#[derive(Deserialize)]
struct BoardCopyDefault {
    key: String,
    description: String,
}
#[derive(Deserialize)]
struct BoardCopyInput {
    raw: Value,
    defaults: Vec<BoardCopyDefault>,
}

pub async fn board_copy(req: &mut Request) -> Result<Response> {
    let input: BoardCopyInput = req.json().await?;
    let parsed = if let Some(text) = input.raw.as_str() {
        serde_json::from_str::<Value>(text).unwrap_or(Value::Null)
    } else {
        input.raw
    };
    let mut entries = Vec::new();
    for item in input.defaults {
        let value = parsed
            .get(&item.key)
            .and_then(|entry| entry.get("description"))
            .filter(|v| banner_truthy(v))
            .map(crate::post_routes::js_string)
            .unwrap_or_default();
        let text = crate::trim(&value);
        let text = if text.is_empty() {
            item.description
        } else {
            String::from(worker::js_sys::JsString::from(text).slice(0, 600))
        };
        entries.push(json!({"key":item.key,"description":text}));
    }
    Response::from_json(&json!({"entries":entries}))
}

#[derive(Deserialize, serde::Serialize)]
struct TranslationEntry {
    key: String,
    value: String,
}

pub async fn translations(req: &mut Request) -> Result<Response> {
    let entries: Vec<TranslationEntry> = req.json().await?;
    let locked = [
        "nav.contributors",
        "nav.home",
        "nav.latest",
        "nav.korea",
        "nav.apr",
        "nav.wosm",
        "nav.wosm_members",
        "nav.people",
        "nav.calendar",
        "nav.glossary",
        "constructor",
        "__defineGetter__",
        "__defineSetter__",
        "hasOwnProperty",
        "__lookupGetter__",
        "__lookupSetter__",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toString",
        "valueOf",
        "__proto__",
        "toLocaleString",
    ];
    let entries: Vec<TranslationEntry> = entries
        .into_iter()
        .filter(|entry| !locked.contains(&entry.key.as_str()))
        .collect();
    Response::from_json(&json!({"entries":entries}))
}

#[derive(Deserialize)]
struct NavDefault {
    key: String,
    ko: String,
    en: String,
}
#[derive(Deserialize)]
struct NavInput {
    raw: Value,
    defaults: Vec<NavDefault>,
}

fn normalize_nav_labels(input: NavInput) -> Vec<Value> {
    let mut entries = Vec::new();
    for item in input.defaults {
        let value = input
            .raw
            .get(&item.key)
            .filter(|v| v.is_object() || v.is_array())
            .unwrap_or(&Value::Null);
        let label = |key: &str, fallback: &str| {
            let raw = value
                .get(key)
                .filter(|v| !v.is_null())
                .map(crate::post_routes::js_string)
                .unwrap_or_default();
            let trimmed =
                String::from(worker::js_sys::JsString::from(crate::trim(&raw)).slice(0, 80));
            if trimmed.is_empty() {
                fallback.to_owned()
            } else {
                trimmed
            }
        };
        entries.push(json!({"key":item.key,"ko":label("ko",&item.ko),"en":label("en",&item.en)}));
    }
    entries
}

pub async fn nav_labels(req: &mut Request) -> Result<Response> {
    Response::from_json(&json!({"entries":normalize_nav_labels(req.json().await?)}))
}

pub async fn public_nav_labels(req: &mut Request, env: &Env) -> Result<Response> {
    let mut input: NavInput = req.json().await?;
    let row = env
        .d1("DB")?
        .prepare("SELECT value FROM settings WHERE key = 'nav_labels'")
        .first::<Value>(None)
        .await?;
    input.raw = row
        .as_ref()
        .and_then(|row| row.get("value"))
        .and_then(Value::as_str)
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or(Value::Null);
    Response::from_json(&json!({"entries":normalize_nav_labels(input)}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SiteMetaInput {
    raw: Value,
    defaults: Value,
    page_keys: Vec<String>,
    legacy_titles: Vec<String>,
    legacy_descriptions: Vec<String>,
}

fn meta_text(value: Option<&Value>, fallback: &str, limit: u32) -> String {
    let text = value
        .and_then(Value::as_str)
        .map(crate::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback);
    String::from(worker::js_sys::JsString::from(text).slice(0, limit))
}

pub async fn site_meta(req: &mut Request) -> Result<Response> {
    let input: SiteMetaInput = req.json().await?;
    let mut pages = Vec::new();
    for key in &input.page_keys {
        let source = input
            .raw
            .get("pages")
            .and_then(|p| p.get(key))
            .filter(|v| banner_truthy(v))
            .or_else(|| {
                if key == "wosm" {
                    input.raw.get("pages").and_then(|p| p.get("worm"))
                } else {
                    None
                }
            })
            .unwrap_or(&Value::Null);
        let defaults = input
            .defaults
            .get("pages")
            .and_then(|p| p.get(key))
            .unwrap_or(&Value::Null);
        let def_title = defaults
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let def_description = defaults
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let title_value = source.get("title");
        let desc_value = source.get("description");
        let is_legacy = |value: Option<&Value>, list: &[String]| {
            value
                .and_then(Value::as_str)
                .map(crate::trim)
                .is_some_and(|text| list.iter().any(|old| old == text))
        };
        let title = if key == "home" && is_legacy(title_value, &input.legacy_titles) {
            meta_text(None, def_title, 120)
        } else {
            meta_text(title_value, def_title, 120)
        };
        let description = if key == "home" && is_legacy(desc_value, &input.legacy_descriptions) {
            meta_text(None, def_description, 260)
        } else {
            meta_text(desc_value, def_description, 260)
        };
        pages.push(json!({"key":key,"title":title,"description":description}));
    }
    let footer = input.raw.get("footer").unwrap_or(&Value::Null);
    let defaults = &input.defaults["footer"];
    let mut fields = Vec::new();
    for (key, limit) in [
        ("raw_text", 4000),
        ("title", 80),
        ("description", 260),
        ("domain_label", 120),
        ("tip_email", 0),
        ("contact_email", 0),
    ] {
        let fallback = defaults
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or_default();
        let value = if limit == 0 {
            let text = footer
                .get(key)
                .and_then(Value::as_str)
                .map(crate::trim)
                .unwrap_or_default();
            if !text.is_empty()
                && worker::js_sys::RegExp::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", "").test(text)
            {
                text.to_owned()
            } else {
                fallback.to_owned()
            }
        } else {
            meta_text(footer.get(key), fallback, limit)
        };
        fields.push(json!({"key":key,"value":value}));
    }
    let raw_image = input
        .raw
        .get("image_url")
        .and_then(Value::as_str)
        .map(crate::trim)
        .filter(|v| !v.is_empty());
    let image = raw_image.filter(|v| {
        v.starts_with("data:image/")
            || Url::parse(v)
                .ok()
                .is_some_and(|url| url.scheme() == "http" || url.scheme() == "https")
    });
    Response::from_json(
        &json!({"pages":pages,"footer":fields,"image_url":image,"google_verification":meta_text(input.raw.get("google_verification"),"",120),"naver_verification":meta_text(input.raw.get("naver_verification"),"",120)}),
    )
}

pub async fn board_banner(req: &mut Request) -> Result<Response> {
    let raw: Value = req.json().await?;
    let parsed = if let Some(text) = raw.as_str() {
        serde_json::from_str::<Value>(text).unwrap_or(Value::Null)
    } else {
        raw
    };
    let items = parsed.get("items").filter(|value| banner_truthy(value));
    let mut output = Vec::new();
    for category in ["korea", "apr", "wosm", "people"] {
        let source = items
            .and_then(|v| v.get(category))
            .filter(|v| banner_truthy(v))
            .or_else(|| {
                if category == "wosm" {
                    items.and_then(|v| v.get("worm"))
                } else {
                    None
                }
            });
        let text = |key| {
            source
                .and_then(|v| v.get(key))
                .filter(|v| banner_truthy(v))
                .map(crate::post_routes::js_string)
                .unwrap_or_default()
        };
        let raw_name = text("event_name");
        let name =
            String::from(worker::js_sys::JsString::from(crate::trim(&raw_name)).slice(0, 80));
        let raw_date = text("event_date");
        let date = crate::trim(&raw_date);
        let chars = date.as_bytes();
        let valid = chars.len() == 10
            && chars[4] == b'-'
            && chars[7] == b'-'
            && chars
                .iter()
                .enumerate()
                .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
        output.push(json!({"category":category,"name":name,"date":if valid {date} else {""}}));
    }
    Response::from_json(&json!({"items":output}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveOptions {
    target: String,
    current_rev: f64,
    next_rev: String,
    values: Vec<String>,
}

pub async fn save(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SaveOptions = req.json().await?;
    let (revision, keys): (&str, &[&str]) = match o.target.as_str() {
        "wosm_members" => (
            "wosm_members_rev",
            &[
                "wosm_members",
                "wosm_members_columns",
                "wosm_members_import_mapping",
                "wosm_members_registered_count",
                "wosm_members_public_copy",
            ],
        ),
        "reference_sites" => ("reference_sites_rev", &["reference_sites"]),
        "board_copy" => ("board_copy_rev", &["board_copy"]),
        "contributors" => ("contributors_rev", &["contributors"]),
        "hero" => ("hero_rev", &["hero", "hero_interval", "hero_media"]),
        "site_meta" => ("site_meta_rev", &["site_meta"]),
        "feature_definition" => ("feature_definition_rev", &["feature_definition"]),
        _ => return Err(Error::RustError("Invalid setting target".into())),
    };
    if o.values.len() != keys.len() {
        return Err(Error::RustError("Invalid setting values".into()));
    }
    let db = env.d1("DB")?;
    let mut statements=vec![db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(settings.value AS INTEGER) = ?")
        .bind(&[revision.into(),o.next_rev.into(),JsValue::from_f64(o.current_rev)])?];
    for (key, value) in keys.iter().zip(&o.values) {
        statements.push(db.prepare("INSERT INTO settings (key, value) SELECT ?, ? WHERE changes() = 1 ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(&[(*key).into(),value.into()])?);
    }
    let results = db.batch(statements).await?;
    let changes = match results.first() {
        Some(result) => result.meta()?.and_then(|meta| meta.changes).unwrap_or(0),
        None => 0,
    };
    Response::from_json(&json!({"changes":changes}))
}

#[derive(Deserialize)]
struct ReadOptions {
    target: String,
}

pub async fn read(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ReadOptions = req.json().await?;
    let keys: &[&str] = match o.target.as_str() {
        "wosm_members" => &[
            "wosm_members",
            "wosm_members_columns",
            "wosm_members_import_mapping",
            "wosm_members_registered_count",
            "wosm_members_public_copy",
            "wosm_members_rev",
        ],
        "reference_sites" => &["reference_sites", "reference_sites_rev"],
        "wosm_save" => &["wosm_members", "wosm_members_rev"],
        "reference_save" => &["reference_sites", "reference_sites_rev"],
        _ => return Err(Error::RustError("Invalid setting target".into())),
    };
    let db = env.d1("DB")?;
    let mut rows = Vec::with_capacity(keys.len());
    for key in keys {
        rows.push(
            db.prepare("SELECT value FROM settings WHERE key = ?")
                .bind(&[(*key).into()])?
                .first::<Value>(None)
                .await?,
        );
    }
    Response::from_json(&json!({"rows":rows}))
}

#[derive(Deserialize)]
struct SingleOptions {
    key: String,
    operation: String,
    value: Option<String>,
    expected: Option<String>,
}

pub async fn single(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SingleOptions = req.json().await?;
    if !matches!(
        o.key.as_str(),
        "board_card_gap"
            | "calendar_tags"
            | "calendar_copy"
            | "score_rubric"
            | "ticker"
            | "author_name"
            | "ai_disclaimer"
            | "board_banner_events"
            | "editors"
            | "translations"
            | "nav_labels"
            | "site_meta"
            | "home_lead_post"
            | "public_runtime"
            | "wosm_members"
            | "feature_definition"
            | "publish_kill_switch"
            | "tags"
    ) {
        return Err(Error::RustError("Invalid setting key".into()));
    }
    let db = env.d1("DB")?;
    let row = if o.operation == "cas" {
        None
    } else {
        db.prepare("SELECT value FROM settings WHERE key = ?")
            .bind(&[o.key.as_str().into()])?
            .first::<Value>(None)
            .await?
    };
    let mut changes = 0;
    match o.operation.as_str() {
        "get" => (),
        "cas"
            if matches!(
                o.key.as_str(),
                "ticker"
                    | "author_name"
                    | "ai_disclaimer"
                    | "board_banner_events"
                    | "editors"
                    | "translations"
                    | "nav_labels"
                    | "tags"
            ) =>
        {
            let value = o
                .value
                .ok_or_else(|| Error::RustError("Missing setting value".into()))?;
            let expected = o.expected.map(JsValue::from).unwrap_or(JsValue::NULL);
            let result=db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value IS ?").bind(&[o.key.as_str().into(),value.into(),expected])?.run().await?;
            changes = result.meta()?.and_then(|m| m.changes).unwrap_or(0);
        }
        "put"
            if matches!(
                o.key.as_str(),
                "board_card_gap" | "calendar_tags" | "calendar_copy" | "score_rubric"
            ) =>
        {
            let value = o
                .value
                .ok_or_else(|| Error::RustError("Missing setting value".into()))?;
            db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(&[o.key.as_str().into(),value.into()])?.run().await?;
        }
        "delete" if o.key == "score_rubric" => {
            db.prepare("DELETE FROM settings WHERE key = ?")
                .bind(&[o.key.as_str().into()])?
                .run()
                .await?;
        }
        _ => return Err(Error::RustError("Invalid setting operation".into())),
    }
    Response::from_json(&json!({"row":row,"changes":changes}))
}

#[derive(Deserialize)]
struct PublishSwitch {
    value: String,
}

pub async fn publish_switch_set(req: &mut Request, env: &Env) -> Result<Response> {
    let input: PublishSwitch = req.json().await?;
    if input.value != "on" && input.value != "off" {
        return Err(Error::RustError("Invalid publish switch".into()));
    }
    env.d1("DB")?.prepare("INSERT INTO settings (key, value) VALUES ('publish_kill_switch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(&[input.value.into()])?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

pub async fn feature_history(env: &Env) -> Result<Response> {
    let row = env.d1("DB")?.prepare("SELECT saved_at FROM settings_history WHERE key = 'feature_definition' ORDER BY saved_at DESC LIMIT 1").first::<Value>(None).await?;
    Response::from_json(&json!({"row":row}))
}

#[derive(Deserialize)]
struct TagUsageOptions {
    tag: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TagCommitOptions {
    value: String,
    expected: Option<String>,
    removed: Vec<String>,
}

pub async fn tag_commit(req: &mut Request, env: &Env) -> Result<Response> {
    let options: TagCommitOptions = req.json().await?;
    let expected = options.expected.map(JsValue::from).unwrap_or(JsValue::NULL);
    let db = env.d1("DB")?;
    let result = if options.removed.is_empty() {
        db.prepare("INSERT INTO settings (key, value) VALUES ('tags', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value IS ?").bind(&[options.value.into(),expected])?.run().await?
    } else {
        let removed = serde_json::to_string(&options.removed)
            .map_err(|error| Error::RustError(error.to_string()))?;
        db.prepare("WITH candidates AS MATERIALIZED (SELECT ',' || replace(replace(value, ', ', ','), ' ,', ',') || ',' AS needle FROM json_each(?2)), normalized AS MATERIALIZED (SELECT ',' || replace(replace(COALESCE(tag, ''), ', ', ','), ' ,', ',') || ',' AS haystack FROM posts WHERE tag IS NOT NULL) INSERT INTO settings (key, value) SELECT 'tags', ?1 WHERE NOT EXISTS (SELECT 1 FROM normalized n JOIN candidates c WHERE instr(n.haystack,c.needle)>0) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value IS ?3").bind(&[options.value.into(),removed.into(),expected])?.run().await?
    };
    Response::from_json(
        &json!({"changes":result.meta()?.and_then(|meta|meta.changes).unwrap_or(0)}),
    )
}

pub async fn meta_tag_pool(env: &Env) -> Result<Response> {
    let rows = env
        .d1("DB")?
        .prepare("SELECT meta_tags FROM posts WHERE meta_tags IS NOT NULL AND meta_tags <> \"\"")
        .all()
        .await?
        .results::<Value>()?;
    let mut positions = std::collections::HashMap::<String, usize>::new();
    let mut counts = Vec::<(String, u64)>::new();
    for row in rows {
        let Some(raw) = row.get("meta_tags").and_then(Value::as_str) else {
            continue;
        };
        for tag in raw.split(',') {
            let name = tag.trim_matches(|c| matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'));
            if name.is_empty() {
                continue;
            }
            if let Some(index) = positions.get(name) {
                counts[*index].1 += 1;
            } else {
                positions.insert(name.to_owned(), counts.len());
                counts.push((name.to_owned(), 1));
            }
        }
    }
    Response::from_json(
        &json!({"tags":counts.into_iter().map(|(name,count)|json!({"name":name,"count":count})).collect::<Vec<_>>() }),
    )
}

#[derive(Deserialize)]
struct RemovedTagsInput {
    removed: Vec<String>,
}
pub async fn removed_tag_usage(req: &mut Request, env: &Env) -> Result<Response> {
    let input: RemovedTagsInput = req.json().await?;
    if input.removed.is_empty() {
        return Response::from_json(&json!({"usage":null}));
    }
    let removed =
        serde_json::to_string(&input.removed).map_err(|e| Error::RustError(e.to_string()))?;
    // Materialize normalized strings once per statement instead of re-running
    // replace() for each candidate/article comparison.
    let sql = "WITH candidates AS MATERIALIZED (SELECT CAST(key AS INTEGER) AS ordinal, value AS tag, ',' || replace(replace(value, ', ', ','), ' ,', ',') || ',' AS needle FROM json_each(?)), normalized AS MATERIALIZED (SELECT id,',' || replace(replace(COALESCE(tag, ''), ', ', ','), ' ,', ',') || ',' AS haystack FROM posts WHERE tag IS NOT NULL), chosen AS (SELECT c.tag,c.needle FROM candidates c WHERE EXISTS (SELECT 1 FROM normalized n WHERE instr(n.haystack,c.needle)>0) ORDER BY c.ordinal LIMIT 1), matched AS (SELECT p.id,p.title,p.category,p.tag,p.updated_at,c.tag AS matched_tag,COUNT(*) OVER () AS total_count FROM normalized n JOIN chosen c JOIN posts p ON p.id=n.id WHERE instr(n.haystack,c.needle)>0) SELECT id,title,category,tag,matched_tag,total_count FROM matched ORDER BY updated_at DESC,id DESC LIMIT 5";
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&[removed.into()])?
        .all()
        .await?
        .results::<Value>()?;
    let Some(first) = rows.first() else {
        return Response::from_json(&json!({"usage":null}));
    };
    let count = first
        .get("total_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let tag = first
        .get("matched_tag")
        .and_then(Value::as_str)
        .unwrap_or("");
    let posts:Vec<Value>=rows.iter().map(|row| {
        let field=|key:&str|row.get(key).filter(|v|banner_truthy(v)).cloned().unwrap_or_else(||json!(""));
        json!({"id":row.get("id"),"title":field("title"),"category":field("category"),"tag":field("tag")})
    }).collect();
    Response::from_json(&json!({"usage":{"tag":tag,"in_use":true,"count":count,"posts":posts}}))
}

pub async fn tag_usage(req: &mut Request, env: &Env) -> Result<Response> {
    let options: TagUsageOptions = req.json().await?;
    let db = env.d1("DB")?;
    let condition = "tag IS NOT NULL AND instr(',' || replace(replace(COALESCE(tag, ''), ', ', ','), ' ,', ',') || ',', ',' || replace(replace(?, ', ', ','), ' ,', ',') || ',') > 0";
    let rows = db.prepare(format!("SELECT id, title, category, tag, COUNT(*) OVER () AS total_count FROM posts WHERE {condition} ORDER BY updated_at DESC, id DESC LIMIT 5")).bind(&[options.tag.as_str().into()])?.all().await?.results::<Value>()?;
    let count = rows
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let posts:Vec<Value>=rows.iter().map(|row| {
        let field=|key:&str|row.get(key).filter(|v|banner_truthy(v)).cloned().unwrap_or_else(||json!(""));
        json!({"id":row.get("id"),"title":field("title"),"category":field("category"),"tag":field("tag")})
    }).collect();
    Response::from_json(&json!({"tag":options.tag,"in_use":count>0,"count":count,"posts":posts}))
}

pub async fn snapshot(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ReadOptions = req.json().await?;
    if o.target == "hero" {
        let rows=env.d1("DB")?.prepare("SELECT key, value FROM settings WHERE key IN ('hero', 'hero_interval', 'hero_rev', 'hero_media')").all().await?.results::<Value>()?;
        let value = |key: &str| {
            rows.iter()
                .find(|row| row.get("key").and_then(Value::as_str) == Some(key))
                .and_then(|row| row.get("value"))
                .and_then(Value::as_str)
                .unwrap_or("")
        };
        let hero = crate::post_routes::hero_settings(value("hero"))?;
        let media = crate::post_routes::hero_media(value("hero_media"))?;
        let interval = worker::js_sys::parse_int(value("hero_interval"), 10);
        let interval = if interval.is_finite() {
            interval.clamp(2000.0, 15000.0)
        } else {
            3000.0
        };
        return Response::from_json(
            &json!({"results":rows,"hero":hero,"media":media,"interval":interval}),
        );
    }
    let (key, revision) = match o.target.as_str() {
        "board_copy" => ("board_copy", "board_copy_rev"),
        "contributors" => ("contributors", "contributors_rev"),
        "site_meta" => ("site_meta", "site_meta_rev"),
        "feature_definition" => ("feature_definition", "feature_definition_rev"),
        _ => return Err(Error::RustError("Invalid setting target".into())),
    };
    let rows = env
        .d1("DB")?
        .prepare("SELECT key, value FROM settings WHERE key IN (?, ?)")
        .bind(&[key.into(), revision.into()])?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&json!({"results":rows}))
}

#[derive(Deserialize)]
struct PicksOptions {
    operation: String,
    items: Option<Vec<Value>>,
}

pub async fn picks_order(req: &mut Request, env: &Env) -> Result<Response> {
    let options: PicksOptions = req.json().await?;
    let db = env.d1("DB")?;
    let previous = db
        .prepare("SELECT value FROM settings WHERE key='picks_order'")
        .first::<Value>(None)
        .await?;
    let input: Vec<f64> = if options.operation == "get" {
        let parse = || -> std::result::Result<Vec<f64>, JsValue> {
            use worker::wasm_bindgen::JsCast;
            let raw = previous
                .as_ref()
                .and_then(|row| row.get("value"))
                .and_then(Value::as_str)
                .unwrap_or("[]");
            let parsed = js_sys::JSON::parse(raw)?;
            if !js_sys::Array::is_array(&parsed) {
                return Ok(Vec::new());
            }
            let parse_int: js_sys::Function =
                js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("parseInt"))?
                    .dyn_into()?;
            js_sys::Array::from(&parsed)
                .iter()
                .map(|value| {
                    parse_int
                        .call2(&JsValue::UNDEFINED, &value, &JsValue::from_f64(10.0))
                        .map(|n| n.as_f64().unwrap_or(f64::NAN))
                })
                .collect()
        };
        parse().unwrap_or_default()
    } else if options.operation == "put" {
        options
            .items
            .unwrap_or_default()
            .iter()
            .map(|item| js_sys::parse_int(&crate::post_routes::js_string(item), 10))
            .collect()
    } else {
        return Err(Error::RustError("Invalid picks operation".into()));
    };
    let mut output: Vec<Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for id in input {
        if !id.is_finite() || id <= 0.0 {
            continue;
        }
        if options.operation == "put" && !seen.insert(id.to_bits()) {
            continue;
        }
        let number = if id < i64::MAX as f64 {
            Value::from(id as i64)
        } else {
            json!(id)
        };
        output.push(number);
        if options.operation == "put" && output.len() == 20 {
            break;
        }
    }
    if options.operation == "put" {
        let stored = serde_json::to_string(&output).map_err(|e| Error::RustError(e.to_string()))?;
        db.prepare("INSERT INTO settings (key,value) VALUES ('picks_order',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(&[stored.into()])?.run().await?;
    }
    Response::from_json(&json!({"items":output,"previous":previous}))
}

#[derive(Deserialize)]
struct SearchReportOptions {
    operation: String,
    engine: Option<String>,
    value: Option<String>,
    previous: Option<String>,
}

pub async fn search_reports(req: &mut Request, env: &Env) -> Result<Response> {
    let o: SearchReportOptions = req.json().await?;
    let db = env.d1("DB")?;
    if o.operation == "list" {
        let rows=db.prepare("SELECT value FROM settings WHERE key IN ('search_performance_google', 'search_performance_naver')").all().await?.results::<Value>()?;
        return Response::from_json(&json!({"rows":rows}));
    }
    let key = match o.engine.as_deref() {
        Some("google") => "search_performance_google",
        Some("naver") => "search_performance_naver",
        _ => return Err(Error::RustError("Invalid search engine".into())),
    };
    match o.operation.as_str() {
        "get" => {
            let row = db
                .prepare("SELECT value FROM settings WHERE key = ?")
                .bind(&[key.into()])?
                .first::<Value>(None)
                .await?;
            Response::from_json(&json!({"row":row}))
        }
        "commit" => {
            let value = o
                .value
                .ok_or_else(|| Error::RustError("Missing report".into()))?;
            let mut statements = Vec::new();
            if let Some(previous) = o.previous.as_deref() {
                statements.push(db.prepare("INSERT INTO settings_history (key, value) SELECT key, value FROM settings WHERE key = ? AND value = ?").bind(&[key.into(),previous.into()])?);
            }
            let previous = o
                .previous
                .map(worker::wasm_bindgen::JsValue::from)
                .unwrap_or(worker::wasm_bindgen::JsValue::NULL);
            statements.push(db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value = ?").bind(&[key.into(),value.into(),previous])?);
            let result = db.batch(statements).await?;
            let changes = result
                .last()
                .and_then(|r| r.meta().ok().flatten())
                .and_then(|m| m.changes)
                .unwrap_or(0);
            Response::from_json(&json!({"changes":changes}))
        }
        _ => Err(Error::RustError("Invalid report operation".into())),
    }
}

#[derive(Deserialize)]
struct JobHeartbeat {
    job: String,
    timestamp: String,
}

pub async fn job_heartbeat(req: &mut Request, env: &Env) -> Result<Response> {
    let o: JobHeartbeat = req.json().await?;
    let key = match o.job.as_str() {
        "publish" => "scheduler_last_run",
        "drafts" => "drafts_cleanup_last_run",
        _ => return Err(Error::RustError("Invalid job".into())),
    };
    env.d1("DB")?.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(&[key.into(),o.timestamp.into()])?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct HistoryOptions {
    operation: String,
    key: Option<String>,
    value: Option<String>,
}

pub async fn history(req: &mut Request, env: &Env) -> Result<Response> {
    let o: HistoryOptions = req.json().await?;
    let db = env.d1("DB")?;
    match o.operation.as_str() {
        "ensure" => {
            db.prepare("CREATE TABLE IF NOT EXISTS settings_history (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT NOT NULL, saved_at TEXT NOT NULL DEFAULT (datetime('now')))").run().await?;
            db.prepare("CREATE INDEX IF NOT EXISTS idx_settings_history_time ON settings_history(saved_at DESC, id DESC)").run().await?;
        }
        "insert" => {
            let key = o
                .key
                .ok_or_else(|| Error::RustError("Missing history key".into()))?;
            let value = o
                .value
                .ok_or_else(|| Error::RustError("Missing history value".into()))?;
            db.prepare("INSERT INTO settings_history (key,value) VALUES (?,?)")
                .bind(&[key.into(), value.into()])?
                .run()
                .await?;
        }
        _ => {
            return Err(Error::RustError(
                "Invalid settings history operation".into(),
            ));
        }
    }
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct RubricInput {
    text: String,
}

pub async fn normalize_rubric(req: &mut Request) -> Result<Response> {
    let input: RubricInput = req.json().await?;
    let mut text = js_sys::JsString::from(input.text.as_str());
    for (pattern, replacement) in [(r"\r\n?", "\n"), (r"[ \t]+\n", "\n"), (r"\n{3,}", "\n\n")] {
        text = text.replace_by_pattern(&js_sys::RegExp::new(pattern, "g"), replacement);
    }
    text = text.trim();
    if text.length() > 20000 {
        text = text.slice(0, 20000);
    }
    let units: Vec<u16> = (0..text.length())
        .map(|i| text.char_code_at(i) as u16)
        .collect();
    Response::from_json(&json!({"units":units}))
}

#[derive(Deserialize)]
struct EditorInput {
    entries: Vec<(String, Value)>,
}

pub async fn normalize_editors(req: &mut Request) -> Result<Response> {
    let input: EditorInput = req.json().await?;
    let mut entries: Vec<(String, Vec<u16>)> = Vec::new();
    for (key, value) in input.entries {
        let key = String::from(js_sys::JsString::from(key.as_str()).trim().to_upper_case());
        if key.len() != 1 || !key.as_bytes()[0].is_ascii_uppercase() {
            continue;
        }
        let text = value
            .as_str()
            .map(|s| js_sys::JsString::from(s).trim().slice(0, 60))
            .unwrap_or_else(|| js_sys::JsString::from(""));
        let units: Vec<u16> = (0..text.length())
            .map(|i| text.char_code_at(i) as u16)
            .collect();
        entries.push((key, units));
    }
    Response::from_json(&json!({"entries":entries}))
}

#[derive(Deserialize)]
struct WosmFieldInput {
    fields: Vec<(String, String, String, u32)>,
    count: Option<f64>,
    count_empty: bool,
}

pub async fn wosm_fields(req: &mut Request) -> Result<Response> {
    let input: WosmFieldInput = req.json().await?;
    let mut fields: Vec<(String, Vec<u16>)> = Vec::new();
    for (key, raw, fallback, max) in input.fields {
        let text = js_sys::JsString::from(raw.as_str()).trim().slice(0, max);
        let chosen = if text.length() == 0 {
            js_sys::JsString::from(fallback.as_str())
        } else {
            text
        };
        fields.push((
            key,
            (0..chosen.length())
                .map(|i| chosen.char_code_at(i) as u16)
                .collect(),
        ));
    }
    let count = match input.count {
        Some(n) if !input.count_empty && n.is_finite() && n >= 0.0 => js_sys::Math::round(n),
        _ => 176.0,
    };
    Response::from_json(&json!({"fields":fields,"registered_count":count}))
}

#[derive(Deserialize)]
struct WosmColumnsInput {
    columns: Vec<(String, String, String)>,
    defaults: Vec<(String, String, String, String)>,
}
struct WosmColumn {
    key: String,
    label: js_sys::JsString,
    kind: String,
    system: bool,
    header: js_sys::JsString,
}
fn trimmed_slice(value: &str, limit: u32) -> js_sys::JsString {
    js_sys::JsString::from(value).trim().slice(0, limit)
}
fn text_units(value: &js_sys::JsString) -> Vec<u16> {
    (0..value.length())
        .map(|i| value.char_code_at(i) as u16)
        .collect()
}
pub async fn wosm_columns(req: &mut Request) -> Result<Response> {
    let input: WosmColumnsInput = req.json().await?;
    let mut columns: Vec<WosmColumn> = Vec::new();
    if input.columns.is_empty() {
        for (key, label, kind, header) in input.defaults {
            columns.push(WosmColumn {
                key,
                label: label.as_str().into(),
                kind,
                system: true,
                header: header.as_str().into(),
            });
        }
    } else {
        for (index, (raw_key, raw_label, raw_header)) in input.columns.iter().enumerate() {
            let key = js_sys::JsString::from(raw_key.as_str()).trim();
            let key = if key.length() == 0 {
                js_sys::JsString::from(format!("column_{}", index + 1).as_str())
            } else {
                key
            };
            let key = key
                .to_lower_case()
                .replace_by_pattern(&js_sys::RegExp::new("[^a-z0-9_]+", "g"), "_")
                .replace_by_pattern(&js_sys::RegExp::new("^_+|_+$", "g"), "")
                .slice(0, 40);
            let key = String::from(key);
            if key.is_empty() || columns.iter().any(|c| c.key == key) {
                continue;
            }
            let label = trimmed_slice(raw_label, 40);
            let label = if label.length() == 0 {
                js_sys::JsString::from(key.as_str())
            } else {
                label
            };
            let system = ["country_names", "membership_category", "status_description"]
                .contains(&key.as_str());
            let kind = if key == "country_names" {
                "country_names"
            } else {
                "field"
            }
            .to_owned();
            let header = if key == "country_names" {
                js_sys::JsString::from("")
            } else {
                trimmed_slice(raw_header, 160)
            };
            columns.push(WosmColumn {
                key,
                label,
                kind,
                system,
                header,
            });
        }
        for (key, label, kind, header) in input.defaults {
            if let Some(col) = columns.iter_mut().find(|c| c.key == key) {
                if col.label.length() == 0 {
                    col.label = label.as_str().into();
                }
                col.kind = kind;
                col.system = true;
                if col.key == "country_names" {
                    col.header = "".into();
                } else if col.header.length() == 0 {
                    col.header = header.as_str().into();
                }
            } else if key == "country_names" {
                columns.push(WosmColumn {
                    key,
                    label: label.as_str().into(),
                    kind,
                    system: true,
                    header: "".into(),
                });
            }
        }
        columns.sort_by_key(|col| {
            let label = String::from(col.label.to_lower_case());
            let header = String::from(col.header.to_lower_case());
            !(col.key.contains("sort")
                || label.contains("정렬")
                || label.contains("순번")
                || header.contains("strict order"))
        });
    }
    let result:Vec<Value> = columns.iter().map(|c|json!({"key":c.key,"label":text_units(&c.label),"type":c.kind,"system":c.system,"header":text_units(&c.header)})).collect();
    Response::from_json(&json!({"columns":result}))
}

#[derive(Deserialize)]
struct WosmMemberRaw {
    ko: String,
    en: String,
    fr: String,
    membership: String,
    status: String,
    extras: Vec<(String, String)>,
    order: Option<f64>,
}
#[derive(Deserialize)]
struct WosmMembersInput {
    items: Vec<WosmMemberRaw>,
}
fn country_key(value: &js_sys::JsString) -> String {
    let decomposed = value
        .normalize("NFKD")
        .replace_by_pattern(&js_sys::RegExp::new(r"[\u0300-\u036f]", "g"), "");
    String::from(
        decomposed
            .to_lower_case()
            .replace_by_pattern(&js_sys::RegExp::new("[^a-z0-9]+", "g"), ""),
    )
}
fn wosm_extra_key(value: &str) -> String {
    String::from(
        js_sys::JsString::from(value)
            .trim()
            .to_lower_case()
            .replace_by_pattern(&js_sys::RegExp::new("[^a-z0-9_]+", "g"), "_")
            .replace_by_pattern(&js_sys::RegExp::new("^_+|_+$", "g"), "")
            .slice(0, 40),
    )
}
fn wosm_normalize_items(
    input: WosmMembersInput,
    with_aliases: bool,
) -> Result<(Vec<Value>, Vec<Vec<String>>)> {
    let mut result = Vec::new();
    let mut aliases = Vec::new();
    for (index, item) in input.items.iter().enumerate() {
        let en = trimmed_slice(&item.en, 160);
        let ko = trimmed_slice(&item.ko, 120);
        let fr = trimmed_slice(&item.fr, 160);
        let membership = trimmed_slice(&item.membership, 160);
        let status = trimmed_slice(&item.status, 260);
        let use_fallback =
            ko.length() == 0 || (en.length() != 0 && country_key(&ko) == country_key(&en));
        let ko = if use_fallback {
            wosm_dictionary()
                .translations
                .get(&country_key(&en))
                .filter(|v| !v.is_empty())
                .map(|v| js_sys::JsString::from(v.as_str()))
                .unwrap_or_else(|| en.clone())
        } else {
            ko
        };
        if ko.length() == 0 && en.length() == 0 && fr.length() == 0 {
            continue;
        }
        let mut extras: Vec<(String, Vec<u16>)> = Vec::new();
        for (raw_key, raw_value) in &item.extras {
            let key = wosm_extra_key(raw_key);
            if key.is_empty()
                || [
                    "country_ko",
                    "country_en",
                    "country_fr",
                    "membership_category",
                    "status_description",
                    "sort_order",
                    "extra_fields",
                ]
                .contains(&key.as_str())
            {
                continue;
            }
            let value = text_units(&trimmed_slice(raw_value, 260));
            if let Some(entry) = extras.iter_mut().find(|entry| entry.0 == key) {
                entry.1 = value;
            } else {
                extras.push((key, value));
            }
        }
        if with_aliases {
            let decode = |text: &js_sys::JsString| {
                String::from_utf16(&text_units(text))
                    .map_err(|_| Error::RustError("Unpaired UTF-16 in WOSM aliases".into()))
            };
            aliases.push(wosm_alias_list(&decode(&ko)?, &decode(&en)?, &decode(&fr)?));
        }
        result.push(json!({"ko":text_units(&ko),"en":text_units(&en),"fr":text_units(&fr),"membership":text_units(&membership),"status":text_units(&status),"extras":extras,"order":item.order.filter(|n|n.is_finite()).unwrap_or(index as f64)}));
    }
    Ok((result, aliases))
}

pub async fn wosm_members_normalize(req: &mut Request) -> Result<Response> {
    let (items, _) = wosm_normalize_items(req.json().await?, false)?;
    Response::from_json(&json!({"items":items}))
}

pub async fn wosm_members_response(req: &mut Request) -> Result<Response> {
    let (items, aliases) = wosm_normalize_items(req.json().await?, true)?;
    Response::from_json(&json!({"items":items,"aliases":aliases}))
}

#[derive(Deserialize)]
struct WosmAliasesInput {
    items: Vec<(String, String, String)>,
}
#[derive(Deserialize)]
struct WosmDictionary {
    translations: std::collections::HashMap<String, String>,
    aliases: std::collections::HashMap<String, Vec<String>>,
}
fn wosm_dictionary() -> &'static WosmDictionary {
    static DICTIONARY: std::sync::OnceLock<WosmDictionary> = std::sync::OnceLock::new();
    DICTIONARY.get_or_init(|| {
        serde_json::from_str(include_str!("wosm_country_dictionary.json"))
            .expect("invalid built-in WOSM country dictionary")
    })
}
fn wosm_alias_list(ko: &str, en: &str, fr: &str) -> Vec<String> {
    let mut aliases: Vec<String> = Vec::new();
    let mut add = |value: &str| {
        let text = String::from(js_sys::JsString::from(value).trim());
        if !text.is_empty() && !aliases.contains(&text) {
            aliases.push(text);
        }
    };
    add(ko);
    add(en);
    add(fr);
    let dictionary = wosm_dictionary();
    let en_key = country_key(&js_sys::JsString::from(en));
    let ko_key = country_key(&js_sys::JsString::from(ko));
    if let Some(translation) = dictionary.translations.get(&en_key) {
        add(translation);
    }
    for key in [&en_key, &ko_key] {
        if key.is_empty() {
            continue;
        }
        if let Some(translation) = dictionary.translations.get(key) {
            add(translation);
        }
        // Both original names were inserted above in the same trimmed form.
        if let Some(extra) = dictionary.aliases.get(key) {
            for name in extra {
                add(name);
            }
        }
    }
    aliases
}

pub async fn wosm_aliases(req: &mut Request) -> Result<Response> {
    let input: WosmAliasesInput = req.json().await?;
    let aliases: Vec<Vec<String>> = input
        .items
        .iter()
        .map(|(ko, en, fr)| wosm_alias_list(ko, en, fr))
        .collect();
    Response::from_json(&json!({"aliases":aliases}))
}

#[derive(Deserialize)]
struct ReferenceSiteRaw {
    name: String,
    url: String,
    summary: String,
    federations: Vec<String>,
}
#[derive(Deserialize)]
struct ReferenceSitesInput {
    items: Vec<ReferenceSiteRaw>,
}
pub async fn reference_sites_normalize(req: &mut Request) -> Result<Response> {
    let input: ReferenceSitesInput = req.json().await?;
    let mut result = Vec::new();
    for item in input.items.iter().take(200) {
        let name = trimmed_slice(&item.name, 120);
        let summary = trimmed_slice(&item.summary, 1000);
        let raw_url = String::from(trimmed_slice(&item.url, 400));
        let url = web_sys::Url::new(&raw_url)
            .ok()
            .filter(|u| u.protocol() == "http:" || u.protocol() == "https:")
            .map(|u| u.href())
            .unwrap_or_default();
        if name.length() == 0 && summary.length() == 0 && url.is_empty() {
            continue;
        }
        let mut federations: Vec<&str> = Vec::new();
        for value in &item.federations {
            let value = String::from(
                js_sys::JsString::from(value.as_str())
                    .trim()
                    .to_lower_case(),
            );
            let canonical = match value.as_str() {
                "africa" => "Africa",
                "arab" => "Arab",
                "asia-pacific" | "asia pacific" => "Asia-Pacific",
                "european" | "europe" => "European",
                "interamerican" | "inter-american" => "Interamerican",
                "wosm" => "WOSM",
                "unclassified" | "미분류" => "Unclassified",
                _ => "",
            };
            if !canonical.is_empty() && !federations.contains(&canonical) {
                federations.push(canonical);
            }
        }
        result.push(json!({"name":text_units(&name),"url":url,"summary":text_units(&summary),"related_federations":federations}));
    }
    Response::from_json(&json!({"items":result}))
}

#[derive(Deserialize)]
struct CalendarTagsInput {
    items: Vec<String>,
}
pub async fn calendar_tags_normalize(req: &mut Request) -> Result<Response> {
    let input: CalendarTagsInput = req.json().await?;
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();
    for value in input.items {
        let text = js_sys::JsString::from(value.as_str()).trim();
        if text.length() == 0 || text.length() > 40 {
            continue;
        }
        let text = String::from(text);
        if seen.insert(text.clone()) {
            items.push(text);
        }
        if items.len() >= 50 {
            break;
        }
    }
    Response::from_json(&json!({"items":items}))
}

#[derive(Deserialize)]
struct TagSettingsInput {
    groups: Vec<Vec<String>>,
}
pub async fn tag_settings_normalize(req: &mut Request) -> Result<Response> {
    let input: TagSettingsInput = req.json().await?;
    if input.groups.len() != 5 {
        return Err(Error::RustError("Invalid tag settings groups".into()));
    }
    let mut groups = Vec::new();
    for values in input.groups {
        let mut seen = std::collections::HashSet::new();
        let mut tags = Vec::new();
        for value in values {
            let text = String::from(js_sys::JsString::from(value.as_str()).trim());
            if !text.is_empty() && seen.insert(text.clone()) {
                tags.push(text);
            }
            if tags.len() >= 100 {
                break;
            }
        }
        groups.push(tags);
    }
    Response::from_json(&json!({"groups":groups}))
}

#[derive(Deserialize)]
struct TagPlanInput {
    current: Vec<Vec<String>>,
    next: Vec<Vec<String>>,
    category: Option<String>,
}
fn unique_tag_groups(groups: &[Vec<String>]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for value in groups.iter().flatten() {
        if seen.insert(value.clone()) {
            result.push(value.clone());
        }
    }
    result
}
pub async fn tag_settings_plan(req: &mut Request) -> Result<Response> {
    let input: TagPlanInput = req.json().await?;
    if input.current.len() != 5 || input.next.len() != 5 {
        return Err(Error::RustError("Invalid tag plan groups".into()));
    }
    let category = match input.category.as_deref() {
        Some("apr") => 2,
        Some("wosm" | "worm") => 3,
        Some("people") => 4,
        _ => 1,
    };
    let items = unique_tag_groups(&[input.next[0].clone(), input.next[category].clone()]);
    let next: std::collections::HashSet<String> =
        unique_tag_groups(&input.next).into_iter().collect();
    let removed: Vec<String> = unique_tag_groups(&input.current)
        .into_iter()
        .filter(|tag| !next.contains(tag))
        .collect();
    Response::from_json(&json!({"items":items,"removed":removed}))
}

#[derive(Deserialize)]
struct BoardGapInput {
    value: String,
}
pub async fn board_gap_normalize(req: &mut Request) -> Result<Response> {
    let input: BoardGapInput = req.json().await?;
    let parsed = js_sys::parse_int(&input.value, 10);
    let gap = if parsed.is_finite() {
        parsed.clamp(5.0, 40.0)
    } else {
        6.0
    };
    Response::from_json(&json!({"gap":gap}))
}

#[derive(Deserialize)]
struct FeatureDefinitionInput {
    text: String,
}
pub async fn feature_definition_normalize(req: &mut Request) -> Result<Response> {
    let input: FeatureDefinitionInput = req.json().await?;
    let mut text = input.text.replace("\r\n", "\n");
    if !text.contains('\n') && text.contains("\\n") {
        text = text
            .replace("\\r\\n", "\n")
            .replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace("\\\"", "\"");
    }
    let trimmed = String::from(js_sys::JsString::from(text.as_str()).trim());
    let legacy = trimmed.is_empty()
        || trimmed.starts_with("# Feature Definition")
        || (trimmed.contains("## Calendar") && trimmed.contains("## Development Rule"))
        || !trimmed.contains("## 0. 문서 목적과 사용 순서");
    Response::from_json(&json!({"text":text,"legacy":legacy}))
}
