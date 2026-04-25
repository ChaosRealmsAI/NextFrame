use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{Value, json};

use crate::commands::{VerifyExportArgs, print_json};
use crate::errors::NfError;

#[derive(Debug, Clone)]
struct ClipWindow {
    id: String,
    start_ms: u64,
    end_ms: u64,
}

#[derive(Debug, Clone, Copy)]
struct PixelSummary {
    width: u32,
    height: u32,
    magenta_ratio: f64,
    near_black_ratio: f64,
}

pub fn run(args: VerifyExportArgs) -> Result<(), NfError> {
    if !args.source.exists() {
        return Err(NfError::ValidationFailed(format!(
            "source not found: {}",
            args.source.display()
        )));
    }
    if !args.video.exists() {
        return Err(NfError::ValidationFailed(format!(
            "video not found: {}",
            args.video.display()
        )));
    }
    nf_recorder::validate_render_source_file(&args.source)
        .map_err(|err| NfError::ValidationFailed(format!("invalid source: {err}")))?;
    let source_text =
        fs::read_to_string(&args.source).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    let source: Value = serde_json::from_str(&source_text)?;
    let windows = collect_clip_windows(&source);
    if windows.is_empty() {
        return Err(NfError::ValidationFailed(
            "source has no visual clip windows".to_string(),
        ));
    }
    let ffmpeg = resolve_ffmpeg().ok_or_else(|| {
        NfError::ValidationFailed("ffmpeg not found; cannot sample exported frames".to_string())
    })?;
    let frames_dir = frames_dir_for_report(&args.out);
    fs::create_dir_all(&frames_dir).map_err(|err| NfError::StorageFailed(err.to_string()))?;

    let mut checks = Vec::new();
    let mut ok = true;
    for window in windows {
        let t_ms = midpoint_ms(window.start_ms, window.end_ms);
        let frame_path =
            frames_dir.join(format!("{}-{}ms.png", sanitize_file_name(&window.id), t_ms));
        extract_frame(&ffmpeg, &args.video, t_ms, &frame_path)?;
        let pixels = read_pixel_summary(&frame_path)?;
        let mut assertions = Vec::new();
        let magenta_ok = pixels.magenta_ratio < 0.20;
        if !magenta_ok {
            ok = false;
        }
        assertions.push(json!({
            "name": "not-magenta-background",
            "pass": magenta_ok,
            "actual": pixels.magenta_ratio,
            "expected": "< 0.20"
        }));
        let not_blank = pixels.near_black_ratio < 0.98;
        if !not_blank {
            ok = false;
        }
        assertions.push(json!({
            "name": "not-blank-frame",
            "pass": not_blank,
            "actual": pixels.near_black_ratio,
            "expected": "< 0.98"
        }));
        checks.push(json!({
            "clip": window.id,
            "t_ms": t_ms,
            "frame": frame_path.display().to_string(),
            "status": if magenta_ok && not_blank { "pass" } else { "fail" },
            "pixels": {
                "width": pixels.width,
                "height": pixels.height,
                "magenta_ratio": pixels.magenta_ratio,
                "near_black_ratio": pixels.near_black_ratio
            },
            "assertions": assertions
        }));
    }

    let report = json!({
        "schema_version": "nf.verify_export_report.v1",
        "ok": ok,
        "source": args.source.display().to_string(),
        "video": args.video.display().to_string(),
        "frames_dir": frames_dir.display().to_string(),
        "checks": checks
    });
    if let Some(parent) = args
        .out
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    }
    fs::write(&args.out, serde_json::to_vec_pretty(&report)?)
        .map_err(|err| NfError::StorageFailed(err.to_string()))?;
    print_json(&report)?;
    if ok {
        Ok(())
    } else {
        Err(NfError::ValidationFailed(format!(
            "export visual verification failed: {}",
            args.out.display()
        )))
    }
}

fn collect_clip_windows(source: &Value) -> Vec<ClipWindow> {
    let mut by_clip = BTreeMap::<String, (u64, u64)>::new();
    let Some(tracks) = source.get("tracks").and_then(Value::as_array) else {
        return Vec::new();
    };
    for track in tracks {
        if track.get("kind").and_then(Value::as_str) == Some("audio") {
            continue;
        }
        let track_id = track.get("id").and_then(Value::as_str).unwrap_or("track");
        let Some(clips) = track.get("clips").and_then(Value::as_array) else {
            continue;
        };
        for clip in clips {
            let begin = clip
                .get("begin_ms")
                .or_else(|| clip.get("begin"))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let end = clip
                .get("end_ms")
                .or_else(|| clip.get("end"))
                .and_then(Value::as_u64)
                .unwrap_or(begin);
            if end <= begin {
                continue;
            }
            let clip_id = clip
                .pointer("/params/track/clip")
                .and_then(Value::as_str)
                .map(ToString::to_string)
                .or_else(|| {
                    track_id
                        .split_once('.')
                        .map(|(prefix, _)| prefix.to_string())
                })
                .unwrap_or_else(|| track_id.to_string());
            by_clip
                .entry(clip_id)
                .and_modify(|window| {
                    window.0 = window.0.min(begin);
                    window.1 = window.1.max(end);
                })
                .or_insert((begin, end));
        }
    }
    let mut windows = by_clip
        .into_iter()
        .map(|(id, (start_ms, end_ms))| ClipWindow {
            id,
            start_ms,
            end_ms,
        })
        .collect::<Vec<_>>();
    windows.sort_by_key(|window| (window.start_ms, window.end_ms, window.id.clone()));
    windows
}

fn midpoint_ms(start_ms: u64, end_ms: u64) -> u64 {
    start_ms.saturating_add((end_ms.saturating_sub(start_ms)) / 2)
}

fn frames_dir_for_report(report: &Path) -> PathBuf {
    let stem = report
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("verify-export");
    report.with_file_name(format!("{stem}-frames"))
}

fn sanitize_file_name(raw: &str) -> String {
    raw.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn resolve_ffmpeg() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("FFMPEG") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }
    std::env::var_os("PATH")?
        .to_string_lossy()
        .split(':')
        .map(|dir| Path::new(dir).join("ffmpeg"))
        .find(|candidate| candidate.exists())
}

fn extract_frame(ffmpeg: &Path, video: &Path, t_ms: u64, out: &Path) -> Result<(), NfError> {
    let seconds = format!("{:.3}", t_ms as f64 / 1000.0);
    let output = Command::new(ffmpeg)
        .arg("-y")
        .arg("-ss")
        .arg(seconds)
        .arg("-i")
        .arg(video)
        .arg("-frames:v")
        .arg("1")
        .arg(out)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|err| NfError::StorageFailed(format!("spawn ffmpeg: {err}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(NfError::ValidationFailed(format!(
            "ffmpeg frame extraction failed: {}",
            stderr.trim()
        )));
    }
    Ok(())
}

fn read_pixel_summary(path: &Path) -> Result<PixelSummary, NfError> {
    let file = fs::File::open(path).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    let decoder = png::Decoder::new(file);
    let mut reader = decoder
        .read_info()
        .map_err(|err| NfError::ValidationFailed(format!("decode PNG header: {err}")))?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut buf)
        .map_err(|err| NfError::ValidationFailed(format!("decode PNG frame: {err}")))?;
    let bytes = &buf[..info.buffer_size()];
    let mut total = 0_u64;
    let mut magenta = 0_u64;
    let mut near_black = 0_u64;
    match info.color_type {
        png::ColorType::Rgb => {
            for px in bytes.chunks_exact(3) {
                count_pixel(
                    px[0],
                    px[1],
                    px[2],
                    &mut total,
                    &mut magenta,
                    &mut near_black,
                );
            }
        }
        png::ColorType::Rgba => {
            for px in bytes.chunks_exact(4) {
                count_pixel(
                    px[0],
                    px[1],
                    px[2],
                    &mut total,
                    &mut magenta,
                    &mut near_black,
                );
            }
        }
        png::ColorType::Grayscale => {
            for value in bytes {
                count_pixel(
                    *value,
                    *value,
                    *value,
                    &mut total,
                    &mut magenta,
                    &mut near_black,
                );
            }
        }
        png::ColorType::GrayscaleAlpha => {
            for px in bytes.chunks_exact(2) {
                count_pixel(
                    px[0],
                    px[0],
                    px[0],
                    &mut total,
                    &mut magenta,
                    &mut near_black,
                );
            }
        }
        png::ColorType::Indexed => {
            return Err(NfError::ValidationFailed(
                "indexed PNG frames are unsupported".to_string(),
            ));
        }
    }
    let total = total.max(1) as f64;
    Ok(PixelSummary {
        width: info.width,
        height: info.height,
        magenta_ratio: magenta as f64 / total,
        near_black_ratio: near_black as f64 / total,
    })
}

fn count_pixel(r: u8, g: u8, b: u8, total: &mut u64, magenta: &mut u64, near_black: &mut u64) {
    *total += 1;
    if r > 200 && g < 90 && b > 180 {
        *magenta += 1;
    }
    if r < 8 && g < 8 && b < 8 {
        *near_black += 1;
    }
}
