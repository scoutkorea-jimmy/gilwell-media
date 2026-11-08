use serde::Deserialize;
use serde_json::json;
use worker::*;

#[derive(Deserialize)]
pub(crate) struct Input {
    items: Vec<Item>,
    label: String,
    color: String,
    background: String,
}
#[derive(Deserialize)]
struct Item {
    id: String,
    title: String,
    image: String,
    excerpt: String,
    has_excerpt: bool,
    tag: String,
    has_tag: bool,
    author: String,
    has_author: bool,
    date: String,
}
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub(crate) fn build(o: Input) -> Result<(String, String, String)> {
    let Some(first) = o.items.first() else {
        return Err(Error::RustError("empty feature".into()));
    };
    let color = &o.color;
    let label = esc(&o.label);
    let image = if first.image.is_empty() {
        "<div class=\"feature-page-lead-media placeholder\">Feature Lead</div>".into()
    } else {
        format!(
            "<div class=\"feature-page-lead-media\"><img src=\"{}\" alt=\"{}\"></div>",
            esc(&first.image),
            esc(&first.title)
        )
    };
    let tag = if first.has_tag {
        format!("<span class=\"post-page-tag\">{}</span>", esc(&first.tag))
    } else {
        String::new()
    };
    let author = if first.has_author {
        format!("<span>{}</span>", esc(&first.author))
    } else {
        String::new()
    };
    let excerpt = if first.has_excerpt {
        format!("<p>{}</p>", esc(&first.excerpt))
    } else {
        String::new()
    };
    let id = &first.id;
    let lead = format!(
        "<article class=\"feature-page-lead\">\n    {image}\n    <div class=\"feature-page-lead-copy\">\n      <div class=\"feature-page-meta-row\">\n        <span class=\"category-tag\" style=\"background:{color};\">{label}</span>\n        {tag}\n        <span>{}</span>\n        {author}\n      </div>\n      <h2><a href=\"/post/{id}\">{}</a></h2>\n      {excerpt}\n      <a class=\"read-more\" href=\"/post/{id}\">기사 읽기</a>\n    </div>\n  </article>",
        esc(&first.date),
        esc(&first.title)
    );
    let cards=o.items.iter().skip(1).map(|item| {
        let id=&item.id;
        let title=esc(&item.title);
        let thumb=if item.image.is_empty() { format!("<div class=\"post-card-thumb placeholder\" style=\"background:linear-gradient(135deg, {}, rgba(31,31,31,0.04));\">Feature Story</div>",o.background) } else { format!("<img class=\"post-card-thumb\" src=\"{}\" alt=\"{title}\">",esc(&item.image)) };
        let tag=if item.has_tag {format!("<span class=\"post-kicker\">{}</span>",esc(&item.tag))} else {String::new()};
        let excerpt=if item.has_excerpt {format!("<p class=\"post-card-excerpt\">{}</p>",esc(&item.excerpt))} else {String::new()};
        let author=if item.has_author {format!(" · {}",esc(&item.author))} else {String::new()};
        format!("<article class=\"post-card\" style=\"--card-accent:{color};\">\n    <a href=\"/post/{id}\" aria-label=\"{title}\">\n      {thumb}\n    </a>\n    <div class=\"post-card-body\">\n      <div class=\"post-card-labels\">\n        <span class=\"category-tag\" style=\"background:{color};\">{label}</span>\n        {tag}\n      </div>\n      <div class=\"post-card-head\">\n        <h3><a href=\"/post/{id}\" style=\"color:inherit;text-decoration:none;\">{title}</a></h3>\n        {excerpt}\n      </div>\n      <div class=\"post-card-footer\">\n        <div class=\"post-card-meta\">{}{author}</div>\n        <a class=\"read-more\" href=\"/post/{id}\">기사 읽기</a>\n      </div>\n    </div>\n  </article>",esc(&item.date))
    }).collect::<String>();
    let rail=o.items.iter().enumerate().map(|(index,item)| {
        let prefix=if index==0 {"Lead Story · "} else {""};
        format!("<article class=\"feature-page-rail-item\">\n    <a href=\"/post/{}\">\n      <strong>{}</strong>\n      <span>{prefix}{}</span>\n    </a>\n  </article>",item.id,esc(&item.title),esc(&item.date))
    }).collect::<String>();
    Ok((lead, cards, rail))
}

pub async fn render(req: &mut Request) -> Result<Response> {
    let (lead, cards, rail) = build(req.json().await?)?;
    Response::from_json(&json!({"lead":lead,"cards":cards,"rail":rail}))
}
