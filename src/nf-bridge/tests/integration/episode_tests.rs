use super::*;

#[test]
fn dispatch_episode_create_then_list_returns_created_episode() {
    let temp = TestDir::new("integration-episode-create-list");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let episode_path = temp.join("NextFrame/projects/alpha/ep-01");

    let project_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(project_response.ok);

    let create_response = dispatch_request(
        "episode.create",
        json!({
            "project": "alpha",
            "name": "ep-01",
        }),
    );
    assert!(create_response.ok);
    assert_eq!(
        create_response.result,
        json!({ "path": episode_path.display().to_string() })
    );

    let list_response = dispatch_request("episode.list", json!({ "project": "alpha" }));
    assert!(list_response.ok);

    let episodes = list_response
        .result
        .get("episodes")
        .and_then(Value::as_array)
        .expect("episodes array");
    assert_eq!(episodes.len(), 1);
    assert_eq!(episodes[0].get("name"), Some(&json!("ep-01")));
    assert_eq!(
        episodes[0].get("path"),
        Some(&json!(episode_path.display().to_string()))
    );
    assert_eq!(episodes[0].get("order"), Some(&json!(0)));
    assert_eq!(episodes[0].get("segments"), Some(&json!(0)));
    assert_eq!(episodes[0].get("totalDuration"), Some(&json!(0.0)));
}

#[test]
fn dispatch_episode_create_with_nonexistent_project_returns_error() {
    let temp = TestDir::new("integration-episode-create-missing-project");
    let _home = HomeDirOverrideGuard::new(&temp.path);

    let response = dispatch_request(
        "episode.create",
        json!({
            "project": "missing-project",
            "name": "ep-01",
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-episode.create");
    assert_eq!(response.result, Value::Null);
    assert_eq!(
        response.error.as_deref(),
        Some("project 'missing-project' not found")
    );
}
