//! T-10 · cli + events integration tests.
//!
//! Coverage:
//! - `parse_bitrate` — `12M` / `12000000` / `500K` (+ lowercase variants)
//! - `--res` — only `1080p` accepted (other values error from `to_config`)
//! - `--fps` — only `{30, 60}` accepted (other values error)
//! - `Event` — all 5 variants serialize to JSON-Line with correct `event` tag
//!
//! Tests use a real temp bundle file on disk so `to_config` passes the
//! bundle-exists check before reaching the `--res` / `--fps` branches.
//!
//! Workspace lints deny `unwrap_used` / `expect_used` on production code;
//! test files opt out because assertion-on-None is the point of a test.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use clap::Parser;
use nf_recorder::cli::{parse_bitrate, to_config, Cli};
use nf_recorder::events::{emit, Event};
use std::fs::File;
use std::io::Write as _;
use std::path::PathBuf;

// ───────────────────────────── helpers ─────────────────────────────

/// Make a real file on disk so `to_config` passes `bundle.exists()`.
/// Returns `(bundle_path, output_path)`.
fn mk_bundle(name: &str) -> (PathBuf, PathBuf) {
    let dir = std::env::temp_dir().join("nf-recorder-tests");
    std::fs::create_dir_all(&dir).expect("temp dir");
    let bundle = dir.join(format!("{name}.html"));
    let output = dir.join(format!("{name}.mp4"));
    let mut f = File::create(&bundle).expect("create bundle");
    f.write_all(b"<!doctype html><html><body></body></html>")
        .expect("write bundle");
    (bundle, output)
}

/// Build a `Cli` via clap from an argv-like slice.
fn cli_from(args: &[&str]) -> Cli {
    Cli::parse_from(args)
}

// ────────────────────────── parse_bitrate ──────────────────────────

#[test]
fn parse_bitrate_accepts_mega() {
    assert_eq!(parse_bitrate("12M").expect("12M"), 12_000_000);
    assert_eq!(parse_bitrate("1M").expect("1M"), 1_000_000);
    assert_eq!(parse_bitrate("1.5M").expect("1.5M"), 1_500_000);
    // lowercase also accepted
    assert_eq!(parse_bitrate("8m").expect("8m"), 8_000_000);
}

#[test]
fn parse_bitrate_accepts_plain_bps() {
    assert_eq!(parse_bitrate("12000000").expect("12000000"), 12_000_000);
    assert_eq!(parse_bitrate("500000").expect("500000"), 500_000);
    assert_eq!(parse_bitrate("0").expect("0"), 0);
}

#[test]
fn parse_bitrate_accepts_kilo() {
    assert_eq!(parse_bitrate("500K").expect("500K"), 500_000);
    assert_eq!(parse_bitrate("128k").expect("128k"), 128_000);
}

#[test]
fn parse_bitrate_rejects_garbage() {
    assert!(parse_bitrate("").is_err());
    assert!(parse_bitrate("abc").is_err());
    assert!(parse_bitrate("12X").is_err());
    assert!(parse_bitrate("-5M").is_err(), "negative M form must error");
}

// ─────────────────────────────── --res ───────────────────────────────

#[test]
fn to_config_accepts_1080p() {
    let (bundle, output) = mk_bundle("res_ok");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("bundle utf8"),
        "-o",
        output.to_str().expect("output utf8"),
        "--res",
        "1080p",
        "--fps",
        "60",
        "--bitrate",
        "12M",
    ]);
    let cfg = to_config(&cli).expect("1080p must validate");
    assert_eq!(cfg.width, 1920);
    assert_eq!(cfg.height, 1080);
    assert_eq!(cfg.fps, 60);
    assert_eq!(cfg.bitrate_bps, 12_000_000);
    assert_eq!(cfg.max_duration_s, 60);
}

#[test]
fn to_config_rejects_non_1080p() {
    let (bundle, output) = mk_bundle("res_bad_4k");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("utf8"),
        "-o",
        output.to_str().expect("utf8"),
        "--res",
        "4k",
    ]);
    let err = to_config(&cli).expect_err("4k must error");
    assert!(err.contains("4k") || err.contains("1080p"), "got: {err}");
}

#[test]
fn to_config_rejects_720p() {
    let (bundle, output) = mk_bundle("res_bad_720");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("utf8"),
        "-o",
        output.to_str().expect("utf8"),
        "--res",
        "720p",
    ]);
    assert!(to_config(&cli).is_err());
}

// ─────────────────────────────── --fps ───────────────────────────────

#[test]
fn to_config_accepts_fps_30() {
    let (bundle, output) = mk_bundle("fps_30");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("utf8"),
        "-o",
        output.to_str().expect("utf8"),
        "--fps",
        "30",
    ]);
    let cfg = to_config(&cli).expect("fps=30 must validate");
    assert_eq!(cfg.fps, 30);
}

#[test]
fn to_config_accepts_fps_60() {
    let (bundle, output) = mk_bundle("fps_60");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("utf8"),
        "-o",
        output.to_str().expect("utf8"),
        "--fps",
        "60",
    ]);
    let cfg = to_config(&cli).expect("fps=60 must validate");
    assert_eq!(cfg.fps, 60);
}

#[test]
fn to_config_rejects_fps_24() {
    let (bundle, output) = mk_bundle("fps_24");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("utf8"),
        "-o",
        output.to_str().expect("utf8"),
        "--fps",
        "24",
    ]);
    let err = to_config(&cli).expect_err("fps=24 must error");
    assert!(err.contains("fps") || err.contains("30") || err.contains("60"));
}

#[test]
fn to_config_rejects_fps_120() {
    let (bundle, output) = mk_bundle("fps_120");
    let cli = cli_from(&[
        "nf-recorder",
        bundle.to_str().expect("utf8"),
        "-o",
        output.to_str().expect("utf8"),
        "--fps",
        "120",
    ]);
    assert!(to_config(&cli).is_err());
}

// ───────────────────────────── bundle path ─────────────────────────────

#[test]
fn to_config_rejects_missing_bundle() {
    let cli = cli_from(&[
        "nf-recorder",
        "/absolutely/does/not/exist-xyz-42.html",
        "-o",
        "/tmp/out.mp4",
    ]);
    let err = to_config(&cli).expect_err("missing bundle must error");
    assert!(err.contains("does not exist") || err.contains("bundle"));
}

// ───────────────────────────── Event JSON ─────────────────────────────

/// Shape check: each variant serializes to a JSON object whose `event`
/// field equals the exact wire name defined in `interfaces-delta.json`.
#[test]
fn event_record_start_serialization() {
    let e = Event::RecordStart {
        bundle: "tmp/x.html".into(),
        out: "tmp/x.mp4".into(),
        fps: 60,
        bitrate_bps: 12_000_000,
        viewport: [1920, 1080],
    };
    let j = serde_json::to_value(&e).expect("serialize");
    assert_eq!(j["event"], "record.start");
    assert_eq!(j["fps"], 60);
    assert_eq!(j["viewport"], serde_json::json!([1920, 1080]));
}

#[test]
fn event_record_frame_serialization() {
    let e = Event::RecordFrame {
        t_ms: 17,
        t_exact_ms: 16.666_666_666_666_668,
        seq: 1,
        encode_ms: 3.25,
    };
    let j = serde_json::to_value(&e).expect("serialize");
    assert_eq!(j["event"], "record.frame");
    assert_eq!(j["t_ms"], 17);
    // t_exact_ms serializes as a JSON number (f64) · verify field present + close
    let t_exact = j["t_exact_ms"].as_f64().expect("t_exact_ms must be number");
    assert!(
        (t_exact - 16.666_666_666_666_668).abs() < 1e-9,
        "t_exact_ms mismatch: {t_exact}"
    );
    assert_eq!(j["seq"], 1);
}

#[test]
fn event_encode_progress_serialization() {
    let e = Event::RecordEncodeProgress {
        frames_encoded: 30,
        total_frames: 540,
        percent: 5.55,
    };
    let j = serde_json::to_value(&e).expect("serialize");
    assert_eq!(j["event"], "record.encode_progress");
    assert_eq!(j["frames_encoded"], 30);
    assert_eq!(j["total_frames"], 540);
}

#[test]
fn event_record_done_serialization() {
    let e = Event::RecordDone {
        out: PathBuf::from("tmp/x.mp4"),
        duration_ms: 9_000,
        size_bytes: 12_345_678,
        moov_front: true,
    };
    let j = serde_json::to_value(&e).expect("serialize");
    assert_eq!(j["event"], "record.done");
    assert_eq!(j["moov_front"], true);
}

#[test]
fn event_error_serialization() {
    let e = Event::Error {
        code: "CLI_INVALID_BITRATE".into(),
        message: "not a number".into(),
    };
    let j = serde_json::to_value(&e).expect("serialize");
    assert_eq!(j["event"], "error");
    assert_eq!(j["code"], "CLI_INVALID_BITRATE");
    assert_eq!(j["message"], "not a number");
}

/// JSON-Line hygiene: `serde_json::to_string` of any variant must produce
/// a single line with no embedded `\n`. `emit()` adds exactly one trailing
/// `\n` via `writeln!`. This guards against accidental pretty-printing or
/// multi-line payloads that would break line-delimited consumers.
#[test]
fn event_json_line_no_embedded_newline() {
    let events = [
        Event::RecordStart {
            bundle: "a".into(),
            out: "b".into(),
            fps: 60,
            bitrate_bps: 12_000_000,
            viewport: [1920, 1080],
        },
        Event::RecordFrame {
            t_ms: 0,
            t_exact_ms: 0.0,
            seq: 0,
            encode_ms: 0.0,
        },
        Event::RecordEncodeProgress {
            frames_encoded: 0,
            total_frames: 0,
            percent: 0.0,
        },
        Event::RecordDone {
            out: "c".into(),
            duration_ms: 0,
            size_bytes: 0,
            moov_front: true,
        },
        Event::Error {
            code: "X".into(),
            message: "y".into(),
        },
    ];
    for e in &events {
        let line = serde_json::to_string(e).expect("serialize");
        assert!(!line.contains('\n'), "embedded newline: {line}");
    }
}

/// Smoke-test `emit` — it prints to stdout and must not panic on any
/// variant. We can't easily capture test stdout from another thread, so
/// we just call each variant and rely on the type system + no-panic
/// behavior (the impl uses `let _ = writeln!(...)`).
#[test]
fn emit_does_not_panic_for_any_variant() {
    emit(Event::RecordStart {
        bundle: "a".into(),
        out: "b".into(),
        fps: 60,
        bitrate_bps: 12_000_000,
        viewport: [1920, 1080],
    });
    emit(Event::RecordFrame {
        t_ms: 17,
        t_exact_ms: 16.666_666_666_666_668,
        seq: 1,
        encode_ms: 2.0,
    });
    emit(Event::RecordEncodeProgress {
        frames_encoded: 1,
        total_frames: 540,
        percent: 0.18,
    });
    emit(Event::RecordDone {
        out: "c".into(),
        duration_ms: 9_000,
        size_bytes: 1,
        moov_front: true,
    });
    emit(Event::Error {
        code: "X".into(),
        message: "y".into(),
    });
}
