use super::*;

#[test]
fn dispatch_unknown_method_returns_error() {
    let response = dispatch_request("missing.method", json!({}));

    assert!(!response.ok);
    assert_eq!(response.id, "req-missing.method");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "unknown method: missing.method");
}

#[test]
fn dispatch_log_with_valid_params_returns_logged_true() {
    let response = dispatch_request(
        "log",
        json!({
            "level": "info",
            "msg": "integration test message",
        }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-log");
    assert_eq!(response.result.get("logged"), Some(&json!(true)));
    assert_eq!(response.error, None);
}

#[test]
fn dispatch_multiple_methods_support_a_real_user_session() {
    let temp = TestDir::new("integration-real-session");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_path = temp.join("NextFrame/projects/alpha");
    let episode_path = project_path.join("ep-01");
    let note_path = episode_path.join("notes.txt");
    let autosave_path = temp.join(".nextframe/autosave/alpha.nfproj");
    let recent_project_file = temp.join("alpha-session.nfproj");
    fs::write(&recent_project_file, "{}").expect("write recent project file");
    let canonical_recent_project =
        fs::canonicalize(&recent_project_file).expect("canonicalize recent project");

    let create_project = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(create_project.ok);

    let create_episode = dispatch_request(
        "episode.create",
        json!({
            "project": "alpha",
            "name": "ep-01",
        }),
    );
    assert!(create_episode.ok);

    let write_note = dispatch_request(
        "fs.write",
        json!({
            "path": note_path.display().to_string(),
            "contents": "shot list",
        }),
    );
    assert!(write_note.ok);

    let read_note = dispatch_request(
        "fs.read",
        json!({ "path": note_path.display().to_string() }),
    );
    assert!(read_note.ok);
    assert_eq!(read_note.result.get("contents"), Some(&json!("shot list")));

    let autosave_write = dispatch_request(
        "autosave.write",
        json!({
            "projectId": "alpha",
            "json": {
                "version": "1",
                "tracks": [{"id": "track-1", "clips": []}],
            }
        }),
    );
    assert!(autosave_write.ok);

    let recent_add = dispatch_request(
        "recent.add",
        json!({ "path": recent_project_file.display().to_string() }),
    );
    assert!(recent_add.ok);

    let project_list = dispatch_request("project.list", json!({}));
    assert!(project_list.ok);
    assert_eq!(
        project_list.result,
        json!({
            "projects": [{
                "name": "alpha",
                "path": project_path.display().to_string(),
                "episodes": 1,
                "updated": project_list.result["projects"][0]["updated"].as_str().expect("updated timestamp"),
            }]
        })
    );

    let episode_list = dispatch_request("episode.list", json!({ "project": "alpha" }));
    assert!(episode_list.ok);
    assert_eq!(
        episode_list.result,
        json!({
            "episodes": [{
                "name": "ep-01",
                "path": episode_path.display().to_string(),
                "order": 0,
                "segments": 0,
                "totalDuration": 0.0,
            }]
        })
    );

    let autosave_list = dispatch_request("autosave.list", json!({}));
    assert!(autosave_list.ok);
    let autosave_entries = autosave_list
        .result
        .as_array()
        .expect("autosave entries array");
    assert_eq!(autosave_entries.len(), 1);
    assert_eq!(autosave_entries[0].get("projectId"), Some(&json!("alpha")));
    assert_eq!(
        autosave_entries[0].get("path"),
        Some(&json!(autosave_path.display().to_string()))
    );

    let recent_list = dispatch_request("recent.list", json!({}));
    assert!(recent_list.ok);
    let recent_entries = recent_list.result.as_array().expect("recent entries array");
    assert_eq!(recent_entries.len(), 1);
    assert_eq!(
        recent_entries[0].get("path"),
        Some(&json!(canonical_recent_project.display().to_string()))
    );

    let autosave_clear = dispatch_request("autosave.clear", json!({ "projectId": "alpha" }));
    assert!(autosave_clear.ok);
    let recent_clear = dispatch_request("recent.clear", json!({}));
    assert!(recent_clear.ok);
    assert_eq!(
        dispatch_request("autosave.list", json!({})).result,
        json!([])
    );
    assert_eq!(dispatch_request("recent.list", json!({})).result, json!([]));
}

#[test]
fn dispatch_methods_with_missing_required_params_return_errors() {
    let cases = [
        ("autosave.write", "missing params.projectId"),
        ("autosave.clear", "missing params.projectId"),
        ("autosave.recover", "missing params.projectId"),
        ("fs.read", "missing params.path"),
        ("fs.write", "missing params.path"),
        ("fs.listDir", "missing params.path"),
        ("fs.dialogOpen", "missing params.filters"),
        ("fs.dialogSave", "missing params.defaultName"),
        ("fs.reveal", "missing params.path"),
        ("fs.writeBase64", "missing params.path"),
        ("export.start", "missing params.outputPath"),
        ("export.status", "missing params.pid"),
        ("export.cancel", "missing params.pid"),
        ("export.muxAudio", "missing params.videoPath"),
        ("log", "missing params.level"),
        ("recent.add", "missing params.path"),
        ("timeline.load", "missing params.path"),
        ("timeline.save", "missing params.path"),
        ("project.create", "missing params.name"),
        ("episode.list", "missing params.project"),
        ("episode.create", "missing params.project"),
        ("segment.list", "missing params.project"),
        ("segment.videoUrl", "missing params.project"),
        ("preview.frame", "missing params.timelinePath"),
        ("fs.mtime", "missing params.path"),
    ];

    for (method, expected_error) in cases {
        let response = dispatch_request(method, json!({}));

        assert!(
            !response.ok,
            "expected missing params for {method} to return an error"
        );
        assert_eq!(response.id, format!("req-{method}"));
        assert_eq!(response.result, Value::Null);
        assert_error_contains(response.error.as_deref(), expected_error);
    }
}

#[test]
fn dispatch_log_handles_50_rapid_requests_without_error() {
    thread::scope(|scope| {
        let mut handles = Vec::new();

        for iteration in 0..50 {
            handles.push(scope.spawn(move || {
                dispatch_request_with_id(
                    format!("req-log-{iteration}"),
                    "log",
                    json!({
                        "level": "info",
                        "msg": format!("stress log message {iteration}"),
                    }),
                )
            }));
        }

        for handle in handles {
            let response = handle.join().expect("join log request");
            assert!(response.ok, "log failed: {:?}", response.error);
            assert_eq!(response.result.get("logged"), Some(&json!(true)));
        }
    });
}
