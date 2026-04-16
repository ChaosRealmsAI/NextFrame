//! whisper module exports
//!
//! Previous versions of this file ran `mlx-whisper` over the synthesized
//! audio, re-transcribed it, then fuzzy-matched the resulting text back to
//! the original input. Whisper's transcription has its own error rate (it
//! mishears CJK text, hallucinates on long audio, drops characters), and
//! we were carrying a brittle "count content chars, force the original back"
//! hack to paper over it.
//!
//! This module now uses **forced alignment** via whisperX: we already know
//! what was spoken (we fed it to the TTS engine), and whisperX's wav2vec2
//! CTC alignment gives us acoustically-accurate per-character (CJK) or
//! per-word (Latin) timestamps for exactly that text. No transcription step,
//! no text-reconstruction hack. The original text is carried through
//! verbatim — including all punctuation — and whisperX only supplies timing.
//!
//! Public types (`Timeline`, `TimelineSegment`, `TimelineWord`) and the
//! `align_audio(audio_path, original_text)` entry point keep the same shape
//! as before, so callers (synth, scheduler, srt) need no changes.

mod aligner;
mod timeline;

use std::path::Path;

use anyhow::Result;

pub use timeline::Timeline;
#[allow(unused_imports)]
pub use timeline::{TimelineSegment, TimelineWord};

pub fn align_audio(audio_path: &Path, original_text: &str) -> Result<Option<Timeline>> {
    if original_text.trim().is_empty() {
        return Ok(None);
    }

    let ffa = aligner::run_ffa(audio_path, original_text)?;
    if ffa.units.is_empty() {
        return Ok(None);
    }

    let timeline = timeline::build_timeline(ffa, original_text);
    if timeline.segments.is_empty() {
        return Ok(None);
    }

    Ok(Some(timeline))
}
