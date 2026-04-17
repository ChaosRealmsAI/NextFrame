use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn build_command_creates_bundle_from_clean_checkout_paths() {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap_or_else(|err| panic!("resolve repo root: {err}"));
    let output = match temp_output_path() {
        Ok(path) => path,
        Err(err) => panic_test(&err),
    };
    let sample = repo_root.join("spec/fixtures/sample.json");

    let run = Command::new(env!("CARGO_BIN_EXE_nf"))
        .arg("build")
        .arg(&sample)
        .arg("-o")
        .arg(&output)
        .output()
        .unwrap_or_else(|err| panic!("run nf build: {err}"));

    assert!(
        run.status.success(),
        "nf build failed: stdout={} stderr={}",
        String::from_utf8_lossy(&run.stdout),
        String::from_utf8_lossy(&run.stderr)
    );

    let html = match fs::read_to_string(&output) {
        Ok(html) => html,
        Err(err) => panic_test(&format!("read {}: {err}", output.display())),
    };
    assert!(html.contains("NextFrame bundle (walking stub)"));
    assert!(html.contains("nf-resolved"));
}

fn temp_output_path() -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("clock failure: {err}"))?
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "nextframe-build-cli-{}-{nanos}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).map_err(|err| format!("create {}: {err}", dir.display()))?;
    Ok(dir.join("bundle.html"))
}

#[track_caller]
#[allow(clippy::panic)]
fn panic_test(message: &str) -> ! {
    panic!("{message}");
}
