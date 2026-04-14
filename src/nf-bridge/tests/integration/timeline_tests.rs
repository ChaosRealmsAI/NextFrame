use super::*;

#[test]
fn dispatch_timeline_save_and_load_round_trips_json() {
    let temp = TestDir::new("integration-timeline");
    let path = temp.join("timeline.json");
    let timeline = json!({
        "version": "0.1",
        "duration": 42,
        "background": "#101820",
        "tracks": [
            {
                "id": "track-1",
                "kind": "video",
                "clips": [
                    {
                        "id": "clip-1",
                        "start": 0,
                        "dur": 42,
                        "scene": "auroraGradient",
                        "params": {
                            "text": "integration"
                        }
                    }
                ]
            }
        ]
    });

    let save_response = dispatch_request(
        "timeline.save",
        json!({
            "path": path.display().to_string(),
            "json": timeline.clone(),
        }),
    );
    assert!(save_response.ok);
    assert_eq!(save_response.id, "req-timeline.save");

    let load_response = dispatch_request(
        "timeline.load",
        json!({ "path": path.display().to_string() }),
    );
    assert!(load_response.ok);
    assert_eq!(load_response.id, "req-timeline.load");
    assert_eq!(load_response.result, timeline);
}

#[test]
fn dispatch_timeline_load_with_invalid_json_returns_parse_error() {
    let temp = TestDir::new("integration-timeline-invalid");
    let path = temp.join("broken.json");
    fs::write(&path, "{ definitely not valid json").expect("write invalid json fixture");

    let response = dispatch_request(
        "timeline.load",
        json!({ "path": path.display().to_string() }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-timeline.load");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "failed to parse timeline");
}

#[test]
fn dispatch_timeline_save_and_load_round_trips_large_json_payload() {
    let temp = TestDir::new("integration-timeline-large");
    let path = temp.join("timeline-large.json");
    let large_payload = "timeline-payload-".repeat(70_000);
    assert!(
        large_payload.len() > 1_000_000,
        "expected payload above 1MB"
    );

    let timeline = json!({
        "version": "0.1",
        "duration": 42,
        "background": "#101820",
        "tracks": [
            {
                "id": "track-large",
                "kind": "video",
                "clips": [
                    {
                        "id": "clip-large",
                        "start": 0,
                        "dur": 42,
                        "scene": "auroraGradient",
                        "params": {
                            "text": large_payload
                        }
                    }
                ]
            }
        ]
    });

    let save_response = dispatch_request_with_id(
        "req-timeline.save-large",
        "timeline.save",
        json!({
            "path": path.display().to_string(),
            "json": timeline.clone(),
        }),
    );
    assert!(
        save_response.ok,
        "timeline.save failed: {:?}",
        save_response.error
    );
    assert!(
        save_response
            .result
            .get("bytesWritten")
            .and_then(Value::as_u64)
            .expect("bytesWritten")
            > 1_000_000
    );

    let load_response = dispatch_request_with_id(
        "req-timeline.load-large",
        "timeline.load",
        json!({ "path": path.display().to_string() }),
    );
    assert!(
        load_response.ok,
        "timeline.load failed: {:?}",
        load_response.error
    );
    assert_eq!(load_response.result, timeline);
}
