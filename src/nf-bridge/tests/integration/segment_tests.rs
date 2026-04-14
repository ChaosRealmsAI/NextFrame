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
