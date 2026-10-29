use crate::post_routes::post_bindings;
use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;

#[derive(Deserialize)]
struct Bindings {
    values: Vec<Value>,
}

pub async fn ensure_visit_columns(env: &Env) -> Result<Response> {
    let db = env.d1("DB")?;
    let columns = match db.prepare("PRAGMA table_info(site_visits)").all().await {
        Ok(rows) => rows.results::<Value>().unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    for (name, kind) in [
        ("country_code", "TEXT"),
        ("country_name", "TEXT"),
        ("city_name", "TEXT"),
        ("region_code", "TEXT"),
        ("continent_code", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
    ] {
        if columns
            .iter()
            .any(|row| row.get("name").and_then(Value::as_str) == Some(name))
        {
            continue;
        }
        if let Err(error) = db
            .prepare(format!("ALTER TABLE site_visits ADD COLUMN {name} {kind}"))
            .run()
            .await
        {
            let current = db
                .prepare("PRAGMA table_info(site_visits)")
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
    let _ = db
        .prepare(
            "CREATE INDEX IF NOT EXISTS idx_site_visits_country_code ON site_visits(country_code)",
        )
        .run()
        .await;
    let _ = db
        .prepare("CREATE INDEX IF NOT EXISTS idx_site_visits_city_name ON site_visits(city_name)")
        .run()
        .await;
    Response::from_json(&json!({"ok":true}))
}

pub async fn visit(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Bindings = req.json().await?;
    if input.values.len() != 15 {
        return Err(Error::RustError("Invalid visit values".into()));
    }
    let args = post_bindings(&input.values)?;
    let result = env.d1("DB")?.prepare("INSERT OR IGNORE INTO site_visits (viewer_key, path, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, visited_bucket, country_code, country_name, city_name, region_code, continent_code, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(&args)?.run().await?;
    let recorded = result.meta()?.and_then(|m| m.changes).unwrap_or(0) > 0;
    Response::from_json(&json!({"recorded":recorded}))
}

#[derive(Deserialize)]
struct VisitInput {
    path: Value,
    #[serde(default)]
    path_utf16: Option<Vec<u16>>,
    values: Vec<Value>,
    #[serde(default)]
    urls: Option<VisitUrls>,
    #[serde(default)]
    geo: Option<VisitGeo>,
}

#[derive(Deserialize)]
struct VisitUrls {
    referrer: Option<String>,
    current_url: Option<String>,
    request_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisitGeo {
    country: Value,
    city: Value,
    region_code: Value,
    continent: Value,
    latitude: Value,
    longitude: Value,
}

fn geo_text(value: &Value, max: u32, upper: bool) -> Value {
    let raw = if value.is_null() || *value == json!(false) || value.as_f64() == Some(0.0) {
        String::new()
    } else {
        crate::post_routes::js_string(value)
    };
    let value = js_sys::JsString::from(raw).trim();
    let value = if upper { value.to_upper_case() } else { value };
    if value.length() == 0 {
        return Value::Null;
    }
    let cut = value.slice(0, max);
    let length = cut.length();
    if length > 0 && (0xd800..=0xdbff).contains(&(cut.char_code_at(length - 1) as u32)) {
        return json!({"utf16":(0..length).map(|i|cut.char_code_at(i) as u16).collect::<Vec<_>>()});
    }
    json!(String::from(cut))
}

#[allow(deprecated)]
fn geo_coordinate(value: &Value, min: f64, max: f64) -> Value {
    if value.is_null() || value.as_str() == Some("") {
        return Value::Null;
    }
    let number = match value {
        Value::Bool(v) => {
            if *v {
                1.0
            } else {
                0.0
            }
        }
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => js_sys::Number::new(&wasm_bindgen::JsValue::from_str(s)).value_of(),
        _ => f64::NAN,
    };
    if !number.is_finite() || number < min || number > max {
        return Value::Null;
    }
    let rounded = js_sys::Math::round(number * 1_000_000.0) / 1_000_000.0;
    json!(rounded)
}

fn visit_url(raw: Option<&str>) -> Option<web_sys::Url> {
    let text = crate::trim(raw?);
    if text.is_empty() {
        return None;
    }
    let parsed = web_sys::Url::new(text).ok()?;
    if matches!(parsed.protocol().as_str(), "http:" | "https:") {
        Some(parsed)
    } else {
        None
    }
}

fn visit_utm(url: Option<&web_sys::Url>, key: &str) -> Value {
    let Some(value) = url.and_then(|url| url.search_params().get(key)) else {
        return Value::Null;
    };
    let normalized = js_sys::JsString::from(value).trim().to_lower_case();
    if normalized.length() == 0 {
        return Value::Null;
    }
    let cut = normalized.slice(0, 80);
    let length = cut.length();
    if length > 0 && (0xd800..=0xdbff).contains(&(cut.char_code_at(length - 1) as u32)) {
        return json!({"utf16":(0..length).map(|i|cut.char_code_at(i) as u16).collect::<Vec<_>>()});
    }
    json!(String::from(cut))
}

pub async fn record_visit(req: &mut Request, env: &Env) -> Result<Response> {
    let mut input: VisitInput = req.json().await?;
    if input.values.len() != 15 {
        return Err(Error::RustError("Invalid visit values".into()));
    }
    let raw = if let Some(units) = &input.path_utf16 {
        js_sys::JsString::from_char_code(units)
    } else {
        let raw = if input.path.is_null()
            || input.path == json!(false)
            || input.path.as_f64() == Some(0.0)
        {
            String::new()
        } else {
            crate::post_routes::js_string(&input.path)
        };
        js_sys::JsString::from(raw)
    };
    let path = raw.trim();
    let path_text = String::from(path.clone());
    if path.length() == 0 || !path_text.starts_with('/') || path.length() > 260 {
        return Response::from_json(&json!({"recorded":false}));
    }
    let path = path.replace_by_pattern(&js_sys::RegExp::new(r"[?#].*$", ""), "");
    let path_text = String::from(path.clone());
    if path_text.is_empty()
        || path_text.starts_with("/api/")
        || path_text == "/admin"
        || path_text == "/admin.html"
    {
        return Response::from_json(&json!({"recorded":false}));
    }
    if let Some(urls) = &input.urls {
        let referrer = visit_url(urls.referrer.as_deref());
        let current = visit_url(urls.current_url.as_deref());
        let host = match &referrer {
            None => "direct".to_string(),
            Some(reference) => match web_sys::Url::new(&urls.request_url) {
                Ok(request) if reference.host() == request.host() => "internal".to_string(),
                Ok(_) => reference.host().to_lowercase(),
                Err(_) => "unknown".to_string(),
            },
        };
        let source = visit_utm(current.as_ref(), "utm_source");
        let medium = visit_utm(current.as_ref(), "utm_medium");
        let campaign = visit_utm(current.as_ref(), "utm_campaign");
        input.values[2] = json!(host);
        input.values[3] = json!(referrer.map(|url| url.href()));
        input.values[4] = source;
        input.values[5] = medium;
        input.values[6] = campaign;
    }
    if let Some(geo) = &input.geo {
        static LABELS: std::sync::OnceLock<std::collections::HashMap<String, String>> =
            std::sync::OnceLock::new();
        let country = geo_text(&geo.country, 12, true);
        let country_name = country.as_str().map(|code| {
            LABELS
                .get_or_init(|| {
                    serde_json::from_str(include_str!("country_labels.json"))
                        .expect("generated country labels")
                })
                .get(code)
                .cloned()
                .unwrap_or_else(|| code.to_owned())
        });
        input.values[8] = country.clone();
        input.values[9] = if country.is_object() {
            country
        } else {
            json!(country_name)
        };
        input.values[10] = geo_text(&geo.city, 120, false);
        input.values[11] = geo_text(&geo.region_code, 32, true);
        input.values[12] = geo_text(&geo.continent, 12, true);
        input.values[13] = geo_coordinate(&geo.latitude, -90.0, 90.0);
        input.values[14] = geo_coordinate(&geo.longitude, -180.0, 180.0);
    }
    input.values[1] = Value::Null;
    ensure_visit_columns(env).await?;
    let mut bindings = input.values.clone();
    let mut encoded = Vec::new();
    for (index, binding) in bindings.iter_mut().enumerate().take(13).skip(4) {
        if let Some(units) = binding.get("utf16").and_then(Value::as_array) {
            let units: Vec<u16> = units
                .iter()
                .map(|v| {
                    v.as_u64()
                        .filter(|v| *v <= 65535)
                        .map(|v| v as u16)
                        .ok_or_else(|| Error::RustError("Invalid UTF-16 binding".into()))
                })
                .collect::<Result<_>>()?;
            if units.len() > 120 {
                return Err(Error::RustError("Invalid UTF-16 binding".into()));
            }
            encoded.push((index, js_sys::JsString::from_char_code(&units)));
            *binding = Value::Null;
        }
    }
    let mut args = post_bindings(&bindings)?;
    args[1] = path.into();
    for (index, value) in encoded {
        args[index] = value.into();
    }
    let result = env.d1("DB")?.prepare("INSERT OR IGNORE INTO site_visits (viewer_key, path, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, visited_bucket, country_code, country_name, city_name, region_code, continent_code, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(&args)?.run().await?;
    let recorded = result.meta()?.and_then(|m| m.changes).unwrap_or(0) > 0;
    Response::from_json(&json!({"recorded":recorded,"viewer_key":input.values[0]}))
}

pub async fn engagement(req: &mut Request, env: &Env) -> Result<Response> {
    let input: Bindings = req.json().await?;
    if input.values.len() != 4 {
        return Err(Error::RustError("Invalid engagement values".into()));
    }
    let args = post_bindings(&input.values)?;
    env.d1("DB")?.prepare("INSERT INTO post_engagement (post_id, viewer_key, session_key, engaged_seconds) VALUES (?, ?, ?, ?) ON CONFLICT(post_id, session_key) DO UPDATE SET viewer_key = excluded.viewer_key, engaged_seconds = CASE WHEN excluded.engaged_seconds > post_engagement.engaged_seconds THEN excluded.engaged_seconds ELSE post_engagement.engaged_seconds END, updated_at = datetime('now')").bind(&args)?.run().await?;
    Response::from_json(&json!({"ok":true}))
}

#[derive(Deserialize)]
struct EngagementInput {
    payload: Value,
    viewer_key: String,
}

pub async fn record_engagement(req: &mut Request, env: &Env) -> Result<Response> {
    let input: EngagementInput = req.json().await?;
    let value = |key| input.payload.get(key).unwrap_or(&Value::Null);
    let post_id = worker::js_sys::parse_int(&crate::post_routes::js_string(value("post_id")), 10);
    let session_value = value("session_key");
    let session_raw = if session_value.is_null()
        || session_value == &json!(false)
        || session_value.as_f64() == Some(0.0)
    {
        String::new()
    } else {
        crate::post_routes::js_string(session_value)
    };
    let session = crate::trim(&session_raw);
    #[allow(deprecated)]
    let seconds = match value("engaged_seconds") {
        Value::Bool(v) => {
            if *v {
                1.0
            } else {
                0.0
            }
        }
        Value::Null => 0.0,
        v => worker::js_sys::Number::new(&wasm_bindgen::JsValue::from_str(
            &crate::post_routes::js_string(v),
        ))
        .value_of(),
    }
    .floor();
    let seconds = if seconds.is_finite() {
        seconds.clamp(0.0, 43200.0)
    } else {
        0.0
    };
    if !post_id.is_finite()
        || post_id <= 0.0
        || session.is_empty()
        || session.len() > 120
        || !session
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._:-".contains(&c))
        || seconds < 1.0
    {
        return Response::from_json(&json!({"recorded":false,"invalid":true}));
    }
    let values = [
        wasm_bindgen::JsValue::from_f64(post_id),
        input.viewer_key.as_str().into(),
        session.into(),
        wasm_bindgen::JsValue::from_f64(seconds),
    ];
    env.d1("DB")?.prepare("INSERT INTO post_engagement (post_id, viewer_key, session_key, engaged_seconds) VALUES (?, ?, ?, ?) ON CONFLICT(post_id, session_key) DO UPDATE SET viewer_key = excluded.viewer_key, engaged_seconds = CASE WHEN excluded.engaged_seconds > post_engagement.engaged_seconds THEN excluded.engaged_seconds ELSE post_engagement.engaged_seconds END, updated_at = datetime('now')").bind(&values)?.run().await?;
    Response::from_json(
        &json!({"recorded":true,"viewer_key":input.viewer_key,"post_id":post_id,"engaged_seconds":seconds}),
    )
}

#[derive(Deserialize)]
struct SearchRange {
    start: String,
    end: String,
}

pub async fn search_referrers(req: &mut Request, env: &Env) -> Result<Response> {
    let range: SearchRange = req.json().await?;
    let rows = env.d1("DB")?.prepare("SELECT referrer_url, referrer_host, COUNT(*) AS visits FROM site_visits WHERE datetime(visited_at) >= datetime(?, '-9 hours') AND datetime(visited_at) < datetime(?, '-9 hours') AND path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html') GROUP BY referrer_url, referrer_host").bind(&[range.start.into(),range.end.into()])?.all().await?.results::<Value>()?;
    Response::from_json(&json!({"rows":rows}))
}

#[derive(Deserialize)]
struct BaselineRange {
    start: String,
    end: String,
}

pub async fn baseline(req: &mut Request, env: &Env) -> Result<Response> {
    let range: BaselineRange = req.json().await?;
    let row = env.d1("DB")?.prepare("SELECT (SELECT COUNT(DISTINCT viewer_key) FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html') AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?)) AS today_visits, (SELECT COUNT(*) FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html') AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?)) AS today_views, (SELECT COUNT(*) FROM posts) AS total_posts, (SELECT COUNT(*) FROM posts WHERE published = 1) AS published_posts, (SELECT COUNT(DISTINCT viewer_key) FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html')) AS total_visits, (SELECT COUNT(*) FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html')) AS total_views")
        .bind(&[range.start.as_str().into(),range.end.as_str().into(),range.start.into(),range.end.into()])?.first::<Value>(None).await?;
    Response::from_json(&row.unwrap_or_else(|| json!({})))
}

#[derive(Deserialize)]
struct SeriesRange {
    start: String,
    end: String,
    hourly: bool,
    days: u32,
}

pub async fn series(req: &mut Request, env: &Env) -> Result<Response> {
    let range: SeriesRange = req.json().await?;
    let period = if range.hourly {
        "strftime('%H', datetime(visited_at, '+9 hours'))"
    } else {
        "date(visited_at, '+9 hours')"
    };
    let sql = format!(
        "SELECT {period} AS period_key, COUNT(DISTINCT viewer_key) AS visits, COUNT(*) AS views, (SELECT COUNT(DISTINCT viewer_key) FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html') AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?)) AS range_unique FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html') AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?) GROUP BY period_key ORDER BY period_key ASC"
    );
    let rows = env
        .d1("DB")?
        .prepare(sql)
        .bind(&[
            range.start.as_str().into(),
            range.end.as_str().into(),
            range.start.as_str().into(),
            range.end.as_str().into(),
        ])?
        .all()
        .await?
        .results::<Value>()?;
    let unique = rows
        .first()
        .and_then(|row| row.get("range_unique"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let by_period: std::collections::HashMap<&str, &Value> = rows
        .iter()
        .filter_map(|row| {
            row.get("period_key")
                .and_then(Value::as_str)
                .map(|key| (key, row))
        })
        .collect();
    let mut visit_series = Vec::new();
    let mut view_series = Vec::new();
    let mut visit_sum = 0_u64;
    let mut view_sum = 0_u64;
    let start_date = range
        .start
        .get(..10)
        .ok_or_else(|| Error::RustError("Invalid analytics start date".into()))?;
    let date = js_sys::Date::new(&wasm_bindgen::JsValue::from_str(&format!(
        "{start_date}T00:00:00Z"
    )));
    if !date.get_time().is_finite() || range.days == 0 || range.days > 180 {
        return Err(Error::RustError("Invalid analytics series range".into()));
    }
    let count = if range.hourly { 24 } else { range.days };
    for i in 0..count {
        let key = if range.hourly {
            format!("{i:02}")
        } else {
            let day = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(
                date.get_time() + f64::from(i) * 86_400_000.0,
            ));
            String::from(day.to_iso_string())
                .get(..10)
                .ok_or_else(|| Error::RustError("Invalid analytics date".into()))?
                .to_owned()
        };
        let row = by_period.get(key.as_str());
        let visits = row
            .and_then(|row| row.get("visits"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let views = row
            .and_then(|row| row.get("views"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        visit_sum += visits;
        view_sum += views;
        if range.hourly {
            let label = format!("{key}:00");
            visit_series.push(json!({"hour":key,"label":label,"visits":visits}));
            view_series.push(json!({"hour":key,"label":label,"views":views}));
        } else {
            visit_series.push(json!({"date":key,"label":key,"visits":visits}));
            view_series.push(json!({"date":key,"label":key,"views":views}));
        }
    }
    let average = |sum: u64| ((sum as f64 / f64::from(range.days) * 10.0) + 0.5).floor() / 10.0;
    Response::from_json(
        &json!({"visit_series":visit_series,"view_series":view_series,"unique":unique,"range_views":view_sum,"average_daily_visits":average(visit_sum),"average_daily_pageviews":average(view_sum)}),
    )
}

#[derive(Deserialize)]
struct HeatmapRange {
    start: String,
    end: String,
    label: String,
}

pub async fn heatmaps(req: &mut Request, env: &Env) -> Result<Response> {
    let range: HeatmapRange = req.json().await?;
    let db = env.d1("DB")?;
    let visits = db.prepare("SELECT CAST(strftime('%w', datetime(visited_at, '+9 hours')) AS INTEGER) AS weekday, strftime('%H', datetime(visited_at, '+9 hours')) AS visit_hour, COUNT(DISTINCT viewer_key) AS visits, COUNT(*) AS pageviews FROM site_visits WHERE path NOT LIKE '/api/%' AND path NOT IN ('/admin','/admin.html') AND datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?) GROUP BY weekday, visit_hour ORDER BY weekday ASC, visit_hour ASC")
        .bind(&[range.start.as_str().into(),range.end.as_str().into()])?.all().await?.results::<Value>()?;
    let published = "CASE WHEN p.publish_at IS NOT NULL AND trim(p.publish_at) <> '' THEN CASE WHEN instr(p.publish_at, 'Z') > 0 OR instr(substr(p.publish_at, 11), '+') > 0 THEN datetime(replace(p.publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(p.publish_at, 'T', ' ')) END ELSE datetime(replace(p.created_at, 'T', ' '), '+9 hours') END";
    let sql = format!(
        "SELECT CAST(strftime('%w', ({published})) AS INTEGER) AS weekday, strftime('%H', ({published})) AS publish_hour, COUNT(*) AS publish_count FROM posts p WHERE p.published = 1 AND ({published}) >= datetime(?) AND ({published}) < datetime(?) GROUP BY weekday, publish_hour ORDER BY weekday ASC, publish_hour ASC"
    );
    let posts = db
        .prepare(sql)
        .bind(&[range.start.into(), range.end.into()])?
        .all()
        .await?
        .results::<Value>()?;
    Response::from_json(&heatmap(&visits, &posts, &range.label))
}

fn heatmap(visits: &[Value], posts: &[Value], label: &str) -> Value {
    use std::collections::HashMap;
    let key = |row: &Value, hour: &str| {
        let weekday = score_number(row.get("weekday"));
        let raw = row
            .get(hour)
            .map(crate::post_routes::js_string)
            .unwrap_or_default();
        format!("{}-{:0>2}", weekday, raw)
    };
    let mut visit_rows = HashMap::new();
    let mut post_rows = HashMap::new();
    for row in visits {
        visit_rows.insert(key(row, "visit_hour"), row);
    }
    for row in posts {
        post_rows.insert(key(row, "publish_hour"), row);
    }
    let days = [
        (1, "월"),
        (2, "화"),
        (3, "수"),
        (4, "목"),
        (5, "금"),
        (6, "토"),
        (0, "일"),
    ];
    let mut cells = Vec::with_capacity(168);
    let mut max_visits: f64 = 0.0;
    let mut max_posts: f64 = 0.0;
    for (day, name) in days {
        for hour in 0..24 {
            let hour = format!("{hour:02}");
            let cell_key = format!("{day}-{hour}");
            let visit = visit_rows.get(&cell_key);
            let post = post_rows.get(&cell_key);
            let count = score_number(visit.and_then(|row| row.get("visits")));
            let views = score_number(visit.and_then(|row| row.get("pageviews")));
            let published = score_number(post.and_then(|row| row.get("publish_count")));
            max_visits = max_visits.max(count);
            max_posts = max_posts.max(published);
            cells.push(json!({"weekday":day,"weekday_label":name,"hour":hour,"visits":count,"pageviews":views,"publish_count":published}));
        }
    }
    let fixed = |ratio: f64| {
        #[allow(deprecated)]
        let number = js_sys::Number::new(&wasm_bindgen::JsValue::from_f64(ratio));
        number
            .to_fixed(4)
            .ok()
            .and_then(|value| String::from(value).parse::<f64>().ok())
            .unwrap_or(0.0)
    };
    for cell in &mut cells {
        let count = score_number(cell.get("visits"));
        let published = score_number(cell.get("publish_count"));
        cell["intensity"] = json!(fixed(if max_visits > 0.0 {
            count / max_visits
        } else {
            0.0
        }));
        cell["publish_intensity"] = json!(fixed(if max_posts > 0.0 {
            published / max_posts
        } else {
            0.0
        }));
    }
    json!({"range_label":label,"max_visits":max_visits,"max_publish_count":max_posts,
        "weekdays":days.into_iter().map(|(key,label)|json!({"key":key,"label":label})).collect::<Vec<_>>(),
        "hours":(0..24).map(|hour|format!("{hour:02}")).collect::<Vec<_>>(),"cells":cells})
}

pub async fn path_metrics(req: &mut Request, env: &Env) -> Result<Response> {
    let range: BaselineRange = req.json().await?;
    let db = env.d1("DB")?;
    let average = db.prepare(r#"WITH scoped_visits AS (
                    SELECT id, viewer_key, path, visited_at
                      FROM site_visits
                     WHERE (path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))
                       AND datetime(visited_at, '+9 hours') >= datetime(?)
                       AND datetime(visited_at, '+9 hours') < datetime(?)
                  ),
                  dwell AS (
                    SELECT path,
                           CASE
                             WHEN next_visited_at IS NULL THEN NULL
                             ELSE ROUND(
                               MIN(1800, MAX(5, (julianday(next_visited_at) - julianday(visited_at)) * 86400.0)),
                               1
                             )
                           END AS dwell_seconds
                      FROM (
                        SELECT path,
                               visited_at,
                               LEAD(visited_at) OVER (PARTITION BY viewer_key ORDER BY datetime(visited_at), id) AS next_visited_at
                          FROM scoped_visits
                      )
                  )
                  SELECT ROUND(AVG(dwell_seconds), 1) AS count
                    FROM dwell"#).bind(&[range.start.as_str().into(),range.end.as_str().into()])?.first::<Value>(None).await?;
    let paths = db.prepare(r#"WITH scoped_visits AS (
         SELECT id, viewer_key, path, visited_at
           FROM site_visits
          WHERE (path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
       ),
       path_dwell AS (
         SELECT path,
                ROUND(AVG(
                  CASE
                    WHEN next_visited_at IS NULL THEN NULL
                    ELSE MIN(1800, MAX(5, (julianday(next_visited_at) - julianday(visited_at)) * 86400.0))
                  END
                ), 1) AS avg_dwell_seconds
           FROM (
             SELECT path,
                    visited_at,
                    LEAD(visited_at) OVER (PARTITION BY viewer_key ORDER BY datetime(visited_at), id) AS next_visited_at
               FROM scoped_visits
           )
          GROUP BY path
       )
       SELECT sv.path AS path,
              COALESCE(p.title, CASE WHEN sv.path IN ('/dreampath', '/dreampath/', '/dreampath.html') THEN 'Dreampath' ELSE '' END) AS title,
              COUNT(*) AS pageviews,
              COUNT(DISTINCT sv.viewer_key) AS visits,
              COALESCE(pe.avg_dwell_seconds, pd.avg_dwell_seconds, 0) AS avg_dwell_seconds
         FROM scoped_visits sv
         LEFT JOIN posts p ON sv.path = '/post/' || p.id
         LEFT JOIN (
           SELECT post_id, ROUND(AVG(engaged_seconds), 1) AS avg_dwell_seconds
             FROM post_engagement
            WHERE datetime(updated_at, '+9 hours') >= datetime(?)
              AND datetime(updated_at, '+9 hours') < datetime(?)
            GROUP BY post_id
         ) pe ON p.id = pe.post_id
         LEFT JOIN path_dwell pd ON pd.path = sv.path
        GROUP BY sv.path, p.title
        ORDER BY pageviews DESC, visits DESC, sv.path DESC
        LIMIT 10"#).bind(&[range.start.as_str().into(),range.end.as_str().into(),range.start.into(),range.end.into()])?.all().await?.results::<Value>()?;
    Response::from_json(&json!({"average":average,"paths":paths}))
}

#[derive(Deserialize)]
struct DetailRange {
    kind: String,
    start: String,
    end: String,
}

pub async fn detail(req: &mut Request, env: &Env) -> Result<Response> {
    let range: DetailRange = req.json().await?;
    let (sql, repeated, single) = match range.kind.as_str() {
        "articles" => (
            r#"SELECT p.id AS post_id,
              '/post/' || p.id AS path,
              p.title AS title,
              COUNT(*) AS pageviews,
              COUNT(DISTINCT sv.viewer_key) AS visits,
              COALESCE(pe.avg_dwell_seconds, 0) AS avg_dwell_seconds
         FROM site_visits sv
         JOIN posts p ON sv.path = '/post/' || p.id
         LEFT JOIN (
           SELECT post_id, ROUND(AVG(engaged_seconds), 1) AS avg_dwell_seconds
             FROM post_engagement
            WHERE datetime(updated_at, '+9 hours') >= datetime(?)
              AND datetime(updated_at, '+9 hours') < datetime(?)
            GROUP BY post_id
         ) pe ON p.id = pe.post_id
        WHERE datetime(sv.visited_at, '+9 hours') >= datetime(?)
          AND datetime(sv.visited_at, '+9 hours') < datetime(?)
        GROUP BY p.id, p.title, pe.avg_dwell_seconds
        ORDER BY pageviews DESC, visits DESC, p.id DESC
        LIMIT 10"#,
            true,
            false,
        ),
        "referrers" => (
            r#"SELECT referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, COUNT(*) AS pageviews, COUNT(DISTINCT viewer_key) AS visits
         FROM site_visits
        WHERE datetime(visited_at, '+9 hours') >= datetime(?)
          AND datetime(visited_at, '+9 hours') < datetime(?)
          AND (path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))
        GROUP BY referrer_host, referrer_url, utm_source, utm_medium, utm_campaign
        ORDER BY visits DESC, pageviews DESC, referrer_host ASC
        LIMIT 200"#,
            false,
            false,
        ),
        "popular" => (
            r#"WITH top_post AS (
         SELECT CAST(substr(path, 7) AS INTEGER) AS post_id
          FROM site_visits
          WHERE path LIKE '/post/%'
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
          GROUP BY path
          ORDER BY COUNT(*) DESC, MAX(visited_at) DESC
          LIMIT 1
       )
       SELECT p.title AS title,
              tp.post_id AS post_id,
              ROUND(AVG(pe.engaged_seconds), 1) AS avg_dwell_seconds
         FROM top_post tp
         LEFT JOIN post_engagement pe
           ON pe.post_id = tp.post_id
          AND datetime(pe.updated_at, '+9 hours') >= datetime(?)
          AND datetime(pe.updated_at, '+9 hours') < datetime(?)
         LEFT JOIN posts p ON p.id = tp.post_id"#,
            true,
            true,
        ),
        "tags" => (
            r#"SELECT p.id,
              p.title,
              p.category,
              p.tag,
              p.meta_tags,
              p.published,
              p.created_at,
              p.publish_at,
              COALESCE(v.pageviews, 0) AS pageviews
         FROM posts p
         LEFT JOIN (
           SELECT CAST(substr(path, 7) AS INTEGER) AS post_id,
                  COUNT(*) AS pageviews
             FROM site_visits
            WHERE path LIKE '/post/%'
              AND datetime(visited_at, '+9 hours') >= datetime(?)
              AND datetime(visited_at, '+9 hours') < datetime(?)
            GROUP BY post_id
         ) v ON v.post_id = p.id
        WHERE (p.tag IS NOT NULL OR p.meta_tags IS NOT NULL)
          AND (trim(COALESCE(p.tag, '')) <> '' OR trim(COALESCE(p.meta_tags, '')) <> '')
          AND (CASE WHEN p.publish_at IS NOT NULL AND trim(p.publish_at) <> '' THEN CASE WHEN instr(p.publish_at, 'Z') > 0 OR instr(substr(p.publish_at, 11), '+') > 0 THEN datetime(replace(p.publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(p.publish_at, 'T', ' ')) END ELSE datetime(replace(p.created_at, 'T', ' '), '+9 hours') END) >= datetime(?)
          AND (CASE WHEN p.publish_at IS NOT NULL AND trim(p.publish_at) <> '' THEN CASE WHEN instr(p.publish_at, 'Z') > 0 OR instr(substr(p.publish_at, 11), '+') > 0 THEN datetime(replace(p.publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(p.publish_at, 'T', ' ')) END ELSE datetime(replace(p.created_at, 'T', ' '), '+9 hours') END) < datetime(?)"#,
            true,
            false,
        ),
        _ => return Err(Error::RustError("Invalid analytics detail".into())),
    };
    let mut args: Vec<worker::wasm_bindgen::JsValue> =
        vec![range.start.as_str().into(), range.end.as_str().into()];
    if repeated {
        args.extend([range.start.as_str().into(), range.end.as_str().into()]);
    }
    let statement = env.d1("DB")?.prepare(sql).bind(&args)?;
    if single {
        return Response::from_json(&json!({"row":statement.first::<Value>(None).await?}));
    }
    Response::from_json(&json!({"rows":statement.all().await?.results::<Value>()?}))
}

#[derive(Deserialize)]
struct GeoRange {
    kind: String,
    start: String,
    end: String,
}

pub async fn geo(req: &mut Request, env: &Env) -> Result<Response> {
    let range: GeoRange = req.json().await?;
    let (sql, single) = match range.kind.as_str() {
        "country" => (
            r#"SELECT
            COALESCE(NULLIF(country_code, ''), 'ZZ') AS country_code,
            MAX(COALESCE(NULLIF(country_name, ''), NULLIF(country_code, ''), '국가 미확인')) AS country_name,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT NULLIF(city_name, '')) AS city_count,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN latitude END), 6) AS latitude,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN longitude END), 6) AS longitude,
            MAX(visited_at) AS last_visit_at
           FROM site_visits
          WHERE (path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
          GROUP BY COALESCE(NULLIF(country_code, ''), 'ZZ')
          ORDER BY visits DESC, pageviews DESC, country_name ASC"#,
            false,
        ),
        "city" => (
            r#"SELECT
            COALESCE(NULLIF(country_code, ''), 'ZZ') AS country_code,
            MAX(COALESCE(NULLIF(country_name, ''), NULLIF(country_code, ''), '국가 미확인')) AS country_name,
            COALESCE(NULLIF(city_name, ''), '도시 미확인') AS city_name,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN latitude END), 6) AS latitude,
            ROUND(AVG(CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN longitude END), 6) AS longitude,
            MAX(visited_at) AS last_visit_at
           FROM site_visits
          WHERE (path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)
          GROUP BY COALESCE(NULLIF(country_code, ''), 'ZZ'), COALESCE(NULLIF(city_name, ''), '도시 미확인')
          ORDER BY visits DESC, pageviews DESC, country_name ASC, city_name ASC"#,
            false,
        ),
        "totals" => (
            r#"SELECT
            COUNT(DISTINCT CASE WHEN COALESCE(country_code, '') != '' THEN country_code END) AS country_count,
            COUNT(DISTINCT CASE WHEN COALESCE(city_name, '') != '' THEN COALESCE(NULLIF(country_code, ''), 'ZZ') || '::' || city_name END) AS city_count,
            COUNT(DISTINCT viewer_key) AS visits,
            COUNT(*) AS pageviews,
            COUNT(CASE WHEN COALESCE(country_code, '') = '' THEN 1 END) AS unknown_country_pageviews,
            COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 THEN 1 END) AS missing_coordinate_pageviews
           FROM site_visits
          WHERE (path NOT LIKE '/api/%' AND path NOT IN ('/admin', '/admin.html'))
            AND datetime(visited_at, '+9 hours') >= datetime(?)
            AND datetime(visited_at, '+9 hours') < datetime(?)"#,
            true,
        ),
        _ => return Err(Error::RustError("Invalid geo operation".into())),
    };
    let stmt = env
        .d1("DB")?
        .prepare(sql)
        .bind(&[range.start.into(), range.end.into()])?;
    if single {
        return Response::from_json(&json!({"row":stmt.first::<Value>(None).await?}));
    }
    Response::from_json(&json!({"rows":stmt.all().await?.results::<Value>()?}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarketingRange {
    start: String,
    end: String,
    range: Value,
    path_titles: Value,
}

pub async fn marketing(req: &mut Request, env: &Env) -> Result<Response> {
    let range: MarketingRange = req.json().await?;
    let db = env.d1("DB")?;
    let visits = db.prepare("SELECT viewer_key, path, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign FROM site_visits WHERE datetime(visited_at, '+9 hours') >= datetime(?) AND datetime(visited_at, '+9 hours') < datetime(?) AND path NOT LIKE '/api/%' AND path != '/admin.html' AND path != '/admin' ORDER BY viewer_key ASC, datetime(visited_at, '+9 hours') ASC, id ASC").bind(&[range.start.into(),range.end.into()])?.all().await?.results::<crate::marketing_journey::Visit>()?;
    let posts = db
        .prepare("SELECT '/post/' || id AS path, title FROM posts WHERE published = 1")
        .all()
        .await?
        .results::<Value>()?;
    let (journey, campaigns) = crate::marketing_journey::aggregate(&visits);
    Response::from_json(&crate::marketing_output::build(
        &range.range,
        &journey,
        &posts,
        &campaigns,
        &range.path_titles,
    ))
}

#[derive(Deserialize)]
struct TagQuery {
    start: Option<String>,
    end: Option<String>,
    tag: Option<String>,
    pagination: Option<TagPagination>,
}

#[derive(Deserialize)]
struct TagPagination {
    limit: Option<String>,
    page: Option<String>,
}

#[allow(deprecated)]
pub async fn tag_posts(req: &mut Request, env: &Env) -> Result<Response> {
    let o: TagQuery = req.json().await?;
    let date = "COALESCE(CASE WHEN publish_at IS NOT NULL AND trim(publish_at) <> '' THEN CASE WHEN instr(publish_at, 'Z') > 0 OR instr(substr(publish_at, 11), '+') > 0 THEN datetime(replace(publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(publish_at, 'T', ' ')) END ELSE NULL END, CASE WHEN created_at IS NOT NULL AND trim(created_at) <> '' THEN CASE WHEN instr(created_at, 'Z') > 0 OR instr(substr(created_at, 11), '+') > 0 THEN datetime(replace(created_at, 'T', ' '), '+9 hours') ELSE datetime(replace(created_at, 'T', ' '), '+9 hours') END ELSE NULL END)";
    let mut sql = String::from(
        "SELECT id, category, title, subtitle, tag, meta_tags, special_feature, published, publish_at, created_at, updated_at, views FROM posts WHERE published = 1",
    );
    let mut args: Vec<worker::wasm_bindgen::JsValue> = Vec::new();
    if let (Some(start), Some(end)) = (o.start, o.end) {
        sql.push_str(&format!(
            " AND ({date}) >= datetime(?) AND ({date}) < datetime(?)"
        ));
        args.extend([start.into(), end.into()]);
    }
    if let Some(tag) = &o.tag {
        sql.push_str(" AND instr(COALESCE(meta_tags, ''), ?) > 0");
        args.push(tag.as_str().into());
    }
    sql.push_str(&format!(" ORDER BY ({date}) DESC, id DESC"));
    let stmt = env.d1("DB")?.prepare(sql).bind(&args)?;
    let rows = stmt.all().await?.results::<Value>()?;
    let rows: Vec<Value> = rows
        .into_iter()
        .filter(|row| match &o.tag {
            Some(tag) => row
                .get("meta_tags")
                .and_then(Value::as_str)
                .unwrap_or("")
                .split(',')
                .any(|item| crate::trim(item) == tag),
            None => true,
        })
        .collect();
    if let Some(pagination) = o.pagination {
        let number = |value: Option<&str>, fallback: f64| {
            let n = value
                .map(|v| {
                    worker::js_sys::Number::new(&worker::wasm_bindgen::JsValue::from_str(v))
                        .value_of()
                })
                .unwrap_or(0.0);
            if n.is_nan() || n == 0.0 { fallback } else { n }
        };
        let limit = number(pagination.limit.as_deref(), 20.0).clamp(1.0, 50.0);
        let total = rows.len();
        let total_pages = ((total as f64 / limit).ceil()).max(1.0);
        let page = number(pagination.page.as_deref(), 1.0)
            .floor()
            .clamp(1.0, total_pages);
        let start = ((page - 1.0) * limit) as usize;
        let end = (page * limit) as usize;
        let posts = &rows[start.min(total)..end.min(total)];
        return Response::from_json(
            &json!({"posts":posts,"total":total,"page":page,"limit":limit}),
        );
    }
    Response::from_json(&json!({"posts":rows}))
}

const OPERATIONS_SCHEDULED: &str = "SELECT id, title, category, publish_at FROM posts WHERE published = 1 AND datetime(COALESCE(publish_at, created_at)) > datetime('now') ORDER BY datetime(COALESCE(publish_at, created_at)) ASC LIMIT 6";
const OPERATIONS_DRAFTS: &str = "SELECT id, title, category, updated_at FROM posts WHERE published = 0 ORDER BY datetime(updated_at) DESC, id DESC LIMIT 6";
const OPERATIONS_ERRORS: &str = "SELECT id, channel, type, level, actor, path, message, created_at FROM operational_events WHERE level = 'error' ORDER BY datetime(created_at) DESC, id DESC LIMIT 8";
const OPERATIONS_LOGINS: &str = "SELECT id, channel, type, actor, message, created_at FROM operational_events WHERE type IN ('admin_login_failed', 'dreampath_login_failed', 'admin_login_success', 'dreampath_login_success') ORDER BY datetime(created_at) DESC, id DESC LIMIT 10";

pub async fn operations_core(env: &Env) -> Result<Response> {
    let db = env.d1("DB")?;
    let results = db
        .batch(
            [
                OPERATIONS_SCHEDULED,
                OPERATIONS_DRAFTS,
                OPERATIONS_ERRORS,
                OPERATIONS_LOGINS,
            ]
            .iter()
            .map(|sql| db.prepare(*sql))
            .collect(),
        )
        .await?;
    if results.len() != 4 {
        return Err(Error::RustError("Invalid operations batch".into()));
    }
    Response::from_json(
        &json!({"scheduled":results[0].results::<Value>()?,"drafts":results[1].results::<Value>()?,"errors":results[2].results::<Value>()?,"logins":results[3].results::<Value>()?}),
    )
}

#[derive(Deserialize)]
struct OperationsQuery {
    kind: String,
}

pub async fn operations(req: &mut Request, env: &Env) -> Result<Response> {
    let o: OperationsQuery = req.json().await?;
    let (sql, single) = match o.kind.as_str() {
        "scheduled" => (OPERATIONS_SCHEDULED, false),
        "drafts" => (OPERATIONS_DRAFTS, false),
        "errors" => (OPERATIONS_ERRORS, false),
        "logins" => (OPERATIONS_LOGINS, false),
        "settings" => (
            "SELECT key, saved_at FROM settings_history ORDER BY datetime(saved_at) DESC, id DESC LIMIT 10",
            false,
        ),
        "heartbeat" => (
            "SELECT value FROM settings WHERE key = 'scheduler_last_run'",
            true,
        ),
        _ => return Err(Error::RustError("Invalid operations query".into())),
    };
    let stmt = env.d1("DB")?.prepare(sql);
    if single {
        return Response::from_json(&json!({"row":stmt.first::<Value>(None).await?}));
    }
    Response::from_json(&json!({"rows":stmt.all().await?.results::<Value>()?}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationsAssembly {
    scheduled: Vec<Value>,
    drafts: Vec<Value>,
    errors: Vec<Value>,
    logins: Vec<Value>,
    settings: Vec<Value>,
    deployments: Vec<Value>,
    snapshots: Vec<Value>,
    heartbeat: Value,
}
fn operations_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.0),
        _ => true,
    }
}
fn operations_field(item: &Value, key: &str, fallback: Value) -> Value {
    item.get(key)
        .filter(|v| operations_truthy(v))
        .cloned()
        .unwrap_or(fallback)
}
pub async fn operations_assemble(req: &mut Request) -> Result<Response> {
    let input: OperationsAssembly = req.json().await?;
    let mut snapshots = std::collections::HashMap::<String, Value>::new();
    for row in input.snapshots {
        let id = operations_field(&row, "id", json!(""));
        snapshots.insert(crate::post_routes::js_string(&id), row);
    }
    let deployments:Vec<Value>=input.deployments.iter().map(|row| {
        let id=operations_field(row,"id",json!(""));
        let snapshot=snapshots.get(&crate::post_routes::js_string(&id));
        let version=|key:&str|row.get(key).filter(|v|operations_truthy(v)).cloned().or_else(||snapshot.and_then(|v|v.get(key)).filter(|v|operations_truthy(v)).cloned()).unwrap_or(json!(""));
        json!({"id":id,"environment":operations_field(row,"environment",json!("")),"branch":operations_field(row,"branch",json!("")),"source":operations_field(row,"source",json!("")),"url":operations_field(row,"url",json!("")),"created_on":operations_field(row,"created_on",json!("")),"status":operations_field(row,"latest_stage",json!("")),"version":version("version"),"site_version":version("site_version"),"admin_version":version("admin_version"),"commit_message":operations_field(row,"commit_message",json!(""))})
    }).collect();
    let posts = |rows: &[Value], date: &str| -> Vec<Value> {
        rows.iter()
            .map(|r| {
                let mut out = serde_json::Map::new();
                if let Some(id) = r.get("id") {
                    out.insert("id".into(), id.clone());
                }
                for key in ["title", "category", date] {
                    out.insert(key.into(), operations_field(r, key, json!("")));
                }
                Value::Object(out)
            })
            .collect()
    };
    let events = |rows: &[Value]| -> Vec<Value> {
        rows.iter().map(|r|json!({"id":operations_field(r,"id",json!(0)),"channel":operations_field(r,"channel",json!("")),"type":operations_field(r,"type",json!("")),"level":operations_field(r,"level",json!("info")),"actor":operations_field(r,"actor",json!("")),"path":operations_field(r,"path",json!("")),"message":operations_field(r,"message",json!("")),"created_at":operations_field(r,"created_at",json!(""))})).collect()
    };
    let alerts: Vec<Value> = deployments
        .iter()
        .filter(|item| {
            item.get("status")
                .is_some_and(|status| operations_truthy(status) && status != "success")
        })
        .take(6)
        .cloned()
        .collect();
    let settings:Vec<Value>=input.settings.iter().map(|r|json!({"key":operations_field(r,"key",json!("")),"saved_at":operations_field(r,"saved_at",json!(""))})).collect();
    Response::from_json(
        &json!({"scheduled_posts":posts(&input.scheduled,"publish_at"),"draft_posts":posts(&input.drafts,"updated_at"),"recent_errors":events(&input.errors),"recent_logins":events(&input.logins),"recent_settings":settings,"deployments":deployments.into_iter().take(8).collect::<Vec<_>>(),"deploy_alerts":alerts,"scheduler_last_run":input.heartbeat.get("value").filter(|v|operations_truthy(v)).cloned()}),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiUsageRangeInput {
    days: Option<String>,
    start: Option<String>,
    end: Option<String>,
    now_sec: f64,
}
pub async fn ai_usage_range(req: &mut Request) -> Result<Response> {
    let input: AiUsageRangeInput = req.json().await?;
    if !input.now_sec.is_finite() || input.now_sec.fract() != 0.0 {
        return Response::from_json(&json!({"fallback":true}));
    }
    let days_text = input
        .days
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("14");
    let parsed = js_sys::parse_int(days_text, 10);
    let days = if parsed.is_finite() {
        parsed.clamp(1.0, 365.0)
    } else {
        14.0
    };
    let mut from = input.now_sec - 86400.0 * days;
    let mut to = input.now_sec;
    let mut effective = days;
    let mut mode = "days";
    let start = input.start.unwrap_or_default();
    let end = input.end.unwrap_or_default();
    let date_re = js_sys::RegExp::new(r"^\d{4}-\d{2}-\d{2}$", "");
    if date_re.test(&start) && date_re.test(&end) {
        let start_sec = (js_sys::Date::new(&format!("{start}T00:00:00+09:00").into()).get_time()
            / 1000.0)
            .floor();
        let end_sec = (js_sys::Date::new(&format!("{end}T23:59:59+09:00").into()).get_time()
            / 1000.0)
            .floor();
        if start_sec.is_finite() && end_sec.is_finite() && end_sec > start_sec {
            let span = ((end_sec - start_sec) / 86400.0).ceil();
            if (1.0..=365.0).contains(&span) {
                from = start_sec;
                to = end_sec;
                effective = span;
                mode = "custom";
            }
        }
    }
    Response::from_json(
        &json!({"chartFrom":from,"chartTo":to,"effectiveDays":effective,"rangeMode":mode,"nowSec":input.now_sec,"dayAgo":input.now_sec-86400.0,"weekAgo":input.now_sec-86400.0*7.0,"monthAgo":input.now_sec-86400.0*30.0}),
    )
}

#[derive(Deserialize)]
struct AiUsageQuery {
    kind: String,
    start: Option<f64>,
    end: Option<f64>,
    pricing: Value,
}

pub async fn ai_usage(req: &mut Request, env: &Env) -> Result<Response> {
    let o: AiUsageQuery = req.json().await?;
    let (sql, single, args): (&str, bool, Vec<worker::wasm_bindgen::JsValue>) = match o
        .kind
        .as_str()
    {
        "period" => (
            "SELECT COUNT(*) AS calls, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors, COALESCE(SUM(input_chars),0) AS input_chars, COALESCE(SUM(output_chars),0) AS output_chars, COALESCE(SUM(prompt_tokens),0) AS prompt_tokens, COALESCE(SUM(completion_tokens),0) AS completion_tokens, COALESCE(SUM(total_tokens),0) AS total_tokens, COALESCE(AVG(latency_ms),0) AS avg_latency_ms FROM ai_usage_log WHERE created_at >= ?",
            true,
            vec![worker::wasm_bindgen::JsValue::from_f64(
                o.start.unwrap_or(0.0),
            )],
        ),
        "endpoints" => (
            "SELECT endpoint, COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS total_tokens, COALESCE(SUM(input_chars + output_chars),0) AS chars FROM ai_usage_log WHERE created_at >= ? GROUP BY endpoint ORDER BY calls DESC",
            false,
            vec![worker::wasm_bindgen::JsValue::from_f64(
                o.start.unwrap_or(0.0),
            )],
        ),
        "days" => (
            "SELECT strftime('%Y-%m-%d', datetime(created_at, 'unixepoch', '+9 hours')) AS date, COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS total_tokens FROM ai_usage_log WHERE created_at >= ? AND created_at <= ? GROUP BY date ORDER BY date ASC",
            false,
            vec![
                worker::wasm_bindgen::JsValue::from_f64(o.start.unwrap_or(0.0)),
                worker::wasm_bindgen::JsValue::from_f64(o.end.unwrap_or(0.0)),
            ],
        ),
        "recent" => (
            "SELECT id, created_at, endpoint, model, status, error_code, input_chars, output_chars, total_tokens, latency_ms FROM ai_usage_log ORDER BY created_at DESC LIMIT 20",
            false,
            vec![],
        ),
        _ => return Err(Error::RustError("Invalid AI usage query".into())),
    };
    let stmt = env.d1("DB")?.prepare(sql).bind(&args)?;
    if single {
        let row = stmt.first::<Value>(None).await?;
        return Response::from_json(&json!({"row":annotate_ai_usage(row.as_ref(), &o.pricing)}));
    }
    Response::from_json(&json!({"rows":stmt.all().await?.results::<Value>()?}))
}

fn annotate_ai_usage(row: Option<&Value>, pricing: &Value) -> Value {
    let number = |key: &str| score_number(row.and_then(|item| item.get(key)));
    let recorded = number("total_tokens");
    let chars = number("input_chars") + number("output_chars");
    let estimated = if recorded > 0.0 {
        recorded
    } else if chars.is_finite() && chars > 0.0 {
        (chars * 0.55 + 0.5).floor()
    } else {
        0.0
    };
    let price = score_number(pricing.get("usdPer1kTokens"));
    let currency = score_number(pricing.get("krwPerUsd"));
    let usd = if estimated.is_finite() && estimated > 0.0 {
        #[allow(deprecated)]
        let n = js_sys::Number::new(&wasm_bindgen::JsValue::from_f64(estimated * price / 1000.0));
        n.to_fixed(6)
            .ok()
            .and_then(|s| String::from(s).parse::<f64>().ok())
            .unwrap_or(0.0)
    } else {
        0.0
    };
    json!({"calls":number("calls"),"success":number("success"),"errors":number("errors"),"input_chars":number("input_chars"),"output_chars":number("output_chars"),"total_tokens":recorded,"est_tokens":estimated,"est_usd":usd,"est_krw":(usd * currency + 0.5).floor(),"avg_latency_ms":number("avg_latency_ms")})
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiUsageResponse {
    today: Value,
    week: Value,
    month: Value,
    by_endpoint: Vec<Value>,
    by_day: Vec<Value>,
    recent: Vec<Value>,
    chart_days: f64,
    range_mode: String,
    chart_from: f64,
    chart_to: f64,
    pricing: Value,
    now_sec: f64,
}

pub async fn ai_usage_response(req: &mut Request) -> Result<Response> {
    let o: AiUsageResponse = req.json().await?;
    let format_kst = |seconds: f64| {
        if !seconds.is_finite() {
            return String::new();
        }
        let date = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(
            seconds * 1000.0 + 9.0 * 3600.0 * 1000.0,
        ));
        if date.get_time().is_nan() {
            "NaN-NaN-NaN".to_string()
        } else {
            format!(
                "{}-{:02}-{:02}",
                date.get_utc_full_year(),
                date.get_utc_month() + 1,
                date.get_utc_date()
            )
        }
    };
    let mut pricing = o.pricing;
    if let Some(object) = pricing.as_object_mut() {
        object.insert(
            "dashboardUrl".into(),
            json!("https://dash.cloudflare.com/?to=/:account/ai/overview"),
        );
    }
    Response::from_json(
        &json!({"today":o.today,"week":o.week,"month":o.month,"byEndpoint":o.by_endpoint,"byDay":o.by_day,"chart_days":o.chart_days,
        "chart_range":{"mode":o.range_mode,"start_unix":o.chart_from,"end_unix":o.chart_to,"start_kst":format_kst(o.chart_from),"end_kst":format_kst(o.chart_to)},
        "recent":o.recent,"pricing":pricing,"generated_at":o.now_sec}),
    )
}

#[derive(Deserialize)]
struct ScoreHistoryFilters {
    limit: Option<String>,
    offset: Option<String>,
    q: Option<String>,
    grade: Option<String>,
    min_score: Option<String>,
}
pub async fn score_history_filters(req: &mut Request) -> Result<Response> {
    let input: ScoreHistoryFilters = req.json().await?;
    let parsed = |value: Option<&str>, fallback: &str| {
        js_sys::parse_int(value.filter(|v| !v.is_empty()).unwrap_or(fallback), 10)
    };
    let limit = parsed(input.limit.as_deref(), "30");
    let limit = if limit.is_nan() || limit == 0.0 {
        30.0
    } else {
        limit
    }
    .clamp(1.0, 100.0);
    let offset = parsed(input.offset.as_deref(), "0");
    let offset = if offset.is_nan() || offset == 0.0 {
        0.0
    } else {
        offset
    }
    .max(0.0);
    if !offset.is_finite() {
        return Response::from_json(&json!({"fallback":true}));
    }
    let q = js_sys::JsString::from(input.q.as_deref().unwrap_or(""))
        .trim()
        .slice(0, 120);
    let units: Vec<u16> = (0..q.length()).map(|i| q.char_code_at(i) as u16).collect();
    let grade = String::from(
        js_sys::JsString::from(input.grade.as_deref().unwrap_or(""))
            .trim()
            .to_upper_case(),
    );
    let score = parsed(input.min_score.as_deref(), "");
    let score = if score.is_finite() {
        Some(score.clamp(0.0, 100.0))
    } else {
        None
    };
    Response::from_json(
        &json!({"limit":limit,"offset":offset,"q_units":units,"grade":grade,"minScore":score}),
    )
}

#[derive(Deserialize)]
struct ScoreHistoryQuery {
    kind: String,
    q: String,
    grade: String,
    min_score: Option<f64>,
    limit: f64,
    offset: f64,
}

pub async fn score_history(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ScoreHistoryQuery = req.json().await?;
    let db = env.d1("DB")?;
    if o.kind == "stats" {
        let row = db.prepare("SELECT COUNT(*) AS total, COALESCE(AVG(overall_score),0) AS avg_score, SUM(CASE WHEN overall_grade='S' THEN 1 ELSE 0 END) AS grade_s, SUM(CASE WHEN overall_grade='A' THEN 1 ELSE 0 END) AS grade_a, SUM(CASE WHEN overall_grade='B' THEN 1 ELSE 0 END) AS grade_b, SUM(CASE WHEN overall_grade='C' THEN 1 ELSE 0 END) AS grade_c, SUM(CASE WHEN overall_grade='D' THEN 1 ELSE 0 END) AS grade_d, COALESCE(AVG(latency_ms),0) AS avg_latency_ms, COALESCE(SUM(total_tokens),0) AS total_tokens_sum, COALESCE(AVG(total_tokens),0) AS avg_tokens FROM ai_score_log").first::<Value>(None).await?;
        return Response::from_json(&json!({"row":row}));
    }
    if !matches!(o.kind.as_str(), "list" | "count" | "page") {
        return Err(Error::RustError("Invalid score history query".into()));
    }
    let mut clauses = Vec::new();
    let mut args: Vec<worker::wasm_bindgen::JsValue> = Vec::new();
    if !o.q.is_empty() {
        clauses.push("(COALESCE(input_title,'') LIKE ? OR COALESCE(overall_summary,'') LIKE ?)");
        let pattern = format!("%{}%", o.q);
        args.extend([pattern.as_str().into(), pattern.as_str().into()]);
    }
    if matches!(o.grade.as_str(), "S" | "A" | "B" | "C" | "D") {
        clauses.push("overall_grade = ?");
        args.push(o.grade.into());
    }
    if let Some(score) = o.min_score {
        clauses.push("overall_score >= ?");
        args.push(worker::wasm_bindgen::JsValue::from_f64(score));
    }
    let where_clause = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    if o.kind == "count" {
        let row = db
            .prepare(format!(
                "SELECT COUNT(*) AS total FROM ai_score_log{where_clause}"
            ))
            .bind(&args)?
            .first::<Value>(None)
            .await?;
        return Response::from_json(&json!({"row":row}));
    }
    args.extend([
        worker::wasm_bindgen::JsValue::from_f64(o.limit),
        worker::wasm_bindgen::JsValue::from_f64(o.offset),
    ]);
    let sql = if o.kind == "page" {
        format!(
            "WITH filtered AS MATERIALIZED (SELECT id,created_at FROM ai_score_log{where_clause}), selected AS (SELECT id FROM filtered ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?), totals AS (SELECT COUNT(*) AS total FROM filtered) SELECT a.id,a.created_at,a.actor,a.input_title,a.input_subtitle,a.input_body_chars,a.input_tags,a.overall_score,a.overall_grade,a.overall_summary,a.improvement,a.revision_suggestion,a.categories_json,a.latency_ms,a.total_tokens,a.status,a.error_code,totals.total AS page_total FROM totals LEFT JOIN selected s ON 1=1 LEFT JOIN ai_score_log a ON a.id=s.id ORDER BY a.created_at DESC,a.id DESC"
        )
    } else {
        format!(
            "SELECT id, created_at, actor, input_title, input_subtitle, input_body_chars, input_tags, overall_score, overall_grade, overall_summary, improvement, revision_suggestion, categories_json, latency_ms, total_tokens, status, error_code FROM ai_score_log{where_clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
        )
    };
    let mut rows = db
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let total = if o.kind == "page" {
        let total = rows
            .first()
            .and_then(|row| row.get("page_total"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        rows.retain(|row| row.get("id").is_some_and(|id| !id.is_null()));
        for row in &mut rows {
            if let Some(obj) = row.as_object_mut() {
                obj.remove("page_total");
            }
        }
        Some(total)
    } else {
        None
    };
    for row in &mut rows {
        if let Some(object) = row.as_object_mut() {
            let categories = match object.get("categories_json") {
                None | Some(Value::Null) => Some(json!([])),
                Some(Value::String(raw)) if raw.is_empty() => Some(json!([])),
                Some(Value::String(raw)) => serde_json::from_str::<Value>(raw).ok(),
                _ => None,
            };
            if let Some(categories) = categories {
                object.insert("categories".into(), categories);
            }
        }
    }
    if let Some(total) = total {
        Response::from_json(&json!({"rows":rows,"row":{"total":total}}))
    } else {
        Response::from_json(&json!({"rows":rows}))
    }
}

#[derive(Deserialize)]
struct ScoreHistoryResponse {
    items: Vec<Value>,
    total_row: Option<Value>,
    stats: Option<Value>,
    limit: f64,
    offset: f64,
    generated_at: f64,
}

#[allow(deprecated)]
pub(crate) fn score_number(value: Option<&Value>) -> f64 {
    match value {
        None | Some(Value::Null) => 0.0,
        Some(Value::Bool(value)) => u8::from(*value) as f64,
        Some(Value::Number(value)) => value.as_f64().unwrap_or(f64::NAN),
        Some(value) => js_sys::Number::new(&wasm_bindgen::JsValue::from_str(
            &crate::post_routes::js_string(value),
        ))
        .value_of(),
    }
}

pub async fn score_history_response(req: &mut Request) -> Result<Response> {
    let mut o: ScoreHistoryResponse = req.json().await?;
    for item in &mut o.items {
        if let Some(row) = item.as_object_mut() {
            let timestamp = score_number(row.get("created_at"));
            let kst = if !timestamp.is_finite() || timestamp <= 0.0 {
                String::new()
            } else {
                let date = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(
                    timestamp * 1000.0 + 9.0 * 3600.0 * 1000.0,
                ));
                if date.get_time().is_nan() {
                    "NaN-NaN-NaN NaN:NaN:NaN".to_string()
                } else {
                    format!(
                        "{}-{:02}-{:02} {:02}:{:02}:{:02}",
                        date.get_utc_full_year(),
                        date.get_utc_month() + 1,
                        date.get_utc_date(),
                        date.get_utc_hours(),
                        date.get_utc_minutes(),
                        date.get_utc_seconds()
                    )
                }
            };
            row.insert("created_at_kst".into(), json!(kst));
            row.remove("categories_json");
            row.entry("categories").or_insert(Value::Null);
        }
    }
    let stat = |key: &str| score_number(o.stats.as_ref().and_then(|row| row.get(key)));
    let total = score_number(o.total_row.as_ref().and_then(|row| row.get("total")));
    Response::from_json(&json!({
        "items": o.items,
        "pagination": {"total":total,"limit":o.limit,"offset":o.offset,"has_more":o.offset + (o.items.len() as f64) < total},
        "stats": {"total":stat("total"),"avg_score":(stat("avg_score") + 0.5).floor(),
            "grade_distribution":{"S":stat("grade_s"),"A":stat("grade_a"),"B":stat("grade_b"),"C":stat("grade_c"),"D":stat("grade_d")},
            "avg_latency_ms":(stat("avg_latency_ms") + 0.5).floor(),"total_tokens_sum":stat("total_tokens_sum"),"avg_tokens":(stat("avg_tokens") + 0.5).floor()},
        "generated_at":o.generated_at
    }))
}

#[derive(Deserialize)]
struct AiLogOptions {
    operation: String,
    values: Vec<Value>,
}

pub async fn ai_log(req: &mut Request, env: &Env) -> Result<Response> {
    let o: AiLogOptions = req.json().await?;
    let db = env.d1("DB")?;
    let args = post_bindings(&o.values)?;
    match o.operation.as_str() {
        "limit" if args.len() == 2 => {
            let row=db.prepare("SELECT COUNT(*) AS n FROM ai_usage_log WHERE endpoint = 'score-article' AND actor = ? AND created_at >= ? AND status = 'ok'").bind(&args)?.first::<Value>(None).await?;
            Response::from_json(&json!({"row":row}))
        }
        "usage" if args.len() == 13 => {
            db.prepare("INSERT INTO ai_usage_log (created_at,endpoint,model,ip,actor,input_chars,output_chars,prompt_tokens,completion_tokens,total_tokens,latency_ms,status,error_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(&args)?.run().await?;
            Response::from_json(&json!({"ok":true}))
        }
        "score" if args.len() == 17 => {
            db.prepare("INSERT INTO ai_score_log (created_at,actor,ip,input_title,input_subtitle,input_body_chars,input_tags,overall_score,overall_grade,overall_summary,improvement,revision_suggestion,categories_json,latency_ms,total_tokens,status,error_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(&args)?.run().await?;
            Response::from_json(&json!({"ok":true}))
        }
        _ => Err(Error::RustError("Invalid AI log operation".into())),
    }
}

#[derive(Deserialize)]
struct AiScoreExtractInput {
    raw: String,
}

pub async fn ai_score_extract(req: &mut Request) -> Result<Response> {
    let input: AiScoreExtractInput = req.json().await?;
    let patterns = [
        r"```json\s*([\s\S]*?)```",
        r"```\s*([\s\S]*?)```",
        r"(\{[\s\S]*\})",
    ];
    let extracted = patterns.into_iter().find_map(|pattern| {
        js_sys::RegExp::new(pattern, "")
            .exec(&input.raw)
            .and_then(|parts| parts.get(1).as_string())
    });
    Response::from_json(&json!({"extracted":extracted}))
}

#[derive(Deserialize)]
struct AiScorePromptInput {
    values: Vec<String>,
}

pub async fn ai_score_prompt(req: &mut Request) -> Result<Response> {
    let input: AiScorePromptInput = req.json().await?;
    let markers = [
        "${rubric}",
        "${title || '(없음)'}",
        "${subtitle || '(없음)'}",
        "${content || '(없음)'}",
        "${tags || '(없음)'}",
    ];
    if input.values.len() != markers.len() {
        return Err(Error::RustError("Invalid score prompt values".into()));
    }
    let mut remaining = include_str!("ai_score_prompt.txt");
    let mut prompt = String::new();
    for (marker, value) in markers.into_iter().zip(input.values.iter()) {
        let (before, after) = remaining
            .split_once(marker)
            .ok_or_else(|| Error::RustError("Invalid score prompt template".into()))?;
        prompt.push_str(before);
        prompt.push_str(value);
        remaining = after;
    }
    prompt.push_str(remaining);
    Response::from_json(&json!({"prompt":prompt}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminRangeInput {
    start: Option<String>,
    end: Option<String>,
    days: Option<String>,
    all: Option<String>,
    default_days: f64,
    allow_all: bool,
    default_all: bool,
    today: String,
}

fn admin_day(value: &str) -> Option<f64> {
    if !js_sys::RegExp::new(r"^\d{4}-\d{2}-\d{2}$", "").test(value) {
        return None;
    }
    let date = js_sys::Date::new(&format!("{value}T00:00:00Z").into());
    if !date.get_time().is_finite() {
        return None;
    }
    let iso = String::from(date.to_iso_string());
    if iso.get(..10) != Some(value) {
        return None;
    }
    Some(date.get_time())
}

fn admin_iso(ms: f64) -> String {
    String::from(js_sys::Date::new(&ms.into()).to_iso_string())
}

pub async fn admin_range(req: &mut Request) -> Result<Response> {
    let input: AdminRangeInput = req.json().await?;
    let has_date = input.start.as_ref().is_some_and(|v| !v.is_empty())
        || input.end.as_ref().is_some_and(|v| !v.is_empty());
    let today = match admin_day(&input.today) {
        Some(ms) => ms,
        None => return Response::from_json(&json!({"fallback":true})),
    };
    let (mut start, mut end) = if has_date {
        let start = input.start.as_deref().and_then(admin_day);
        let end = input.end.as_deref().and_then(admin_day);
        let (Some(start), Some(end)) = (start, end) else {
            return Response::from_json(
                &json!({"error":"시작일과 종료일을 모두 올바른 날짜로 입력해주세요."}),
            );
        };
        if start < -2208988800000.0
            || end < -2208988800000.0
            || start > 4102444799999.0
            || end > 4102444799999.0
        {
            return Response::from_json(&json!({"fallback":true}));
        }
        (start, end)
    } else {
        if input.days.as_ref().is_none_or(|v| v.is_empty())
            && input.allow_all
            && (input.all.as_deref() == Some("1") || input.default_all)
        {
            return Response::from_json(&json!({"range":null}));
        }
        #[allow(deprecated)]
        // JavaScript Number conversion preserves hexadecimal and whitespace rules.
        let days = input
            .days
            .as_ref()
            .map(|v| js_sys::Number::new(&v.as_str().into()).value_of())
            .unwrap_or(input.default_days);
        if !days.is_finite() || days.fract() != 0.0 || days < 1.0 {
            return Response::from_json(
                &json!({"error":"조회 기간은 1일 이상의 정수로 입력해주세요."}),
            );
        }
        (today - (days.min(180.0) - 1.0) * 86400000.0, today)
    };
    if start > end {
        std::mem::swap(&mut start, &mut end);
    }
    if (end - start) / 86400000.0 + 1.0 > 180.0 {
        start = end - 179.0 * 86400000.0;
    }
    let start_date = admin_iso(start)[..10].to_owned();
    let end_date = admin_iso(end)[..10].to_owned();
    let label = if start_date == end_date {
        start_date.clone()
    } else {
        format!("{start_date} ~ {end_date}")
    };
    let days = (end - start) / 86400000.0 + 1.0;
    Response::from_json(
        &json!({"range":{"startDate":start_date,"endDate":end_date,"days":days,"label":label,"startUtcIso":admin_iso(start-32400000.0),"endUtcIso":admin_iso(end+86400000.0-32400000.0)}}),
    )
}

#[derive(Deserialize)]
struct HeatmapRangeInput {
    start: Option<String>,
    end: Option<String>,
    days: Option<String>,
    all: Option<String>,
    today: String,
}

pub async fn heatmap_range(req: &mut Request) -> Result<Response> {
    let input: HeatmapRangeInput = req.json().await?;
    let Some(today) = admin_day(&input.today) else {
        return Response::from_json(&json!({"fallback":true}));
    };
    let all = input.all.as_deref() == Some("1");
    let has_dates = input.start.as_ref().is_some_and(|s| !s.is_empty())
        || input.end.as_ref().is_some_and(|s| !s.is_empty());
    let (mut start, mut end, explicit) = if all {
        (admin_day("2020-01-01").unwrap_or(today), today, true)
    } else if has_dates {
        let parse = |value: Option<&String>| -> Option<f64> {
            let value = value
                .map(|s| String::from(js_sys::JsString::from(s.as_str()).trim()))
                .unwrap_or_default();
            if value.is_empty() {
                Some(today)
            } else {
                admin_day(&value)
            }
        };
        let (Some(start), Some(end)) = (parse(input.start.as_ref()), parse(input.end.as_ref()))
        else {
            return Response::from_json(&json!({"fallback":true}));
        };
        (start, end, true)
    } else {
        #[allow(deprecated)]
        let n = input
            .days
            .as_deref()
            .filter(|v| !v.is_empty())
            .map(|v| js_sys::Number::new(&v.into()).value_of())
            .unwrap_or(30.0);
        if !n.is_finite() || n.fract() != 0.0 {
            return Response::from_json(&json!({"fallback":true}));
        }
        let n = if n == 0.0 { 30.0 } else { n.clamp(1.0, 90.0) };
        (today - (n - 1.0) * 86400000.0, today, false)
    };
    if start < -2208988800000.0
        || end < -2208988800000.0
        || start > 4102444799999.0
        || end > 4102444799999.0
    {
        return Response::from_json(&json!({"fallback":true}));
    }
    if start > end {
        std::mem::swap(&mut start, &mut end);
    }
    let start_date = admin_iso(start)[..10].to_owned();
    let end_date = admin_iso(end)[..10].to_owned();
    let label = if start_date == end_date {
        start_date.clone()
    } else {
        format!("{start_date} ~ {end_date}")
    };
    let mut range = json!({"startDate":start_date,"endDate":end_date,"days":(end-start)/86400000.0+1.0,"label":label});
    if !explicit {
        range["startUtcIso"] = admin_iso(start - 32400000.0).into();
        range["endUtcIso"] = admin_iso(end + 86400000.0 - 32400000.0).into();
    }
    Response::from_json(&json!({"range":range}))
}
