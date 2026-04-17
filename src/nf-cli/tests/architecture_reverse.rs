#[allow(dead_code)]
#[path = "support/architecture_support.rs"]
mod architecture_support;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use architecture_support::{
    assert_dependency_graph_is_dag_and_matches_adr, manifest_inherits_workspace_lints,
    manifests_missing_workspace_lints, mod_rs_reexport_violations, nf_core_reverse_dep_violations,
    parse_ban_frameworks, scan_forbidden_crates, validate_ban_frameworks_contents,
};

#[test]
fn forbidden_crate_scanner_rejects_banned_manifest_tokens() {
    let root = match temp_test_dir("forbidden-crate") {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };
    let manifest = root.join("demo/Cargo.toml");
    if let Err(err) = write_file(
        &manifest,
        "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n[dependencies]\nreact = \"18\"\n",
    ) {
        panic_test(&err);
    }

    let denylist = vec!["react".to_string()];
    let violations = match scan_forbidden_crates(&root, &denylist) {
        Ok(violations) => violations,
        Err(err) => panic_test(&err),
    };

    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].banned_tokens, vec!["react".to_string()]);
}

#[test]
fn denylist_file_validation_rejects_missing_entries() {
    let denylist = match parse_ban_frameworks("deny = [\"tauri\", \"react\"]\n") {
        Ok(denylist) => denylist,
        Err(err) => panic_test(&err),
    };
    let err = match validate_ban_frameworks_contents(&denylist) {
        Ok(()) => panic_test("expected denylist validation to fail"),
        Err(err) => err,
    };
    assert!(err.contains("missing"));
}

#[test]
fn workspace_lints_guard_rejects_missing_inheritance() {
    assert!(!manifest_inherits_workspace_lints(
        "[package]\nname = \"demo\"\n"
    ));

    let root = match temp_test_dir("workspace-lints") {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };
    let manifest = root.join("src/demo/Cargo.toml");
    if let Err(err) = write_file(
        &manifest,
        "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n",
    ) {
        panic_test(&err);
    }

    let missing = match manifests_missing_workspace_lints(&root) {
        Ok(missing) => missing,
        Err(err) => panic_test(&err),
    };
    assert_eq!(missing, vec![manifest]);
}

#[test]
fn nf_core_reverse_dep_guard_rejects_forbidden_edges() {
    let meta = serde_json::json!({
        "packages": [
            {
                "name": "nf-core-app",
                "dependencies": [
                    { "name": "nf-cli" }
                ]
            },
            {
                "name": "nf-cli",
                "dependencies": []
            }
        ]
    });

    let violations = match nf_core_reverse_dep_violations(&meta) {
        Ok(violations) => violations,
        Err(err) => panic_test(&err),
    };
    assert_eq!(violations.len(), 1);
    assert!(violations[0].contains("nf-core-app"));
}

#[test]
fn mod_rs_guard_rejects_missing_reexports_and_traits() {
    let root = match temp_test_dir("mod-rs") {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };
    let mod_file = root.join("src/demo/src/commands/mod.rs");
    if let Err(err) = write_file(&mod_file, "pub mod build;\n") {
        panic_test(&err);
    }

    let violations = match mod_rs_reexport_violations(&root) {
        Ok(violations) => violations,
        Err(err) => panic_test(&err),
    };
    assert_eq!(violations, vec![mod_file]);
}

#[test]
fn dag_guard_rejects_cycles() {
    let meta = serde_json::json!({
        "packages": [
            {
                "name": "nf-cli",
                "dependencies": [{ "name": "nf-shell-mac" }]
            },
            {
                "name": "nf-shell-mac",
                "dependencies": [{ "name": "nf-recorder" }]
            },
            {
                "name": "nf-recorder",
                "dependencies": [{ "name": "nf-cli" }]
            }
        ]
    });

    let err = match assert_dependency_graph_is_dag_and_matches_adr(&meta) {
        Ok(()) => panic_test("expected dag validation to fail"),
        Err(err) => err,
    };
    assert!(err.contains("cycle"));
}

fn temp_test_dir(label: &str) -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("clock failure: {err}"))?
        .as_nanos();
    let dir =
        std::env::temp_dir().join(format!("nextframe-{label}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|err| format!("create {}: {err}", dir.display()))?;
    Ok(dir)
}

fn write_file(path: &Path, contents: &str) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err(format!("parent missing for {}", path.display()));
    };
    fs::create_dir_all(parent).map_err(|err| format!("create {}: {err}", parent.display()))?;
    fs::write(path, contents).map_err(|err| format!("write {}: {err}", path.display()))
}

#[track_caller]
#[allow(clippy::panic)]
fn panic_test(message: &str) -> ! {
    panic!("{message}");
}
