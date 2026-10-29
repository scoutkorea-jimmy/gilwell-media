use serde::Deserialize;
use serde_json::json;
use worker::*;

#[derive(Deserialize)]
struct Input {
    header: Vec<u8>,
}

#[derive(Deserialize)]
struct MimeInput {
    header: String,
}

#[derive(Deserialize)]
struct StorageKeyInput {
    value: String,
    origin: String,
}

pub async fn storage_key(req: &mut Request) -> Result<Response> {
    let input: StorageKeyInput = req.json().await?;
    let key = web_sys::Url::new_with_base(&input.value, &input.origin)
        .ok()
        .and_then(|url| {
            let path = url.pathname();
            path.strip_prefix("/api/images/")
                .and_then(|encoded| js_sys::decode_uri_component(encoded).ok())
                .map(String::from)
        })
        .unwrap_or_default();
    Response::from_json(&json!({"key":key}))
}

pub async fn mime(req: &mut Request) -> Result<Response> {
    let input: MimeInput = req.json().await?;
    let re = js_sys::RegExp::new(r"data:([^;]+)", "");
    let raw = re
        .exec(&input.header)
        .and_then(|parts| parts.get(1).as_string())
        .unwrap_or_else(|| "image/jpeg".into());
    let raw = String::from(js_sys::JsString::from(raw).to_lower_case());
    let (mime, ext) = match raw.as_str() {
        "image/jpeg" | "image/jpg" => ("image/jpeg", "jpg"),
        "image/png" => ("image/png", "png"),
        "image/gif" => ("image/gif", "gif"),
        "image/webp" => ("image/webp", "webp"),
        _ => {
            return Response::from_json(&json!({"error":format!("Unsupported image type: {raw}")}));
        }
    };
    Response::from_json(&json!({"mimeType":mime,"ext":ext}))
}

pub async fn detect(req: &mut Request) -> Result<Response> {
    let input: Input = req.json().await?;
    let b = input.header.as_slice();
    let detected = if b.len() < 12 {
        None
    } else if b.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if b.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if b.starts_with(b"RIFF") && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    };
    Response::from_json(&json!({"detected":detected}))
}
