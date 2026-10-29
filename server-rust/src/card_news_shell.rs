use serde::Deserialize;
use serde_json::json;
use worker::*;

#[derive(Deserialize)]
struct Input {
    id: String,
    title: String,
    data: String,
    version: String,
    edit: bool,
}

pub async fn render(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    let title = input
        .title
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    let template = include_str!("card_news_shell.html");
    let mut html = String::new();
    let mut remaining = template;
    while let Some((before, after)) = remaining.split_once("@@") {
        let Some((key, rest)) = after.split_once("@@") else {
            return Err(Error::RustError("invalid card news template".into()));
        };
        html.push_str(before);
        html.push_str(match key {
            "TITLE" => &title,
            "ID" => &input.id,
            "DATA" => &input.data,
            "VERSION" => &input.version,
            "EDIT" if input.edit => include_str!("card_news_edit.html"),
            "EDIT" => "",
            _ => return Err(Error::RustError("invalid card news placeholder".into())),
        });
        remaining = rest;
    }
    html.push_str(remaining);
    Response::from_json(&json!({"html":html}))
}
