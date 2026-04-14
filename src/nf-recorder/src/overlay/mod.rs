//! overlay module exports
mod ffmpeg;
mod perf;
mod spec;

pub(crate) use self::ffmpeg::{overlay_video, overlay_video_layers};
pub(crate) use self::perf::{PerfLogContext, write_perf_log};
pub(crate) use self::spec::build_video_overlay_specs;

#[cfg(test)]
mod tests;
