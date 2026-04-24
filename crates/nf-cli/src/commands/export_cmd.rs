use std::fs;
use std::path::{Path, PathBuf};

use nf_project::{JsonStorage, Storage, compile_episode_source};
use nf_recorder::{ExportOpts, ExportResolution};
use serde_json::json;

use crate::commands::{ExportArgs, print_json};
use crate::errors::NfError;

pub fn run(args: ExportArgs) -> Result<(), NfError> {
    let storage = JsonStorage::new(JsonStorage::default_root()?);
    ensure_project_exists(&storage, &args.project)?;
    ensure_episode_exists(&storage, &args.project, &args.episode)?;
    let episode = storage.load_episode(&args.project, &args.episode)?;
    let compiled = compile_episode_source(&args.project, &episode)?;
    let source_path = source_path_for_output(&args.out);
    write_json_file(&source_path, &compiled.source)?;

    if let Some(parent) = args.out.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    }

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    let _quiet = RecorderEventQuietGuard::new();
    let stats = runtime
        .block_on(nf_recorder::run_export_from_source(
            &source_path,
            &args.out,
            ExportOpts {
                duration_s: episode.duration,
                resolution_override: Some(ExportResolution::P1080),
                parallel: Some(1),
                ..Default::default()
            },
        ))
        .map_err(record_error)?;

    print_json(&json!({
        "out": args.out.display().to_string(),
        "source": source_path.display().to_string(),
        "bytes": stats.size_bytes,
        "frames": stats.frames,
        "duration_ms": stats.duration_ms,
        "warnings": compiled.warnings
    }))
}

struct RecorderEventQuietGuard;

impl RecorderEventQuietGuard {
    fn new() -> Self {
        nf_recorder::events::set_quiet(true);
        Self
    }
}

impl Drop for RecorderEventQuietGuard {
    fn drop(&mut self) {
        nf_recorder::events::set_quiet(false);
    }
}

fn source_path_for_output(out: &Path) -> PathBuf {
    let mut raw = out.as_os_str().to_os_string();
    raw.push(".source.json");
    PathBuf::from(raw)
}

fn write_json_file(path: &Path, value: &serde_json::Value) -> Result<(), NfError> {
    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    }
    let bytes = serde_json::to_vec_pretty(value)?;
    fs::write(path, bytes).map_err(|err| NfError::StorageFailed(err.to_string()))
}

fn ensure_project_exists(storage: &JsonStorage, project: &str) -> Result<(), NfError> {
    let path = storage.root().join(project).join("project.json");
    if path.exists() {
        return Ok(());
    }
    Err(NfError::UnknownProject {
        slug: project.to_string(),
        hint: "nf projects list".to_string(),
    })
}

fn ensure_episode_exists(storage: &JsonStorage, project: &str, episode: &str) -> Result<(), NfError> {
    let path = storage
        .root()
        .join(project)
        .join("episodes")
        .join(format!("{episode}.json"));
    if path.exists() {
        return Ok(());
    }
    Err(NfError::UnknownEpisode {
        slug: episode.to_string(),
        hint: format!("nf episodes list --project={project}"),
    })
}

fn record_error(err: nf_recorder::record_loop::RecordError) -> NfError {
    NfError::Remote {
        error: err.code_str().to_string(),
        detail: err.to_string(),
        hint: "check the generated .source.json and recorder runtime output".to_string(),
        exit_code: err.exit_code(),
    }
}
