use serde_json::{Value, json};
use worker::js_sys;

thread_local! {
    static STRIP_PATTERNS: Vec<(js_sys::RegExp,&'static str)> = [
        (r"<[^>]*>"," "),("&nbsp;"," "),("&amp;","&"),("&lt;","<"),("&gt;",">"),("&quot;","\""),(r"\s+"," ")
    ].into_iter().map(|(pattern,replacement)|(js_sys::RegExp::new(pattern,"g"),replacement)).collect();
    static SPACE_PATTERN: js_sys::RegExp = js_sys::RegExp::new(r"[ \t]+","g");
}

fn strip(value: &str) -> js_sys::JsString {
    STRIP_PATTERNS.with(|patterns| {
        let mut text = js_sys::JsString::from(value);
        for (pattern, replacement) in patterns {
            text = text.replace_by_pattern(pattern, replacement);
        }
        text.trim()
    })
}

fn excerpt(content: &Value) -> Option<String> {
    let raw = match content {
        Value::Null => "",
        Value::String(s) => s.as_str(),
        _ => return None,
    };
    let trimmed = js_sys::JsString::from(raw).trim();
    let source = String::from(trimmed.clone());
    let mut text = if source.starts_with('{') {
        match serde_json::from_str::<Value>(&source) {
            Ok(doc) => {
                let parts = js_sys::Array::new();
                if let Some(blocks) = doc.get("blocks").and_then(Value::as_array) {
                    for block in blocks {
                        if let Some(data) = block.get("data").filter(|v| !v.is_null()) {
                            if let Some(value) = data.get("text").and_then(Value::as_str) {
                                parts.push(&strip(value));
                            } else if let Some(items) = data.get("items").and_then(Value::as_array)
                            {
                                let joined = js_sys::Array::new();
                                for item in items {
                                    let value = if let Some(s) = item.as_str() {
                                        strip(s)
                                    } else if let Some(s) =
                                        item.get("content").and_then(Value::as_str)
                                    {
                                        strip(s)
                                    } else {
                                        js_sys::JsString::from("")
                                    };
                                    joined.push(&value);
                                }
                                parts.push(&joined.join(" "));
                            }
                            if parts.join(" ").length() > 400 {
                                break;
                            }
                        }
                    }
                }
                parts.join("\n\n")
            }
            Err(_) => {
                if js_sys::JSON::parse(&source).is_ok() {
                    return None;
                }
                strip(&source)
            }
        }
    } else {
        strip(&source)
    };
    text = SPACE_PATTERN.with(|pattern| text.replace_by_pattern(pattern, " ").trim());
    if text.length() > 400 {
        let sliced = text.slice(0, 400).trim();
        // Rust strings are well-formed; slicing can split a surrogate pair.
        if sliced.length() > 0
            && (0xd800..=0xdbff).contains(&(sliced.char_code_at(sliced.length() - 1) as u32))
        {
            return None;
        }
        text = sliced.concat(&js_sys::JsString::from("…"));
    }
    Some(String::from(text))
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|x| x != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

pub fn project(rows: &[Value]) -> Option<Vec<Value>> {
    rows.iter().map(|row| {
        let id=row.get("id")?;
        let number=id.as_f64()?;
        if !number.is_finite() || number.abs()>9007199254740991.0 {return None;}
        let value=|key:&str,default:Value| row.get(key).filter(|v|truthy(v)).cloned().unwrap_or(default);
        let empty=||json!("");
        Some(json!({"id":id,"title":value("title",empty()),"subtitle":value("subtitle",empty()),"excerpt":excerpt(row.get("content").unwrap_or(&Value::Null))?,"image_url":value("image_url",Value::Null),"image_caption":value("image_caption",empty()),"category":value("category",empty()),"author":value("author",empty()),"publish_at":row.get("publish_at").filter(|v|truthy(v)).or_else(||row.get("created_at").filter(|v|truthy(v))).cloned().unwrap_or(empty()),"likes":value("likes",json!(0)),"views":value("views",json!(0)),"url":format!("/post/{}",crate::post_routes::js_string(id))}))
    }).collect()
}
