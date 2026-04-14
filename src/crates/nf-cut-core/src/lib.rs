//! Shared schemas and filesystem helpers for the `nf` pipeline.

pub(crate) mod cut_report;
pub(crate) mod fs;
pub(crate) mod media;
pub(crate) mod plan;
pub(crate) mod preview;
pub(crate) mod python;
pub(crate) mod sentence;
pub(crate) mod srt;
pub(crate) mod time;

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
