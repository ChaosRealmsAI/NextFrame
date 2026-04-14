//! Download command for fetching a source video and metadata.
use anyhow::Result;
use nf_download::{DownloadOptions, download};
use serde_json::json;

use crate::cli::DownloadArgs;
use crate::output::write_json_pretty;

pub fn run(args: DownloadArgs) -> Result<()> {
    let summary = download(&DownloadOptions {
        url: args.url,
        out_dir: args.out_dir,
        format_height: args.format_height,
    })?;

    write_json_pretty(&json!({
        "video_path": summary.video_path,
        "metadata_path": summary.metadata_path,
        "metadata": summary.metadata,
    }))?;

    Ok(())
}
