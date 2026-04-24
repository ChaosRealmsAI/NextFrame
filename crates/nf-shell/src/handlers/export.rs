use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

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
    result: Option<Value>,
    error: Option<String>,
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
        let episode = required_str(params, "episode")?;
        validate_slug(&project)?;
        validate_slug(&episode)?;
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
                    result: None,
                    error: None,
                },
            );
        }

        let jobs = Arc::clone(&self.jobs);
        let job_id_for_thread = job_id.clone();
        let project_for_thread = project.clone();
        let episode_for_thread = episode.clone();
        let out_for_thread = out.clone();
        std::thread::spawn(move || {
            let output = Command::new(nf_bin)
                .arg("export")
                .arg("--project")
                .arg(project_for_thread)
                .arg("--episode")
                .arg(episode_for_thread)
                .arg("--out")
                .arg(&out_for_thread)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output();
            let update = match output {
                Ok(output) if output.status.success() => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    match serde_json::from_str::<Value>(stdout.trim()) {
                        Ok(value) => (ExportStatus::Succeeded, Some(value), None),
                        Err(err) => (
                            ExportStatus::Failed,
                            None,
                            Some(format!("export succeeded but returned invalid JSON: {err}")),
                        ),
                    }
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let detail = if !stderr.trim().is_empty() {
                        stderr.trim().to_string()
                    } else if !stdout.trim().is_empty() {
                        stdout.trim().to_string()
                    } else {
                        format!("nf export exited with status {}", output.status)
                    };
                    (ExportStatus::Failed, None, Some(detail))
                }
                Err(err) => (
                    ExportStatus::Failed,
                    None,
                    Some(format!("spawn nf export failed: {err}")),
                ),
            };
            if let Ok(mut jobs) = jobs.lock() {
                if let Some(job) = jobs.get_mut(&job_id_for_thread) {
                    job.status = update.0;
                    job.result = update.1;
                    job.error = update.2;
                }
            }
        });

        Ok(json!({
            "job_id": job_id,
            "status": ExportStatus::Running.as_str(),
            "out": out.display().to_string()
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
            "result": job.result,
            "error": job.error
        }))
    }
}

impl OpHandler for ExportOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "export-start" | "export.start" => self.start(&req.params)?,
            "export-status" | "export.status" => self.status(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
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
