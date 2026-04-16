//! timeline tests
use super::*;

#[test]
fn timeline_load_dispatch_happy_path() {
    let temp = TestDir::new("timeline-load");
    let timeline_path = temp.join("timeline.json");
    fs::write(
        &timeline_path,
        r##"{"version":"0.1","duration":30,"background":"#0b0b14","tracks":[{"id":"track-1","kind":"video","clips":[]}]}"##,
    )
    .expect("write timeline");

    let response = dispatch(request(
        "timeline.load",
        json!({ "path": timeline_path.display().to_string() }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result,
        json!({
            "version": "0.1",
            "duration": 30,
            "background": "#0b0b14",
            "tracks": [
                { "id": "track-1", "kind": "video", "clips": [] }
            ]
        })
    );
}

#[test]
fn timeline_load_dispatch_error_on_invalid_json() {
    let temp = TestDir::new("timeline-load-invalid");
    let timeline_path = temp.join("timeline.json");
    fs::write(&timeline_path, "not-json").expect("write invalid timeline");
    let error_response = dispatch(request(
        "timeline.load",
        json!({ "path": timeline_path.display().to_string() }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "failed to parse timeline");
}

#[test]
fn timeline_load_infers_version_for_legacy_tracks() {
    let temp = TestDir::new("timeline-load-infer-version");
    let timeline_path = temp.join("timeline.json");
    fs::write(
        &timeline_path,
        r##"{"duration":30,"background":"#0b0b14","tracks":[{"id":"track-1","kind":"video","clips":[]}]}"##,
    )
    .expect("write timeline");

    let response = dispatch(request(
        "timeline.load",
        json!({ "path": timeline_path.display().to_string() }),
    ));

    assert!(response.ok);
    assert_eq!(response.result.get("version"), Some(&json!("0.1")));
}

#[test]
fn timeline_load_dispatch_error_on_contract_violation() {
    let temp = TestDir::new("timeline-load-contract-violation");
    let timeline_path = temp.join("timeline.json");
    fs::write(
        &timeline_path,
        r##"{"version":"0.1","duration":30,"background":"#0b0b14","tracks":[{"id":"track-1","kind":"video","clips":[{"id":"clip-1","start":0,"dur":3}]}]}"##,
    )
    .expect("write invalid timeline");

    let response = dispatch(request(
        "timeline.load",
        json!({ "path": timeline_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "tracks[0].clips[0].scene");
}

#[test]
fn timeline_load_rejects_symlink_escape() {
    let temp = TestDir::new("timeline-load-symlink");
    let link_path = temp.join("timeline-link.json");
    create_file_symlink(Path::new(&disallowed_absolute_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "timeline.load",
        json!({ "path": link_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn timeline_save_dispatch_happy_path() {
    let temp = TestDir::new("timeline-save");
    let timeline_path = temp.join("saved-timeline.json");
    let timeline_path_string = timeline_path.display().to_string();

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": timeline_path_string,
            "json": {
                "version": "1",
                "duration": 30,
                "background": "#0b0b14",
                "tracks": [
                    { "id": "track-2", "kind": "video", "clips": [] }
                ]
            }
        }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result.get("path"),
        Some(&json!(timeline_path.display().to_string()))
    );

    let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
    let saved_json: Value = serde_json::from_str(&saved).expect("parse saved timeline");
    assert_eq!(
        saved_json,
        json!({
            "version": "1",
            "duration": 30,
            "background": "#0b0b14",
            "tracks": [
                { "id": "track-2", "kind": "video", "clips": [] }
            ]
        })
    );
}

#[test]
fn timeline_save_accepts_timeline_alias() {
    let temp = TestDir::new("timeline-save-alias");
    let timeline_path = temp.join("saved-timeline-alias.json");
    let timeline_path_string = timeline_path.display().to_string();

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": timeline_path_string,
            "timeline": {
                "version": "1",
                "duration": 45,
                "background": "#050814",
                "tracks": [
                    { "id": "track-3", "kind": "video", "clips": [] }
                ]
            }
        }),
    ));
    assert!(response.ok);

    let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
    let saved_json: Value = serde_json::from_str(&saved).expect("parse saved timeline");
    assert_eq!(
        saved_json,
        json!({
            "version": "1",
            "duration": 45,
            "background": "#050814",
            "tracks": [
                { "id": "track-3", "kind": "video", "clips": [] }
            ]
        })
    );
}

#[test]
fn timeline_save_dispatch_error_on_disallowed_path() {
    let error_response = dispatch(request(
        "timeline.save",
        json!({
            "path": disallowed_absolute_path(),
            "json": { "version": 3 }
        }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "outside sandbox");
}

#[test]
fn timeline_save_rejects_symlink_parent_escape() {
    let temp = TestDir::new("timeline-save-parent-symlink");
    let link_path = temp.join("escape-dir");
    create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": link_path.join("blocked.json").display().to_string(),
            "json": minimal_timeline_json(),
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn timeline_save_rejects_symlink_target_escape() {
    let temp = TestDir::new("timeline-save-target-symlink");
    let link_path = temp.join("timeline-link.json");
    create_file_symlink(Path::new(&absolute_write_rejection_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": link_path.display().to_string(),
            "json": minimal_timeline_json(),
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}
