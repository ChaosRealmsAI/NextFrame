use super::*;

#[test]
fn dispatch_scene_list_returns_non_empty_array() {
    let response = dispatch_request("scene.list", json!({}));

    assert!(response.ok);
    assert_eq!(response.id, "req-scene.list");
    let scenes = response.result.as_array().expect("scene list array");
    assert!(!scenes.is_empty(), "expected scene list to be non-empty");
}

#[test]
fn dispatch_scene_list_is_consistent_across_100_requests() {
    let expected = dispatch_request("scene.list", json!({}));
    assert!(expected.ok);
    let expected_result = expected.result.clone();

    thread::scope(|scope| {
        let mut handles = Vec::new();

        for iteration in 0..100 {
            handles.push(scope.spawn(move || {
                dispatch_request_with_id(
                    format!("req-scene.list-{iteration}"),
                    "scene.list",
                    json!({}),
                )
            }));
        }

        for handle in handles {
            let response = handle.join().expect("join scene.list request");
            assert!(response.ok, "scene.list failed: {:?}", response.error);
            assert_eq!(response.result, expected_result);
        }
    });
}
