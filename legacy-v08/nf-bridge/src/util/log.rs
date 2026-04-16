//! utility logging helpers
use serde_json::{json, Value};

use crate::util::validation::require_string;

pub(crate) fn handle_log(params: &Value) -> Result<Value, String> {
    let level = require_string(params, "level")?;
    let message = require_string(params, "msg")?;

    trace_log!(
        module: "webview",
        event: "log",
        data: {
            "level": level,
            "message": message,
        }
    );

    // AI command results — write to result file for CLI to read
    if level == "cmd_result" || level == "cmd_error" {
        let result_path = std::env::temp_dir().join("nextframe-cmd-result.txt");
        let _ = std::fs::write(&result_path, message);
    }

    Ok(json!({
        "logged": true,
        "level": level,
    }))
}
