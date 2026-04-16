//! Transcribe command for generating the canonical sentence bundle.
use anyhow::Result;
use nf_transcribe::{TranscribeOptions, transcribe};
use serde_json::json;

use crate::cli::TranscribeArgs;
use crate::output::write_json_pretty;

pub fn run(args: TranscribeArgs) -> Result<()> {
    let summary = transcribe(&TranscribeOptions {
        video: args.video,
        out_dir: args.out_dir,
        model: args.model,
        language: args.language,
        jobs: args.jobs,
    })?;

    write_json_pretty(&json!({
        "audio_path": summary.audio_path,
        "audio_duration_sec": summary.audio_duration_sec,
        "total_words": summary.total_words,
        "total_sentences": summary.total_sentences,
    }))?;

    Ok(())
}
