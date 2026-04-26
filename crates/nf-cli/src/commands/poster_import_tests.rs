#![allow(clippy::expect_used)]
#![allow(clippy::unwrap_used)]

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::*;

#[test]
fn builds_composition_and_copies_standardized_assets() {
    let tmp = temp_dir("ok");
    let src = tmp.join("src");
    let examples = tmp.join("examples");
    let runtime = tmp.join("runtime");
    sample_project(&examples, "demo-video");
    sample_import_source(&src, 2);

    run_with_roots(
        PosterImportArgs {
            src_dir: src,
            out: "demo-video".to_string(),
            gap_ms: 1500,
        },
        &examples,
        &runtime,
    )
    .unwrap();

    let composition_path = examples
        .join("demo-video")
        .join("compositions")
        .join("main.json");
    let composition: Value =
        serde_json::from_str(&fs::read_to_string(composition_path).unwrap()).unwrap();
    assert_eq!(composition["duration"], "4500ms");
    assert_eq!(composition["anchors"]["slide-2"], "2500ms");
    assert_eq!(composition["anchors"]["audio-1-end"], "1000ms");
    assert_eq!(composition["tracks"].as_array().unwrap().len(), 6);
    assert_eq!(
        composition["tracks"][4]["component"],
        json!("html.progress-bar")
    );
    assert_eq!(
        composition["tracks"][5]["params"]["cues"][1],
        json!({
            "text": "hello",
            "start_ms": 2500,
            "end_ms": 4500,
            "words": [{"text":"hello","start_ms":2500,"end_ms":2900}]
        })
    );
    assert!(
        composition["tracks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|track| track["kind"] != "subtitle")
    );
    assert!(
        examples
            .join("demo-video/components/posters/slide-02.png")
            .is_file()
    );
    assert!(runtime.join("demo-video/audio/slide-01.mp3").is_file());

    let _ = fs::remove_dir_all(tmp);
}

#[test]
fn duration_uses_max_segment_end_ms() {
    let timeline = Timeline {
        segments: vec![
            TimelineSegment {
                text: "a".to_string(),
                start_ms: 0,
                end_ms: 500,
                words: vec![word("a", 0, 100)],
            },
            TimelineSegment {
                text: "b".to_string(),
                start_ms: 500,
                end_ms: 1250,
                words: vec![word("b", 100, 200)],
            },
        ],
    };

    assert_eq!(duration_ms(&timeline).unwrap(), 1250);
}

#[test]
fn poster_files_sort_by_numeric_prefix() {
    let tmp = temp_dir("posters");
    let dir = tmp.join("posters");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("10-ten.png"), b"png").unwrap();
    fs::write(dir.join("2-two.png"), b"png").unwrap();
    fs::write(dir.join("1-one.png"), b"png").unwrap();

    let posters = poster_files(&dir).unwrap();
    let numbers: Vec<_> = posters.iter().map(|item| item.number).collect();
    assert_eq!(numbers, vec![1, 2, 10]);

    let _ = fs::remove_dir_all(tmp);
}

#[test]
fn extracts_segment_cues_with_absolute_offsets() {
    let timeline = Timeline {
        segments: vec![TimelineSegment {
            text: "hello world".to_string(),
            start_ms: 100,
            end_ms: 900,
            words: vec![word("hello", 100, 400), word("world", 420, 900)],
        }],
    };

    let cues = extract_cues_fallback(&timeline, 2500).unwrap();

    assert_eq!(cues.len(), 1);
    assert_eq!(cues[0].text, "hello world");
    assert_eq!(cues[0].start_ms, 2600);
    assert_eq!(cues[0].end_ms, 3400);
    assert_eq!(cues[0].words[1].text, "world");
    assert_eq!(cues[0].words[1].start_ms, 2920);
}

#[test]
fn extracts_segment_cue_without_words() {
    let timeline = Timeline {
        segments: vec![TimelineSegment {
            text: "whole cue".to_string(),
            start_ms: 0,
            end_ms: 1000,
            words: vec![],
        }],
    };

    let cues = extract_cues_fallback(&timeline, 0).unwrap();

    assert_eq!(cues[0].words.len(), 0);
    assert_eq!(cues[0].text, "whole cue");
}

#[test]
fn rejects_empty_timeline_segments_for_cues() {
    let timeline = Timeline { segments: vec![] };

    assert!(extract_cues_fallback(&timeline, 0).is_err());
}

#[test]
fn rejects_invalid_cue_segment_range() {
    let timeline = Timeline {
        segments: vec![TimelineSegment {
            text: "bad".to_string(),
            start_ms: 200,
            end_ms: 200,
            words: vec![word("bad", 200, 300)],
        }],
    };

    assert!(extract_cues_fallback(&timeline, 0).is_err());
}

#[test]
fn rejects_invalid_cue_word_range() {
    let timeline = Timeline {
        segments: vec![TimelineSegment {
            text: "bad".to_string(),
            start_ms: 0,
            end_ms: 500,
            words: vec![word("bad", 300, 300)],
        }],
    };

    assert!(extract_cues_fallback(&timeline, 0).is_err());
}

#[test]
fn rejects_timeline_word_without_text_field() {
    let tmp = temp_dir("bad-word");
    fs::create_dir_all(&tmp).unwrap();
    let path = tmp.join("timeline.json");
    fs::write(
        &path,
        r#"{"segments":[{"end_ms":100,"words":[{"text":"oops","start_ms":0,"end_ms":100}]}]}"#,
    )
    .unwrap();

    assert!(read_timeline(&path).is_err());

    let _ = fs::remove_dir_all(tmp);
}

fn sample_project(root: &Path, slug: &str) {
    let project = root.join(slug);
    fs::create_dir_all(project.join("components")).unwrap();
    fs::write(
        project.join("project.json"),
        json!({
            "slug": slug,
            "name": "Demo Video",
            "created": "2026-04-26T00:00:00Z",
            "modified": "2026-04-26T00:00:00Z"
        })
        .to_string(),
    )
    .unwrap();
    fs::write(
        project
            .join("components")
            .join(format!("{IMAGE_COMPONENT}.js")),
        "export function mount() {}\nexport function update() {}\n",
    )
    .unwrap();
    fs::write(
        project
            .join("components")
            .join(format!("{PROGRESS_COMPONENT}.js")),
        "export function mount() {}\nexport function update() {}\n",
    )
    .unwrap();
    fs::write(
        project
            .join("components")
            .join(format!("{CUE_COMPONENT}.js")),
        "export function mount() {}\nexport function update() {}\n",
    )
    .unwrap();
}

fn sample_import_source(root: &Path, count: usize) {
    fs::create_dir_all(root.join("audio")).unwrap();
    fs::create_dir_all(root.join("posters")).unwrap();
    let mut entries = Vec::new();
    for slide in 1..=count {
        fs::write(
            root.join("posters").join(format!("{slide}-demo.png")),
            b"png",
        )
        .unwrap();
        fs::write(
            root.join("audio").join(format!("slide-{slide:02}.mp3")),
            b"mp3",
        )
        .unwrap();
        fs::write(
            root.join("audio")
                .join(format!("slide-{slide:02}.timeline.json")),
            json!({
                "segments": [{
                    "text": "hello",
                    "start_ms": 0,
                    "end_ms": slide as u64 * 1000,
                    "words": [{"word":"hello","start_ms":0,"end_ms":400}]
                }]
            })
            .to_string(),
        )
        .unwrap();
        entries.push(json!({
            "id": slide,
            "text": "hello",
            "file": format!("audio/slide-{slide:02}.mp3")
        }));
    }
    fs::write(
        root.join("audio").join("manifest.json"),
        json!({ "entries": entries }).to_string(),
    )
    .unwrap();
}

fn word(text: &str, start_ms: u64, end_ms: u64) -> TimelineWord {
    TimelineWord {
        word: text.to_string(),
        start_ms,
        end_ms,
    }
}

fn temp_dir(label: &str) -> PathBuf {
    let path =
        std::env::temp_dir().join(format!("nf-poster-import-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&path);
    path
}
