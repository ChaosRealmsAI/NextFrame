use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::errors::NfError;

pub(super) fn write_json(path: &Path, value: &Value) -> Result<(), NfError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)
        .map_err(|err| NfError::StorageFailed(format!("write failed: {}: {err}", path.display())))
}

pub(super) fn copy_file(from: &Path, to: &Path) -> Result<(), NfError> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(from, to).map(|_| ()).map_err(|err| {
        NfError::StorageFailed(format!(
            "copy failed: {} -> {}: {err}",
            from.display(),
            to.display()
        ))
    })
}

pub(super) fn file_url(path: &Path) -> Result<String, NfError> {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|err| NfError::StorageFailed(format!("current directory failed: {err}")))?
            .join(path)
    };
    let mut encoded = String::new();
    for byte in path.to_string_lossy().as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(char::from(*byte))
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    Ok(format!("file://{encoded}"))
}
