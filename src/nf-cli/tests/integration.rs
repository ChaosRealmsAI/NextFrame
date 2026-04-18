//! Integration tests for nf-cli — drive the built `nf` binary via `assert_cmd`.
//!
//! All tests assert:
//!   1. exit code == expected
//!   2. stdout is strictly JSON-only (every non-empty line parses)
//!
//! Tests use `Result<(), String>` returns (workspace lints deny panic/unwrap).

use std::path::PathBuf;
use std::process::Command;

use assert_cmd::cargo::CommandCargoExt;
use serde_json::Value;
use tempfile::TempDir;

fn nf() -> Result<Command, String> {
    Command::cargo_bin("nf").map_err(|e| format!("could not locate nf binary: {e}"))
}

fn repo_root() -> PathBuf {
    // CARGO_MANIFEST_DIR is src/nf-cli → repo root is two levels up.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn assert_json_lines(stdout: &str) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    for line in stdout.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let v: Value = serde_json::from_str(l)
            .map_err(|e| format!("non-JSON stdout line '{l}': {e}"))?;
        out.push(v);
    }
    Ok(out)
}

#[test]
fn nf_new_produces_valid_json() -> Result<(), String> {
    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let out = tmp.path().join("test.json");

    let mut cmd = nf()?;
    let output = cmd
        .arg("new")
        .arg("-o")
        .arg(&out)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "nf new failed: stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let lines = assert_json_lines(&String::from_utf8_lossy(&output.stdout))?;
    if lines.is_empty() {
        return Err("no stdout from nf new".into());
    }
    let last = lines.last().ok_or("no last line")?;
    if last.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Err(format!("expected ok=true, got {last}"));
    }

    if !out.is_file() {
        return Err(format!("{} not created", out.display()));
    }

    // Ensure produced file parses as JSON.
    let body = std::fs::read_to_string(&out).map_err(|e| e.to_string())?;
    let _v: Value = serde_json::from_str(&body).map_err(|e| format!("template JSON invalid: {e}"))?;

    Ok(())
}

#[test]
fn nf_build_demo_fixture_end_to_end() -> Result<(), String> {
    let demo = repo_root()
        .join("spec")
        .join("versions")
        .join("v1.1")
        .join("spec")
        .join("demo.sample.json");
    if !demo.is_file() {
        // Fixture missing in some harness layouts — skip rather than fail hard.
        return Ok(());
    }

    let tmp = TempDir::new().map_err(|e| e.to_string())?;
    let out = tmp.path().join("out.html");

    let mut cmd = nf()?;
    cmd.current_dir(repo_root());
    let output = cmd
        .arg("build")
        .arg(&demo)
        .arg("-o")
        .arg(&out)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "nf build failed: exit={:?} stdout={} stderr={}",
            output.status.code(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let lines = assert_json_lines(&String::from_utf8_lossy(&output.stdout))?;
    if lines.is_empty() {
        return Err("no stdout from nf build".into());
    }

    if !out.is_file() {
        return Err(format!("{} not created", out.display()));
    }
    let html = std::fs::read_to_string(&out).map_err(|e| e.to_string())?;
    if !html.contains("nf-stage") {
        return Err("out.html missing <div id=\"nf-stage\">".into());
    }
    if html.len() < 1000 {
        return Err(format!("out.html suspiciously small: {} bytes", html.len()));
    }

    Ok(())
}

#[test]
fn nf_validate_demo_fixture() -> Result<(), String> {
    let demo = repo_root()
        .join("spec")
        .join("versions")
        .join("v1.1")
        .join("spec")
        .join("demo.sample.json");
    if !demo.is_file() {
        return Ok(());
    }

    let mut cmd = nf()?;
    cmd.current_dir(repo_root());
    let output = cmd
        .arg("validate")
        .arg(&demo)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "nf validate failed: stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let _lines = assert_json_lines(&String::from_utf8_lossy(&output.stdout))?;
    Ok(())
}

#[test]
fn nf_anchors_demo_fixture() -> Result<(), String> {
    let demo = repo_root()
        .join("spec")
        .join("versions")
        .join("v1.1")
        .join("spec")
        .join("demo.sample.json");
    if !demo.is_file() {
        return Ok(());
    }

    let mut cmd = nf()?;
    cmd.current_dir(repo_root());
    let output = cmd
        .arg("anchors")
        .arg(&demo)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "nf anchors failed: stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let lines = assert_json_lines(&String::from_utf8_lossy(&output.stdout))?;
    let last = lines.last().ok_or("no stdout from nf anchors")?;
    // Expect {ok:true, data:{event:"anchors.list", anchors:[...]}}
    let data = last.get("data").ok_or("missing .data")?;
    let list = data.get("anchors").and_then(|v| v.as_array()).ok_or("missing .data.anchors array")?;
    if list.is_empty() {
        return Err("expected at least one anchor in demo fixture".into());
    }
    let first = &list[0];
    if first.get("begin_ms").is_none() && first.get("at_ms").is_none() {
        return Err(format!(
            "anchor missing begin_ms or at_ms: {first}"
        ));
    }
    Ok(())
}
