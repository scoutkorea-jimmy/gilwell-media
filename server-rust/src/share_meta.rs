use serde::Deserialize;
use serde_json::json;
use worker::{js_sys, *};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    page_key: String,
    title: String,
    description: String,
    url: String,
    image_url: String,
    google_verification: String,
    naver_verification: String,
    keywords: String,
    adsense: String,
    image_alt: String,
    default_image_path: String,
    image_width: u32,
    image_height: u32,
    structured_url: String,
    site_origin: String,
    home_description: String,
    publisher: String,
    person: String,
    schema: String,
    topic: String,
    breadcrumb: String,
    item_list_elements: Vec<serde_json::Value>,
}
fn quoted(value: &str) -> String {
    serde_json::to_string(value).expect("strings serialize")
}
fn structured(o: &Input) -> Vec<String> {
    let origin = &o.site_origin;
    let url = &o.structured_url;
    let image = if o.image_url.is_empty() {
        String::new()
    } else {
        format!(",\"image\":{}", quoted(&o.image_url))
    };
    let mut entries = vec![
        format!(
            "{{\"@context\":\"https://schema.org\",{},\"member\":{}{image}}}",
            o.publisher
                .strip_prefix('{')
                .and_then(|s| s.strip_suffix('}'))
                .unwrap_or(&o.publisher),
            o.person
        ),
        format!(
            "{{\"@context\":\"https://schema.org\",\"@type\":\"WebSite\",\"@id\":{},\"name\":\"BP미디어\",\"alternateName\":[\"비피미디어\",\"The BP Media\",\"bpmedia.net\"],\"url\":{},\"inLanguage\":\"ko-KR\",\"description\":{},\"publisher\":{},\"potentialAction\":{{\"@type\":\"SearchAction\",\"target\":{},\"query-input\":\"required name=search_term_string\"}}{image}}}",
            quoted(&format!("{origin}/#website")),
            quoted(&format!("{origin}/")),
            quoted(&o.home_description),
            o.publisher,
            quoted(&format!("{origin}/search?q={{search_term_string}}"))
        ),
    ];
    let main = if o.page_key == "home" {
        format!(
            ",\"mainEntity\":{{\"@type\":\"ItemList\",\"@id\":{},\"name\":\"BP미디어 최신 기사\"}}",
            quoted(&format!("{url}#itemlist"))
        )
    } else {
        String::new()
    };
    let primary = if o.image_url.is_empty() {
        String::new()
    } else {
        format!(",\"primaryImageOfPage\":{}", quoted(&o.image_url))
    };
    entries.push(format!("{{\"@context\":\"https://schema.org\",\"@type\":{},\"@id\":{},\"name\":{},\"headline\":{},\"description\":{},\"url\":{},\"isPartOf\":{{\"@type\":\"WebSite\",\"@id\":{},\"url\":{},\"name\":\"BP미디어 · bpmedia.net\"}},\"about\":{{\"@type\":\"Thing\",\"name\":{}}},\"keywords\":{},\"inLanguage\":\"ko-KR\",\"publisher\":{}{main}{primary}}}",quoted(&o.schema),quoted(&format!("{url}#webpage")),quoted(&o.title),quoted(&o.title),quoted(&o.description),quoted(url),quoted(&format!("{origin}/#website")),quoted(&format!("{origin}/")),quoted(&o.topic),quoted(&o.keywords),o.publisher));
    if !o.item_list_elements.is_empty()
        && [
            "home", "latest", "korea", "apr", "wosm", "people", "glossary",
        ]
        .contains(&o.page_key.as_str())
    {
        let items = o
            .item_list_elements
            .iter()
            .enumerate()
            .map(|(i, item)| {
                let url = item
                    .get("url")
                    .map(|v| format!(",\"url\":{v}"))
                    .unwrap_or_default();
                let name = item
                    .get("title")
                    .map(|v| format!(",\"name\":{v}"))
                    .unwrap_or_default();
                format!(
                    "{{\"@type\":\"ListItem\",\"position\":{}{url}{name}}}",
                    i + 1
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        entries.push(format!("{{\"@context\":\"https://schema.org\",\"@type\":\"ItemList\",\"@id\":{},\"name\":{},\"itemListElement\":[{items}]}}",quoted(&format!("{url}#itemlist")),quoted(&o.topic)));
    }
    if !o.breadcrumb.is_empty() && o.page_key != "home" {
        entries.push(format!("{{\"@context\":\"https://schema.org\",\"@type\":\"BreadcrumbList\",\"itemListElement\":[{{\"@type\":\"ListItem\",\"position\":1,\"name\":\"홈\",\"item\":{}}},{{\"@type\":\"ListItem\",\"position\":2,\"name\":{},\"item\":{}}}]}}",quoted(&format!("{origin}/")),quoted(&o.breadcrumb),quoted(url)));
    }
    entries
        .into_iter()
        .map(|entry| entry.replace('<', "\\u003c"))
        .collect()
}
fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn lower(value: &str) -> String {
    String::from(js_sys::JsString::from(value).to_lower_case())
}
pub async fn render(req: &mut Request) -> Result<Response> {
    let o: Input = req.json().await?;
    let title = escape(&o.title);
    let desc = escape(&o.description);
    let url = escape(&o.url);
    let image = escape(&o.image_url);
    let alt = escape(&o.image_alt);
    let clean = crate::trim(&o.image_url);
    let normalized = lower(clean);
    let default_path = lower(&o.default_image_path);
    let default_image =
        normalized.contains(&format!("{default_path}?")) || normalized.ends_with(&default_path);
    let image_type = if clean.starts_with("data:image/") {
        clean
            .strip_prefix("data:")
            .and_then(|v| v.split(';').next())
            .filter(|v| v.len() > "image/".len())
            .map(lower)
            .unwrap_or_default()
    } else if default_image || normalized.contains(".png") {
        "image/png".into()
    } else if normalized.contains(".webp") {
        "image/webp".into()
    } else if normalized.contains(".gif") {
        "image/gif".into()
    } else if normalized.contains(".jpg") || normalized.contains(".jpeg") {
        "image/jpeg".into()
    } else {
        String::new()
    };
    let robots = if o.page_key == "search" {
        "<meta name=\"robots\" content=\"noindex,follow\"/>"
    } else {
        "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\"/>"
    };
    let mut lines = vec![
        format!(
            "<meta name=\"google-adsense-account\" content=\"{}\"/>",
            o.adsense
        ),
        "<link rel=\"preconnect\" href=\"https://pagead2.googlesyndication.com\" crossorigin/>"
            .into(),
        format!(
            "<script async src=\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={}\" crossorigin=\"anonymous\"></script>",
            o.adsense
        ),
        robots.into(),
        format!("<meta name=\"description\" content=\"{desc}\"/>"),
        format!(
            "<meta name=\"keywords\" content=\"{}\"/>",
            escape(&o.keywords)
        ),
        "<link rel=\"preconnect\" href=\"https://cdn.jsdelivr.net\" crossorigin/>".into(),
        "<link rel=\"preconnect\" href=\"https://t1.kakaocdn.net\" crossorigin/>".into(),
        "<link rel=\"dns-prefetch\" href=\"https://t1.daumcdn.net\"/>".into(),
        "<link rel=\"dns-prefetch\" href=\"https://display.ad.daum.net\"/>".into(),
        "<meta property=\"og:locale\" content=\"ko_KR\"/>".into(),
        "<meta property=\"og:type\" content=\"website\"/>".into(),
        format!("<meta property=\"og:title\" content=\"{title}\"/>"),
        format!("<meta property=\"og:description\" content=\"{desc}\"/>"),
        format!("<meta property=\"og:url\" content=\"{url}\"/>"),
    ];
    if !image.is_empty() {
        lines.push(format!("<meta property=\"og:image\" content=\"{image}\"/>"));
        lines.push(format!(
            "<meta property=\"og:image:secure_url\" content=\"{image}\"/>"
        ));
    }
    if !image_type.is_empty() {
        lines.push(format!(
            "<meta property=\"og:image:type\" content=\"{}\"/>",
            escape(&image_type)
        ));
    }
    if default_image && !clean.is_empty() {
        lines.push(format!(
            "<meta property=\"og:image:width\" content=\"{}\"/>",
            o.image_width
        ));
        lines.push(format!(
            "<meta property=\"og:image:height\" content=\"{}\"/>",
            o.image_height
        ));
    }
    if !image.is_empty() {
        lines.push(format!(
            "<meta property=\"og:image:alt\" content=\"{alt}\"/>"
        ));
    }
    lines.push("<meta property=\"og:site_name\" content=\"BP미디어 · bpmedia.net\"/>".into());
    lines.push(format!(
        "<meta name=\"twitter:card\" content=\"{}\"/>",
        if image.is_empty() {
            "summary"
        } else {
            "summary_large_image"
        }
    ));
    lines.push(format!(
        "<meta name=\"twitter:title\" content=\"{title}\"/>"
    ));
    lines.push(format!(
        "<meta name=\"twitter:description\" content=\"{desc}\"/>"
    ));
    if !image.is_empty() {
        lines.push(format!(
            "<meta name=\"twitter:image\" content=\"{image}\"/>"
        ));
        lines.push(format!(
            "<meta name=\"twitter:image:alt\" content=\"{alt}\"/>"
        ));
    }
    if !o.google_verification.is_empty() {
        lines.push(format!(
            "<meta name=\"google-site-verification\" content=\"{}\"/>",
            escape(&o.google_verification)
        ));
    }
    if !o.naver_verification.is_empty() {
        lines.push(format!(
            "<meta name=\"naver-site-verification\" content=\"{}\"/>",
            escape(&o.naver_verification)
        ));
    }
    lines.push(format!("<link rel=\"canonical\" href=\"{url}\"/>"));
    for entry in structured(&o) {
        lines.push(format!(
            "<script type=\"application/ld+json\">{entry}</script>"
        ));
    }
    Response::from_json(&json!({"html":lines.join("\n  ")}))
}
