//! api module exports
mod orchestrator;
mod parallel;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::CommonArgs;
use crate::error_with_fix;
use crate::overlay::overlay_video;
use crate::plan::collect_frame_files;
use crate::util::absolute_path;

pub const OUTPUT_JSON_ENV: &str = "NEXTFRAME_RECORDER_OUTPUT_JSON";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordArgs {
    pub frames: Vec<PathBuf>,
    pub dir: Option<PathBuf>,
    pub out: PathBuf,
    pub fps: usize,
    pub crf: u8,
    pub dpr: f64,
    pub jobs: Option<usize>,
    pub no_skip: bool,
    pub skip_aggressive: bool,
    pub headed: bool,
    pub width: f64,
    pub height: f64,
    pub parallel: Option<usize>,
    #[serde(default)]
    pub frame_range: Option<(usize, usize)>,
    #[serde(default = "default_render_scale")]
    pub render_scale: f64,
    #[serde(default)]
    pub disable_audio: bool,
}

fn default_render_scale() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordOutput {
    pub output_path: PathBuf,
    pub total_frames: usize,
    pub skipped_frames: usize,
    pub duration_sec: f64,
}

impl From<RecordArgs> for CommonArgs {
    fn from(args: RecordArgs) -> Self {
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
            frame_range: args.frame_range,
            render_scale: args.render_scale,
            disable_audio: args.disable_audio,
        }
    }
}

pub fn record_segments(args: RecordArgs) -> Result<RecordOutput, String> {
    validate_args(&args)?;

    let cli: CommonArgs = args.clone().into();
    let frame_files = collect_frame_files(&cli)?;
    let out = absolute_path(&cli.out)?;

    match cli.parallel {
        Some(requested) if frame_files.len() == 1 => {
            // Single HTML file: use intra-segment frame-slice parallelism
            parallel::record_parallel_single(&args, &frame_files[0], &out, requested)
        }
        Some(requested) => parallel::record_parallel(&args, &frame_files, &out, requested),
        None => orchestrator::record_single(&cli, &frame_files, &out),
    }
}

pub fn overlay_output(recorded: &Path, video: &Path, dpr: f64) -> Result<(), String> {
    overlay_video(recorded, video, dpr)
}

fn validate_args(args: &RecordArgs) -> Result<(), String> {
    if args.fps == 0 {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "validate the recorder arguments",
                "`--fps` must be greater than 0",
                "Pass a positive integer such as `--fps 30`.",
            ),
        );
    }
    if args.dpr <= 0.0 {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "validate the recorder arguments",
                "`--dpr` must be greater than 0",
                "Pass a positive scale such as `--dpr 2`.",
            ),
        );
    }
    Ok(())
}
