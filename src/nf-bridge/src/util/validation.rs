//! utility validation helpers
use serde_json::Value;

pub(crate) fn require_object(params: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    params
        .as_object()
        .ok_or_else(|| {
            "failed to read params: params must be a JSON object. Fix: send a JSON object in the request params.".to_string()
        })
}

pub(crate) fn require_value<'a>(params: &'a Value, key: &str) -> Result<&'a Value, String> {
    require_object(params)?
        .get(key)
        .ok_or_else(|| {
            format!(
                "failed to read params.{key}: missing params.{key}. Fix: provide params.{key} in the request."
            )
        })
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
        [] => Err( // Fix: included in the error string below
            "failed to read params: no valid parameter keys were provided. Fix: update the request to reference a specific params field.".to_string(),
        ),
        [key] => Err(format!( // Fix: included in the error string below
            "failed to read params.{key}: missing params.{key}. Fix: provide params.{key} in the request."
        )),
        _ => Err(format!( // Fix: included in the error string below
            "failed to read params: missing one of {}. Fix: provide one of the supported params fields in the request.",
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
        .ok_or_else(|| {
            format!(
                "failed to read params.{key}: params.{key} must be a string. Fix: provide params.{key} as a JSON string."
            )
        })
}

pub(crate) fn validate_project_component(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!( // Fix: included in the error string below
            "failed to validate params.{label}: value must be a non-empty string. Fix: provide a non-empty name without path separators."
        ));
    }

    if value == "." || value == ".." || value.contains(['/', '\\']) {
        return Err(format!( // Fix: included in the error string below
            "failed to validate params.{label}: invalid params.{label}: {value}. Fix: use a simple name without '.', '..', '/' or '\\'."
        ));
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
                .ok_or_else(|| {
                    format!(
                        "failed to read params.{key}: params.{key} must be a string. Fix: provide params.{key} as a JSON string."
                    )
                });
        }
    }

    Err(format!(
        // Fix: included in the error string below
        "failed to read params.{}: missing params.{}. Fix: provide params.{} in the request.",
        keys[0], keys[0], keys[0]
    ))
}

pub(crate) fn require_array<'a>(params: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    require_value(params, key)?
        .as_array()
        .ok_or_else(|| {
            format!(
                "failed to read params.{key}: params.{key} must be an array. Fix: provide params.{key} as a JSON array."
            )
        })
}

pub(crate) fn require_u32(params: &Value, key: &str) -> Result<u32, String> {
    let value = require_value(params, key)?
        .as_u64()
        .ok_or_else(|| {
            format!(
                "failed to read params.{key}: params.{key} must be an unsigned integer. Fix: provide params.{key} as a whole number."
            )
        })?;

    u32::try_from(value).map_err(|_| {
        format!(
            "failed to read params.{key}: value is out of range for a 32-bit unsigned integer. Fix: provide a value between 0 and {}.",
            u32::MAX
        )
    })
}

pub(crate) fn require_positive_u32(params: &Value, key: &str) -> Result<u32, String> {
    let value = require_u32(params, key)?;
    if value == 0 {
        Err(format!( // Fix: included in the error string below
            "failed to read params.{key}: params.{key} must be greater than 0. Fix: provide params.{key} as an integer larger than zero."
        ))
    } else {
        Ok(value)
    }
}

pub(crate) fn require_positive_f64(params: &Value, key: &str) -> Result<f64, String> {
    let value = require_value(params, key)?
        .as_f64()
        .ok_or_else(|| {
            format!(
                "failed to read params.{key}: params.{key} must be a number. Fix: provide params.{key} as a JSON number."
            )
        })?;

    if value.is_finite() && value > 0.0 {
        Ok(value)
    } else {
        Err(format!( // Fix: included in the error string below
            "failed to read params.{key}: params.{key} must be greater than 0. Fix: provide params.{key} as a finite number larger than zero."
        ))
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
        .ok_or_else(|| {
            format!(
                "failed to read params.{key}: params.{key} must be an unsigned integer. Fix: provide params.{key} as a whole number."
            )
        })?;
    let parsed = u8::try_from(raw).map_err(|_| {
        format!(
            "failed to read params.{key}: value is out of range for an 8-bit unsigned integer. Fix: provide a value between 0 and 255."
        )
    })?;
    if parsed < min || parsed > max {
        return Err(format!( // Fix: included in the error string below
            "failed to read params.{key}: params.{key} must be between {min} and {max}. Fix: provide params.{key} within the supported range."
        ));
    }

    Ok(Some(parsed))
}
