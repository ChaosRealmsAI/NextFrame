use super::*;

#[test]
fn dispatch_project_create_then_list_returns_created_project() {
    let temp = TestDir::new("integration-project-create-list");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_path = temp.join("NextFrame/projects/alpha");

    let create_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(create_response.ok);
    assert_eq!(
        create_response.result,
        json!({ "path": project_path.display().to_string() })
    );

    let list_response = dispatch_request("project.list", json!({}));
    assert!(list_response.ok);

    let projects = list_response
        .result
        .get("projects")
        .and_then(Value::as_array)
        .expect("projects array");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].get("name"), Some(&json!("alpha")));
    assert_eq!(
        projects[0].get("path"),
        Some(&json!(project_path.display().to_string()))
    );
    assert_eq!(projects[0].get("episodes"), Some(&json!(0)));
    assert!(
        projects[0]
            .get("updated")
            .and_then(Value::as_str)
            .is_some_and(|updated| !updated.is_empty()),
        "expected updated timestamp"
    );
}

#[test]
fn dispatch_project_create_duplicate_name_returns_error() {
    let temp = TestDir::new("integration-project-create-duplicate");
    let _home = HomeDirOverrideGuard::new(&temp.path);

    let first_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(first_response.ok);

    let second_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(!second_response.ok);
    assert_eq!(second_response.result, Value::Null);
    assert_eq!(
        second_response.error.as_deref(),
        Some("project 'alpha' already exists")
    );
}

#[test]
fn dispatch_project_create_then_list_returns_all_created_projects() {
    let temp = TestDir::new("integration-project-stress-home");
    let _home = HomeDirOverrideGuard::new(temp.path());

    let project_names = (0..10)
        .map(|iteration| format!("stress-project-{iteration}"))
        .collect::<Vec<_>>();

    thread::scope(|scope| {
        let mut handles = Vec::new();

        for name in &project_names {
            let name = name.clone();
            let expected_path = temp
                .path()
                .join("NextFrame")
                .join("projects")
                .join(&name)
                .display()
                .to_string();

            handles.push(scope.spawn(move || {
                let response = dispatch_request_with_id(
                    format!("req-project.create-{name}"),
                    "project.create",
                    json!({ "name": name }),
                );

                assert!(response.ok, "project.create failed: {:?}", response.error);
                assert_eq!(response.result.get("path"), Some(&json!(expected_path)));
            }));
        }

        for handle in handles {
            handle.join().expect("join project.create request");
        }
    });

    let list_response =
        dispatch_request_with_id("req-project.list-stress", "project.list", json!({}));
    assert!(
        list_response.ok,
        "project.list failed: {:?}",
        list_response.error
    );

    let projects = list_response
        .result
        .get("projects")
        .and_then(Value::as_array)
        .expect("project list array");

    let listed_names = projects
        .iter()
        .filter_map(|project| project.get("name").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect::<HashSet<_>>();
    let expected_names = project_names.into_iter().collect::<HashSet<_>>();

    assert_eq!(projects.len(), 10);
    assert_eq!(listed_names, expected_names);
}
