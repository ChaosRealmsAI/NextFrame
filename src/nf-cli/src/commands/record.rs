//! `nf record` — build source bundles when needed, invoke nf-recorder, optionally verify pixels.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, bail, Context, Result};
use nf_recorder::{PipelineRecorder, RecordSpec, Recorder};
use serde_json::{json, Value};

use crate::commands::CommandOutput;

pub struct RecordOptions {
    pub bundle: PathBuf,
    pub out: PathBuf,
    pub duration_s: f64,
    pub fps: u32,
    pub resolution: String,
    pub workers: usize,
    pub verify_pixels: bool,
    pub dry_run: bool,
}

pub fn run(options: RecordOptions) -> Result<CommandOutput> {
    validate_options(&options)?;
    let resolution = parse_resolution(&options.resolution)?;
    let plan = build_plan(&options, resolution)?;
    if options.dry_run {
        return Ok(CommandOutput::json(json!({
            "ok": true,
            "command": "record",
            "mode": "dry-run",
            "bundle": plan.bundle_path.display().to_string(),
            "out": options.out.display().to_string(),
            "params": {
                "duration": options.duration_s,
                "fps": options.fps,
                "resolution": format!("{}x{}", resolution.0, resolution.1),
                "workers": options.workers,
                "verify_pixels": options.verify_pixels,
            },
            "planned_command": plan.record_command,
            "auto_build": plan.build_step,
        })));
    }

    let bundle_path = match plan.build_step.as_ref() {
        Some(step) => run_auto_build(step)?,
        None => plan.bundle_path.clone(),
    };
    if !bundle_path.is_file() {
        bail!("bundle not found: {}", bundle_path.display());
    }

    let start = Instant::now();
    let mut recorder = PipelineRecorder::new();
    let handle = recorder.record(RecordSpec {
        bundle_path: bundle_path.clone(),
        out_path: options.out.clone(),
        duration_s: options.duration_s,
        fps: options.fps,
        resolution,
        worker_count: options.workers,
    })?;
    let duration_ms = start.elapsed().as_millis();

    let verification = if options.verify_pixels {
        match verify_pixels(&options.out, resolution)? {
            PixelVerification::Passed {
                frame,
                center_avg_rgb,
            } => CommandOutput::json(json!({
                "ok": true,
                "command": "record",
                "bundle": bundle_path.display().to_string(),
                "output": handle.out_path.display().to_string(),
                "frames": handle.total_frames,
                "duration_ms": duration_ms,
                "pixel_verify": {
                    "status": "passed",
                    "frame": frame,
                    "center_avg_rgb": center_avg_rgb,
                },
                "auto_build": plan.build_step,
            })),
            PixelVerification::Skipped { reason } => CommandOutput::json(json!({
                "ok": true,
                "command": "record",
                "bundle": bundle_path.display().to_string(),
                "output": handle.out_path.display().to_string(),
                "frames": handle.total_frames,
                "duration_ms": duration_ms,
                "pixel_verify": "skipped",
                "reason": reason,
                "auto_build": plan.build_step,
            })),
            PixelVerification::Failed {
                reason,
                frame,
                center_avg_rgb,
            } => CommandOutput::json_with_exit(
                json!({
                    "ok": false,
                    "command": "record",
                    "bundle": bundle_path.display().to_string(),
                    "output": handle.out_path.display().to_string(),
                    "frames": handle.total_frames,
                    "duration_ms": duration_ms,
                    "pixel_verify": "failed",
                    "reason": reason,
                    "frame": frame,
                    "center_avg_rgb": center_avg_rgb,
                    "auto_build": plan.build_step,
                }),
                1,
            ),
        }
    } else {
        CommandOutput::json(json!({
            "ok": true,
            "command": "record",
            "bundle": bundle_path.display().to_string(),
            "output": handle.out_path.display().to_string(),
            "frames": handle.total_frames,
            "duration_ms": duration_ms,
            "pixel_verify": "not-requested",
            "auto_build": plan.build_step,
        }))
    };

    Ok(verification)
}

#[derive(Clone)]
struct RecordPlan {
    bundle_path: PathBuf,
    record_command: Vec<String>,
    build_step: Option<BuildStep>,
}

#[derive(Clone, serde::Serialize)]
struct BuildStep {
    source: String,
    output: String,
    command: Vec<String>,
}

enum PixelVerification {
    Passed {
        frame: u32,
        center_avg_rgb: [f64; 3],
    },
    Skipped {
        reason: &'static str,
    },
    Failed {
        reason: &'static str,
        frame: u32,
        center_avg_rgb: [f64; 3],
    },
}

fn validate_options(options: &RecordOptions) -> Result<()> {
    if options.duration_s <= 0.0 {
        bail!("duration must be > 0");
    }
    if options.fps == 0 {
        bail!("fps must be > 0");
    }
    if options.workers == 0 {
        bail!("workers must be > 0");
    }
    if !options.bundle.exists() {
        bail!("bundle not found: {}", options.bundle.display());
    }
    Ok(())
}

fn parse_resolution(text: &str) -> Result<(u32, u32)> {
    let (width, height) = text
        .split_once('x')
        .with_context(|| format!("invalid --resolution {text}, expected <width>x<height>"))?;
    let width = width.parse::<u32>().context("invalid resolution width")?;
    let height = height.parse::<u32>().context("invalid resolution height")?;
    if width == 0 || height == 0 {
        bail!("resolution dimensions must be > 0");
    }
    Ok((width, height))
}

fn build_plan(options: &RecordOptions, resolution: (u32, u32)) -> Result<RecordPlan> {
    let bundle_is_source = options.bundle.extension().and_then(|ext| ext.to_str()) == Some("json");
    let bundle_path = if bundle_is_source {
        planned_bundle_path(&options.bundle)?
    } else {
        options.bundle.clone()
    };

    let record_command = vec![
        String::from("nf-recorder::PipelineRecorder::record"),
        bundle_path.display().to_string(),
        options.out.display().to_string(),
        format!("duration={}", options.duration_s),
        format!("fps={}", options.fps),
        format!("resolution={}x{}", resolution.0, resolution.1),
        format!("workers={}", options.workers),
    ];
    let build_step = if bundle_is_source {
        Some(BuildStep {
            source: options.bundle.display().to_string(),
            output: bundle_path.display().to_string(),
            command: vec![
                String::from("cargo"),
                String::from("run"),
                String::from("-p"),
                String::from("nf-cli"),
                String::from("--release"),
                String::from("--"),
                String::from("build"),
                options.bundle.display().to_string(),
                String::from("-o"),
                bundle_path.display().to_string(),
            ],
        })
    } else {
        None
    };

    Ok(RecordPlan {
        bundle_path,
        record_command,
        build_step,
    })
}

fn planned_bundle_path(source: &Path) -> Result<PathBuf> {
    let file_stem = source
        .file_stem()
        .map(OsString::from)
        .unwrap_or_else(|| OsString::from("bundle"));
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock before unix epoch")?
        .as_nanos();
    let repo_root = repo_root()?;
    Ok(repo_root.join("out").join(format!(
        "{}-{nonce}.bundle.html",
        file_stem.to_string_lossy()
    )))
}

fn run_auto_build(step: &BuildStep) -> Result<PathBuf> {
    let repo_root = repo_root()?;
    let output = Command::new("cargo")
        .current_dir(&repo_root)
        .args(["run", "-p", "nf-cli", "--release", "--", "build"])
        .arg(&step.source)
        .arg("-o")
        .arg(&step.output)
        .output()
        .context("spawn cargo build for record auto-build")?;

    let stdout = String::from_utf8(output.stdout).context("build stdout was not utf-8")?;
    let stderr = String::from_utf8(output.stderr).context("build stderr was not utf-8")?;
    if !output.status.success() {
        let payload = parse_json_output(&stderr)
            .or_else(|_| parse_json_output(&stdout))
            .context("parse nf build JSON error output")?;
        let error = payload
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("nf build failed");
        bail!("{error}; stderr={stderr}");
    }
    let payload = parse_json_output(&stdout).context("parse nf build JSON output")?;

    let out_path = payload
        .get("output")
        .and_then(Value::as_str)
        .context("nf build JSON missing output path")?;
    Ok(PathBuf::from(out_path))
}

fn verify_pixels(path: &Path, resolution: (u32, u32)) -> Result<PixelVerification> {
    if !binary_exists("ffmpeg")? {
        return Ok(PixelVerification::Skipped {
            reason: "ffmpeg not installed",
        });
    }

    let frame = extract_rgb_frame(path, 15, resolution)?;
    let center_avg_rgb = center_avg(&frame, resolution.0 as usize, resolution.1 as usize, 100)?;
    let near_white = center_avg_rgb.iter().all(|channel| *channel >= 245.0);
    if near_white {
        return Ok(PixelVerification::Failed {
            reason: "center region is near-white",
            frame: 15,
            center_avg_rgb,
        });
    }

    Ok(PixelVerification::Passed {
        frame: 15,
        center_avg_rgb,
    })
}

fn binary_exists(name: &str) -> Result<bool> {
    match Command::new(name).arg("-version").output() {
        Ok(_) => Ok(true),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(anyhow!("failed to probe {name}: {err}")),
    }
}

fn extract_rgb_frame(path: &Path, frame_number: u32, resolution: (u32, u32)) -> Result<Vec<u8>> {
    let filter = format!("select=eq(n\\,{frame_number}),format=rgb24");
    let output = Command::new("ffmpeg")
        .args(["-v", "error", "-i"])
        .arg(path)
        .args([
            "-vf", &filter, "-vframes", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ])
        .output()
        .with_context(|| format!("run ffmpeg on {}", path.display()))?;
    if !output.status.success() {
        bail!("ffmpeg failed: {}", String::from_utf8_lossy(&output.stderr));
    }
    let expected_len = resolution.0 as usize * resolution.1 as usize * 3;
    if output.stdout.len() != expected_len {
        bail!(
            "ffmpeg produced {} bytes for frame {}, expected {}",
            output.stdout.len(),
            frame_number,
            expected_len
        );
    }
    Ok(output.stdout)
}

fn center_avg(rgb: &[u8], width: usize, height: usize, half_span: usize) -> Result<[f64; 3]> {
    if rgb.len() != width.saturating_mul(height).saturating_mul(3) {
        bail!("RGB frame size does not match dimensions");
    }
    let cx = width / 2;
    let cy = height / 2;
    let x0 = cx.saturating_sub(half_span);
    let x1 = (cx + half_span).min(width);
    let y0 = cy.saturating_sub(half_span);
    let y1 = (cy + half_span).min(height);
    let mut sums = [0_u64; 3];
    let mut pixels = 0_u64;
    for y in y0..y1 {
        for x in x0..x1 {
            let index = (y * width + x) * 3;
            sums[0] += rgb[index] as u64;
            sums[1] += rgb[index + 1] as u64;
            sums[2] += rgb[index + 2] as u64;
            pixels += 1;
        }
    }
    if pixels == 0 {
        bail!("center region contained zero pixels");
    }
    Ok([
        sums[0] as f64 / pixels as f64,
        sums[1] as f64 / pixels as f64,
        sums[2] as f64 / pixels as f64,
    ])
}

fn parse_json_output(stdout: &str) -> Result<Value> {
    let line = stdout
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .context("stdout did not contain JSON")?;
    serde_json::from_str(line).context("parse command JSON")
}

fn repo_root() -> Result<PathBuf> {
    fs::canonicalize(Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."))
        .context("resolve repo root")
}
