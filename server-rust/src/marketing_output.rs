use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use worker::js_sys;
fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn n(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or(0)
}
fn arr<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
fn pair(v: &Value) -> (&str, u64) {
    (
        v.get(0).and_then(Value::as_str).unwrap_or(""),
        v.get(1).and_then(Value::as_u64).unwrap_or(0),
    )
}
fn locale(a: &str, b: &str) -> std::cmp::Ordering {
    let locales = js_sys::Array::new();
    locales.push(&"ko".into());
    js_sys::JsString::from(a)
        .locale_compare(b, &locales, &js_sys::Object::new())
        .cmp(&0)
}
fn fixed(v: f64, digits: u8) -> f64 {
    #[allow(deprecated)]
    let number = js_sys::Number::new(&worker::wasm_bindgen::JsValue::from_f64(v));
    number
        .to_fixed(digits)
        .ok()
        .and_then(|v| String::from(v).parse().ok())
        .unwrap_or(0.0)
}
fn numeric_text(v: f64) -> String {
    #[allow(deprecated)]
    let number = js_sys::Number::new(&worker::wasm_bindgen::JsValue::from_f64(v));
    number
        .to_string_with_radix(10)
        .map(String::from)
        .unwrap_or_default()
}
fn grouped(v: u64) -> String {
    #[allow(deprecated)]
    let number = js_sys::Number::new(&worker::wasm_bindgen::JsValue::from_f64(v as f64));
    String::from(number.to_locale_string("ko-KR"))
}
fn source_color(key: &str, kind: &str) -> &'static str {
    if key == "direct" {
        "#4c6ef5"
    } else {
        match kind {
            "share" => "#12b886",
            "search" => "#ff922b",
            "social" => "#845ef7",
            "messenger" => "#f59f00",
            "internal" => "#6c757d",
            _ => "#7c4dff",
        }
    }
}
fn stage_color(stage: &str) -> &'static str {
    match stage {
        "awareness" => "#ff7a18",
        "interest" => "#2f9e44",
        _ => "#e03131",
    }
}
fn title(path: &str, posts: &HashMap<String, String>, fallback: &Value) -> String {
    let path = crate::trim(path);
    if !path.starts_with('/') {
        return "알 수 없는 페이지".into();
    }
    let path = path.split(['?', '#']).next().unwrap_or("");
    posts
        .get(path)
        .cloned()
        .or_else(|| {
            fallback
                .get(path)
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| path.to_owned())
}
pub(crate) fn build(
    range: &Value,
    journey: &Value,
    posts: &[Value],
    campaigns: &[Value],
    fallback: &Value,
) -> Value {
    let title_map: HashMap<String, String> = posts
        .iter()
        .map(|p| (s(p, "path").to_owned(), s(p, "title").to_owned()))
        .collect();
    let total = n(journey, "total_unique");
    let counts = journey.get("stage_counts").unwrap_or(&Value::Null);
    let defs = [
        (
            "awareness",
            "입구 페이지",
            "홈·일정 등 입구 역할 페이지 도달",
        ),
        ("interest", "탐색 페이지", "분류·자료 페이지 도달"),
        ("consideration", "기사 읽기", "기사 상세 페이지 도달"),
    ];
    let funnel:Vec<Value>=defs.iter().map(|(key,label,description)|{let users=n(counts,key);let rate=if total>0 {fixed(users as f64/total as f64*100.0,1)}else{0.0};json!({"key":key,"label":label,"description":description,"users":users,"rate":rate,"count":users,"pct":rate})}).collect();
    let source_rows = arr(journey, "source_stage");
    let dest_rows = arr(journey, "destination_stage");
    let meta = journey.get("source_meta").unwrap_or(&Value::Null);
    let mut source_items: Vec<(String, u64)> = Vec::new();
    let mut source_idx = HashMap::new();
    for row in source_rows {
        let (key, count) = pair(row);
        let source = key.split('|').next().unwrap_or("");
        let index = *source_idx.entry(source.to_owned()).or_insert_with(|| {
            source_items.push((source.to_owned(), 0));
            source_items.len() - 1
        });
        source_items[index].1 += count;
    }
    let mut ranked = source_items.clone();
    ranked.sort_by_key(|a| std::cmp::Reverse(a.1));
    ranked.truncate(8);
    let allowed_sources: HashSet<String> = ranked.iter().map(|(key, _)| key.clone()).collect();
    let mut sources:Vec<Value>=ranked.iter().map(|(key,value)|{let m=meta.get(key);let label=m.map(|v|s(v,"label")).unwrap_or(key);let kind=m.map(|v|s(v,"type")).unwrap_or("direct");json!({"id":format!("source:{key}"),"key":key,"label":label,"type":kind,"value":value,"color":source_color(key,kind)})}).collect();
    let other: u64 = source_items
        .iter()
        .filter(|(key, _)| !allowed_sources.contains(key))
        .map(|(_, value)| value)
        .sum();
    if other > 0 {
        sources.push(json!({"id":"source:other","key":"other","label":"기타 유입","type":"other","value":other,"color":"#666666"}));
    }
    let stages:Vec<Value>=defs.iter().map(|(key,label,_)|{let value:u64=source_rows.iter().map(pair).filter(|(k,_)|k.ends_with(&format!("|{key}"))).map(|(_,n)|n).sum();json!({"id":format!("stage:{key}"),"key":key,"label":label,"value":value,"color":stage_color(key)})}).collect();
    let candidates: Vec<(String, String, u64, String)> = dest_rows
        .iter()
        .map(|row| {
            let (key, count) = pair(row);
            let (stage, path) = key.split_once('|').unwrap_or((key, ""));
            (
                stage.to_owned(),
                path.to_owned(),
                count,
                title(path, &title_map, fallback),
            )
        })
        .collect();
    let mut destinations = Vec::<Value>::new();
    for (stage, _, _) in defs {
        let mut found: Vec<_> = candidates.iter().filter(|row| row.0 == stage).collect();
        found.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| locale(&a.3, &b.3)));
        for item in found.into_iter().take(4) {
            destinations.push(json!({"id":format!("dest:{}",item.1),"key":item.1,"stage":stage,"label":item.3,"value":item.2,"color":stage_color(stage)}));
        }
    }
    let allowed_dest: HashSet<String> = destinations
        .iter()
        .map(|item| s(item, "key").to_owned())
        .collect();
    for (stage, _, _) in defs {
        let value: u64 = candidates
            .iter()
            .filter(|row| row.0 == stage && !allowed_dest.contains(&row.1))
            .map(|row| row.2)
            .sum();
        if value > 0 {
            destinations.push(json!({"id":format!("dest:other:{stage}"),"key":format!("other:{stage}"),"stage":stage,"label":"기타 대표 페이지","value":value,"color":stage_color(stage)}));
        }
    }
    let mut source_links:Vec<Value>=source_rows.iter().map(|row|{let (key,count)=pair(row);let mut parts=key.split('|');let source=parts.next().unwrap_or("");let stage=parts.next().unwrap_or("undefined");let kind=meta.get(source).map(|v|s(v,"type")).unwrap_or("");json!({"source":if allowed_sources.contains(source){format!("source:{source}")}else{"source:other".into()},"target":format!("stage:{stage}"),"value":count,"color":source_color(source,kind),"sourceKey":source})}).collect();
    source_links.sort_by_key(|v| std::cmp::Reverse(n(v, "value")));
    let mut dest_links:Vec<Value>=dest_rows.iter().map(|row|{let (key,count)=pair(row);let (stage,path)=key.split_once('|').unwrap_or((key,""));json!({"source":format!("stage:{stage}"),"target":if allowed_dest.contains(path){format!("dest:{path}")}else{format!("dest:other:{stage}")},"value":count,"color":stage_color(stage),"path":path})}).collect();
    dest_links.sort_by_key(|v| std::cmp::Reverse(n(v, "value")));
    let mut links: Vec<Value> = Vec::new();
    let mut link_idx: HashMap<String, usize> = HashMap::new();
    for link in source_links.into_iter().chain(dest_links) {
        let key = format!("{}|{}", s(&link, "source"), s(&link, "target"));
        if let Some(index) = link_idx.get(&key).copied() {
            let current = n(&links[index], "value");
            links[index]["value"] = json!(current + n(&link, "value"));
        } else {
            link_idx.insert(key, links.len());
            links.push(link);
        }
    }
    let mut scatter:Vec<Value>=arr(journey,"path_stats").iter().filter_map(|item|{let users=n(item,"unique_users");let views=n(item,"pageviews");if users==0{return None;}let path=s(item,"path");Some(json!({"path":path,"title":title(path,&title_map,fallback),"stage":s(item,"stage"),"unique_users":users,"pageviews":views,"views_per_user":fixed(views as f64/users as f64,2),"share_ratio":if views>0 {fixed(n(item,"share_visits") as f64/views as f64,2)}else{0.0}}))}).collect();
    scatter.sort_by(|a, b| {
        n(b, "unique_users")
            .cmp(&n(a, "unique_users"))
            .then(n(b, "pageviews").cmp(&n(a, "pageviews")))
    });
    scatter.truncate(40);
    let mut transitions:Vec<Value>=arr(journey,"transitions").iter().map(|row|{let (key,count)=pair(row);let mut parts=key.split('→');let from=parts.next().unwrap_or("");let to=parts.next().unwrap_or("");json!({"from_path":from,"to_path":to,"from_title":title(from,&title_map,fallback),"to_title":title(to,&title_map,fallback),"users":count})}).collect();
    transitions.sort_by_key(|v| std::cmp::Reverse(n(v, "users")));
    transitions.truncate(8);
    let mut notes = Vec::new();
    let mut ordered_stages = funnel.clone();
    ordered_stages.sort_by_key(|v| std::cmp::Reverse(n(v, "users")));
    if let Some(stage) = ordered_stages.first() {
        notes.push(json!({"title":"가장 큰 도달 단계","value":s(stage,"label"),"meta":format!("고유 사용자 {}명 · 전체의 {}%",grouped(n(stage,"users")),numeric_text(stage.get("rate").and_then(Value::as_f64).unwrap_or(0.0)))}));
    }
    if let Some(source) = sources.first() {
        notes.push(json!({"title":"가장 큰 유입 채널","value":s(source,"label"),"meta":format!("고유 사용자 {}명",grouped(n(source,"value")))}));
    }
    if let Some(dest) = destinations.first() {
        notes.push(json!({"title":"대표 도착 페이지","value":s(dest,"label"),"meta":format!("{} 단계 · 고유 사용자 {}명",s(dest,"stage"),grouped(n(dest,"value")))}));
    }
    if let Some(t) = transitions.first() {
        notes.push(json!({"title":"가장 흔한 이동 경로","value":format!("{} → {}",s(t,"from_title"),s(t,"to_title")),"meta":format!("이동 사용자 {}명",grouped(n(t,"users")))}));
    }
    let mut best = scatter.clone();
    best.sort_by(|a, b| {
        b.get("views_per_user")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .total_cmp(
                &a.get("views_per_user")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
            )
            .then(n(b, "unique_users").cmp(&n(a, "unique_users")))
    });
    if let Some(page) = best.first() {
        let per = page
            .get("views_per_user")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let ratio = page
            .get("share_ratio")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        notes.push(json!({"title":"재읽기 강도 높은 페이지","value":s(page,"title"),"meta":format!("1인당 조회 {}회 · 공유 유입 {}%",numeric_text(per),(ratio*100.0+0.5).floor())}));
    }
    let label = s(range, "label");
    json!({"provider":"site_visits","range":{"start_date":range.get("startDate"),"end_date":range.get("endDate"),"label":label,"days":range.get("days")},"summary":{"unique_users":total,"total_pageviews":n(journey,"total_pageviews"),"awareness_users":n(counts,"awareness"),"interest_users":n(counts,"interest"),"consideration_users":n(counts,"consideration")},"funnel":funnel,
 "journey_flow":{"sources":sources,"stages":stages,"destinations":destinations,"links":links,"definition":"기간 내 첫 유입 → 최고 도달 단계 → 가장 많이 조회한 해당 단계 페이지. 세션 전환율 아님. 상위 유입 8개·단계별 대표 페이지 4개 외에는 기타로 포함."},"utm_campaigns":campaigns,"page_opportunities":scatter,"top_transitions":transitions,"notes":notes,"tracking_note":format!("{label} 기준 전체 공개 페이지 방문 데이터를 바탕으로 유입 채널, 방문 단계, 대표 도착 페이지를 재구성한 마케팅 대시보드입니다. 체류시간·스크롤은 아직 수집하지 않아 페이지 규모, 재읽기 강도, 공유 유입 비중 중심으로 해석합니다.")})
}
