use std::fs;
use std::path::{Path, PathBuf};

use crate::CommonArgs;
use crate::encoder::probe_audio_duration;
use crate::parser::{FrameMetadata, parse_frame_file};
use crate::util::absolute_path;

pub struct SegmentPlan {
    pub metadata: FrameMetadata,
    pub audio_duration_sec: f64,
    pub effective_duration_sec: f64,
}

pub struct SegmentSummary {
    pub path: PathBuf,
    pub total_frames: usize,
    pub skipped_frames: usize,
}

pub fn collect_frame_files(cli: &CommonArgs) -> Result<Vec<PathBuf>, String> {
    let mut files = if let Some(dir) = &cli.dir {
        let dir = absolute_path(dir)?;
        let mut files = fs::read_dir(&dir)
            .map_err(|err| format!("failed to read {}: {err}", dir.display()))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("html"))
            .collect::<Vec<_>>();
        files.sort();
        files
    } else {
        cli.frames
            .iter()
            .map(|path| absolute_path(path.as_path()))
            .collect::<Result<Vec<_>, _>>()?
    };
    if files.is_empty() {
        return Err("no frame files were provided".into());
    }
    if cli.dir.is_some() {
        files.retain(|path| path.exists());
    } else {
        for path in &files {
            if !path.exists() {
                return Err(format!("frame file not found: {}", path.display()));
            }
        }
    }
    if files.is_empty() {
        return Err("none of the requested frame files exist".into());
    }
    let files = files
        .into_iter()
        .map(|path| path.canonicalize().unwrap_or(path))
        .collect();
    Ok(files)
}

pub fn detect_root(frame_files: &[PathBuf]) -> Result<PathBuf, String> {
    let first = frame_files
        .first()
        .ok_or("cannot determine root without frame files")?;
    let root = first
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .unwrap_or_else(|| first.parent().unwrap_or_else(|| Path::new(".")));
    root.canonicalize()
        .map_err(|err| format!("failed to canonicalize root {}: {err}", root.display()))
}

pub fn build_segment_plans(frame_files: &[PathBuf]) -> Result<Vec<SegmentPlan>, String> {
    frame_files
        .iter()
        .map(|frame_path| {
            let metadata = parse_frame_file(frame_path)?;
            for warning in &metadata.warnings {
                trace_log!("  warn {}: {}", metadata.html_path.display(), warning);
            }
            let audio_duration_sec = match probe_audio_duration(metadata.audio_path.as_deref()) {
                Ok(dur) => dur,
                Err(err) => {
                    trace_log!("  warn {}: {err}", metadata.html_path.display());
                    0.0
                }
            };
            let fallback_duration = metadata
                .subtitles
                .last()
                .map(|subtitle| subtitle.end)
                .unwrap_or(10.0);
            let effective_duration_sec = if audio_duration_sec > 0.0 {
                audio_duration_sec
            } else {
                fallback_duration
            };
            Ok(SegmentPlan {
                metadata,
                audio_duration_sec,
                effective_duration_sec,
            })
        })
        .collect()
}
