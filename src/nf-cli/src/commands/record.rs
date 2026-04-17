//! `nf record <bundle> -o <out>` — delegates to the nf-recorder trait.

use std::path::Path;

use nf_recorder::{RecordSpec, Recorder, StubRecorder};

pub fn run(bundle: &Path, output: &Path) -> anyhow::Result<serde_json::Value> {
    let spec = RecordSpec {
        bundle_html: bundle.to_path_buf(),
        output_mp4: output.to_path_buf(),
        ..RecordSpec::default()
    };
    let mut rec = StubRecorder::new();
    let (status, error) = match rec.record(spec.clone()) {
        Ok(handle) => (format!("started:{}", handle.id), None),
        Err(e) => ("pending".to_string(), Some(e.to_string())),
    };
    Ok(serde_json::json!({
        "ok": true,
        "command": "record",
        "bundle": spec.bundle_html.display().to_string(),
        "output": spec.output_mp4.display().to_string(),
        "status": status,
        "error": error,
    }))
}
