use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;
use worker::{js_sys, wasm_bindgen::JsValue};

const HELP: &str = concat!(
    "# 길월미디어 · 기념품 행사 카탈로그 CSV 템플릿 (UTF-8 BOM)\n",
    "# 헤더 한 줄은 한국어 / 영어 어느 쪽이든 인식합니다. 1·2·3행은 안내(#)·헤더·샘플입니다.\n",
    "# ─ 슬러그: 비우면 자동 생성. 같은 슬러그/이름이 이미 있으면 해당 행을 업데이트(흡수).\n",
    "# ─ 행사명: 영문/국문 둘 중 하나는 필수.\n",
    "# ─ 카테고리: 분류명(국문 또는 영문) 또는 슬러그. 예: \"세계잼버리\" / \"world-jamboree\".\n",
    "#            등록되지 않은 카테고리면 무시되어 미분류로 저장됩니다.\n",
    "# ─ 시작일 / 종료일: \"2023\" (연도만) · \"2023-08\" (월까지) · \"2023-08-01\" (일까지) 자유 표기.\n",
    "#                 비우려면 빈칸으로. \"2023.8.1\" · \"2023/8/1\" · \"2023년 8월 1일\" 도 OK.\n",
    "# ─ 설명: 비워도 됨.\n",
    "# ─ 아카이브: 0/1, 활성/아카이브, true/false 모두 OK. 비우면 0(활성).\n",
    "슬러그,행사명(영문),행사명(국문),카테고리,시작일,종료일,설명(영문),설명(국문),아카이브\n",
);

#[derive(Deserialize)]
struct ExportInput {
    template: bool,
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

fn date_text(row: &Value, prefix: &str) -> String {
    let value = |suffix: &str| {
        row.get(format!("{prefix}_{suffix}"))
            .filter(|v| !v.is_null())
            .map(crate::post_routes::js_string)
    };
    let Some(year) = value("year") else {
        return String::new();
    };
    let Some(month) = value("month") else {
        return year;
    };
    let pad = |v: String| {
        if v.encode_utf16().count() < 2 {
            format!("0{v}")
        } else {
            v
        }
    };
    match value("day") {
        Some(day) => format!("{year}-{}-{}", pad(month), pad(day)),
        None => format!("{year}-{}", pad(month)),
    }
}

fn csv_escape(s: &str) -> String {
    if s.contains(['"', ',', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_owned()
    }
}

async fn event_rows(env: &Env) -> Result<Vec<Value>> {
    let sql = format!(
        "SELECT {} FROM memorabilia_events e LEFT JOIN memorabilia_event_categories cat ON cat.id = e.category_id ORDER BY COALESCE(cat.sort_order, 999) ASC, COALESCE(e.start_year, 0) DESC, COALESCE(e.start_month, 0) DESC, COALESCE(e.start_day, 0) DESC, e.id DESC",
        crate::memorabilia::EVENT_COLUMNS
    );
    env.d1("DB")?.prepare(sql).all().await?.results::<Value>()
}

pub async fn export(req: &mut Request, env: &Env) -> Result<Response> {
    let input: ExportInput = req.json().await?;
    let items = if input.template {
        Vec::new()
    } else {
        event_rows(env).await?
    };
    let rows: Vec<Vec<String>> = if input.template {
        vec![
            vec![
                "",
                "25th World Scout Jamboree",
                "제25회 세계스카우트잼버리",
                "세계잼버리",
                "2023-08-01",
                "2023-08-12",
                "Held in Saemangeum, Korea.",
                "대한민국 새만금에서 개최.",
                "0",
            ],
            vec![
                "",
                "31st APR Scout Jamboree",
                "제31차 아·태스카우트잼버리",
                "지역잼버리 (APR 등)",
                "2017-08",
                "2017-08",
                "Held in Mongolia.",
                "몽골에서 개최.",
                "0",
            ],
            vec![
                "",
                "14th National Scout Jamboree",
                "제14회 한국잼버리",
                "한국잼버리",
                "1991",
                "1991",
                "",
                "",
                "0",
            ],
        ]
        .into_iter()
        .map(|r| r.into_iter().map(str::to_owned).collect())
        .collect()
    } else {
        items
            .iter()
            .map(|e| {
                let text = |key| {
                    e.get(key)
                        .filter(|v| truthy(v))
                        .map(crate::post_routes::js_string)
                        .unwrap_or_default()
                };
                vec![
                    text("slug"),
                    text("name_en"),
                    text("name_ko"),
                    text("category_slug"),
                    date_text(e, "start"),
                    date_text(e, "end"),
                    text("description_en"),
                    text("description_ko"),
                    if e.get("archived").is_some_and(truthy) {
                        "1"
                    } else {
                        "0"
                    }
                    .into(),
                ]
            })
            .collect()
    };
    let mut csv = format!("\u{feff}{HELP}");
    for row in rows {
        csv.push_str(
            &row.iter()
                .map(|s| csv_escape(s))
                .collect::<Vec<_>>()
                .join(","),
        );
        csv.push('\n');
    }
    Response::from_json(&json!({"csv":csv}))
}

const HEADERS: &[(&str, &[&str])] = &[
    ("slug", &["slug", "슬러그"]),
    (
        "name_en",
        &[
            "name_en",
            "name en",
            "name-en",
            "행사명(영문)",
            "행사명영문",
            "영문명",
            "영문",
        ],
    ),
    (
        "name_ko",
        &[
            "name_ko",
            "name ko",
            "name-ko",
            "행사명(국문)",
            "행사명국문",
            "국문명",
            "국문",
            "한글명",
        ],
    ),
    (
        "category",
        &[
            "category",
            "카테고리",
            "분류",
            "category_slug",
            "category_ko",
            "category_en",
        ],
    ),
    (
        "start_date",
        &["start_date", "start date", "시작일", "시작"],
    ),
    ("end_date", &["end_date", "end date", "종료일", "종료"]),
    (
        "description_en",
        &["description_en", "설명(영문)", "설명영문", "영문설명"],
    ),
    (
        "description_ko",
        &["description_ko", "설명(국문)", "설명국문", "국문설명"],
    ),
    (
        "archived",
        &["archived", "아카이브", "숨김", "활성", "status"],
    ),
    ("start_year", &["start_year", "시작연도", "시작_연"]),
    ("start_month", &["start_month", "시작월", "시작_월"]),
    ("start_day", &["start_day", "시작일자", "시작_일"]),
    ("end_year", &["end_year", "종료연도", "종료_연"]),
    ("end_month", &["end_month", "종료월", "종료_월"]),
    ("end_day", &["end_day", "종료일자", "종료_일"]),
];

fn js_space(c: char) -> bool {
    matches!(c,
        '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
        '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

fn normalize_header(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| !js_space(*c) && *c != '_' && *c != '-')
        .collect()
}

#[allow(deprecated)]
fn number(text: &str) -> Option<f64> {
    if text.is_empty() {
        return None;
    }
    let value = js_sys::Number::new(&JsValue::from_str(text)).value_of();
    value.is_finite().then(|| value.trunc())
}

#[allow(deprecated)]
fn event_int(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    if value.is_null() || value.as_str() == Some("") {
        return None;
    }
    let n = match value {
        Value::Bool(b) => {
            if *b {
                1.0
            } else {
                0.0
            }
        }
        _ => js_sys::Number::new(&JsValue::from_str(&crate::post_routes::js_string(value)))
            .value_of(),
    };
    n.is_finite().then(|| n.trunc())
}

fn units_string(units: &[Value]) -> js_sys::JsString {
    let codes: Vec<u16> = units
        .iter()
        .filter_map(|v| v.as_u64().and_then(|n| u16::try_from(n).ok()))
        .collect();
    codes
        .chunks(4096)
        .fold(js_sys::JsString::from(""), |s, chunk| {
            s.concat(&js_sys::JsString::from_char_code(chunk))
        })
}

fn event_text(body: &Value, key: &str, limit: u32) -> js_sys::JsString {
    let source = body
        .get("text_units")
        .and_then(|v| v.get(key))
        .and_then(Value::as_array)
        .map(|units| units_string(units))
        .unwrap_or_else(|| {
            js_sys::JsString::from(body.get(key).and_then(Value::as_str).unwrap_or(""))
        });
    source.trim().slice(0, limit)
}

fn event_slug(body: &Value, name_en: &js_sys::JsString, name_ko: &js_sys::JsString) -> String {
    let source = if let Some(units) = body.get("slug_units").and_then(Value::as_array) {
        units_string(units)
    } else {
        let slug = body.get("slug").and_then(Value::as_str).unwrap_or("");
        if !slug.is_empty() {
            js_sys::JsString::from(slug)
        } else if name_en.length() > 0 {
            name_en.clone()
        } else {
            name_ko.clone()
        }
    };
    let cleaned = source
        .normalize("NFKD")
        .replace_by_pattern(&js_sys::RegExp::new(r"[\u0300-\u036f]", "g"), "")
        .to_lower_case()
        .replace_by_pattern(&js_sys::RegExp::new(r"[^a-z0-9가-힣]+", "g"), "-")
        .replace_by_pattern(&js_sys::RegExp::new(r"^-+|-+$", "g"), "");
    let slug = String::from(cleaned);
    if !slug.is_empty() {
        return slug;
    }
    let suffix = js_sys::Number::from(js_sys::Math::random())
        .to_string_with_radix(36)
        .map(|s| String::from(s.slice(2, 8)))
        .unwrap_or_default();
    format!("event-{suffix}")
}

fn event_validation(body: &Value) -> Value {
    let mut errors = Vec::new();
    let name_en = event_text(body, "name_en", 200);
    let name_ko = event_text(body, "name_ko", 200);
    let description_en = event_text(body, "description_en", 2000);
    let description_ko = event_text(body, "description_ko", 2000);
    if name_en.length() == 0 && name_ko.length() == 0 {
        errors.push("행사명은 영문/국문 중 하나는 입력해야 합니다.".to_owned());
    }
    let mut dates = [[None; 3]; 2];
    for (i, (prefix, label)) in [("start", "시작일"), ("end", "종료일")].iter().enumerate() {
        for (j, suffix) in ["year", "month", "day"].iter().enumerate() {
            dates[i][j] = event_int(body.get(format!("{prefix}_{suffix}")));
        }
        let [year, month, day] = dates[i];
        if day.is_some() && month.is_none() {
            errors.push(format!("{label}: 일을 입력하려면 월도 입력해야 합니다."));
        }
        if month.is_some() && year.is_none() {
            errors.push(format!("{label}: 월을 입력하려면 연도도 입력해야 합니다."));
        }
        if year.is_some_and(|v| !(1800.0..=2200.0).contains(&v)) {
            errors.push(format!("{label}: 연도가 범위를 벗어납니다."));
        }
        if month.is_some_and(|v| !(1.0..=12.0).contains(&v)) {
            errors.push(format!("{label}: 월은 1~12 범위여야 합니다."));
        }
        if day.is_some_and(|v| !(1.0..=31.0).contains(&v)) {
            errors.push(format!("{label}: 일은 1~31 범위여야 합니다."));
        }
    }
    if let (Some(start), Some(end)) = (dates[0][0], dates[1][0]) {
        let key = |date: [Option<f64>; 3], year| {
            year * 10000.0 + date[1].unwrap_or(0.0) * 100.0 + date[2].unwrap_or(0.0)
        };
        if key(dates[0], start) > key(dates[1], end) {
            errors.push("시작일이 종료일보다 늦을 수 없습니다.".to_owned());
        }
    }
    let codes = |s: &js_sys::JsString| {
        (0..s.length())
            .map(|i| s.char_code_at(i) as u16)
            .collect::<Vec<_>>()
    };
    json!({"errors":errors,"slug":event_slug(body, &name_en, &name_ko),"category_id":event_int(body.get("category_id")),
        "text_units":{"name_en":codes(&name_en),"name_ko":codes(&name_ko),"description_en":codes(&description_en),"description_ko":codes(&description_ko)},
        "archived":u8::from(body.get("archived").is_some_and(truthy)),
        "start_year":dates[0][0],"start_month":dates[0][1],"start_day":dates[0][2],
        "end_year":dates[1][0],"end_month":dates[1][1],"end_day":dates[1][2]})
}

pub async fn validate_event(req: &mut Request) -> Result<Response> {
    let body: Value = req.json().await?;
    let output = match body.as_array() {
        Some(rows) => Value::Array(rows.iter().map(event_validation).collect()),
        None => event_validation(&body),
    };
    Response::from_json(&output)
}

#[derive(Deserialize)]
struct PrepareInput {
    rows: Vec<Value>,
}

fn lower(text: &str) -> String {
    String::from(js_sys::JsString::from(text).to_lower_case())
}

pub async fn prepare(req: &mut Request, env: &Env) -> Result<Response> {
    let input: PrepareInput = req.json().await?;
    let existing = event_rows(env).await?;
    let categories = env.d1("DB")?.prepare("SELECT c.id, c.slug, c.label_en, c.label_ko, c.sort_order, c.archived, c.created_at, c.updated_at, (SELECT COUNT(*) FROM memorabilia_events e WHERE e.category_id = c.id) AS usage_count FROM memorabilia_event_categories c ORDER BY c.sort_order ASC, c.label_ko ASC").all().await?.results::<Value>()?;
    let mut lookup = std::collections::HashMap::new();
    for category in &categories {
        for key in ["slug", "label_ko", "label_en"] {
            if let Some(value) = category.get(key).filter(|v| truthy(v)) {
                let text = crate::post_routes::js_string(value);
                lookup.insert(
                    lower(text.trim_matches(js_space)),
                    category.get("id").cloned().unwrap_or(Value::Null),
                );
            }
        }
    }
    let mut rows = Vec::with_capacity(input.rows.len());
    let mut validations = Vec::with_capacity(input.rows.len());
    for mut row in input.rows {
        if row.is_null() {
            rows.push(Value::Null);
            validations.push(Value::Null);
            continue;
        }
        let category = row.get("category").and_then(Value::as_str).unwrap_or("");
        let id = if category.is_empty() {
            Value::Null
        } else {
            lookup
                .get(&lower(category))
                .filter(|v| truthy(v))
                .cloned()
                .unwrap_or(Value::Null)
        };
        if let Some(obj) = row.as_object_mut() {
            obj.remove("category");
            obj.insert("category_id".into(), id);
        }
        validations.push(event_validation(&row));
        rows.push(row);
    }
    Response::from_json(&json!({"rows": rows, "validations": validations, "existing":existing}))
}

#[derive(Deserialize)]
struct ImportInput {
    rows: Vec<Value>,
    validations: Vec<Value>,
    existing: Vec<Value>,
}

fn name_key(en: &str, ko: &str) -> String {
    format!(
        "{}|{}",
        lower(en.trim_matches(js_space)),
        lower(ko.trim_matches(js_space))
    )
}

pub async fn import(req: &mut Request, env: &Env) -> Result<Response> {
    let input: ImportInput = req.json().await?;
    if input.rows.len() != input.validations.len() {
        return Err(Error::RustError("Invalid event import".into()));
    }
    let mut by_slug = std::collections::HashMap::<String, Value>::new();
    let mut by_name = std::collections::HashMap::<String, Value>::new();
    for event in &input.existing {
        if let Some(slug) = event
            .get("slug")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            by_slug.insert(slug.into(), event["id"].clone());
        }
        let key = name_key(
            event.get("name_en").and_then(Value::as_str).unwrap_or(""),
            event.get("name_ko").and_then(Value::as_str).unwrap_or(""),
        );
        by_name.entry(key).or_insert_with(|| event["id"].clone());
    }
    let db = env.d1("DB")?;
    let mut inserted = 0;
    let mut updated = 0;
    let mut skipped = 0;
    let mut errors = Vec::<Value>::new();
    for (index, (row, validation)) in input.rows.iter().zip(&input.validations).enumerate() {
        if row.is_null() {
            skipped += 1;
            continue;
        }
        let row_errors = validation
            .get("errors")
            .and_then(Value::as_array)
            .ok_or_else(|| Error::RustError("Invalid event validation".into()))?;
        if !row_errors.is_empty() {
            errors.push(json!({"line":index+2,"errors":row_errors}));
            continue;
        }
        let row_slug = row.get("slug").and_then(Value::as_str).unwrap_or("");
        let key = name_key(
            row.get("name_en").and_then(Value::as_str).unwrap_or(""),
            row.get("name_ko").and_then(Value::as_str).unwrap_or(""),
        );
        let target = by_slug
            .get(row_slug)
            .filter(|_| !row_slug.is_empty())
            .or_else(|| by_name.get(&key))
            .cloned();
        let normalized = |key: &str| -> Result<js_sys::JsString> {
            let codes = validation
                .get("text_units")
                .and_then(|v| v.get(key))
                .and_then(Value::as_array)
                .ok_or_else(|| Error::RustError("Invalid event text".into()))?;
            Ok(units_string(codes))
        };
        let name_en = normalized("name_en")?;
        let name_ko = normalized("name_ko")?;
        let mut args: Vec<JsValue> = vec![name_en.clone().into(), name_ko.clone().into()];
        for field in [
            "category_id",
            "start_year",
            "start_month",
            "start_day",
            "end_year",
            "end_month",
            "end_day",
        ] {
            let value = validation.get(field).cloned().unwrap_or(Value::Null);
            let value = if field == "category_id" && !truthy(&value) {
                Value::Null
            } else {
                value
            };
            args.extend(crate::post_routes::post_bindings(&[value])?);
        }
        args.extend([
            normalized("description_en")?.into(),
            normalized("description_ko")?.into(),
            validation
                .get("archived")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .into(),
        ]);
        let outcome: Result<(Option<(String, Value)>, bool)> = async {
            if let Some(id) = target {
                args.extend(crate::post_routes::post_bindings(&[id])?);
                db.prepare("UPDATE memorabilia_events SET name_en = ?, name_ko = ?, category_id = ?, start_year = ?, start_month = ?, start_day = ?, end_year = ?, end_month = ?, end_day = ?, description_en = ?, description_ko = ?, archived = ?, updated_at = datetime('now') WHERE id = ?").bind(&args)?.run().await?;
                Ok((None, true))
            } else {
                let base = validation.get("slug").and_then(Value::as_str).ok_or_else(|| Error::RustError("Invalid event slug".into()))?;
                let mut slug = base.to_owned();
                for _ in 0..5 {
                    if db.prepare("SELECT 1 FROM memorabilia_events WHERE slug = ?").bind(&[slug.as_str().into()])?.first::<Value>(None).await?.is_none() { break; }
                    let random = js_sys::Number::from(js_sys::Math::random()).to_string_with_radix(36).map_err(|_| Error::RustError("Unable to generate event slug".into()))?;
                    slug = format!("{base}-{}",String::from(random.slice(2,5)));
                }
                args.insert(0, slug.as_str().into());
                let result = db.prepare("INSERT INTO memorabilia_events (slug, name_en, name_ko, category_id, start_year, start_month, start_day, end_year, end_month, end_day, description_en, description_ko, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(&args)?.run().await?;
                Ok((Some((slug, json!(result.meta()?.and_then(|m|m.last_row_id)))), false))
            }
        }.await;
        match outcome {
            Ok((Some((slug,id)), _)) => { by_slug.insert(slug, id.clone()); by_name.insert(name_key(&String::from(name_en), &String::from(name_ko)), id); inserted += 1; }
            Ok((None, true)) => updated += 1,
            Ok((None, false)) => {},
            Err(error) => errors.push(json!({"line":index+2,"errors":[format!("DB 오류: {}",crate::memorabilia::js_error_message(&error))]})),
        }
    }
    Response::from_json(
        &json!({"ok":true,"inserted":inserted,"updated":updated,"skipped":skipped,"errors":errors}),
    )
}

fn date(text: &str) -> [Option<f64>; 3] {
    if text.is_empty() || text.chars().all(|c| matches!(c, '-' | 'x' | 'X' | '∅')) {
        return [None, None, None];
    }
    let tokens: Vec<&str> = text
        .split(|c| matches!(c, '년' | '월' | '일' | '.' | '-' | '/') || js_space(c))
        .filter(|s| !s.is_empty())
        .collect();
    std::array::from_fn(|i| tokens.get(i).and_then(|token| number(token)))
}

fn prepare_rows(rows: &[Vec<String>], header: &[(&str, usize)]) -> Vec<Value> {
    rows.iter().skip(1).map(|cols| {
        if cols.iter().all(|c| c.trim_matches(js_space).is_empty()) { return Value::Null; }
        let get = |key: &str| -> &str {
            header.iter().find(|(k, _)| *k == key).and_then(|(_, i)| cols.get(*i)).map(|s| s.trim_matches(js_space)).unwrap_or("")
        };
        let dates = |prefix: &str| -> [Option<f64>; 3] {
            let combined = format!("{prefix}_date");
            if header.iter().any(|(k, _)| *k == combined) { date(get(&combined)) }
            else { [number(get(&format!("{prefix}_year"))), number(get(&format!("{prefix}_month"))), number(get(&format!("{prefix}_day")))] }
        };
        let start = dates("start");
        let end = dates("end");
        let archived = matches!(get("archived").to_lowercase().as_str(), "1" | "true" | "yes" | "y" | "t" | "on" | "아카이브" | "숨김" | "hidden" | "archived");
        json!({"slug":get("slug"), "name_en":get("name_en"), "name_ko":get("name_ko"), "category":get("category"),
            "start_year":start[0], "start_month":start[1], "start_day":start[2],
            "end_year":end[0], "end_month":end[1], "end_day":end[2],
            "description_en":get("description_en"), "description_ko":get("description_ko"), "archived":u8::from(archived)})
    }).collect()
}

#[derive(Deserialize)]
struct Input {
    text: String,
}

pub async fn parse(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    let mut chars = input.text.chars().peekable();
    if chars.peek() == Some(&'\u{feff}') {
        chars.next();
    }
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    while let Some(c) = chars.next() {
        if quoted {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    cell.push('"');
                } else {
                    quoted = false;
                }
            } else {
                cell.push(c);
            }
        } else {
            match c {
                '"' => quoted = true,
                ',' => row.push(std::mem::take(&mut cell)),
                '\r' => {}
                '\n' => {
                    row.push(std::mem::take(&mut cell));
                    rows.push(std::mem::take(&mut row));
                }
                _ => cell.push(c),
            }
        }
    }
    if !cell.is_empty() || !row.is_empty() {
        row.push(cell);
        rows.push(row);
    }
    rows.retain(|row| {
        let empty = row[0].trim_matches(js_space).is_empty();
        !(row.len() == 1 && empty) && !row[0].starts_with('#')
    });
    if rows.is_empty() {
        return Response::from_json(&json!({"failure":{"error":"no_rows"}}));
    }
    if rows.len() == 1 {
        return Response::from_json(
            &json!({"failure":{"error":"no_data","detail":"데이터 행이 없습니다."}}),
        );
    }
    let normalized: Vec<String> = rows
        .first()
        .map(|row| row.iter().map(|s| normalize_header(s)).collect())
        .unwrap_or_default();
    let header_index: Vec<(&str, usize)> = HEADERS
        .iter()
        .filter_map(|(key, aliases)| {
            aliases
                .iter()
                .find_map(|alias| {
                    normalized
                        .iter()
                        .position(|s| *s == normalize_header(alias))
                })
                .map(|index| (*key, index))
        })
        .collect();
    if !header_index
        .iter()
        .any(|(key, _)| *key == "name_en" || *key == "name_ko")
    {
        let recognized: Vec<&str> = header_index.iter().map(|(key, _)| *key).collect();
        return Response::from_json(
            &json!({"failure":{"error":"invalid_header","detail":"헤더에 행사명(영문) 또는 행사명(국문) 컬럼이 있어야 합니다.","recognized":recognized,"expected_columns":["슬러그","행사명(영문)","행사명(국문)","카테고리","시작일","종료일","설명(영문)","설명(국문)","아카이브"]}}),
        );
    }
    let data = prepare_rows(&rows, &header_index);
    Response::from_json(&json!({"data": data}))
}
