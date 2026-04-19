//! Integration tests for the `source` module.
//!
//! Covers three axes:
//! 1. Real-world JSON: `demo/v1.8-video-sample.json` round-trips through
//!    `load_source` and matches the expected shape.
//! 2. Viewport ratios: both `"16:9"` and `"9:16"` synthetic samples parse.
//! 3. Track kinds: the v1.8 demo exposes `bg` / `scene` / `video` kinds in
//!    that order.
//!
//! Tests return `Result` so we can use `?` instead of `unwrap` (workspace
//! clippy lints deny `unwrap_used` / `expect_used` / `panic`).

use std::error::Error;
use std::path::PathBuf;

use nf_shell_mac::source::{load_source, parse_source, LoadError};

type TestResult = Result<(), Box<dyn Error>>;

/// Path to `demo/v1.8-video-sample.json` relative to this crate.
/// Crate lives at `src/nf-shell-mac/`, demo at `demo/` from project root,
/// so we walk up two levels from `CARGO_MANIFEST_DIR`.
fn demo_v1_8_path() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut p = manifest;
    p.pop(); // src/nf-shell-mac -> src
    p.pop(); // src -> project root
    p.push("demo");
    p.push("v1.8-video-sample.json");
    p
}

#[test]
fn test_load_v1_8_demo() -> TestResult {
    let path = demo_v1_8_path();
    let source = load_source(&path)?;

    // Viewport is 16:9 @ 1920x1080 per the demo file.
    assert_eq!(source.viewport.ratio, "16:9");
    assert_eq!(source.viewport.w, 1920);
    assert_eq!(source.viewport.h, 1080);

    // Duration is an expression string in v1.8 schema, not a number.
    // Matches TS SSoT (`SourceRaw.duration: string` in nf-core-engine types).
    assert_eq!(source.duration, "demo.end");

    // Three tracks: bg, scene, video.
    assert_eq!(source.tracks.len(), 3);

    // Anchors preserved as pass-through Value (not evaluated).
    assert!(source.anchors.is_some(), "anchors block should deserialise");

    // Meta preserved so downstream can read `meta.name` / `meta.version`.
    assert!(source.meta.is_some(), "meta block should deserialise");

    // The video-pip clip's params carry the 212s bound via `to_ms: 212000`.
    // This is the authoritative duration signal in the demo JSON.
    let video_track = source
        .tracks
        .iter()
        .find(|t| t.kind == "video")
        .ok_or("video track missing from v1.8 demo")?;
    let clip = video_track
        .clips
        .first()
        .ok_or("video track has no clips")?;
    let to_ms = clip
        .params
        .get("to_ms")
        .and_then(|v| v.as_u64())
        .ok_or("clip.params.to_ms missing or not u64")?;
    assert_eq!(to_ms, 212_000, "v1.8 demo spans 212s");

    Ok(())
}

#[test]
fn test_parse_viewport_16_9_and_9_16() -> TestResult {
    let json_16_9 = r#"{
        "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },
        "duration": "5s",
        "tracks": []
    }"#;
    let src = parse_source(json_16_9)?;
    assert_eq!(src.viewport.ratio, "16:9");
    assert_eq!(src.viewport.w, 1920);
    assert_eq!(src.viewport.h, 1080);
    assert_eq!(src.tracks.len(), 0);

    let json_9_16 = r#"{
        "viewport": { "ratio": "9:16", "w": 1080, "h": 1920 },
        "duration": "10s",
        "tracks": []
    }"#;
    let src = parse_source(json_9_16)?;
    assert_eq!(src.viewport.ratio, "9:16");
    assert_eq!(src.viewport.w, 1080);
    assert_eq!(src.viewport.h, 1920);

    Ok(())
}

#[test]
fn test_track_kinds() -> TestResult {
    let source = load_source(&demo_v1_8_path())?;

    let kinds: Vec<&str> = source.tracks.iter().map(|t| t.kind.as_str()).collect();
    assert!(kinds.contains(&"bg"), "expected bg track; got {kinds:?}");
    assert!(kinds.contains(&"scene"), "expected scene track; got {kinds:?}");
    assert!(kinds.contains(&"video"), "expected video track; got {kinds:?}");

    // Each track has at least one clip and preserves id / src.
    for track in &source.tracks {
        assert!(!track.id.is_empty(), "track id should not be empty");
        assert!(!track.src.is_empty(), "track src path should not be empty");
        assert!(!track.clips.is_empty(), "track {} should have clips", track.id);
        for clip in &track.clips {
            assert!(!clip.begin.is_empty(), "clip begin expr should not be empty");
            assert!(!clip.end.is_empty(), "clip end expr should not be empty");
        }
    }

    Ok(())
}

#[test]
fn test_clip_id_is_optional() -> TestResult {
    // Matches TS `ClipRaw.id?: string`. A clip without `id` must still parse.
    let json = r#"{
        "viewport": { "ratio": "16:9", "w": 1280, "h": 720 },
        "duration": "3s",
        "tracks": [{
            "id": "t1",
            "kind": "bg",
            "src": "x.js",
            "clips": [{ "begin": "0", "end": "3s", "params": {} }]
        }]
    }"#;
    let src = parse_source(json)?;
    let clip = src
        .tracks
        .first()
        .ok_or("track missing")?
        .clips
        .first()
        .ok_or("clip missing")?;
    assert!(clip.id.is_none(), "clip without id should parse as None");
    Ok(())
}

#[test]
fn test_load_error_missing_file() {
    let missing = PathBuf::from("/definitely/not/a/real/path/source.json");
    let result = load_source(&missing);
    assert!(
        matches!(result, Err(LoadError::Io(_))),
        "expected LoadError::Io for missing file, got {result:?}"
    );
}

#[test]
fn test_load_error_bad_json() {
    let result = parse_source("{ not valid json");
    assert!(
        matches!(result, Err(LoadError::Parse(_))),
        "expected LoadError::Parse for malformed JSON, got {result:?}"
    );
}
