use serde::{
    Deserialize, Deserializer,
    de::{SeqAccess, Visitor},
};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use worker::js_sys;
#[derive(Deserialize)]
pub(crate) struct Visit {
    #[serde(deserialize_with = "compat_text")]
    viewer_key: Option<String>,
    #[serde(deserialize_with = "compat_text")]
    path: Option<String>,
    #[serde(deserialize_with = "compat_text")]
    referrer_host: Option<String>,
    #[serde(deserialize_with = "compat_text")]
    referrer_url: Option<String>,
    #[serde(deserialize_with = "compat_text")]
    utm_source: Option<String>,
    #[serde(deserialize_with = "compat_text")]
    utm_medium: Option<String>,
    #[serde(deserialize_with = "compat_text")]
    utm_campaign: Option<String>,
}
fn compat_text<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    struct TextVisitor;
    impl<'de> Visitor<'de> for TextVisitor {
        type Value = Option<String>;
        fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str("a D1 text, null, number or byte array")
        }
        fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
        fn visit_none<E: serde::de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
        fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<Self::Value, E> {
            Ok(Some(value.to_owned()))
        }
        fn visit_string<E: serde::de::Error>(self, value: String) -> Result<Self::Value, E> {
            Ok(Some(value))
        }
        fn visit_bool<E: serde::de::Error>(self, value: bool) -> Result<Self::Value, E> {
            Ok(Some(value.to_string()))
        }
        fn visit_i64<E: serde::de::Error>(self, value: i64) -> Result<Self::Value, E> {
            Ok(Some(value.to_string()))
        }
        fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<Self::Value, E> {
            Ok(Some(value.to_string()))
        }
        fn visit_f64<E: serde::de::Error>(self, value: f64) -> Result<Self::Value, E> {
            Ok(Some(value.to_string()))
        }
        fn visit_bytes<E: serde::de::Error>(self, value: &[u8]) -> Result<Self::Value, E> {
            Ok(Some(
                value
                    .iter()
                    .map(u8::to_string)
                    .collect::<Vec<_>>()
                    .join(","),
            ))
        }
        fn visit_byte_buf<E: serde::de::Error>(self, value: Vec<u8>) -> Result<Self::Value, E> {
            self.visit_bytes(&value)
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut bytes = Vec::new();
            while let Some(byte) = seq.next_element::<u8>()? {
                bytes.push(byte.to_string());
            }
            Ok(Some(bytes.join(",")))
        }
    }
    deserializer.deserialize_any(TextVisitor)
}
struct Path {
    path: String,
    stage: String,
    users: HashSet<usize>,
    views: u64,
    shares: u64,
}
struct Viewer {
    source: Value,
    rows: Vec<(String, usize)>,
    stages: [bool; 3],
}
fn increment(map: &mut HashMap<String, usize>, items: &mut Vec<(String, u64)>, key: String) {
    let index = *map.entry(key.clone()).or_insert_with(|| {
        items.push((key, 0));
        items.len() - 1
    });
    items[index].1 += 1;
}
fn stage_idx(stage: &str) -> usize {
    match stage {
        "consideration" => 2,
        "interest" => 1,
        _ => 0,
    }
}
fn campaign_part(value: &str) -> &str {
    if value.is_empty() { "(none)" } else { value }
}
fn locale(a: &str, b: &str) -> std::cmp::Ordering {
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    js_sys::JsString::from(a)
        .locale_compare(b, &locales, &js_sys::Object::new())
        .cmp(&0)
}
pub(crate) fn aggregate(rows: &[Visit]) -> (Value, Vec<Value>) {
    let mut viewer_idx = HashMap::new();
    let mut viewers: Vec<Viewer> = Vec::new();
    let mut path_idx = HashMap::new();
    let mut paths: Vec<Path> = Vec::new();
    let mut source_cache = HashMap::new();
    let mut path_cache = HashMap::new();
    let mut campaign_index = HashMap::new();
    let mut campaigns: Vec<(String, String, String, u64)> = Vec::new();
    for row in rows {
        let campaign = crate::trim(row.utm_campaign.as_deref().unwrap_or(""));
        let utm_source = crate::trim(row.utm_source.as_deref().unwrap_or(""));
        let medium = crate::trim(row.utm_medium.as_deref().unwrap_or(""));
        if !campaign.is_empty() || !utm_source.is_empty() || !medium.is_empty() {
            let (campaign, utm_source, medium) = (
                campaign_part(campaign),
                campaign_part(utm_source),
                campaign_part(medium),
            );
            let key = format!("{campaign}|{utm_source}|{medium}");
            let index = *campaign_index.entry(key).or_insert_with(|| {
                campaigns.push((
                    campaign.to_owned(),
                    utm_source.to_owned(),
                    medium.to_owned(),
                    0,
                ));
                campaigns.len() - 1
            });
            campaigns[index].3 += 1;
        }
        let key = crate::trim(row.viewer_key.as_deref().unwrap_or(""));
        let raw = row.path.as_deref().unwrap_or("");
        let (path, stage) = path_cache.entry(raw).or_insert_with(|| {
            let trimmed = crate::trim(raw);
            let path = if trimmed.starts_with('/') {
                trimmed.split(['?', '#']).next().unwrap_or("")
            } else {
                ""
            };
            let stage = if path.starts_with("/post/") {
                "consideration"
            } else if matches!(
                path,
                "" | "/"
                    | "/index.html"
                    | "/calendar"
                    | "/calendar.html"
                    | "/contributors"
                    | "/contributors.html"
                    | "/wosm-members"
                    | "/wosm-members.html"
            ) {
                "awareness"
            } else {
                "interest"
            };
            (path, stage)
        });
        let path = *path;
        let stage = *stage;
        if key.is_empty() || path.is_empty() {
            continue;
        }
        let source_key = [
            row.referrer_host.as_deref().unwrap_or(""),
            row.referrer_url.as_deref().unwrap_or(""),
            row.utm_source.as_deref().unwrap_or(""),
            row.utm_medium.as_deref().unwrap_or(""),
            row.utm_campaign.as_deref().unwrap_or(""),
        ];
        let source=source_cache.entry(source_key).or_insert_with(||crate::referrers::marketing_source(&json!({"referrer_host":row.referrer_host,"referrer_url":row.referrer_url,"utm_source":row.utm_source,"utm_medium":row.utm_medium,"utm_campaign":row.utm_campaign})));
        let level = stage_idx(stage);
        let v = *viewer_idx.entry(key.to_owned()).or_insert_with(|| {
            viewers.push(Viewer {
                source: source.clone(),
                rows: Vec::new(),
                stages: [false; 3],
            });
            viewers.len() - 1
        });
        let p = *path_idx.entry(path.to_owned()).or_insert_with(|| {
            paths.push(Path {
                path: path.into(),
                stage: stage.into(),
                users: HashSet::new(),
                views: 0,
                shares: 0,
            });
            paths.len() - 1
        });
        paths[p].users.insert(v);
        paths[p].views += 1;
        if source.get("type").and_then(Value::as_str) == Some("share") {
            paths[p].shares += 1;
        }
        viewers[v].rows.push((path.to_owned(), level));
        viewers[v].stages[level] = true;
    }
    let mut stage_counts = [0_u64; 3];
    let mut source_index = HashMap::new();
    let mut source_stage = Vec::new();
    let mut dest_index = HashMap::new();
    let mut dest_stage = Vec::new();
    let mut transition_index = HashMap::new();
    let mut transitions = Vec::new();
    let mut source_meta = serde_json::Map::new();
    for viewer in &viewers {
        for (index, present) in viewer.stages.iter().enumerate() {
            if *present {
                stage_counts[index] += 1;
            }
        }
        let level = if viewer.stages[2] {
            2
        } else if viewer.stages[1] {
            1
        } else {
            0
        };
        let stage = ["awareness", "interest", "consideration"][level];
        let source = viewer
            .source
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or("");
        increment(
            &mut source_index,
            &mut source_stage,
            format!("{source}|{stage}"),
        );
        source_meta.insert(source.to_owned(), viewer.source.clone());
        let mut count_index = HashMap::new();
        let mut candidates = Vec::new();
        for (path, item_stage) in &viewer.rows {
            if *item_stage == level {
                increment(&mut count_index, &mut candidates, path.clone());
            }
        }
        candidates.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| locale(&a.0, &b.0)));
        if let Some((path, _)) = candidates.first() {
            increment(&mut dest_index, &mut dest_stage, format!("{stage}|{path}"));
        }
        let mut seen = HashSet::new();
        for pair in viewer.rows.windows(2) {
            if pair[0].0 != pair[1].0 {
                let key = format!("{}→{}", pair[0].0, pair[1].0);
                if seen.insert(key.clone()) {
                    increment(&mut transition_index, &mut transitions, key);
                }
            }
        }
    }
    let path_stats:Vec<Value>=paths.iter().map(|p|json!({"path":p.path,"stage":p.stage,"unique_users":p.users.len(),"pageviews":p.views,"share_visits":p.shares})).collect();
    campaigns.sort_by(|a, b| b.3.cmp(&a.3).then_with(|| locale(&a.0, &b.0)));
    let campaigns=campaigns.into_iter().take(12).map(|(campaign,source,medium,visits)|json!({"campaign":campaign,"source":source,"medium":medium,"visits":visits})).collect();
    (
        json!({"total_unique":viewers.len(),"total_pageviews":rows.len(),"stage_counts":{"awareness":stage_counts[0],"interest":stage_counts[1],"consideration":stage_counts[2]},"source_stage":source_stage,"destination_stage":dest_stage,"transitions":transitions,"source_meta":source_meta,"path_stats":path_stats}),
        campaigns,
    )
}
