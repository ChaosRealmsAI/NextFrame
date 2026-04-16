//! api parallel module exports
mod cli;
mod frame_slices;
mod group_recording;
mod probe;

use std::path::{Path, PathBuf};

use crate::api::{RecordArgs, RecordOutput};

pub(super) fn record_parallel(
    args: &RecordArgs,
    frame_files: &[PathBuf],
    out: &Path,
    requested: usize,
) -> Result<RecordOutput, String> {
    self::group_recording::record_parallel(args, frame_files, out, requested)
}

pub(super) fn record_parallel_single(
    args: &RecordArgs,
    html_file: &Path,
    out: &Path,
    requested: usize,
) -> Result<RecordOutput, String> {
    self::frame_slices::record_parallel_single(args, html_file, out, requested)
}
