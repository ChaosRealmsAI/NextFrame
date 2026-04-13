#[cfg(not(test))]
use rfd::FileDialog;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::process::Command;
#[cfg(not(test))]
use std::process::ExitStatus;

use crate::fs::resolve_reveal_path;
use crate::util::validation::{require_array, require_string, require_string_alias};

pub(crate) fn handle_fs_dialog_open(params: &Value) -> Result<Value, String> {
    let filters = parse_dialog_filters(params)?;
    let selected = show_open_dialog(&filters);

    Ok(json!({
        "path": selected.as_ref().map(|path| path.display().to_string()),
        "canceled": selected.is_none(),
    }))
}

pub(crate) fn handle_fs_dialog_save(params: &Value) -> Result<Value, String> {
    let default_name = require_string_alias(params, &["defaultName", "default_name"])?;
    let selected =
        show_save_dialog(default_name).map(|path| with_default_extension(path, default_name));

    Ok(json!({
        "path": selected.as_ref().map(|path| path.display().to_string()),
        "canceled": selected.is_none(),
    }))
}

pub(crate) fn handle_fs_reveal(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_reveal_path(path)?;
    reveal_in_file_manager(&path_buf)
        .map_err(|error| format!("failed to reveal '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path_buf.display().to_string(),
        "revealed": true,
    }))
}

#[cfg(not(test))]
pub(crate) fn show_open_dialog(filters: &[String]) -> Option<PathBuf> {
    let mut dialog = FileDialog::new();

    if !filters.is_empty() {
        let filter_refs = filters.iter().map(String::as_str).collect::<Vec<_>>();
        dialog = dialog.add_filter("Supported Files", &filter_refs);
    }

    dialog.pick_file()
}

#[cfg(test)]
pub(crate) fn show_open_dialog(_filters: &[String]) -> Option<PathBuf> {
    Some(std::env::temp_dir().join("dialog-open.nfproj"))
}

#[cfg(not(test))]
pub(crate) fn show_save_dialog(default_name: &str) -> Option<PathBuf> {
    let mut dialog = FileDialog::new().set_file_name(default_name);

    if let Some(extension) = Path::new(default_name)
        .extension()
        .and_then(|value| value.to_str())
    {
        dialog = dialog.add_filter("NextFrame Projects", &[extension]);
    }

    dialog.save_file()
}

#[cfg(test)]
pub(crate) fn show_save_dialog(default_name: &str) -> Option<PathBuf> {
    Some(std::env::temp_dir().join(default_name))
}

#[cfg(not(test))]
pub(crate) fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_platform_command("open", [String::from("-R"), path.display().to_string()])
    }

    #[cfg(target_os = "windows")]
    {
        run_platform_command("explorer", [format!("/select,{}", path.display())])
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        run_platform_command("xdg-open", [target.display().to_string()])
    }
}

#[cfg(not(test))]
pub(crate) fn run_platform_command(
    program: &str,
    args: impl IntoIterator<Item = String>,
) -> Result<(), String> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "command exited with {}",
            format_exit_status(status)
        ))
    }
}

#[cfg(test)]
pub(crate) fn reveal_in_file_manager(_path: &Path) -> Result<(), String> {
    Ok(())
}

pub(crate) fn parse_dialog_filters(params: &Value) -> Result<Vec<String>, String> {
    let filters = require_array(params, "filters")?;
    let mut extensions = Vec::new();

    for (index, filter) in filters.iter().enumerate() {
        match filter {
            Value::String(extension) => {
                if let Some(normalized) = normalize_extension(extension) {
                    extensions.push(normalized);
                } else {
                    return Err(format!("params.filters[{index}] must not be empty"));
                }
            }
            Value::Object(object) => {
                let values = object
                    .get("extensions")
                    .and_then(Value::as_array)
                    .ok_or_else(|| {
                        format!("params.filters[{index}].extensions must be an array")
                    })?;

                for (extension_index, value) in values.iter().enumerate() {
                    let extension = value.as_str().ok_or_else(|| {
                        format!(
                            "params.filters[{index}].extensions[{extension_index}] must be a string"
                        )
                    })?;

                    if let Some(normalized) = normalize_extension(extension) {
                        extensions.push(normalized);
                    } else {
                        return Err(format!(
                            "params.filters[{index}].extensions[{extension_index}] must not be empty"
                        ));
                    }
                }
            }
            _ => {
                return Err(format!(
                    "params.filters[{index}] must be a string or filter object"
                ));
            }
        }
    }

    Ok(extensions)
}

pub(crate) fn normalize_extension(extension: &str) -> Option<String> {
    let trimmed = extension.trim().trim_start_matches('.');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn with_default_extension(path: PathBuf, default_name: &str) -> PathBuf {
    if path.extension().is_some() {
        return path;
    }

    let Some(extension) = Path::new(default_name)
        .extension()
        .and_then(|value| value.to_str())
    else {
        return path;
    };

    if extension.is_empty() {
        return path;
    }

    path.with_extension(extension)
}

#[cfg(not(test))]
pub(crate) fn format_exit_status(status: ExitStatus) -> String {
    match status.code() {
        Some(code) => format!("exit_code_{code}"),
        None => "terminated_by_signal".to_string(),
    }
}
