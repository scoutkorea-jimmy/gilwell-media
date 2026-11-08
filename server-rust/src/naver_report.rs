use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;
#[derive(Deserialize)]
struct Input {
    input: Value,
}
fn fail(message: &str) -> Value {
    json!({"error":message})
}
fn count(value: &str) -> Option<f64> {
    let digits = value.replace(',', "");
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v <= 9_007_199_254_740_991.0)
}
fn valid_ctr(value: &str) -> bool {
    let value = value.strip_suffix('%').unwrap_or(value);
    let mut parts = value.split('.');
    let first = parts.next().unwrap_or("");
    let second = parts.next();
    if first.is_empty()
        || !first.bytes().all(|b| b.is_ascii_digit())
        || parts.next().is_some()
        || second.is_some_and(|part| part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()))
    {
        return false;
    }
    value.parse::<f64>().is_ok_and(|v| v <= 100.0)
}
pub async fn parse(req: &mut Request) -> Result<Response> {
    let o: Input = req.json().await?;
    let input = o.input;
    let text = input.get("text").and_then(Value::as_str);
    let count_field = input.get("row_count").and_then(Value::as_f64);
    let valid = count_field.filter(|n| n.fract() == 0.0 && *n >= 0.0 && *n <= 30.0);
    let Some(text) = text.filter(|text| {
        text.encode_utf16().count() <= 100_000
            && (!crate::trim(text).is_empty() || count_field == Some(0.0))
    }) else {
        return Response::from_json(&fail(
            "최근 30일·PC + Mobile 표를 마지막 페이지까지 붙여넣고 전체 행 수와 확인란을 입력해주세요.",
        ));
    };
    if valid.is_none() || input.get("complete") != Some(&Value::Bool(true)) {
        return Response::from_json(&fail(
            "최근 30일·PC + Mobile 표를 마지막 페이지까지 붙여넣고 전체 행 수와 확인란을 입력해주세요.",
        ));
    }
    let clean = text.replace('\u{feff}', "");
    let fields: Vec<&str> = clean
        .split(['\t', '\r', '\n'])
        .map(crate::trim)
        .filter(|v| !v.is_empty())
        .collect();
    let header = ["No", "검색 키워드", "클릭", "노출", "CTR(%)"];
    let mut rows = Vec::new();
    let mut i = 0;
    while i < fields.len() {
        if fields[i] == "검색 키워드 TOP 30" {
            i += 1;
            continue;
        }
        if fields.get(i..i + 5) == Some(&header[..]) {
            i += 5;
            continue;
        }
        let Some(row) = fields.get(i..i + 5) else {
            return Response::from_json(&fail(
                "검색어 표의 순위가 누락되거나 중복되었습니다. 1번부터 마지막 순위까지 순서대로 붙여넣어주세요.",
            ));
        };
        let Some(rank) = count(row[0]) else {
            return Response::from_json(&fail("정확한 클릭·노출 수를 확인해주세요."));
        };
        if rank != (rows.len() + 1) as f64 {
            return Response::from_json(&fail(
                "검색어 표의 순위가 누락되거나 중복되었습니다. 1번부터 마지막 순위까지 순서대로 붙여넣어주세요.",
            ));
        }
        if !valid_ctr(row[4]) {
            return Response::from_json(&fail("검색어 표의 CTR 열을 확인해주세요."));
        }
        let (Some(clicks), Some(impressions)) = (count(row[2]), count(row[3])) else {
            return Response::from_json(&fail("정확한 클릭·노출 수를 확인해주세요."));
        };
        rows.push(json!({"keyword":row[1],"clicks":clicks,"impressions":impressions}));
        i += 5;
    }
    if Some(rows.len() as f64) != count_field {
        return Response::from_json(&fail(
            "붙여넣은 검색어 수와 표의 마지막 순위가 다릅니다. 모든 페이지를 확인해주세요.",
        ));
    }
    let mut report = json!({"engine":"naver","site":"bpmedia.net","period_days":30,"row_count":rows.len(),"rows":rows});
    for key in ["data_through", "total_clicks"] {
        if let Some(value) = input.get(key) {
            report[key] = value.clone();
        }
    }
    Response::from_json(&json!({"report":report}))
}
