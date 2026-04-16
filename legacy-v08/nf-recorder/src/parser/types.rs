//! Core types shared across the parser submodules.

use std::path::PathBuf;

#[derive(Debug, Clone)]
/// One parsed subtitle entry with start and end times.
pub struct SubtitleCue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SlideType {
    Bridge,
    Clip,
    Unknown,
}

#[derive(Debug, Clone)]
/// All metadata extracted from a recorder HTML frame file.
pub(crate) struct FrameMetadata {
    pub(crate) html_path: PathBuf,
    pub(crate) slide_type: SlideType,
    pub(crate) audio_path: Option<PathBuf>,
    pub(crate) subtitles: Vec<SubtitleCue>,
    pub(crate) cuemap: Vec<usize>,
    pub(crate) total_cues: usize,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug)]
pub(super) struct ClipTiming {
    pub(super) start_sec: f64,
    pub(super) duration_sec: f64,
}

#[derive(Debug)]
pub(super) struct RawSubtitleCue {
    pub(super) start: Option<f64>,
    pub(super) end: Option<f64>,
    pub(super) duration: Option<f64>,
    pub(super) text: String,
}
