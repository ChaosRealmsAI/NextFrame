//! export lifecycle management
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tokio::runtime::Runtime;
use tokio::task::JoinHandle;

use super::recorder_bridge::{build_recording_url, RecorderRequest};
use super::runner::{create_export_log_path, run_embedded_recorder};
use crate::storage::fs::resolve_write_path;
use crate::util::validation::{
    read_optional_u8_in_range, require_positive_f64, require_positive_u32, require_string_alias,
    require_u32,
};

pub(crate) const EXPORT_RUNNING: &str = "running";
pub(crate) const EXPORT_QUEUED: &str = "queued";
pub(crate) const EXPORT_DONE: &str = "done";
pub(crate) const EXPORT_FAILED: &str = "failed";
pub(crate) const EXPORT_ERROR_CANCELED: &str = "canceled";
pub(crate) const DEFAULT_EXPORT_CRF: u8 = 20;

pub(crate) struct ProcessHandle {
    pub(crate) export_task: Option<ExportTask>,
    pub(crate) output_path: PathBuf,
    pub(crate) log_path: PathBuf,
    pub(crate) duration_secs: f64,
    pub(crate) started_at: Option<Instant>,
    pub(crate) terminal: Option<ProcessTerminal>,
}

pub(crate) struct ExportTask {
    pub(crate) join_handle: JoinHandle<()>,
    pub(crate) completion: Arc<Mutex<Option<Result<(), String>>>>,
    pub(crate) cancel_requested: Arc<AtomicBool>,
}

pub(crate) struct ProcessTerminal {
    pub(crate) state: &'static str,
    pub(crate) error: Option<String>,
}

pub(crate) struct QueuedJob {
    pub(crate) pid: u32,
    pub(crate) request: RecorderRequest,
    pub(crate) log_path: PathBuf,
}

pub(crate) struct ProcessRegistry {
    pub(crate) handles: HashMap<u32, ProcessHandle>,
    queue: VecDeque<QueuedJob>,
    active_pid: Option<u32>,
}

pub(crate) static PROCESS_REGISTRY: OnceLock<Mutex<ProcessRegistry>> = OnceLock::new();
pub(crate) static EXPORT_RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();
pub(crate) static NEXT_EXPORT_PID: AtomicU32 = AtomicU32::new(1);

pub(crate) fn handle_export_start(params: &Value) -> Result<Value, String> {
    let output_path_raw = require_string_alias(params, &["outputPath", "output_path"])?;
    let output_path = resolve_write_path(output_path_raw)?;
    let width = require_positive_u32(params, "width")?;
    let height = require_positive_u32(params, "height")?;
    let fps = require_positive_u32(params, "fps")?;
    let duration = require_positive_f64(params, "duration")?;
    let crf = read_optional_u8_in_range(params, "crf", 0, 51)?.unwrap_or(DEFAULT_EXPORT_CRF);
    let current_dir =
        env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?;

    let request = build_export_request(
        &current_dir,
        &output_path,
        width,
        height,
        fps,
        duration,
        crf,
    )?;

    let Some(parent) = output_path.parent() else {
        return Err(format!( // Fix: included in the error string below
            "failed to resolve export output parent: no parent directory was found for '{}'. Fix: provide an outputPath inside an existing directory or create the parent directory first.",
            output_path.display()
        ));
    };
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "failed to create export directory '{}': {error}",
            parent.display()
        )
    })?;

    let log_path = create_export_log_path()?;
    let pid = next_export_pid();

    let mut registry = lock_process_registry()?;

    let should_start_now = registry.active_pid.is_none()
        || registry
            .active_pid
            .and_then(|active| registry.handles.get_mut(&active))
            .map_or(true, |handle| {
                let _ = refresh_process_state(handle);
                handle.terminal.is_some()
            });

    if should_start_now {
        match spawn_recorder_task(request, log_path.clone()) {
            Ok(task) => {
                registry.active_pid = Some(pid);
                registry.handles.insert(
                    pid,
                    ProcessHandle {
                        export_task: Some(task),
                        output_path,
                        log_path: log_path.clone(),
                        duration_secs: duration,
                        started_at: Some(Instant::now()),
                        terminal: None,
                    },
                );
            }
            Err(error) => {
                return Ok(json!({
                    "ok": false,
                    "error": error,
                    "logPath": log_path.display().to_string(),
                }));
            }
        }
    } else {
        registry.queue.push_back(QueuedJob {
            pid,
            request,
            log_path: log_path.clone(),
        });
        registry.handles.insert(
            pid,
            ProcessHandle {
                export_task: None,
                output_path,
                log_path: log_path.clone(),
                duration_secs: duration,
                started_at: None,
                terminal: None,
            },
        );
    }

    Ok(json!({
        "ok": true,
        "pid": pid,
        "logPath": log_path.display().to_string(),
    }))
}

pub(crate) fn handle_export_status(params: &Value) -> Result<Value, String> {
    let pid = require_u32(params, "pid")?;
    let mut registry = lock_process_registry()?;

    drain_finished_and_start_next(&mut registry)?;

    // Refresh state first (needs &mut)
    if let Some(handle) = registry.handles.get_mut(&pid) {
        refresh_process_state(handle)?;
    } else {
        return Ok(json!({
            "state": EXPORT_FAILED,
            "percent": 0,
            "eta": 0,
            "outputPath": Value::Null,
            "error": "unknown_pid",
        }));
    }

    // Now borrow immutably for json formatting
    let Some(handle) = registry.handles.get(&pid) else {
        return Err(format!( // Fix: included in the error string below
            "failed to read export status: export handle for pid {pid} was missing after refresh. Fix: retry the request or start the export again if the process state was lost."
        ));
    };
    Ok(export_status_json(handle, &registry.queue, pid))
}

pub(crate) fn handle_export_cancel(params: &Value) -> Result<Value, String> {
    let pid = require_u32(params, "pid")?;
    let mut registry = lock_process_registry()?;

    // Remove from queue if queued
    registry.queue.retain(|job| job.pid != pid);

    let Some(handle) = registry.handles.get_mut(&pid) else {
        return Ok(json!({
            "ok": false,
            "error": "unknown_pid",
        }));
    };

    refresh_process_state(handle)?;
    if handle.terminal.is_none() {
        if let Some(task) = &handle.export_task {
            task.cancel_requested.store(true, Ordering::SeqCst);
            task.join_handle.abort();
        }
        handle.terminal = Some(ProcessTerminal {
            state: EXPORT_FAILED,
            error: Some(EXPORT_ERROR_CANCELED.to_string()),
        });
    }

    // If this was the active job, start next
    if registry.active_pid == Some(pid) {
        registry.active_pid = None;
        start_next_queued(&mut registry)?;
    }

    Ok(json!({
        "ok": true,
        "pid": pid,
    }))
}

/// Check if active job finished, start next queued job if so.
fn drain_finished_and_start_next(registry: &mut ProcessRegistry) -> Result<(), String> {
    if let Some(active) = registry.active_pid {
        if let Some(handle) = registry.handles.get_mut(&active) {
            refresh_process_state(handle)?;
            if handle.terminal.is_some() {
                registry.active_pid = None;
                start_next_queued(registry)?;
            }
        } else {
            registry.active_pid = None;
            start_next_queued(registry)?;
        }
    }
    Ok(())
}

fn start_next_queued(registry: &mut ProcessRegistry) -> Result<(), String> {
    while let Some(job) = registry.queue.pop_front() {
        let Some(handle) = registry.handles.get_mut(&job.pid) else {
            continue;
        };

        // Skip if already canceled
        if handle.terminal.is_some() {
            continue;
        }

        match spawn_recorder_task(job.request, job.log_path) {
            Ok(task) => {
                handle.export_task = Some(task);
                handle.started_at = Some(Instant::now());
                registry.active_pid = Some(job.pid);
                return Ok(());
            }
            Err(error) => {
                handle.terminal = Some(ProcessTerminal {
                    state: EXPORT_FAILED,
                    error: Some(error),
                });
            }
        }
    }
    Ok(())
}

fn lock_process_registry() -> Result<std::sync::MutexGuard<'static, ProcessRegistry>, String> {
    process_registry()
        .lock()
        .map_err(|_| {
            "failed to access export process registry: registry lock is unavailable. Fix: retry the request after any concurrent export operation finishes.".to_string()
        })
}

pub(crate) fn process_registry() -> &'static Mutex<ProcessRegistry> {
    PROCESS_REGISTRY.get_or_init(|| {
        Mutex::new(ProcessRegistry {
            handles: HashMap::new(),
            queue: VecDeque::new(),
            active_pid: None,
        })
    })
}

fn refresh_process_state(handle: &mut ProcessHandle) -> Result<(), String> {
    if handle.terminal.is_some() {
        return Ok(());
    }

    let Some(task) = &handle.export_task else {
        return Ok(());
    };

    let completion = task
        .completion
        .lock()
        .map_err(|_| {
            "failed to read export task state: completion lock is unavailable. Fix: retry the export status request after the current export operation settles.".to_string()
        })?
        .take();

    if let Some(result) = completion {
        handle.terminal = Some(match result {
            Ok(()) => ProcessTerminal {
                state: EXPORT_DONE,
                error: None,
            },
            Err(error) => ProcessTerminal {
                state: EXPORT_FAILED,
                error: Some(error),
            },
        });
    }

    Ok(())
}

pub(crate) fn export_status_json(
    handle: &ProcessHandle,
    queue: &VecDeque<QueuedJob>,
    pid: u32,
) -> Value {
    // Queued but not yet started
    if handle.export_task.is_none() && handle.terminal.is_none() {
        let position = queue
            .iter()
            .position(|job| job.pid == pid)
            .map_or(0, |pos| pos + 1);
        return json!({
            "state": EXPORT_QUEUED,
            "percent": 0,
            "eta": 0,
            "position": position,
            "outputPath": handle.output_path.display().to_string(),
            "logPath": handle.log_path.display().to_string(),
            "error": Value::Null,
        });
    }

    let elapsed = handle
        .started_at
        .map_or(0.0, |start| start.elapsed().as_secs_f64());
    let (state, percent, eta, error) = match &handle.terminal {
        Some(terminal) => (
            terminal.state,
            if terminal.state == EXPORT_DONE {
                100.0
            } else {
                percent_complete(elapsed, handle.duration_secs)
            },
            0.0,
            terminal.error.clone(),
        ),
        None => (
            EXPORT_RUNNING,
            percent_complete(elapsed, handle.duration_secs).min(99.0),
            remaining_secs(elapsed, handle.duration_secs),
            None,
        ),
    };

    json!({
        "state": state,
        "percent": percent,
        "eta": eta,
        "outputPath": handle.output_path.display().to_string(),
        "logPath": handle.log_path.display().to_string(),
        "error": error,
    })
}

pub(crate) fn percent_complete(elapsed: f64, duration_secs: f64) -> f64 {
    if duration_secs.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return 0.0;
    }

    ((elapsed / duration_secs) * 100.0).clamp(0.0, 100.0)
}

pub(crate) fn remaining_secs(elapsed: f64, duration_secs: f64) -> f64 {
    if duration_secs.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return 0.0;
    }

    (duration_secs - elapsed).max(0.0)
}

pub(crate) fn build_export_request(
    current_dir: &Path,
    output_path: &Path,
    width: u32,
    height: u32,
    fps: u32,
    duration: f64,
    crf: u8,
) -> Result<RecorderRequest, String> {
    Ok(RecorderRequest {
        url: build_recording_url(current_dir)?,
        output_path: output_path.to_path_buf(),
        width,
        height,
        fps,
        duration,
        crf,
    })
}

pub(crate) fn spawn_recorder_task(
    request: RecorderRequest,
    log_path: PathBuf,
) -> Result<ExportTask, String> {
    let completion = Arc::new(Mutex::new(None));
    let completion_for_task = Arc::clone(&completion);
    let cancel_requested = Arc::new(AtomicBool::new(false));
    let cancel_requested_for_task = Arc::clone(&cancel_requested);
    let runtime = export_runtime()?;

    let join_handle = runtime.spawn_blocking(move || {
        let result = std::panic::catch_unwind(|| {
            run_embedded_recorder(request, &log_path, cancel_requested_for_task)
        })
        .map_err(|_| "embedded recorder task panicked".to_string())
        .and_then(|result| result);

        if let Ok(mut slot) = completion_for_task.lock() {
            *slot = Some(result);
        }
    });

    Ok(ExportTask {
        join_handle,
        completion,
        cancel_requested,
    })
}

pub(crate) fn export_runtime() -> Result<&'static Runtime, String> {
    match EXPORT_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .thread_name("bridge-export")
            .enable_all()
            .build()
            .map_err(|error| format!("failed to initialize export runtime: {error}"))
    }) {
        Ok(runtime) => Ok(runtime),
        Err(error) => Err(error.clone()),
    }
}

pub(crate) fn next_export_pid() -> u32 {
    NEXT_EXPORT_PID.fetch_add(1, Ordering::Relaxed)
}

pub(crate) fn handle_export_log(params: &Value) -> Result<Value, String> {
    let path_str = crate::util::validation::require_string(params, "path")?;
    let path = crate::storage::fs::resolve_existing_path(path_str)?;
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("failed to read '{}': {e}", path.display()))?;

    let entries: Vec<Value> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    Ok(json!({ "entries": entries, "count": entries.len() }))
}
