//! Shared schemas and filesystem helpers for the `videocut` pipeline.

pub mod cut_report;
pub mod fs;
pub mod media;
pub mod plan;
pub mod preview;
pub mod python;
pub mod sentence;
pub mod srt;
pub mod time;

pub use cut_report::{ClipFailure, ClipResult, CutReport};
pub use fs::remove_existing_path;
pub use media::{extract_audio_to_wav, probe_duration};
pub use plan::{Plan, PlanBridge, PlanClip, PlanSkipped};
pub use preview::{PreviewClip, PreviewTimelines, PreviewWord, remap_words_to_clip_ms};
pub use python::python_bin;
pub use sentence::{Sentence, SentenceSource, Sentences, Word, WordsFile, split_into_sentences};
pub use srt::{parse_srt, render_srt};
pub use time::{
    clamp_range, format_hms, format_srt_timestamp, millis_to_seconds, round2, seconds_to_millis,
};
