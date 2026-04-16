//! overlay specs
use std::path::{Path, PathBuf};

use crate::error_with_fix;
use crate::plan::VideoLayerInfo;

#[derive(Debug, Clone, PartialEq)]
pub struct VideoOverlaySpec {
    pub source_path: PathBuf,
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub height: usize,
    pub start_sec: f64,
    pub duration_sec: f64,
}

fn urlencoding_decode(input: &str) -> String {
    // Fast path: no percent-encoding, return as-is (preserves UTF-8 multi-byte chars)
    if !input.contains('%') {
        return input.to_owned();
    }
    // Decode percent-encoded bytes into a byte buffer, then convert to UTF-8
    let mut bytes = Vec::with_capacity(input.len());
    let mut src = input.bytes();
    while let Some(b) = src.next() {
        if b == b'%' {
            let hi = src.next().and_then(|c| (c as char).to_digit(16));
            let lo = src.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                bytes.push((h * 16 + l) as u8);
            } else {
                bytes.push(b'%');
            }
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| input.to_owned())
}

fn strip_query_and_fragment(input: &str) -> &str {
    let end = input.find(['?', '#']).unwrap_or(input.len());
    &input[..end]
}

fn resolve_overlay_source(src: &str, root: &Path, html_path: &Path) -> Option<PathBuf> {
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
    }

    let parent = html_path.parent().unwrap_or_else(|| Path::new("."));
    let relative = parent.join(decoded);
    relative.exists().then_some(relative)
}

fn parse_layer_axis(raw: &str, axis_pixels: f64, dpr: f64, label: &str) -> Result<usize, String> {
    let trimmed = raw.trim();
    let value = if let Some(percent) = trimmed.strip_suffix('%') {
        percent.trim().parse::<f64>().map_err(|err| {
            error_with_fix(
                "parse the video overlay percentage value",
                format!("invalid {label} percentage {raw:?}: {err}"),
                "Use numeric percentage values such as `50%` for overlay positioning and sizing.",
            )
        })? / 100.0
            * axis_pixels
    } else if let Some(px) = trimmed.strip_suffix("px") {
        px.trim().parse::<f64>().map_err(|err| {
            error_with_fix(
                "parse the video overlay pixel value",
                format!("invalid {label} pixel value {raw:?}: {err}"),
                "Use numeric pixel values such as `320px` for overlay positioning and sizing.",
            )
        })? * dpr
    } else {
        trimmed.parse::<f64>().map_err(|err| {
            error_with_fix(
                "parse the video overlay value",
                format!("invalid {label} value {raw:?}: {err}"),
                "Use numeric values or CSS-like percentages for overlay positioning and sizing.",
            )
        })? * dpr
    };
    Ok(value.round().max(0.0) as usize)
}

pub fn build_video_overlay_specs(
    layers: &[VideoLayerInfo],
    root: &Path,
    html_path: &Path,
    output_width_css: f64,
    output_height_css: f64,
    dpr: f64,
) -> Result<Vec<VideoOverlaySpec>, String> {
    let output_width_px = (output_width_css * dpr).round().max(1.0);
    let output_height_px = (output_height_css * dpr).round().max(1.0);
    let mut overlays = Vec::with_capacity(layers.len());

    for layer in layers {
        let source_path = resolve_overlay_source(&layer.src, root, html_path).ok_or_else(|| {
            error_with_fix(
                "resolve the video overlay source",
                format!("failed to resolve video layer src {}", layer.src),
                "Use a reachable file path or project-relative URL for the video layer source.",
            )
        })?;
        let width = parse_layer_axis(&layer.w, output_width_px, dpr, "w")?;
        let height = parse_layer_axis(&layer.h, output_height_px, dpr, "h")?;
        if width == 0 || height == 0 || layer.dur <= 0.0 {
            continue;
        }
        overlays.push(VideoOverlaySpec {
            source_path,
            x: parse_layer_axis(&layer.x, output_width_px, dpr, "x")?,
            y: parse_layer_axis(&layer.y, output_height_px, dpr, "y")?,
            width,
            height,
            start_sec: layer.start.max(0.0),
            duration_sec: layer.dur.max(0.0),
        });
    }

    Ok(overlays)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencoding_decode_passthrough_ascii() {
        assert_eq!(urlencoding_decode("/tmp/video.mp4"), "/tmp/video.mp4");
    }

    #[test]
    fn urlencoding_decode_passthrough_chinese() {
        // Chinese characters should pass through unchanged (no % encoding)
        let path = "/Users/张/bigbang/硅谷访谈/clips/clip_01.mp4";
        assert_eq!(urlencoding_decode(path), path);
    }

    #[test]
    fn urlencoding_decode_percent_encoded_chinese() {
        // %E4%B8%AD%E6%96%87 = "中文" in UTF-8
        assert_eq!(urlencoding_decode("%E4%B8%AD%E6%96%87"), "中文");
    }

    #[test]
    fn urlencoding_decode_mixed() {
        // Mix of encoded and plain characters
        assert_eq!(
            urlencoding_decode("/Users/%E5%BC%A0/video.mp4"),
            "/Users/张/video.mp4"
        );
    }

    #[test]
    fn urlencoding_decode_space() {
        assert_eq!(urlencoding_decode("hello%20world"), "hello world");
    }
}
