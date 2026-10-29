use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListOptions {
    category: Option<String>,
    page: Option<String>,
    page_size: Option<String>,
    q: Option<String>,
    tag_filter: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    featured_only: Option<String>,
    special_feature: Option<String>,
    all_requested: Option<String>,
    days: Option<String>,
    sort: Option<String>,
    popular_period: Option<String>,
    requested_order_by: Option<String>,
    requested_order_dir: Option<String>,
    published_param: Option<String>,
    is_admin: bool,
    include_dwell: bool,
    public_date_expr: String,
    origin: String,
}

pub async fn list(req: &mut Request, env: &Env) -> Result<Response> {
    let o: ListOptions = req.json().await?;
    let parse_page = |value: Option<&str>, fallback: u32, max: f64| {
        let n = value
            .map(|v| worker::js_sys::parse_int(v, 10))
            .unwrap_or(f64::NAN);
        if n.is_finite() {
            n.clamp(1.0, max) as u32
        } else {
            fallback
        }
    };
    let page = parse_page(o.page.as_deref(), 1, 100_000.0);
    let page_size = parse_page(o.page_size.as_deref(), 16, 100.0);
    let featured_only = o.featured_only.as_deref() == Some("1");
    let all_requested = o.all_requested.as_deref() == Some("1");
    let days = o
        .days
        .as_deref()
        .map(|v| worker::js_sys::parse_int(v, 10))
        .unwrap_or(0.0);
    let days_arg = if days > 0.0 {
        let text = worker::js_sys::Number::from(days)
            .to_string_with_radix(10)
            .map(String::from)
            .map_err(|_| Error::RustError("Invalid days filter".into()))?;
        Some(format!("-{text} days"))
    } else {
        None
    };
    let special_feature = o.special_feature.as_ref().and_then(|value| {
        let text = worker::js_sys::JsString::from(value.as_str())
            .trim()
            .replace_by_pattern(&worker::js_sys::RegExp::new(r"\s+", "g"), " ");
        if text.length() == 0 {
            None
        } else {
            Some(text.slice(0, 120))
        }
    });
    let (compact_query, fuzzy_query) = if let Some(query) = &o.q {
        let safe = worker::js_sys::JsString::from(query.as_str()).slice(0, 200);
        let compact = safe.replace_by_pattern(&worker::js_sys::RegExp::new(r"\s+", "g"), "");
        let parts = safe
            .trim()
            .split_by_pattern(&worker::js_sys::RegExp::new(r"\s*", ""));
        let nonempty = worker::js_sys::Array::new();
        for part in parts.iter() {
            if !part.as_string().unwrap_or_default().is_empty() {
                nonempty.push(&part);
            }
        }
        let percent = worker::js_sys::JsString::from("%");
        let fuzzy = percent.concat(&nonempty.join("%")).concat(&percent);
        (compact, fuzzy)
    } else {
        (
            worker::js_sys::JsString::from(""),
            worker::js_sys::JsString::from(""),
        )
    };
    let lower = |value: Option<&str>| {
        String::from(
            worker::js_sys::JsString::from(value.unwrap_or(""))
                .trim()
                .to_lower_case(),
        )
    };
    let raw_sort = lower(o.sort.as_deref());
    let sort = match raw_sort.as_str() {
        "oldest" | "views" | "manual" | "popular" => raw_sort.as_str(),
        "relevance" if o.q.is_some() => "relevance",
        _ => "latest",
    };
    let popular_period = lower(o.popular_period.as_deref());
    let popular_period_hours = if sort != "popular" {
        None
    } else {
        match popular_period.as_str() {
            "" | "all" => None,
            "24h" | "1d" => Some(24),
            "30d" => Some(720),
            _ => Some(168),
        }
    };
    let order_by = lower(o.requested_order_by.as_deref());
    let order_dir = lower(o.requested_order_dir.as_deref());
    let published_param = match o.published_param.as_deref() {
        Some("1" | "true" | "published") => Some(1),
        Some("0" | "false" | "draft") => Some(0),
        _ => None,
    };
    let normalized_date = |value: Option<&str>| {
        let v = value.map(crate::trim).unwrap_or("");
        if worker::js_sys::RegExp::new(r"^\d{4}-\d{2}-\d{2}$", "").test(v) {
            Some(v.to_owned())
        } else {
            None
        }
    };
    let start_date = normalized_date(o.start_date.as_deref());
    let end_date = normalized_date(o.end_date.as_deref());
    let date = &o.public_date_expr;
    let mut conditions = Vec::<String>::new();
    let mut base = Vec::<JsValue>::new();
    let mut scores = Vec::<JsValue>::new();
    let mut popular = Vec::<JsValue>::new();
    let search = if o.q.is_some() {
        "(CASE WHEN title LIKE ? THEN 60 ELSE 0 END + CASE WHEN replace(title, ' ', '') LIKE ? THEN 42 ELSE 0 END + CASE WHEN COALESCE(subtitle, '') LIKE ? THEN 35 ELSE 0 END + CASE WHEN COALESCE(tag, '') LIKE ? THEN 30 ELSE 0 END + CASE WHEN COALESCE(meta_tags, '') LIKE ? THEN 24 ELSE 0 END + CASE WHEN COALESCE(content, '') LIKE ? THEN 10 ELSE 0 END + CASE WHEN replace(COALESCE(title, ''), ' ', '') LIKE ? THEN 18 ELSE 0 END)"
    } else {
        "0"
    };
    let popularity = if sort == "popular" {
        if let Some(hours) = popular_period_hours {
            let window = format!("-{hours} hours");
            popular.extend([window.clone().into(), window.into()]);
            "((SELECT COUNT(*) FROM site_visits WHERE path LIKE '/post/%' AND CAST(SUBSTR(path, 7) AS INTEGER) = posts.id AND datetime(visited_at) >= datetime('now', ?)) + (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id AND datetime(liked_at) >= datetime('now', ?)) * 3)"
        } else {
            "(COALESCE(posts.views, 0) + (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) * 3)"
        }
    } else {
        "0"
    };

    let dir = if order_dir == "asc" { "ASC" } else { "DESC" };
    let admin_order = if o.is_admin {
        match order_by.as_str() {
            "upload" => format!("ORDER BY datetime(replace(created_at, 'T', ' ')) {dir}, id {dir}"),
            "date" => format!("ORDER BY {date} {dir}, id {dir}"),
            "views" => format!("ORDER BY views {dir}, {date} DESC, id DESC"),
            "title" | "category" => format!(
                "ORDER BY LOWER(COALESCE({}, '')) {dir}, {date} DESC, id DESC",
                order_by
            ),
            _ => String::new(),
        }
    } else {
        String::new()
    };
    let manual = admin_order.is_empty()
        && ((all_requested && o.is_admin)
            || (sort == "manual"
                && o.category.is_some()
                && o.q.is_none()
                && o.tag_filter.is_none()));
    let order = if manual {
        format!("ORDER BY sort_order IS NULL ASC, sort_order ASC, {date} DESC, id DESC")
    } else if !admin_order.is_empty() {
        admin_order
    } else {
        match sort {
            "popular" => format!("ORDER BY popularity_score DESC, {date} DESC, id DESC"),
            "oldest" => format!("ORDER BY {date} ASC, id ASC"),
            "views" => format!("ORDER BY views DESC, {date} DESC, id DESC"),
            "relevance" if o.q.is_some() => {
                format!("ORDER BY search_score DESC, {date} DESC, id DESC")
            }
            _ => format!("ORDER BY {date} DESC, id DESC"),
        }
    };

    if featured_only {
        conditions.extend(["featured = 1".into(), "published = 1".into()]);
    } else {
        if let Some(category) = &o.category {
            conditions.push("category = ?".into());
            base.push(category.into());
        }
        if !o.is_admin {
            conditions.push("published = 1".into());
        } else if let Some(published) = published_param {
            conditions.push("published = ?".into());
            base.push(JsValue::from_f64(published.into()));
        }
        if let Some(days) = &days_arg {
            conditions.push(format!("{date} >= datetime('now', '+9 hours', ?)"));
            base.push(days.into());
        }
        if let Some(start) = &start_date {
            conditions.push(format!("date({date}) >= date(?)"));
            base.push(start.into());
        }
        if let Some(end) = &end_date {
            conditions.push(format!("date({date}) <= date(?)"));
            base.push(end.into());
        }
        if let Some(q) = &o.q {
            conditions.push("(title LIKE ? OR replace(title, ' ', '') LIKE ? OR COALESCE(subtitle, '') LIKE ? OR COALESCE(tag, '') LIKE ? OR COALESCE(meta_tags, '') LIKE ? OR COALESCE(content, '') LIKE ? OR replace(COALESCE(title, ''), ' ', '') LIKE ?)".into());
            let qp = format!("%{q}%");
            let percent = worker::js_sys::JsString::from("%");
            let compact = if compact_query.length() == 0 {
                worker::js_sys::JsString::from(q.as_str())
            } else {
                compact_query.clone()
            };
            let compact = percent.concat(&compact).concat(&percent);
            let fuzzy = if fuzzy_query.length() == 0 {
                JsValue::from_str(&qp)
            } else {
                fuzzy_query.clone().into()
            };
            let args = [
                JsValue::from_str(&qp),
                compact.into(),
                JsValue::from_str(&qp),
                JsValue::from_str(&qp),
                JsValue::from_str(&qp),
                JsValue::from_str(&qp),
                fuzzy,
            ];
            base.extend(args.iter().cloned());
            scores.extend(args);
        }
        if let Some(feature) = &special_feature {
            conditions.push("COALESCE(special_feature, '') = ?".into());
            base.push(feature.clone().into());
        }
        if let Some(tag) = &o.tag_filter {
            conditions.push("(COALESCE(tag, '') LIKE ? OR COALESCE(meta_tags, '') LIKE ?)".into());
            let value = JsValue::from_str(&format!("%{tag}%"));
            base.extend([value.clone(), value]);
        }
    }
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    let dwell = if o.include_dwell {
        ", (SELECT ROUND(AVG(engaged_seconds), 1) FROM post_engagement WHERE post_id = posts.id) AS avg_dwell_seconds"
    } else {
        ""
    };
    let cols = format!(
        "id, category, title, subtitle, image_url, image_caption, image_frame, created_at, publish_at, updated_at, featured, tag, meta_tags, special_feature, views, author, published, sort_order, youtube_url, {search} AS search_score, {popularity} AS popularity_score, (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likes{dwell}"
    );
    let all = all_requested && o.is_admin;
    let limit = if all { "" } else { " LIMIT ? OFFSET ?" };
    let sql = format!("SELECT {cols} FROM posts {where_clause} {order}{limit}");
    let mut args = scores;
    args.extend(popular);
    args.extend(base.iter().cloned());
    if !all {
        args.push(JsValue::from_f64(page_size.into()));
        args.push(JsValue::from_f64(((page - 1) * page_size).into()));
    }
    let db = env.d1("DB")?;
    let rows = db
        .prepare(sql)
        .bind(&args)?
        .all()
        .await?
        .results::<Value>()?;
    let counts = db
        .prepare(format!(
            "SELECT COUNT(*) AS total FROM posts {where_clause}"
        ))
        .bind(&base)?
        .all()
        .await?
        .results::<Value>()?;
    let rows: Vec<Value> = rows
        .into_iter()
        .map(|mut row| {
            if !o.is_admin {
                let author = row
                    .get("author")
                    .filter(|value| match value {
                        Value::Null | Value::Bool(false) => false,
                        Value::String(s) => !s.is_empty(),
                        Value::Number(n) => n.as_f64() != Some(0.0),
                        _ => true,
                    })
                    .map(crate::post_routes::js_string)
                    .unwrap_or_default();
                row["author"] = json!(crate::post_routes::export_author(&author));
            }
            crate::post_routes::post_image(row, &o.origin)
        })
        .collect();
    let total = counts
        .first()
        .and_then(|value| value.get("total"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let payload = json!({"posts":rows,"total":total,"page":page,"pageSize":if all {total} else {page_size.into()}});
    Response::from_json(&payload)
}
