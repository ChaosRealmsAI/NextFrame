use anyhow::Result;
use serde_json::json;
use videocut_align::{AlignOptions, align};

use crate::cli::AlignArgs;

pub fn run(args: AlignArgs) -> Result<()> {
    let summary = align(&AlignOptions {
        video: args.video,
        srt_path: args.srt_path,
        out_dir: args.out_dir,
        language: args.language,
    })?;

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "audio_path": summary.audio_path,
            "audio_duration_sec": summary.audio_duration_sec,
            "language": summary.language,
            "total_words": summary.total_words,
            "total_sentences": summary.total_sentences,
        }))?
    );

    Ok(())
}
