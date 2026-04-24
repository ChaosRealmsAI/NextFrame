use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde_json::{Value, json};

use crate::errors::NfError;
use crate::handlers::{now_iso, required_str};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, validate_slug};

#[derive(Debug, Clone)]
pub struct ExportOpHandler {
    storage: JsonStorage,
    jobs: Arc<Mutex<BTreeMap<String, ExportJob>>>,
}

#[derive(Debug, Clone)]
struct ExportJob {
    status: ExportStatus,
    out: PathBuf,
    profile: String,
    progress: ExportProgress,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct ExportProgress {
    stage: String,
    percent: f64,
    frames_encoded: u64,
    total_frames: u64,
    eta_seconds: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExportStatus {
    Running,
    Succeeded,
    Failed,
}

impl ExportStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
        }
    }
}

impl ExportOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self {
            storage,
            jobs: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    fn start(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let composition = params
            .get("composition")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        let episode = params
            .get("episode")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .or_else(|| composition.clone())
            .ok_or_else(|| {
                NfError::ValidationFailed("missing episode or composition".to_string())
            })?;
        validate_slug(&project)?;
        validate_slug(&episode)?;
        let profile = optional_export_str(params, "profile", "final");
        let fps = params.get("fps").and_then(Value::as_u64);
        let resolution = params
            .get("resolution")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        let parallel = params.get("parallel").and_then(Value::as_u64);
        let job_id = export_job_id(&project, &episode);
        let out = export_output_path(&self.storage, &project, &episode, &job_id);
        let nf_bin = nf_cli_binary();

        {
            let mut jobs = self
                .jobs
                .lock()
                .map_err(|err| NfError::SocketFailed(format!("export jobs lock failed: {err}")))?;
            jobs.insert(
                job_id.clone(),
                ExportJob {
                    status: ExportStatus::Running,
                    out: out.clone(),
                    profile: profile.clone(),
                    progress: ExportProgress::new("queued"),
                    result: None,
                    error: None,
                },
            );
        }

        let jobs = Arc::clone(&self.jobs);
        let job_id_for_thread = job_id.clone();
        let project_for_thread = project.clone();
        let episode_for_thread = episode.clone();
        let composition_for_thread = composition.clone();
        let out_for_thread = out.clone();
        let profile_for_thread = profile.clone();
        std::thread::spawn(move || {
            let mut command = Command::new(nf_bin);
            command
                .arg("export")
                .arg("--project")
                .arg(project_for_thread);
            if let Some(composition) = composition_for_thread {
                command.arg("--composition").arg(composition);
            } else {
                command.arg("--episode").arg(episode_for_thread);
            }
            command
                .arg("--profile")
                .arg(&profile_for_thread)
                .arg("--events");
            if let Some(fps) = fps {
                command.arg("--fps").arg(fps.to_string());
            }
            if let Some(resolution) = resolution {
                command.arg("--resolution").arg(resolution);
            }
            if let Some(parallel) = parallel {
                command.arg("--parallel").arg(parallel.to_string());
            }
            command.arg("--out").arg(&out_for_thread);

            let mut child = match command
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(child) => child,
                Err(err) => {
                    finish_export_job(
                        &jobs,
                        &job_id_for_thread,
                        ExportStatus::Failed,
                        None,
                        Some(format!("spawn nf export failed: {err}")),
                    );
                    return;
                }
            };

            let stderr = child.stderr.take();
            let stderr_handle = stderr.map(|mut stderr| {
                std::thread::spawn(move || {
                    let mut buf = String::new();
                    let _ = stderr.read_to_string(&mut buf);
                    buf
                })
            });

            let started = Instant::now();
            let mut last_summary: Option<Value> = None;
            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    if let Ok(value) = serde_json::from_str::<Value>(&line) {
                        apply_export_event(&jobs, &job_id_for_thread, &value, started);
                        if value.get("out").is_some() && value.get("source").is_some() {
                            last_summary = Some(value);
                        }
                    }
                }
            }

            let status = child.wait();
            let stderr_text = stderr_handle
                .and_then(|handle| handle.join().ok())
                .unwrap_or_default();
            match status {
                Ok(status) if status.success() => {
                    finish_export_job(
                        &jobs,
                        &job_id_for_thread,
                        ExportStatus::Succeeded,
                        last_summary,
                        None,
                    );
                }
                Ok(status) => {
                    let detail = if !stderr_text.trim().is_empty() {
                        stderr_text.trim().to_string()
                    } else {
                        format!("nf export exited with status {status}")
                    };
                    finish_export_job(
                        &jobs,
                        &job_id_for_thread,
                        ExportStatus::Failed,
                        last_summary,
                        Some(detail),
                    );
                }
                Err(err) => {
                    finish_export_job(
                        &jobs,
                        &job_id_for_thread,
                        ExportStatus::Failed,
                        last_summary,
                        Some(format!("wait nf export failed: {err}")),
                    );
                }
            }
        });

        Ok(json!({
            "job_id": job_id,
            "status": ExportStatus::Running.as_str(),
            "out": out.display().to_string(),
            "profile": profile,
            "progress": ExportProgress::new("queued").to_json()
        }))
    }

    fn status(&self, params: &Value) -> Result<Value, NfError> {
        let job_id = required_str(params, "job_id")?;
        let jobs = self
            .jobs
            .lock()
            .map_err(|err| NfError::SocketFailed(format!("export jobs lock failed: {err}")))?;
        let job = jobs
            .get(&job_id)
            .ok_or_else(|| NfError::ValidationFailed(format!("unknown export job: {job_id}")))?;
        Ok(json!({
            "job_id": job_id,
            "status": job.status.as_str(),
            "out": job.out.display().to_string(),
            "profile": job.profile,
            "progress": job.progress.to_json(),
            "result": job.result,
            "error": job.error
        }))
    }

    fn open(&self, params: &Value) -> Result<Value, NfError> {
        let path = required_str(params, "path")?;
        let path = PathBuf::from(path);
        validate_export_path(&self.storage, &path)?;
        if !path.exists() {
            return Err(NfError::ValidationFailed(format!(
                "export file does not exist: {}",
                path.display()
            )));
        }

        Command::new("open")
            .arg(&path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| NfError::SocketFailed(format!("open export failed: {err}")))?;

        Ok(json!({
            "opened": true,
            "path": path.display().to_string()
        }))
    }
}

impl ExportProgress {
    fn new(stage: &str) -> Self {
        Self {
            stage: stage.to_string(),
            percent: 0.0,
            frames_encoded: 0,
            total_frames: 0,
            eta_seconds: None,
        }
    }

    fn to_json(&self) -> Value {
        json!({
            "stage": self.stage,
            "percent": self.percent,
            "frames_encoded": self.frames_encoded,
            "total_frames": self.total_frames,
            "eta_seconds": self.eta_seconds
        })
    }
}

fn optional_export_str(params: &Value, key: &str, default: &str) -> String {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(default)
        .to_string()
}

fn finish_export_job(
    jobs: &Arc<Mutex<BTreeMap<String, ExportJob>>>,
    job_id: &str,
    status: ExportStatus,
    result: Option<Value>,
    error: Option<String>,
) {
    if let Ok(mut jobs) = jobs.lock() {
        if let Some(job) = jobs.get_mut(job_id) {
            job.status = status;
            if let Some(result) = result {
                job.result = Some(result);
            }
            job.error = error;
            job.progress.stage = match status {
                ExportStatus::Running => job.progress.stage.clone(),
                ExportStatus::Succeeded => "done".to_string(),
                ExportStatus::Failed => "failed".to_string(),
            };
            if status == ExportStatus::Succeeded {
                job.progress.percent = 100.0;
                if job.progress.total_frames > 0 {
                    job.progress.frames_encoded = job.progress.total_frames;
                }
                job.progress.eta_seconds = Some(0.0);
            }
        }
    }
}

fn apply_export_event(
    jobs: &Arc<Mutex<BTreeMap<String, ExportJob>>>,
    job_id: &str,
    value: &Value,
    started: Instant,
) {
    let event = value.get("event").and_then(Value::as_str).unwrap_or("");
    if event.is_empty() {
        return;
    }
    if let Ok(mut jobs) = jobs.lock() {
        let Some(job) = jobs.get_mut(job_id) else {
            return;
        };
        match event {
            "record.start" => {
                job.progress.stage = "render".to_string();
            }
            "record.encode_progress" => {
                let frames = value
                    .get("frames_encoded")
                    .and_then(Value::as_u64)
                    .unwrap_or(job.progress.frames_encoded);
                let total = value
                    .get("total_frames")
                    .and_then(Value::as_u64)
                    .unwrap_or(job.progress.total_frames);
                let percent = value
                    .get("percent")
                    .and_then(Value::as_f64)
                    .unwrap_or_else(|| percent(frames, total));
                job.progress.stage = "render".to_string();
                job.progress.frames_encoded = frames;
                job.progress.total_frames = total;
                job.progress.percent = percent;
                job.progress.eta_seconds = estimate_eta(started, frames, total);
            }
            "record.parallel.start" => {
                job.progress.stage = format!(
                    "parallel x{}",
                    value.get("parallel").and_then(Value::as_u64).unwrap_or(0)
                );
                job.progress.total_frames = value
                    .get("total_frames")
                    .and_then(Value::as_u64)
                    .unwrap_or(job.progress.total_frames);
            }
            "record.segment.start" => {
                let idx = value.get("idx").and_then(Value::as_u64).unwrap_or(0);
                job.progress.stage = format!("segment {idx}");
            }
            "record.segment.done" => {
                let end = value
                    .get("end")
                    .and_then(Value::as_u64)
                    .unwrap_or(job.progress.frames_encoded);
                job.progress.stage = "parallel segment done".to_string();
                job.progress.frames_encoded = job.progress.frames_encoded.max(end);
                job.progress.percent =
                    percent(job.progress.frames_encoded, job.progress.total_frames);
                job.progress.eta_seconds = estimate_eta(
                    started,
                    job.progress.frames_encoded,
                    job.progress.total_frames,
                );
            }
            "record.concat.start" => {
                job.progress.stage = "concat".to_string();
                job.progress.percent = job.progress.percent.max(95.0);
            }
            "record.done" => {
                job.progress.stage = "mux".to_string();
                job.progress.percent = 100.0;
                job.progress.eta_seconds = Some(0.0);
            }
            _ => {}
        }
    }
}

fn percent(frames: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        ((frames as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
    }
}

fn estimate_eta(started: Instant, frames: u64, total: u64) -> Option<f64> {
    if frames == 0 || total == 0 || frames >= total {
        return None;
    }
    let elapsed = started.elapsed().as_secs_f64();
    let per_frame = elapsed / frames as f64;
    Some(((total - frames) as f64 * per_frame).max(0.0))
}

impl OpHandler for ExportOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "export-start" | "export.start" => self.start(&req.params)?,
            "export-status" | "export.status" => self.status(&req.params)?,
            "export-open" | "export.open" => self.open(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

fn validate_export_path(storage: &JsonStorage, path: &Path) -> Result<(), NfError> {
    let canonical_root = storage.root().canonicalize().map_err(|err| {
        NfError::StorageFailed(format!(
            "storage root is unavailable: {} · {err}",
            storage.root().display()
        ))
    })?;
    let canonical_path = path
        .canonicalize()
        .map_err(|err| NfError::ValidationFailed(format!("invalid export path: {err}")))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(NfError::ValidationFailed(
            "export path must be inside the NextFrame storage root".to_string(),
        ));
    }
    if canonical_path.extension().and_then(|value| value.to_str()) != Some("mp4") {
        return Err(NfError::ValidationFailed(
            "export path must point to an mp4 file".to_string(),
        ));
    }
    Ok(())
}

fn export_job_id(project: &str, episode: &str) -> String {
    format!("{project}-{episode}-{}", safe_timestamp(&now_iso()))
}

fn export_output_path(
    storage: &JsonStorage,
    project: &str,
    episode: &str,
    job_id: &str,
) -> PathBuf {
    storage
        .root()
        .join(project)
        .join("exports")
        .join(format!("{episode}-{job_id}.mp4"))
}

fn safe_timestamp(raw: &str) -> String {
    raw.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn nf_cli_binary() -> PathBuf {
    if let Some(path) = std::env::var_os("NF_CLI_BIN") {
        return PathBuf::from(path);
    }
    if let Ok(current) = std::env::current_exe() {
        if let Some(parent) = current.parent() {
            let candidate = parent.join("nf");
            if candidate.exists() {
                return candidate;
            }
        }
    }
    PathBuf::from("nf")
}
