use serde::Deserialize;
use serde_json::json;
use worker::*;

#[derive(Deserialize)]
pub(crate) struct Input {
    items: Vec<Item>,
    origin: String,
    topic_name: String,
}
#[derive(Deserialize)]
struct Item {
    id: String,
    title: String,
    name_json: Option<String>,
    subtitle: String,
    show_subtitle: bool,
    image: String,
    x: String,
    y: String,
    date: String,
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub(crate) fn build(input: Input) -> (String, String) {
    let html = if input.items.is_empty() {
        "<p>아직 관련 기사가 없습니다. 새로운 소식이 올라오면 여기에 표시됩니다.</p>".to_owned()
    } else {
        input.items.iter().map(|item| {
            let id = &item.id;
            let image = if item.image.is_empty() { String::new() } else {
                format!("<a class=\"topic-news-image\" href=\"/post/{id}\" tabindex=\"-1\" aria-hidden=\"true\"><img src=\"{}\" alt=\"\" width=\"640\" height=\"400\" loading=\"lazy\" decoding=\"async\" style=\"object-position:{}% {}%\"></a>", escape(&item.image), item.x, item.y)
            };
            let subtitle = if item.show_subtitle { format!("<p>{}</p>", escape(&item.subtitle)) } else { String::new() };
            format!("<article class=\"topic-news-card\">\n        {image}\n        <div class=\"topic-news-body\"><p class=\"topic-note\">{}</p>\n        <h3><a href=\"/post/{id}\">{}</a></h3>\n        {subtitle}\n        <a href=\"/post/{id}\" class=\"topic-read\">기사 읽기 →</a></div>\n      </article>",escape(&item.date),escape(&item.title))
        }).collect::<String>()
    };
    let quoted = |s: &str| serde_json::to_string(s).expect("strings serialize");
    let list = input
        .items
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let name = item
                .name_json
                .as_ref()
                .map(|value| format!(",\"name\":{value}"))
                .unwrap_or_default();
            format!(
                "{{\"@type\":\"ListItem\",\"position\":{},\"url\":{}{name}}}",
                i + 1,
                quoted(&format!("{}/post/{}", input.origin, item.id))
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let article_list = format!("{{\"@context\":\"https://schema.org\",\"@type\":\"ItemList\",\"name\":{},\"itemListElement\":[{list}]}}",quoted(&format!("{} 관련 최신 소식",input.topic_name))).replace('<', "\\u003c");
    (html, article_list)
}

pub async fn render(req: &mut Request) -> Result<Response> {
    let (html, article_list) = build(req.json().await?);
    Response::from_json(&json!({"html": html, "articleList":article_list}))
}
