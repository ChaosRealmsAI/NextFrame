use std::fs;

use serde_json::{Map, Value, json};

use crate::errors::NfError;
use crate::handlers::{ensure_project, project_dir, required_str};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, compile_composition_source, validate_slug};

#[derive(Debug, Clone)]
pub struct CompositionsOpHandler {
    storage: JsonStorage,
}

impl CompositionsOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self { storage }
    }

    fn list(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        ensure_project(&self.storage, &project)?;
        let dir = project_dir(&self.storage, &project).join("compositions");
        let mut items = Vec::new();
        if dir.exists() {
            for entry in fs::read_dir(&dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().and_then(|value| value.to_str()) != Some("json") {
                    continue;
                }
                let raw = fs::read_to_string(&path)?;
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    items.push(json!({
                        "id": value.get("id").and_then(Value::as_str).unwrap_or_default(),
                        "name": value.get("name").and_then(Value::as_str).unwrap_or_default(),
                        "path": path.display().to_string()
                    }));
                }
            }
        }
        Ok(Value::Array(items))
    }

    fn show(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let composition = required_str(params, "composition")?;
        ensure_project(&self.storage, &project)?;
        validate_slug(&composition)?;
        if !self.storage.composition_exists(&project, &composition)? {
            return Err(NfError::ValidationFailed(format!(
                "composition not found: {project}/{composition}"
            )));
        }
        let value = self.storage.load_composition(&project, &composition)?;
        let selected = select_composition_value(&value, params)?;
        let compiled = compile_composition_source(&self.storage, &project, &value)?;
        Ok(json!({
            "composition": value,
            "selected": selected,
            "source": compiled.source,
            "warnings": compiled.warnings
        }))
    }

    fn update_track(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let composition = required_str(params, "composition")?;
        let track_id = required_str(params, "track")?;
        ensure_project(&self.storage, &project)?;
        validate_slug(&composition)?;
        let mut value = self.storage.load_composition(&project, &composition)?;
        let tracks = value
            .get_mut("tracks")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| {
                NfError::ValidationFailed("composition.tracks must be an array".to_string())
            })?;
        let track = tracks
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(track_id.as_str()))
            .ok_or_else(|| NfError::ValidationFailed(format!("unknown track: {track_id}")))?;

        if let Some(patch) = params.get("params").and_then(Value::as_object) {
            merge_object(track, "params", patch);
        }
        if let Some(patch) = params.get("style").and_then(Value::as_object) {
            merge_object(track, "style", patch);
        }
        if let Some(field) = params.get("field").and_then(Value::as_str) {
            let value = params.get("value").cloned().unwrap_or(Value::Null);
            set_field_path(track, field, value)?;
        }
        self.storage
            .save_composition(&project, &composition, &value)?;
        let compiled = compile_composition_source(&self.storage, &project, &value)?;
        let selected = select_composition_value(&value, params)?;
        Ok(json!({
            "composition": value,
            "selected": selected,
            "source": compiled.source,
            "warnings": compiled.warnings
        }))
    }
}

fn select_composition_value(composition: &Value, params: &Value) -> Result<Value, NfError> {
    let Some(track_id) = params
        .get("track")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    else {
        return Ok(Value::Null);
    };
    let tracks = composition
        .get("tracks")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            NfError::ValidationFailed("composition.tracks must be an array".to_string())
        })?;
    let track = tracks
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(track_id))
        .ok_or_else(|| NfError::ValidationFailed(format!("unknown track: {track_id}")))?;
    let Some(field) = params
        .get("field")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    else {
        return Ok(track.clone());
    };
    Ok(get_field_path(track, field).cloned().unwrap_or(Value::Null))
}

fn get_field_path<'a>(value: &'a Value, field: &str) -> Option<&'a Value> {
    let mut current = value;
    for part in field
        .split('.')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        if let Some(index) = path_index(part) {
            current = current.as_array()?.get(index)?;
        } else {
            current = current.get(part)?;
        }
    }
    Some(current)
}

fn set_field_path(target: &mut Value, field: &str, value: Value) -> Result<(), NfError> {
    let parts = field
        .split('.')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Err(NfError::ValidationFailed(
            "field path is required".to_string(),
        ));
    }
    set_path_part(target, &parts, value, field)
}

fn set_path_part(
    target: &mut Value,
    parts: &[&str],
    value: Value,
    field: &str,
) -> Result<(), NfError> {
    let Some((part, rest)) = parts.split_first() else {
        *target = value;
        return Ok(());
    };
    if rest.is_empty() {
        if let Some(index) = path_index(part) {
            ensure_array(target);
            let array = target
                .as_array_mut()
                .ok_or_else(|| NfError::ValidationFailed(format!("invalid array path: {field}")))?;
            if array.len() <= index {
                array.resize(index + 1, Value::Null);
            }
            array[index] = value;
            return Ok(());
        }
        ensure_object(target);
        target[*part] = value;
        return Ok(());
    }

    let next_is_array = path_index(rest[0]).is_some();
    if let Some(index) = path_index(part) {
        ensure_array(target);
        let array = target
            .as_array_mut()
            .ok_or_else(|| NfError::ValidationFailed(format!("invalid array path: {field}")))?;
        if array.len() <= index {
            array.resize(index + 1, Value::Null);
        }
        if !array[index].is_object() && !array[index].is_array() {
            array[index] = if next_is_array { json!([]) } else { json!({}) };
        }
        return set_path_part(&mut array[index], rest, value, field);
    }

    ensure_object(target);
    if !target
        .get(part)
        .is_some_and(|item| item.is_object() || item.is_array())
    {
        target[*part] = if next_is_array { json!([]) } else { json!({}) };
    }
    let child = target
        .get_mut(part)
        .ok_or_else(|| NfError::ValidationFailed(format!("invalid field path: {field}")))?;
    set_path_part(child, rest, value, field)
}

fn ensure_object(value: &mut Value) {
    if !value.is_object() {
        *value = json!({});
    }
}

fn ensure_array(value: &mut Value) {
    if !value.is_array() {
        *value = json!([]);
    }
}

fn path_index(part: &str) -> Option<usize> {
    if part.is_empty() || (part.len() > 1 && part.starts_with('0')) {
        return None;
    }
    part.parse::<usize>().ok()
}

impl OpHandler for CompositionsOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "compositions-list" | "compositions.list" => self.list(&req.params)?,
            "compositions-show" | "compositions.show" => self.show(&req.params)?,
            "compositions-update-track"
            | "compositions-updateTrack"
            | "compositions.updateTrack"
            | "compositions.update-track" => self.update_track(&req.params)?,
            _ => return Ok(None),
        };
        Ok(Some(data))
    }
}

fn merge_object(target: &mut Value, key: &str, patch: &Map<String, Value>) {
    if !target.get(key).is_some_and(Value::is_object) {
        target[key] = json!({});
    }
    if let Some(object) = target.get_mut(key).and_then(Value::as_object_mut) {
        for (name, value) in patch {
            object.insert(name.clone(), value.clone());
        }
    }
}
