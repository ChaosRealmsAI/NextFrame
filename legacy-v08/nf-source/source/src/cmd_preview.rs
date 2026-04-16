//! Preview command for building the nf-source timeline manifest.
use anyhow::Result;
use nf_cut_core::{CutReport, PreviewClip, PreviewTimelines, Sentences, remap_words_to_clip_ms};
use serde_json::json;

use crate::cli::PreviewArgs;
use crate::output::write_json_pretty;

pub fn run(args: PreviewArgs) -> Result<()> {
    let sentences = Sentences::from_path(&args.sentences_path)?;
    let report = CutReport::from_path(&args.cut_report_path)?;
    let clips = report
        .success
        .iter()
        .map(|clip| {
            Ok(PreviewClip {
                clip_num: clip.clip_num,
                title: clip.title.clone(),
                file: clip.file.clone(),
                start_sec: clip.start,
                end_sec: clip.end,
                duration_sec: clip.duration,
                from_id: clip.from_id,
                to_id: clip.to_id,
                words: remap_words_to_clip_ms(
                    &sentences,
                    clip.from_id,
                    clip.to_id,
                    clip.start,
                    clip.duration,
                )?,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let timelines = PreviewTimelines {
        version: "1".to_string(),
        title: args.title,
        subtitle: args.subtitle,
        accent: args.accent,
        theme: args.theme,
        clips,
    };
    timelines.write_to_path(&args.out_path)?;

    write_json_pretty(&json!({
        "out_path": args.out_path,
        "clips": timelines.clips.len(),
    }))?;

    Ok(())
}
