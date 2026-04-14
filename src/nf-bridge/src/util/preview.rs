use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::codec::encoding::base64_encode;
use crate::util::validation::require_string;

pub(crate) fn handle_preview_frame(params: &Value) -> Result<Value, String> {
    use std::io::Read as _;

    let timeline_path = require_string(params, "timelinePath")?;
    let t = params
        .get("t")
        .and_then(Value::as_f64)
        .ok_or_else(|| "preview.frame requires numeric 't' parameter".to_string())?;
    let width = params.get("width").and_then(Value::as_u64).unwrap_or(960);
    let height = params.get("height").and_then(Value::as_u64).unwrap_or(540);

    // render to temp file
    let tmp_dir = env::temp_dir().join("nextframe-preview");
    let _ = fs::create_dir_all(&tmp_dir);
    let out_path = tmp_dir.join(format!("frame-{}.png", t));

    // find nextframe CLI
    let cli_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../cli/bin/nextframe.js");

    let status = Command::new("node")
        .arg(&cli_path)
        .arg("frame")
        .arg(timeline_path)
        .arg(format!("{t}"))
        .arg(out_path.display().to_string())
        .arg(format!("--width={width}"))
        .arg(format!("--height={height}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("failed to run nextframe frame: {e}"))?;

    if !status.success() {
        return Err(format!(
            "nextframe frame exited with code {}",
            status.code().unwrap_or(-1)
        ));
    }

    // read PNG and encode as base64
    let mut file = std::fs::File::open(&out_path)
        .map_err(|e| format!("failed to open rendered frame: {e}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("failed to read rendered frame: {e}"))?;

    let b64 = base64_encode(&bytes);

    Ok(json!({
        "dataUrl": format!("data:image/png;base64,{b64}"),
        "width": width,
        "height": height,
        "t": t,
    }))
}
