//! recording segment cleanup
use crate::encoder::EncoderBackend;
use crate::plan::{SegmentPlan, SegmentSummary};

use super::setup::SegmentContext;

pub(super) fn finish_segment(
    plan: &SegmentPlan,
    backend: EncoderBackend,
    context: SegmentContext,
    frames_recorded: usize,
) -> Result<SegmentSummary, String> {
    let SegmentContext {
        page_duration_sec,
        effective_duration,
        video_layers,
        segment_path,
        effective_audio_path,
        encoder,
        clock,
        ..
    } = context;
    encoder.finish()?;
    let skipped_frames = clock.skipped_frames();

    trace_log!(
        "segment complete: {} ({:.1}s, {} frames, {} skipped, {})",
        plan.metadata
            .html_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("segment"),
        plan.audio_duration_sec.max(effective_duration),
        frames_recorded,
        skipped_frames,
        backend.label()
    );

    Ok(SegmentSummary {
        path: segment_path,
        total_frames: frames_recorded,
        skipped_frames,
        page_duration_sec,
        audio_path: effective_audio_path,
        video_layers,
    })
}
