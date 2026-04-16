//! parser tests helpers
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::manifest::parse_segments_manifest;
use super::srt::parse_srt_text;
use super::{SlideType, SubtitleCue, detect_slide_type, parse_frame_file};
use crate::CommonArgs;
use crate::plan::collect_frame_files;

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(name: &str) -> Self {
        let unique = format!(
            "nextframe-recorder-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after UNIX_EPOCH")
                .as_nanos()
        );
        let path = env::temp_dir().join(unique);
        fs::create_dir_all(&path).expect("failed to create temp test directory");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn write_file(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("failed to create parent directory");
    }
    fs::write(path, contents).expect("failed to write test file");
}

#[test]
fn parse_frame_file_reads_inline_metadata_and_data_cues() {
    let temp = TestDir::new("parse-frame-file");
    let html_path = temp.path().join("frames/02-scene.html");
    write_file(
        &html_path,
        r#"<!doctype html>
<html>
  <body>
    <script>
      const AUDIO_SRC = 'audio/voice.mp3';
      const SRT = [
        { s: 0, e: 1.5, t: 'First cue' },
        { s: 1.5, e: 3.0, t: 'Second cue' },
        { s: 3.0, e: 4.5, t: 'Third cue' }
      ];
    </script>
    <section data-cue="0">First</section>
    <section data-cue="2">Third</section>
  </body>
</html>
"#,
    );

    let metadata = parse_frame_file(&html_path).expect("frame file should parse");
    let canonical_html_path = html_path
        .canonicalize()
        .expect("frame file path should canonicalize");

    assert_eq!(metadata.html_path, canonical_html_path);
    assert_eq!(metadata.slide_type, SlideType::Unknown);
    assert_eq!(
        metadata.audio_path,
        Some(
            canonical_html_path
                .parent()
                .expect("html file should have a parent directory")
                .join("audio/voice.mp3")
        )
    );
    assert_eq!(metadata.cuemap, vec![0, 1, 2]);
    assert_eq!(metadata.total_cues, 3);
    assert_eq!(metadata.subtitles.len(), 3);
    assert_eq!(metadata.subtitles[0].text, "First cue");
    assert!(metadata.warnings.is_empty());
}

#[test]
fn detect_slide_type_uses_video_markup_for_clip_detection() {
    let clip_html = "<html><body><video src='clip.mp4'></video></body></html>";
    let slide_html = "<html><body><section>plain slide</section></body></html>";

    assert_eq!(detect_slide_type(clip_html), SlideType::Clip);
    assert_eq!(detect_slide_type(slide_html), SlideType::Unknown);
}

#[test]
fn subtitle_cue_creation_preserves_fields() {
    let cue = SubtitleCue {
        start: 1.25,
        end: 2.75,
        text: "Caption".to_string(),
    };

    assert_eq!(cue.start, 1.25);
    assert_eq!(cue.end, 2.75);
    assert_eq!(cue.text, "Caption");
}

#[test]
fn parse_srt_text_reads_timestamped_blocks() {
    let srt = r#"1
00:00:00,000 --> 00:00:01,250
Hello

2
00:00:01.250 --> 00:00:03,000
World
Again
"#;

    let cues = parse_srt_text(srt).expect("SRT should parse");

    assert_eq!(cues.len(), 2);
    assert_eq!(cues[0].start, 0.0);
    assert_eq!(cues[0].end, 1.25);
    assert_eq!(cues[0].text, "Hello");
    assert_eq!(cues[1].start, 1.25);
    assert_eq!(cues[1].end, 3.0);
    assert_eq!(cues[1].text, "World Again");
}

#[test]
fn collect_frame_files_sorts_by_stem_number() {
    let temp = TestDir::new("frame-sorting");
    let first = temp.path().join("01-cover.html");
    let second = temp.path().join("2-middle.html");
    let third = temp.path().join("10-outro.html");

    write_file(&first, "<html></html>");
    write_file(&second, "<html></html>");
    write_file(&third, "<html></html>");

    let cli = CommonArgs {
        frames: Vec::new(),
        dir: Some(temp.path().to_path_buf()),
        out: temp.path().join("out.mp4"),
        fps: 30,
        crf: 14,
        dpr: 2.0,
        jobs: None,
        skip: false,
        skip_aggressive: false,
        headed: false,
        width: 540.0,
        height: 960.0,
        parallel: 1,
        frame_range: None,
        render_scale: 1.0,
        disable_audio: false,
    };

    let files = collect_frame_files(&cli).expect("frame files should collect");

    assert_eq!(
        files,
        vec![
            first
                .canonicalize()
                .expect("expected path should canonicalize"),
            second
                .canonicalize()
                .expect("expected path should canonicalize"),
            third
                .canonicalize()
                .expect("expected path should canonicalize"),
        ]
    );
}

#[test]
fn parse_srt_text_reads_multi_cue_content() {
    let srt = r#"1
00:00:00,000 --> 00:00:01,000
Opening line

2
00:00:01,000 --> 00:00:02,500
Second line
still second cue

3
00:00:03,000 --> 00:00:04,250
Closing line
"#;

    let cues = parse_srt_text(srt).expect("multi-cue SRT should parse");

    assert_eq!(cues.len(), 3);
    assert_eq!(cues[0].text, "Opening line");
    assert_eq!(cues[1].start, 1.0);
    assert_eq!(cues[1].end, 2.5);
    assert_eq!(cues[1].text, "Second line still second cue");
    assert_eq!(cues[2].start, 3.0);
    assert_eq!(cues[2].end, 4.25);
    assert_eq!(cues[2].text, "Closing line");
}

#[test]
fn parse_srt_text_returns_empty_for_empty_input() {
    let cues = parse_srt_text("").expect("empty SRT input should not fail");

    assert!(cues.is_empty());
}

#[test]
fn parse_srt_text_rejects_malformed_timestamps() {
    let srt = r#"1
00:00:00 --> 00:00:01,000
Broken timestamp
"#;

    let error = parse_srt_text(srt).expect_err("malformed SRT timestamps should fail");

    assert!(error.contains("invalid SRT block"));
}

#[test]
fn parse_srt_text_preserves_overlapping_cues() {
    let srt = r#"1
00:00:00,000 --> 00:00:02,000
First cue

2
00:00:01,500 --> 00:00:03,000
Second cue
"#;

    let cues = parse_srt_text(srt).expect("overlapping cues should still parse");

    assert_eq!(cues.len(), 2);
    assert_eq!(cues[0].start, 0.0);
    assert_eq!(cues[0].end, 2.0);
    assert_eq!(cues[1].start, 1.5);
    assert_eq!(cues[1].end, 3.0);
    assert_eq!(cues[1].text, "Second cue");
}

#[test]
fn parse_segments_manifest_reads_valid_json() {
    let manifest = parse_segments_manifest(
        r#"{
          "audioBase": "./audio/",
          "srtBase": "./subs/",
          "cover": { "audio": "cover.mp3", "srt": "cover.srt" },
          "ending": { "audio": "ending.mp3", "srt": "ending.srt" },
          "segments": [
            { "id": 2, "audio": "02.mp3", "srt": "02.srt" },
            { "id": 1, "audio": "01.mp3", "srt": "01.srt" }
          ]
        }"#,
    )
    .expect("valid manifest JSON should parse");

    assert_eq!(manifest.audio_base.as_deref(), Some("./audio/"));
    assert_eq!(manifest.srt_base.as_deref(), Some("./subs/"));
    assert_eq!(
        manifest
            .cover
            .as_ref()
            .and_then(|entry| entry.audio.as_deref()),
        Some("cover.mp3")
    );
    assert_eq!(
        manifest
            .ending
            .as_ref()
            .and_then(|entry| entry.srt.as_deref()),
        Some("ending.srt")
    );
    assert_eq!(manifest.segments.len(), 2);
    assert_eq!(manifest.segments[0].id, 1);
    assert_eq!(manifest.segments[0].audio.as_deref(), Some("01.mp3"));
    assert_eq!(manifest.segments[1].id, 2);
    assert_eq!(manifest.segments[1].srt.as_deref(), Some("02.srt"));
}

#[test]
fn parse_segments_manifest_defaults_missing_optional_fields() {
    let manifest = parse_segments_manifest(
        r#"{
          "segments": [
            { "id": 3 }
          ]
        }"#,
    )
    .expect("manifest with omitted optional fields should parse");

    assert!(manifest.audio_base.is_none());
    assert!(manifest.srt_base.is_none());
    assert!(manifest.cover.is_none());
    assert!(manifest.ending.is_none());
    assert_eq!(manifest.segments.len(), 1);
    assert_eq!(manifest.segments[0].id, 3);
    assert!(manifest.segments[0].audio.is_none());
    assert!(manifest.segments[0].srt.is_none());
}

#[test]
fn parse_segments_manifest_accepts_empty_segments_array() {
    let manifest = parse_segments_manifest(
        r#"{
          "audioBase": "./audio/",
          "segments": []
        }"#,
    )
    .expect("manifest with empty segments should parse");

    assert_eq!(manifest.audio_base.as_deref(), Some("./audio/"));
    assert!(manifest.segments.is_empty());
}

#[test]
fn parse_segments_manifest_sorts_segments_by_index() {
    let manifest = parse_segments_manifest(
        r#"{
          "segments": [
            { "id": 10, "audio": "10.mp3" },
            { "id": 2, "audio": "02.mp3" },
            { "id": 7, "audio": "07.mp3" }
          ]
        }"#,
    )
    .expect("manifest segments should sort by id");

    let indices: Vec<_> = manifest.segments.iter().map(|segment| segment.id).collect();

    assert_eq!(indices, vec![2, 7, 10]);
    assert_eq!(manifest.segments[0].audio.as_deref(), Some("02.mp3"));
    assert_eq!(manifest.segments[1].audio.as_deref(), Some("07.mp3"));
    assert_eq!(manifest.segments[2].audio.as_deref(), Some("10.mp3"));
}
