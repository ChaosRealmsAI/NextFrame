//! Architecture test — enforces crate dependency direction per modules.json.
//!
//! v1.1 workspace has only one Rust crate (nf-cli), so this test scans source
//! files for forbidden `use nf_*` imports. When future crates are added (e.g.
//! nf-core in v1.3 if it lands in Rust), the forbid list grows and the scan
//! catches any reverse edge at test time.

use std::fs;
use std::path::{Path, PathBuf};

/// Crates that nf-cli is not allowed to `use` as a library.
/// v1.1: none exist yet — nf-core-engine is TypeScript, invoked via subprocess.
/// Any future `nf_*` Rust crate added to the workspace must declare here whether
/// nf-cli is permitted to depend on it.
const FORBIDDEN_USE_PREFIXES: &[&str] = &[
    // Examples for future expansion:
    // "use nf_core_engine", // — nf-cli must subprocess, never link
    // "use nf_runtime",     // — runtime is browser-only JS
];

fn collect_rs_files(root: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            // Skip target / node_modules / hidden dirs.
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

// Tests use `-> Result<(), String>` so a failure returns an Err instead of
// panicking — workspace lints deny `panic!` / `unwrap` / `expect` in all
// targets (including tests), and the test harness treats Err returns as
// test failures with the message printed.

#[test]
fn nf_cli_has_no_reverse_crate_deps() -> Result<(), String> {
    // Locate the crate src dir relative to CARGO_MANIFEST_DIR.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| ".".into());
    let src_dir = Path::new(&manifest_dir).join("src");

    let mut files = Vec::new();
    if src_dir.exists() {
        collect_rs_files(&src_dir, &mut files)
            .map_err(|e| format!("failed to walk src dir: {e}"))?;
    }

    let mut violations: Vec<String> = Vec::new();
    for file in &files {
        let content = match fs::read_to_string(file) {
            Ok(s) => s,
            Err(_) => continue,
        };
        for (line_no, line) in content.lines().enumerate() {
            let trimmed = line.trim_start();
            for prefix in FORBIDDEN_USE_PREFIXES {
                if trimmed.starts_with(prefix) {
                    violations.push(format!(
                        "{}:{} — forbidden import: {}",
                        file.display(),
                        line_no + 1,
                        trimmed
                    ));
                }
            }
        }
    }

    if violations.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "architecture violations found:\n{}",
            violations.join("\n")
        ))
    }
}

#[test]
fn workspace_modules_contract_exists() -> Result<(), String> {
    // Ensures the modules.json contract is discoverable from the repo root.
    // If someone moves or deletes it, this test breaks → forces re-thinking
    // crate boundaries before shipping.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| ".".into());
    // nf-cli sits at src/nf-cli/, so repo root is two levels up.
    let repo_root = Path::new(&manifest_dir)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let modules_json = repo_root
        .join("spec")
        .join("versions")
        .join("v1.1")
        .join("spec")
        .join("modules.json");
    if modules_json.exists() {
        Ok(())
    } else {
        Err(format!("missing contract file: {}", modules_json.display()))
    }
}
