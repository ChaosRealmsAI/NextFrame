use super::*;

#[test]
fn dispatch_export_status_with_invalid_pid_returns_error() {
    let response = dispatch_request("export.status", json!({ "pid": "bad-pid" }));

    assert!(!response.ok);
    assert_eq!(response.id, "req-export.status");
    assert_eq!(response.result, Value::Null);
    assert_eq!(
        response.error.as_deref(),
        Some("params.pid must be an unsigned integer")
    );
}
