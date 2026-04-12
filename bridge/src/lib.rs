#![deny(unused)]

#[cfg(not(test))]
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(test)]
use std::collections::VecDeque;
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const EXPORT_RUNNING: &str = "running";
const EXPORT_DONE: &str = "done";
const EXPORT_FAILED: &str = "failed";
const EXPORT_ERROR_NOT_FOUND: &str = "recorder_not_found";
const EXPORT_ERROR_ALREADY_RUNNING: &str = "export_already_running";
const EXPORT_ERROR_CANCELED: &str = "canceled";
const RECENT_DIR_NAME: &str = ".nextframe";
const RECENT_FILE_NAME: &str = "recent.json";
const RECENT_MAX_ENTRIES: usize = 10;
const AUTOSAVE_DIR_NAME: &str = "autosave";

struct ProcessHandle {
    child: Child,
    output_path: PathBuf,
    log_path: PathBuf,
    duration_secs: f64,
    started_at: Instant,
    terminal: Option<ProcessTerminal>,
}

struct ProcessTerminal {
    state: &'static str,
    error: Option<String>,
}

struct ProcessRegistry {
    export_start_reserved: bool,
    handles: HashMap<u32, ProcessHandle>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum RecorderLauncher {
    Binary(PathBuf),
    Cargo(PathBuf),
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RecorderLaunchPlan {
    launcher: RecorderLauncher,
    recorder_args: Vec<String>,
}

static PROCESS_REGISTRY: OnceLock<Mutex<ProcessRegistry>> = OnceLock::new();
static FFMPEG_PATH_CACHE: OnceLock<Mutex<Option<Option<PathBuf>>>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq)]
struct AudioSource {
    path: PathBuf,
    start_time: f64,
    volume: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct FfmpegCommand {
    program: PathBuf,
    args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CommandOutput {
    success: bool,
    stderr: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RecentProjectRecord {
    path: String,
    last_opened: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RecentProjectItem {
    path: String,
    name: String,
    last_opened: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AutosaveListItem {
    project_id: String,
    path: String,
    modified: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Request {
    pub id: String,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Response {
    pub id: String,
    pub ok: bool,
    pub result: Value,
    pub error: Option<String>,
}

pub fn initialize() -> Result<(), String> {
    let _ = process_registry();
    let _ = ffmpeg_command_path()?;
    Ok(())
}

pub fn dispatch(req: Request) -> Response {
    let Request { id, method, params } = req;

    match dispatch_inner(&method, params) {
        Ok(result) => Response {
            id,
            ok: true,
            result,
            error: None,
        },
        Err(error) => Response {
            id,
            ok: false,
            result: Value::Null,
            error: Some(error),
        },
    }
}

fn dispatch_inner(method: &str, params: Value) -> Result<Value, String> {
    match method {
        "autosave.write" => handle_autosave_write(&params),
        "autosave.list" => handle_autosave_list(&params),
        "autosave.clear" => handle_autosave_clear(&params),
        "autosave.recover" => handle_autosave_recover(&params),
        "fs.read" => handle_fs_read(&params),
        "fs.write" => handle_fs_write(&params),
        "fs.listDir" => handle_fs_list_dir(&params),
        "fs.dialogOpen" => handle_fs_dialog_open(&params),
        "fs.dialogSave" => handle_fs_dialog_save(&params),
        "fs.reveal" => handle_fs_reveal(&params),
        "export.start" => handle_export_start(&params),
        "export.status" => handle_export_status(&params),
        "export.cancel" => handle_export_cancel(&params),
        "export.muxAudio" => handle_export_mux_audio(&params),
        "log" => handle_log(&params),
        "recent.list" => handle_recent_list(&params),
        "recent.add" => handle_recent_add(&params),
        "recent.clear" => handle_recent_clear(&params),
        "scene.list" => handle_scene_list(&params),
        "timeline.load" => handle_timeline_load(&params),
        "timeline.save" => handle_timeline_save(&params),
        "project.list" => handle_project_list(&params),
        "project.create" => handle_project_create(&params),
        "episode.list" => handle_episode_list(&params),
        "episode.create" => handle_episode_create(&params),
        "segment.list" => handle_segment_list(&params),
        "preview.frame" => handle_preview_frame(&params),
        "fs.mtime" => handle_fs_mtime(&params),
        _ => Err(format!("unknown method: {method}")),
    }
}

fn handle_fs_read(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "contents": contents,
    }))
}

fn handle_fs_write(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let contents = require_string(params, "contents")?;
    let path_buf = resolve_write_path(path)?;

    fs::write(&path_buf, contents)
        .map_err(|error| format!("failed to write '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "bytesWritten": contents.len(),
    }))
}

fn handle_fs_list_dir(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let mut entries = fs::read_dir(&path_buf)
        .map_err(|error| format!("failed to list '{}': {error}", path_buf.display()))?
        .map(|entry_result| {
            let entry =
                entry_result.map_err(|error| format!("failed to inspect dir entry: {error}"))?;
            let entry_path = entry.path();
            let metadata = entry.metadata().map_err(|error| {
                format!(
                    "failed to read metadata for '{}': {error}",
                    entry_path.display()
                )
            })?;

            Ok(json!({
                "name": entry.file_name().to_string_lossy().to_string(),
                "path": entry_path.display().to_string(),
                "isDir": metadata.is_dir(),
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|left, right| {
        let left_name = left.get("name").and_then(Value::as_str).unwrap_or_default();
        let right_name = right
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_name.cmp(right_name)
    });

    Ok(json!({
        "path": path,
        "entries": entries,
    }))
}

fn handle_fs_dialog_open(params: &Value) -> Result<Value, String> {
    let filters = parse_dialog_filters(params)?;
    let selected = show_open_dialog(&filters);

    Ok(json!({
        "path": selected.as_ref().map(|path| path.display().to_string()),
        "canceled": selected.is_none(),
    }))
}

fn handle_fs_dialog_save(params: &Value) -> Result<Value, String> {
    let default_name = require_string_alias(params, &["defaultName", "default_name"])?;
    let selected =
        show_save_dialog(default_name).map(|path| with_default_extension(path, default_name));

    Ok(json!({
        "path": selected.as_ref().map(|path| path.display().to_string()),
        "canceled": selected.is_none(),
    }))
}

fn handle_fs_reveal(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_reveal_path(path)?;
    reveal_in_file_manager(&path_buf)
        .map_err(|error| format!("failed to reveal '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path_buf.display().to_string(),
        "revealed": true,
    }))
}

fn handle_export_start(params: &Value) -> Result<Value, String> {
    let output_path_raw = require_string_alias(params, &["outputPath", "output_path"])?;
    let output_path = resolve_write_path(output_path_raw)?;
    let width = require_positive_u32(params, "width")?;
    let height = require_positive_u32(params, "height")?;
    let fps = require_positive_u32(params, "fps")?;
    let duration = require_positive_f64(params, "duration")?;
    let current_dir =
        env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?;

    {
        let mut registry = lock_process_registry()?;
        if !reserve_export_start(&mut registry)? {
            return Ok(json!({
                "ok": false,
                "error": EXPORT_ERROR_ALREADY_RUNNING,
            }));
        }
    }

    let start_result = (|| -> Result<Value, String> {
        let Some(plan) =
            build_export_plan(&current_dir, &output_path, width, height, fps, duration)?
        else {
            return Ok(json!({
                "ok": false,
                "error": EXPORT_ERROR_NOT_FOUND,
            }));
        };

        let Some(parent) = output_path.parent() else {
            return Err(format!(
                "failed to resolve parent for '{}'",
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
        let child = match spawn_recorder(&plan, &log_path) {
            Ok(child) => child,
            Err(error) => {
                return Ok(json!({
                    "ok": false,
                    "error": error,
                    "logPath": log_path.display().to_string(),
                }));
            }
        };
        let pid = child.id();

        let mut handle = ProcessHandle {
            child,
            output_path,
            log_path: log_path.clone(),
            duration_secs: duration,
            started_at: Instant::now(),
            terminal: None,
        };

        match lock_process_registry() {
            Ok(mut registry) => {
                registry.export_start_reserved = false;
                registry.handles.insert(pid, handle);
            }
            Err(error) => {
                let _ = handle.child.kill();
                let _ = handle.child.wait();
                return Err(error);
            }
        }

        Ok(json!({
            "ok": true,
            "pid": pid,
            "logPath": log_path.display().to_string(),
        }))
    })();

    let started = start_result
        .as_ref()
        .ok()
        .and_then(|result| result.get("ok"))
        .and_then(Value::as_bool)
        == Some(true);

    if !started {
        clear_export_start_reservation()?;
    }

    start_result
}

fn handle_export_status(params: &Value) -> Result<Value, String> {
    let pid = require_u32(params, "pid")?;
    let mut registry = lock_process_registry()?;
    let Some(handle) = registry.handles.get_mut(&pid) else {
        return Ok(json!({
            "state": EXPORT_FAILED,
            "percent": 0,
            "eta": 0,
            "outputPath": Value::Null,
            "error": "unknown_pid",
        }));
    };

    refresh_process_state(handle)?;
    Ok(export_status_json(handle))
}

fn handle_export_cancel(params: &Value) -> Result<Value, String> {
    let pid = require_u32(params, "pid")?;
    let mut registry = lock_process_registry()?;
    let Some(handle) = registry.handles.get_mut(&pid) else {
        return Ok(json!({
            "ok": false,
            "error": "unknown_pid",
        }));
    };

    refresh_process_state(handle)?;
    if handle.terminal.is_none() {
        handle
            .child
            .kill()
            .map_err(|error| format!("failed to cancel export pid {pid}: {error}"))?;
        let _ = handle.child.wait();
        handle.terminal = Some(ProcessTerminal {
            state: EXPORT_FAILED,
            error: Some(EXPORT_ERROR_CANCELED.to_string()),
        });
    }

    Ok(json!({
        "ok": true,
        "pid": pid,
    }))
}

fn handle_export_mux_audio(params: &Value) -> Result<Value, String> {
    let video_path_raw = require_string_alias(params, &["videoPath", "video_path"])?;
    let output_path_raw = require_string_alias(params, &["outputPath", "output_path"])?;
    let video_path = resolve_existing_path(video_path_raw)?;
    let output_path = resolve_write_path(output_path_raw)?;
    let audio_sources = parse_audio_sources(params)?;

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create export directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    if audio_sources.is_empty() {
        copy_video_output(&video_path, &output_path)?;
        cleanup_intermediate_video(&video_path, &output_path);
        return Ok(json!({
            "ok": true,
            "outputPath": output_path.display().to_string(),
        }));
    }

    let Some(ffmpeg_path) = ffmpeg_command_path()? else {
        return Ok(json!({
            "ok": false,
            "error": "Install ffmpeg to export with audio. `brew install ffmpeg`",
        }));
    };

    let command = build_ffmpeg_command(ffmpeg_path, &video_path, &audio_sources, &output_path);
    let output = run_ffmpeg_command(&command).map_err(|error| {
        format!(
            "failed to run ffmpeg for '{}': {error}",
            output_path.display()
        )
    })?;

    if !output.success {
        let error = if output.stderr.is_empty() {
            "ffmpeg exited with an unknown error".to_string()
        } else {
            output.stderr
        };
        return Ok(json!({
            "ok": false,
            "error": error,
        }));
    }

    cleanup_intermediate_video(&video_path, &output_path);

    Ok(json!({
        "ok": true,
        "outputPath": output_path.display().to_string(),
    }))
}

fn handle_log(params: &Value) -> Result<Value, String> {
    let level = require_string(params, "level")?;
    let message = require_string(params, "msg")?;

    match level {
        "error" => eprintln!("[webview][error] {message}"),
        _ => println!("[webview][{level}] {message}"),
    }

    Ok(json!({
        "logged": true,
        "level": level,
    }))
}

fn handle_recent_list(params: &Value) -> Result<Value, String> {
    let _ = require_object(params)?;
    let storage_path = ensure_recent_storage_file()?;
    let records = normalize_recent_records(read_recent_records(&storage_path)?);

    save_recent_records(&storage_path, &records)?;

    serde_json::to_value(
        records
            .into_iter()
            .map(|record| RecentProjectItem {
                name: recent_project_name(&record.path),
                path: record.path,
                last_opened: record.last_opened,
            })
            .collect::<Vec<_>>(),
    )
    .map_err(|error| format!("failed to serialize recent projects: {error}"))
}

fn handle_recent_add(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_home_existing_path(path)?;
    ensure_recent_project_extension(&path_buf, path)?;

    let storage_path = ensure_recent_storage_file()?;
    let mut records = normalize_recent_records(read_recent_records(&storage_path)?);
    let canonical_path = path_buf.display().to_string();

    records.retain(|record| record.path != canonical_path);
    records.insert(
        0,
        RecentProjectRecord {
            path: canonical_path,
            last_opened: unix_timestamp_secs()?,
        },
    );
    records.truncate(RECENT_MAX_ENTRIES);

    save_recent_records(&storage_path, &records)?;

    Ok(json!({
        "count": records.len(),
    }))
}

fn handle_recent_clear(params: &Value) -> Result<Value, String> {
    let _ = require_object(params)?;
    let storage_path = ensure_recent_storage_file()?;
    save_recent_records(&storage_path, &[])?;

    Ok(json!({
        "cleared": true,
    }))
}

fn handle_scene_list(params: &Value) -> Result<Value, String> {
    require_object(params)?;

    Ok(json!([
        {
            "id": "auroraGradient",
            "name": "Aurora Gradient",
            "category": "Backgrounds"
        },
        {
            "id": "kineticHeadline",
            "name": "Kinetic Headline",
            "category": "Typography"
        },
        {
            "id": "neonGrid",
            "name": "Neon Grid",
            "category": "Shapes & Layout"
        },
        {
            "id": "starfield",
            "name": "Starfield",
            "category": "Backgrounds"
        },
        {
            "id": "circleRipple",
            "name": "Circle Ripple",
            "category": "Shapes & Layout"
        },
        {
            "id": "countdown",
            "name": "Countdown",
            "category": "Typography"
        },
        {
            "id": "barChartReveal",
            "name": "Bar Chart Reveal",
            "category": "Data Viz"
        },
        {
            "id": "lineChart",
            "name": "Line Chart",
            "category": "Data Viz"
        },
        {
            "id": "lowerThirdVelvet",
            "name": "Lower Third Velvet",
            "category": "Overlays"
        },
        {
            "id": "cornerBadge",
            "name": "Corner Badge",
            "category": "Overlays"
        }
    ]))
}

fn handle_timeline_load(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read timeline '{}': {error}", path_buf.display()))?;

    serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse timeline '{}': {error}", path_buf.display()))
}

fn handle_timeline_save(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_write_path(path)?;
    let json_value = require_value_alias(params, &["json", "timeline"])?;
    let serialized = serde_json::to_string_pretty(json_value).map_err(|error| {
        format!(
            "failed to serialize timeline for '{}': {error}",
            path_buf.display()
        )
    })?;

    let bytes_written = serialized.len();
    fs::write(&path_buf, serialized)
        .map_err(|error| format!("failed to write timeline '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "bytesWritten": bytes_written,
    }))
}

// ---------------------------------------------------------------------------
// Project / Episode / Segment hierarchy
// ---------------------------------------------------------------------------

fn projects_root() -> PathBuf {
    let home = env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join("NextFrame").join("projects")
}

fn handle_project_list(_params: &Value) -> Result<Value, String> {
    let root = projects_root();
    if !root.exists() {
        return Ok(json!({ "projects": [] }));
    }

    let mut projects: Vec<Value> = Vec::new();
    let entries =
        fs::read_dir(&root).map_err(|e| format!("failed to read projects dir: {e}"))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let project_json = path.join("project.json");
        if !project_json.exists() {
            continue;
        }
        let content = fs::read_to_string(&project_json)
            .map_err(|e| format!("failed to read {}: {e}", project_json.display()))?;
        let meta: Value =
            serde_json::from_str(&content).unwrap_or_else(|_| json!({}));

        // count episode subdirs
        let episode_count = fs::read_dir(&path)
            .map(|rd| {
                rd.filter_map(Result::ok)
                    .filter(|e| e.path().is_dir() && e.path().join("episode.json").exists())
                    .count()
            })
            .unwrap_or(0);

        let updated = meta
            .get("updated")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        projects.push(json!({
            "name": meta.get("name").and_then(Value::as_str).unwrap_or_default(),
            "path": path.display().to_string(),
            "episodes": episode_count,
            "updated": updated,
        }));
    }

    projects.sort_by(|a, b| {
        let a_updated = a.get("updated").and_then(Value::as_str).unwrap_or("");
        let b_updated = b.get("updated").and_then(Value::as_str).unwrap_or("");
        b_updated.cmp(a_updated)
    });

    Ok(json!({ "projects": projects }))
}

fn handle_project_create(params: &Value) -> Result<Value, String> {
    let name = require_string(params, "name")?;
    let root = projects_root();
    let project_dir = root.join(name);
    if project_dir.exists() {
        return Err(format!("project '{}' already exists", name));
    }

    fs::create_dir_all(&project_dir)
        .map_err(|e| format!("failed to create project dir: {e}"))?;

    let now = iso_now();
    let meta = json!({
        "name": name,
        "created": now,
        "updated": now,
    });

    let project_json = project_dir.join("project.json");
    fs::write(
        &project_json,
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("failed to write project.json: {e}"))?;

    Ok(json!({ "path": project_dir.display().to_string() }))
}

fn handle_episode_list(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let project_dir = projects_root().join(project);
    if !project_dir.exists() {
        return Err(format!("project '{}' not found", project));
    }

    let mut episodes: Vec<Value> = Vec::new();
    let entries =
        fs::read_dir(&project_dir).map_err(|e| format!("failed to read project dir: {e}"))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let episode_json = path.join("episode.json");
        if !episode_json.exists() {
            continue;
        }
        let content = fs::read_to_string(&episode_json)
            .map_err(|e| format!("failed to read {}: {e}", episode_json.display()))?;
        let meta: Value =
            serde_json::from_str(&content).unwrap_or_else(|_| json!({}));

        // count segment .json files (excluding episode.json)
        let mut segment_count = 0;
        let mut total_duration = 0.0_f64;
        if let Ok(rd) = fs::read_dir(&path) {
            for seg_entry in rd.filter_map(Result::ok) {
                let seg_path = seg_entry.path();
                if seg_path.extension().and_then(|e| e.to_str()) == Some("json")
                    && seg_path.file_name().and_then(|n| n.to_str()) != Some("episode.json")
                {
                    segment_count += 1;
                    if let Ok(seg_content) = fs::read_to_string(&seg_path) {
                        if let Ok(seg_val) = serde_json::from_str::<Value>(&seg_content) {
                            if let Some(dur) = seg_val.get("duration").and_then(Value::as_f64)
                            {
                                total_duration += dur;
                            }
                        }
                    }
                }
            }
        }

        let order = meta.get("order").and_then(Value::as_u64).unwrap_or(0);
        episodes.push(json!({
            "name": meta.get("name").and_then(Value::as_str).unwrap_or_default(),
            "path": path.display().to_string(),
            "order": order,
            "segments": segment_count,
            "totalDuration": total_duration,
        }));
    }

    episodes.sort_by_key(|e| e.get("order").and_then(Value::as_u64).unwrap_or(0));

    Ok(json!({ "episodes": episodes }))
}

fn handle_episode_create(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let name = require_string(params, "name")?;
    let project_dir = projects_root().join(project);
    if !project_dir.exists() {
        return Err(format!("project '{}' not found", project));
    }

    let episode_dir = project_dir.join(name);
    if episode_dir.exists() {
        return Err(format!("episode '{}' already exists", name));
    }

    // count existing episodes for order
    let order = fs::read_dir(&project_dir)
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| e.path().is_dir() && e.path().join("episode.json").exists())
                .count()
        })
        .unwrap_or(0);

    fs::create_dir_all(&episode_dir)
        .map_err(|e| format!("failed to create episode dir: {e}"))?;

    let now = iso_now();
    let meta = json!({
        "name": name,
        "order": order,
        "created": now,
    });

    fs::write(
        episode_dir.join("episode.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("failed to write episode.json: {e}"))?;

    // update project.json updated timestamp
    let project_json_path = project_dir.join("project.json");
    if let Ok(content) = fs::read_to_string(&project_json_path) {
        if let Ok(mut project_meta) = serde_json::from_str::<Value>(&content) {
            if let Some(obj) = project_meta.as_object_mut() {
                obj.insert("updated".to_string(), json!(now));
                let _ = fs::write(
                    &project_json_path,
                    serde_json::to_string_pretty(&project_meta).unwrap_or_default(),
                );
            }
        }
    }

    Ok(json!({ "path": episode_dir.display().to_string() }))
}

fn handle_segment_list(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let episode_dir = projects_root().join(project).join(episode);
    if !episode_dir.exists() {
        return Err(format!("episode directory not found"));
    }

    let mut segments: Vec<Value> = Vec::new();
    let entries =
        fs::read_dir(&episode_dir).map_err(|e| format!("failed to read episode dir: {e}"))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if path.file_name().and_then(|n| n.to_str()) == Some("episode.json") {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let mut duration = 0.0_f64;
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                duration = val.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
            }
        }

        segments.push(json!({
            "name": name,
            "path": path.display().to_string(),
            "duration": duration,
        }));
    }

    segments.sort_by(|a, b| {
        let a_name = a.get("name").and_then(Value::as_str).unwrap_or("");
        let b_name = b.get("name").and_then(Value::as_str).unwrap_or("");
        a_name.cmp(b_name)
    });

    Ok(json!({ "segments": segments }))
}

fn handle_preview_frame(params: &Value) -> Result<Value, String> {
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
    let cli_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../nextframe-cli/bin/nextframe.js");

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

    // base64 encode (manual, no external crate)
    let b64 = base64_encode(&bytes);

    Ok(json!({
        "dataUrl": format!("data:image/png;base64,{b64}"),
        "width": width,
        "height": height,
        "t": t,
    }))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn handle_fs_mtime(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Ok(json!({ "mtime": null }));
    }
    let metadata = fs::metadata(&path_buf)
        .map_err(|e| format!("failed to read metadata: {e}"))?;
    let mtime = metadata
        .modified()
        .map_err(|e| format!("failed to get mtime: {e}"))?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Ok(json!({ "mtime": mtime as u64 }))
}

fn iso_now() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // simple ISO 8601 without chrono dependency
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;
    // approximate date from epoch days (good enough for display)
    let (year, month, day) = epoch_days_to_date(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z"
    )
}

fn epoch_days_to_date(days: u64) -> (u64, u64, u64) {
    // civil_from_days algorithm (Howard Hinnant)
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn handle_autosave_write(params: &Value) -> Result<Value, String> {
    let project_id = require_string_alias(params, &["projectId", "project_id"])?;
    let timeline = require_value_alias(params, &["timeline", "json"])?;
    let autosave_path = autosave_file_path(project_id)?;
    let serialized = serde_json::to_string_pretty(timeline).map_err(|error| {
        format!(
            "failed to serialize autosave '{}': {error}",
            autosave_path.display()
        )
    })?;

    if let Some(parent) = autosave_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create autosave directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    let bytes_written = serialized.len();
    fs::write(&autosave_path, serialized).map_err(|error| {
        format!(
            "failed to write autosave '{}': {error}",
            autosave_path.display()
        )
    })?;

    Ok(json!({
        "projectId": project_id,
        "path": autosave_path.display().to_string(),
        "bytesWritten": bytes_written,
    }))
}

fn handle_autosave_list(_params: &Value) -> Result<Value, String> {
    let autosave_dir = autosave_dir_path()?;
    let metadata = match fs::metadata(&autosave_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(json!([])),
        Err(error) => {
            return Err(format!(
                "failed to inspect autosave directory '{}': {error}",
                autosave_dir.display()
            ));
        }
    };

    if !metadata.is_dir() {
        return Err(format!(
            "autosave path is not a directory: {}",
            autosave_dir.display()
        ));
    }

    let mut entries = fs::read_dir(&autosave_dir)
        .map_err(|error| {
            format!(
                "failed to list autosave directory '{}': {error}",
                autosave_dir.display()
            )
        })?
        .filter_map(Result::ok)
        .filter_map(|entry| autosave_list_item(&entry.path()).transpose())
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then_with(|| left.project_id.cmp(&right.project_id))
    });

    Ok(json!(entries))
}

fn handle_autosave_clear(params: &Value) -> Result<Value, String> {
    let project_id = require_string_alias(params, &["projectId", "project_id"])?;
    let autosave_path = autosave_file_path(project_id)?;

    let cleared = match fs::remove_file(&autosave_path) {
        Ok(()) => true,
        Err(error) if error.kind() == ErrorKind::NotFound => false,
        Err(error) => {
            return Err(format!(
                "failed to clear autosave '{}': {error}",
                autosave_path.display()
            ));
        }
    };

    Ok(json!({
        "projectId": project_id,
        "path": autosave_path.display().to_string(),
        "cleared": cleared,
    }))
}

fn handle_autosave_recover(params: &Value) -> Result<Value, String> {
    let project_id = require_string_alias(params, &["projectId", "project_id"])?;
    let autosave_path = autosave_file_path(project_id)?;
    let contents = fs::read_to_string(&autosave_path).map_err(|error| {
        format!(
            "failed to read autosave '{}': {error}",
            autosave_path.display()
        )
    })?;

    serde_json::from_str(&contents).map_err(|error| {
        format!(
            "failed to parse autosave '{}': {error}",
            autosave_path.display()
        )
    })
}

fn autosave_dir_path() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(path) = autosave_storage_path_override() {
        return Ok(path);
    }

    let home = home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let autosave_dir = home.join(RECENT_DIR_NAME).join(AUTOSAVE_DIR_NAME);
    let raw_path = autosave_dir.display().to_string();
    resolve_home_write_path(&raw_path)
}

fn autosave_file_path(project_id: &str) -> Result<PathBuf, String> {
    validate_autosave_project_id(project_id)?;
    let autosave_dir = autosave_dir_path()?;
    let autosave_path = autosave_dir.join(format!("{project_id}.nfproj"));
    let raw_path = autosave_path.display().to_string();
    resolve_home_write_path(&raw_path)
}

fn validate_autosave_project_id(project_id: &str) -> Result<(), String> {
    if project_id.is_empty() {
        return Err("params.projectId must be a non-empty string".to_string());
    }

    if project_id == "." || project_id == ".." || project_id.contains(['/', '\\']) {
        return Err(format!("invalid autosave project id: {project_id}"));
    }

    Ok(())
}

fn autosave_list_item(path: &Path) -> Result<Option<AutosaveListItem>, String> {
    if !has_recent_project_extension(path) {
        return Ok(None);
    }

    let project_id = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("invalid autosave filename '{}'", path.display()))?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("failed to inspect autosave '{}': {error}", path.display()))?;
    if !metadata.is_file() {
        return Ok(None);
    }

    let modified = metadata
        .modified()
        .map_err(|error| format!("failed to inspect autosave '{}': {error}", path.display()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("autosave modified time before unix epoch: {error}"))?
        .as_millis() as u64;

    Ok(Some(AutosaveListItem {
        project_id: project_id.to_string(),
        path: path.display().to_string(),
        modified,
    }))
}

fn recent_storage_path() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(path) = recent_storage_path_override() {
        return Ok(path);
    }

    let home = home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let storage_path = home.join(RECENT_DIR_NAME).join(RECENT_FILE_NAME);
    let raw_path = storage_path.display().to_string();
    resolve_home_write_path(&raw_path)
}

fn ensure_recent_storage_file() -> Result<PathBuf, String> {
    let storage_path = recent_storage_path()?;

    if let Some(parent) = storage_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create recent file directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    match fs::metadata(&storage_path) {
        Ok(metadata) if metadata.is_dir() => Err(format!(
            "recent file path is a directory: {}",
            storage_path.display()
        )),
        Ok(_) => Ok(storage_path),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            fs::write(&storage_path, "[]").map_err(|write_error| {
                format!(
                    "failed to create recent file '{}': {write_error}",
                    storage_path.display()
                )
            })?;
            Ok(storage_path)
        }
        Err(error) => Err(format!(
            "failed to inspect recent file '{}': {error}",
            storage_path.display()
        )),
    }
}

fn read_recent_records(storage_path: &Path) -> Result<Vec<RecentProjectRecord>, String> {
    let contents = fs::read_to_string(storage_path).map_err(|error| {
        format!(
            "failed to read recent file '{}': {error}",
            storage_path.display()
        )
    })?;

    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&contents).map_err(|error| {
        format!(
            "failed to parse recent file '{}': {error}",
            storage_path.display()
        )
    })
}

fn save_recent_records(storage_path: &Path, records: &[RecentProjectRecord]) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(records).map_err(|error| {
        format!(
            "failed to serialize recent file '{}': {error}",
            storage_path.display()
        )
    })?;

    fs::write(storage_path, serialized).map_err(|error| {
        format!(
            "failed to write recent file '{}': {error}",
            storage_path.display()
        )
    })
}

fn normalize_recent_records(records: Vec<RecentProjectRecord>) -> Vec<RecentProjectRecord> {
    let mut normalized = Vec::with_capacity(records.len().min(RECENT_MAX_ENTRIES));
    let mut seen = HashSet::new();

    for record in records {
        if !is_recent_project_path(&record.path) {
            continue;
        }

        if seen.insert(record.path.clone()) {
            normalized.push(record);
        }

        if normalized.len() == RECENT_MAX_ENTRIES {
            break;
        }
    }

    normalized
}

fn is_recent_project_path(raw_path: &str) -> bool {
    let Ok(path) = validate_path(raw_path) else {
        return false;
    };
    let Ok(home) = home_root() else {
        return false;
    };

    path.starts_with(&home) && has_recent_project_extension(&path)
}

fn recent_project_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn has_recent_project_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("nfproj"))
}

fn ensure_recent_project_extension(path: &Path, raw_path: &str) -> Result<(), String> {
    if has_recent_project_extension(path) {
        Ok(())
    } else {
        Err(format!("path must point to a .nfproj file: {raw_path}"))
    }
}

fn unix_timestamp_secs() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("system clock before unix epoch: {error}"))
}

fn require_object(params: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    params
        .as_object()
        .ok_or_else(|| "params must be a JSON object".to_string())
}

fn require_value<'a>(params: &'a Value, key: &str) -> Result<&'a Value, String> {
    require_object(params)?
        .get(key)
        .ok_or_else(|| format!("missing params.{key}"))
}

fn require_value_alias<'a>(params: &'a Value, keys: &[&str]) -> Result<&'a Value, String> {
    let object = require_object(params)?;

    for key in keys {
        if let Some(value) = object.get(*key) {
            return Ok(value);
        }
    }

    match keys {
        [] => Err("missing required params value".to_string()),
        [key] => Err(format!("missing params.{key}")),
        _ => Err(format!(
            "missing one of {}",
            keys.iter()
                .map(|key| format!("params.{key}"))
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

fn require_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    require_value(params, key)?
        .as_str()
        .ok_or_else(|| format!("params.{key} must be a string"))
}

fn require_string_alias<'a>(params: &'a Value, keys: &[&str]) -> Result<&'a str, String> {
    let object = require_object(params)?;

    for key in keys {
        if let Some(value) = object.get(*key) {
            return value
                .as_str()
                .ok_or_else(|| format!("params.{key} must be a string"));
        }
    }

    Err(format!("missing params.{}", keys[0]))
}

fn require_array<'a>(params: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    require_value(params, key)?
        .as_array()
        .ok_or_else(|| format!("params.{key} must be an array"))
}

fn require_u32(params: &Value, key: &str) -> Result<u32, String> {
    let value = require_value(params, key)?
        .as_u64()
        .ok_or_else(|| format!("params.{key} must be an unsigned integer"))?;

    u32::try_from(value).map_err(|_| format!("params.{key} is out of range"))
}

fn require_positive_u32(params: &Value, key: &str) -> Result<u32, String> {
    let value = require_u32(params, key)?;
    if value == 0 {
        Err(format!("params.{key} must be greater than 0"))
    } else {
        Ok(value)
    }
}

fn require_positive_f64(params: &Value, key: &str) -> Result<f64, String> {
    let value = require_value(params, key)?
        .as_f64()
        .ok_or_else(|| format!("params.{key} must be a number"))?;

    if value.is_finite() && value > 0.0 {
        Ok(value)
    } else {
        Err(format!("params.{key} must be greater than 0"))
    }
}

fn parse_audio_sources(params: &Value) -> Result<Vec<AudioSource>, String> {
    let sources = require_array(params, "audioSources")?;
    let mut parsed = Vec::with_capacity(sources.len());

    for (index, source) in sources.iter().enumerate() {
        let object = source
            .as_object()
            .ok_or_else(|| format!("params.audioSources[{index}] must be an object"))?;
        let path = object
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("params.audioSources[{index}].path must be a string"))?;
        let start_time = read_audio_source_number(object, index, &["startTime", "start_time"])?;
        if !start_time.is_finite() || start_time < 0.0 {
            return Err(format!(
                "params.audioSources[{index}].startTime must be a finite number >= 0"
            ));
        }

        let volume = match object.get("volume") {
            Some(value) => value
                .as_f64()
                .ok_or_else(|| format!("params.audioSources[{index}].volume must be a number"))?,
            None => 1.0,
        };
        if !volume.is_finite() || volume < 0.0 {
            return Err(format!(
                "params.audioSources[{index}].volume must be a finite number >= 0"
            ));
        }

        parsed.push(AudioSource {
            path: resolve_existing_path(path)?,
            start_time,
            volume,
        });
    }

    Ok(parsed)
}

fn read_audio_source_number(
    object: &serde_json::Map<String, Value>,
    index: usize,
    keys: &[&str],
) -> Result<f64, String> {
    for key in keys {
        if let Some(value) = object.get(*key) {
            return value
                .as_f64()
                .ok_or_else(|| format!("params.audioSources[{index}].{key} must be a number"));
        }
    }

    Err(format!("missing params.audioSources[{index}].{}", keys[0]))
}

fn parse_dialog_filters(params: &Value) -> Result<Vec<String>, String> {
    let filters = require_array(params, "filters")?;
    let mut extensions = Vec::new();

    for (index, filter) in filters.iter().enumerate() {
        match filter {
            Value::String(extension) => {
                if let Some(normalized) = normalize_extension(extension) {
                    extensions.push(normalized);
                } else {
                    return Err(format!("params.filters[{index}] must not be empty"));
                }
            }
            Value::Object(object) => {
                let values = object
                    .get("extensions")
                    .and_then(Value::as_array)
                    .ok_or_else(|| {
                        format!("params.filters[{index}].extensions must be an array")
                    })?;

                for (extension_index, value) in values.iter().enumerate() {
                    let extension = value.as_str().ok_or_else(|| {
                        format!(
                            "params.filters[{index}].extensions[{extension_index}] must be a string"
                        )
                    })?;

                    if let Some(normalized) = normalize_extension(extension) {
                        extensions.push(normalized);
                    } else {
                        return Err(format!(
                            "params.filters[{index}].extensions[{extension_index}] must not be empty"
                        ));
                    }
                }
            }
            _ => {
                return Err(format!(
                    "params.filters[{index}] must be a string or filter object"
                ));
            }
        }
    }

    Ok(extensions)
}

fn normalize_extension(extension: &str) -> Option<String> {
    let trimmed = extension.trim().trim_start_matches('.');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn with_default_extension(path: PathBuf, default_name: &str) -> PathBuf {
    if path.extension().is_some() {
        return path;
    }

    let Some(extension) = Path::new(default_name)
        .extension()
        .and_then(|value| value.to_str())
    else {
        return path;
    };

    if extension.is_empty() {
        return path;
    }

    path.with_extension(extension)
}

#[cfg(not(test))]
fn show_open_dialog(filters: &[String]) -> Option<PathBuf> {
    let mut dialog = FileDialog::new();

    if !filters.is_empty() {
        let filter_refs = filters.iter().map(String::as_str).collect::<Vec<_>>();
        dialog = dialog.add_filter("Supported Files", &filter_refs);
    }

    dialog.pick_file()
}

#[cfg(test)]
fn show_open_dialog(_filters: &[String]) -> Option<PathBuf> {
    Some(env::temp_dir().join("dialog-open.nfproj"))
}

#[cfg(not(test))]
fn show_save_dialog(default_name: &str) -> Option<PathBuf> {
    let mut dialog = FileDialog::new().set_file_name(default_name);

    if let Some(extension) = Path::new(default_name)
        .extension()
        .and_then(|value| value.to_str())
    {
        dialog = dialog.add_filter("NextFrame Projects", &[extension]);
    }

    dialog.save_file()
}

#[cfg(test)]
fn show_save_dialog(default_name: &str) -> Option<PathBuf> {
    Some(env::temp_dir().join(default_name))
}

#[cfg(not(test))]
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_platform_command("open", [String::from("-R"), path.display().to_string()])
    }

    #[cfg(target_os = "windows")]
    {
        run_platform_command("explorer", [format!("/select,{}", path.display())])
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        run_platform_command("xdg-open", [target.display().to_string()])
    }
}

#[cfg(not(test))]
fn run_platform_command(
    program: &str,
    args: impl IntoIterator<Item = String>,
) -> Result<(), String> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "command exited with {}",
            format_exit_status(status)
        ))
    }
}

#[cfg(test)]
fn reveal_in_file_manager(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn lock_process_registry() -> Result<std::sync::MutexGuard<'static, ProcessRegistry>, String> {
    process_registry()
        .lock()
        .map_err(|_| "process registry is unavailable".to_string())
}

fn process_registry() -> &'static Mutex<ProcessRegistry> {
    PROCESS_REGISTRY.get_or_init(|| {
        Mutex::new(ProcessRegistry {
            export_start_reserved: false,
            handles: HashMap::new(),
        })
    })
}

fn reserve_export_start(registry: &mut ProcessRegistry) -> Result<bool, String> {
    if registry.export_start_reserved {
        return Ok(false);
    }

    for handle in registry.handles.values_mut() {
        refresh_process_state(handle)?;
        if handle.terminal.is_none() {
            return Ok(false);
        }
    }

    registry.export_start_reserved = true;
    Ok(true)
}

fn clear_export_start_reservation() -> Result<(), String> {
    let mut registry = lock_process_registry()?;
    registry.export_start_reserved = false;
    Ok(())
}

fn refresh_process_state(handle: &mut ProcessHandle) -> Result<(), String> {
    if handle.terminal.is_some() {
        return Ok(());
    }

    if let Some(status) = handle
        .child
        .try_wait()
        .map_err(|error| format!("failed to read export process state: {error}"))?
    {
        handle.terminal = Some(if status.success() {
            ProcessTerminal {
                state: EXPORT_DONE,
                error: None,
            }
        } else {
            ProcessTerminal {
                state: EXPORT_FAILED,
                error: Some(format_exit_status(status)),
            }
        });
    }

    Ok(())
}

fn export_status_json(handle: &ProcessHandle) -> Value {
    let elapsed = handle.started_at.elapsed().as_secs_f64();
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

fn percent_complete(elapsed: f64, duration_secs: f64) -> f64 {
    if duration_secs.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return 0.0;
    }

    ((elapsed / duration_secs) * 100.0).clamp(0.0, 100.0)
}

fn remaining_secs(elapsed: f64, duration_secs: f64) -> f64 {
    if duration_secs.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return 0.0;
    }

    (duration_secs - elapsed).max(0.0)
}

fn resolve_recorder_launch_plan(current_dir: &Path) -> Option<RecorderLaunchPlan> {
    let env_override = env::var_os("NEXTFRAME_RECORDER_PATH")
        .map(PathBuf::from)
        .map(|path| absolutize_path(current_dir, path));
    let release_path = current_dir
        .join("../MediaAgentTeam/recorder/target/release")
        .join(recorder_binary_name());
    let manifest_path = current_dir.join("../MediaAgentTeam/recorder/Cargo.toml");

    resolve_recorder_launch_plan_with(env_override, release_path, manifest_path).map(|launcher| {
        RecorderLaunchPlan {
            launcher,
            recorder_args: Vec::new(),
        }
    })
}

fn resolve_recorder_launch_plan_with(
    env_override: Option<PathBuf>,
    release_path: PathBuf,
    manifest_path: PathBuf,
) -> Option<RecorderLauncher> {
    if let Some(path) = env_override.filter(|path| path.is_file()) {
        return Some(RecorderLauncher::Binary(path));
    }

    if release_path.is_file() {
        return Some(RecorderLauncher::Binary(release_path));
    }

    if manifest_path.is_file() {
        return Some(RecorderLauncher::Cargo(manifest_path));
    }

    None
}

fn build_export_plan(
    current_dir: &Path,
    output_path: &Path,
    width: u32,
    height: u32,
    fps: u32,
    duration: f64,
) -> Result<Option<RecorderLaunchPlan>, String> {
    let Some(mut plan) = resolve_recorder_launch_plan(current_dir) else {
        return Ok(None);
    };

    let url = build_recording_url(current_dir)?;
    plan.recorder_args =
        build_recorder_args(url, output_path.to_path_buf(), width, height, fps, duration);
    Ok(Some(plan))
}

fn build_recorder_args(
    url: String,
    output_path: PathBuf,
    width: u32,
    height: u32,
    fps: u32,
    duration: f64,
) -> Vec<String> {
    vec![
        "--url".to_string(),
        url,
        "--out".to_string(),
        output_path.display().to_string(),
        "--width".to_string(),
        width.to_string(),
        "--height".to_string(),
        height.to_string(),
        "--fps".to_string(),
        fps.to_string(),
        "--duration".to_string(),
        trim_float(duration),
    ]
}

fn build_recording_url(current_dir: &Path) -> Result<String, String> {
    let web_path = current_dir
        .join("runtime/web/index.html")
        .canonicalize()
        .map_err(|error| format!("failed to resolve runtime/web/index.html: {error}"))?;

    Ok(format!("{}?record=true", path_to_file_url(&web_path)))
}

fn spawn_recorder(plan: &RecorderLaunchPlan, log_path: &Path) -> Result<Child, String> {
    let stdout = fs::File::create(log_path).map_err(|error| {
        format!(
            "failed to create export log '{}': {error}",
            log_path.display()
        )
    })?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("failed to clone export log handle: {error}"))?;

    let mut command = match &plan.launcher {
        RecorderLauncher::Binary(path) => {
            let mut command = Command::new(path);
            command.args(&plan.recorder_args);
            command
        }
        RecorderLauncher::Cargo(manifest_path) => {
            let mut command = Command::new("cargo");
            command
                .args(["run", "--release", "-p", "recorder", "--manifest-path"])
                .arg(manifest_path)
                .arg("--")
                .args(&plan.recorder_args);
            command
        }
    };

    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| error.to_string())
}

fn copy_video_output(video_path: &Path, output_path: &Path) -> Result<(), String> {
    if video_path == output_path {
        return Ok(());
    }

    fs::copy(video_path, output_path).map_err(|error| {
        format!(
            "failed to copy '{}' to '{}': {error}",
            video_path.display(),
            output_path.display()
        )
    })?;

    Ok(())
}

fn cleanup_intermediate_video(video_path: &Path, output_path: &Path) {
    if video_path == output_path {
        return;
    }

    if let Err(error) = fs::remove_file(video_path) {
        if error.kind() != ErrorKind::NotFound {
            eprintln!(
                "warning: failed to remove intermediate export '{}': {error}",
                video_path.display()
            );
        }
    }
}

fn ffmpeg_command_path() -> Result<Option<PathBuf>, String> {
    let mut cache = lock_ffmpeg_path_cache()?;
    if let Some(path) = cache.as_ref() {
        return Ok(path.clone());
    }

    let detected = detect_ffmpeg_command_path()?;
    *cache = Some(detected.clone());
    Ok(detected)
}

fn lock_ffmpeg_path_cache(
) -> Result<std::sync::MutexGuard<'static, Option<Option<PathBuf>>>, String> {
    ffmpeg_path_cache()
        .lock()
        .map_err(|_| "ffmpeg path cache is unavailable".to_string())
}

fn ffmpeg_path_cache() -> &'static Mutex<Option<Option<PathBuf>>> {
    FFMPEG_PATH_CACHE.get_or_init(|| Mutex::new(None))
}

#[cfg(not(test))]
fn detect_ffmpeg_command_path() -> Result<Option<PathBuf>, String> {
    let program = if cfg!(windows) { "where" } else { "which" };
    let output = Command::new(program)
        .arg("ffmpeg")
        .output()
        .map_err(|error| format!("failed to detect ffmpeg: {error}"))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next().map(str::trim).unwrap_or_default();
    if first_line.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PathBuf::from(first_line)))
    }
}

fn build_ffmpeg_command(
    program: PathBuf,
    video_path: &Path,
    audio_sources: &[AudioSource],
    output_path: &Path,
) -> FfmpegCommand {
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        video_path.display().to_string(),
    ];

    for source in audio_sources {
        args.push("-i".to_string());
        args.push(source.path.display().to_string());
    }

    args.push("-filter_complex".to_string());
    args.push(build_ffmpeg_filter_complex(audio_sources));
    args.push("-map".to_string());
    args.push("0:v".to_string());
    args.push("-map".to_string());
    args.push("[aout]".to_string());
    args.push("-c:v".to_string());
    args.push("copy".to_string());
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push(output_path.display().to_string());

    FfmpegCommand { program, args }
}

fn build_ffmpeg_filter_complex(audio_sources: &[AudioSource]) -> String {
    let mut filter_parts = Vec::with_capacity(audio_sources.len() + 1);
    let mut mix_inputs = String::new();

    for (index, source) in audio_sources.iter().enumerate() {
        let input_index = index + 1;
        let label = format!("a{index}");
        let delay_ms = secs_to_millis(source.start_time);
        filter_parts.push(format!(
            "[{input_index}:a]adelay={delay_ms}:all=1,volume={}[{label}]",
            trim_float(source.volume)
        ));
        mix_inputs.push_str(&format!("[{label}]"));
    }

    filter_parts.push(format!(
        "{mix_inputs}amix=inputs={}:normalize=0[aout]",
        audio_sources.len()
    ));
    filter_parts.join(";")
}

fn secs_to_millis(value: f64) -> u64 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }

    (value * 1000.0).round() as u64
}

#[cfg(not(test))]
fn run_ffmpeg_command(command: &FfmpegCommand) -> Result<CommandOutput, String> {
    let output = Command::new(&command.program)
        .args(&command.args)
        .output()
        .map_err(|error| error.to_string())?;

    Ok(CommandOutput {
        success: output.status.success(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn create_export_log_path() -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock before unix epoch: {error}"))?
        .as_secs();

    Ok(env::temp_dir().join(format!("nextframe-export-{timestamp}.log")))
}

fn format_exit_status(status: ExitStatus) -> String {
    match status.code() {
        Some(code) => format!("exit_code_{code}"),
        None => "terminated_by_signal".to_string(),
    }
}

fn recorder_binary_name() -> &'static str {
    if cfg!(windows) {
        "recorder.exe"
    } else {
        "recorder"
    }
}

fn absolutize_path(current_dir: &Path, path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        path
    } else {
        current_dir.join(path)
    }
}

fn trim_float(value: f64) -> String {
    let mut rendered = format!("{value:.3}");
    while rendered.contains('.') && rendered.ends_with('0') {
        rendered.pop();
    }
    if rendered.ends_with('.') {
        rendered.pop();
    }
    rendered
}

fn path_to_file_url(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let prefix = if raw.starts_with('/') {
        "file://"
    } else {
        "file:///"
    };
    format!("{prefix}{}", percent_encode_path(&raw))
}

fn percent_encode_path(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());

    for byte in value.bytes() {
        let keep = matches!(
            byte,
            b'A'..=b'Z'
                | b'a'..=b'z'
                | b'0'..=b'9'
                | b'/'
                | b':'
                | b'-'
                | b'_'
                | b'.'
                | b'~'
        );

        if keep {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push_str(&format!("{byte:02X}"));
        }
    }

    encoded
}

fn validate_path(raw_path: &str) -> Result<PathBuf, String> {
    let normalized = raw_path.trim();
    if normalized.is_empty() {
        return Err("path must not be empty".to_string());
    }

    if normalized.contains("..") {
        return Err(format!("path is outside sandbox: {raw_path}"));
    }

    Ok(expand_home_dir(normalized))
}

fn resolve_existing_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;

    ensure_allowed_path(&canonical, raw_path)?;
    Ok(canonical)
}

fn resolve_write_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let existing_parent = nearest_existing_ancestor(parent)
        .ok_or_else(|| format!("failed to resolve parent for '{}'", path.display()))?;
    let canonical_parent = fs::canonicalize(&existing_parent).map_err(|error| {
        format!(
            "failed to resolve parent for '{}': {error}",
            existing_parent.display()
        )
    })?;

    ensure_allowed_path(&canonical_parent, raw_path)?;

    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let canonical_target = fs::canonicalize(&path)
                .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;
            ensure_allowed_path(&canonical_target, raw_path)?;
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!("failed to inspect '{}': {error}", path.display()));
        }
    }

    Ok(path)
}

fn resolve_reveal_path(raw_path: &str) -> Result<PathBuf, String> {
    resolve_existing_path(raw_path).or_else(|_| resolve_write_path(raw_path))
}

fn resolve_home_existing_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;

    ensure_home_path(&canonical, raw_path)?;
    Ok(canonical)
}

fn resolve_home_write_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let existing_parent = nearest_existing_ancestor(parent)
        .ok_or_else(|| format!("failed to resolve parent for '{}'", path.display()))?;
    let canonical_parent = fs::canonicalize(&existing_parent).map_err(|error| {
        format!(
            "failed to resolve parent for '{}': {error}",
            existing_parent.display()
        )
    })?;

    ensure_home_path(&canonical_parent, raw_path)?;

    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let canonical_target = fs::canonicalize(&path)
                .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;
            ensure_home_path(&canonical_target, raw_path)?;
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!("failed to inspect '{}': {error}", path.display()));
        }
    }

    Ok(path)
}

fn nearest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut current = path;

    loop {
        if current.exists() {
            return Some(current.to_path_buf());
        }

        current = current.parent()?;
    }
}

fn ensure_allowed_path(path: &Path, raw_path: &str) -> Result<(), String> {
    if is_allowed_path(path) {
        Ok(())
    } else {
        Err(format!("path is outside sandbox: {raw_path}"))
    }
}

fn ensure_home_path(path: &Path, raw_path: &str) -> Result<(), String> {
    let home = home_root()?;
    if path.starts_with(&home) {
        Ok(())
    } else {
        Err(format!("path is outside sandbox: {raw_path}"))
    }
}

fn is_allowed_path(path: &Path) -> bool {
    allowed_roots()
        .into_iter()
        .any(|root| path.starts_with(root))
}

fn allowed_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    roots.push(canonical_or_raw(env::temp_dir()));
    if let Some(home) = home_dir() {
        roots.push(canonical_or_raw(home));
    }

    roots
}

fn canonical_or_raw(path: PathBuf) -> PathBuf {
    fs::canonicalize(&path).unwrap_or(path)
}

fn home_root() -> Result<PathBuf, String> {
    home_dir()
        .map(canonical_or_raw)
        .ok_or_else(|| "home directory is unavailable".to_string())
}

fn expand_home_dir(path: &str) -> PathBuf {
    if path == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from(path));
    }

    if let Some(stripped) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = home_dir() {
            return home.join(stripped);
        }
    }

    PathBuf::from(path)
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .or_else(|| {
            let home_drive = env::var_os("HOMEDRIVE")?;
            let home_path = env::var_os("HOMEPATH")?;
            Some(PathBuf::from(home_drive).join(home_path))
        })
}

#[cfg(test)]
struct MockFfmpegState {
    lookup_result: Result<Option<PathBuf>, String>,
    runs: VecDeque<Result<CommandOutput, String>>,
    invocations: Vec<FfmpegCommand>,
}

#[cfg(test)]
impl Default for MockFfmpegState {
    fn default() -> Self {
        Self {
            lookup_result: Ok(None),
            runs: VecDeque::new(),
            invocations: Vec::new(),
        }
    }
}

#[cfg(test)]
static MOCK_FFMPEG_STATE: OnceLock<Mutex<MockFfmpegState>> = OnceLock::new();
#[cfg(test)]
static MOCK_FFMPEG_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
#[cfg(test)]
static AUTOSAVE_STORAGE_PATH_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
#[cfg(test)]
static AUTOSAVE_STORAGE_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
#[cfg(test)]
static RECENT_STORAGE_PATH_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
#[cfg(test)]
static RECENT_STORAGE_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
fn detect_ffmpeg_command_path() -> Result<Option<PathBuf>, String> {
    let state = mock_ffmpeg_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    state.lookup_result.clone()
}

#[cfg(test)]
fn run_ffmpeg_command(command: &FfmpegCommand) -> Result<CommandOutput, String> {
    let mut state = mock_ffmpeg_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    state.invocations.push(command.clone());
    state
        .runs
        .pop_front()
        .unwrap_or_else(|| Err("missing mock ffmpeg execution".to_string()))
}

#[cfg(test)]
fn mock_ffmpeg_state() -> &'static Mutex<MockFfmpegState> {
    MOCK_FFMPEG_STATE.get_or_init(|| Mutex::new(MockFfmpegState::default()))
}

#[cfg(test)]
fn reset_ffmpeg_path_cache_for_tests() {
    if let Ok(mut cache) = lock_ffmpeg_path_cache() {
        *cache = None;
    }
}

#[cfg(test)]
fn autosave_storage_path_override() -> Option<PathBuf> {
    autosave_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

#[cfg(test)]
fn set_autosave_storage_path_override_for_tests(path: Option<PathBuf>) {
    let mut state = autosave_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *state = path;
}

#[cfg(test)]
fn autosave_storage_path_override_state() -> &'static Mutex<Option<PathBuf>> {
    AUTOSAVE_STORAGE_PATH_OVERRIDE.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
fn autosave_storage_test_lock() -> &'static Mutex<()> {
    AUTOSAVE_STORAGE_TEST_LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(test)]
fn recent_storage_path_override() -> Option<PathBuf> {
    recent_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

#[cfg(test)]
fn set_recent_storage_path_override_for_tests(path: Option<PathBuf>) {
    let mut state = recent_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *state = path;
}

#[cfg(test)]
fn recent_storage_path_override_state() -> &'static Mutex<Option<PathBuf>> {
    RECENT_STORAGE_PATH_OVERRIDE.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
fn recent_storage_test_lock() -> &'static Mutex<()> {
    RECENT_STORAGE_TEST_LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::{
        autosave_storage_test_lock, build_ffmpeg_filter_complex, build_recorder_args, dispatch,
        home_dir, initialize, mock_ffmpeg_state, recent_storage_test_lock, recorder_binary_name,
        reset_ffmpeg_path_cache_for_tests, resolve_recorder_launch_plan_with, resolve_write_path,
        set_autosave_storage_path_override_for_tests, set_recent_storage_path_override_for_tests,
        CommandOutput, FfmpegCommand, MockFfmpegState, RecorderLauncher, Request,
        MOCK_FFMPEG_TEST_LOCK,
    };
    use serde_json::{json, Value};
    use std::collections::HashSet;
    use std::env;
    use std::fs;
    use std::io;
    use std::path::{Path, PathBuf};
    use std::process;
    use std::sync::MutexGuard;
    use std::thread;
    use std::time::Duration;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn fs_read_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-read");
        let file_path = temp.join("note.txt");
        fs::write(&file_path, "hello bridge").expect("write fixture");

        let response = dispatch(request(
            "fs.read",
            json!({ "path": file_path.display().to_string() }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result,
            json!({
                "path": file_path.display().to_string(),
                "contents": "hello bridge",
            })
        );

        let error_response = dispatch(request(
            "fs.read",
            json!({ "path": disallowed_absolute_path() }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "outside sandbox");
    }

    #[test]
    fn fs_read_rejects_parent_traversal_path() {
        let response = dispatch(request("fs.read", json!({ "path": "../../../etc/passwd" })));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_read_rejects_symlink_escape() {
        let temp = TestDir::new("fs-read-symlink");
        let link_path = temp.join("passwd-link");
        create_file_symlink(Path::new(&disallowed_absolute_path()), &link_path)
            .expect("create symlink");

        let response = dispatch(request(
            "fs.read",
            json!({ "path": link_path.display().to_string() }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_write_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-write");
        let file_path = temp.join("write.txt");

        let response = dispatch(request(
            "fs.write",
            json!({
                "path": file_path.display().to_string(),
                "contents": "written from test",
            }),
        ));
        assert!(response.ok);
        assert_eq!(
            fs::read_to_string(&file_path).expect("read written file"),
            "written from test"
        );

        let error_response = dispatch(request(
            "fs.write",
            json!({
                "path": "../escape.txt",
                "contents": "nope",
            }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "outside sandbox");
    }

    #[test]
    fn fs_write_rejects_absolute_system_path() {
        let response = dispatch(request(
            "fs.write",
            json!({
                "path": absolute_write_rejection_path(),
                "contents": "blocked write",
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_write_rejects_symlink_parent_escape() {
        let temp = TestDir::new("fs-write-parent-symlink");
        let link_path = temp.join("escape-dir");
        create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

        let response = dispatch(request(
            "fs.write",
            json!({
                "path": link_path.join("blocked.txt").display().to_string(),
                "contents": "blocked write",
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_write_rejects_symlink_target_escape() {
        let temp = TestDir::new("fs-write-target-symlink");
        let link_path = temp.join("hosts-link");
        create_file_symlink(Path::new(&absolute_write_rejection_path()), &link_path)
            .expect("create symlink");

        let response = dispatch(request(
            "fs.write",
            json!({
                "path": link_path.display().to_string(),
                "contents": "blocked write",
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_list_dir_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-list");
        fs::write(temp.join("b.txt"), "b").expect("write b");
        fs::write(temp.join("a.txt"), "a").expect("write a");
        fs::create_dir(temp.join("nested")).expect("create nested dir");

        let response = dispatch(request(
            "fs.listDir",
            json!({ "path": temp.path.display().to_string() }),
        ));
        assert!(response.ok);

        let entries = response
            .result
            .get("entries")
            .and_then(Value::as_array)
            .expect("entries array");
        let names = entries
            .iter()
            .filter_map(|entry| entry.get("name").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["a.txt", "b.txt", "nested"]);

        let error_response = dispatch(request("fs.listDir", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.path");
    }

    #[test]
    fn fs_list_dir_rejects_symlink_escape() {
        let temp = TestDir::new("fs-list-symlink");
        let link_path = temp.join("etc-link");
        create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

        let response = dispatch(request(
            "fs.listDir",
            json!({ "path": link_path.display().to_string() }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_dialog_open_dispatch_happy_and_error() {
        let response = dispatch(request(
            "fs.dialogOpen",
            json!({
                "filters": [
                    ".nfproj"
                ]
            }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result.get("path"),
            Some(&json!(env::temp_dir()
                .join("dialog-open.nfproj")
                .display()
                .to_string()))
        );
        assert_eq!(response.result.get("canceled"), Some(&json!(false)));

        let error_response = dispatch(request("fs.dialogOpen", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.filters");
    }

    #[test]
    fn fs_dialog_save_dispatch_happy_and_error() {
        let response = dispatch(request(
            "fs.dialogSave",
            json!({ "defaultName": "project.nfproj" }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result.get("path"),
            Some(&json!(env::temp_dir()
                .join("project.nfproj")
                .display()
                .to_string()))
        );
        assert_eq!(response.result.get("canceled"), Some(&json!(false)));

        let error_response = dispatch(request("fs.dialogSave", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.defaultName");
    }

    #[test]
    fn fs_reveal_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-reveal");
        let file_path = temp.join("export.mp4");
        fs::write(&file_path, "video").expect("write export file");

        let response = dispatch(request(
            "fs.reveal",
            json!({ "path": file_path.display().to_string() }),
        ));
        assert!(response.ok);
        assert_eq!(response.result.get("revealed"), Some(&json!(true)));

        let error_response = dispatch(request("fs.reveal", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.path");
    }

    #[test]
    fn log_dispatch_happy_and_error() {
        let response = dispatch(request(
            "log",
            json!({
                "level": "info",
                "msg": "hello from tests",
            }),
        ));
        assert!(response.ok);
        assert_eq!(response.result.get("logged"), Some(&json!(true)));

        let error_response = dispatch(request(
            "log",
            json!({
                "level": "info",
            }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.msg");
    }

    #[test]
    fn scene_list_dispatch_happy_and_error() {
        let response = dispatch(request("scene.list", json!({})));
        assert!(response.ok);

        let scenes = response.result.as_array().expect("scene array");
        assert_eq!(scenes.len(), 10);
        assert_eq!(scenes[0].get("id"), Some(&json!("auroraGradient")));
        assert_eq!(scenes[9].get("id"), Some(&json!("cornerBadge")));

        let error_response = dispatch(request("scene.list", json!("bad params")));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "params must be a JSON object");
    }

    #[test]
    fn timeline_load_dispatch_happy_path() {
        let temp = TestDir::new("timeline-load");
        let timeline_path = temp.join("timeline.json");
        fs::write(
            &timeline_path,
            r##"{"version":"1","duration":30,"background":"#0b0b14","tracks":[{"id":"track-1","kind":"video","clips":[]}]}"##,
        )
        .expect("write timeline");

        let response = dispatch(request(
            "timeline.load",
            json!({ "path": timeline_path.display().to_string() }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result,
            json!({
                "version": "1",
                "duration": 30,
                "background": "#0b0b14",
                "tracks": [
                    { "id": "track-1", "kind": "video", "clips": [] }
                ]
            })
        );
    }

    #[test]
    fn timeline_load_dispatch_error_on_invalid_json() {
        let temp = TestDir::new("timeline-load-invalid");
        let timeline_path = temp.join("timeline.json");
        fs::write(&timeline_path, "not-json").expect("write invalid timeline");
        let error_response = dispatch(request(
            "timeline.load",
            json!({ "path": timeline_path.display().to_string() }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "failed to parse timeline");
    }

    #[test]
    fn timeline_load_rejects_symlink_escape() {
        let temp = TestDir::new("timeline-load-symlink");
        let link_path = temp.join("timeline-link.json");
        create_file_symlink(Path::new(&disallowed_absolute_path()), &link_path)
            .expect("create symlink");

        let response = dispatch(request(
            "timeline.load",
            json!({ "path": link_path.display().to_string() }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn timeline_save_dispatch_happy_path() {
        let temp = TestDir::new("timeline-save");
        let timeline_path = temp.join("saved-timeline.json");
        let timeline_path_string = timeline_path.display().to_string();

        let response = dispatch(request(
            "timeline.save",
            json!({
                "path": timeline_path_string,
                "json": {
                    "version": "1",
                    "duration": 30,
                    "background": "#0b0b14",
                    "tracks": [
                        { "id": "track-2", "kind": "video", "clips": [] }
                    ]
                }
            }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result.get("path"),
            Some(&json!(timeline_path.display().to_string()))
        );

        let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
        let saved_json: Value = serde_json::from_str(&saved).expect("parse saved timeline");
        assert_eq!(
            saved_json,
            json!({
                "version": "1",
                "duration": 30,
                "background": "#0b0b14",
                "tracks": [
                    { "id": "track-2", "kind": "video", "clips": [] }
                ]
            })
        );
    }

    #[test]
    fn timeline_save_accepts_timeline_alias() {
        let temp = TestDir::new("timeline-save-alias");
        let timeline_path = temp.join("saved-timeline-alias.json");
        let timeline_path_string = timeline_path.display().to_string();

        let response = dispatch(request(
            "timeline.save",
            json!({
                "path": timeline_path_string,
                "timeline": {
                    "version": "1",
                    "duration": 45,
                    "background": "#050814",
                    "tracks": [
                        { "id": "track-3", "kind": "video", "clips": [] }
                    ]
                }
            }),
        ));
        assert!(response.ok);

        let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
        let saved_json: Value = serde_json::from_str(&saved).expect("parse saved timeline");
        assert_eq!(
            saved_json,
            json!({
                "version": "1",
                "duration": 45,
                "background": "#050814",
                "tracks": [
                    { "id": "track-3", "kind": "video", "clips": [] }
                ]
            })
        );
    }

    #[test]
    fn timeline_save_dispatch_error_on_disallowed_path() {
        let error_response = dispatch(request(
            "timeline.save",
            json!({
                "path": disallowed_absolute_path(),
                "json": { "version": 3 }
            }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "outside sandbox");
    }

    #[test]
    fn timeline_save_rejects_symlink_parent_escape() {
        let temp = TestDir::new("timeline-save-parent-symlink");
        let link_path = temp.join("escape-dir");
        create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

        let response = dispatch(request(
            "timeline.save",
            json!({
                "path": link_path.join("blocked.json").display().to_string(),
                "json": minimal_timeline_json(),
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn timeline_save_rejects_symlink_target_escape() {
        let temp = TestDir::new("timeline-save-target-symlink");
        let link_path = temp.join("timeline-link.json");
        create_file_symlink(Path::new(&absolute_write_rejection_path()), &link_path)
            .expect("create symlink");

        let response = dispatch(request(
            "timeline.save",
            json!({
                "path": link_path.display().to_string(),
                "json": minimal_timeline_json(),
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn recent_add_dispatch_dedupes_and_caps_entries() {
        let home = home_dir().expect("home dir");
        let temp = TestDir::new_in(&home, "recent-add");
        let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));

        for index in 0..12 {
            let project_path = temp.join(&format!("project-{index}.nfproj"));
            fs::write(&project_path, "{}").expect("write project");

            let response = dispatch(request(
                "recent.add",
                json!({ "path": project_path.display().to_string() }),
            ));
            assert!(response.ok);
        }

        let duplicate_path = temp.join("project-5.nfproj");
        let response = dispatch(request(
            "recent.add",
            json!({ "path": duplicate_path.display().to_string() }),
        ));
        assert!(response.ok);

        let list_response = dispatch(request("recent.list", json!({})));
        assert!(list_response.ok);

        let entries = list_response
            .result
            .as_array()
            .expect("recent entries array");
        assert_eq!(entries.len(), 10);

        let names = entries
            .iter()
            .map(|entry| {
                entry
                    .get("name")
                    .and_then(Value::as_str)
                    .expect("recent entry name")
            })
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec![
                "project-5.nfproj",
                "project-11.nfproj",
                "project-10.nfproj",
                "project-9.nfproj",
                "project-8.nfproj",
                "project-7.nfproj",
                "project-6.nfproj",
                "project-4.nfproj",
                "project-3.nfproj",
                "project-2.nfproj",
            ]
        );

        let unique_paths = entries
            .iter()
            .map(|entry| {
                entry
                    .get("path")
                    .and_then(Value::as_str)
                    .expect("recent entry path")
            })
            .collect::<HashSet<_>>();
        assert_eq!(unique_paths.len(), entries.len());
    }

    #[test]
    fn autosave_dispatch_round_trips_and_lists_entries() {
        let home = home_dir().expect("home dir");
        let temp = TestDir::new_in(&home, "autosave-round-trip");
        let autosave_dir = temp.join(".nextframe/autosave");
        let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir.clone());

        let untitled_response = dispatch(request(
            "autosave.write",
            json!({
                "projectId": "untitled-1234",
                "timeline": minimal_timeline_json(),
            }),
        ));
        assert!(untitled_response.ok);

        thread::sleep(Duration::from_millis(5));

        let saved_project_id = "path-%2FUsers%2Fdemo%2Fedit.nfproj";
        let saved_response = dispatch(request(
            "autosave.write",
            json!({
                "projectId": saved_project_id,
                "timeline": {
                    "version": "1",
                    "duration": 45,
                    "tracks": []
                },
            }),
        ));
        assert!(saved_response.ok);

        let list_response = dispatch(request("autosave.list", json!({})));
        assert!(list_response.ok);

        let entries = list_response
            .result
            .as_array()
            .expect("autosave entries array");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].get("projectId"), Some(&json!(saved_project_id)));
        assert_eq!(entries[1].get("projectId"), Some(&json!("untitled-1234")));
        assert!(entries[0]
            .get("path")
            .and_then(Value::as_str)
            .expect("autosave path")
            .ends_with(".nfproj"));

        let recover_response = dispatch(request(
            "autosave.recover",
            json!({ "projectId": saved_project_id }),
        ));
        assert!(recover_response.ok);
        assert_eq!(
            recover_response.result,
            json!({
                "version": "1",
                "duration": 45,
                "tracks": []
            })
        );

        let clear_response = dispatch(request(
            "autosave.clear",
            json!({ "projectId": saved_project_id }),
        ));
        assert!(clear_response.ok);
        assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

        let remaining = dispatch(request("autosave.list", json!({})));
        assert!(remaining.ok);
        let remaining_entries = remaining.result.as_array().expect("remaining autosaves");
        assert_eq!(remaining_entries.len(), 1);
        assert_eq!(
            remaining_entries[0].get("projectId"),
            Some(&json!("untitled-1234"))
        );
    }

    #[test]
    fn autosave_rejects_invalid_project_id() {
        let home = home_dir().expect("home dir");
        let temp = TestDir::new_in(&home, "autosave-invalid-id");
        let _autosave_override =
            AutosaveStorageOverrideGuard::new(temp.join(".nextframe/autosave"));

        let response = dispatch(request(
            "autosave.write",
            json!({
                "projectId": "../escape",
                "timeline": minimal_timeline_json(),
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "invalid autosave project id");
    }

    #[test]
    fn resolve_write_path_expands_home_and_allows_missing_export_dirs() {
        let home = home_dir().expect("home dir");
        let result = resolve_write_path("~/Movies/NextFrame/render.mp4")
            .expect("resolve export path under home");
        assert_eq!(result, home.join("Movies/NextFrame/render.mp4"));
    }

    #[test]
    fn resolve_recorder_launch_plan_prefers_env_override() {
        let temp = TestDir::new("recorder-env");
        let env_binary = temp.join(recorder_binary_name());
        let release_binary = temp.join("release").join(recorder_binary_name());
        let manifest = temp.join("Cargo.toml");
        fs::create_dir_all(release_binary.parent().expect("release parent"))
            .expect("create release dir");
        fs::write(&env_binary, "").expect("write env binary");
        fs::write(&release_binary, "").expect("write release binary");
        fs::write(
            &manifest,
            "[package]\nname = \"recorder\"\nversion = \"0.1.0\"\n",
        )
        .expect("write manifest");

        let launcher =
            resolve_recorder_launch_plan_with(Some(env_binary.clone()), release_binary, manifest)
                .expect("resolve launcher");

        assert_eq!(launcher, RecorderLauncher::Binary(env_binary));
    }

    #[test]
    fn resolve_recorder_launch_plan_falls_back_to_cargo_manifest() {
        let temp = TestDir::new("recorder-cargo");
        let manifest = temp.join("Cargo.toml");
        fs::write(
            &manifest,
            "[package]\nname = \"recorder\"\nversion = \"0.1.0\"\n",
        )
        .expect("write manifest");

        let launcher =
            resolve_recorder_launch_plan_with(None, temp.join("missing"), manifest.clone())
                .expect("resolve cargo launcher");

        assert_eq!(launcher, RecorderLauncher::Cargo(manifest));
    }

    #[test]
    fn build_recorder_args_matches_expected_contract() {
        let args = build_recorder_args(
            "file:///tmp/runtime/web/index.html?record=true".to_string(),
            PathBuf::from("/tmp/output.mp4"),
            1920,
            1080,
            60,
            12.5,
        );

        assert_eq!(
            args,
            vec![
                "--url",
                "file:///tmp/runtime/web/index.html?record=true",
                "--out",
                "/tmp/output.mp4",
                "--width",
                "1920",
                "--height",
                "1080",
                "--fps",
                "60",
                "--duration",
                "12.5",
            ]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>()
        );
    }

    #[test]
    fn export_mux_audio_copies_video_when_no_audio_sources() {
        let temp = TestDir::new("mux-copy");
        let video_path = temp.join("video-only.mp4");
        let output_path = temp.join("final.mp4");
        fs::write(&video_path, "silent-video").expect("write source video");

        let response = dispatch(request(
            "export.muxAudio",
            json!({
                "videoPath": video_path.display().to_string(),
                "audioSources": [],
                "outputPath": output_path.display().to_string(),
            }),
        ));

        assert!(response.ok);
        assert_eq!(response.result.get("ok"), Some(&json!(true)));
        assert_eq!(
            fs::read_to_string(&output_path).expect("read copied output"),
            "silent-video"
        );
    }

    #[test]
    fn export_mux_audio_reports_missing_ffmpeg() {
        let _mock = MockFfmpegHarness::new();
        let temp = TestDir::new("mux-no-ffmpeg");
        let video_path = temp.join("video-only.mp4");
        let audio_path = temp.join("voiceover.mp3");
        let output_path = temp.join("final.mp4");
        fs::write(&video_path, "silent-video").expect("write source video");
        fs::write(&audio_path, "audio").expect("write source audio");

        let response = dispatch(request(
            "export.muxAudio",
            json!({
                "videoPath": video_path.display().to_string(),
                "audioSources": [
                    {
                        "path": audio_path.display().to_string(),
                        "startTime": 1.25,
                        "volume": 0.8
                    }
                ],
                "outputPath": output_path.display().to_string(),
            }),
        ));

        assert!(response.ok);
        assert_eq!(response.result.get("ok"), Some(&json!(false)));
        assert_eq!(
            response.result.get("error"),
            Some(&json!(
                "Install ffmpeg to export with audio. `brew install ffmpeg`"
            ))
        );
    }

    #[test]
    fn initialize_primes_ffmpeg_cache_before_mux_requests() {
        let mock = MockFfmpegHarness::new();
        mock.set_lookup_result(Ok(Some(PathBuf::from("/mock/bin/ffmpeg"))));
        initialize().expect("initialize bridge");

        {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.lookup_result = Ok(None);
        }
        mock.push_run_result(Ok(CommandOutput {
            success: true,
            stderr: String::new(),
        }));

        let temp = TestDir::new("mux-init-cache");
        let video_path = temp.join("video-only.mp4");
        let audio_path = temp.join("voiceover.mp3");
        let output_path = temp.join("final.mp4");
        fs::write(&video_path, "silent-video").expect("write source video");
        fs::write(&audio_path, "audio").expect("write source audio");

        let response = dispatch(request(
            "export.muxAudio",
            json!({
                "videoPath": video_path.display().to_string(),
                "audioSources": [
                    {
                        "path": audio_path.display().to_string(),
                        "startTime": 0,
                        "volume": 1
                    }
                ],
                "outputPath": output_path.display().to_string(),
            }),
        ));

        assert!(response.ok);
        assert_eq!(response.result.get("ok"), Some(&json!(true)));

        let invocations = mock.take_invocations();
        assert_eq!(invocations.len(), 1);
        assert_eq!(invocations[0].program, PathBuf::from("/mock/bin/ffmpeg"));
    }

    #[test]
    fn export_mux_audio_builds_expected_ffmpeg_command() {
        let mock = MockFfmpegHarness::new();
        mock.set_lookup_result(Ok(Some(PathBuf::from("/mock/bin/ffmpeg"))));
        mock.push_run_result(Ok(CommandOutput {
            success: true,
            stderr: String::new(),
        }));

        let temp = TestDir::new("mux-command");
        let video_path = temp.join("video-only.mp4");
        let audio_a = temp.join("dialog.mp3");
        let audio_b = temp.join("music.wav");
        let output_path = temp.join("final.mp4");
        fs::write(&video_path, "silent-video").expect("write source video");
        fs::write(&audio_a, "audio-a").expect("write source audio a");
        fs::write(&audio_b, "audio-b").expect("write source audio b");
        let video_path_string = fs::canonicalize(&video_path)
            .expect("canonicalize source video")
            .display()
            .to_string();
        let audio_a_string = fs::canonicalize(&audio_a)
            .expect("canonicalize source audio a")
            .display()
            .to_string();
        let audio_b_string = fs::canonicalize(&audio_b)
            .expect("canonicalize source audio b")
            .display()
            .to_string();
        let output_path_string = output_path.display().to_string();

        let response = dispatch(request(
            "export.muxAudio",
            json!({
                "videoPath": video_path_string.clone(),
                "audioSources": [
                    {
                        "path": audio_a_string.clone(),
                        "startTime": 0.5,
                        "volume": 1.0
                    },
                    {
                        "path": audio_b_string.clone(),
                        "startTime": 2.25,
                        "volume": 0.35
                    }
                ],
                "outputPath": output_path_string.clone(),
            }),
        ));

        assert!(response.ok);
        assert_eq!(response.result.get("ok"), Some(&json!(true)));

        let invocations = mock.take_invocations();
        assert_eq!(invocations.len(), 1);
        assert_eq!(
            invocations[0],
            FfmpegCommand {
                program: PathBuf::from("/mock/bin/ffmpeg"),
                args: vec![
                    "-y",
                    "-i",
                    &video_path_string,
                    "-i",
                    &audio_a_string,
                    "-i",
                    &audio_b_string,
                    "-filter_complex",
                    "[1:a]adelay=500:all=1,volume=1[a0];[2:a]adelay=2250:all=1,volume=0.35[a1];[a0][a1]amix=inputs=2:normalize=0[aout]",
                    "-map",
                    "0:v",
                    "-map",
                    "[aout]",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    &output_path_string,
                ]
                .into_iter()
                .map(|value| value.to_string())
                .collect(),
            }
        );
    }

    #[test]
    fn export_mux_audio_surfaces_ffmpeg_stderr() {
        let mock = MockFfmpegHarness::new();
        mock.set_lookup_result(Ok(Some(PathBuf::from("/mock/bin/ffmpeg"))));
        mock.push_run_result(Ok(CommandOutput {
            success: false,
            stderr: "ffmpeg stderr output".to_string(),
        }));

        let temp = TestDir::new("mux-stderr");
        let video_path = temp.join("video-only.mp4");
        let audio_path = temp.join("voiceover.mp3");
        let output_path = temp.join("final.mp4");
        fs::write(&video_path, "silent-video").expect("write source video");
        fs::write(&audio_path, "audio").expect("write source audio");

        let response = dispatch(request(
            "export.muxAudio",
            json!({
                "videoPath": video_path.display().to_string(),
                "audioSources": [
                    {
                        "path": audio_path.display().to_string(),
                        "startTime": 0,
                        "volume": 1
                    }
                ],
                "outputPath": output_path.display().to_string(),
            }),
        ));

        assert!(response.ok);
        assert_eq!(response.result.get("ok"), Some(&json!(false)));
        assert_eq!(
            response.result.get("error"),
            Some(&json!("ffmpeg stderr output"))
        );
    }

    #[test]
    fn build_ffmpeg_filter_complex_formats_delays_and_mix() {
        let filter = build_ffmpeg_filter_complex(&[
            super::AudioSource {
                path: PathBuf::from("/tmp/a.mp3"),
                start_time: 0.25,
                volume: 1.0,
            },
            super::AudioSource {
                path: PathBuf::from("/tmp/b.wav"),
                start_time: 1.5,
                volume: 0.4,
            },
        ]);

        assert_eq!(
            filter,
            "[1:a]adelay=250:all=1,volume=1[a0];[2:a]adelay=1500:all=1,volume=0.4[a1];[a0][a1]amix=inputs=2:normalize=0[aout]"
        );
    }

    struct MockFfmpegHarness {
        _guard: MutexGuard<'static, ()>,
    }

    impl MockFfmpegHarness {
        fn new() -> Self {
            let guard = MOCK_FFMPEG_TEST_LOCK
                .get_or_init(|| std::sync::Mutex::new(()))
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());

            {
                let mut state = mock_ffmpeg_state()
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                *state = MockFfmpegState::default();
            }
            reset_ffmpeg_path_cache_for_tests();

            Self { _guard: guard }
        }

        fn set_lookup_result(&self, result: Result<Option<PathBuf>, String>) {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.lookup_result = result;
            drop(state);
            reset_ffmpeg_path_cache_for_tests();
        }

        fn push_run_result(&self, result: Result<CommandOutput, String>) {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.runs.push_back(result);
        }

        fn take_invocations(&self) -> Vec<FfmpegCommand> {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            std::mem::take(&mut state.invocations)
        }
    }

    impl Drop for MockFfmpegHarness {
        fn drop(&mut self) {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *state = MockFfmpegState::default();
            reset_ffmpeg_path_cache_for_tests();
        }
    }

    fn request(method: &str, params: Value) -> Request {
        Request {
            id: format!("req-{method}"),
            method: method.to_string(),
            params,
        }
    }

    fn assert_error_contains(error: &Option<String>, expected: &str) {
        let error = error.as_deref().expect("response should include an error");
        assert!(
            error.contains(expected),
            "expected '{error}' to contain '{expected}'"
        );
    }

    fn disallowed_absolute_path() -> String {
        if cfg!(windows) {
            "C:\\Windows\\system32\\drivers\\etc\\hosts".to_string()
        } else {
            "/etc/passwd".to_string()
        }
    }

    fn absolute_write_rejection_path() -> String {
        if cfg!(windows) {
            "C:\\Windows\\system32\\drivers\\etc\\hosts".to_string()
        } else {
            "/etc/hosts".to_string()
        }
    }

    fn disallowed_dir_path() -> String {
        if cfg!(windows) {
            "C:\\Windows\\System32".to_string()
        } else {
            "/etc".to_string()
        }
    }

    fn minimal_timeline_json() -> Value {
        json!({
            "version": 1,
            "metadata": {
                "name": "Test Timeline",
                "fps": 30,
                "width": 1920,
                "height": 1080,
                "durationMs": 1000
            },
            "tracks": []
        })
    }

    struct RecentStorageOverrideGuard {
        _lock: MutexGuard<'static, ()>,
    }

    impl RecentStorageOverrideGuard {
        fn new(path: PathBuf) -> Self {
            let lock = recent_storage_test_lock()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            set_recent_storage_path_override_for_tests(Some(path));
            Self { _lock: lock }
        }
    }

    impl Drop for RecentStorageOverrideGuard {
        fn drop(&mut self) {
            set_recent_storage_path_override_for_tests(None);
        }
    }

    struct AutosaveStorageOverrideGuard {
        _lock: MutexGuard<'static, ()>,
    }

    impl AutosaveStorageOverrideGuard {
        fn new(path: PathBuf) -> Self {
            let lock = autosave_storage_test_lock()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            set_autosave_storage_path_override_for_tests(Some(path));
            Self { _lock: lock }
        }
    }

    impl Drop for AutosaveStorageOverrideGuard {
        fn drop(&mut self) {
            set_autosave_storage_path_override_for_tests(None);
        }
    }

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(label: &str) -> Self {
            Self::new_in(&std::env::temp_dir(), label)
        }

        fn new_in(base: &Path, label: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = base.join(format!(
                "nextframe-bridge-{label}-{}-{unique}",
                process::id()
            ));

            fs::create_dir_all(&path).expect("create temp test dir");
            Self { path }
        }

        fn join(&self, child: &str) -> PathBuf {
            self.path.join(child)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            if self.path.exists() {
                let _ = remove_dir_all_if_present(&self.path);
            }
        }
    }

    fn remove_dir_all_if_present(path: &Path) -> std::io::Result<()> {
        if path.exists() {
            fs::remove_dir_all(path)?;
        }

        Ok(())
    }

    #[cfg(unix)]
    fn create_file_symlink(target: &Path, link: &Path) -> io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_file_symlink(target: &Path, link: &Path) -> io::Result<()> {
        std::os::windows::fs::symlink_file(target, link)
    }

    #[cfg(unix)]
    fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
        std::os::windows::fs::symlink_dir(target, link)
    }
}
