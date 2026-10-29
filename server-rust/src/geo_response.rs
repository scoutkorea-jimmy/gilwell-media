use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, *};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    range: Value,
    totals: Value,
    countries: Vec<Value>,
    cities: Vec<Value>,
    country_names: Value,
    global_cities: Value,
    country_cities: Value,
}
fn string(row: &Value, key: &str) -> String {
    match row.get(key) {
        None | Some(Value::Null) | Some(Value::Bool(false)) => String::new(),
        Some(value) => crate::post_routes::js_string(value),
    }
}
fn upper(value: &str) -> String {
    String::from(js_sys::JsString::from(value).to_upper_case())
}
fn lower(value: &str) -> String {
    String::from(js_sys::JsString::from(value).to_lower_case())
}
fn allowed(c: char) -> bool {
    matches!(c,'a'..='z'|'0'..='9'|'\u{0600}'..='\u{06ff}'|'\u{0900}'..='\u{097f}'|'\u{0d00}'..='\u{0d7f}'|'\u{4e00}'..='\u{9fff}'|'\u{3040}'..='\u{30ff}'|'\u{3131}'..='\u{318e}'|'\u{ac00}'..='\u{d7a3}')
}
fn city_label(code: &str, city: &str, global: &Value, countries: &Value) -> String {
    let raw = crate::trim(city);
    if raw.is_empty() {
        return String::new();
    }
    if raw.chars().all(|c| {
        matches!(c,'\u{3131}'..='\u{318e}'|'\u{ac00}'..='\u{d7a3}'|'('|')'|'-')
            || crate::trim(&c.to_string()).is_empty()
    }) {
        return raw.to_owned();
    }
    let normalized = String::from(js_sys::JsString::from(raw).normalize("NFKD"));
    let without_marks: String = normalized
        .chars()
        .filter(|c| !matches!(c, '\u{0300}'..='\u{036f}'))
        .collect();
    let key: String = lower(&without_marks)
        .chars()
        .filter(|c| allowed(*c))
        .collect();
    let country = upper(crate::trim(code));
    countries
        .get(&country)
        .and_then(|map| map.get(&key))
        .and_then(Value::as_str)
        .or_else(|| global.get(&key).and_then(Value::as_str))
        .unwrap_or(raw)
        .to_owned()
}
fn normalize(rows: Vec<Value>, input: &Input) -> Vec<Value> {
    rows.into_iter().map(|row|{
        let code=string(&row,"country_code"); let name=string(&row,"country_name"); let original=if !name.is_empty(){name}else if !code.is_empty(){code.clone()}else{"Unknown".to_string()};
        let normalized_code=upper(crate::trim(&code));
        let country=if code=="ZZ" {"국가 미확인".to_string()} else if let Some(name)=input.country_names.get(&normalized_code).and_then(Value::as_str) {name.to_owned()} else {crate::trim(&original).to_owned()};
        let city=string(&row,"city_name");let city_name=city_label(&code,&city,&input.global_cities,&input.country_cities);
        let coordinate=|key|match row.get(key) {None|Some(Value::Null)=>Value::Null,Some(v)=>json!(crate::analytics::score_number(Some(v)))};
        json!({"country_code":code,"country_name":country,"country_name_original":original,"city_name":city_name,"city_name_original":city,
            "visits":crate::analytics::score_number(row.get("visits")),"pageviews":crate::analytics::score_number(row.get("pageviews")),"city_count":crate::analytics::score_number(row.get("city_count")),
            "latitude":coordinate("latitude"),"longitude":coordinate("longitude"),"last_visit_at":string(&row,"last_visit_at")})
    }).collect()
}
pub async fn response(req: &mut Request) -> Result<Response> {
    let mut input: Input = req.json().await?;
    let countries = normalize(std::mem::take(&mut input.countries), &input);
    let cities = normalize(std::mem::take(&mut input.cities), &input);
    let n = |key| crate::analytics::score_number(input.totals.get(key));
    Response::from_json(
        &json!({"range":{"start_date":input.range.get("startDate"),"end_date":input.range.get("endDate"),"label":input.range.get("label"),"days":input.range.get("days")},
        "summary":{"countries":n("country_count"),"cities":n("city_count"),"visits":n("visits"),"pageviews":n("pageviews"),"unknown_country_pageviews":n("unknown_country_pageviews"),"missing_coordinate_pageviews":n("missing_coordinate_pageviews")},
        "countries":countries,"cities":cities,"list_scope":"전체 국가·도시 집계",
        "tracking_note":"방문은 선택 기간의 고유 사용자, 페이지뷰는 전체 조회입니다. 국가·도시별 고유 사용자는 이동으로 중복될 수 있어 합산하지 않습니다. 위치는 Cloudflare의 추정 위치이며 실제 거주지나 정확한 좌표를 뜻하지 않습니다. IP 원문은 저장하지 않습니다.",
        "warmup_note":"위치 데이터는 2026-04-09 배포 이후 새 방문부터 누적됩니다. 초기에는 국가/도시 목록이 비어 있을 수 있습니다."}),
    )
}
