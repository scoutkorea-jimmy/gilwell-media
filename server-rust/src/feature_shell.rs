use serde::Deserialize;
use serde_json::json;
use worker::*;

#[derive(Deserialize)]
struct Input {
    values: Vec<String>,
}

fn build(input: Input) -> Result<String> {
    let mut html = String::new();
    let mut remaining = include_str!("feature_shell.html");
    while let Some((before, after)) = remaining.split_once("@@") {
        let Some((key, rest)) = after.split_once("@@") else {
            return Err(Error::RustError("invalid feature template".into()));
        };
        let index = key
            .parse::<usize>()
            .map_err(|_| Error::RustError("invalid feature placeholder".into()))?;
        let value = input
            .values
            .get(index)
            .ok_or_else(|| Error::RustError("missing feature value".into()))?;
        html.push_str(before);
        html.push_str(value);
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
    parts: crate::feature_parts::Input,
    values: Vec<String>,
}

pub async fn render_combined(req: &mut Request) -> Result<Response> {
    let mut input: Combined = req.json().await?;
    let (lead, cards, rail) = crate::feature_parts::build(input.parts)?;
    if input.values.len() < 28 {
        return Err(Error::RustError("missing feature values".into()));
    }
    // Slots correspond to the lead, grid and rail placeholders in feature_shell.html.
    input.values[25] = lead;
    input.values[26] = if cards.is_empty() {
        String::new()
    } else {
        format!("<div class=\"feature-page-grid\">{cards}</div>")
    };
    input.values[27] = rail;
    let html = build(Input {
        values: input.values,
    })?;
    Response::from_json(&json!({"html":html}))
}
