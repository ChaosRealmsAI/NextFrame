#![cfg(feature = "cli")]

macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use clap::{Parser, Subcommand};
use nf_recorder::api::{
    OUTPUT_JSON_ENV, RecordArgs, RecordOutput, overlay_output, record_segments,
};
use nf_recorder::util::absolute_path;

#[derive(Parser, Debug)]
#[command(
    name = "recorder",
    version,
    about = "HTML → MP4 recorder. Frame-pure: every frame is an exact screenshot, no frame drops.",
    after_help = r#"EXAMPLES:
  # Vertical 1080p 60fps (fastest, recommended)
  recorder slide video.html --width 540 --height 960 --dpr 2 --fps 60 --out video.mp4

  # Landscape 1080p 60fps
  recorder slide video.html --width 1920 --height 1080 --dpr 1 --fps 60 --out video.mp4

  # 4K 60fps with parallel (4 processes)
  recorder slide video.html --width 1920 --height 1080 --dpr 2 --fps 60 --parallel 4 --out video.mp4

  # Multiple HTML files → one video
  recorder slide slide1.html slide2.html --out combined.mp4

RESOLUTION CHEAT SHEET:
  1080x1920 (vertical)  → --width 540  --height 960  --dpr 2
  1920x1080 (landscape) → --width 1920 --height 1080 --dpr 1
  3840x2160 (4K)        → --width 1920 --height 1080 --dpr 2

SPEED (10-core M series, 60fps):
  1080p vertical  → 56 fps (faster than realtime)
  1080p landscape → 25-31 fps (near realtime)
  4K serial       → 5-6 fps
  4K --parallel 4 → 13 fps
  4K --parallel 8 → 14 fps

AUTO-DETECTION:
  Duration  → reads engine.duration from page JS
  Audio     → detects window.__audioSrc, muxes to MP4
  Video     → detects videoClip layers, ffmpeg overlays after recording"#
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Record HTML → MP4. Auto-detects duration, audio, and embedded video.
    #[command(after_help = r#"RECOMMENDED:
  Vertical 1080p 60fps (best speed):
    recorder slide video.html -o out.mp4 --width 540 --height 960 --dpr 2 --fps 60

  Landscape 1080p 60fps:
    recorder slide video.html -o out.mp4 --width 1920 --height 1080 --dpr 1 --fps 60

  4K 60fps (use --parallel for speed):
    recorder slide video.html -o out.mp4 --width 1920 --height 1080 --dpr 2 --fps 60 --parallel 4

PARAMETER GUIDE:
  --fps 60      Smooth animation (recommended). Use 30 for simpler content.
  --crf 14      Visually lossless. Use 18-23 for smaller files.
  --dpr 2       Retina quality. Use 1 for 1080p, 2 for 4K.
  --parallel 4  4x speed for single HTML. Use 2-8 based on CPU cores.
  --headed      Debug mode: shows the recording window."#)]
    Slide(SlideArgs),
    /// Record HTML template + overlay source video into the video area
    Clip(ClipArgs),
}

#[derive(Parser, Debug, Clone)]
struct CommonArgs {
    /// HTML files to record. Duration auto-detected from page JS.
    #[arg(value_name = "HTML")]
    pub frames: Vec<PathBuf>,

    /// Directory of HTML slides (alternative to listing files)
    #[arg(long, value_name = "DIR")]
    pub dir: Option<PathBuf>,

    /// Output MP4 path [alias: -o]
    #[arg(long, short = 'o', value_name = "FILE", default_value = "output.mp4")]
    pub out: PathBuf,

    /// Frame rate. 60=smooth animation, 30=standard [recommended: 60]
    #[arg(long, value_name = "N", default_value_t = 30)]
    pub fps: usize,

    /// H.264 quality. 14=lossless, 18=good, 23=small file [recommended: 14]
    #[arg(long, value_name = "N", default_value_t = 14)]
    pub crf: u8,

    /// Pixel ratio. 1=1080p, 2=4K/Retina. Output = width*dpr × height*dpr
    #[arg(long, value_name = "N", default_value_t = 2.0)]
    pub dpr: f64,

    /// Number of capture jobs (auto-detected from CPU/memory)
    #[arg(long, value_name = "N")]
    pub jobs: Option<usize>,

    /// Disable frame skipping (record every frame even if unchanged)
    #[arg(long)]
    pub no_skip: bool,

    /// Use a shorter 0.3s capture window after cue/subtitle changes
    #[arg(long)]
    pub skip_aggressive: bool,

    /// Show the recording window (for debugging)
    #[arg(long)]
    pub headed: bool,

    /// CSS viewport width. 540=vertical, 1920=landscape
    #[arg(long, value_name = "N", default_value_t = 540.0)]
    pub width: f64,

    /// CSS viewport height. 960=vertical, 1080=landscape
    #[arg(long, value_name = "N", default_value_t = 960.0)]
    pub height: f64,

    /// Parallel recording. Splits frames across N processes [recommended: 4]
    #[arg(long, value_name = "N", default_missing_value = "4", num_args = 0..=1)]
    pub parallel: Option<usize>,

    /// [internal] Frame range for parallel subprocess
    #[arg(long, value_name = "START END", num_args = 2, hide = true)]
    pub frame_range: Option<Vec<usize>>,

    /// [experimental] Render at lower resolution then upscale (not recommended)
    #[arg(long, value_name = "N", default_value_t = 1.0, hide = true)]
    pub render_scale: f64,

    /// [internal] Disable per-segment audio muxing. Used by frame-slice subprocesses.
    #[arg(long, hide = true)]
    pub disable_audio: bool,
}

#[derive(Parser, Debug)]
struct SlideArgs {
    #[command(flatten)]
    common: CommonArgs,
}

#[derive(Parser, Debug)]
struct ClipArgs {
    #[command(flatten)]
    common: CommonArgs,

    /// Source video to overlay into the clip's video area (required).
    /// Video area: x:80 y:276 w:920 h:538 in 1080x1920 output.
    #[arg(long, value_name = "FILE")]
    video: PathBuf,
}

impl From<CommonArgs> for RecordArgs {
    fn from(args: CommonArgs) -> Self {
        Self {
            frames: args.frames,
            dir: args.dir,
            out: args.out,
            fps: args.fps,
            crf: args.crf,
            dpr: args.dpr,
            jobs: args.jobs,
            no_skip: args.no_skip,
            skip_aggressive: args.skip_aggressive,
            headed: args.headed,
            width: args.width,
            height: args.height,
            parallel: args.parallel,
            frame_range: args.frame_range.and_then(|v| {
                if v.len() == 2 {
                    Some((v[0], v[1]))
                } else {
                    None
                }
            }),
            render_scale: args.render_scale,
            disable_audio: args.disable_audio,
        }
    }
}

fn main() {
    if let Err(err) = run() {
        trace_log!("\n  ✗ {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let top = Cli::parse();
    let output = match top.command {
        Command::Slide(args) => {
            println!("\n  mode: slide (pure HTML)");
            record_segments(args.common.into())?
        }
        Command::Clip(args) => {
            let video = absolute_path(&args.video)?;
            if !video.exists() {
                return Err(format!("--video file not found: {}", video.display()));
            }
            println!("\n  mode: clip (HTML + video overlay)");
            println!("  video: {}", video.display());

            let output = record_segments(args.common.into())?;
            overlay_output(&output.output_path, &video)?;
            output
        }
    };

    maybe_write_output_json(&output)?;
    Ok(())
}

fn maybe_write_output_json(output: &RecordOutput) -> Result<(), String> {
    let Some(path) = env::var_os(OUTPUT_JSON_ENV).map(PathBuf::from) else {
        return Ok(());
    };

    write_output_json(&path, output)
}

fn write_output_json(path: &Path, output: &RecordOutput) -> Result<(), String> {
    let bytes = serde_json::to_vec(output)
        .map_err(|err| format!("failed to serialize record output: {err}"))?;
    fs::write(path, bytes).map_err(|err| format!("failed to write {}: {err}", path.display()))
}
