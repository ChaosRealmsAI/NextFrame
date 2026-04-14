use super::*;

#[test]
fn scene_list_dispatch_happy_and_error() {
    let response = dispatch(request("scene.list", json!({})));
    assert!(response.ok);

    let scenes = response.result.as_array().expect("scene array");
    assert_eq!(scenes.len(), 10);
    assert_eq!(scenes[0].get("id"), Some(&json!("auroraGradient")));
    assert_eq!(scenes[9].get("id"), Some(&json!("cornerBadge")));

    let error_response = dispatch(request("scene.list", json!("bad params")));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "params must be a JSON object");
}
