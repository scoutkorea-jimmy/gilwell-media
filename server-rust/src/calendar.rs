use crate::post_routes::post_bindings;
use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

const COLUMNS: &str = "id, title, title_original, event_category, event_tags, description, country_name, location_name, location_address, latitude, longitude, related_post_id, related_posts_json, start_at, start_has_time, end_at, end_has_time, link_url, target_groups, created_at, updated_at";

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64() != Some(0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}

fn defaulted(row: &Value, key: &str, default: Value) -> Value {
    row.get(key)
        .filter(|value| truthy(value))
        .cloned()
        .unwrap_or(default)
}

#[allow(deprecated)]
fn numeric(value: &Value) -> Value {
    let number = match value {
        Value::Null => 0.0,
        Value::Bool(v) => {
            if *v {
                1.0
            } else {
                0.0
            }
        }
        v => worker::js_sys::Number::new(&JsValue::from_str(&crate::post_routes::js_string(v)))
            .value_of(),
    };
    json!(number)
}

fn input_string(value: Option<&Value>) -> String {
    value
        .filter(|v| truthy(v))
        .map(crate::post_routes::js_string)
        .unwrap_or_default()
}

fn date_only(raw: &str) -> Option<String> {
    let normalized = crate::trim(raw).replace(['.', '/'], "-");
    let matches =
        worker::js_sys::RegExp::new(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", "").exec(&normalized)?;
    let year = String::from(matches.get(1)).parse::<u32>().ok()?;
    let month = String::from(matches.get(2)).parse::<u32>().ok()?;
    let day = String::from(matches.get(3)).parse::<u32>().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some(format!("{year:04}-{month:02}-{day:02}"))
}

fn time_only(raw: &str) -> Option<String> {
    let matches = worker::js_sys::RegExp::new(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", "")
        .exec(crate::trim(raw))?;
    let hour = String::from(matches.get(1)).parse::<u32>().ok()?;
    let minute = String::from(matches.get(2)).parse::<u32>().ok()?;
    let second = matches
        .get(3)
        .as_string()
        .unwrap_or_else(|| "0".into())
        .parse::<u32>()
        .ok()?;
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    Some(format!("{hour:02}:{minute:02}:{second:02}"))
}

fn calendar_datetime(
    body: &Value,
    direct_key: &str,
    date_key: &str,
    time_key: &str,
) -> (String, bool) {
    let raw = input_string(body.get(direct_key));
    let direct = crate::trim(&raw)
        .replacen('T', " ", 1)
        .replace(['.', '/'], "-");
    if let Some(date) = date_only(&direct) {
        return (format!("{date} 00:00:00"), false);
    }
    if let Some(parts) =
        worker::js_sys::RegExp::new(r"^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$", "").exec(&direct)
        && let (Some(date), Some(time)) = (
            date_only(&String::from(parts.get(1))),
            time_only(&String::from(parts.get(2))),
        )
    {
        let has_time = time != "00:00:00";
        return (format!("{date} {time}"), has_time);
    }
    if let Some(date) = date_only(&input_string(body.get(date_key))) {
        let time = time_only(&input_string(body.get(time_key)));
        let has_time = time.is_some();
        return (
            format!("{date} {}", time.unwrap_or_else(|| "00:00:00".into())),
            has_time,
        );
    }
    (String::new(), false)
}

pub async fn dates(req: &mut Request) -> Result<Response> {
    let body: Value = req.json().await?;
    let (start, start_time) = calendar_datetime(&body, "start_at", "start_date", "start_time");
    let (end, end_time) = calendar_datetime(&body, "end_at", "end_date", "end_time");
    Response::from_json(
        &json!({"start":{"value":start,"hasTime":start_time},"end":{"value":end,"hasTime":end_time}}),
    )
}

fn input_text(body: &Value, key: &str, limit: u32) -> String {
    let raw = input_string(body.get(key));
    String::from(worker::js_sys::JsString::from(crate::trim(&raw)).slice(0, limit))
}

fn serialized(value: &Value) -> Result<String> {
    serde_json::to_string(value).map_err(|error| Error::RustError(error.to_string()))
}

pub async fn normalize_input(req: &mut Request) -> Result<Response> {
    let body: Value = req.json().await?;
    let title = input_text(&body, "title", 200);
    let original = input_text(&body, "title_original", 200);
    let (start, start_time) = calendar_datetime(&body, "start_at", "start_date", "start_time");
    let (end, end_time) = calendar_datetime(&body, "end_at", "end_date", "end_time");
    if title.is_empty() && original.is_empty() {
        return Response::from_json(
            &json!({"error":"행사명(국문) 또는 원문 제목을 입력해주세요."}),
        );
    }
    if start.is_empty() {
        return Response::from_json(&json!({"error":"행사 시작 일을 입력해주세요."}));
    }
    if !end.is_empty() && end < start {
        return Response::from_json(&json!({"error":"종료 일시는 시작 일시보다 늦어야 합니다."}));
    }
    let category_raw = input_string(body.get("event_category"));
    let category = crate::trim(&category_raw).to_uppercase();
    let category =
        if ["KOR", "APR", "EUR", "AFR", "ARB", "IAR", "WOSM"].contains(&category.as_str()) {
            category
        } else {
            "WOSM".into()
        };
    let tag_source = match body.get("event_tags") {
        Some(Value::Array(items)) => items.clone(),
        value => input_string(value)
            .split(',')
            .map(|tag| json!(tag))
            .collect(),
    };
    let related_source = body
        .get("related_posts")
        .filter(|v| truthy(v))
        .or_else(|| body.get("related_post_ids"))
        .cloned()
        .unwrap_or(Value::Null);
    let surrogate = json!({"event_tags":serialized(&json!(tag_source))?,"target_groups":serialized(&body.get("target_groups").cloned().unwrap_or(Value::Null))?,"related_posts_json":serialized(&related_source)?});
    let normalized = calendar_row(surrogate);
    let related = normalized["related_posts"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut related_json = Vec::new();
    for item in related {
        let id = item["id"].as_f64().unwrap_or_default();
        let id_text = String::from(
            worker::js_sys::JSON::stringify(&JsValue::from_f64(id))
                .map_err(|_| Error::RustError("Invalid related id".into()))?,
        );
        related_json.push(format!(
            "{{\"id\":{},\"title\":{},\"category\":{}}}",
            id_text,
            serialized(&item["title"])?,
            serialized(&item["category"])?
        ));
    }
    let related_id = body
        .get("related_post_id")
        .map(|v| worker::js_sys::parse_int(&crate::post_routes::js_string(v), 10))
        .filter(|v| v.is_finite() && *v > 0.0);
    let coord = |key, min: f64, max: f64| -> Value {
        let value = body.get(key).unwrap_or(&Value::Null);
        if value.is_null() || value == "" {
            return Value::Null;
        }
        let number = numeric(value).as_f64().unwrap_or(f64::NAN);
        if !number.is_finite() || number < min || number > max {
            return Value::Null;
        }
        json!(worker::js_sys::Math::round(number * 1_000_000.0) / 1_000_000.0)
    };
    let nullable = |key, limit| {
        let s = input_text(&body, key, limit);
        if s.is_empty() { Value::Null } else { json!(s) }
    };
    let raw_url = input_string(body.get("link_url"));
    let link = Url::parse(crate::trim(&raw_url))
        .ok()
        .filter(|url| url.scheme() == "http" || url.scheme() == "https")
        .map(|url| String::from(worker::js_sys::JsString::from(url.to_string()).slice(0, 500)));
    let normalized_title = if title.is_empty() {
        original.clone()
    } else {
        title.clone()
    };
    let normalized_original = if !title.is_empty() && !original.is_empty() {
        json!(original)
    } else {
        Value::Null
    };
    let values = json!([
        normalized_title,
        normalized_original,
        category,
        serialized(&normalized["event_tags"])?,
        input_text(&body, "description", 2000),
        nullable("country_name", 120),
        nullable("location_name", 120),
        nullable("location_address", 300),
        coord("latitude", -90.0, 90.0),
        coord("longitude", -180.0, 180.0),
        related_id,
        format!("[{}]", related_json.join(",")),
        start,
        if start_time { 1 } else { 0 },
        if end.is_empty() {
            None
        } else {
            Some(end.clone())
        },
        if !end.is_empty() && end_time { 1 } else { 0 },
        link,
        serialized(&normalized["target_groups"])?
    ]);
    Response::from_json(&json!({"values":values}))
}

fn calendar_row(row: Value) -> Value {
    let empty = Value::String(String::new());
    let parsed = |key| {
        row.get(key)
            .filter(|value| truthy(value))
            .map(crate::post_routes::js_string)
            .and_then(|value| serde_json::from_str::<Value>(&value).ok())
    };
    let raw_tags = row
        .get("event_tags")
        .filter(|value| truthy(value))
        .map(crate::post_routes::js_string)
        .unwrap_or_default();
    let tags: Vec<Value> = match serde_json::from_str::<Value>(&raw_tags) {
        Ok(Value::Array(items)) => items,
        Ok(_) => Vec::new(),
        Err(_) => raw_tags.split(',').map(|s| json!(s)).collect(),
    };
    let mut seen = std::collections::HashSet::new();
    let tags: Vec<Value> = tags
        .into_iter()
        .filter_map(|item| {
            let raw = if truthy(&item) {
                crate::post_routes::js_string(&item)
            } else {
                String::new()
            };
            let tag = crate::trim(&raw);
            if tag.is_empty() || tag.encode_utf16().count() > 40 || !seen.insert(tag.to_owned()) {
                None
            } else {
                Some(json!(tag))
            }
        })
        .take(20)
        .collect();
    let valid_groups = [
        "비버",
        "컵",
        "스카우트",
        "벤처",
        "로버",
        "지도자",
        "범스카우트",
        "훈련교수회",
    ];
    let mut group_seen = std::collections::HashSet::new();
    let groups: Vec<Value> = parsed("target_groups")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|value| {
            let raw = if truthy(value) {
                crate::post_routes::js_string(value)
            } else {
                String::new()
            };
            let group = crate::trim(&raw);
            valid_groups.contains(&group) && group_seen.insert(group.to_owned())
        })
        .collect();
    let mut ids = std::collections::HashSet::new();
    let related: Vec<Value> = parsed("related_posts_json")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            if !item.is_object() && !item.is_array() {
                return None;
            }
            let id = item
                .get("id")
                .map(|v| worker::js_sys::parse_int(&crate::post_routes::js_string(v), 10))
                .unwrap_or(f64::NAN);
            if !id.is_finite() || id <= 0.0 || !ids.insert(id.to_bits()) {
                return None;
            }
            let text = |key, limit| {
                let value = defaulted(&item, key, empty.clone());
                let raw = crate::post_routes::js_string(&value);
                String::from(worker::js_sys::JsString::from(crate::trim(&raw)).slice(0, limit))
            };
            Some(json!({"id":id,"title":text("title",200),"category":text("category",40)}))
        })
        .take(10)
        .collect();
    let related = if related.is_empty() && row.get("related_post_id").is_some_and(truthy) {
        vec![
            json!({"id":numeric(&row["related_post_id"]),"title":defaulted(&row,"related_post_title",empty.clone()),"category":defaulted(&row,"related_post_category",empty.clone())}),
        ]
    } else {
        related
    };
    let number_or_null = |key| {
        row.get(key)
            .filter(|value| !value.is_null())
            .map(numeric)
            .unwrap_or(Value::Null)
    };
    let flag = |key| numeric(&defaulted(&row, key, json!(0))).as_f64() == Some(1.0);
    json!({"id":defaulted(&row,"id",json!(0)),"title":defaulted(&row,"title",empty.clone()),"title_original":defaulted(&row,"title_original",empty.clone()),"event_category":defaulted(&row,"event_category",json!("WOSM")),"event_tags":tags,"description":defaulted(&row,"description",empty.clone()),"country_name":defaulted(&row,"country_name",empty.clone()),"location_name":defaulted(&row,"location_name",empty.clone()),"location_address":defaulted(&row,"location_address",empty.clone()),"latitude":number_or_null("latitude"),"longitude":number_or_null("longitude"),"related_post_id":number_or_null("related_post_id"),"related_post_title":defaulted(&row,"related_post_title",empty.clone()),"related_post_category":defaulted(&row,"related_post_category",empty.clone()),"related_posts":related,"start_at":defaulted(&row,"start_at",empty.clone()),"start_has_time":flag("start_has_time"),"end_at":defaulted(&row,"end_at",empty.clone()),"end_has_time":flag("end_has_time"),"link_url":defaulted(&row,"link_url",empty.clone()),"target_groups":groups,"created_at":defaulted(&row,"created_at",empty.clone()),"updated_at":defaulted(&row,"updated_at",empty)})
}

pub async fn ensure(env: &Env) -> Result<Response> {
    let db = env.d1("DB")?;
    db.prepare("CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_original TEXT, event_category TEXT NOT NULL DEFAULT 'WOSM', event_tags TEXT, description TEXT, country_name TEXT, location_name TEXT, location_address TEXT, latitude REAL, longitude REAL, related_post_id INTEGER, related_posts_json TEXT, start_at TEXT NOT NULL, start_has_time INTEGER NOT NULL DEFAULT 0, end_at TEXT, end_has_time INTEGER NOT NULL DEFAULT 0, link_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run().await?;
    for (name, sql_type) in [
        ("title_original", "TEXT"),
        ("event_category", "TEXT NOT NULL DEFAULT 'WOSM'"),
        ("event_tags", "TEXT"),
        ("country_name", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("related_post_id", "INTEGER"),
        ("related_posts_json", "TEXT"),
        ("start_has_time", "INTEGER DEFAULT 0"),
        ("end_has_time", "INTEGER DEFAULT 0"),
        ("target_groups", "TEXT"),
    ] {
        let columns = db
            .prepare("PRAGMA table_info(calendar_events)")
            .all()
            .await?
            .results::<Value>()?;
        if !columns
            .iter()
            .any(|row| row.get("name").and_then(Value::as_str) == Some(name))
        {
            let added = db
                .prepare(format!(
                    "ALTER TABLE calendar_events ADD COLUMN {name} {sql_type}"
                ))
                .run()
                .await;
            if let Err(error) = added {
                let current = db
                    .prepare("PRAGMA table_info(calendar_events)")
                    .all()
                    .await?
                    .results::<Value>()?;
                if !current
                    .iter()
                    .any(|row| row.get("name").and_then(Value::as_str) == Some(name))
                {
                    return Err(error);
                }
            }
        }
    }
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct CalendarWrite {
    values: Vec<Value>,
    id: Option<f64>,
    expected: Option<String>,
}

pub async fn list(env: &Env) -> Result<Response> {
    let rows = env.d1("DB")?.prepare("SELECT c.id, c.title, c.title_original, c.event_category, c.event_tags, c.description, c.country_name, c.location_name, c.location_address, c.latitude, c.longitude, c.related_post_id, c.related_posts_json, p.title AS related_post_title, p.category AS related_post_category, c.start_at, c.start_has_time, c.end_at, c.end_has_time, c.link_url, c.target_groups, c.created_at, c.updated_at FROM calendar_events c LEFT JOIN posts p ON p.id = c.related_post_id ORDER BY c.start_at ASC, c.id ASC").all().await?.results::<Value>()?;
    Response::from_json(&json!({"items":rows.into_iter().map(calendar_row).collect::<Vec<_>>() }))
}

pub async fn write(req: &mut Request, env: &Env, update: bool) -> Result<Response> {
    let input: CalendarWrite = req.json().await?;
    if input.values.len() != 18 {
        return Err(Error::RustError("Invalid calendar values".into()));
    }
    let mut args = post_bindings(&input.values)?;
    let db = env.d1("DB")?;
    let sql = if update {
        let id = input
            .id
            .ok_or_else(|| Error::RustError("Missing calendar id".into()))?;
        let expected = input.expected.unwrap_or_default();
        args.extend([
            JsValue::from_f64(id),
            JsValue::from_str(&expected),
            JsValue::from_str(&expected),
        ]);
        format!(
            "UPDATE calendar_events SET title = ?, title_original = ?, event_category = ?, event_tags = ?, description = ?, country_name = ?, location_name = ?, location_address = ?, latitude = ?, longitude = ?, related_post_id = ?, related_posts_json = ?, start_at = ?, start_has_time = ?, end_at = ?, end_has_time = ?, link_url = ?, target_groups = ?, updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f', updated_at, '+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f', 'now') END WHERE id = ? AND (? = '' OR updated_at = ?) RETURNING {COLUMNS}"
        )
    } else {
        format!(
            "INSERT INTO calendar_events (title, title_original, event_category, event_tags, description, country_name, location_name, location_address, latitude, longitude, related_post_id, related_posts_json, start_at, start_has_time, end_at, end_has_time, link_url, target_groups, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING {COLUMNS}"
        )
    };
    let row = db.prepare(sql).bind(&args)?.first::<Value>(None).await?;
    let exists = if update && row.is_none() {
        db.prepare("SELECT id FROM calendar_events WHERE id = ?")
            .bind(&[JsValue::from_f64(input.id.unwrap_or(0.0))])?
            .first::<Value>(None)
            .await?
            .is_some()
    } else {
        row.is_some()
    };
    Response::from_json(&json!({"row":row.map(calendar_row),"exists":exists}))
}

#[derive(Deserialize)]
struct CalendarId {
    id: f64,
}

pub async fn delete(req: &mut Request, env: &Env) -> Result<Response> {
    let input: CalendarId = req.json().await?;
    env.d1("DB")?
        .prepare("DELETE FROM calendar_events WHERE id = ?")
        .bind(&[JsValue::from_f64(input.id)])?
        .run()
        .await?;
    Response::from_json(&json!({"ok":true}))
}
