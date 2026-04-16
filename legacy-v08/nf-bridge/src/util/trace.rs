//! structured NDJSON trace logging helpers
use std::io::{self, Write};

use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};

pub(crate) fn emit_trace(module: impl AsRef<str>, event: impl AsRef<str>, data: Value) {
    let line = build_trace_line(module.as_ref(), event.as_ref(), data);
    let _ = writeln!(io::stderr().lock(), "[bridge] {line}");
}

pub(crate) fn emit_message(module_path: &str, message: String) {
    emit_trace(
        infer_module_name(module_path),
        "message",
        json!({ "message": message }),
    );
}

pub(crate) fn infer_module_name(module_path: &str) -> String {
    let mut segments = module_path.split("::");
    let crate_name = segments.next().unwrap_or(module_path);
    segments
        .next()
        .map(str::to_owned)
        .unwrap_or_else(|| normalize_crate_name(crate_name))
}

pub(crate) fn build_trace_line(module: &str, event: &str, data: Value) -> String {
    json!({
        "ts": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "module": module,
        "event": event,
        "data": data,
    })
    .to_string()
}

fn normalize_crate_name(crate_name: &str) -> String {
    crate_name
        .rsplit('_')
        .next()
        .unwrap_or(crate_name)
        .to_owned()
}

macro_rules! trace_log {
    (module: $module:expr, event: $event:expr, data: { $($key:literal : $value:expr),* $(,)? }) => {{
        $crate::util::trace::emit_trace($module, $event, serde_json::json!({ $($key: $value),* }));
    }};
    ($($arg:tt)*) => {{
        $crate::util::trace::emit_message(module_path!(), format!($($arg)*));
    }};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_top_level_module_name() {
        assert_eq!(infer_module_name("nf_bridge::export::runner"), "export");
        assert_eq!(infer_module_name("nf_bridge"), "bridge");
    }

    #[test]
    fn builds_ndjson_trace_line() {
        let line = build_trace_line("export", "start", json!({ "pid": 42 }));
        let value: Value = serde_json::from_str(&line).expect("trace line should parse");

        assert_eq!(value.get("module"), Some(&json!("export")));
        assert_eq!(value.get("event"), Some(&json!("start")));
        assert_eq!(value.pointer("/data/pid"), Some(&json!(42)));
        assert!(value.get("ts").and_then(Value::as_str).is_some());
    }
}
