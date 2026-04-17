//! Architecture invariants — enforce single-direction dependency graph for the 3 Rust crates.
//! Runs `cargo metadata` and asserts the edge set, failing on cycles or reverse edges.

use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};
use std::process::Command;

#[test]
fn dependency_graph_is_dag_and_matches_adr() {
    let output = match Command::new(env!("CARGO"))
        .arg("metadata")
        .arg("--format-version=1")
        .arg("--no-deps")
        .output()
    {
        Ok(o) => o,
        Err(e) => panic_test(&format!("cargo metadata failed to run: {}", e)),
    };
    if !output.status.success() {
        panic_test(&format!(
            "cargo metadata exited non-zero: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let meta: serde_json::Value = match serde_json::from_slice(&output.stdout) {
        Ok(v) => v,
        Err(e) => panic_test(&format!("cargo metadata json: {}", e)),
    };
    let packages = match meta["packages"].as_array() {
        Some(arr) => arr,
        None => panic_test("packages array missing"),
    };
    // With --no-deps, packages is exactly the workspace members.
    let members: BTreeSet<String> = packages
        .iter()
        .filter_map(|p| p["name"].as_str().map(ToString::to_string))
        .collect();

    let mut edges: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for pkg in packages {
        let name = pkg["name"].as_str().unwrap_or("").to_string();
        if !members.contains(&name) {
            continue;
        }
        let mut out = BTreeSet::new();
        for dep in pkg["dependencies"].as_array().cloned().unwrap_or_default() {
            let dep_name = dep["name"].as_str().unwrap_or("").to_string();
            if members.contains(&dep_name) {
                out.insert(dep_name);
            }
        }
        edges.insert(name, out);
    }

    let expected: BTreeMap<&str, BTreeSet<&str>> = [
        ("nf-cli", ["nf-shell-mac", "nf-recorder"].iter().copied().collect()),
        ("nf-shell-mac", ["nf-recorder"].iter().copied().collect()),
        ("nf-recorder", BTreeSet::new()),
    ]
    .into_iter()
    .collect();

    for (pkg, expect) in &expected {
        let got = edges.get(*pkg).cloned().unwrap_or_default();
        let got_refs: BTreeSet<&str> = got.iter().map(String::as_str).collect();
        assert_eq!(
            &got_refs, expect,
            "edges for {} diverge from ADR-025: got {:?}, expected {:?}",
            pkg, got_refs, expect
        );
    }

    let mut indeg: BTreeMap<String, usize> = edges.keys().map(|k| (k.clone(), 0)).collect();
    for deps in edges.values() {
        for d in deps {
            if let Some(v) = indeg.get_mut(d) {
                *v += 1;
            }
        }
    }
    let mut queue: VecDeque<String> = indeg
        .iter()
        .filter(|(_, n)| **n == 0)
        .map(|(k, _)| k.clone())
        .collect();
    let mut visited: HashSet<String> = HashSet::new();
    while let Some(n) = queue.pop_front() {
        visited.insert(n.clone());
        for d in edges.get(&n).cloned().unwrap_or_default() {
            if let Some(v) = indeg.get_mut(&d) {
                *v -= 1;
                if *v == 0 {
                    queue.push_back(d);
                }
            }
        }
    }
    assert_eq!(
        visited.len(),
        edges.len(),
        "dependency graph has a cycle (visited {:?}, all {:?})",
        visited,
        edges.keys().collect::<Vec<_>>()
    );
}

#[track_caller]
#[allow(clippy::panic)]
fn panic_test(msg: &str) -> ! {
    panic!("{msg}");
}
