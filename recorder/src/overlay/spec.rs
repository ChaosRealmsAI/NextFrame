use std::path::{Path, PathBuf};

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
        percent
            .trim()
            .parse::<f64>()
            .map_err(|err| format!("invalid {label} percentage {raw:?}: {err}"))?
            / 100.0
            * axis_pixels
    } else if let Some(px) = trimmed.strip_suffix("px") {
        px.trim()
            .parse::<f64>()
            .map_err(|err| format!("invalid {label} pixel value {raw:?}: {err}"))?
            * dpr
    } else {
        trimmed
            .parse::<f64>()
            .map_err(|err| format!("invalid {label} value {raw:?}: {err}"))?
            * dpr
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
        let source_path = resolve_overlay_source(&layer.src, root, html_path)
            .ok_or_else(|| format!("failed to resolve video layer src {}", layer.src))?;
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
