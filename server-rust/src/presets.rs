use serde::Deserialize;
use serde_json::{Value, json};
use worker::{wasm_bindgen::JsValue, *};

fn field_json(row: &Value, key: &str, fallback: Value) -> String {
    serde_json::to_string(row.get(key).unwrap_or(&fallback)).unwrap_or_else(|_| "null".into())
}

fn preset_shape(row: &Value) -> Result<String> {
    let raw = row
        .get("permissions")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("{}");
    let parsed = worker::js_sys::JSON::parse(raw).unwrap_or(JsValue::NULL);
    let property = |name: &str| {
        if parsed.is_object() {
            worker::js_sys::Reflect::get(&parsed, &JsValue::from_str(name))
                .unwrap_or(JsValue::UNDEFINED)
        } else {
            JsValue::UNDEFINED
        }
    };
    let access = property("access_admin");
    let access = if access.is_null() || access.is_undefined() {
        false
    } else if let Some(v) = access.as_bool() {
        v
    } else if let Some(v) = access.as_f64() {
        v != 0.0 && !v.is_nan()
    } else if let Some(v) = access.as_string() {
        !v.is_empty()
    } else {
        true
    };
    let perms = property("permissions");
    let sorted = if worker::js_sys::Array::is_array(&perms) {
        let arr = worker::js_sys::Array::from(&perms);
        arr.sort();
        arr
    } else {
        worker::js_sys::Array::new()
    };
    let permissions = String::from(
        worker::js_sys::JSON::stringify(&sorted)
            .map_err(|_| Error::RustError("Invalid preset permissions".into()))?,
    );
    let truthy = |v: &Value| match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    };
    let fallback = |key: &str, default: Value| {
        row.get(key)
            .filter(|value| truthy(value))
            .cloned()
            .unwrap_or(default)
    };
    let builtin = row.get("is_builtin").is_some_and(truthy);
    Ok(format!(
        "{{\"id\":{},\"slug\":{},\"name\":{},\"description\":{},\"is_builtin\":{},\"permissions\":{{\"access_admin\":{},\"permissions\":{}}},\"created_at\":{},\"updated_at\":{}}}",
        field_json(row, "id", Value::Null),
        field_json(row, "slug", Value::Null),
        field_json(row, "name", Value::Null),
        serde_json::to_string(&fallback("description", json!(""))).unwrap_or_default(),
        builtin,
        access,
        permissions,
        serde_json::to_string(&fallback("created_at", Value::Null)).unwrap_or_default(),
        serde_json::to_string(&fallback("updated_at", Value::Null)).unwrap_or_default()
    ))
}

#[derive(Deserialize)]
struct PresetInput {
    operation: String,
    body: Value,
}

fn preset_text(body: &Value, key: &str, limit: Option<u32>) -> String {
    let raw = body
        .get(key)
        .filter(|value| match value {
            Value::Null => false,
            Value::Bool(v) => *v,
            Value::Number(v) => v.as_f64() != Some(0.0),
            Value::String(v) => !v.is_empty(),
            _ => true,
        })
        .map(crate::post_routes::js_string)
        .unwrap_or_default();
    let text = crate::trim(&raw);
    if let Some(limit) = limit {
        String::from(worker::js_sys::JsString::from(text).slice(0, limit))
    } else {
        text.to_owned()
    }
}

pub async fn normalize(req: &mut Request) -> Result<Response> {
    let input: PresetInput = req.json().await?;
    let name = preset_text(&input.body, "name", None);
    let description = preset_text(&input.body, "description", Some(500));
    if input.operation == "create" {
        let slug = String::from(
            worker::js_sys::JsString::from(preset_text(&input.body, "slug", None)).to_lower_case(),
        );
        if slug.len() < 2
            || slug.len() > 40
            || !slug
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        {
            return Response::from_json(
                &json!({"error":"slug는 영문 소문자·숫자·하이픈 2~40자여야 합니다.","status":400}),
            );
        }
        if ["writer", "reader", "marketing"].contains(&slug.as_str()) {
            return Response::from_json(
                &json!({"error":"이 slug는 빌트인 프리셋으로 예약되어 있습니다.","status":409}),
            );
        }
        if name.is_empty() {
            return Response::from_json(
                &json!({"error":"프리셋 이름을 입력해주세요.","status":400}),
            );
        }
        return Response::from_json(&json!({"slug":slug,"name":name,"description":description}));
    }
    if input.operation == "update" {
        if input.body.get("name").is_some() && name.is_empty() {
            return Response::from_json(
                &json!({"error":"프리셋 이름은 비워둘 수 없습니다.","status":400}),
            );
        }
        return Response::from_json(&json!({"name":name,"description":description}));
    }
    Err(Error::RustError("Invalid preset normalization".into()))
}

#[derive(Deserialize)]
struct Options {
    operation: String,
    slug: Option<String>,
    name: Option<String>,
    description: Option<String>,
    permissions: Option<String>,
}

pub async fn catalog(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Options = req.json().await?;
    let db = env.d1("DB")?;
    match o.operation.as_str() {
        "list" => {
            let rows = db.prepare("SELECT id, slug, name, description, permissions, is_builtin, created_at, updated_at FROM admin_user_presets ORDER BY is_builtin DESC, id ASC").all().await?.results::<Value>()?;
            let presets = rows.iter().map(preset_shape).collect::<Result<Vec<_>>>()?;
            Response::ok(format!("{{\"presets\":[{}]}}", presets.join(",")))
        }
        "create" => {
            let slug = o
                .slug
                .ok_or_else(|| Error::RustError("Missing slug".into()))?;
            let name = o
                .name
                .ok_or_else(|| Error::RustError("Missing name".into()))?;
            let desc = o
                .description
                .ok_or_else(|| Error::RustError("Missing description".into()))?;
            let perms = o
                .permissions
                .ok_or_else(|| Error::RustError("Missing permissions".into()))?;
            let result = db.prepare("INSERT INTO admin_user_presets (slug,name,description,permissions,is_builtin) VALUES (?,?,?,?,0) ON CONFLICT(slug) DO NOTHING").bind(&[slug.as_str().into(),name.into(),desc.into(),perms.into()])?.run().await?;
            let changed = result.meta()?.and_then(|m| m.changes).unwrap_or(0);
            let row = if changed == 1 {
                db.prepare("SELECT id,slug,name,description,permissions,is_builtin,created_at,updated_at FROM admin_user_presets WHERE slug=?").bind(&[slug.into()])?.first::<Value>(None).await?
            } else {
                None
            };
            let preset = if let Some(row) = row {
                preset_shape(&row)?
            } else {
                "null".into()
            };
            Response::ok(format!(
                "{{\"created\":{},\"preset\":{}}}",
                changed == 1,
                preset
            ))
        }
        _ => Err(Error::RustError("Invalid preset operation".into())),
    }
}

#[derive(Deserialize)]
struct Snapshot {
    permissions: String,
    updated_at: String,
    name: String,
    description: Option<String>,
}
#[derive(Deserialize)]
struct Member {
    id: f64,
    previous: String,
    next: String,
}
#[derive(Deserialize)]
struct Mutation {
    operation: String,
    id: f64,
    snapshot: Option<Snapshot>,
    fields: Option<Vec<String>>,
    values: Option<Vec<String>>,
    members: Option<Vec<Member>>,
    old_permissions: Option<Value>,
    next_permissions: Option<Vec<String>>,
}

fn canonical_permissions(raw: &Value) -> (bool, Vec<String>) {
    let value = if let Some(text) = raw.as_str() {
        serde_json::from_str::<Value>(text).unwrap_or(Value::Null)
    } else {
        raw.clone()
    };
    canonical_value(&value)
}

fn canonical_value(value: &Value) -> (bool, Vec<String>) {
    let access = value.get("access_admin").is_some_and(|v| match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    });
    let mut permissions: Vec<String> = value
        .get("permissions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    permissions.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    (access, permissions)
}

#[derive(Deserialize)]
struct PermissionComparison {
    expected: Value,
    stored: Value,
}

pub async fn compare_permissions(req: &mut Request) -> Result<Response> {
    let input: PermissionComparison = req.json().await?;
    Response::from_json(
        &json!({"matches":canonical_value(&input.expected)==canonical_permissions(&input.stored)}),
    )
}

pub async fn mutation(req: &mut Request, env: &Env) -> Result<Response> {
    let o: Mutation = req.json().await?;
    let db = env.d1("DB")?;
    let id = worker::wasm_bindgen::JsValue::from_f64(o.id);
    match o.operation.as_str() {
        "get" => {
            let row = db.prepare("SELECT id, slug, name, description, is_builtin, permissions, updated_at FROM admin_user_presets WHERE id = ?").bind(&[id])?.first::<Value>(None).await?;
            Response::from_json(&json!({"row":row}))
        }
        "members" => {
            let rows = db.prepare("SELECT id, username, permissions FROM admin_users WHERE status = 'active' AND role = 'member'").all().await?.results::<Value>()?;
            Response::from_json(&json!({"members":rows}))
        }
        "matching-members" => {
            let old = canonical_permissions(o.old_permissions.as_ref().unwrap_or(&Value::Null));
            let next = o
                .next_permissions
                .ok_or_else(|| Error::RustError("Missing next permissions".into()))?;
            let next_json = serde_json::to_string(&next)
                .map_err(|error| Error::RustError(error.to_string()))?;
            let rows = db.prepare("SELECT id, username, permissions FROM admin_users WHERE status = 'active' AND role = 'member'").all().await?.results::<Value>()?;
            let members:Vec<Value> = rows.into_iter().filter_map(|row| {
                let previous=row.get("permissions").cloned().unwrap_or(Value::Null);
                let (access,perms)=canonical_permissions(&previous);
                if (access,perms)!=old {return None;}
                Some(json!({"id":row.get("id"),"previous":previous,"next":format!("{{\"access_admin\":{},\"permissions\":{}}}",access,next_json)}))
            }).collect();
            Response::from_json(&json!({"members":members}))
        }
        "delete" => {
            let result = db
                .prepare("DELETE FROM admin_user_presets WHERE id = ? AND is_builtin = 0")
                .bind(&[id])?
                .run()
                .await?;
            Response::from_json(
                &json!({"changes":result.meta()?.and_then(|m|m.changes).unwrap_or(0)}),
            )
        }
        "update" => {
            let snapshot = o
                .snapshot
                .ok_or_else(|| Error::RustError("Missing preset snapshot".into()))?;
            let fields = o.fields.unwrap_or_default();
            let values = o.values.unwrap_or_default();
            if fields.is_empty()
                || fields.len() != values.len()
                || fields
                    .iter()
                    .any(|f| !matches!(f.as_str(), "name" | "description" | "permissions"))
            {
                return Err(Error::RustError("Invalid preset fields".into()));
            }
            let expected: Vec<worker::wasm_bindgen::JsValue> = vec![
                id.clone(),
                snapshot.permissions.as_str().into(),
                snapshot.updated_at.as_str().into(),
                snapshot.name.as_str().into(),
                snapshot.description.as_deref().unwrap_or("").into(),
            ];
            let mut statements = Vec::new();
            for member in o.members.unwrap_or_default() {
                let mut args: Vec<worker::wasm_bindgen::JsValue> = vec![
                    member.next.into(),
                    worker::wasm_bindgen::JsValue::from_f64(member.id),
                    member.previous.into(),
                ];
                args.extend(expected.clone());
                statements.push(db.prepare("UPDATE admin_users SET permissions = ?, updated_at = datetime('now') WHERE id = ? AND role = 'member' AND status = 'active' AND permissions = ? AND EXISTS (SELECT 1 FROM admin_user_presets WHERE id = ? AND permissions = ? AND updated_at = ? AND name = ? AND COALESCE(description, '') = ?)").bind(&args)?);
            }
            let columns = fields
                .iter()
                .map(|field| format!("{field} = ?"))
                .collect::<Vec<_>>()
                .join(", ");
            let mut args: Vec<worker::wasm_bindgen::JsValue> =
                values.iter().map(|v| v.as_str().into()).collect();
            args.extend(expected);
            statements.push(db.prepare(format!("UPDATE admin_user_presets SET {columns}, updated_at = datetime('now') WHERE id = ? AND permissions = ? AND updated_at = ? AND name = ? AND COALESCE(description, '') = ?")).bind(&args)?);
            let results = db.batch(statements).await?;
            let changed = results
                .last()
                .and_then(|r| r.meta().ok().flatten())
                .and_then(|m| m.changes)
                .unwrap_or(0);
            let propagated: usize = results
                .iter()
                .take(results.len().saturating_sub(1))
                .filter_map(|r| r.meta().ok().flatten().and_then(|m| m.changes))
                .sum();
            Response::from_json(&json!({"changed":changed,"propagated":propagated}))
        }
        _ => Err(Error::RustError("Invalid preset mutation".into())),
    }
}
