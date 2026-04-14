//! Forced alignment of TTS audio to its own source text.
//!
//! Previous versions of this module ran `mlx-whisper` over the synthesized
//! audio, re-transcribed it, then fuzzy-matched the resulting text back to
//! the original input. Whisper's transcription has its own error rate, and
//! we were carrying a brittle reconstruction hack to paper over it.
//!
//! This module now uses forced alignment via whisperX: we already know what
//! was spoken, and whisperX's wav2vec2 CTC alignment gives us acoustically
//! accurate per-character (CJK) or per-word (Latin) timestamps for exactly
//! that text. No transcription step, no text reconstruction. The original
//! text is carried through verbatim, including punctuation, and whisperX
//! only supplies timing.

mod align;
mod parse;
mod process;

pub use align::align_audio;
#[allow(unused_imports)]
pub use parse::{Timeline, TimelineSegment, TimelineWord};
