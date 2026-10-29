use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashSet;
use worker::{js_sys, *};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    report: Value,
    now_iso: String,
}
fn error(message: &str) -> Value {
    json!({"error":message})
}
fn safe_count(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
}
pub async fn validate(req: &mut Request) -> Result<Response> {
    let o: Input = req.json().await?;
    let input = &o.report;
    let engine = input.get("engine").and_then(Value::as_str).unwrap_or("");
    if !matches!(engine, "google" | "naver")
        || input.get("site").and_then(Value::as_str) != Some("bpmedia.net")
    {
        return Response::from_json(&error(
            "BP미디어의 Google 또는 Naver 보고서만 저장할 수 있습니다.",
        ));
    }
    let period = if engine == "google" { 28 } else { 30 };
    if input.get("period_days").and_then(Value::as_f64) != Some(f64::from(period)) {
        return Response::from_json(&error("보고서 기간이 올바르지 않습니다."));
    }
    let date = input
        .get("data_through")
        .and_then(Value::as_str)
        .unwrap_or("");
    let bytes = date.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
    {
        return Response::from_json(&error("보고서 기준일이 올바르지 않습니다."));
    }
    let parsed = js_sys::Date::new(&wasm_bindgen::JsValue::from_str(date));
    if !parsed.get_time().is_finite() || !String::from(parsed.to_iso_string()).starts_with(date) {
        return Response::from_json(&error("보고서 기준일이 올바르지 않습니다."));
    }
    if date > o.now_iso.get(..10).unwrap_or("") {
        return Response::from_json(&error("미래의 보고서는 저장할 수 없습니다."));
    }
    let Some(rows) = input.get("rows").and_then(Value::as_array) else {
        return Response::from_json(&error(
            "검색어 전체 행 수가 일치하지 않습니다. 부분 수집은 저장하지 않습니다.",
        ));
    };
    if rows.len() > 10_000
        || input.get("row_count").and_then(Value::as_f64) != Some(rows.len() as f64)
    {
        return Response::from_json(&error(
            "검색어 전체 행 수가 일치하지 않습니다. 부분 수집은 저장하지 않습니다.",
        ));
    }
    let mut seen = HashSet::new();
    let mut normalized: Vec<(String, f64, f64)> = Vec::with_capacity(rows.len());
    let mut clicks_sum = 0.0;
    for row in rows {
        let keyword = row.get("keyword").and_then(Value::as_str);
        let clicks = safe_count(row.get("clicks"));
        let impressions = safe_count(row.get("impressions"));
        let valid = keyword
            .filter(|word| !crate::trim(word).is_empty() && word.encode_utf16().count() <= 300)
            .zip(clicks.zip(impressions))
            .filter(|(_, (clicks, impressions))| clicks <= impressions);
        let Some((keyword, (clicks, impressions))) = valid else {
            return Response::from_json(&error("검색어 또는 클릭·노출 수가 올바르지 않습니다."));
        };
        let keyword = crate::trim(keyword).to_owned();
        if !seen.insert(keyword.clone()) {
            return Response::from_json(&error("중복 검색어가 있습니다."));
        }
        clicks_sum += clicks;
        normalized.push((keyword, clicks, impressions));
    }
    let Some(total) = safe_count(input.get("total_clicks")) else {
        return Response::from_json(&error(
            "보고서 전체 클릭 수가 검색어별 클릭 합계보다 작습니다.",
        ));
    };
    if clicks_sum > total {
        return Response::from_json(&error(
            "보고서 전체 클릭 수가 검색어별 클릭 합계보다 작습니다.",
        ));
    }
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    let options = js_sys::Object::new();
    normalized.sort_by(|a, b| {
        b.1.total_cmp(&a.1).then(b.2.total_cmp(&a.2)).then_with(|| {
            js_sys::JsString::from(a.0.as_str())
                .locale_compare(&b.0, &locales, &options)
                .cmp(&0)
        })
    });
    let rows:Vec<Value>=normalized.into_iter().map(|(keyword,clicks,impressions)|json!({"keyword":keyword,"clicks":clicks,"impressions":impressions})).collect();
    Response::from_json(
        &json!({"report":{"engine":engine,"site":"bpmedia.net","period_days":period,"data_through":date,"total_clicks":total,"row_count":rows.len(),"rows":rows,"source":if engine=="google"{"google_api"}else{"naver_manual"},"synced_at":o.now_iso}}),
    )
}
