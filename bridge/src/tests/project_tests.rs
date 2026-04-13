use super::*;

#[test]
fn project_list_returns_empty_array_for_empty_dir() {
    let temp = TestDir::new("project-list-empty");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    fs::create_dir_all(temp.join("NextFrame/projects")).expect("create projects root");

    let response = dispatch(request("project.list", json!({})));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "projects": [] }));
}

#[test]
fn project_create_creates_dir_and_project_json() {
    let temp = TestDir::new("project-create");
    let _home = HomeDirOverrideGuard::new(&temp.path);

    let response = dispatch(request("project.create", json!({ "name": "alpha" })));

    assert!(response.ok);

    let project_dir = temp.join("NextFrame/projects/alpha");
    let project_json_path = project_dir.join("project.json");
    assert_eq!(
        response.result,
        json!({ "path": project_dir.display().to_string() })
    );
    assert!(project_dir.is_dir());
    assert!(project_json_path.is_file());

    let meta: Value =
        serde_json::from_str(&fs::read_to_string(&project_json_path).expect("read project.json"))
            .expect("parse project.json");
    let created = meta
        .get("created")
        .and_then(Value::as_str)
        .expect("project created timestamp");
    let updated = meta
        .get("updated")
        .and_then(Value::as_str)
        .expect("project updated timestamp");
    assert_eq!(meta.get("name"), Some(&json!("alpha")));
    assert!(!created.is_empty());
    assert!(!updated.is_empty());
    assert_eq!(created, updated);
}

#[test]
fn episode_list_returns_empty_array_for_empty_project() {
    let temp = TestDir::new("episode-list-empty");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_dir = temp.join("NextFrame/projects/alpha");
    fs::create_dir_all(&project_dir).expect("create project dir");
    fs::write(
        project_dir.join("project.json"),
        serde_json::to_string_pretty(&json!({
            "name": "alpha",
            "created": "2000-01-01T00:00:00Z",
            "updated": "2000-01-01T00:00:00Z",
        }))
        .expect("serialize project.json"),
    )
    .expect("write project.json");

    let response = dispatch(request("episode.list", json!({ "project": "alpha" })));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "episodes": [] }));
}

#[test]
fn episode_create_creates_dir_and_updates_project_timestamp() {
    let temp = TestDir::new("episode-create");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_dir = temp.join("NextFrame/projects/alpha");
    let project_json_path = project_dir.join("project.json");
    fs::create_dir_all(&project_dir).expect("create project dir");
    fs::write(
        &project_json_path,
        serde_json::to_string_pretty(&json!({
            "name": "alpha",
            "created": "2000-01-01T00:00:00Z",
            "updated": "2000-01-01T00:00:00Z",
        }))
        .expect("serialize project.json"),
    )
    .expect("write project.json");

    let response = dispatch(request(
        "episode.create",
        json!({
            "project": "alpha",
            "name": "ep-01",
        }),
    ));

    assert!(response.ok);

    let episode_dir = project_dir.join("ep-01");
    let episode_json_path = episode_dir.join("episode.json");
    assert_eq!(
        response.result,
        json!({ "path": episode_dir.display().to_string() })
    );
    assert!(episode_dir.is_dir());
    assert!(episode_json_path.is_file());

    let episode_meta: Value =
        serde_json::from_str(&fs::read_to_string(&episode_json_path).expect("read episode.json"))
            .expect("parse episode.json");
    let episode_created = episode_meta
        .get("created")
        .and_then(Value::as_str)
        .expect("episode created timestamp");
    assert_eq!(episode_meta.get("name"), Some(&json!("ep-01")));
    assert_eq!(episode_meta.get("order"), Some(&json!(0)));
    assert!(!episode_created.is_empty());

    let project_meta: Value = serde_json::from_str(
        &fs::read_to_string(&project_json_path).expect("read updated project.json"),
    )
    .expect("parse updated project.json");
    assert_eq!(
        project_meta.get("created"),
        Some(&json!("2000-01-01T00:00:00Z"))
    );
    assert_eq!(project_meta.get("updated"), Some(&json!(episode_created)));
}

#[test]
fn segment_list_returns_empty_array_for_empty_episode() {
    let temp = TestDir::new("segment-list-empty");
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
        .expect("serialize episode.json"),
    )
    .expect("write episode.json");

    let response = dispatch(request(
        "segment.list",
        json!({
            "project": "alpha",
            "episode": "ep-01",
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "segments": [] }));
}

#[test]
fn segment_video_url_returns_exists_false_when_file_is_missing() {
    let temp = TestDir::new("segment-video-url-missing");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let episode_dir = temp.join("NextFrame/projects/alpha/ep-01");
    fs::create_dir_all(&episode_dir).expect("create episode dir");

    let response = dispatch(request(
        "segment.videoUrl",
        json!({
            "project": "alpha",
            "episode": "ep-01",
            "segment": "seg-01",
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "exists": false }));
}
