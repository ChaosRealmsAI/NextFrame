use super::*;

#[test]
fn dispatch_autosave_write_list_and_clear_round_trip() {
    let temp = TestDir::new("integration-autosave-round-trip");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let autosave_path = temp.join(".nextframe/autosave/alpha.nfproj");
    let timeline = json!({
        "version": "1",
        "tracks": [{"id": "track-1", "clips": []}],
    });

    let write_response = dispatch_request(
        "autosave.write",
        json!({
            "projectId": "alpha",
            "timeline": timeline,
        }),
    );
    assert!(write_response.ok);
    assert_eq!(
        write_response.result.get("path"),
        Some(&json!(autosave_path.display().to_string()))
    );

    let list_response = dispatch_request("autosave.list", json!({}));
    assert!(list_response.ok);
    let entries = list_response
        .result
        .as_array()
        .expect("autosave entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].get("projectId"), Some(&json!("alpha")));
    assert_eq!(
        entries[0].get("path"),
        Some(&json!(autosave_path.display().to_string()))
    );
    assert!(
        entries[0]
            .get("modified")
            .and_then(Value::as_u64)
            .is_some_and(|modified| modified > 0),
        "expected modified timestamp"
    );

    let clear_response = dispatch_request("autosave.clear", json!({ "projectId": "alpha" }));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let cleared_list_response = dispatch_request("autosave.list", json!({}));
    assert!(cleared_list_response.ok);
    assert_eq!(cleared_list_response.result, json!([]));
}

#[test]
fn dispatch_autosave_write_rejects_project_id_with_slash() {
    let response = dispatch_request(
        "autosave.write",
        json!({
            "projectId": "folder/name",
            "timeline": { "tracks": [] },
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-autosave.write");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "invalid autosave project id");
}
