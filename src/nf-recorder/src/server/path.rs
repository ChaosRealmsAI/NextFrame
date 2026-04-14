//! local server request path resolution
use std::path::{Component, Path, PathBuf};

pub(super) enum ResolvedRequestPath {
    Found(PathBuf),
    NotFound,
    Forbidden,
}

pub(super) fn resolve_request_path(
    root: &Path,
    raw_path: &str,
) -> Result<ResolvedRequestPath, String> {
    let decoded = percent_decode(raw_path.split('?').next().unwrap_or("/"))?;
    let trimmed = decoded.trim_start_matches('/');
    let requested = if trimmed.is_empty() {
        "index.html"
    } else {
        trimmed
    };

    if Path::new(requested)
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Ok(ResolvedRequestPath::Forbidden);
    }

    // Keep serving symlinked files under the project tree, but reject
    // explicit parent-directory traversal in the request URL.
    let candidate = root.join(requested);
    let Ok(resolved) = candidate.canonicalize() else {
        return Ok(ResolvedRequestPath::NotFound);
    };
    if resolved.is_dir() {
        return Ok(ResolvedRequestPath::NotFound);
    }
    // Safety: allow files under the project tree (not just server root),
    // because symlinks (style/slidekit → engine/slidekit) resolve outside root.
    let project_root = root.ancestors().nth(4).unwrap_or(root);
    if !resolved.starts_with(project_root) {
        return Ok(ResolvedRequestPath::Forbidden);
    }
    Ok(ResolvedRequestPath::Found(resolved))
}

fn percent_decode(source: &str) -> Result<String, String> {
    let bytes = source.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                    .map_err(|err| format!("invalid percent escape: {err}"))?;
                let value = u8::from_str_radix(hex, 16)
                    .map_err(|err| format!("invalid percent escape %{hex}: {err}"))?;
                decoded.push(value);
                index += 3;
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(decoded).map_err(|err| format!("invalid UTF-8 request path: {err}"))
}
