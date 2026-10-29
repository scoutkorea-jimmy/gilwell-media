use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, *};

#[derive(Deserialize)]
struct Field {
    kind: String,
    value: Option<String>,
    units: Option<Vec<u16>>,
    number: Option<f64>,
    zero: Option<bool>,
    boolean: Option<bool>,
}

#[derive(Deserialize)]
struct Input {
    title_required: bool,
    title: Field,
    subtitle: Field,
    tag: Field,
    meta_tags: Field,
    author: Field,
    published: Field,
    featured: Field,
    ai_assisted: Field,
    sort_order: Field,
    #[serde(default)]
    publish_at: Option<Field>,
    #[serde(default)]
    publish_date: Option<Field>,
    #[serde(default)]
    content: Option<Field>,
    #[serde(default)]
    special_feature: Option<Field>,
    #[serde(default)]
    image_caption: Option<Field>,
    #[serde(default)]
    location_name: Option<Field>,
    #[serde(default)]
    location_address: Option<Field>,
    #[serde(default)]
    youtube_url: Option<Field>,
}

fn youtube_url(field: &Field) -> Option<String> {
    if field.kind != "text" {
        return None;
    }
    let trimmed = String::from(text(field).trim());
    if trimmed.is_empty() {
        return None;
    }
    let parsed = web_sys::Url::new(&trimmed).ok()?;
    if parsed.protocol() != "http:" && parsed.protocol() != "https:" {
        return None;
    }
    let hostname = parsed.hostname();
    let host = hostname
        .strip_prefix("www.")
        .unwrap_or(&hostname)
        .to_ascii_lowercase();
    let path = parsed.pathname();
    let video = match host.as_str() {
        "youtube.com" | "m.youtube.com" | "youtube-nocookie.com" if path == "/watch" => {
            parsed.search_params().get("v").unwrap_or_default()
        }
        "youtube.com" | "m.youtube.com" | "youtube-nocookie.com"
            if path.starts_with("/shorts/") || path.starts_with("/embed/") =>
        {
            path.split('/').nth(2).unwrap_or("").to_owned()
        }
        "youtu.be" => path.split('/').nth(1).unwrap_or("").to_owned(),
        _ => String::new(),
    };
    if video.len() != 11
        || !video
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return None;
    }
    Some(format!("https://www.youtube.com/watch?v={video}"))
}

fn short_text(field: &Field, max: u32) -> Value {
    if !matches!(field.kind.as_str(), "text" | "units") {
        return json!({"value":null});
    }
    let value = text(field).trim().slice(0, max);
    if value.length() == 0 {
        return json!({"value":null});
    }
    let units: Vec<u16> = (0..value.length())
        .map(|i| value.char_code_at(i) as u16)
        .collect();
    json!({"units":units})
}

fn special_feature(field: &Field) -> Result<Value> {
    match field.kind.as_str() {
        "missing" => Ok(json!({"provided":false})),
        "null" => Ok(json!({"provided":true,"value":null})),
        "text" | "units" => {
            let value = text(field)
                .trim()
                .replace_by_pattern(&js_sys::RegExp::new(r"\s+", "g"), " ")
                .slice(0, 120);
            if value.length() == 0 {
                return Ok(json!({"provided":true,"value":null}));
            }
            let units: Vec<u16> = (0..value.length())
                .map(|i| value.char_code_at(i) as u16)
                .collect();
            Ok(json!({"provided":true,"units":units}))
        }
        _ => Err(Error::RustError("Invalid special feature input".into())),
    }
}

fn content(field: &Field) -> Result<Value> {
    match field.kind.as_str() {
        "text" => {
            let trimmed = js_sys::JsString::from(field.value.as_deref().unwrap_or("")).trim();
            if trimmed.length() == 0 {
                Ok(json!({"ok":false,"error":"내용을(를) 입력해주세요"}))
            } else {
                Ok(json!({"ok":true,"provided":true,"value":String::from(trimmed)}))
            }
        }
        "missing" | "null" | "invalid" | "number" | "boolean" => {
            Ok(json!({"ok":false,"error":"내용은(는) 문자열이어야 합니다."}))
        }
        _ => Err(Error::RustError("Invalid post content input".into())),
    }
}

fn validate(field: &Field, label: &str, max: u32, required: bool) -> Result<Value> {
    if field.kind == "missing" && !required {
        return Ok(json!({"ok":true,"provided":false}));
    }
    if field.kind == "null" && !required {
        return Ok(json!({"ok":true,"provided":true,"value":null}));
    }
    let text = match field.kind.as_str() {
        "text" => js_sys::JsString::from(field.value.as_deref().unwrap_or("")),
        "units" => js_sys::JsString::from_char_code(field.units.as_deref().unwrap_or(&[])),
        "missing" | "null" | "invalid" | "number" | "boolean" => {
            return Ok(json!({"ok":false,"error":format!("{label}은(는) 문자열이어야 합니다.")}));
        }
        _ => return Err(Error::RustError("Invalid post text input".into())),
    };
    let text = text.trim();
    if text.length() == 0 {
        return if required {
            Ok(json!({"ok":false,"error":format!("{label}을(를) 입력해주세요")}))
        } else {
            Ok(json!({"ok":true,"provided":true,"value":null}))
        };
    }
    let text = text.slice(0, max);
    let units: Vec<u16> = (0..text.length())
        .map(|i| text.char_code_at(i) as u16)
        .collect();
    Ok(json!({"ok":true,"provided":true,"units":units}))
}

fn text(field: &Field) -> js_sys::JsString {
    if field.kind == "units" {
        js_sys::JsString::from_char_code(field.units.as_deref().unwrap_or(&[]))
    } else {
        js_sys::JsString::from(field.value.as_deref().unwrap_or(""))
    }
}

fn boolean(field: &Field) -> Value {
    if field.kind == "missing" {
        return json!({"ok":true,"provided":false});
    }
    let value = match field.kind.as_str() {
        "null" => Some(0),
        "boolean" => Some(i32::from(field.boolean.unwrap_or(false))),
        "number" => Some(i32::from(!field.zero.unwrap_or(false))),
        "text" | "units" => {
            let raw = text(field);
            if raw.length() == 0 {
                Some(0)
            } else {
                match String::from(raw.trim().to_lower_case()).as_str() {
                    "true" | "1" | "yes" | "on" => Some(1),
                    "false" | "0" | "no" | "off" => Some(0),
                    _ => None,
                }
            }
        }
        _ => None,
    };
    match value {
        Some(value) => json!({"ok":true,"provided":true,"value":value}),
        None => json!({"ok":false,"error":"불리언 값이 올바르지 않습니다."}),
    }
}

fn integer(field: &Field) -> Value {
    if field.kind == "missing" {
        return json!({"ok":true,"provided":false});
    }
    if field.kind == "null" || (field.kind == "text" && field.value.as_deref() == Some("")) {
        return json!({"ok":true,"provided":true,"value":null});
    }
    let value = match field.kind.as_str() {
        "number" => field
            .number
            .filter(|value| value.is_finite() && value.fract() == 0.0),
        "text" | "units" => {
            let value = text(field).trim();
            if value.length() == 0 {
                None
            } else {
                let number = js_sys::parse_int(&String::from(value), 10);
                number.is_finite().then_some(number)
            }
        }
        _ => None,
    };
    match value {
        Some(value) => json!({"ok":true,"provided":true,"value":value}),
        None => json!({"ok":false,"error":"정렬 순서은(는) 숫자여야 합니다."}),
    }
}

fn publish_at(at: Option<&Field>, date: Option<&Field>) -> Option<String> {
    let value = |field: Option<&Field>| match field {
        Some(field) if matches!(field.kind.as_str(), "text" | "units") => {
            String::from(text(field).trim())
        }
        _ => String::new(),
    };
    let precise = value(at);
    let matches = |pattern: &str, input: &str| js_sys::RegExp::new(pattern, "").test(input);
    if !precise.is_empty() {
        if matches(r"^\d{4}-\d{2}-\d{2}$", &precise) {
            return Some(format!("{precise} 12:00:00"));
        }
        if matches(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", &precise) {
            return Some(format!("{}:00", precise.replacen('T', " ", 1)));
        }
        if matches(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$", &precise) {
            return Some(format!("{precise}:00"));
        }
        if matches(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$", &precise) {
            return Some(precise.replacen('T', " ", 1));
        }
        let parsed = js_sys::Date::parse(&precise);
        if parsed.is_finite() {
            let shifted = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(
                parsed + 9.0 * 60.0 * 60.0 * 1000.0,
            ));
            if !shifted.get_time().is_finite() {
                return None;
            }
            let iso = String::from(shifted.to_iso_string());
            return Some(
                iso.chars()
                    .take(19)
                    .collect::<String>()
                    .replacen('T', " ", 1),
            );
        }
    }
    let fallback = value(date);
    if matches(r"^\d{4}-\d{2}-\d{2}$", &fallback) {
        return Some(format!("{fallback} 12:00:00"));
    }
    Some(String::new())
}

pub async fn validate_input(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    Response::from_json(&json!({
        "title":validate(&input.title,"제목",200,input.title_required || input.title.kind != "missing")?,
        "subtitle":validate(&input.subtitle,"부제",300,false)?,
        "tag":validate(&input.tag,"태그",200,false)?,
        "meta_tags":validate(&input.meta_tags,"메타 태그",500,false)?,
        "author":validate(&input.author,"작성자",60,false)?,
        "published":boolean(&input.published),
        "featured":boolean(&input.featured),
        "ai_assisted":boolean(&input.ai_assisted),
        "sort_order":integer(&input.sort_order),
        "publish_at":publish_at(input.publish_at.as_ref(),input.publish_date.as_ref()),
        "content":match input.content.as_ref() { Some(field) => content(field)?, None => Value::Null },
        "special_feature":match input.special_feature.as_ref() { Some(field) => special_feature(field)?, None => Value::Null },
        "image_caption":input.image_caption.as_ref().map(|field|short_text(field,300)),
        "location_name":input.location_name.as_ref().map(|field|short_text(field,120)),
        "location_address":input.location_address.as_ref().map(|field|short_text(field,300)),
        "youtube_url":input.youtube_url.as_ref().map(youtube_url),
    }))
}
