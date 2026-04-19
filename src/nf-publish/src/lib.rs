use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde::Serialize;
use serde_json::{json, Value};

pub trait Uploader {
    fn platform(&self) -> &'static str;
    fn auth_env(&self) -> &'static str;
    fn endpoint(&self) -> &'static str;
    fn build_payload(&self, request: &UploadRequest) -> Value;

    fn dry_run(&self, request: &UploadRequest) -> UploadPreview {
        UploadPreview {
            ok: true,
            mode: "dry-run".to_string(),
            platform: self.platform().to_string(),
            auth_env: self.auth_env().to_string(),
            auth_present: std::env::var_os(self.auth_env()).is_some(),
            file: request.file.display().to_string(),
            title: request.title.clone(),
            desc: request.desc.clone(),
            endpoint: self.endpoint().to_string(),
            payload: self.build_payload(request),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UploadRequest {
    pub file: PathBuf,
    pub title: String,
    pub desc: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct UploadPreview {
    pub ok: bool,
    pub mode: String,
    pub platform: String,
    pub auth_env: String,
    pub auth_present: bool,
    pub file: String,
    pub title: String,
    pub desc: String,
    pub endpoint: String,
    pub payload: Value,
}

pub struct YoutubeUploader;

impl Uploader for YoutubeUploader {
    fn platform(&self) -> &'static str {
        "youtube"
    }

    fn auth_env(&self) -> &'static str {
        "YOUTUBE_TOKEN"
    }

    fn endpoint(&self) -> &'static str {
        "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status"
    }

    fn build_payload(&self, request: &UploadRequest) -> Value {
        json!({
            "file": request.file.display().to_string(),
            "snippet": {
                "title": request.title.clone(),
                "description": request.desc.clone(),
            },
            "status": {
                "privacyStatus": "private",
                "selfDeclaredMadeForKids": false,
            }
        })
    }
}

pub struct BilibiliUploader;

impl Uploader for BilibiliUploader {
    fn platform(&self) -> &'static str {
        "bilibili"
    }

    fn auth_env(&self) -> &'static str {
        "BILI_COOKIE"
    }

    fn endpoint(&self) -> &'static str {
        "https://member.bilibili.com/x/vu/web/add/v3"
    }

    fn build_payload(&self, request: &UploadRequest) -> Value {
        json!({
            "videos": [
                {
                    "filename": file_stem_or_name(&request.file),
                    "path": request.file.display().to_string(),
                    "title": request.title.clone(),
                }
            ],
            "title": request.title.clone(),
            "desc": request.desc.clone(),
            "copyright": 1,
            "tid": 21,
        })
    }
}

pub fn dry_run_upload(platform: &str, request: UploadRequest) -> Result<UploadPreview> {
    if !request.dry_run {
        bail!("actual upload is disabled; pass --dry-run");
    }
    let preview = match platform {
        "youtube" => YoutubeUploader.dry_run(&request),
        "bilibili" | "bili" => BilibiliUploader.dry_run(&request),
        other => bail!("unsupported platform: {other}"),
    };
    Ok(preview)
}

pub fn run_cli<I>(args: I) -> Result<UploadPreview>
where
    I: IntoIterator<Item = String>,
{
    let args: Vec<String> = args.into_iter().collect();
    if args.len() <= 1 {
        bail!(usage());
    }
    match args.get(1).map(String::as_str) {
        Some("upload") => parse_upload(&args[2..]),
        Some("--help") | Some("-h") => bail!(usage()),
        Some(other) => bail!("unknown command: {other}\n{}", usage()),
        None => bail!(usage()),
    }
}

fn parse_upload(args: &[String]) -> Result<UploadPreview> {
    let mut platform: Option<String> = None;
    let mut file: Option<PathBuf> = None;
    let mut title: Option<String> = None;
    let mut desc: Option<String> = None;
    let mut dry_run = false;
    let mut i = 0usize;
    while i < args.len() {
        match args[i].as_str() {
            "--platform" => {
                i += 1;
                platform = args.get(i).cloned();
            }
            "--file" => {
                i += 1;
                file = args.get(i).map(PathBuf::from);
            }
            "--title" => {
                i += 1;
                title = args.get(i).cloned();
            }
            "--desc" => {
                i += 1;
                desc = args.get(i).cloned();
            }
            "--dry-run" => dry_run = true,
            "--help" | "-h" => bail!(upload_usage()),
            other => bail!("unknown flag: {other}\n{}", upload_usage()),
        }
        i += 1;
    }
    let request = UploadRequest {
        file: file.context("--file is required")?,
        title: title.context("--title is required")?,
        desc: desc.context("--desc is required")?,
        dry_run,
    };
    dry_run_upload(
        platform
            .as_deref()
            .context("--platform is required")?
            .trim(),
        request,
    )
}

fn file_stem_or_name(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("video")
        .to_string()
}

fn usage() -> &'static str {
    "Usage:\n  nf-publish upload --platform <youtube|bilibili> --file <video.mp4> --title <title> --desc <desc> --dry-run"
}

fn upload_usage() -> &'static str {
    "Usage:\n  nf-publish upload --platform <youtube|bilibili> --file <video.mp4> --title <title> --desc <desc> --dry-run"
}

#[cfg(test)]
mod tests {
    use super::{dry_run_upload, run_cli, UploadRequest};
    use serde_json::Value;
    use std::path::PathBuf;

    #[test]
    fn youtube_dry_run_contains_title_and_desc() {
        let preview = dry_run_upload(
            "youtube",
            UploadRequest {
                file: PathBuf::from("tmp/x.mp4"),
                title: "Demo".to_string(),
                desc: "Desc".to_string(),
                dry_run: true,
            },
        )
        .unwrap();

        assert_eq!(preview.platform, "youtube");
        assert_eq!(preview.title, "Demo");
        assert_eq!(
            preview
                .payload
                .pointer("/snippet/title")
                .and_then(Value::as_str),
            Some("Demo")
        );
        assert_eq!(
            preview
                .payload
                .pointer("/snippet/description")
                .and_then(Value::as_str),
            Some("Desc")
        );
    }

    #[test]
    fn bilibili_dry_run_contains_payload() {
        let preview = dry_run_upload(
            "bilibili",
            UploadRequest {
                file: PathBuf::from("tmp/x.mp4"),
                title: "Demo".to_string(),
                desc: "Desc".to_string(),
                dry_run: true,
            },
        )
        .unwrap();

        assert_eq!(preview.platform, "bilibili");
        assert_eq!(
            preview
                .payload
                .pointer("/videos/0/path")
                .and_then(Value::as_str),
            Some("tmp/x.mp4")
        );
    }

    #[test]
    fn cli_requires_dry_run() {
        let err = run_cli(
            [
                "nf-publish",
                "upload",
                "--platform",
                "youtube",
                "--file",
                "tmp/x.mp4",
                "--title",
                "Demo",
                "--desc",
                "Desc",
            ]
            .into_iter()
            .map(str::to_string),
        )
        .unwrap_err()
        .to_string();

        assert!(err.contains("actual upload is disabled"));
    }
}
