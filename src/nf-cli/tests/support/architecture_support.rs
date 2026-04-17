use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub(crate) const REQUIRED_FORBIDDEN_CRATES: &[&str] = &[
    "tauri",
    "electron",
    "react",
    "vue",
    "svelte",
    "next",
    "bevy",
    "actix-web",
    "egui",
    "gsap",
    "lottie",
    "metal-rs",
    "io-surface",
    "videotoolbox-sys",
    "cocoa-rs",
    "libc-rs-legacy",
];

pub(crate) const FORBIDDEN_CORE_REVERSE_DEPS: &[&str] = &["nf-shell-mac", "nf-recorder", "nf-cli"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManifestViolation {
    pub path: PathBuf,
    pub banned_tokens: Vec<String>,
}

pub(crate) fn repo_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .map_err(|err| format!("resolve repo root: {err}"))
}

pub(crate) fn load_workspace_metadata() -> Result<serde_json::Value, String> {
    let repo_root = repo_root()?;
    let output = Command::new(env!("CARGO"))
        .arg("metadata")
        .arg("--format-version=1")
        .arg("--no-deps")
        .current_dir(&repo_root)
        .output()
        .map_err(|err| format!("cargo metadata failed to run: {err}"))?;
    if !output.status.success() {
        return Err(format!(
            "cargo metadata exited non-zero: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|err| format!("cargo metadata json: {err}"))
}

pub(crate) fn assert_dependency_graph_is_dag_and_matches_adr(
    meta: &serde_json::Value,
) -> Result<(), String> {
    let edges = workspace_dependency_edges(meta)?;
    let mut indeg: BTreeMap<String, usize> = edges.keys().map(|name| (name.clone(), 0)).collect();
    for deps in edges.values() {
        for dep in deps {
            if let Some(count) = indeg.get_mut(dep) {
                *count += 1;
            }
        }
    }

    let mut queue: VecDeque<String> = indeg
        .iter()
        .filter(|(_, count)| **count == 0)
        .map(|(name, _)| name.clone())
        .collect();
    let mut visited = HashSet::new();
    while let Some(node) = queue.pop_front() {
        visited.insert(node.clone());
        for dep in edges.get(&node).cloned().unwrap_or_default() {
            if let Some(count) = indeg.get_mut(&dep) {
                *count -= 1;
                if *count == 0 {
                    queue.push_back(dep);
                }
            }
        }
    }

    if visited.len() != edges.len() {
        return Err(format!(
            "dependency graph has a cycle (visited {visited:?}, all {:?})",
            edges.keys().collect::<Vec<_>>()
        ));
    }

    let expected: BTreeMap<&str, BTreeSet<&str>> = [
        ("nf-core-app", BTreeSet::new()),
        ("nf-core-engine", BTreeSet::new()),
        (
            "nf-cli",
            ["nf-shell-mac", "nf-recorder"].iter().copied().collect(),
        ),
        ("nf-shell-mac", ["nf-recorder"].iter().copied().collect()),
        ("nf-recorder", BTreeSet::new()),
        ("nf-runtime", BTreeSet::new()),
        ("nf-tracks", BTreeSet::new()),
    ]
    .into_iter()
    .collect();

    for (pkg, expect) in &expected {
        let got = edges.get(*pkg).cloned().unwrap_or_default();
        let got_refs: BTreeSet<&str> = got.iter().map(String::as_str).collect();
        if &got_refs != expect {
            return Err(format!(
                "edges for {pkg} diverge from ADR-025: got {got_refs:?}, expected {expect:?}"
            ));
        }
    }

    Ok(())
}

pub(crate) fn workspace_dependency_edges(
    meta: &serde_json::Value,
) -> Result<BTreeMap<String, BTreeSet<String>>, String> {
    let packages = packages(meta)?;
    let members: BTreeSet<String> = packages
        .iter()
        .filter_map(package_name)
        .map(ToOwned::to_owned)
        .collect();

    let mut edges = BTreeMap::new();
    for pkg in packages {
        let name = match package_name(pkg) {
            Some(name) => name.to_owned(),
            None => continue,
        };

        let deps = pkg
            .get("dependencies")
            .and_then(serde_json::Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut out = BTreeSet::new();
        for dep in deps {
            if let Some(dep_name) = dep.get("name").and_then(serde_json::Value::as_str) {
                if members.contains(dep_name) {
                    out.insert(dep_name.to_owned());
                }
            }
        }
        edges.insert(name, out);
    }
    Ok(edges)
}

pub(crate) fn load_ban_frameworks(root: &Path) -> Result<Vec<String>, String> {
    let path = root.join("ban_frameworks.toml");
    let contents =
        fs::read_to_string(&path).map_err(|err| format!("read {}: {err}", path.display()))?;
    parse_ban_frameworks(&contents)
}

pub(crate) fn parse_ban_frameworks(contents: &str) -> Result<Vec<String>, String> {
    let array_start = contents
        .find('[')
        .ok_or_else(|| "ban_frameworks.toml is missing '['".to_string())?;
    let array_end = contents
        .rfind(']')
        .ok_or_else(|| "ban_frameworks.toml is missing ']'".to_string())?;
    if array_end <= array_start {
        return Err("ban_frameworks.toml array is malformed".to_string());
    }

    let body = &contents[array_start + 1..array_end];
    let mut items = Vec::new();
    for raw in body.split(',') {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some(without_prefix) = trimmed.strip_prefix('"') else {
            return Err(format!(
                "ban_frameworks entry is not a quoted string: {trimmed}"
            ));
        };
        let Some(value) = without_prefix.strip_suffix('"') else {
            return Err(format!(
                "ban_frameworks entry is not a quoted string: {trimmed}"
            ));
        };
        items.push(value.to_owned());
    }
    Ok(items)
}

pub(crate) fn validate_ban_frameworks_contents(entries: &[String]) -> Result<(), String> {
    let expected: BTreeSet<String> = REQUIRED_FORBIDDEN_CRATES
        .iter()
        .map(|name| (*name).to_owned())
        .collect();
    let actual: BTreeSet<String> = entries.iter().cloned().collect();

    let missing: Vec<String> = expected.difference(&actual).cloned().collect();
    let extra: Vec<String> = actual.difference(&expected).cloned().collect();
    if !missing.is_empty() || !extra.is_empty() {
        return Err(format!(
            "ban_frameworks.toml mismatch; missing {missing:?}, extra {extra:?}"
        ));
    }
    Ok(())
}

pub(crate) fn scan_forbidden_crates(
    root: &Path,
    denylist: &[String],
) -> Result<Vec<ManifestViolation>, String> {
    let manifests = collect_named_files(root, "Cargo.toml")?;
    let denyset: BTreeSet<&str> = denylist.iter().map(String::as_str).collect();
    let mut violations = Vec::new();

    for manifest in manifests {
        let contents = fs::read_to_string(&manifest)
            .map_err(|err| format!("read {}: {err}", manifest.display()))?;
        let mut hits = BTreeSet::new();
        for line in contents.lines() {
            let stripped = line.split('#').next().unwrap_or_default();
            for token in tokenize_manifest_line(stripped) {
                if denyset.contains(token.as_str()) {
                    hits.insert(token);
                }
            }
        }

        if !hits.is_empty() {
            violations.push(ManifestViolation {
                path: manifest,
                banned_tokens: hits.into_iter().collect(),
            });
        }
    }

    Ok(violations)
}

pub(crate) fn manifests_missing_workspace_lints(root: &Path) -> Result<Vec<PathBuf>, String> {
    let src_root = root.join("src");
    let entries =
        fs::read_dir(&src_root).map_err(|err| format!("read {}: {err}", src_root.display()))?;
    let mut missing = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|err| format!("read src entry: {err}"))?;
        let manifest = entry.path().join("Cargo.toml");
        if !manifest.is_file() {
            continue;
        }
        let contents = fs::read_to_string(&manifest)
            .map_err(|err| format!("read {}: {err}", manifest.display()))?;
        if !manifest_inherits_workspace_lints(&contents) {
            missing.push(manifest);
        }
    }

    Ok(missing)
}

pub(crate) fn manifest_inherits_workspace_lints(contents: &str) -> bool {
    let mut in_lints_section = false;
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            in_lints_section = line == "[lints]";
            continue;
        }
        if in_lints_section && line == "workspace = true" {
            return true;
        }
    }
    false
}

pub(crate) fn nf_core_reverse_dep_violations(
    meta: &serde_json::Value,
) -> Result<Vec<String>, String> {
    let edges = workspace_dependency_edges(meta)?;
    let forbidden: BTreeSet<&str> = FORBIDDEN_CORE_REVERSE_DEPS.iter().copied().collect();
    let mut violations = Vec::new();

    for (pkg, deps) in edges {
        if !pkg.starts_with("nf-core-") {
            continue;
        }
        let hits: Vec<String> = deps
            .iter()
            .filter(|dep| forbidden.contains(dep.as_str()))
            .cloned()
            .collect();
        if !hits.is_empty() {
            violations.push(format!("{pkg} depends on forbidden Rust crates {hits:?}"));
        }
    }

    Ok(violations)
}

pub(crate) fn mod_rs_reexport_violations(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mod_files = collect_named_files(&root.join("src"), "mod.rs")?;
    let mut violations = Vec::new();

    for mod_file in mod_files {
        let contents = fs::read_to_string(&mod_file)
            .map_err(|err| format!("read {}: {err}", mod_file.display()))?;
        if !contents.contains("pub use ") && !contents.contains("pub trait ") {
            violations.push(mod_file);
        }
    }

    Ok(violations)
}

fn collect_named_files(root: &Path, filename: &str) -> Result<Vec<PathBuf>, String> {
    let mut stack = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(dir) = stack.pop() {
        if should_skip_dir(&dir) {
            continue;
        }

        let entries = fs::read_dir(&dir).map_err(|err| format!("read {}: {err}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|err| format!("walk {}: {err}", dir.display()))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name == filename)
            {
                files.push(path);
            }
        }
    }

    files.sort();
    Ok(files)
}

fn should_skip_dir(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|name| matches!(name, "target" | "node_modules" | "legacy-v08"))
    })
}

fn tokenize_manifest_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in line.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
            current.push(ch);
        } else if !current.is_empty() {
            tokens.push(current.clone());
            current.clear();
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn packages(meta: &serde_json::Value) -> Result<&Vec<serde_json::Value>, String> {
    meta.get("packages")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "packages array missing".to_string())
}

fn package_name(pkg: &serde_json::Value) -> Option<&str> {
    pkg.get("name").and_then(serde_json::Value::as_str)
}
