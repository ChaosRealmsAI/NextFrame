//! Shared configuration structs for recording parameters.
use std::path::Path;

use crate::CommonArgs;
use crate::encoder::EncoderBackend;
use crate::server::HttpFileServer;

/// Groups the segment-level parameters that flow unchanged through
/// `record_segment` -> `prepare_segment` -> `record_frames`.
pub(crate) struct SegmentRecordingConfig<'a> {
    pub(crate) server: Option<&'a HttpFileServer>,
    pub(crate) root: &'a Path,
    pub(crate) index: usize,
    pub(crate) temp_root: &'a Path,
    pub(crate) offset_sec: f64,
    pub(crate) total_duration_sec: f64,
    pub(crate) cli: &'a CommonArgs,
    pub(crate) backend: EncoderBackend,
    pub(crate) total_segments: usize,
    pub(crate) segment_titles: &'a [String],
    pub(crate) segment_durations: &'a [f64],
    pub(crate) progress_color: Option<(f64, f64, f64)>,
}
