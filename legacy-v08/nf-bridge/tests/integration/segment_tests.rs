use super::*;

#[test]
fn dispatch_segment_video_url_rejects_parent_traversal() {
    let response = dispatch_request(
        "segment.videoUrl",
        json!({
            "project": "../alpha",
            "episode": "ep-01",
            "segment": "seg-01",
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-segment.videoUrl");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "invalid params.project");
}

#[test]
fn dispatch_segment_list_returns_sorted_segments_with_durations() {
    let temp = TestDir::new("integration-segment-list");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let episode_dir = temp.join("NextFrame/projects/alpha/ep-01");
    fs::create_dir_all(&episode_dir).expect("create episode dir");
    fs::write(
        episode_dir.join("episode.json"),
        serde_json::to_string_pretty(&json!({
            "name": "ep-01",
            "order": 0,
            "created": "2000-01-01T00:00:00Z",
        }))
        .expect("serialize episode json"),
    )
    .expect("write episode json");
    fs::write(
        episode_dir.join("b-segment.json"),
        serde_json::to_string_pretty(&json!({ "duration": 8.5 })).expect("serialize segment"),
    )
    .expect("write segment b");
    fs::write(
        episode_dir.join("a-segment.json"),
        serde_json::to_string_pretty(&json!({ "duration": 3.25 })).expect("serialize segment"),
    )
    .expect("write segment a");

    let response = dispatch_request(
        "segment.list",
        json!({
            "project": "alpha",
            "episode": "ep-01",
        }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-segment.list");
    assert_eq!(
        response.result,
        json!({
            "segments": [
                {
                    "name": "a-segment",
                    "path": episode_dir.join("a-segment.json").display().to_string(),
                    "duration": 3.25,
                },
                {
                    "name": "b-segment",
                    "path": episode_dir.join("b-segment.json").display().to_string(),
                    "duration": 8.5,
                }
            ]
        })
    );
}
