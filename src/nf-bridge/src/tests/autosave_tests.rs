use super::*;

#[test]
fn autosave_dispatch_round_trips_and_lists_entries() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-round-trip");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir.clone());

    let untitled_response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": "untitled-1234",
            "timeline": minimal_timeline_json(),
        }),
    ));
    assert!(untitled_response.ok);

    thread::sleep(Duration::from_millis(5));

    let saved_project_id = "path-%2FUsers%2Fdemo%2Fedit.nfproj";
    let saved_response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": saved_project_id,
            "timeline": {
                "version": "1",
                "duration": 45,
                "tracks": []
            },
        }),
    ));
    assert!(saved_response.ok);

    let list_response = dispatch(request("autosave.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("autosave entries array");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].get("projectId"), Some(&json!(saved_project_id)));
    assert_eq!(entries[1].get("projectId"), Some(&json!("untitled-1234")));
    assert!(entries[0]
        .get("path")
        .and_then(Value::as_str)
        .expect("autosave path")
        .ends_with(".nfproj"));

    let recover_response = dispatch(request(
        "autosave.recover",
        json!({ "projectId": saved_project_id }),
    ));
    assert!(recover_response.ok);
    assert_eq!(
        recover_response.result,
        json!({
            "version": "1",
            "duration": 45,
            "tracks": []
        })
    );

    let clear_response = dispatch(request(
        "autosave.clear",
        json!({ "projectId": saved_project_id }),
    ));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let remaining = dispatch(request("autosave.list", json!({})));
    assert!(remaining.ok);
    let remaining_entries = remaining.result.as_array().expect("remaining autosaves");
    assert_eq!(remaining_entries.len(), 1);
    assert_eq!(
        remaining_entries[0].get("projectId"),
        Some(&json!("untitled-1234"))
    );
}

#[test]
fn autosave_rejects_invalid_project_id() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-invalid-id");
    let _autosave_override = AutosaveStorageOverrideGuard::new(temp.join(".nextframe/autosave"));

    let response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": "../escape",
            "timeline": minimal_timeline_json(),
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "invalid autosave project id");
}

#[test]
fn autosave_write_then_recover_round_trips_content() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-round-trip-explicit");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir);

    let project_id = "episode-42";
    let timeline = json!({
        "version": 2,
        "metadata": {
            "name": "Autosave Round Trip",
            "fps": 24,
            "durationMs": 2400
        },
        "tracks": [
            {
                "id": "video-1",
                "clips": [
                    {
                        "id": "clip-1",
                        "startMs": 0,
                        "durationMs": 2400
                    }
                ]
            }
        ]
    });

    let write_response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": project_id,
            "timeline": timeline.clone(),
        }),
    ));
    assert!(write_response.ok);

    let recover_response = dispatch(request(
        "autosave.recover",
        json!({ "projectId": project_id }),
    ));
    assert!(recover_response.ok);
    assert_eq!(recover_response.result, timeline);
}

#[test]
fn autosave_clear_removes_the_only_saved_entry() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-clear-only-entry");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir);

    let project_id = "clear-me";
    let write_response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": project_id,
            "timeline": minimal_timeline_json(),
        }),
    ));
    assert!(write_response.ok);

    let clear_response = dispatch(request(
        "autosave.clear",
        json!({ "projectId": project_id }),
    ));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let list_response = dispatch(request("autosave.list", json!({})));
    assert!(list_response.ok);
    assert_eq!(
        list_response
            .result
            .as_array()
            .expect("autosave entries")
            .len(),
        0
    );

    let recover_response = dispatch(request(
        "autosave.recover",
        json!({ "projectId": project_id }),
    ));
    assert!(!recover_response.ok);
    assert_error_contains(&recover_response.error, "failed to read autosave");
}

#[test]
fn autosave_list_returns_entries_sorted_by_modified_time() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-list-sort");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir);

    for (index, project_id) in ["oldest", "middle", "newest"].into_iter().enumerate() {
        let response = dispatch(request(
            "autosave.write",
            json!({
                "projectId": project_id,
                "timeline": {
                    "version": 1,
                    "order": index,
                    "tracks": []
                },
            }),
        ));
        assert!(response.ok);

        if project_id != "newest" {
            thread::sleep(Duration::from_millis(20));
        }
    }

    let list_response = dispatch(request("autosave.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("autosave entries array");
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].get("projectId"), Some(&json!("newest")));
    assert_eq!(entries[1].get("projectId"), Some(&json!("middle")));
    assert_eq!(entries[2].get("projectId"), Some(&json!("oldest")));

    let modified = entries
        .iter()
        .map(|entry| {
            entry
                .get("modified")
                .and_then(Value::as_u64)
                .expect("modified timestamp")
        })
        .collect::<Vec<_>>();
    assert!(modified[0] >= modified[1]);
    assert!(modified[1] >= modified[2]);
}

#[test]
fn autosave_rejects_project_ids_with_slashes_and_dot_segments() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-invalid-project-ids");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir);

    for project_id in ["folder/name", "folder\\name", ".", ".."] {
        let write_response = dispatch(request(
            "autosave.write",
            json!({
                "projectId": project_id,
                "timeline": minimal_timeline_json(),
            }),
        ));
        assert!(
            !write_response.ok,
            "expected write to reject '{project_id}'"
        );
        assert_error_contains(&write_response.error, "invalid autosave project id");

        let clear_response = dispatch(request(
            "autosave.clear",
            json!({ "projectId": project_id }),
        ));
        assert!(
            !clear_response.ok,
            "expected clear to reject '{project_id}'"
        );
        assert_error_contains(&clear_response.error, "invalid autosave project id");

        let recover_response = dispatch(request(
            "autosave.recover",
            json!({ "projectId": project_id }),
        ));
        assert!(
            !recover_response.ok,
            "expected recover to reject '{project_id}'"
        );
        assert_error_contains(&recover_response.error, "invalid autosave project id");
    }
}

#[test]
fn autosave_write_overwrites_existing_save_for_same_project() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-overwrite");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir);

    let project_id = "same-project";
    let first_timeline = json!({
        "version": 1,
        "tracks": [
            { "id": "audio-1" }
        ]
    });
    let second_timeline = json!({
        "version": 2,
        "tracks": [
            { "id": "audio-2" }
        ],
        "metadata": {
            "name": "Overwritten"
        }
    });

    let first_write = dispatch(request(
        "autosave.write",
        json!({
            "projectId": project_id,
            "timeline": first_timeline,
        }),
    ));
    assert!(first_write.ok);

    thread::sleep(Duration::from_millis(20));

    let second_write = dispatch(request(
        "autosave.write",
        json!({
            "projectId": project_id,
            "timeline": second_timeline.clone(),
        }),
    ));
    assert!(second_write.ok);

    let list_response = dispatch(request("autosave.list", json!({})));
    assert!(list_response.ok);
    let entries = list_response.result.as_array().expect("autosave entries");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].get("projectId"), Some(&json!(project_id)));

    let recover_response = dispatch(request(
        "autosave.recover",
        json!({ "projectId": project_id }),
    ));
    assert!(recover_response.ok);
    assert_eq!(recover_response.result, second_timeline);
}

#[test]
fn multiple_autosaves_for_different_projects_coexist() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-multiple-projects");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir);

    let first_project_id = "project-alpha";
    let second_project_id = "project-beta";
    let first_timeline = json!({
        "version": 1,
        "metadata": { "name": "Alpha" },
        "tracks": []
    });
    let second_timeline = json!({
        "version": 1,
        "metadata": { "name": "Beta" },
        "tracks": [
            { "id": "track-1" }
        ]
    });

    let first_write = dispatch(request(
        "autosave.write",
        json!({
            "projectId": first_project_id,
            "timeline": first_timeline.clone(),
        }),
    ));
    assert!(first_write.ok);

    let second_write = dispatch(request(
        "autosave.write",
        json!({
            "projectId": second_project_id,
            "timeline": second_timeline.clone(),
        }),
    ));
    assert!(second_write.ok);

    let list_response = dispatch(request("autosave.list", json!({})));
    assert!(list_response.ok);
    let entries = list_response.result.as_array().expect("autosave entries");
    assert_eq!(entries.len(), 2);

    let project_ids = entries
        .iter()
        .map(|entry| {
            entry
                .get("projectId")
                .and_then(Value::as_str)
                .expect("autosave project id")
        })
        .collect::<HashSet<_>>();
    assert_eq!(
        project_ids,
        HashSet::from([first_project_id, second_project_id])
    );

    let first_recover = dispatch(request(
        "autosave.recover",
        json!({ "projectId": first_project_id }),
    ));
    assert!(first_recover.ok);
    assert_eq!(first_recover.result, first_timeline);

    let second_recover = dispatch(request(
        "autosave.recover",
        json!({ "projectId": second_project_id }),
    ));
    assert!(second_recover.ok);
    assert_eq!(second_recover.result, second_timeline);
}
