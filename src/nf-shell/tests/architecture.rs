use std::fs;
use std::path::{Path, PathBuf};

fn collect_rs_files(root: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name == "target" || name == "node_modules" || name.starts_with('.') {
                continue;
            }
            collect_rs_files(&path, out)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            out.push(path);
        }
    }
    Ok(())
}

#[test]
fn platform_split_files_exist() -> Result<(), String> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into());
    let src_dir = Path::new(&manifest_dir).join("src").join("platform");
    let expected = ["mod.rs", "mac.rs", "win.rs", "linux.rs"];
    let missing: Vec<String> = expected
        .iter()
        .map(|name| src_dir.join(name))
        .filter(|path| !path.exists())
        .map(|path| path.display().to_string())
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "missing platform split files:\n{}",
            missing.join("\n")
        ))
    }
}

#[test]
fn platform_guard_isolated_to_mac_module() -> Result<(), String> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into());
    let src_dir = Path::new(&manifest_dir).join("src");

    let mut files = Vec::new();
    collect_rs_files(&src_dir, &mut files).map_err(|e| format!("walk src failed: {e}"))?;

    let needle = ["cfg(", "target_os"].concat();
    let mac_suffix = Path::new("src").join("platform").join("mac.rs");
    let mut violations = Vec::new();
    let mut seen_mac_guard = false;

    for file in files {
        let content = match fs::read_to_string(&file) {
            Ok(s) => s,
            Err(_) => continue,
        };
        if content.contains(&needle) {
            if file.ends_with(&mac_suffix) {
                seen_mac_guard = true;
            } else {
                violations.push(file.display().to_string());
            }
        }
    }

    if !violations.is_empty() {
        return Err(format!(
            "platform guard leaked outside mac module:\n{}",
            violations.join("\n")
        ));
    }
    if !seen_mac_guard {
        return Err("expected src/platform/mac.rs to contain the macOS guard".into());
    }
    Ok(())
}
