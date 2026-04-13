use std::cmp::Ordering;
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

#[derive(Debug, Clone, serde::Deserialize)]
pub struct VideoLayerInfo {
    pub src: String,
    pub x: String,
    pub y: String,
    pub w: String,
    pub h: String,
    pub start: f64,
    pub dur: f64,
}

pub struct SegmentSummary {
    pub path: PathBuf,
    pub total_frames: usize,
    pub skipped_frames: usize,
    pub page_duration_sec: Option<f64>,
    pub audio_path: Option<PathBuf>,
    pub video_layers: Vec<VideoLayerInfo>,
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
        files.sort_by(compare_frame_paths);
        files
    } else {
        cli.frames
            .iter()
            .map(|path| absolute_path(path.as_path()))
            .collect::<Result<Vec<_>, _>>()?
    };
    if files.is_empty() {
        return if cli.dir.is_some() {
            Ok(Vec::new())
        } else {
            Err("no frame files were provided".into())
        };
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
        return if cli.dir.is_some() {
            Ok(Vec::new())
        } else {
            Err("none of the requested frame files exist".into())
        };
    }
    let files = files
        .into_iter()
        .map(|path| path.canonicalize().unwrap_or(path))
        .collect();
    Ok(files)
}

fn compare_frame_paths(left: &PathBuf, right: &PathBuf) -> Ordering {
    match (frame_stem_number(left), frame_stem_number(right)) {
        (Some(left_num), Some(right_num)) => left_num.cmp(&right_num).then_with(|| left.cmp(right)),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => left.cmp(right),
    }
}

fn frame_stem_number(path: &Path) -> Option<usize> {
    let stem = path.file_stem()?.to_str()?;
    let start = stem.find(|ch: char| ch.is_ascii_digit())?;
    let digits = stem[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse().ok()
}

pub fn detect_root(frame_files: &[PathBuf]) -> Result<PathBuf, String> {
    let first = frame_files
        .first()
        .ok_or("cannot determine root without frame files")?;
    let mut root = first
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|err| {
            format!(
                "failed to canonicalize frame parent {}: {err}",
                first.display()
            )
        })?;
    let parent_dirs = frame_files
        .iter()
        .map(|path| {
            path.parent()
                .unwrap_or_else(|| Path::new("."))
                .canonicalize()
                .map_err(|err| {
                    format!(
                        "failed to canonicalize frame parent {}: {err}",
                        path.display()
                    )
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    while !parent_dirs.iter().all(|dir| dir.starts_with(&root)) {
        root = root
            .parent()
            .ok_or_else(|| "failed to determine common parent for frame files".to_string())?
            .to_path_buf();
    }
    Ok(root)
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use std::fs;

    fn test_args(dir: Option<PathBuf>, frames: Vec<PathBuf>) -> CommonArgs {
        CommonArgs {
            frames,
            dir,
            out: PathBuf::from("out.mp4"),
            fps: 30,
            crf: 23,
            dpr: 1.0,
            jobs: None,
            no_skip: false,
            skip_aggressive: false,
            headed: false,
            width: 1280.0,
            height: 720.0,
            parallel: None,
            frame_range: None,
            render_scale: 1.0,
            disable_audio: false,
        }
    }

    #[test]
    fn collect_frame_files_returns_sorted_html_files_from_dir() -> Result<(), String> {
        let dir = crate::util::create_temp_dir()?;
        let a = dir.join("a.html");
        let b = dir.join("b.html");
        fs::write(&b, "<html></html>").map_err(|err| err.to_string())?;
        fs::write(&a, "<html></html>").map_err(|err| err.to_string())?;
        fs::write(dir.join("ignore.txt"), "noop").map_err(|err| err.to_string())?;

        let files = collect_frame_files(&test_args(Some(dir.clone()), Vec::new()))?;

        assert_eq!(
            files,
            vec![a.canonicalize().unwrap(), b.canonicalize().unwrap()]
        );

        fs::remove_dir_all(dir).map_err(|err| err.to_string())?;
        Ok(())
    }

    #[test]
    fn collect_frame_files_returns_empty_for_empty_dir() -> Result<(), String> {
        let dir = crate::util::create_temp_dir()?;

        let files = collect_frame_files(&test_args(Some(dir.clone()), Vec::new()))?;

        assert!(files.is_empty());

        fs::remove_dir_all(dir).map_err(|err| err.to_string())?;
        Ok(())
    }

    #[test]
    fn detect_root_finds_common_parent() -> Result<(), String> {
        let root = crate::util::create_temp_dir()?.join("frames-root");
        let left = root.join("section-a").join("deck-1").join("slides");
        let right = root.join("section-b").join("deck-2").join("slides");
        fs::create_dir_all(&left).map_err(|err| err.to_string())?;
        fs::create_dir_all(&right).map_err(|err| err.to_string())?;

        let first = left.join("001.html");
        let second = right.join("002.html");
        fs::write(&first, "<html></html>").map_err(|err| err.to_string())?;
        fs::write(&second, "<html></html>").map_err(|err| err.to_string())?;

        let detected = detect_root(&[first, second])?;

        assert_eq!(detected, root.canonicalize().unwrap());

        fs::remove_dir_all(root).map_err(|err| err.to_string())?;
        Ok(())
    }
}
