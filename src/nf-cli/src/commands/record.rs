//! `nf record <bundle> -o <out>` — delegates to the nf-recorder trait.

use std::path::Path;

use nf_recorder::{PipelineRecorder, RecordSpec, Recorder};

pub fn run(bundle: &Path, output: &Path) -> anyhow::Result<serde_json::Value> {
    let spec = RecordSpec {
        bundle_path: bundle.to_path_buf(),
        out_path: output.to_path_buf(),
        ..RecordSpec::default()
    };
    let mut rec = PipelineRecorder::new();
    let (status, error) = match rec.record(spec.clone()) {
        Ok(handle) => (
            format!(
                "completed:{}:{}",
                handle.out_path.display(),
                handle.total_frames
            ),
            None,
        ),
        Err(e) => ("pending".to_string(), Some(e.to_string())),
    };
    Ok(serde_json::json!({
        "ok": true,
        "command": "record",
        "bundle": spec.bundle_path.display().to_string(),
        "output": spec.out_path.display().to_string(),
        "status": status,
        "error": error,
    }))
}
