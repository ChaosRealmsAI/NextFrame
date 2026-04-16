use super::*;

#[test]
fn dispatch_export_status_with_invalid_pid_returns_error() {
    let response = dispatch_request("export.status", json!({ "pid": "bad-pid" }));

    assert!(!response.ok);
    assert_eq!(response.id, "req-export.status");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(
        response.error.as_deref(),
        "params.pid must be an unsigned integer",
    );
}

#[test]
fn dispatch_export_cancel_with_unknown_pid_returns_ok_false() {
    let response = dispatch_request("export.cancel", json!({ "pid": 999_999u32 }));

    assert!(response.ok);
    assert_eq!(response.id, "req-export.cancel");
    assert_eq!(response.result.get("ok"), Some(&json!(false)));
    assert_eq!(response.result.get("error"), Some(&json!("unknown_pid")));
}

#[test]
fn dispatch_export_log_reads_jsonl_entries() {
    let temp = TestDir::new("integration-export-log");
    let log_path = temp.join("export.log");
    fs::write(
        &log_path,
        "{\"level\":\"info\",\"msg\":\"start\"}\nnot-json\n{\"level\":\"info\",\"msg\":\"done\"}\n",
    )
    .expect("write log fixture");

    let response = dispatch_request(
        "export.log",
        json!({ "path": log_path.display().to_string() }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-export.log");
    assert_eq!(response.result.get("count"), Some(&json!(2)));
    let entries = response
        .result
        .get("entries")
        .and_then(Value::as_array)
        .expect("log entries array");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].get("msg"), Some(&json!("start")));
    assert_eq!(entries[1].get("msg"), Some(&json!("done")));
}

#[test]
fn dispatch_export_mux_audio_without_audio_sources_keeps_existing_output() {
    let temp = TestDir::new("integration-export-mux-audio");
    let video_path = temp.join("video-only.mp4");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, "silent-video").expect("write source video");

    let response = dispatch_request(
        "export.muxAudio",
        json!({
            "videoPath": video_path.display().to_string(),
            "audioSources": [],
            "outputPath": output_path.display().to_string(),
        }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-export.muxAudio");
    assert_eq!(response.result.get("ok"), Some(&json!(true)));
    assert_eq!(
        response.result.get("outputPath"),
        Some(&json!(output_path.display().to_string()))
    );
    assert_eq!(
        fs::read_to_string(&output_path).expect("read output video"),
        "silent-video"
    );
    assert!(
        !video_path.exists(),
        "expected intermediate source video to be removed"
    );
}
