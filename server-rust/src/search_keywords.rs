use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use worker::{js_sys, *};

#[derive(Deserialize)]
struct Input {
    rows: Vec<Value>,
    limit: f64,
}

fn engine(host: &str) -> Option<(&'static str, &'static [&'static str])> {
    let labels: Vec<&str> = host.split('.').collect();
    for (name, display, params) in [
        ("google", "Google", &["q"][..]),
        ("naver", "Naver", &["query"][..]),
        ("daum", "Daum", &["q"][..]),
        ("bing", "Bing", &["q"][..]),
        ("yahoo", "Yahoo", &["p"][..]),
        ("duckduckgo", "DuckDuckGo", &["q"][..]),
        ("baidu", "Baidu", &["wd", "word"][..]),
        ("yandex", "Yandex", &["text"][..]),
        ("ecosia", "Ecosia", &["q"][..]),
        ("zum", "Zum", &["query"][..]),
        ("nate", "Nate", &["q"][..]),
    ] {
        if labels
            .iter()
            .take(labels.len().saturating_sub(1))
            .any(|label| label.eq_ignore_ascii_case(name))
        {
            return Some((display, params));
        }
    }
    None
}

fn lowercase(value: &str) -> String {
    String::from(js_sys::JsString::from(value).to_lower_case())
}

pub async fn summarize(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    let mut engine_positions = HashMap::new();
    let mut engines: Vec<(&str, f64)> = Vec::new();
    let mut keyword_positions = HashMap::new();
    let mut keywords: Vec<(String, &str, f64)> = Vec::new();
    let mut total = 0.0;
    let mut known = 0.0;
    for row in input.rows {
        let host = row
            .get("referrer_host")
            .and_then(Value::as_str)
            .unwrap_or("");
        let url = row
            .get("referrer_url")
            .and_then(Value::as_str)
            .and_then(|value| Url::parse(value).ok());
        let detected = engine(&lowercase(host))
            .or_else(|| url.as_ref().and_then(|url| url.host_str()).and_then(engine));
        let Some((detected, _)) = detected else {
            continue;
        };
        let count = crate::analytics::score_number(row.get("visits"));
        let count = if count.is_nan() { 0.0 } else { count };
        total += count;
        let index = *engine_positions.entry(detected).or_insert_with(|| {
            engines.push((detected, 0.0));
            engines.len() - 1
        });
        engines[index].1 += count;
        let Some((url, (source, params))) = url
            .as_ref()
            .and_then(|url| engine(url.host_str()?).map(|engine| (url, engine)))
        else {
            continue;
        };
        let mut keyword = None;
        for param in params {
            if let Some((_, raw)) = url.query_pairs().find(|(name, _)| name == param) {
                let value = String::from(js_sys::JsString::from(raw.as_ref()).trim());
                let len = value.encode_utf16().count();
                if (2..=100).contains(&len) {
                    keyword = Some(value);
                    break;
                }
            }
        }
        if let Some(keyword) = keyword {
            known += count;
            let key = lowercase(&keyword);
            let index = *keyword_positions.entry(key).or_insert_with(|| {
                keywords.push((keyword, source, 0.0));
                keywords.len() - 1
            });
            keywords[index].2 += count;
        }
    }
    engines.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    let options = js_sys::Object::new();
    keywords.sort_by(|a, b| {
        b.2.partial_cmp(&a.2)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                js_sys::JsString::from(a.0.as_str())
                    .locale_compare(&b.0, &locales, &options)
                    .cmp(&0)
            })
    });
    let total_unique = keywords.len();
    let limit = input.limit.max(0.0) as usize;
    Response::from_json(
        &json!({"total_visits":total,"known_visits":known,"hidden_visits":total-known,"total_unique":total_unique,
        "by_engine":engines.into_iter().map(|(engine,visits)|json!({"engine":engine,"visits":visits})).collect::<Vec<_>>(),
        "keywords":keywords.into_iter().take(limit).map(|(keyword,engine,visits)|json!({"keyword":keyword,"engine":engine,"visits":visits})).collect::<Vec<_>>() }),
    )
}
