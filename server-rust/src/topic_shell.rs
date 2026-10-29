use serde::Deserialize;
use serde_json::json;
use worker::*;

#[derive(Deserialize)]
struct Topic {
    slug: String,
    name: String,
    english: String,
    age: String,
    tagline: String,
    lead: String,
    intro: String,
    focus: String,
    question: String,
    answer: String,
    activities: Vec<(String, String)>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    title: String,
    meta: String,
    article_list: String,
    news: String,
    topic: Topic,
    topics: Vec<Topic>,
    #[serde(rename = "asset_version")]
    asset_version: String,
    #[serde(rename = "site_version")]
    site_version: String,
    #[serde(rename = "admin_version")]
    admin_version: String,
    #[serde(rename = "encoded_name")]
    encoded_name: String,
}
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn build(o: Input) -> Result<String> {
    let t = &o.topic;
    let stages=o.topics.iter().map(|item| {
        let current=item.slug==t.slug;
        let aria=if current {" aria-current=\"page\""} else {""};
        let state=if current {"지금 보고 있어요"} else {"활동 알아보기"};
        format!("<a class=\"topic-stage-card\" href=\"/topics/{}\"{aria}>\n      <img src=\"/img/topics/{}.webp?v={}\" alt=\"\" width=\"1536\" height=\"1024\" decoding=\"async\">\n      <span class=\"topic-stage-body\"><span class=\"topic-stage-heading\">{}<span class=\"topic-age\">{}</span></span><span class=\"topic-stage-caption\">{}</span><span class=\"topic-stage-state\">{state} <span aria-hidden=\"true\">↗</span></span></span>\n    </a>",item.slug,item.slug,o.asset_version,item.name,item.age,item.tagline)
    }).collect::<String>();
    let activities=t.activities.iter().enumerate().map(|(i,(heading,copy))|format!("<article class=\"topic-activity-card\"><span class=\"topic-step\" aria-hidden=\"true\">0{}</span><h3>{heading}</h3><p>{copy}</p></article>",i+1)).collect::<String>();
    let title = esc(&o.title);
    let rover = t.slug == "rover-scouts";
    let rover_link = if rover {
        " · <a href=\"https://www.scout.org/what-we-do/world-scout-events/world-scout-moot\">WOSM 세계스카우트무트 안내 ↗</a>"
    } else {
        ""
    };
    let rover_note = if rover {
        " 한국스카우트연맹은 로버스카우트를 지도자 소개에서 설명합니다."
    } else {
        ""
    };
    let mut html = String::new();
    let mut remaining = include_str!("topic_shell.html");
    while let Some((before, after)) = remaining.split_once("@@") {
        let Some((key, rest)) = after.split_once("@@") else {
            return Err(Error::RustError("invalid topic template".into()));
        };
        html.push_str(before);
        html.push_str(match key {
            "TITLE" => &title,
            "META" => &o.meta,
            "ARTICLE_LIST" => &o.article_list,
            "NEWS" => &o.news,
            "ASSET_VERSION" => &o.asset_version,
            "SITE_VERSION" => &o.site_version,
            "ADMIN_VERSION" => &o.admin_version,
            "STAGES" => &stages,
            "ACTIVITIES" => &activities,
            "ENCODED_NAME" => &o.encoded_name,
            "NAME" => &t.name,
            "SLUG" => &t.slug,
            "ENGLISH" => &t.english,
            "TAGLINE" => &t.tagline,
            "LEAD" => &t.lead,
            "INTRO" => &t.intro,
            "FOCUS" => &t.focus,
            "QUESTION" => &t.question,
            "ANSWER" => &t.answer,
            "ROVER_LINK" => rover_link,
            "ROVER_NOTE" => rover_note,
            _ => return Err(Error::RustError("invalid topic placeholder".into())),
        });
        remaining = rest;
    }
    html.push_str(remaining);
    Ok(html)
}

pub async fn render(req: &mut Request) -> Result<Response> {
    let html = build(req.json().await?)?;
    Response::from_json(&json!({"html":html}))
}

#[derive(Deserialize)]
struct Combined {
    news: crate::topic_news::Input,
    shell: Input,
}

pub async fn render_combined(req: &mut Request) -> Result<Response> {
    let mut input: Combined = req.json().await?;
    (input.shell.news, input.shell.article_list) = crate::topic_news::build(input.news);
    let html = build(input.shell)?;
    Response::from_json(&json!({"html":html}))
}
