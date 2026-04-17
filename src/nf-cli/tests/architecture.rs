//! Architecture invariants for the v2.0 walking skeleton.

#[path = "support/architecture_support.rs"]
mod architecture_support;

use architecture_support::{
    assert_dependency_graph_is_dag_and_matches_adr, load_ban_frameworks, load_workspace_metadata,
    manifests_missing_workspace_lints, mod_rs_reexport_violations, nf_core_reverse_dep_violations,
    repo_root, scan_forbidden_crates, validate_ban_frameworks_contents,
};

#[test]
fn dependency_graph_is_dag_and_matches_adr() {
    let meta = match load_workspace_metadata() {
        Ok(meta) => meta,
        Err(err) => panic_test(&err),
    };
    if let Err(err) = assert_dependency_graph_is_dag_and_matches_adr(&meta) {
        panic_test(&err);
    }
}

#[test]
fn forbidden_crates_scanner_and_denylist_are_clean() {
    let repo_root = match repo_root() {
        Ok(root) => root,
        Err(err) => panic_test(&err),
    };
    let denylist = match load_ban_frameworks(&repo_root) {
        Ok(denylist) => denylist,
        Err(err) => panic_test(&err),
    };
    if let Err(err) = validate_ban_frameworks_contents(&denylist) {
        panic_test(&err);
    }

    let violations = match scan_forbidden_crates(&repo_root, &denylist) {
        Ok(violations) => violations,
        Err(err) => panic_test(&err),
    };
    assert!(
        violations.is_empty(),
        "forbidden crates found: {violations:?}"
    );
}

#[test]
fn src_crates_inherit_workspace_lints() {
    let repo_root = match repo_root() {
        Ok(root) => root,
        Err(err) => panic_test(&err),
    };
    let missing = match manifests_missing_workspace_lints(&repo_root) {
        Ok(missing) => missing,
        Err(err) => panic_test(&err),
    };
    assert!(
        missing.is_empty(),
        "missing [lints] workspace = true: {missing:?}"
    );
}

#[test]
fn nf_core_crates_do_not_reverse_depend_on_runtime_rust_crates() {
    let meta = match load_workspace_metadata() {
        Ok(meta) => meta,
        Err(err) => panic_test(&err),
    };
    let violations = match nf_core_reverse_dep_violations(&meta) {
        Ok(violations) => violations,
        Err(err) => panic_test(&err),
    };
    assert!(
        violations.is_empty(),
        "forbidden nf-core reverse deps: {violations:?}"
    );
}

#[test]
fn mod_rs_files_reexport_public_surface_or_define_traits() {
    let repo_root = match repo_root() {
        Ok(root) => root,
        Err(err) => panic_test(&err),
    };
    let violations = match mod_rs_reexport_violations(&repo_root) {
        Ok(violations) => violations,
        Err(err) => panic_test(&err),
    };
    assert!(
        violations.is_empty(),
        "mod.rs files must contain `pub use` or `pub trait`: {violations:?}"
    );
}

#[track_caller]
#[allow(clippy::panic)]
fn panic_test(message: &str) -> ! {
    panic!("{message}");
}
