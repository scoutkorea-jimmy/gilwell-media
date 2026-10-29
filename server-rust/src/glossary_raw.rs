use serde_json::{Value, json};
use worker::{js_sys, *};

const BUCKETS: [&str; 14] = [
    "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
];
const INITIAL: [&str; 19] = [
    "가", "가", "나", "다", "다", "라", "마", "바", "바", "사", "사", "아", "자", "자", "차", "카",
    "타", "파", "하",
];
struct Row {
    id: Value,
    bucket: String,
    ko: String,
    en: String,
    fr: String,
    description: String,
    sort: f64,
}
fn text(row: &Value, key: &str) -> Option<String> {
    match row.get(key) {
        None | Some(Value::Null) => Some(String::new()),
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn name(r: &Row) -> &str {
    if !r.ko.is_empty() {
        &r.ko
    } else if !r.en.is_empty() {
        &r.en
    } else {
        &r.fr
    }
}
fn render(rows: &[Value]) -> Option<String> {
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row.get("id")?.clone();
        let n = id.as_f64()?;
        if !n.is_finite() || n.abs() > 9007199254740991.0 {
            return None;
        }
        let ko = text(row, "term_ko")?;
        let en = text(row, "term_en")?;
        let fr = text(row, "term_fr")?;
        let original = text(row, "bucket")?;
        let description = text(row, "description_ko")?;
        let sort = match row.get("sort_order") {
            None | Some(Value::Null) => 0.0,
            Some(Value::Number(n)) => n.as_f64()?,
            _ => return None,
        };
        if !sort.is_finite() {
            return None;
        }
        let first = js_sys::JsString::from(ko.as_str()).trim().char_code_at(0) as u32;
        let bucket = if (0xac00..=0xd7a3).contains(&first) {
            INITIAL[((first - 0xac00) / 588) as usize].to_owned()
        } else if original.is_empty() {
            "가".into()
        } else {
            original
        };
        items.push(Row {
            id,
            bucket,
            ko,
            en,
            fr,
            description,
            sort,
        });
    }
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    let options = js_sys::Object::new();
    items.sort_by(|a, b| {
        let pos = |s: &str| {
            BUCKETS
                .iter()
                .position(|v| *v == s)
                .map(|v| v as i32)
                .unwrap_or(-1)
        };
        pos(&a.bucket)
            .cmp(&pos(&b.bucket))
            .then_with(|| {
                a.sort
                    .partial_cmp(&b.sort)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                js_sys::JsString::from(name(a))
                    .locale_compare(name(b), &locales, &options)
                    .cmp(&0)
            })
            .then_with(|| {
                a.id.as_f64()
                    .unwrap()
                    .partial_cmp(&b.id.as_f64().unwrap())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    Some(items.iter().map(|item| {
        let field=|s:&str|escape(if s.is_empty(){"-"}else{s});
        format!("<article class=\"glossary-raw-card\" id=\"term-{}\">\n    <h2>{}</h2>\n    <dl>\n      <dt>한국어</dt>\n      <dd lang=\"ko\">{}</dd>\n      <dt>English</dt>\n      <dd lang=\"en\">{}</dd>\n      <dt>Français</dt>\n      <dd lang=\"fr\">{}</dd>\n    </dl>\n    <div class=\"glossary-raw-desc\" lang=\"ko\">{}</div>\n  </article>",crate::post_routes::js_string(&item.id),escape(&item.bucket),field(&item.ko),field(&item.en),field(&item.fr),field(&item.description))
    }).collect::<Vec<_>>().join("\n"))
}

async fn fetch_rows(env: &Env) -> Result<Vec<Value>> {
    env.d1("DB")?.prepare("SELECT id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at FROM glossary_terms").all().await?.results::<Value>()
}

pub async fn render_query(env: &Env) -> Result<Response> {
    let rows = fetch_rows(env).await?;
    match render(&rows) {
        Some(cards) => {
            Response::from_json(&json!({"rendered":true,"count":rows.len(),"cards":cards}))
        }
        None => Response::from_json(&json!({"rendered":false,"rows":rows})),
    }
}

#[derive(serde::Deserialize)]
struct PageInput {
    title: String,
    meta: String,
    links: String,
}

pub async fn render_page(req: &mut Request, env: &Env) -> Result<Response> {
    let input: PageInput = req.json().await?;
    let rows = fetch_rows(env).await?;
    let Some(cards) = render(&rows) else {
        return Response::from_json(&json!({"rendered":false,"rows":rows}));
    };
    let date = String::from(js_sys::Date::new_0().to_iso_string().slice(0, 10));
    let title = escape(&input.title);
    let count = rows.len().to_string();
    let mut html = String::new();
    let mut remaining = include_str!("glossary_raw_shell.html");
    while let Some((before, after)) = remaining.split_once("@@") {
        html.push_str(before);
        let Some((key, rest)) = after.split_once("@@") else {
            return Err(Error::RustError("Invalid glossary shell".into()));
        };
        html.push_str(match key {
            "TITLE" => &title,
            "META" => &input.meta,
            "COUNT" => &count,
            "DATE" => &date,
            "LINKS" => &input.links,
            "CARDS" => &cards,
            _ => return Err(Error::RustError("Invalid glossary shell token".into())),
        });
        remaining = rest;
    }
    html.push_str(remaining);
    Response::from_json(&json!({"rendered":true,"html":html}))
}
