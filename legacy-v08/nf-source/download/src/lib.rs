//! `yt-dlp`-based source download support for `nf download`.

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use nf_cut_core::{probe_duration, remove_existing_path};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SOURCE_FILE_NAME: &str = "source.mp4";
const META_FILE_NAME: &str = "meta.json";

/// CLI-facing configuration for `nf download`.
#[derive(Debug, Clone)]
pub struct DownloadOptions {
    /// Video page URL to pass to `yt-dlp`.
    pub url: String,
    /// Output directory that will receive `source.mp4` and `meta.json`.
    pub out_dir: PathBuf,
    /// Maximum requested video height, such as `720` or `1080`.
    pub format_height: u16,
}

/// Metadata written to `meta.json` after a successful download.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadMetadata {
    /// Original source URL.
    pub url: String,
    /// Resolved video title from `yt-dlp`.
    pub title: String,
    /// Downloaded media duration in seconds, probed via `ffprobe`.
    pub duration_sec: f64,
    /// Requested format label, such as `720p`.
    pub format: String,
    /// Download timestamp in UTC RFC 3339 format.
    pub downloaded_at: String,
}

/// Paths and metadata produced by a successful download.
#[derive(Debug, Clone)]
pub struct DownloadSummary {
    /// Final downloaded video path.
    pub video_path: PathBuf,
    /// Final metadata JSON path.
    pub metadata_path: PathBuf,
    /// Metadata persisted to `meta.json`.
    pub metadata: DownloadMetadata,
}

#[derive(Debug, Deserialize)]
struct YtDlpInfo {
    title: Option<String>,
}

#[derive(Debug, Error)]
enum DownloadError {
    #[error("format height must be greater than zero")]
    InvalidFormatHeight,
    #[error("yt-dlp metadata did not include a title")]
    MissingTitle,
    #[error("downloaded video missing at {0}")]
    MissingOutput(String),
    #[error("{tool} failed with exit {code:?}")]
    CommandStatus {
        tool: &'static str,
        code: Option<i32>,
    },
    #[error("{tool} failed with exit {code:?}: {stderr}")]
    CommandOutput {
        tool: &'static str,
        code: Option<i32>,
        stderr: String,
    },
    #[error("system time is before UNIX_EPOCH")]
    InvalidSystemTime,
}

/// Download a source video into `source.mp4` and write `meta.json`.
pub fn download(options: &DownloadOptions) -> Result<DownloadSummary> {
    if options.format_height == 0 {
        return Err(DownloadError::InvalidFormatHeight.into());
    }

    fs::create_dir_all(&options.out_dir)
        .with_context(|| format!("create {}", options.out_dir.display()))?;

    let info = fetch_info(&options.url)?;
    let video_path = options.out_dir.join(SOURCE_FILE_NAME);
    let metadata_path = options.out_dir.join(META_FILE_NAME);

    remove_existing_path(&video_path)?;
    remove_existing_path(&metadata_path)?;

    run_download(options)?;

    if !video_path.is_file() {
        return Err(DownloadError::MissingOutput(video_path.display().to_string()).into());
    }

    let duration_sec = probe_duration(&video_path)?;
    let metadata = DownloadMetadata {
        url: options.url.clone(),
        title: info.title.ok_or(DownloadError::MissingTitle)?,
        duration_sec,
        format: format!("{}p", options.format_height),
        downloaded_at: now_utc_rfc3339()?,
    };

    let meta_bytes = serde_json::to_vec_pretty(&metadata).context("serialize meta.json")?;
    fs::write(&metadata_path, meta_bytes)
        .with_context(|| format!("write {}", metadata_path.display()))?;

    Ok(DownloadSummary {
        video_path,
        metadata_path,
        metadata,
    })
}

fn fetch_info(url: &str) -> Result<YtDlpInfo> {
    let output = Command::new("yt-dlp")
        .arg("--dump-single-json")
        .arg("--skip-download")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(url)
        .output()
        .context("run yt-dlp metadata")?;

    if !output.status.success() {
        return Err(DownloadError::CommandOutput {
            tool: "yt-dlp",
            code: output.status.code(),
            stderr: stderr_text(&output.stderr),
        }
        .into());
    }

    serde_json::from_slice(&output.stdout).with_context(|| {
        format!(
            "parse yt-dlp metadata: {}",
            String::from_utf8_lossy(&output.stdout).trim()
        )
    })
}

fn run_download(options: &DownloadOptions) -> Result<()> {
    let output_template = options.out_dir.join("source.%(ext)s");
    let status = Command::new("yt-dlp")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg("--force-overwrites")
        .arg("-f")
        .arg(format_selector(options.format_height))
        .arg("--merge-output-format")
        .arg("mp4")
        .arg("--output")
        .arg(&output_template)
        .arg(&options.url)
        .status()
        .context("run yt-dlp download")?;

    if !status.success() {
        return Err(DownloadError::CommandStatus {
            tool: "yt-dlp",
            code: status.code(),
        }
        .into());
    }

    Ok(())
}

fn format_selector(height: u16) -> String {
    format!("bestvideo*[height<={height}]+bestaudio/best[height<={height}]")
}

fn stderr_text(stderr: &[u8]) -> String {
    let trimmed = String::from_utf8_lossy(stderr).trim().to_string();
    if trimmed.is_empty() {
        return "no stderr output".to_string();
    }
    trimmed
}

fn now_utc_rfc3339() -> Result<String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| DownloadError::InvalidSystemTime)?;
    let days = i64::try_from(elapsed.as_secs() / 86_400).context("convert elapsed days")?;
    let seconds_of_day = elapsed.as_secs() % 86_400;
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    let (year, month, day) = civil_from_days(days)?;

    Ok(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    ))
}

fn civil_from_days(days_since_epoch: i64) -> Result<(i32, u32, u32)> {
    let shifted = days_since_epoch + 719_468;
    let era = if shifted >= 0 {
        shifted / 146_097
    } else {
        (shifted - 146_096) / 146_097
    };
    let day_of_era = shifted - (era * 146_097);
    let year_of_era =
        (day_of_era - (day_of_era / 1_460) + (day_of_era / 36_524) - (day_of_era / 146_096)) / 365;
    let mut year = year_of_era + (era * 400);
    let day_of_year = day_of_era - (365 * year_of_era + (year_of_era / 4) - (year_of_era / 100));
    let month_piece = (5 * day_of_year + 2) / 153;
    let day = day_of_year - ((153 * month_piece + 2) / 5) + 1;
    let month = month_piece + if month_piece < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }

    Ok((
        i32::try_from(year).context("convert year")?,
        u32::try_from(month).context("convert month")?,
        u32::try_from(day).context("convert day")?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_selector_limits_requested_height() {
        assert_eq!(
            format_selector(720),
            "bestvideo*[height<=720]+bestaudio/best[height<=720]"
        );
    }

    #[test]
    fn stderr_text_returns_default_for_empty_output() {
        assert_eq!(stderr_text(b" \n "), "no stderr output");
    }

    #[test]
    fn civil_from_days_matches_unix_epoch() -> Result<()> {
        assert_eq!(civil_from_days(0)?, (1970, 1, 1));
        Ok(())
    }

    #[test]
    fn civil_from_days_known_dates() -> Result<()> {
        assert_eq!(civil_from_days(10_957)?, (2000, 1, 1));
        assert_eq!(civil_from_days(19_782)?, (2024, 2, 29));
        Ok(())
    }

    #[test]
    fn format_selector_various_heights() {
        assert_eq!(
            format_selector(1080),
            "bestvideo*[height<=1080]+bestaudio/best[height<=1080]"
        );
        assert_eq!(
            format_selector(480),
            "bestvideo*[height<=480]+bestaudio/best[height<=480]"
        );
    }

    #[test]
    fn now_utc_rfc3339_returns_valid_format() -> Result<()> {
        let ts = now_utc_rfc3339()?;
        assert_eq!(ts.len(), 20);
        assert!(ts.ends_with('Z'));
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
        Ok(())
    }

    #[test]
    fn download_metadata_serializes_all_fields() -> Result<()> {
        let meta = DownloadMetadata {
            url: "https://example.com/video".to_string(),
            title: "Test Video".to_string(),
            duration_sec: 120.5,
            format: "720p".to_string(),
            downloaded_at: "2024-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&meta)?;
        assert!(json.contains("\"url\":\"https://example.com/video\""));
        assert!(json.contains("\"title\":\"Test Video\""));
        assert!(json.contains("\"duration_sec\":120.5"));
        assert!(json.contains("\"format\":\"720p\""));
        Ok(())
    }
}
