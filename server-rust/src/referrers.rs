use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use worker::{js_sys, *};

#[derive(Deserialize)]
struct Input {
    rows: Vec<Value>,
}
struct Source {
    key: String,
    label: String,
    kind: String,
    type_label: String,
    detail: String,
}
struct Item {
    source: Source,
    host: String,
    visits: f64,
    pageviews: f64,
}
fn info(key: &str, label: &str, kind: &str, type_label: &str, detail: &str) -> Source {
    Source {
        key: key.into(),
        label: label.into(),
        kind: kind.into(),
        type_label: type_label.into(),
        detail: detail.into(),
    }
}
fn value(row: &Value, key: &str) -> String {
    match row.get(key) {
        None | Some(Value::Null) | Some(Value::Bool(false)) => String::new(),
        Some(value) => crate::post_routes::js_string(value),
    }
}
fn trim(value: &str) -> String {
    String::from(js_sys::JsString::from(value).trim())
}
fn lower(value: &str) -> String {
    String::from(js_sys::JsString::from(value).to_lower_case())
}
fn classify(row: &Value) -> Source {
    let host = lower(&trim(&value(row, "referrer_host")));
    let url = trim(&value(row, "referrer_url"));
    let source = lower(&trim(&value(row, "utm_source")));
    let medium = lower(&trim(&value(row, "utm_medium")));
    let campaign = lower(&trim(&value(row, "utm_campaign")));
    if !source.is_empty() {
        let label = match source.as_str() {
            "kakaotalk" => "카카오톡 공유",
            "facebook" => "페이스북 공유",
            "copy" => "직접 공유 URL",
            _ => "",
        };
        if !label.is_empty() {
            let shared = medium == "social-share";
            let detail = if !campaign.is_empty() {
                &campaign
            } else if !medium.is_empty() {
                &medium
            } else {
                "utm"
            };
            return info(
                &format!("utm-{source}"),
                label,
                if shared { "share" } else { "campaign" },
                if shared { "공유" } else { "캠페인" },
                detail,
            );
        }
        let detail = if !campaign.is_empty() {
            &campaign
        } else if !medium.is_empty() {
            &medium
        } else {
            &source
        };
        return info(
            &format!("utm-{source}"),
            &format!("UTM · {source}"),
            "campaign",
            "캠페인",
            detail,
        );
    }
    if host.is_empty() || host == "direct" {
        return info(
            "direct",
            "직접 방문",
            "direct",
            "직접",
            "리퍼러 없음 또는 앱 브라우저 미제공",
        );
    }
    if host == "internal" {
        return info("internal", "내부 이동", "internal", "내부", "");
    }
    if host == "unknown" {
        return info(
            "unknown",
            "알 수 없음",
            "unknown",
            "미분류",
            "리퍼러 URL 해석 실패",
        );
    }
    let pathname = Url::parse(&url)
        .map(|url| lower(url.path()))
        .unwrap_or_default();
    let search = pathname.contains("/search") || pathname.contains("/m/search");
    if host.contains("story.kakao.com") {
        return info("kakao-story", "카카오스토리", "social", "소셜", &host);
    }
    if host.contains("kakao.com") || host.contains("kakao") {
        return info("kakao", "카카오", "messenger", "메신저", &host);
    }
    if host.contains("naver.com") {
        let is_search = search || host.contains("search.");
        return info(
            if is_search { "naver-search" } else { "naver" },
            if is_search {
                "네이버 검색"
            } else {
                "네이버"
            },
            if is_search { "search" } else { "portal" },
            if is_search { "검색" } else { "포털" },
            &host,
        );
    }
    if host.contains("google.") {
        let is_search = pathname.contains("/search");
        return info(
            if is_search { "google-search" } else { "google" },
            if is_search { "구글 검색" } else { "구글" },
            if is_search { "search" } else { "portal" },
            if is_search { "검색" } else { "포털" },
            &host,
        );
    }
    if host.contains("daum.net") {
        let is_search = search || host.contains("search.");
        return info(
            if is_search { "daum-search" } else { "daum" },
            if is_search { "다음 검색" } else { "다음" },
            if is_search { "search" } else { "portal" },
            if is_search { "검색" } else { "포털" },
            &host,
        );
    }
    let known = if host.contains("bing.com") {
        Some(("bing", "Bing", "search", "검색"))
    } else if host.contains("instagram.com") {
        Some(("instagram", "인스타그램", "social", "소셜"))
    } else if host.contains("facebook.com") {
        Some(("facebook", "페이스북", "social", "소셜"))
    } else if host == "t.co" || host.contains("twitter.com") || host.contains("x.com") {
        Some(("x", "X / Twitter", "social", "소셜"))
    } else if host.contains("threads.net") {
        Some(("threads", "Threads", "social", "소셜"))
    } else if host.contains("youtube.com") || host.contains("youtu.be") {
        Some(("youtube", "유튜브", "video", "영상"))
    } else if host.contains("linkedin.com") || host.contains("lnkd.in") {
        Some(("linkedin", "링크드인", "social", "소셜"))
    } else if host.contains("line.me") {
        Some(("line", "LINE", "messenger", "메신저"))
    } else if host.contains("whatsapp.com") {
        Some(("whatsapp", "WhatsApp", "messenger", "메신저"))
    } else if host.contains("telegram") || host == "t.me" {
        Some(("telegram", "Telegram", "messenger", "메신저"))
    } else if host.contains("discord") {
        Some(("discord", "Discord", "community", "커뮤니티"))
    } else if host.contains("reddit.com") {
        Some(("reddit", "Reddit", "community", "커뮤니티"))
    } else if host.contains("band.us") {
        Some(("band", "네이버 밴드", "community", "커뮤니티"))
    } else {
        None
    };
    if let Some((key, label, kind, type_label)) = known {
        return info(key, label, kind, type_label, &host);
    }
    let parts: Vec<&str> = host.split('.').filter(|part| !part.is_empty()).collect();
    let domain = if parts.len() > 2 {
        parts[parts.len() - 2..].join(".")
    } else {
        host.clone()
    };
    info(
        &format!("site:{domain}"),
        &domain,
        "site",
        "외부 사이트",
        &host,
    )
}

pub(crate) fn marketing_source(row: &Value) -> Value {
    let mut source = classify(row);
    if source.key == "unknown" {
        source = info("site:unknown", "unknown", "site", "외부 사이트", "unknown");
    }
    json!({"key":source.key,"label":source.label,"type":source.kind,"detail":source.detail})
}
pub async fn aggregate(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    Response::from_json(&aggregate_rows(input.rows))
}

pub(crate) fn aggregate_rows(rows: Vec<Value>) -> Value {
    let mut positions = HashMap::new();
    let mut items: Vec<Item> = Vec::new();
    for row in rows {
        let source = classify(&row);
        let host = value(&row, "referrer_host");
        let index = *positions.entry(source.key.clone()).or_insert_with(|| {
            let host = if host.is_empty() {
                source.key.clone()
            } else {
                host
            };
            items.push(Item {
                source,
                host,
                visits: 0.0,
                pageviews: 0.0,
            });
            items.len() - 1
        });
        items[index].visits += crate::analytics::score_number(row.get("visits"));
        items[index].pageviews += crate::analytics::score_number(row.get("pageviews"));
    }
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    let options = js_sys::Object::new();
    items.sort_by(|a, b| {
        b.visits
            .total_cmp(&a.visits)
            .then(b.pageviews.total_cmp(&a.pageviews))
            .then_with(|| {
                js_sys::JsString::from(a.source.label.as_str())
                    .locale_compare(&b.source.label, &locales, &options)
                    .cmp(&0)
            })
    });
    items.truncate(12);
    let refs:Vec<Value>=items.iter().map(|i|json!({"source_key":i.source.key,"source_label":i.source.label,"source_type":i.source.kind,"source_type_label":i.source.type_label,"source_detail":i.source.detail,"referrer_host":i.host,"visits":i.visits,"pageviews":i.pageviews})).collect();
    let sources:Vec<Value>=items.iter().map(|i|json!({"referrer_host":i.source.label,"visits":i.visits,"pageviews":i.pageviews,"source_key":i.source.key,"source_label":i.source.label})).collect();
    json!({"referrers":refs,"sources":sources})
}
