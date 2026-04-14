use super::*;

#[test]
fn recent_add_dispatch_dedupes_and_caps_entries() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "recent-add");
    let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));

    for index in 0..12 {
        let project_path = temp.join(&format!("project-{index}.nfproj"));
        fs::write(&project_path, "{}").expect("write project");

        let response = dispatch(request(
            "recent.add",
            json!({ "path": project_path.display().to_string() }),
        ));
        assert!(response.ok);
    }

    let duplicate_path = temp.join("project-5.nfproj");
    let response = dispatch(request(
        "recent.add",
        json!({ "path": duplicate_path.display().to_string() }),
    ));
    assert!(response.ok);

    let list_response = dispatch(request("recent.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("recent entries array");
    assert_eq!(entries.len(), 10);

    let names = entries
        .iter()
        .map(|entry| {
            entry
                .get("name")
                .and_then(Value::as_str)
                .expect("recent entry name")
        })
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        vec![
            "project-5.nfproj",
            "project-11.nfproj",
            "project-10.nfproj",
            "project-9.nfproj",
            "project-8.nfproj",
            "project-7.nfproj",
            "project-6.nfproj",
            "project-4.nfproj",
            "project-3.nfproj",
            "project-2.nfproj",
        ]
    );

    let unique_paths = entries
        .iter()
        .map(|entry| {
            entry
                .get("path")
                .and_then(Value::as_str)
                .expect("recent entry path")
        })
        .collect::<HashSet<_>>();
    assert_eq!(unique_paths.len(), entries.len());
}

#[test]
fn recent_add_then_recent_list_returns_added_project() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "recent-add-list");
    let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));
    let project_path = temp.join("storyboard.nfproj");
    fs::write(&project_path, "{}").expect("write project");

    let add_response = dispatch(request(
        "recent.add",
        json!({ "path": project_path.display().to_string() }),
    ));
    assert!(add_response.ok);
    assert_eq!(add_response.result.get("count"), Some(&json!(1)));

    let list_response = dispatch(request("recent.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("recent entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(
        entries[0].get("path"),
        Some(&json!(project_path.display().to_string()))
    );
    assert_eq!(entries[0].get("name"), Some(&json!("storyboard.nfproj")));
}

#[test]
fn recent_clear_empties_the_list() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "recent-clear");
    let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));
    let project_path = temp.join("clear-me.nfproj");
    fs::write(&project_path, "{}").expect("write project");

    let add_response = dispatch(request(
        "recent.add",
        json!({ "path": project_path.display().to_string() }),
    ));
    assert!(add_response.ok);

    let clear_response = dispatch(request("recent.clear", json!({})));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let list_response = dispatch(request("recent.list", json!({})));
    assert!(list_response.ok);
    assert_eq!(
        list_response
            .result
            .as_array()
            .expect("recent entries array")
            .len(),
        0
    );
}

#[test]
fn recent_add_deduplicates_same_path() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "recent-dedupe");
    let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));
    let project_path = temp.join("duplicate.nfproj");
    fs::write(&project_path, "{}").expect("write project");

    let first_response = dispatch(request(
        "recent.add",
        json!({ "path": project_path.display().to_string() }),
    ));
    assert!(first_response.ok);

    let second_response = dispatch(request(
        "recent.add",
        json!({ "path": project_path.display().to_string() }),
    ));
    assert!(second_response.ok);
    assert_eq!(second_response.result.get("count"), Some(&json!(1)));

    let list_response = dispatch(request("recent.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("recent entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(
        entries[0].get("path"),
        Some(&json!(project_path.display().to_string()))
    );
}

#[test]
fn recent_project_name_extracts_file_name_from_path() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "recent-name");
    let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));
    let project_dir = temp.join("projects");
    fs::create_dir_all(&project_dir).expect("create project dir");
    let project_path = project_dir.join("episode-1.nfproj");
    fs::write(&project_path, "{}").expect("write project");

    let add_response = dispatch(request(
        "recent.add",
        json!({ "path": project_path.display().to_string() }),
    ));
    assert!(add_response.ok);

    let list_response = dispatch(request("recent.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("recent entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].get("name"), Some(&json!("episode-1.nfproj")));
}
