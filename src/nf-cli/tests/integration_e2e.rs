use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

#[test]
fn cli_build_validate_and_record_dry_run_work_end_to_end() {
    let repo_root = match repo_root() {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };
    if let Err(err) = ensure_engine_dist(&repo_root) {
        panic_test(&err);
    }
    if let Err(err) = build_release_cli(&repo_root) {
        panic_test(&err);
    }

    let nf = repo_root.join("target/release/nf");
    let sample = repo_root.join("spec/fixtures/sample.json");
    let bundle = match temp_path("nfe2e.html") {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };
    let output = match temp_path("nfe2e.mp4") {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };

    let build_payload = match run_json(
        &repo_root,
        &nf,
        &[
            "build",
            &sample.display().to_string(),
            "-o",
            &bundle.display().to_string(),
        ],
        0,
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(build_payload["command"], "build");
    assert_eq!(build_payload["ok"], Value::Bool(true));
    assert!(bundle.is_file(), "bundle missing at {}", bundle.display());

    let validate_payload = match run_json(
        &repo_root,
        &nf,
        &["validate", &sample.display().to_string()],
        0,
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(validate_payload["command"], "validate");
    assert_eq!(validate_payload["ok"], Value::Bool(true));

    if let Err(err) = assert_record_help(&repo_root, &nf) {
        panic_test(&err);
    }

    let dry_run_payload = match run_json(
        &repo_root,
        &nf,
        &[
            "record",
            "--bundle",
            &bundle.display().to_string(),
            "--out",
            &output.display().to_string(),
            "--duration",
            "0.5",
            "--dry-run",
        ],
        0,
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(dry_run_payload["command"], "record");
    assert_eq!(dry_run_payload["mode"], "dry-run");
    assert_eq!(dry_run_payload["ok"], Value::Bool(true));
}

fn ensure_engine_dist(repo_root: &Path) -> Result<(), String> {
    let dist = repo_root.join("src/nf-core-engine/dist/cli.js");
    if dist.is_file() {
        return Ok(());
    }
    run_status(
        repo_root,
        "npm",
        &["install"],
        "npm install in src/nf-core-engine",
        Some(&repo_root.join("src/nf-core-engine")),
    )?;
    run_status(
        repo_root,
        "npm",
        &["run", "build"],
        "npm run build in src/nf-core-engine",
        Some(&repo_root.join("src/nf-core-engine")),
    )
}

fn build_release_cli(repo_root: &Path) -> Result<(), String> {
    run_status(
        repo_root,
        "cargo",
        &["build", "--release", "-p", "nf-cli"],
        "cargo build --release -p nf-cli",
        None,
    )
}

fn assert_record_help(repo_root: &Path, nf: &Path) -> Result<(), String> {
    let output = Command::new(nf)
        .args(["record", "--help"])
        .current_dir(repo_root)
        .output()
        .map_err(|err| format!("run nf record --help: {err}"))?;
    if !output.status.success() {
        return Err(format!(
            "nf record --help failed: stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let stdout =
        String::from_utf8(output.stdout).map_err(|err| format!("help stdout not utf-8: {err}"))?;
    for flag in [
        "--bundle",
        "--out",
        "--duration",
        "--verify-pixels",
        "--dry-run",
    ] {
        if !stdout.contains(flag) {
            return Err(format!("nf record --help missing {flag}"));
        }
    }
    Ok(())
}

fn run_json(
    repo_root: &Path,
    program: &Path,
    args: &[&str],
    expected_exit: i32,
) -> Result<Value, String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(repo_root)
        .output()
        .map_err(|err| format!("run {} {:?}: {err}", program.display(), args))?;
    let exit_code = output.status.code().unwrap_or(-1);
    if exit_code != expected_exit {
        return Err(format!(
            "unexpected exit code {exit_code} for {} {:?}: stdout={} stderr={}",
            program.display(),
            args,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let stdout =
        String::from_utf8(output.stdout).map_err(|err| format!("stdout not utf-8: {err}"))?;
    let line = stdout
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| format!("stdout missing JSON for {} {:?}", program.display(), args))?;
    serde_json::from_str(line)
        .map_err(|err| format!("parse JSON from {} {:?}: {err}", program.display(), args))
}

fn run_status(
    repo_root: &Path,
    program: &str,
    args: &[&str],
    label: &str,
    workdir: Option<&Path>,
) -> Result<(), String> {
    let mut command = Command::new(program);
    command.args(args);
    command.current_dir(workdir.unwrap_or(repo_root));
    let output = command.output().map_err(|err| format!("{label}: {err}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "{label} failed: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn repo_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .map_err(|err| format!("resolve repo root: {err}"))
}

fn temp_path(name: &str) -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("clock failure: {err}"))?
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "nextframe-integration-e2e-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).map_err(|err| format!("create {}: {err}", dir.display()))?;
    Ok(dir.join(name))
}

#[track_caller]
#[allow(clippy::panic)]
fn panic_test(message: &str) -> ! {
    panic!("{message}");
}
