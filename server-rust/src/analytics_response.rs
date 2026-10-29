use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    range: Value,
    use_hourly_series: bool,
    today_visits: Value,
    today_views: Value,
    total_posts: Value,
    published_posts: Value,
    total_visits: Value,
    total_views: Value,
    average_dwell_seconds: Value,
    series_data: Value,
    top_paths: Value,
    top_article_posts: Value,
    popular_post_dwell_row: Value,
    referrer_rows: Vec<Value>,
    tag_rows: Vec<Value>,
    tag_label: String,
    heatmap: Value,
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().unwrap_or(0.0) != 0.0,
        _ => true,
    }
}
fn prop(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}
fn fallback(value: Value, default: Value) -> Value {
    if truthy(&value) { value } else { default }
}
fn paths(input: &Value, posts: bool) -> Vec<Value> {
    input.get("results").and_then(Value::as_array).into_iter().flatten().map(|row|{
        let raw_path=prop(row,"path"); let path=fallback(raw_path.clone(),json!("/"));
        let title=if posts {fallback(prop(row,"title"),fallback(raw_path,json!("제목 없음")))} else {fallback(prop(row,"title"),json!(""))};
        let views=fallback(prop(row,"pageviews"),json!(0)); let visits=fallback(prop(row,"visits"),json!(0));
        let avg=crate::analytics::score_number(row.get("avg_dwell_seconds"));
        if posts {json!({"path":path,"title":title,"views":views,"visits":visits,"avg_dwell_seconds":avg})}
        else {json!({"path":path,"title":title,"pageviews":views,"visits":visits,"avg_dwell_seconds":avg})}
    }).collect()
}
pub async fn assemble(req: &mut Request) -> Result<Response> {
    let i: Input = req.json().await?;
    let referrer_summary = crate::referrers::aggregate_rows(i.referrer_rows);
    let tag_summary = crate::tag_analytics::aggregate_rows(i.tag_rows, i.tag_label);
    let label = prop(&i.range, "label");
    let label_text = crate::post_routes::js_string(&label);
    let unique = prop(&i.series_data, "unique");
    let views = prop(&i.series_data, "range_views");
    let top_paths = paths(&i.top_paths, false);
    let top_posts = paths(&i.top_paths, true);
    let article_posts = paths(&i.top_article_posts, true);
    let popular_title = fallback(prop(&i.popular_post_dwell_row, "title"), json!(""));
    let popular_avg =
        crate::analytics::score_number(i.popular_post_dwell_row.get("avg_dwell_seconds"));
    Response::from_json(&json!({
        "provider":"site_visits","provider_label":"공개 페이지 전체 방문 집계",
        "range":{"start_date":prop(&i.range,"startDate"),"end_date":prop(&i.range,"endDate"),"label":label,"days":prop(&i.range,"days"),"granularity":if i.use_hourly_series {"hour"}else{"day"}},
        "today":{"visits":i.today_visits,"views":i.today_views},"counts":{"total":i.total_posts,"published":i.published_posts},
        "summary":{"today_visits":i.today_visits,"today_pageviews":i.today_views,"today_views":i.today_views,"total_visits":i.total_visits,"range_visits":unique,
            "total_pageviews":i.total_views,"range_pageviews":views,"average_dwell_seconds":i.average_dwell_seconds,"popular_post_average_dwell_seconds":popular_avg,"popular_post_title":popular_title,
            "average_daily_visits":prop(&i.series_data,"average_daily_visits"),"average_daily_pageviews":prop(&i.series_data,"average_daily_pageviews")},
        "visitors":{"today_visits":i.today_visits,"total_visits":i.total_visits,"range_visits":unique,"series":prop(&i.series_data,"visit_series")},
        "views":{"total":views,"total_pageviews":i.total_views,"range_pageviews":views,"series":prop(&i.series_data,"view_series"),"top_paths":top_paths},
        "top_paths":top_paths,"top_posts":top_posts,"article_top_posts":article_posts,
        "referrers":prop(&referrer_summary,"referrers"),"sources":prop(&referrer_summary,"sources"),"heatmap":i.heatmap,"tags":tag_summary,
        "tracking_note":format!("{label_text} 기준 공개 페이지 전체 방문 집계입니다. 방문 수는 고유 사용자 수, 조회수는 전체 페이지뷰 수 기준입니다. 평균 체류시간은 현재 기사 상세 페이지(post)에서만 활성 시간 기준으로 계산됩니다. 유입 경로는 공유 링크 UTM과 site_visits의 referrer URL을 함께 사용해 카카오, 페이스북, 검색, 내부 이동 등을 최대한 세분화해 보여주지만, 메신저 앱이나 인앱 브라우저가 정보를 넘기지 않으면 직접 방문으로 기록될 수 있습니다.")
    }))
}
