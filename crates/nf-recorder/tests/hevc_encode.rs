//! HEVC integration coverage for v1.67.1 Bug-B / Bug-C fixes.

#![cfg(target_os = "macos")]
#![allow(clippy::assertions_on_constants, clippy::panic, clippy::unwrap_used)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::ptr::NonNull;
use std::thread;
use std::time::{Duration, Instant};

use nf_recorder::pipeline::vt_wrap::VtCompressor;
use nf_recorder::pipeline::{ColorSpec, VideoCodec};
use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFType};
use objc2_core_video::{
    kCVPixelBufferHeightKey, kCVPixelBufferIOSurfacePropertiesKey,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelBufferWidthKey, kCVPixelFormatType_32BGRA,
    CVPixelBuffer, CVPixelBufferCreate, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
};
use serde_json::Value;

const WIDTH: usize = 1920;
const HEIGHT: usize = 1080;
const FPS: u32 = 60;
const BITRATE: u32 = 20_000_000;
const EXPORT_LOCK_NAME: &str = "nf-recorder-heavy-export";

#[test]
fn hevc_encode_single_frame() {
    let attrs = pb_attributes();

    let mut pb_ptr: *mut CVPixelBuffer = std::ptr::null_mut();
    let status = unsafe {
        CVPixelBufferCreate(
            None,
            WIDTH,
            HEIGHT,
            kCVPixelFormatType_32BGRA,
            Some(attrs.as_ref()),
            NonNull::from(&mut pb_ptr),
        )
    };
    assert_eq!(status, 0, "CVPixelBufferCreate failed with {status}");

    let pb_nn = match NonNull::new(pb_ptr) {
        Some(p) => p,
        None => panic!("CVPixelBufferCreate returned null"),
    };
    let pixel_buffer: CFRetained<CVPixelBuffer> = unsafe { CFRetained::from_raw(pb_nn) };
    fill_solid(&pixel_buffer, 24, 164, 230);

    let compressor = VtCompressor::new_hevc_main(
        WIDTH as u32,
        HEIGHT as u32,
        FPS,
        BITRATE,
        ColorSpec::BT709_SDR_8bit,
    )
    .unwrap_or_else(|err| panic!("VtCompressor::new_hevc_main failed: {err}"));

    assert_eq!(compressor.codec(), VideoCodec::HevcMain8);
    assert_eq!(compressor.width(), WIDTH as u32);
    assert_eq!(compressor.height(), HEIGHT as u32);
    assert_eq!(compressor.fps(), FPS);
    assert_eq!(compressor.bitrate_bps(), BITRATE);

    compressor
        .encode_pixel_buffer_with_options(&pixel_buffer, 0, true)
        .unwrap_or_else(|err| panic!("encode_pixel_buffer_with_options failed: {err}"));
    compressor
        .finalize()
        .unwrap_or_else(|err| panic!("finalize failed: {err}"));

    let mut frames = Vec::new();
    while let Some(frame) = compressor.poll_output() {
        frames.push(frame);
    }

    assert!(
        !frames.is_empty(),
        "expected at least one HEVC compressed frame after finalize"
    );
    let first = &frames[0];
    assert!(first.is_keyframe, "first HEVC frame must be a keyframe");
    assert!(!first.data.is_empty(), "HEVC bitstream must not be empty");
    assert_eq!(first.pts_ms, 0, "first HEVC frame pts must be 0");
    let _fmt = first.format_description.as_ref_format();
}

#[test]
fn hevc_encode_3s_tail_frames_not_black() {
    let _lock = ExportLock::acquire(EXPORT_LOCK_NAME);
    let Some((workspace_root, nf_shell)) = release_nf_shell() else {
        eprintln!("[hevc_encode_3s_tail_frames_not_black] skipping: target/release/nf-shell missing");
        return;
    };
    if !ffprobe_available() {
        eprintln!("[hevc_encode_3s_tail_frames_not_black] skipping: ffprobe unavailable");
        return;
    }

    let output_path = workspace_root
        .join("target")
        .join(format!("v1.67.1-hevc-tail-{}.mp4", std::process::id()));
    let export = run_export(
        &workspace_root,
        &nf_shell,
        "demo/real-chart-bar.json",
        &output_path,
        "3",
    );
    assert_command_success("real-chart-bar 4K 3s export", &export);

    let stats = ffprobe_signalstats(&output_path);
    let frames = stats
        .get("frames")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("ffprobe signalstats missing frames: {stats}"));
    assert_eq!(
        frames.len(),
        2,
        "expected signalstats for frames 178/179, got {} · payload={stats}",
        frames.len()
    );

    for (idx, frame) in frames.iter().enumerate() {
        let tags = frame
            .get("tags")
            .and_then(Value::as_object)
            .unwrap_or_else(|| panic!("ffprobe frame missing tags: {frame}"));
        let yavg = metric(tags.get("lavfi.signalstats.YAVG"));
        let satavg = metric(tags.get("lavfi.signalstats.SATAVG"));
        assert!(
            yavg > 50.0,
            "tail frame {} YAVG too low: {yavg} · frame={frame}",
            178 + idx
        );
        assert!(
            satavg > 10.0,
            "tail frame {} SATAVG too low: {satavg} · frame={frame}",
            178 + idx
        );
    }
}

#[test]
fn hevc_encode_bitrate_close_to_target() {
    let _lock = ExportLock::acquire(EXPORT_LOCK_NAME);
    let Some((workspace_root, nf_shell)) = release_nf_shell() else {
        eprintln!("[hevc_encode_bitrate_close_to_target] skipping: target/release/nf-shell missing");
        return;
    };
    if !ffprobe_available() {
        eprintln!("[hevc_encode_bitrate_close_to_target] skipping: ffprobe unavailable");
        return;
    }

    let output_path = workspace_root
        .join("target")
        .join(format!("v1.67.1-hevc-bitrate-{}.mp4", std::process::id()));
    let export = run_export(
        &workspace_root,
        &nf_shell,
        "demo/v1.41-webgl-particles.json",
        &output_path,
        "3",
    );
    assert_command_success("webgl-particles 4K 3s export", &export);

    let target_bitrate = extract_record_start_bitrate(&export.stdout)
        .unwrap_or_else(|| panic!("record.start bitrate_bps missing from nf-shell output"));
    let actual_bitrate = ffprobe_bitrate(&output_path).unwrap_or_else(|| {
        let size_bytes = fs::metadata(&output_path)
            .unwrap_or_else(|err| panic!("metadata {} failed: {err}", output_path.display()))
            .len();
        (u128::from(size_bytes) * 8u128 / 3u128) as u64
    });

    assert!(
        u128::from(actual_bitrate) * 2 >= u128::from(target_bitrate),
        "bitrate too low: actual={} target={} threshold={} path={}",
        actual_bitrate,
        target_bitrate,
        target_bitrate / 2,
        output_path.display()
    );
}

fn pb_attributes() -> CFRetained<CFDictionary<CFType, CFType>> {
    let w = CFNumber::new_i32(WIDTH as i32);
    let h = CFNumber::new_i32(HEIGHT as i32);
    let fmt = CFNumber::new_i32(kCVPixelFormatType_32BGRA as i32);
    let iosurface = CFDictionary::<CFType, CFType>::empty();
    unsafe {
        CFDictionary::<CFType, CFType>::from_slices(
            &[
                kCVPixelBufferWidthKey.as_ref(),
                kCVPixelBufferHeightKey.as_ref(),
                kCVPixelBufferPixelFormatTypeKey.as_ref(),
                kCVPixelBufferIOSurfacePropertiesKey.as_ref(),
            ],
            &[w.as_ref(), h.as_ref(), fmt.as_ref(), iosurface.as_ref()],
        )
    }
}

fn fill_solid(pb: &CVPixelBuffer, b: u8, g: u8, r: u8) {
    let lock_status = unsafe { CVPixelBufferLockBaseAddress(pb, CVPixelBufferLockFlags::empty()) };
    assert_eq!(lock_status, 0, "CVPixelBufferLockBaseAddress failed");

    let base = CVPixelBufferGetBaseAddress(pb);
    assert!(!base.is_null(), "CVPixelBufferGetBaseAddress null");
    let bytes_per_row = CVPixelBufferGetBytesPerRow(pb);
    let pixel: [u8; 4] = [b, g, r, 0xff];

    for row in 0..HEIGHT {
        let row_ptr = unsafe { (base as *mut u8).add(row * bytes_per_row) };
        for col in 0..WIDTH {
            unsafe {
                row_ptr
                    .add(col * 4)
                    .copy_from_nonoverlapping(pixel.as_ptr(), 4);
            }
        }
    }

    let _unlock = unsafe { CVPixelBufferUnlockBaseAddress(pb, CVPixelBufferLockFlags::empty()) };
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

fn ffprobe_available() -> bool {
    Command::new("ffprobe")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn run_export(
    workspace_root: &Path,
    nf_shell: &Path,
    source: &str,
    output_path: &Path,
    duration_s: &str,
) -> Output {
    let _ = fs::remove_file(output_path);
    Command::new(nf_shell)
        .current_dir(workspace_root)
        .arg(source)
        .arg("--export")
        .arg(output_path)
        .arg("--duration")
        .arg(duration_s)
        .arg("--resolution")
        .arg("4k")
        .arg("--parallel")
        .arg("1")
        .output()
        .unwrap_or_else(|err| panic!("spawn nf-shell export failed: {err}"))
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

fn ffprobe_signalstats(path: &Path) -> Value {
    let filter = format!(
        "movie={},select='eq(n\\,178)+eq(n\\,179)',signalstats",
        path.display()
    );
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-f")
        .arg("lavfi")
        .arg("-i")
        .arg(filter)
        .arg("-show_entries")
        .arg("frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.SATAVG")
        .arg("-of")
        .arg("json")
        .output()
        .unwrap_or_else(|err| panic!("spawn ffprobe signalstats failed: {err}"));
    assert_command_success("ffprobe signalstats", &output);
    serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|err| panic!("parse ffprobe signalstats json failed: {err}"))
}

fn ffprobe_bitrate(path: &Path) -> Option<u64> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=bit_rate")
        .arg("-of")
        .arg("json")
        .arg(path)
        .output()
        .unwrap_or_else(|err| panic!("spawn ffprobe bitrate failed: {err}"));
    assert_command_success("ffprobe bitrate", &output);
    let json: Value = serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|err| panic!("parse ffprobe bitrate json failed: {err}"));
    json.get("format")
        .and_then(|format| format.get("bit_rate"))
        .and_then(|bit_rate| match bit_rate {
            Value::Number(n) => n.as_u64(),
            Value::String(s) => s.parse::<u64>().ok(),
            _ => None,
        })
}

fn extract_record_start_bitrate(stdout: &[u8]) -> Option<u64> {
    let text = String::from_utf8_lossy(stdout);
    for line in text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('{') {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if value.get("event").and_then(Value::as_str) != Some("record.start") {
            continue;
        }
        if let Some(bitrate) = value.get("bitrate_bps").and_then(Value::as_u64) {
            return Some(bitrate);
        }
    }
    None
}

fn metric(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(n)) => n
            .as_f64()
            .unwrap_or_else(|| panic!("metric number not representable as f64: {n}")),
        Some(Value::String(s)) => s
            .parse::<f64>()
            .unwrap_or_else(|err| panic!("metric parse failed for '{s}': {err}")),
        Some(other) => panic!("metric had unexpected type: {other}"),
        None => panic!("metric missing"),
    }
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
