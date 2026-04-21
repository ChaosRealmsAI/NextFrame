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
//! `align_audio(audio_path, original_text, voice)` entry point keep the same
//! overall shape as before; the `voice` parameter was added in v1.12.1 so the
//! emitted `*.timeline.json` can carry a top-level `voice` field per
//! `spec/interfaces.json`.

mod aligner;
pub(crate) mod timeline;

use std::path::Path;

use anyhow::Result;

pub use timeline::Timeline;
#[allow(unused_imports)]
pub use timeline::{TimelineSegment, TimelineWord};

/// Force-align audio against the original text.
///
/// `voice` is the TTS voice id that produced `audio_path` (e.g.
/// `"zh-CN-XiaoxiaoNeural"`). It is carried verbatim into the resulting
/// `Timeline::voice` field — pass `""` when the caller does not know / does
/// not care.
pub fn align_audio(
    audio_path: &Path,
    original_text: &str,
    voice: &str,
) -> Result<Option<Timeline>> {
    if original_text.trim().is_empty() {
        return Ok(None);
    }

    let ffa = aligner::run_ffa(audio_path, original_text)?;
    if ffa.units.is_empty() {
        return Ok(None);
    }

    let timeline = timeline::build_timeline(ffa, original_text, voice);
    if timeline.segments.is_empty() {
        return Ok(None);
    }

    Ok(Some(timeline))
}
