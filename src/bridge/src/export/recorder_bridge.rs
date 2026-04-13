use std::path::{Path, PathBuf};

use crate::codec::encoding::{path_to_file_url, percent_decode_url_path};

pub(crate) fn build_recording_url(current_dir: &Path) -> Result<String, String> {
    let web_path = resolve_runtime_index_path(current_dir)?;

    Ok(format!("{}?record=true", path_to_file_url(&web_path)))
}

fn resolve_runtime_index_path(current_dir: &Path) -> Result<PathBuf, String> {
    for base in current_dir.ancestors() {
        for relative in ["src/runtime/web/index.html", "runtime/web/index.html"] {
            let candidate = base.join(relative);
            if let Ok(canonical) = candidate.canonicalize() {
                return Ok(canonical);
            }
        }
    }

    Err("failed to resolve runtime web index.html from current directory".to_string())
}

pub(crate) fn resolve_recorder_frame_path_from_url(
    url: &str,
    current_dir: &Path,
) -> Result<PathBuf, String> {
    let url_without_fragment = url.split('#').next().unwrap_or(url);
    let url_without_query = url_without_fragment
        .split('?')
        .next()
        .unwrap_or(url_without_fragment);

    if let Some(path) = url_without_query.strip_prefix("file://") {
        return decode_file_url_path(path);
    }

    if let Some(remainder) = url_without_query
        .strip_prefix("http://")
        .or_else(|| url_without_query.strip_prefix("https://"))
    {
        return resolve_http_recorder_frame_path(remainder, current_dir);
    }

    Err(format!("unsupported recorder url: {url}"))
}

pub(crate) fn decode_file_url_path(path: &str) -> Result<PathBuf, String> {
    let normalized = path.strip_prefix("localhost").unwrap_or(path);
    let decoded = percent_decode_url_path(normalized)?;

    if decoded.is_empty() {
        return Err("file URL does not contain a path".to_string());
    }

    Ok(PathBuf::from(decoded))
}

pub(crate) fn resolve_http_recorder_frame_path(
    remainder: &str,
    current_dir: &Path,
) -> Result<PathBuf, String> {
    let slash_index = remainder
        .find('/')
        .ok_or_else(|| format!("recorder URL does not contain a path: http://{remainder}"))?;
    let (authority, path) = remainder.split_at(slash_index);
    let host = authority.split(':').next().unwrap_or(authority);
    if host != "localhost" && host != "127.0.0.1" {
        return Err(format!("unsupported recorder host: {host}"));
    }

    let decoded = percent_decode_url_path(path)?;
    if decoded.is_empty() || decoded == "/" {
        return Err("recorder URL path does not point to an HTML file".to_string());
    }

    let absolute_candidate = PathBuf::from(&decoded);
    if absolute_candidate.is_file() {
        return Ok(absolute_candidate);
    }

    let relative = decoded.trim_start_matches('/');
    let relative_candidate = current_dir.join(relative);
    if relative_candidate.is_file() {
        return Ok(relative_candidate);
    }

    Err(format!(
        "failed to resolve recorder frame path from URL path '{decoded}'"
    ))
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct RecorderRequest {
    pub(crate) url: String,
    pub(crate) output_path: PathBuf,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) fps: u32,
    pub(crate) duration: f64,
    pub(crate) crf: u8,
}
