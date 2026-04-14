//! recording module exports
pub(crate) mod config;
mod cleanup;
mod frame_loop;
mod setup;

use std::path::{Path, PathBuf};

use crate::plan::{SegmentPlan, SegmentSummary};
use crate::webview::WebViewHost;

use cleanup::finish_segment;
use config::SegmentRecordingConfig;
use frame_loop::record_frames;
use setup::prepare_segment;

/// Simple percent-decoding for file URLs.
fn urlencoding_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| (c as char).to_digit(16));
            let lo = chars.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                result.push((h * 16 + l) as u8 as char);
            } else {
                result.push('%');
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

fn strip_query_and_fragment(input: &str) -> &str {
    let end = input.find(['?', '#']).unwrap_or(input.len());
    &input[..end]
}

pub(crate) fn resolve_media_src(
    src: &str,
    server_base_url: Option<&str>,
    root: &Path,
    html_path: &Path,
) -> Option<PathBuf> {
    let raw = strip_query_and_fragment(src.trim());
    if raw.is_empty() {
        return None;
    }

    if let Some(stripped) = raw.strip_prefix("file://") {
        let decoded = urlencoding_decode(stripped.trim_start_matches("localhost/"));
        let path = PathBuf::from(decoded);
        return path.exists().then_some(path);
    }

    if raw.starts_with("http://") || raw.starts_with("https://") {
        if let Some(base_url) = server_base_url
            && let Some(relative) = raw.strip_prefix(base_url)
        {
            let path = root.join(urlencoding_decode(relative.trim_start_matches('/')));
            if path.exists() {
                return Some(path);
            }
        }
        if let Some((_, path_part)) = raw.split_once("://")
            && let Some((_, slash_and_path)) = path_part.split_once('/')
        {
            let path = root.join(urlencoding_decode(slash_and_path));
            if path.exists() {
                return Some(path);
            }
        }
        return None;
    }

    let decoded = urlencoding_decode(raw);
    let absolute = PathBuf::from(&decoded);
    if absolute.is_absolute() && absolute.exists() {
        return Some(absolute);
    }
    if decoded.starts_with('/') {
        let from_root = root.join(decoded.trim_start_matches('/'));
        if from_root.exists() {
            return Some(from_root);
        }
        if absolute.exists() {
            return Some(absolute);
        }
    }

    let parent = html_path.parent().unwrap_or_else(|| Path::new("."));
    let relative = parent.join(decoded);
    relative.exists().then_some(relative)
}

pub fn record_segment(
    host: &mut WebViewHost,
    plan: &SegmentPlan,
    cfg: &SegmentRecordingConfig<'_>,
) -> Result<SegmentSummary, String> {
    let mut context = prepare_segment(host, plan, cfg)?;
    let frames_recorded = record_frames(host, plan, cfg, &mut context)?;
    finish_segment(plan, cfg.backend, context, frames_recorded)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use std::fs;
    use std::path::Path;

    use super::resolve_media_src;

    #[test]
    fn resolves_relative_media_against_html_parent() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("demo.html");
        let media = root.join("clip.mp4");
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&media, b"clip").unwrap();

        let resolved = resolve_media_src("clip.mp4", None, &root, &html);

        assert_eq!(resolved.as_deref(), Some(media.as_path()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolves_server_media_url_to_root_path() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("slides").join("demo.html");
        let media_dir = root.join("videos");
        let media = media_dir.join("clip.mp4");
        fs::create_dir_all(html.parent().unwrap()).unwrap();
        fs::create_dir_all(&media_dir).unwrap();
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&media, b"clip").unwrap();

        let resolved = resolve_media_src(
            "http://127.0.0.1:9000/videos/clip.mp4?cache=1",
            Some("http://127.0.0.1:9000"),
            &root,
            &html,
        );

        assert_eq!(resolved.as_deref(), Some(media.as_path()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolves_percent_encoded_file_url() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("demo.html");
        let media = root.join("clip name.mp4");
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&media, b"clip").unwrap();
        let url = format!("file://{}", media.display()).replace(' ', "%20");

        let resolved = resolve_media_src(&url, None, Path::new("/"), &html);

        assert_eq!(resolved.as_deref(), Some(media.as_path()));
        let _ = fs::remove_dir_all(root);
    }
}
