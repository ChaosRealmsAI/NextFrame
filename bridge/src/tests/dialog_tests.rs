use super::*;

#[test]
fn fs_dialog_open_dispatch_happy_and_error() {
    let response = dispatch(request(
        "fs.dialogOpen",
        json!({
            "filters": [
                ".nfproj"
            ]
        }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result.get("path"),
        Some(&json!(env::temp_dir()
            .join("dialog-open.nfproj")
            .display()
            .to_string()))
    );
    assert_eq!(response.result.get("canceled"), Some(&json!(false)));

    let error_response = dispatch(request("fs.dialogOpen", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.filters");
}

#[test]
fn fs_dialog_save_dispatch_happy_and_error() {
    let response = dispatch(request(
        "fs.dialogSave",
        json!({ "defaultName": "project.nfproj" }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result.get("path"),
        Some(&json!(env::temp_dir()
            .join("project.nfproj")
            .display()
            .to_string()))
    );
    assert_eq!(response.result.get("canceled"), Some(&json!(false)));

    let error_response = dispatch(request("fs.dialogSave", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.defaultName");
}

#[test]
fn normalize_extension_strips_leading_dot() {
    assert_eq!(normalize_extension(".nfproj"), Some("nfproj".to_string()));
}

#[test]
fn normalize_extension_handles_empty() {
    assert_eq!(normalize_extension(""), None);
}

#[test]
fn with_default_extension_adds_nfp_when_missing() {
    assert_eq!(
        with_default_extension(PathBuf::from("project"), "default.nfp"),
        PathBuf::from("project.nfp")
    );
}

#[test]
fn with_default_extension_preserves_existing_extension() {
    let path = PathBuf::from("project.mov");
    assert_eq!(with_default_extension(path.clone(), "default.nfp"), path);
}

#[test]
fn parse_dialog_filters_parses_valid_filter_array() {
    let filters = parse_dialog_filters(&json!({
        "filters": [
            ".nfproj",
            { "extensions": ["mp4", ".mov"] }
        ]
    }))
    .expect("parse valid dialog filters");

    assert_eq!(filters, vec!["nfproj", "mp4", "mov"]);
}
