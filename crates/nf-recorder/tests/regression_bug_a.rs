//! Bug-A regression guard: 4K 10s serial export should stay alive.
//!
//! Historical: v1.67.1 Bug-A regression guard.

#![cfg(target_os = "macos")]
#![allow(clippy::panic, clippy::unwrap_used)]

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

#[test]
fn bug_a_4k_10s_serial_no_crash() {
    let _lock = ExportLock::acquire("nf-recorder-heavy-export");
    let Some((workspace_root, nf_shell)) = release_nf_shell() else {
        eprintln!("[bug_a_4k_10s_serial_no_crash] skipping: target/release/nf-shell missing");
        return;
    };

    let output_path = workspace_root
        .join("target")
        .join(format!("bug-a-serial-{}.mp4", std::process::id()));
    let _ = fs::remove_file(&output_path);

    let output = Command::new(&nf_shell)
        .current_dir(&workspace_root)
        .arg("demo/real-chart-pie.json")
        .arg("--export")
        .arg(&output_path)
        .arg("--duration")
        .arg("10")
        .arg("--resolution")
        .arg("4k")
        .arg("--parallel")
        .arg("1")
        .output()
        .unwrap_or_else(|err| panic!("spawn nf-shell regression export failed: {err}"));

    assert_command_success("Bug-A 4K 10s serial export", &output);

    let size = fs::metadata(&output_path)
        .unwrap_or_else(|err| panic!("metadata {} failed: {err}", output_path.display()))
        .len();
    assert!(
        size > 0,
        "Bug-A regression output was empty at {}",
        output_path.display()
    );

    if !ffprobe_available() {
        eprintln!("[bug_a_4k_10s_serial_no_crash] ffprobe unavailable, skipping structural probe");
        return;
    }

    let probe = ffprobe_export(&output_path);
    let stream = probe
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| streams.first())
        .unwrap_or_else(|| panic!("ffprobe missing video stream: {probe}"));
    let format = probe
        .get("format")
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("ffprobe missing format section: {probe}"));

    assert_eq!(
        stream.get("codec_name").and_then(Value::as_str),
        Some("hevc"),
        "Bug-A regression expected HEVC stream: {stream}"
    );
    assert_eq!(
        stream.get("width").and_then(Value::as_u64),
        Some(3840),
        "Bug-A regression expected 3840 width: {stream}"
    );
    assert_eq!(
        stream.get("height").and_then(Value::as_u64),
        Some(2160),
        "Bug-A regression expected 2160 height: {stream}"
    );

    let duration = format
        .get("duration")
        .and_then(Value::as_str)
        .and_then(|raw| raw.parse::<f64>().ok())
        .unwrap_or_else(|| panic!("ffprobe duration missing: {probe}"));
    assert!(
        duration >= 9.9,
        "Bug-A regression duration too short: {duration}s · probe={probe}"
    );

    let frames = stream
        .get("nb_frames")
        .and_then(Value::as_str)
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or_else(|| panic!("ffprobe nb_frames missing: {probe}"));
    assert!(
        frames >= 590,
        "Bug-A regression frame count too low: {frames} · probe={probe}"
    );
}

fn workspace_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .join("../..")
        .canonicalize()
        .unwrap_or_else(|err| panic!("workspace root canonicalize failed: {err}"))
}

fn release_nf_shell() -> Option<(PathBuf, PathBuf)> {
    let root = workspace_root();
    let bin = root.join("target/release/nf-shell");
    if bin.is_file() {
        Some((root, bin))
    } else {
        None
    }
}

fn assert_command_success(label: &str, output: &Output) {
    assert!(
        output.status.success(),
        "{label} failed with status {:?}\nstdout:\n{}\nstderr:\n{}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn ffprobe_available() -> bool {
    Command::new("ffprobe")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn ffprobe_export(path: &PathBuf) -> Value {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("stream=codec_name,width,height,avg_frame_rate,nb_frames")
        .arg("-show_entries")
        .arg("format=duration,bit_rate,size")
        .arg("-of")
        .arg("json")
        .arg(path)
        .output()
        .unwrap_or_else(|err| panic!("spawn ffprobe export probe failed: {err}"));
    assert_command_success("Bug-A ffprobe", &output);
    serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|err| panic!("parse ffprobe export json failed: {err}"))
}

struct ExportLock {
    path: PathBuf,
}

impl ExportLock {
    fn acquire(name: &str) -> Self {
        let path = workspace_root().join("target").join(name);
        let deadline = Instant::now() + Duration::from_secs(600);
        loop {
            match fs::create_dir(&path) {
                Ok(()) => return Self { path },
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                    assert!(
                        Instant::now() < deadline,
                        "timed out waiting for export lock {}",
                        path.display()
                    );
                    thread::sleep(Duration::from_millis(250));
                }
                Err(err) => panic!("create export lock {} failed: {err}", path.display()),
            }
        }
    }
}

impl Drop for ExportLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.path);
    }
}
