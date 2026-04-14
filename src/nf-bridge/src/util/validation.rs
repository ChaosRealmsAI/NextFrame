use serde_json::Value;

pub(crate) fn require_object(params: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    params
        .as_object()
        .ok_or_else(|| "params must be a JSON object".to_string())
}

pub(crate) fn require_value<'a>(params: &'a Value, key: &str) -> Result<&'a Value, String> {
    require_object(params)?
        .get(key)
        .ok_or_else(|| format!("missing params.{key}"))
}

pub(crate) fn require_value_alias<'a>(
    params: &'a Value,
    keys: &[&str],
) -> Result<&'a Value, String> {
    let object = require_object(params)?;

    for key in keys {
        if let Some(value) = object.get(*key) {
            return Ok(value);
        }
    }

    match keys {
        [] => Err("missing required params value".to_string()),
        [key] => Err(format!("missing params.{key}")),
        _ => Err(format!(
            "missing one of {}",
            keys.iter()
                .map(|key| format!("params.{key}"))
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

pub(crate) fn require_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    require_value(params, key)?
        .as_str()
        .ok_or_else(|| format!("params.{key} must be a string"))
}

pub(crate) fn validate_project_component(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("params.{label} must be a non-empty string"));
    }

    if value == "." || value == ".." || value.contains(['/', '\\']) {
        return Err(format!("invalid params.{label}: {value}"));
    }

    Ok(())
}

pub(crate) fn require_string_alias<'a>(
    params: &'a Value,
    keys: &[&str],
) -> Result<&'a str, String> {
    let object = require_object(params)?;

    for key in keys {
        if let Some(value) = object.get(*key) {
            return value
                .as_str()
                .ok_or_else(|| format!("params.{key} must be a string"));
        }
    }

    Err(format!("missing params.{}", keys[0]))
}

pub(crate) fn require_array<'a>(params: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    require_value(params, key)?
        .as_array()
        .ok_or_else(|| format!("params.{key} must be an array"))
}

pub(crate) fn require_u32(params: &Value, key: &str) -> Result<u32, String> {
    let value = require_value(params, key)?
        .as_u64()
        .ok_or_else(|| format!("params.{key} must be an unsigned integer"))?;

    u32::try_from(value).map_err(|_| format!("params.{key} is out of range"))
}

pub(crate) fn require_positive_u32(params: &Value, key: &str) -> Result<u32, String> {
    let value = require_u32(params, key)?;
    if value == 0 {
        Err(format!("params.{key} must be greater than 0"))
    } else {
        Ok(value)
    }
}

pub(crate) fn require_positive_f64(params: &Value, key: &str) -> Result<f64, String> {
    let value = require_value(params, key)?
        .as_f64()
        .ok_or_else(|| format!("params.{key} must be a number"))?;

    if value.is_finite() && value > 0.0 {
        Ok(value)
    } else {
        Err(format!("params.{key} must be greater than 0"))
    }
}

pub(crate) fn read_optional_u8_in_range(
    params: &Value,
    key: &str,
    min: u8,
    max: u8,
) -> Result<Option<u8>, String> {
    let Some(value) = require_object(params)?.get(key) else {
        return Ok(None);
    };

    let raw = value
        .as_u64()
        .ok_or_else(|| format!("params.{key} must be an unsigned integer"))?;
    let parsed = u8::try_from(raw).map_err(|_| format!("params.{key} is out of range"))?;
    if parsed < min || parsed > max {
        return Err(format!("params.{key} must be between {min} and {max}"));
    }

    Ok(Some(parsed))
}
