use serde_json::Value;
use worker::{js_sys, wasm_bindgen::JsValue};

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64() != Some(0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}
fn string(value: Option<&Value>) -> String {
    value
        .filter(|v| truthy(v))
        .map(crate::post_routes::js_string)
        .unwrap_or_default()
}
fn replace(value: &str, pattern: &str, flags: &str, replacement: &str) -> String {
    String::from(
        js_sys::JsString::from(value)
            .replace_by_pattern(&js_sys::RegExp::new(pattern, flags), replacement),
    )
}
fn strip(value: &str) -> String {
    replace(value, r"<[^>]+>", "g", "")
}
fn inline(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let pattern = js_sys::RegExp::new(
        r#"<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)</a>"#,
        "gi",
    );
    let source = js_sys::JsString::from(value);
    let mut result = String::new();
    let mut cursor = 0;
    while let Some(matched) = pattern.exec(value) {
        let index = js_sys::Reflect::get(&matched, &JsValue::from_str("index"))
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or_default() as u32;
        result.push_str(&String::from(source.slice(cursor, index)));
        let href = String::from(matched.get(1));
        let inner = strip(&String::from(matched.get(2)));
        result.push_str(&format!("[{inner}]({href})"));
        cursor = index + matched.get(0).length();
    }
    result.push_str(&String::from(source.slice(cursor, source.length())));
    for (pattern, replacement) in [
        (r"<(?:b|strong)>([\s\S]*?)</(?:b|strong)>", "**$1**"),
        (r"<(?:i|em)>([\s\S]*?)</(?:i|em)>", "*$1*"),
        (r"<code>([\s\S]*?)</code>", "`$1`"),
        (r"<mark>([\s\S]*?)</mark>", "**$1**"),
        (r"<br\s*/?>", "  \n"),
    ] {
        result = replace(&result, pattern, "gi", replacement);
    }
    result = strip(&result);
    for (from, to) in [
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#39;", "'"),
        ("&apos;", "'"),
    ] {
        result = result.replace(from, to);
    }
    crate::trim(&result).to_owned()
}
fn html(value: &str) -> String {
    crate::trim(&replace(&inline(value), r"\s+", "g", " ")).to_owned()
}
fn absolute(value: &str, origin: &str) -> String {
    if value.starts_with("//") {
        format!("https:{value}")
    } else if value.starts_with('/') {
        format!("{origin}{value}")
    } else {
        value.to_owned()
    }
}
fn alt(value: &str) -> String {
    value.replace(['[', ']'], "")
}

#[allow(deprecated)]
pub fn body(raw: &str, origin: &str) -> worker::Result<String> {
    if raw.is_empty() {
        return Ok(String::new());
    }
    let doc: Value = match serde_json::from_str(crate::trim(raw)) {
        Ok(doc) => doc,
        Err(_) => return Ok(html(raw)),
    };
    let Some(blocks) = doc.get("blocks").and_then(Value::as_array) else {
        return Ok(String::new());
    };
    let mut out = Vec::new();
    for block in blocks {
        if block.is_null() {
            return Err(worker::Error::RustError("Invalid markdown block".into()));
        }
        let data = block.get("data").unwrap_or(&Value::Null);
        let text = |key| string(data.get(key));
        match block
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
        {
            "header" => {
                let level = data
                    .get("level")
                    .map(|v| match v {
                        Value::Bool(b) => {
                            if *b {
                                1.0
                            } else {
                                0.0
                            }
                        }
                        Value::Null => 0.0,
                        _ => js_sys::Number::new(&JsValue::from_str(
                            &crate::post_routes::js_string(v),
                        ))
                        .value_of(),
                    })
                    .unwrap_or(0.0);
                let level = if level.is_nan() || level == 0.0 {
                    2.0
                } else {
                    level
                }
                .clamp(2.0, 6.0) as usize;
                out.push(format!("{} {}", "#".repeat(level), inline(&text("text"))));
                out.push(String::new());
            }
            "paragraph" => {
                let content = inline(&text("text"));
                if !content.is_empty() {
                    out.push(content);
                    out.push(String::new());
                }
            }
            "list" => {
                let ordered = data.get("style").and_then(Value::as_str) == Some("ordered");
                if let Some(items) = data.get("items").and_then(Value::as_array) {
                    for (index, item) in items.iter().enumerate() {
                        if item.is_null() {
                            return Err(worker::Error::RustError(
                                "Invalid markdown list item".into(),
                            ));
                        }
                        let content = if let Some(s) = item.as_str() {
                            s.to_owned()
                        } else {
                            string(item.get("content"))
                        };
                        let prefix = if ordered {
                            format!("{}.", index + 1)
                        } else {
                            "-".into()
                        };
                        out.push(format!("{prefix} {}", inline(&content)));
                    }
                }
                out.push(String::new());
            }
            "quote" => {
                for line in inline(&text("text")).split('\n') {
                    out.push(format!("> {line}"));
                }
                let caption = text("caption");
                if !caption.is_empty() {
                    out.push(format!("> — {}", inline(&caption)));
                }
                out.push(String::new());
            }
            "image" => {
                let file_url = string(data.get("file").and_then(|v| v.get("url")));
                let url = if file_url.is_empty() {
                    text("url")
                } else {
                    absolute(&file_url, origin)
                };
                let caption = text("caption");
                if !url.is_empty() {
                    out.push(format!("![{}]({url})", alt(&caption)));
                    if !caption.is_empty() {
                        out.push(String::new());
                        out.push(format!("_{}_", inline(&caption)));
                    }
                    out.push(String::new());
                }
            }
            "embed" => {
                let source = text("source");
                let url = if source.is_empty() {
                    text("embed")
                } else {
                    source
                };
                let caption = text("caption");
                if !url.is_empty() {
                    out.push(format!(
                        "[{}]({url})",
                        inline(if caption.is_empty() { &url } else { &caption })
                    ));
                    out.push(String::new());
                }
            }
            "delimiter" => {
                out.push("---".into());
                out.push(String::new());
            }
            "code" => {
                out.push(format!("```{}", text("language")));
                out.push(text("code"));
                out.push("```".into());
                out.push(String::new());
            }
            "raw" => {
                let content = html(&text("html"));
                if !content.is_empty() {
                    out.push(content);
                    out.push(String::new());
                }
            }
            _ => {}
        }
    }
    Ok(crate::trim(&replace(&out.join("\n"), r"\n{3,}", "g", "\n\n")).to_owned())
}
