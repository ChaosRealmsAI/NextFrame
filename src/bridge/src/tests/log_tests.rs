use super::*;

#[test]
fn log_dispatch_happy_and_error() {
    let response = dispatch(request(
        "log",
        json!({
            "level": "info",
            "msg": "hello from tests",
        }),
    ));
    assert!(response.ok);
    assert_eq!(response.result.get("logged"), Some(&json!(true)));

    let error_response = dispatch(request(
        "log",
        json!({
            "level": "info",
        }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.msg");
}
