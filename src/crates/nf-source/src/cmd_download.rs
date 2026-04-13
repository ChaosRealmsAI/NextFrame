use anyhow::Result;
use serde_json::json;
use videocut_download::{DownloadOptions, download};

use crate::cli::DownloadArgs;

pub fn run(args: DownloadArgs) -> Result<()> {
    let summary = download(&DownloadOptions {
        url: args.url,
        out_dir: args.out_dir,
        format_height: args.format_height,
    })?;

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "video_path": summary.video_path,
            "metadata_path": summary.metadata_path,
            "metadata": summary.metadata,
        }))?
    );

    Ok(())
}
