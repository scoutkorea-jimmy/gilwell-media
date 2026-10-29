use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use worker::{js_sys, *};

#[derive(Deserialize)]
struct Input {
    rows: Vec<Value>,
    label: String,
}
#[derive(Clone)]
struct Tag {
    name: String,
    key: String,
    count: u64,
    published: u64,
    views: f64,
    categories: Vec<String>,
    score: f64,
}
struct Pair {
    source: String,
    target: String,
    source_key: String,
    target_key: String,
    count: u64,
}
struct Post {
    id: f64,
    title: String,
    category: String,
    published: bool,
    keywords: Vec<String>,
    keyword_keys: Vec<String>,
}
fn lower(s: &str) -> String {
    String::from(js_sys::JsString::from(s).to_lower_case())
}
fn text(row: &Value, key: &str) -> String {
    match row.get(key) {
        None | Some(Value::Null) | Some(Value::Bool(false)) => String::new(),
        Some(value) => crate::post_routes::js_string(value),
    }
}
fn cmp(a: &str, b: &str, locale: &str) -> std::cmp::Ordering {
    let locales = js_sys::Array::new();
    locales.push(&locale.into());
    js_sys::JsString::from(a)
        .locale_compare(b, &locales, &js_sys::Object::new())
        .cmp(&0)
}
fn fixed(value: f64) -> f64 {
    #[allow(deprecated)]
    let number = js_sys::Number::new(&wasm_bindgen::JsValue::from_f64(value));
    number
        .to_fixed(4)
        .ok()
        .and_then(|v| String::from(v).parse().ok())
        .unwrap_or(0.0)
}

pub async fn aggregate(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    Response::from_json(&aggregate_rows(input.rows, input.label))
}

pub(crate) fn aggregate_rows(rows: Vec<Value>, label: String) -> Value {
    let mut tag_indexes = HashMap::new();
    let mut tags: Vec<Tag> = Vec::new();
    let mut pair_indexes = HashMap::new();
    let mut pairs: Vec<Pair> = Vec::new();
    let mut posts = Vec::new();
    for row in rows {
        let mut seen = HashSet::new();
        let mut words = Vec::new();
        let mut word_keys = Vec::new();
        for field in ["tag", "meta_tags"] {
            for value in text(&row, field).split(',') {
                let word = crate::trim(value).to_owned();
                let key = lower(&word);
                if !word.is_empty() && seen.insert(key.clone()) {
                    words.push(word);
                    word_keys.push(key);
                }
            }
        }
        if words.is_empty() {
            continue;
        }
        let category = text(&row, "category");
        let published = crate::analytics::score_number(row.get("published")) == 1.0;
        let views = crate::analytics::score_number(row.get("pageviews"));
        for (word, key) in words.iter().zip(&word_keys) {
            let index = *tag_indexes.entry(key.clone()).or_insert_with(|| {
                tags.push(Tag {
                    name: word.clone(),
                    key: key.clone(),
                    count: 0,
                    published: 0,
                    views: 0.0,
                    categories: Vec::new(),
                    score: 0.0,
                });
                tags.len() - 1
            });
            let item = &mut tags[index];
            item.count += 1;
            item.published += u64::from(published);
            item.views += views;
            if !category.is_empty() && !item.categories.contains(&category) {
                item.categories.push(category.clone());
            }
        }
        for i in 0..words.len() {
            for j in i + 1..words.len() {
                let a = &word_keys[i];
                let b = &word_keys[j];
                let key = if a.encode_utf16().cmp(b.encode_utf16()).is_gt() {
                    format!("{b}::{a}")
                } else {
                    format!("{a}::{b}")
                };
                let index = *pair_indexes.entry(key).or_insert_with(|| {
                    pairs.push(Pair {
                        source: words[i].clone(),
                        target: words[j].clone(),
                        source_key: a.clone(),
                        target_key: b.clone(),
                        count: 0,
                    });
                    pairs.len() - 1
                });
                pairs[index].count += 1;
            }
        }
        posts.push(Post {
            id: crate::analytics::score_number(row.get("id")),
            title: text(&row, "title"),
            category,
            published,
            keywords: words,
            keyword_keys: word_keys,
        });
    }
    let max_count = tags.iter().map(|t| t.count).max().unwrap_or(1).max(1) as f64;
    let max_views = tags.iter().map(|t| t.views).fold(1.0_f64, f64::max);
    for tag in &mut tags {
        tag.categories.sort_by(|a, b| cmp(a, b, "en"));
        tag.score = fixed((tag.count as f64 / max_count * 0.38) + (tag.views / max_views * 0.62));
    }
    tags.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(b.count.cmp(&a.count))
            .then(b.views.total_cmp(&a.views))
            .then_with(|| cmp(&a.name, &b.name, "ko"))
    });
    let total_assignments: u64 = tags.iter().map(|t| t.count).sum();
    let items:Vec<Value>=tags.iter().take(80).map(|t|json!({"tag":t.name,"count":t.count,"published_count":t.published,"draft_count":t.count-t.published,"pageviews":t.views,"categories":t.categories,"weighted_score":t.score})).collect();
    let top: Vec<&Tag> = tags.iter().take(22).collect();
    let allowed: HashSet<&str> = top.iter().map(|tag| tag.key.as_str()).collect();
    let mut links: Vec<&Pair> = pairs
        .iter()
        .filter(|p| {
            allowed.contains(p.source_key.as_str())
                && allowed.contains(p.target_key.as_str())
                && p.count >= 1
        })
        .collect();
    links.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| cmp(&a.source, &b.source, "ko"))
    });
    links.truncate(56);
    let graph_links:Vec<Value>=links.iter().map(|p|json!({"id":format!("tt:{}::{}",p.source,p.target),"type":"tag_tag","source":format!("tag:{}",p.source),"target":format!("tag:{}",p.target),"count":p.count})).collect();
    let mut articles: Vec<(&Post, Vec<String>)> = posts
        .iter()
        .map(|post| {
            (
                post,
                post.keywords
                    .iter()
                    .zip(&post.keyword_keys)
                    .filter(|(_, key)| allowed.contains(key.as_str()))
                    .map(|(word, _)| word.clone())
                    .collect::<Vec<_>>(),
            )
        })
        .filter(|(_, words)| !words.is_empty())
        .collect();
    articles.sort_by(|a, b| {
        b.1.len()
            .cmp(&a.1.len())
            .then(b.0.published.cmp(&a.0.published))
            .then(b.0.id.total_cmp(&a.0.id))
    });
    articles.truncate(32);
    let graph_articles:Vec<Value>=articles.iter().map(|(p,words)|json!({"id":p.id,"title":p.title,"category":p.category,"published":p.published,"keywords":words})).collect();
    let nodes:Vec<Value>=top.iter().map(|t|json!({"id":format!("tag:{}",t.name),"label":t.name,"node_type":"tag","count":t.count,"pageviews":t.views,"weighted_score":t.score,"categories":t.categories})).collect();
    json!({"range_label":label,"total_unique_tags":tags.len(),"total_tag_assignments":total_assignments,"items":items,
        "graph":{"nodes":nodes,"links":graph_links,"articles":graph_articles,"counts":{"tags":top.len(),"posts":articles.len(),"tag_tag_links":links.len()},"filters":{"node_types":["tag"],"link_types":["tag_tag"]}}})
}
