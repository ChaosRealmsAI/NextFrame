use super::*;

#[test]
fn dispatch_recent_add_list_and_clear_round_trip() {
    let temp = TestDir::new("integration-recent-round-trip");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_file = temp.join("alpha.nfproj");
    fs::write(&project_file, "{}").expect("write recent project file");
    let canonical_project_file = fs::canonicalize(&project_file).expect("canonicalize project");

    let add_response = dispatch_request(
        "recent.add",
        json!({ "path": project_file.display().to_string() }),
    );
    assert!(add_response.ok);
    assert_eq!(add_response.result.get("count"), Some(&json!(1)));

    let list_response = dispatch_request("recent.list", json!({}));
    assert!(list_response.ok);
    let entries = list_response
        .result
        .as_array()
        .expect("recent entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(
        entries[0].get("path"),
        Some(&json!(canonical_project_file.display().to_string()))
    );
    assert_eq!(entries[0].get("name"), Some(&json!("alpha.nfproj")));
    assert!(
        entries[0]
            .get("lastOpened")
            .and_then(Value::as_u64)
            .is_some_and(|last_opened| last_opened > 0),
        "expected lastOpened timestamp"
    );

    let clear_response = dispatch_request("recent.clear", json!({}));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let cleared_list_response = dispatch_request("recent.list", json!({}));
    assert!(cleared_list_response.ok);
    assert_eq!(cleared_list_response.result, json!([]));
}
