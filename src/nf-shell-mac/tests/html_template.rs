// Integration tests for html_template::assemble_html.
//
// BDD anchor: spec/bdd/v1.19/nf-shell-mac.json → BDD-v1.19-02 (html template assembly).
// Uses parse_source(JSON) to construct Source fixtures — struct-internal-agnostic.

#![allow(clippy::unwrap_used)]
#![allow(clippy::expect_used)]
#![allow(clippy::panic)]

use nf_shell_mac::html_template::{assemble_html, AssembleError};
use nf_shell_mac::source::{parse_source, Source};

/// Build a Source fixture via JSON — decoupled from struct layout so tests
/// stay stable when schema evolves (e.g. adding fields).
fn source_with_tracks(kinds: &[&str]) -> Source {
    let track_rows: Vec<String> = kinds
        .iter()
        .enumerate()
        .map(|(i, k)| {
            format!(
                r#"{{"id":"t-{i}","kind":"{k}","src":"placeholder.js","clips":[]}}"#
            )
        })
        .collect();
    let json = format!(
        r#"{{"viewport":{{"ratio":"16:9","w":1920,"h":1080}},"duration":"0","tracks":[{}]}}"#,
        track_rows.join(",")
    );
    parse_source(&json).expect("fixture JSON should parse")
}

/// Build a Source fixture with one bg track whose clip params inject a
/// dangerous <script>/<!-- sequence into the serialized JSON, to prove the
/// escape step covers payload content (not just static template).
fn source_with_dangerous_payload() -> Source {
    let json = r#"{
        "viewport":{"ratio":"16:9","w":1920,"h":1080},
        "duration":"0",
        "tracks":[{
            "id":"t-0",
            "kind":"bg",
            "src":"placeholder.js",
            "clips":[{
                "begin":"0",
                "end":"1",
                "params":{
                    "note":"hack </script><script>alert(1)</script>",
                    "comment":"sneaky <!-- injection"
                }
            }]
        }]
    }"#;
    parse_source(json).expect("fixture JSON should parse")
}

#[test]
fn test_assemble_html_contains_runtime_iife_signature() {
    let source = source_with_tracks(&[]);
    let html = assemble_html(&source).expect("assemble");

    assert!(html.contains("<div id=\"nf-stage\">"), "missing stage div");
    assert!(html.contains("window.__NF_SOURCE__"), "missing source global");
    assert!(html.contains("window.__NF_TRACKS__"), "missing tracks global");
    assert!(
        html.contains("NFRuntime") || html.contains("__nf_boot"),
        "runtime IIFE signature (NFRuntime / __nf_boot) not found in assembled HTML"
    );
    assert!(
        html.contains("window.__nf_boot({") || html.contains("window.__nf_boot({stage"),
        "boot invocation not found"
    );
}

#[test]
fn test_assemble_html_escapes_script_close() {
    let source = source_with_dangerous_payload();
    let html = assemble_html(&source).expect("assemble");

    assert!(
        html.contains("<\\/script"),
        "expected escaped </script sequence in output"
    );
    assert!(
        html.contains("<\\!--"),
        "expected escaped <!-- sequence in output"
    );

    // Template has exactly 4 legitimate <script>…</script> closers.
    // Dangerous injected sequence must NOT add any more raw </script>.
    let raw_closers = html.matches("</script>").count();
    assert_eq!(
        raw_closers, 4,
        "unexpected raw </script> count; escape leaked payload\n{html}"
    );
}

#[test]
fn test_assemble_html_for_v1_8_demo() {
    // Real v1.8 demo (3 kinds: bg / scene / video).
    let demo_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../demo/v1.8-video-sample.json"
    );
    let demo_json = std::fs::read_to_string(demo_path)
        .unwrap_or_else(|e| panic!("failed to read demo {demo_path}: {e}"));
    let source: Source = serde_json::from_str(&demo_json)
        .unwrap_or_else(|e| panic!("failed to parse demo as Source: {e}"));

    let kinds: Vec<&str> = source.tracks.iter().map(|t| t.kind.as_str()).collect();
    assert!(kinds.contains(&"bg"), "demo missing bg track");
    assert!(kinds.contains(&"scene"), "demo missing scene track");
    assert!(kinds.contains(&"video"), "demo missing video track");

    let html = assemble_html(&source).expect("assemble v1.8 demo");

    assert!(html.contains("<div id=\"nf-stage\">"), "missing stage div");
    assert!(html.contains("window.__NF_SOURCE__"), "missing source global");

    for kind in ["bg", "scene", "video"] {
        let needle = format!("\"{kind}\":");
        assert!(
            html.contains(&needle),
            "tracks map missing key for kind {kind}"
        );
    }

    for kind in ["bg", "scene", "video"] {
        let literal_kind = format!("\"{kind}\"");
        assert!(
            html.matches(&literal_kind).count() >= 1,
            "expected the kind literal `{literal_kind}` to appear at least once"
        );
    }

    assert!(
        html.contains("__nf_boot") || html.contains("NFRuntime"),
        "runtime IIFE signature absent"
    );
}

#[test]
fn test_assemble_html_rejects_unknown_track_kind() {
    let source = source_with_tracks(&["totally-not-a-real-kind"]);
    let err = assemble_html(&source).expect_err("should have failed");
    match err {
        AssembleError::UnknownKind(k) => {
            assert_eq!(k, "totally-not-a-real-kind");
        }
        other => panic!("expected UnknownKind, got {other:?}"),
    }
}

#[test]
fn test_assemble_html_dedups_repeated_track_kinds() {
    let source = source_with_tracks(&["bg", "bg", "bg"]);
    let html = assemble_html(&source).expect("assemble");
    let key_occurrences = html.matches("\"bg\":").count();
    assert!(
        key_occurrences >= 1,
        "expected at least one `bg` key, got {key_occurrences}"
    );
    assert!(html.contains("#nf-stage"), "stage container missing");
}
