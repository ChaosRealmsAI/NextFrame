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
use nextframe_recorder::api::{
    OUTPUT_JSON_ENV, RecordArgs, RecordOutput, overlay_output, record_segments,
};
use nextframe_recorder::util::absolute_path;

#[derive(Parser, Debug)]
#[command(
    name = "recorder",
    version,
    about = "HTML slide → MP4. Two modes: `slide` (pure HTML) and `clip` (HTML + video overlay)."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Record pure HTML slides (bridge, cover, toc, outro, etc.)
    Slide(SlideArgs),
    /// Record HTML template + overlay source video into the video area
    Clip(ClipArgs),
}

#[derive(Parser, Debug, Clone)]
struct CommonArgs {
    /// HTML slide files to record (one or more)
    #[arg(value_name = "HTML")]
    pub frames: Vec<PathBuf>,

    /// Directory of HTML slides (alternative to listing files)
    #[arg(long, value_name = "DIR")]
    pub dir: Option<PathBuf>,

    /// Output MP4 path
    #[arg(long, value_name = "FILE", default_value = "output.mp4")]
    pub out: PathBuf,

    /// Target frame rate
    #[arg(long, value_name = "N", default_value_t = 30)]
    pub fps: usize,

    /// H.264 quality (lower = better, 14 is visually lossless)
    #[arg(long, value_name = "N", default_value_t = 14)]
    pub crf: u8,

    /// Device pixel ratio (2.0 = Retina, output is width*dpr x height*dpr)
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

    /// CSS viewport width. Use 540 for vertical 9:16
    #[arg(long, value_name = "N", default_value_t = 540.0)]
    pub width: f64,

    /// CSS viewport height. Use 960 for vertical 9:16
    #[arg(long, value_name = "N", default_value_t = 960.0)]
    pub height: f64,

    /// Record slides in parallel using N processes (default: 4)
    #[arg(long, value_name = "N", default_missing_value = "4", num_args = 0..=1)]
    pub parallel: Option<usize>,

    /// Render at a fraction of output resolution, then upscale (0.25-1.0, default: 1.0)
    #[arg(long, value_name = "N", default_value_t = 1.0)]
    pub render_scale: f64,
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
            render_scale: args.render_scale,
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
