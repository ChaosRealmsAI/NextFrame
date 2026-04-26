use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug)]
pub(super) struct ImportPlan {
    pub(super) composition_path: PathBuf,
    pub(super) composition: Value,
    pub(super) slides: Vec<SlideImport>,
    pub(super) duration_ms: u64,
    pub(super) tracks: usize,
    pub(super) cues: usize,
}

#[derive(Debug)]
pub(super) struct SlideImport {
    pub(super) poster_src: PathBuf,
    pub(super) poster_dst: PathBuf,
    pub(super) audio_src: PathBuf,
    pub(super) audio_dst: PathBuf,
}

#[derive(Debug)]
pub(super) struct PosterFile {
    pub(super) number: usize,
    pub(super) path: PathBuf,
}

#[derive(Debug, Deserialize)]
pub(super) struct Manifest {
    pub(super) entries: Vec<ManifestEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ManifestEntry {
    pub(super) id: usize,
    pub(super) file: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct Timeline {
    pub(super) segments: Vec<TimelineSegment>,
}

#[derive(Debug, Deserialize)]
pub(super) struct TimelineSegment {
    pub(super) text: String,
    pub(super) start_ms: u64,
    pub(super) end_ms: u64,
    #[serde(default)]
    pub(super) words: Vec<TimelineWord>,
}

#[derive(Debug, Deserialize)]
pub(super) struct TimelineWord {
    pub(super) word: String,
    pub(super) start_ms: u64,
    pub(super) end_ms: u64,
}

#[derive(Debug, Serialize)]
pub(super) struct Cue {
    pub(super) text: String,
    pub(super) start_ms: u64,
    pub(super) end_ms: u64,
    pub(super) words: Vec<CueWord>,
}

#[derive(Debug, Serialize)]
pub(super) struct CueWord {
    pub(super) text: String,
    pub(super) start_ms: u64,
    pub(super) end_ms: u64,
}
