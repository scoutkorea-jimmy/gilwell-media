use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
struct Options {
    key: String,
    #[serde(default)]
    origin: String,
}

pub async fn schema_data(req: &mut Request, env: &Env) -> Result<Response> {
    let options: Options = req.json().await?;
    if options.key == "wosm-schema" {
        let row = async {
            env.d1("DB")?
                .prepare("SELECT value FROM settings WHERE key = 'wosm_members'")
                .first::<Value>(None)
                .await
        }
        .await
        .ok()
        .flatten();
        let members = row
            .as_ref()
            .and_then(|row| row.get("value"))
            .and_then(Value::as_str)
            .and_then(|text| serde_json::from_str::<Value>(text).ok());
        let count = members
            .as_ref()
            .and_then(|value| {
                value
                    .as_array()
                    .or_else(|| value.get("items").and_then(Value::as_array))
            })
            .map_or(0, Vec::len);
        return Response::from_json(&json!({"html":wosm_schema(&options.origin, count)}));
    }
    let (sql, category) = match options.key.as_str() {
        "glossary-schema" => (
            "SELECT id, bucket, term_ko, term_en, term_fr, description_ko FROM glossary_terms ORDER BY bucket, COALESCE(sort_order, 0), term_ko",
            None,
        ),
        "home" => (
            "SELECT id, title FROM posts WHERE published = 1 ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10",
            None,
        ),
        "latest" => (
            "SELECT id, title FROM posts WHERE published = 1 AND datetime(COALESCE(publish_at, created_at)) >= datetime('now', '-30 days') ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10",
            None,
        ),
        "korea" | "apr" | "wosm" | "people" | "glossary" => (
            "SELECT id, title FROM posts WHERE published = 1 AND category = ? ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 10",
            Some(options.key.as_str()),
        ),
        _ => return Err(Error::RustError("Invalid schema key".into())),
    };
    let db = env.d1("DB")?;
    let query = db.prepare(sql);
    let rows = if let Some(category) = category {
        query.bind(&[category.into()])?.all().await?
    } else {
        query.all().await?
    };
    let rows = rows.results::<Value>()?;
    if options.key == "glossary-schema" {
        let html = glossary_schema(&rows, &options.origin);
        return Response::from_json(&json!({"results":rows,"html":html}));
    }
    Response::from_json(&json!({"results":rows}))
}

fn schema_script(payload: &Value) -> String {
    let safe = payload
        .to_string()
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026");
    format!("\n<script type=\"application/ld+json\">{safe}</script>")
}

fn wosm_schema(origin: &str, count: usize) -> String {
    let mut membership = json!({"@type":"PropertyValue","name":"등록 연맹 수"});
    if count > 0 {
        membership["value"] = json!(count);
    }
    let payload = json!({
        "@context":"https://schema.org","@type":"Dataset","@id":format!("{origin}/wosm-members"),
        "name":"세계스카우트연맹(WOSM) 회원국 현황","alternateName":"WOSM Member Countries Dataset",
        "description":"세계스카우트연맹 가입 회원 연맹 목록과 국가·지역연맹·가입 연도·등록 규모 등 구조화 데이터. 한국어·영어 명칭 병기.",
        "url":format!("{origin}/wosm-members"),"inLanguage":["ko-KR","en"],"isAccessibleForFree":true,"license":format!("{origin}/editorial-policy"),
        "keywords":["WOSM","세계스카우트연맹","World Organization of the Scout Movement","회원국","지역연맹","Asia-Pacific","Europe","Africa"],
        "creator":{"@type":"Organization","name":"BP미디어","url":origin},"publisher":{"@type":"Organization","name":"BP미디어","url":origin},
        "variableMeasured":[membership,
            {"@type":"PropertyValue","name":"국가명(한글)","description":"country_ko"},
            {"@type":"PropertyValue","name":"국가명(영문)","description":"country_en"},
            {"@type":"PropertyValue","name":"국가명(불어)","description":"country_fr"},
            {"@type":"PropertyValue","name":"지역연맹","description":"WOSM 6개 지역 분류"},
            {"@type":"PropertyValue","name":"가입 연도","description":"세계연맹 가입 연도"},
            {"@type":"PropertyValue","name":"등록 회원 수","description":"Census-reported scout count"}]
    });
    schema_script(&payload)
}

fn glossary_schema(rows: &[Value], origin: &str) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let terms = rows.iter().map(|row| {
        let truthy = |field: &str| row.get(field).filter(|v| match v { Value::Null | Value::Bool(false) => false, Value::String(s) => !s.is_empty(), Value::Number(n) => n.as_f64() != Some(0.0), _ => true });
        let names = ["term_ko","term_en","term_fr"].iter().filter_map(|field| truthy(field)).map(crate::post_routes::js_string).map(|name| super::trim(&name).to_owned()).filter(|name| !name.is_empty()).collect::<Vec<_>>();
        let id = row.get("id").map(crate::post_routes::js_string).unwrap_or_default();
        let mut entry = json!({"@type":"DefinedTerm","@id":format!("{origin}/glossary#term-{id}"),"name":names.first().map(String::as_str).unwrap_or(""),"inDefinedTermSet":format!("{origin}/glossary")});
        if names.len() > 1 { entry["alternateName"] = json!(&names[1..]); }
        if let Some(desc) = truthy("description_ko").map(crate::post_routes::js_string) {
            let desc = super::trim(&desc);
            if !desc.is_empty() { entry["description"] = json!(desc); }
        }
        if let Some(bucket) = truthy("bucket") { entry["termCode"] = bucket.clone(); }
        entry
    }).collect::<Vec<_>>();
    let payload = json!({"@context":"https://schema.org","@type":"DefinedTermSet","@id":format!("{origin}/glossary"),"name":"BP미디어 스카우팅 용어집","description":"한국어·영어·프랑스어 스카우팅 용어 사전. WOSM·APR·한국스카우트연맹 공식 표기 기준.","url":format!("{origin}/glossary"),"inLanguage":["ko-KR","en","fr"],"hasDefinedTerm":terms,"publisher":{"@type":"Organization","name":"BP미디어","url":origin}});
    schema_script(&payload)
}

fn value<'a>(row: &'a Value, field: &str) -> &'a str {
    row.get(field).and_then(Value::as_str).unwrap_or("")
}
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[derive(Clone, Deserialize)]
struct MiniItem {
    id: String,
    title: String,
    image: String,
    placeholder: bool,
    category: String,
    tag: String,
    hide_category: bool,
    date: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MiniInput {
    sections: std::collections::BTreeMap<String, Vec<MiniItem>>,
    category_labels: std::collections::BTreeMap<String, String>,
    lead_candidates: Vec<Option<LeadItem>>,
}

#[derive(Deserialize)]
struct LeadItem {
    #[serde(flatten)]
    item: MiniItem,
    subtitle: String,
    author: String,
    has_author: bool,
    content: String,
}

fn post_date(value: &str) -> String {
    let trimmed = js_sys::JsString::from(value).trim();
    if trimmed.length() == 0 {
        return String::new();
    }
    let value = String::from(trimmed.clone());
    let normalized = value.replacen(' ', "T", 1);
    let with_zone = if js_sys::RegExp::new(r"Z$|[+-]\d{2}:\d{2}$", "").test(&normalized) {
        normalized
    } else {
        format!("{normalized}+00:00")
    };
    let date = js_sys::Date::new(&JsValue::from_str(&with_zone));
    if date.get_time().is_nan() {
        return String::from(trimmed.slice(0, 10));
    }
    let locales = js_sys::Array::new();
    locales.push(&"en-CA".into());
    let options = js_sys::Object::new();
    for (key, val) in [
        ("timeZone", "Asia/Seoul"),
        ("year", "numeric"),
        ("month", "2-digit"),
        ("day", "2-digit"),
    ] {
        let _ = js_sys::Reflect::set(&options, &key.into(), &val.into());
    }
    let formatter = js_sys::Intl::DateTimeFormat::new(&locales, &options);
    let mut year = String::new();
    let mut month = String::new();
    let mut day = String::new();
    for part in formatter.format_to_parts(&date).iter() {
        let kind = js_sys::Reflect::get(&part, &"type".into())
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_default();
        let value = js_sys::Reflect::get(&part, &"value".into())
            .ok()
            .and_then(|v| v.as_string())
            .unwrap_or_default();
        match kind.as_str() {
            "year" => year = value,
            "month" => month = value,
            "day" => day = value,
            _ => {}
        }
    }
    format!("{year}.{month}.{day}")
}

fn mini_labels(
    row: &MiniItem,
    category_labels: &std::collections::BTreeMap<String, String>,
) -> String {
    let category = String::from(js_sys::JsString::from(row.category.as_str()).trim());
    let category = match category.as_str() {
        "korea" | "apr" | "wosm" | "people" => category.as_str(),
        _ => "korea",
    };
    let fallback = match category {
        "apr" => "APR",
        "wosm" => "WOSM",
        "people" => "스카우트 인물",
        _ => "Korea",
    };
    let label = category_labels
        .get(category)
        .map(String::as_str)
        .unwrap_or("");
    let label = js_sys::JsString::from(label).trim();
    let label = if label.length() == 0 {
        fallback.to_owned()
    } else if category == "apr" || category == "wosm" {
        String::from(label.to_upper_case())
    } else if category == "korea" {
        String::from(
            label
                .slice(0, 1)
                .to_upper_case()
                .concat(&label.slice(1, label.length())),
        )
    } else {
        String::from(label)
    };
    let mut labels = if row.hide_category {
        String::new()
    } else {
        format!(
            "<span class=\"category-tag tag-{}\">{}</span>",
            category,
            escape(&label)
        )
    };
    let mut tags: Vec<String> = row
        .tag
        .split(',')
        .map(|tag| String::from(js_sys::JsString::from(tag).trim()))
        .filter(|tag| !tag.is_empty())
        .collect();
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    let options = js_sys::Object::new();
    tags.sort_by(|a, b| {
        js_sys::JsString::from(a.as_str())
            .locale_compare(b, &locales, &options)
            .cmp(&0)
    });
    for tag in &tags {
        labels.push_str(&format!(
            "<span class=\"post-kicker tag-{}-kicker\">{}</span>",
            escape(&row.category),
            escape(tag)
        ));
    }
    labels
}

pub async fn home_minis(req: &mut Request) -> Result<Response> {
    let mut input: MiniInput = req.json().await?;
    if input.sections.get("popular").is_some_and(Vec::is_empty) {
        let latest = input.sections.get("latest").cloned().unwrap_or_default();
        input.sections.insert("popular".into(), latest);
    }
    for (key, rows) in &mut input.sections {
        let limit = match key.as_str() {
            "latest" => Some(3),
            "popular" | "picks" | "korea" | "apr" | "wosm" | "people" => Some(4),
            _ => None,
        };
        if let Some(limit) = limit {
            rows.truncate(limit);
        }
    }
    let rendered: std::collections::BTreeMap<String, String> = input.sections.into_iter().map(|(key, rows)| {
        let html = if rows.is_empty() { "<div class=\"mini-empty\">게시글이 없습니다</div>".into() } else {
            rows.iter().map(|row| {
                let thumb = if row.image.is_empty() {String::new()} else {format!("<img class=\"mini-thumb{}\" src=\"{}\" loading=\"lazy\" alt=\"{}\">",if row.placeholder {" is-placeholder"} else {""},escape(&row.image),escape(&row.title))};
                let labels = mini_labels(row, &input.category_labels);
                format!("<article class=\"mini-item\"><div class=\"mini-item-row\"><div class=\"mini-item-text\"><div class=\"mini-item-labels\">{}</div><h4><a class=\"mini-item-link\" href=\"/post/{}\">{}</a></h4><div class=\"mini-meta\">{}</div></div>{}</div></article>",labels,row.id,escape(&row.title),escape(&post_date(&row.date)),thumb)
            }).collect::<String>()
        };
        (key,html)
    }).collect();
    let root = js_sys::JSON::parse(
        &serde_json::to_string(&rendered).map_err(|e| Error::RustError(e.to_string()))?,
    )
    .map_err(|_| Error::RustError("Invalid home SSR JSON".into()))?;
    let selected_lead = input.lead_candidates.into_iter().flatten().next();
    let preload = selected_lead
        .as_ref()
        .filter(|lead| !lead.item.placeholder)
        .map(|lead| lead.item.image.as_str())
        .unwrap_or("");
    js_sys::Reflect::set(&root, &"heroPreloadUrl".into(), &preload.into())
        .map_err(|_| Error::RustError("Invalid home preload".into()))?;
    let lead = if let Some(lead) = selected_lead {
        let item = lead.item;
        let placeholder = if item.placeholder {
            " is-placeholder"
        } else {
            ""
        };
        let image = if item.image.is_empty() {
            String::new()
        } else {
            format!(
                "<a class=\"home-lead-thumb-link{placeholder}\" href=\"/post/{}\"><img class=\"home-lead-thumb{placeholder}\" src=\"{}\" alt=\"{}\" loading=\"eager\" fetchpriority=\"high\"></a>",
                item.id,
                escape(&item.image),
                escape(&item.title)
            )
        };
        let subtitle = if lead.subtitle.is_empty() {
            String::new()
        } else {
            format!(
                "<p class=\"home-lead-subtitle\">{}</p>",
                escape(&lead.subtitle)
            )
        };
        let prefix = format!(
            "<article class=\"home-lead-card\">{image}<div class=\"home-lead-body\"><div class=\"home-lead-copy\"><div class=\"home-lead-labels\">{}<span class=\"home-lead-kicker\">메인 스토리</span></div><h3><a class=\"home-lead-link\" href=\"/post/{}\">{}</a></h3>{subtitle}",
            mini_labels(&item, &input.category_labels),
            item.id,
            escape(&item.title)
        );
        let author = if lead.has_author {
            format!(" · {}", escape(&lead.author))
        } else {
            String::new()
        };
        let suffix = format!(
            "</div><div class=\"home-lead-footer\"><div class=\"home-lead-meta\">{}{author}</div><div class=\"home-lead-actions\"><a class=\"home-subscribe-btn\" href=\"/post/{}\">기사 읽기</a></div></div></div></article>",
            escape(&post_date(&item.date)),
            item.id
        );
        let well_formed = String::from(crate::post_routes::post_excerpt(
            &json!({"content":lead.content,"subtitle":lead.subtitle}),
            220,
        ));
        let mut excerpt = js_sys::JsString::from(well_formed.as_str());
        for (pattern, replacement) in [
            ("&", "&amp;"),
            ("<", "&lt;"),
            (">", "&gt;"),
            ("\"", "&quot;"),
            ("'", "&#39;"),
        ] {
            excerpt = excerpt.replace_by_pattern(&js_sys::RegExp::new(pattern, "g"), replacement);
        }
        let mut html = js_sys::JsString::from(prefix.as_str());
        if excerpt.length() > 0 {
            html = html
                .concat(&js_sys::JsString::from("<p class=\"home-lead-excerpt\">"))
                .concat(&excerpt)
                .concat(&js_sys::JsString::from("</p>"));
        }
        html.concat(&js_sys::JsString::from(suffix.as_str()))
    } else {
        js_sys::JsString::from("<div class=\"mini-empty\">대표 기사를 준비 중입니다</div>")
    };
    js_sys::Reflect::set(&root, &"lead".into(), &lead)
        .map_err(|_| Error::RustError("Invalid home lead".into()))?;
    let json = js_sys::JSON::stringify(&root)
        .map_err(|_| Error::RustError("Unable to serialize home SSR".into()))?;
    Response::ok(String::from(json))
}
fn number(row: &Value, field: &str) -> f64 {
    row.get(field).and_then(Value::as_f64).unwrap_or(0.0)
}

#[derive(Deserialize)]
struct MembersRenderInput {
    rows: Vec<Value>,
    columns: Vec<Value>,
}

fn member_truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::String(s) => !s.is_empty(),
        Value::Number(n) => n.as_f64() != Some(0.0),
        _ => true,
    }
}

fn member_text(value: Option<&Value>) -> String {
    value
        .filter(|v| !v.is_null())
        .map(crate::post_routes::js_string)
        .unwrap_or_default()
}

fn member_value(row: &Value, key: &str) -> String {
    if key == "country_names" {
        return ["country_ko", "country_en", "country_fr"]
            .iter()
            .filter_map(|key| row.get(key).filter(|v| member_truthy(v)))
            .map(crate::post_routes::js_string)
            .collect::<Vec<_>>()
            .join(" · ");
    }
    row.get(key)
        .filter(|v| member_truthy(v))
        .or_else(|| {
            row.get("extra_fields")
                .and_then(|fields| fields.get(key))
                .filter(|v| member_truthy(v))
        })
        .map(crate::post_routes::js_string)
        .unwrap_or_else(|| "—".into())
}

pub async fn members_render(req: &mut Request) -> Result<Response> {
    let input: MembersRenderInput = req.json().await?;
    let head = input
        .columns
        .iter()
        .map(|column| {
            format!(
                "<th scope=\"col\">{}</th>",
                escape(&member_text(column.get("label")))
            )
        })
        .collect::<String>();
    let mut rows = String::new();
    let mut cards = String::new();
    for row in &input.rows {
        let cells = input
            .columns
            .iter()
            .map(|column| {
                format!(
                    "<td>{}</td>",
                    escape(&member_value(row, &member_text(column.get("key"))))
                )
            })
            .collect::<String>();
        rows.push_str(&format!("<tr>{cells}</tr>"));
        let country = row
            .get("country_ko")
            .filter(|v| member_truthy(v))
            .or_else(|| row.get("country_en"));
        let details = input
            .columns
            .iter()
            .filter(|column| member_text(column.get("key")) != "country_names")
            .map(|column| {
                format!(
                    "<dt>{}</dt><dd>{}</dd>",
                    escape(&member_text(column.get("label"))),
                    escape(&member_value(row, &member_text(column.get("key"))))
                )
            })
            .collect::<String>();
        cards.push_str(&format!(
            "<article class=\"members-card\"><h2>{}</h2><dl>{details}</dl></article>",
            escape(&member_text(country))
        ));
    }
    Response::from_json(
        &json!({"membersCount":format!("{}개 회원 연맹",input.rows.len()),"membersHead":format!("<tr>{head}</tr>"),"members":rows,"membersCards":cards}),
    )
}

#[derive(Deserialize)]
struct PrivacyRenderInput {
    html: String,
}

pub async fn privacy_render(req: &mut Request) -> Result<Response> {
    let input: PrivacyRenderInput = req.json().await?;
    let mut text = js_sys::JsString::from(input.html);
    for (pattern, flags, replacement) in [
        (r"<(script|style)\b[^>]*>[\s\S]*?</\1>", "gi", ""),
        (r"</(?:p|h[1-6]|li)>", "gi", "\n"),
        (r"<[^>]*>", "g", ""),
    ] {
        text = text.replace_by_pattern(&js_sys::RegExp::new(pattern, flags), replacement);
    }
    let text = String::from(text);
    let paragraphs = text
        .split('\n')
        .map(|line| String::from(js_sys::JsString::from(line).trim()))
        .filter(|line| !line.is_empty())
        .map(|line| format!("<p>{}</p>", escape(&line)))
        .collect::<String>();
    Response::from_json(&json!({"privacy":format!("<h1>개인정보처리방침</h1>{paragraphs}")}))
}

#[derive(Deserialize)]
struct BoardRenderInput {
    posts: Vec<Value>,
    page: u32,
    total_pages: u32,
    url: String,
}

fn board_page_href(original: &Url, page: u32) -> String {
    let mut url = original.clone();
    let pairs: Vec<(String, String)> = original
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    url.set_query(None);
    let mut inserted = false;
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            if key == "page" {
                if page != 1 && !inserted {
                    query.append_pair("page", &page.to_string());
                    inserted = true;
                }
            } else {
                query.append_pair(&key, &value);
            }
        }
        if page != 1 && !inserted {
            query.append_pair("page", &page.to_string());
        }
    }
    if url.query() == Some("") {
        url.set_query(None);
    }
    format!(
        "{}{}",
        url.path(),
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    )
}

pub async fn board_render(req: &mut Request) -> Result<Response> {
    let input: BoardRenderInput = req.json().await?;
    let board = if input.posts.is_empty() {
        "<p class=\"board-empty\">해당 조건의 기사가 없습니다.</p>".to_owned()
    } else {
        input.posts.iter().map(|post| {
            let text = |field: &str| post.get(field).filter(|v| !v.is_null()).map(crate::post_routes::js_string).unwrap_or_default();
            let subtitle = post.get("subtitle").filter(|v| match v {Value::Null | Value::Bool(false) => false, Value::String(s) => !s.is_empty(), Value::Number(n) => n.as_f64() != Some(0.0), _ => true}).map(|_| format!("<p class=\"post-card-subtitle\">{}</p>", escape(&text("subtitle")))).unwrap_or_default();
            format!("<article class=\"post-card no-thumb\"><div class=\"post-card-body\"><div class=\"post-card-head\"><h3><a class=\"post-card-title-link\" href=\"/post/{}\">{}</a></h3></div>{subtitle}</div></article>", number(post,"id"), escape(&text("title")))
        }).collect()
    };
    let url = Url::parse(&input.url).map_err(|error| Error::RustError(error.to_string()))?;
    let mut pages = vec![1, input.total_pages];
    for n in input.page.saturating_sub(2)..=input.page.saturating_add(2) {
        if n > 0 && n <= input.total_pages {
            pages.push(n);
        }
    }
    pages.sort_unstable();
    pages.dedup();
    let pagination = if input.total_pages < 2 {
        String::new()
    } else {
        pages
            .iter()
            .map(|n| {
                let href = board_page_href(&url, *n);
                let active = *n == input.page;
                format!(
                    "<a class=\"board-page-btn{}\" href=\"{}\"{} aria-label=\"{}페이지\">{}</a>",
                    if active { " active" } else { "" },
                    escape(&href),
                    if active { " aria-current=\"page\"" } else { "" },
                    n,
                    n
                )
            })
            .collect::<Vec<_>>()
            .join(" ")
    };
    Response::from_json(&json!({"board":board,"pagination":pagination}))
}

pub async fn render(req: &mut Request, env: &Env) -> Result<Response> {
    let options: Options = req.json().await?;
    let db = env.d1("DB")?;
    let sql = match options.key.as_str() {
        "glossary" => {
            "SELECT id, term_ko, term_en, term_fr, description_ko FROM glossary_terms ORDER BY bucket, COALESCE(sort_order, 0), term_ko"
        }
        "calendar" => {
            "SELECT c.title, c.start_at, c.end_at, c.location_name, p.id AS post_id FROM calendar_events c LEFT JOIN posts p ON p.id = c.related_post_id AND p.published = 1 ORDER BY c.start_at DESC LIMIT 100"
        }
        "memorabilia" => {
            "SELECT id, slug, title_ko, title_en FROM memorabilia WHERE status = 'public' ORDER BY COALESCE(published_at, updated_at) DESC, id DESC LIMIT 48"
        }
        _ => return Err(Error::RustError("Invalid public SSR key".into())),
    };
    let rows = db.prepare(sql).all().await?.results::<Value>()?;
    let parts = match options.key.as_str() {
        "glossary" => {
            let terms = rows
                .iter()
                .map(|r| {
                    let label = [
                        value(r, "term_ko"),
                        value(r, "term_en"),
                        value(r, "term_fr"),
                    ]
                    .into_iter()
                    .filter(|v| !v.is_empty())
                    .collect::<Vec<_>>()
                    .join(" · ");
                    format!(
                        "<dt id=\"term-{}\"><strong>{}</strong></dt><dd>{}</dd>",
                        number(r, "id"),
                        escape(&label),
                        escape(value(r, "description_ko"))
                    )
                })
                .collect::<String>();
            json!({"glossaryCount":format!("{}개 용어",rows.len()),"glossary":format!("<dl>{terms}</dl>")})
        }
        "calendar" => {
            let html = rows
                .iter()
                .map(|r| {
                    let title = escape(value(r, "title"));
                    let id = number(r, "post_id");
                    let title = if id != 0.0 {
                        format!("<a href=\"/post/{id}\">{title}</a>")
                    } else {
                        title
                    };
                    let end = value(r, "end_at");
                    let end = if end.is_empty() {
                        String::new()
                    } else {
                        format!(" ~ {}", escape(end))
                    };
                    format!(
                        "<article><h2>{title}</h2><p>{}{} · {}</p></article>",
                        escape(value(r, "start_at")),
                        end,
                        escape(value(r, "location_name"))
                    )
                })
                .collect::<String>();
            json!({"calendar":if html.is_empty() {"<p>등록된 일정이 없습니다.</p>"} else {&html}})
        }
        _ => {
            let html=rows.iter().map(|r| {
                let slug=value(r,"slug");
                let fallback=number(r,"id").to_string();
                let encoded=String::from(js_sys::encode_uri_component(if slug.is_empty(){&fallback}else{slug}));
                let title=value(r,"title_ko");
                let title=if title.is_empty(){value(r,"title_en")}else{title};
                format!("<a class=\"memo-card\" href=\"/memorabilia/{encoded}\"><div class=\"memo-card-body\"><h2 class=\"memo-card-title\">{}</h2></div></a>",escape(title))
            }).collect::<String>();
            json!({"memorabiliaCount":format!("공개 자료 {}개",rows.len()),"memorabilia":if html.is_empty(){"<p>공개된 도감 자료가 없습니다.</p>"}else{&html}})
        }
    };
    Response::from_json(&json!({"parts":parts}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanonicalInput {
    pathname: String,
    page_key: String,
    page: u32,
    title: String,
}

pub async fn canonical(req: &mut Request) -> Result<Response> {
    let input: CanonicalInput = req.json().await?;
    let path = if input.pathname == "/" || input.pathname == "/index.html" {
        "/"
    } else {
        match input.page_key.as_str() {
            "latest" => "/latest",
            "jamboree16" => "/jamboree16",
            "korea" => "/korea",
            "apr" => "/apr",
            "wosm" => "/wosm",
            "wosm_members" => "/wosm-members",
            "people" => "/people",
            "glossary" => "/glossary",
            "calendar" => "/calendar",
            "memorabilia" => "/memorabilia",
            "privacy" => "/privacy",
            _ => &input.pathname,
        }
    };
    let paged = matches!(
        input.page_key.as_str(),
        "latest" | "korea" | "apr" | "wosm" | "people"
    ) && input.page > 1;
    let canonical = if paged {
        format!("{path}?page={}", input.page)
    } else {
        path.to_owned()
    };
    let title = if paged {
        format!("{} · {}페이지", input.title, input.page)
    } else {
        input.title
    };
    Response::from_json(
        &json!({"path":canonical,"title":title,"descriptor":seo_descriptor(&input.page_key)}),
    )
}

fn seo_descriptor(key: &str) -> Value {
    let schema = if key == "search" {
        "SearchResultsPage"
    } else if matches!(
        key,
        "latest"
            | "korea"
            | "apr"
            | "wosm"
            | "people"
            | "glossary"
            | "memorabilia"
            | "wosm_members"
            | "calendar"
    ) {
        "CollectionPage"
    } else {
        "WebPage"
    };
    let crumb = match key {
        "latest" => "최신 소식",
        "jamboree16" => "제16회 한국잼버리 특별관",
        "korea" => "Korea",
        "apr" => "APR",
        "wosm" => "WOSM",
        "wosm_members" => "세계연맹 회원국 현황",
        "people" => "스카우트 인물",
        "glossary" => "스카우트 용어집",
        "memorabilia" => "스카우트 기념품 도감",
        "contributors" => "도움을 주신 분들",
        "calendar" => "스카우트 캘린더",
        "search" => "검색",
        "editorial_policy" => "편집 정책",
        "about" => "운영 주체",
        "privacy" => "개인정보 처리방침",
        _ => "",
    };
    let topic = match key {
        "latest" => "최신 소식",
        "jamboree16" => "제16회 한국잼버리",
        "korea" => "한국 스카우트 소식",
        "apr" => "아시아태평양 스카우트 소식",
        "wosm" => "세계스카우트연맹 소식",
        "wosm_members" => "세계연맹 회원국 현황",
        "people" => "스카우트 인물",
        "glossary" => "스카우트 용어집",
        "memorabilia" => "스카우트 기념품 도감",
        "contributors" => "후원 및 기여자 소개",
        "calendar" => "스카우트 행사 및 일정",
        "search" => "사이트 검색 결과",
        "editorial_policy" => "편집 정책",
        "about" => "운영 주체",
        "privacy" => "개인정보 처리방침",
        _ => "스카우트 뉴스",
    };
    let keywords = match key {
        "home" => {
            "BP미디어, 비피미디어, BPmedia, The BP Media, bpmedia.net, 스카우트 뉴스, 스카우트 미디어, WOSM, APR, 한국스카우트연맹"
        }
        "latest" => "최신 소식, 최신 스카우트 뉴스, BP미디어",
        "jamboree16" => {
            "제16회 한국잼버리, 한국잼버리, 16th Korea National Jamboree, 2026 한국잼버리, 세계잼버리수련장, 한국스카우트연맹, BP미디어"
        }
        "korea" => "Korea, 한국스카우트연맹, BP미디어",
        "apr" => "APR, 아시아태평양 스카우트, BP미디어",
        "wosm" => "WOSM, 세계스카우트연맹, BP미디어",
        "wosm_members" => "WOSM 회원국, 세계연맹 회원국 현황, 스카우트 회원국, BP미디어",
        "people" => "스카우트 인물, BP미디어",
        "glossary" => "스카우트 용어집, BP미디어",
        "memorabilia" => {
            "스카우트 기념품, 스카우트 도감, 스카우트 패치, 스카우트 뱃지, 스카우트 항건, 스카우트 우표, Scout Memorabilia, BP미디어"
        }
        "contributors" => "BP미디어, 도움을 주신 분들",
        "calendar" => "스카우트 캘린더, 스카우트 행사 일정, BP미디어",
        "search" => "BP미디어 검색",
        "editorial_policy" => "편집 정책, 정정 보도, 출처 검증, BP미디어",
        "about" => "운영 주체, BP미디어, 길웰미디어",
        "privacy" => "개인정보 처리방침, BP미디어",
        _ => "BP미디어",
    };
    json!({"schema":schema,"breadcrumb":crumb,"topic":topic,"keywords":keywords})
}
