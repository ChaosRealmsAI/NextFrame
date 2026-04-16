//! nf-recorder entry point
#![cfg(feature = "cli")]

use std::io::{self, Write};

use chrono::{SecondsFormat, Utc};
use serde_json::{Value, json};

fn emit_trace(module: impl AsRef<str>, event: impl AsRef<str>, data: Value) {
    let line = json!({
        "ts": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "module": module.as_ref(),
        "event": event.as_ref(),
        "data": data,
    })
    .to_string();
    let _ = writeln!(io::stderr().lock(), "{line}");
}

fn emit_message(module_path: &str, message: String) {
    emit_trace(
        infer_module_name(module_path),
        "message",
        json!({ "message": message }),
    );
}

fn infer_module_name(module_path: &str) -> String {
    let mut segments = module_path.split("::");
    let crate_name = segments.next().unwrap_or(module_path);
    segments.next().map(str::to_owned).unwrap_or_else(|| {
        crate_name
            .rsplit('_')
            .next()
            .unwrap_or(crate_name)
            .to_owned()
    })
}

macro_rules! trace_log {
    ($($arg:tt)*) => {{
        $crate::emit_message(module_path!(), format!($($arg)*));
    }};
}

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use clap::{Parser, Subcommand};
use nextframe_recorder::{
    OUTPUT_JSON_ENV, RecordArgs, RecordOutput, absolute_path, overlay_output, record_segments,
};

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

  # Static slides where most frames repeat: enable smart skipping
  recorder slide slides.html --width 1920 --height 1080 --dpr 1 --fps 60 --skip --out slides.mp4

  # Disable parallelism for debugging
  recorder slide video.html --width 1920 --height 1080 --dpr 2 --fps 60 --parallel 1 --out video.mp4

  # Multiple HTML files → one video
  recorder slide slide1.html slide2.html --out combined.mp4

RESOLUTION CHEAT SHEET:
  1080x1920 (vertical)  → --width 540  --height 960  --dpr 2
  1920x1080 (landscape) → --width 1920 --height 1080 --dpr 1
  3840x2160 (4K)        → --width 1920 --height 1080 --dpr 2

SPEED (10-core M series, 60fps):
  1080p vertical  → 56 fps (faster than realtime)
  1080p landscape → 25-31 fps (near realtime)
  4K --parallel 1 → 5-6 fps
  4K default      → 13 fps
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

  4K 60fps (parallel=4 by default):
    recorder slide video.html -o out.mp4 --width 1920 --height 1080 --dpr 2 --fps 60

  Mostly static slides (smart skipping):
    recorder slide slides.html -o out.mp4 --width 1920 --height 1080 --dpr 1 --fps 60 --skip

  Disable parallelism for debugging:
    recorder slide video.html -o out.mp4 --parallel 1

PARAMETER GUIDE:
  --fps 60      Smooth animation (recommended). Use 30 for simpler content.
  --crf 14      Visually lossless. Use 18-23 for smaller files.
  --dpr 2       Retina quality. Use 1 for 1080p, 2 for 4K.
  --skip        Smart frame skipping for mostly static content. Off by default.
  --parallel 1  Disable parallelism. Default is 4; use 2-8 based on CPU cores.
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

    /// Enable smart frame-skipping (default: off — record every frame)
    #[arg(long)]
    pub skip: bool,

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

    /// Parallel recording. Splits frames across N processes (default: 4, set to 1 to disable)
    #[arg(long, value_name = "N", default_value_t = 4)]
    pub parallel: usize,

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
            skip: args.skip,
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
    if let Err(err) /* Fix: propagate or log the formatted error below */ = run() {
        trace_log!("\n  ✗ {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let top = Cli::parse();
    let output = match top.command {
        Command::Slide(args) => {
            trace_log!("mode: slide (pure HTML)");
            record_segments(args.common.into())?
        }
        Command::Clip(args) => {
            let video = absolute_path(&args.video)?;
            if !video.exists() {
                return Err(/* Fix: user-facing error formatted below */ format!(
                    "failed to validate the clip overlay video: --video file not found: {}. Fix: pass an existing local video file to `--video`.",
                    video.display()
                ));
            }
            trace_log!("mode: clip (HTML + video overlay)");
            trace_log!("video: {}", video.display());

            let dpr = args.common.dpr;
            let output = record_segments(args.common.into())?;
            overlay_output(&output.output_path, &video, dpr)?;
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
    let bytes = serde_json::to_vec(output).map_err(|err| {
        format!(
            "failed to serialize the recorder output JSON: {err}. Fix: retry the command after removing unsupported values from the recorder output payload."
        )
    })?;
    fs::write(path, bytes).map_err(|err| {
        format!(
            "failed to write the recorder output JSON: {}: {err}. Fix: ensure the destination directory exists and is writable, then retry.",
            path.display()
        )
    })
}
