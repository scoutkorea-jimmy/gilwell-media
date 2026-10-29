use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, wasm_bindgen::JsValue, *};

#[derive(Deserialize)]
struct RobotsInput {
    origin: String,
}

pub async fn robots(req: &mut Request) -> Result<Response> {
    let input: RobotsInput = req.json().await?;
    let search = ["Googlebot", "Naverbot", "Yeti"];
    let full = ["Googlebot-Image", "AdsBot-Google"];
    let ai = [
        "GPTBot",
        "ChatGPT-User",
        "OAI-SearchBot",
        "ClaudeBot",
        "Claude-Web",
        "anthropic-ai",
        "PerplexityBot",
        "Perplexity-User",
        "Google-Extended",
        "CCBot",
        "Applebot-Extended",
        "Amazonbot",
        "Bytespider",
        "Meta-ExternalAgent",
    ];
    // Image and public data exceptions must remain more specific than /api/ denial.
    let allow = [
        "/api/articles.ndjson",
        "/api/glossary$",
        "/api/glossary?",
        "/api/glossary/bot",
        "/api/images/",
        "/api/og-image/",
        "/api/posts/*/image",
    ];
    let disallow = [
        "/admin",
        "/admin.html",
        "/dreampath",
        "/dreampath.html",
        "/kms",
        "/kms.html",
        "/search",
        "/search.html",
        "/api/",
        "/output/",
    ];
    let mut lines = Vec::new();
    let mut group = |agent: &str, full_access: bool| {
        lines.push(format!("User-agent: {agent}"));
        lines.push("Allow: /".to_owned());
        if !full_access {
            lines.extend(allow.iter().map(|path| format!("Allow: {path}")));
            lines.extend(disallow.iter().map(|path| format!("Disallow: {path}")));
        }
        lines.push(String::new());
    };
    for agent in search {
        group(agent, false);
    }
    for agent in full {
        group(agent, true);
    }
    for agent in ai {
        group(agent, false);
    }
    group("*", false);
    lines.push(format!("Sitemap: {}/sitemap.xml", input.origin));
    lines.push(format!("Sitemap: {}/sitemap-news.xml", input.origin));
    Response::from_json(&json!({"text":lines.join("\n")}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownInput {
    post: Value,
    post_url: String,
    origin: String,
    brand: String,
}

fn md_yaml(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', " ")
    )
}

fn markdown_citations(raw: &str) -> Vec<String> {
    if raw.is_empty() {
        return Vec::new();
    }
    let mut text = raw.to_owned();
    if crate::trim(raw).starts_with('{')
        && let Ok(doc) = serde_json::from_str::<Value>(crate::trim(raw))
        && let Some(blocks) = doc.get("blocks").and_then(Value::as_array)
    {
        text = blocks
            .iter()
            .map(|block| {
                if block.get("type").and_then(Value::as_str) != Some("paragraph") {
                    return String::new();
                }
                block
                    .get("data")
                    .and_then(|data| data.get("text"))
                    .filter(|v| {
                        !v.is_null() && v != &&json!(false) && v != &&json!(0) && v != &&json!("")
                    })
                    .map(crate::post_routes::js_string)
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    let source = js_sys::RegExp::new(
        r"(?:자료출처|출처|Source|source)\s*[:：]\s*([\s\S]*?)(?:\n\n|$)",
        "g",
    );
    let url = js_sys::RegExp::new(r"https?://\S+", "g");
    let mut seen = std::collections::HashSet::new();
    let mut citations = Vec::new();
    while let Some(found) = source.exec(&text) {
        let block = String::from(found.get(1));
        url.set_last_index(0);
        while let Some(matched) = url.exec(&block) {
            let value = String::from(matched.get(0));
            let clean = value.trim_end_matches([')', ']', '.', ',', ';']).to_owned();
            if seen.insert(clean.clone()) {
                citations.push(clean);
            }
        }
    }
    citations
}

pub async fn markdown(req: &mut Request) -> Result<Response> {
    let input: MarkdownInput = req.json().await?;
    let field = |key| {
        input
            .post
            .get(key)
            .filter(|v| !v.is_null() && v != &&json!(false) && v != &&json!(0) && v != &&json!(""))
            .map(crate::post_routes::js_string)
            .unwrap_or_default()
    };
    let title = field("title");
    let title = crate::trim(&title);
    let subtitle = field("subtitle");
    let subtitle = crate::trim(&subtitle);
    let author = field("author");
    let author = crate::trim(if author.is_empty() {
        "Editor.A"
    } else {
        &author
    });
    let category = field("category");
    let category = crate::trim(&category);
    let published = field("publish_at");
    let created = field("created_at");
    let date = String::from(
        js_sys::JsString::from(if published.is_empty() {
            created.as_str()
        } else {
            published.as_str()
        })
        .slice(0, 10),
    );
    let updated = String::from(js_sys::JsString::from(field("updated_at")).slice(0, 10));
    let tags = |key| {
        field(key)
            .split([',', ';', '|'])
            .map(crate::trim)
            .filter(|s| !s.is_empty())
            .map(md_yaml)
            .collect::<Vec<_>>()
    };
    let mut front = vec![
        "---".to_owned(),
        format!("title: {}", md_yaml(title)),
        format!("url: {}", input.post_url),
        format!("canonical: {}", input.post_url),
    ];
    if !category.is_empty() {
        front.push(format!("category: {}", md_yaml(category)));
    }
    front.push(format!("author: {}", md_yaml(author)));
    if !date.is_empty() {
        front.push(format!("published: {date}"));
    }
    if !updated.is_empty() {
        front.push(format!("updated: {updated}"));
    }
    let labels = tags("tag");
    if !labels.is_empty() {
        front.push(format!("tags: [{}]", labels.join(", ")));
    }
    let meta = tags("meta_tags");
    if !meta.is_empty() {
        front.push(format!("meta_tags: [{}]", meta.join(", ")));
    }
    let location = field("location_name");
    if !location.is_empty() {
        front.push(format!("location: {}", md_yaml(&location)));
    }
    front.push(format!("source: {}", md_yaml(&input.brand)));
    front.push("---".into());
    front.push(String::new());
    let mut body = vec![format!("# {title}"), String::new()];
    if !subtitle.is_empty() {
        body.push(format!("*{subtitle}*"));
        body.push(String::new());
    }
    body.push(format!(
        "_{date} · {author}{}_",
        if category.is_empty() {
            String::new()
        } else {
            format!(" · {category}")
        }
    ));
    body.push(String::new());
    let image = field("image_url");
    let image = if image.starts_with("//") {
        format!("https:{image}")
    } else if image.starts_with('/') {
        format!("{}{image}", input.origin)
    } else {
        image
    };
    if !image.is_empty() {
        let caption = field("image_caption");
        let caption = if caption.is_empty() { title } else { &caption };
        body.push(format!("![{}]({image})", caption.replace(['[', ']'], "")));
        body.push(String::new());
    }
    let rendered_body = crate::markdown::body(&field("content"), &input.origin)?;
    if !rendered_body.is_empty() {
        body.push(rendered_body);
        body.push(String::new());
    }
    let citations = markdown_citations(&field("content"));
    if !citations.is_empty() {
        body.push("## 자료출처".into());
        body.push(String::new());
        body.extend(citations.into_iter().map(|url| format!("- {url}")));
        body.push(String::new());
    }
    body.push("---".into());
    body.push(format!("원문(HTML): {}", input.post_url));
    body.push(String::new());
    Response::from_json(&serde_json::json!({"text":front.join("\n")+&body.join("\n")}))
}

#[derive(Deserialize)]
struct LlmsOptions {
    origin: String,
    year: i32,
}

fn llms_escape(value: &str) -> String {
    let mut escaped = String::new();
    let mut previous_newline = false;
    for c in value.chars() {
        if c == '\r' || c == '\n' {
            if !previous_newline {
                escaped.push(' ');
            }
            previous_newline = true;
        } else {
            escaped.push(c);
            previous_newline = false;
        }
    }
    escaped.trim_matches(|c| matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')).to_owned()
}

pub async fn llms_recent(req: &mut Request, env: &Env) -> Result<Response> {
    let input: LlmsOptions = req.json().await?;
    let date = "COALESCE(CASE WHEN publish_at IS NOT NULL AND trim(publish_at) <> '' THEN CASE WHEN instr(publish_at, 'Z') > 0 OR instr(substr(publish_at, 11), '+') > 0 THEN datetime(replace(publish_at, 'T', ' '), '+9 hours') ELSE datetime(replace(publish_at, 'T', ' ')) END ELSE NULL END, CASE WHEN created_at IS NOT NULL AND trim(created_at) <> '' THEN CASE WHEN instr(created_at, 'Z') > 0 OR instr(substr(created_at, 11), '+') > 0 THEN datetime(replace(created_at, 'T', ' '), '+9 hours') ELSE datetime(replace(created_at, 'T', ' '), '+9 hours') END ELSE NULL END)";
    let rows = async { env.d1("DB")?.prepare(format!("SELECT id, title, subtitle, category, {date} AS pubdate FROM posts WHERE published = 1 AND {date} <= datetime('now', '+9 hours') ORDER BY pubdate DESC LIMIT 20")).all().await?.results::<Value>() }.await.unwrap_or_default();
    let mut lines = Vec::new();
    for row in rows {
        let field = |key| row.get(key).and_then(Value::as_str).unwrap_or_default();
        let title = llms_escape(field("title"));
        let title = if title.is_empty() { "(무제)" } else { &title };
        let subtitle = llms_escape(field("subtitle"));
        let date = field("pubdate").chars().take(10).collect::<String>();
        let category = llms_escape(field("category"));
        let suffix = [date, category]
            .into_iter()
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join(" · ");
        let id = row
            .get("id")
            .map(Value::to_string)
            .unwrap_or_else(|| "undefined".into());
        let mut line = format!("- [{title}]({}/post/{id})", input.origin);
        if !suffix.is_empty() {
            line.push_str(&format!(" — {suffix}"));
        }
        if !subtitle.is_empty() {
            line.push_str(&format!("\n  {subtitle}"));
        }
        lines.push(line);
    }
    let recent = if lines.is_empty() {
        "_(최근 기사 불러오기에 일시적으로 실패했습니다.)_".to_owned()
    } else {
        lines.join("\n")
    };
    let text = include_str!("llms-template.txt")
        .replace("{{origin}}", &input.origin)
        .replace("{{year}}", &input.year.to_string())
        .replace("{{recent}}", &recent);
    Response::from_json(&serde_json::json!({"text":text}))
}

#[derive(Deserialize)]
struct SitemapPage {
    path: String,
    priority: String,
    category: Option<String>,
}
#[derive(Deserialize)]
struct SitemapOptions {
    origin: String,
    pages: Vec<SitemapPage>,
}

fn sitemap_iso(raw: &str, zone: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }
    let value = super::trim(raw).replacen(' ', "T", 1);
    let has_zone = js_sys::RegExp::new(r"(?:Z|[+-]\d{2}:?\d{2})$", "i").test(&value);
    let zoned = if has_zone {
        value
    } else {
        format!("{value}{zone}")
    };
    let date = js_sys::Date::new(&JsValue::from_str(&zoned));
    if date.get_time().is_nan() {
        String::new()
    } else {
        String::from(date.to_iso_string())
    }
}
fn sitemap_lastmod(post: &Value) -> String {
    let val = |key| post.get(key).and_then(Value::as_str).unwrap_or_default();
    let published = sitemap_iso(val("publish_at"), "+09:00");
    let published = if published.is_empty() {
        sitemap_iso(val("created_at"), "Z")
    } else {
        published
    };
    published.max(sitemap_iso(val("updated_at"), "Z"))
}
fn sitemap_url(loc: &str, lastmod: &str, priority: &str) -> String {
    let date = if lastmod.is_empty() {
        String::new()
    } else {
        format!("<lastmod>{}</lastmod>", xml_escape(lastmod))
    };
    format!(
        "  <url>\n    <loc>{}</loc>\n    {date}\n    <priority>{priority}</priority>\n  </url>",
        xml_escape(loc)
    )
}
pub(crate) fn feature_slug(value: &str) -> String {
    if super::trim(value).is_empty() {
        return String::new();
    }
    let slug = js_sys::JsString::from(value)
        .trim()
        .to_lower_case()
        .normalize("NFKD")
        .replace_by_pattern(&js_sys::RegExp::new(r"[\u0300-\u036f]", "g"), "")
        .replace_by_pattern(&js_sys::RegExp::new(r"[^a-z0-9가-힣]+", "g"), "-")
        .replace_by_pattern(&js_sys::RegExp::new(r"^-+|-+$", "g"), "")
        .replace_by_pattern(&js_sys::RegExp::new(r"-{2,}", "g"), "-");
    let slug = String::from(slug);
    if slug.is_empty() {
        "feature".into()
    } else {
        slug
    }
}
pub async fn sitemap(req: &mut Request, env: &Env) -> Result<Response> {
    let options: SitemapOptions = req.json().await?;
    let data = async {
        let db = env.d1("DB")?;
        let posts=db.prepare("SELECT id, category, special_feature, updated_at, publish_at, created_at FROM posts WHERE published = 1 ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC").all().await?.results::<Value>()?;
        db.prepare("SELECT category, MAX(updated_at) AS updated_at FROM posts WHERE published = 1 GROUP BY category").all().await?;
        let glossary = db.prepare("SELECT MAX(COALESCE(updated_at, created_at)) AS updated_at FROM glossary_terms").all().await?.results::<Value>()?;
        Result::<_>::Ok((posts, glossary))
    }.await;
    let (posts, glossary) = match data {
        Ok(data) => data,
        Err(error) => {
            console_error!("GET /sitemap.xml error: {}", error);
            (Vec::new(), Vec::new())
        }
    };
    let lastmods = posts.iter().map(sitemap_lastmod).collect::<Vec<_>>();
    let glossary_date = glossary
        .first()
        .and_then(|v| v.get("updated_at"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let mut urls = options
        .pages
        .iter()
        .map(|page| {
            let date = match page.category.as_deref() {
                Some("glossary") => {
                    let date =
                        js_sys::Date::new(&JsValue::from_str(&glossary_date.replacen(' ', "T", 1)));
                    if date.get_time().is_nan() {
                        String::new()
                    } else {
                        String::from(date.to_iso_string())
                    }
                }
                Some(category) => posts
                    .iter()
                    .zip(&lastmods)
                    .filter(|(post, _)| {
                        post.get("category").and_then(Value::as_str) == Some(category)
                    })
                    .map(|(_, date)| date.clone())
                    .max()
                    .unwrap_or_default(),
                None => String::new(),
            };
            sitemap_url(
                &format!("{}{}", options.origin, page.path),
                &date,
                &page.priority,
            )
        })
        .collect::<Vec<_>>();
    let mut features = Vec::<(String, String)>::new();
    for (post, modified) in posts.iter().zip(&lastmods) {
        let id = post.get("id").map(rss_js_string).unwrap_or_default();
        urls.push(sitemap_url(
            &format!("{}/post/{id}", options.origin),
            modified,
            "0.8",
        ));
        let category = post
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let feature = post
            .get("special_feature")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !["korea", "apr", "wosm", "people"].contains(&category) || feature.is_empty() {
            continue;
        }
        let path = format!("/feature/{category}/{}", feature_slug(feature));
        if let Some((_, date)) = features.iter_mut().find(|(existing, _)| existing == &path) {
            if modified > date {
                *date = modified.clone();
            }
        } else {
            features.push((path, modified.clone()));
        }
    }
    for (path, modified) in features {
        urls.push(sitemap_url(
            &format!("{}{path}", options.origin),
            &modified,
            "0.8",
        ));
    }
    urls.push(sitemap_url(&format!("{}/help", options.origin), "", "0.4"));
    Response::ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{}\n</urlset>",
        urls.join("\n")
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewsOptions {
    public_date_expr: String,
    origin: String,
}

pub async fn news(req: &mut Request, env: &Env) -> Result<Response> {
    let o: NewsOptions = req.json().await?;
    let date = o.public_date_expr;
    let sql = format!(
        "SELECT id, title, category, {date} AS public_date_kst FROM posts WHERE published = 1 AND {date} <= datetime('now', '+9 hours') AND {date} >= datetime('now', '+9 hours', '-2 days') ORDER BY {date} DESC, id DESC LIMIT 1000"
    );
    let rows = async { env.d1("DB")?.prepare(sql).all().await?.results::<Value>() }.await;
    let rows = match rows {
        Ok(rows) => rows,
        Err(err) => {
            console_error!("GET /sitemap-news.xml query error: {}", err);
            Vec::new()
        }
    };
    let rows = rows.iter().map(|row| {
        let id = row.get("id").map(Value::to_string).unwrap_or_default();
        let title = row.get("title").and_then(Value::as_str).unwrap_or_default();
        let raw_date = row.get("public_date_kst").and_then(Value::as_str).unwrap_or_default();
        let date = raw_date.replacen(' ', "T", 1);
        let suffix = date.as_bytes();
        let has_offset = suffix.len() >= 6 && matches!(suffix[suffix.len()-6], b'+' | b'-') && suffix[suffix.len()-3] == b':';
        let zoned = if date.ends_with('Z') || has_offset { date } else { format!("{date}+09:00") };
        let parsed = js_sys::Date::new(&JsValue::from_str(&zoned));
        let iso = if parsed.get_time().is_nan() { String::new() } else { String::from(parsed.to_iso_string()) };
        format!("  <url>\n    <loc>{}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>BP미디어</news:name>\n        <news:language>ko</news:language>\n      </news:publication>\n      <news:publication_date>{}</news:publication_date>\n      <news:title>{}</news:title>\n    </news:news>\n  </url>", xml_escape(&format!("{}/post/{id}", o.origin)), xml_escape(&iso), xml_escape(title))
    }).collect::<Vec<_>>().join("\n");
    Response::ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"\n        xmlns:news=\"http://www.google.com/schemas/sitemap-news/0.9\">\n{rows}\n</urlset>\n"
    ))
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[derive(Deserialize)]
struct RssOptions {
    origin: String,
    labels: std::collections::HashMap<String, String>,
}

struct RssItem {
    title: String,
    link: String,
    subtitle: String,
    content: String,
    tag: String,
    category: String,
    created: String,
    pub_date: String,
}

fn rfc822(value: &str, is_utc: bool) -> String {
    if value.is_empty() {
        return String::new();
    }
    let date = value.replacen(' ', "T", 1);
    let tail = date.as_bytes();
    let has_offset = tail.len() >= 6
        && matches!(tail[tail.len() - 6], b'+' | b'-')
        && tail[tail.len() - 3] == b':'
        && tail[tail.len() - 5..tail.len() - 3]
            .iter()
            .all(u8::is_ascii_digit)
        && tail[tail.len() - 2..].iter().all(u8::is_ascii_digit);
    let zoned = if date.ends_with('Z') || has_offset {
        date
    } else {
        format!("{date}{}", if is_utc { "Z" } else { "+09:00" })
    };
    let date = js_sys::Date::new(&JsValue::from_str(&zoned));
    if date.get_time().is_nan() {
        String::new()
    } else {
        String::from(date.to_utc_string())
    }
}

pub async fn rss(req: &mut Request, env: &Env) -> Result<Response> {
    let options: RssOptions = req.json().await?;
    let rows=env.d1("DB")?.prepare("SELECT id, category, title, subtitle, content, created_at, publish_at, updated_at, tag, published FROM posts WHERE published = 1 ORDER BY datetime(COALESCE(publish_at, created_at)) DESC, id DESC LIMIT 20").all().await?.results::<Value>()?;
    let items = rows
        .iter()
        .map(|row| {
            let id = row.get("id").map(rss_js_string).unwrap_or_default();
            let get = |name: &str| {
                row.get(name)
                    .filter(|v| rss_truthy(v))
                    .map(rss_js_string)
                    .unwrap_or_default()
            };
            let title = get("title");
            let category = get("category");
            let category = options
                .labels
                .get(&category)
                .or_else(|| options.labels.get("korea"))
                .cloned()
                .unwrap_or_else(|| "BP미디어".into());
            let created = get("created_at");
            let published = get("publish_at");
            RssItem {
                title: if title.is_empty() {
                    format!("post-{id}")
                } else {
                    title
                },
                link: format!("{}/post/{id}", options.origin),
                subtitle: row
                    .get("subtitle")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                content: get("content"),
                tag: get("tag"),
                category,
                pub_date: if published.is_empty() {
                    rfc822(&created, true)
                } else {
                    rfc822(&published, false)
                },
                created,
            }
        })
        .collect::<Vec<_>>();
    let build_date = String::from(js_sys::Date::new_0().to_utc_string());
    let origin = options.origin;
    let items = items.iter().map(|item| {
        let tags = item.tag.split(',').map(super::trim).filter(|tag| !tag.is_empty()).collect::<Vec<_>>();
        let summary = if super::trim(&item.subtitle).is_empty() { rss_excerpt(&item.content) } else { super::trim(&item.subtitle).to_owned() };
        let description = if tags.is_empty() { summary } else if summary.is_empty() { format!("글머리 태그: {}", tags.join(", ")) } else { format!("{summary} | 글머리 태그: {}", tags.join(", ")) };
        let tags = tags.iter().map(|tag| format!("    <category domain=\"tag\">{}</category>\n", xml_escape(tag))).collect::<String>();
        let date = if item.pub_date.is_empty() { String::new() } else { format!("<pubDate>{}</pubDate>", xml_escape(&item.pub_date)) };
        let link = xml_escape(&item.link);
        format!("  <item>\n    <title>{}</title>\n    <link>{link}</link>\n    <guid isPermaLink=\"true\">{link}</guid>\n    <description>{}</description>\n    <category>{}</category>\n{tags}    <bpmedia:created>{}</bpmedia:created>\n    {date}\n  </item>", xml_escape(&item.title), xml_escape(&description), xml_escape(&item.category), xml_escape(&item.created))
    }).collect::<Vec<_>>().join("\n");
    let site = xml_escape(&format!("{}/", origin));
    let feed_url = xml_escape(&format!("{}/rss.xml", origin));
    Response::ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\" xmlns:bpmedia=\"https://bpmedia.net/ns/rss\">\n<channel>\n  <title>BP미디어</title>\n  <link>{site}</link>\n  <description>BP미디어 최신 기사 RSS 피드</description>\n  <language>ko</language>\n  <lastBuildDate>{}</lastBuildDate>\n  <atom:link href=\"{feed_url}\" rel=\"self\" type=\"application/rss+xml\" xmlns:atom=\"http://www.w3.org/2005/Atom\"/>\n{items}\n</channel>\n</rss>",
        xml_escape(&build_date)
    ))
}

fn rss_js_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(rss_js_string)
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
        other => other.to_string(),
    }
}

fn rss_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64() != Some(0.0),
        Value::String(value) => !value.is_empty(),
        _ => true,
    }
}

fn rss_editor_text(raw: &str) -> Option<String> {
    let value: Value = serde_json::from_str(raw).ok()?;
    let blocks = value.get("blocks")?.as_array()?;
    let mut out = Vec::with_capacity(blocks.len());
    for block in blocks {
        if block.is_null() {
            return None;
        }
        let kind = block.get("type").and_then(Value::as_str).unwrap_or("");
        if matches!(kind, "paragraph" | "header" | "quote") {
            let data = block.get("data").filter(|data| !data.is_null())?;
            out.push(
                data.get("text")
                    .filter(|value| rss_truthy(value))
                    .map(rss_js_string)
                    .unwrap_or_default(),
            );
        } else if kind == "list" {
            let data = block.get("data").filter(|data| !data.is_null())?;
            let items = match data.get("items") {
                None => Vec::new(),
                Some(value) if !rss_truthy(value) => Vec::new(),
                Some(value) => value.as_array()?.clone(),
            };
            let mut entries = Vec::with_capacity(items.len());
            for entry in items {
                entries.push(match entry {
                    Value::String(text) => text,
                    Value::Null => return None,
                    other => other
                        .get("content")
                        .filter(|value| rss_truthy(value))
                        .map(rss_js_string)
                        .unwrap_or_default(),
                });
            }
            out.push(entries.join(" "));
        } else {
            out.push(String::new());
        }
    }
    Some(out.join(" "))
}

fn rss_excerpt(content: &str) -> String {
    let trimmed = super::trim(content);
    let text = if trimmed.starts_with('{') {
        rss_editor_text(trimmed).unwrap_or_else(|| trimmed.to_owned())
    } else {
        trimmed.to_owned()
    };
    let text = js_sys::JsString::from(text.as_str())
        .replace_by_pattern(&js_sys::RegExp::new(r"<[^>]+>", "g"), " ")
        .replace_by_pattern(&js_sys::RegExp::new(r"\s+", "g"), " ")
        .trim();
    if text.length() <= 220 {
        String::from(text)
    } else {
        format!("{}...", String::from(text.slice(0, 220).trim_end()))
    }
}
