use std::path::PathBuf;
use std::process::Command;

use anyhow::{bail, Context, Result};
use nf_recorder::{PipelineRecorder, RecordSpec, Recorder};
use serde_json::json;

fn main() -> Result<()> {
    let cli = Cli::parse()?;
    let mut recorder = PipelineRecorder::new().with_progress_sink(|progress| {
        println!(
            "{}",
            serde_json::to_string(&json!({
                "kind": "progress",
                "frames_done": progress.frames_done,
                "total": progress.total,
                "fps_observed": progress.fps_observed,
            }))?
        );
        Ok(())
    });
    let handle = recorder.record(RecordSpec {
        bundle_path: cli.bundle,
        out_path: cli.out.clone(),
        duration_s: cli.duration,
        fps: cli.fps,
        resolution: cli.size,
        worker_count: cli.worker_count,
    })?;

    let verify = if cli.verify {
        Some(run_verify(&cli.out, cli.size)?)
    } else {
        None
    };
    println!(
        "{}",
        serde_json::to_string(&json!({
            "kind": "done",
            "out_path": handle.out_path,
            "total_frames": handle.total_frames,
            "verify": verify,
        }))?
    );
    Ok(())
}

struct Cli {
    bundle: PathBuf,
    out: PathBuf,
    duration: f64,
    fps: u32,
    size: (u32, u32),
    worker_count: usize,
    verify: bool,
}

impl Cli {
    fn parse() -> Result<Self> {
        let mut bundle = None;
        let mut out = None;
        let mut duration = 1.0_f64;
        let mut fps = 30_u32;
        let mut size = (1280_u32, 720_u32);
        let mut worker_count = 6_usize;
        let mut verify = false;
        let args = std::env::args().skip(1).collect::<Vec<_>>();
        let mut index = 0usize;
        while index < args.len() {
            match args[index].as_str() {
                "--bundle" => {
                    bundle = Some(read_value(&args, &mut index, "--bundle")?.into());
                }
                "--out" => {
                    out = Some(read_value(&args, &mut index, "--out")?.into());
                }
                "--duration" => {
                    duration = read_value(&args, &mut index, "--duration")?
                        .parse()
                        .context("invalid --duration")?;
                }
                "--fps" => {
                    fps = read_value(&args, &mut index, "--fps")?
                        .parse()
                        .context("invalid --fps")?;
                }
                "--size" => {
                    size = parse_size(read_value(&args, &mut index, "--size")?)?;
                }
                "--workers" => {
                    worker_count = read_value(&args, &mut index, "--workers")?
                        .parse()
                        .context("invalid --workers")?;
                }
                "--verify" => {
                    verify = true;
                }
                other => bail!("unknown argument: {other}"),
            }
            index += 1;
        }
        Ok(Self {
            bundle: bundle.context("--bundle is required")?,
            out: out.context("--out is required")?,
            duration,
            fps,
            size,
            worker_count,
            verify,
        })
    }
}

fn read_value<'a>(args: &'a [String], index: &mut usize, flag: &str) -> Result<&'a str> {
    *index += 1;
    args.get(*index)
        .map(String::as_str)
        .with_context(|| format!("missing value for {flag}"))
}

fn parse_size(text: &str) -> Result<(u32, u32)> {
    let (width, height) = text
        .split_once('x')
        .with_context(|| format!("invalid size {text}, expected <width>x<height>"))?;
    Ok((width.parse()?, height.parse()?))
}

fn run_verify(path: &PathBuf, size: (u32, u32)) -> Result<serde_json::Value> {
    let stream_info = ffprobe_stream(path)?;
    let frame_0 = extract_rgb_frame(path, 0, size)?;
    let frame_14 = extract_rgb_frame(path, 14, size)?;
    let frame_15 = extract_rgb_frame(path, 15, size)?;
    let avg = center_avg(&frame_15, size.0 as usize, size.1 as usize, 100)?;
    let diff_ratio = diff_ratio(&frame_0, &frame_14)?;
    if avg[0] <= 80.0 && avg[1] <= 80.0 && avg[2] <= 80.0 {
        bail!("pixel verification failed: center region washed out");
    }
    if diff_ratio <= 0.05 {
        bail!("pixel verification failed: frame animation diff too small");
    }
    Ok(json!({
        "stream": stream_info,
        "center_avg_rgb": avg,
        "diff_ratio_frame0_frame14": diff_ratio,
    }))
}

fn ffprobe_stream(path: &PathBuf) -> Result<serde_json::Value> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,profile,pix_fmt,color_primaries,color_transfer",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .with_context(|| format!("run ffprobe on {}", path.display()))?;
    if !output.status.success() {
        bail!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(serde_json::from_slice(&output.stdout)?)
}

fn extract_rgb_frame(path: &PathBuf, frame_number: u32, size: (u32, u32)) -> Result<Vec<u8>> {
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
    let expected_len = size.0 as usize * size.1 as usize * 3;
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

fn diff_ratio(a: &[u8], b: &[u8]) -> Result<f64> {
    if a.len() != b.len() || !a.len().is_multiple_of(3) {
        bail!("diff inputs must be equal-sized RGB frames");
    }
    let mut changed = 0usize;
    for (pa, pb) in a.chunks_exact(3).zip(b.chunks_exact(3)) {
        if pa[0]
            .abs_diff(pb[0])
            .max(pa[1].abs_diff(pb[1]))
            .max(pa[2].abs_diff(pb[2]))
            > 16
        {
            changed += 1;
        }
    }
    Ok(changed as f64 / (a.len() / 3) as f64)
}
