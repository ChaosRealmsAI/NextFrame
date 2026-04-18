//! JSON-only stdout emitters (rule-ai-operable).
//!
//! Success envelope: `{"ok":true,"data":<value>}`
//! Error envelope  : `{"ok":false,"error":{"code","message","hint?","location?"}}`
//!
//! Engine pass-through events (`{"event":"..."}`) are emitted as-is on stdout.

use serde::Serialize;
use serde_json::json;

use crate::error::CliError;

/// Emit a success envelope `{"ok":true,"data":<value>}` on its own line.
pub fn emit_ok<T: Serialize>(data: &T) {
    let envelope = json!({ "ok": true, "data": data });
    // Safety: json! never fails; serde_json::to_string on a valid Value never fails
    // but we still guard against it to respect workspace `unwrap_used = deny`.
    match serde_json::to_string(&envelope) {
        Ok(s) => println!("{s}"),
        Err(_) => println!(r#"{{"ok":true,"data":null}}"#),
    }
}

/// Emit an error envelope on its own line.
pub fn emit_error(err: &CliError) {
    let payload = err.payload();
    let envelope = json!({
        "ok": false,
        "error": {
            "code": payload.code,
            "message": payload.message,
            "hint": payload.hint,
            "location": payload.location,
        },
    });
    match serde_json::to_string(&envelope) {
        Ok(s) => println!("{s}"),
        Err(_) => println!(r#"{{"ok":false,"error":{{"code":"E_EMIT","message":""}}}}"#),
    }
}

/// Pass-through engine event on stdout (already valid JSON).
pub fn emit_raw_line(line: &str) {
    println!("{line}");
}
