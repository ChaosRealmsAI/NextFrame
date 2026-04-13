use super::*;

#[test]
fn resolve_write_path_expands_home_and_allows_missing_export_dirs() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let result = resolve_write_path("~/Movies/NextFrame/render.mp4")
        .expect("resolve export path under home");
    assert_eq!(result, home.join("Movies/NextFrame/render.mp4"));
}

#[test]
fn require_object_accepts_object() {
    let params = json!({ "name": "demo", "count": 2 });

    let object = require_object(&params).expect("object params should be accepted");

    assert_eq!(object.get("name"), Some(&json!("demo")));
    assert_eq!(object.get("count"), Some(&json!(2)));
}

#[test]
fn require_object_rejects_null_and_array() {
    let null_error = require_object(&Value::Null)
        .err()
        .expect("null params should return an error");
    assert_eq!(null_error, "params must be a JSON object");

    let array_error = require_object(&json!([1, 2, 3]))
        .err()
        .expect("array params should return an error");
    assert_eq!(array_error, "params must be a JSON object");
}

#[test]
fn require_string_handles_present_missing_and_non_string() {
    let params = json!({
        "name": "demo",
        "count": 2,
    });

    let name = require_string(&params, "name").expect("string value should be accepted");
    assert_eq!(name, "demo");

    let missing_error = require_string(&params, "title")
        .err()
        .expect("missing string should return an error");
    assert_eq!(missing_error, "missing params.title");

    let non_string_error = require_string(&params, "count")
        .err()
        .expect("non-string value should return an error");
    assert_eq!(non_string_error, "params.count must be a string");
}

#[test]
fn require_u32_handles_valid_negative_float_and_missing() {
    let params = json!({
        "count": 42,
        "negative": -1,
        "ratio": 1.5,
    });

    let count = require_u32(&params, "count").expect("unsigned integer should be accepted");
    assert_eq!(count, 42);

    let negative_error = require_u32(&params, "negative")
        .err()
        .expect("negative number should return an error");
    assert_eq!(
        negative_error,
        "params.negative must be an unsigned integer"
    );

    let float_error = require_u32(&params, "ratio")
        .err()
        .expect("float should return an error");
    assert_eq!(float_error, "params.ratio must be an unsigned integer");

    let missing_error = require_u32(&params, "missing")
        .err()
        .expect("missing integer should return an error");
    assert_eq!(missing_error, "missing params.missing");
}

#[test]
fn require_positive_u32_rejects_zero() {
    let valid_params = json!({ "count": 7 });
    let zero_params = json!({ "count": 0 });

    let count =
        require_positive_u32(&valid_params, "count").expect("positive integer should be accepted");
    assert_eq!(count, 7);

    let zero_error = require_positive_u32(&zero_params, "count")
        .err()
        .expect("zero should return an error");
    assert_eq!(zero_error, "params.count must be greater than 0");
}

#[test]
fn require_positive_f64_rejects_zero_negative_and_non_number() {
    let valid_params = json!({ "volume": 0.75 });
    let zero_params = json!({ "volume": 0.0 });
    let negative_params = json!({ "volume": -0.25 });
    let string_params = json!({ "volume": "loud" });

    let volume =
        require_positive_f64(&valid_params, "volume").expect("positive number should be accepted");
    assert_eq!(volume, 0.75);

    let zero_error = require_positive_f64(&zero_params, "volume")
        .err()
        .expect("zero should return an error");
    assert_eq!(zero_error, "params.volume must be greater than 0");

    let negative_error = require_positive_f64(&negative_params, "volume")
        .err()
        .expect("negative number should return an error");
    assert_eq!(negative_error, "params.volume must be greater than 0");

    let string_error = require_positive_f64(&string_params, "volume")
        .err()
        .expect("non-number should return an error");
    assert_eq!(string_error, "params.volume must be a number");
}

#[test]
fn require_array_accepts_arrays_and_rejects_non_arrays() {
    let params = json!({
        "items": ["a", "b"],
        "name": "demo",
    });

    let items = require_array(&params, "items").expect("array value should be accepted");
    assert_eq!(items, &vec![json!("a"), json!("b")]);

    let non_array_error = require_array(&params, "name")
        .err()
        .expect("non-array should return an error");
    assert_eq!(non_array_error, "params.name must be an array");
}

#[test]
fn require_value_alias_returns_first_second_or_missing_error() {
    let first_params = json!({
        "primary": "first",
        "secondary": "second",
    });
    let second_params = json!({
        "secondary": "second",
    });
    let missing_params = json!({
        "other": true,
    });

    let first = require_value_alias(&first_params, &["primary", "secondary"])
        .expect("first alias should be returned");
    assert_eq!(first, &json!("first"));

    let second = require_value_alias(&second_params, &["primary", "secondary"])
        .expect("second alias should be returned");
    assert_eq!(second, &json!("second"));

    let missing_error = require_value_alias(&missing_params, &["primary", "secondary"])
        .err()
        .expect("missing aliases should return an error");
    assert_eq!(
        missing_error,
        "missing one of params.primary, params.secondary"
    );
}

#[test]
fn read_optional_u8_in_range_handles_in_range_bounds_missing_and_non_number() {
    let in_range_params = json!({ "level": 3 });
    let below_params = json!({ "level": 1 });
    let above_params = json!({ "level": 5 });
    let missing_params = json!({});
    let string_params = json!({ "level": "high" });

    let in_range = read_optional_u8_in_range(&in_range_params, "level", 2, 4)
        .expect("in-range integer should be accepted");
    assert_eq!(in_range, Some(3));

    let below_error = read_optional_u8_in_range(&below_params, "level", 2, 4)
        .err()
        .expect("below-range integer should return an error");
    assert_eq!(below_error, "params.level must be between 2 and 4");

    let above_error = read_optional_u8_in_range(&above_params, "level", 2, 4)
        .err()
        .expect("above-range integer should return an error");
    assert_eq!(above_error, "params.level must be between 2 and 4");

    let missing = read_optional_u8_in_range(&missing_params, "level", 2, 4)
        .expect("missing optional integer should be accepted");
    assert_eq!(missing, None);

    let non_number_error = read_optional_u8_in_range(&string_params, "level", 2, 4)
        .err()
        .expect("non-number should return an error");
    assert_eq!(non_number_error, "params.level must be an unsigned integer");
}

#[test]
fn validate_project_component_allows_valid_names_and_dots() {
    validate_project_component("episode-01", "projectId")
        .expect("plain component should be accepted");
    validate_project_component("episode.cut.v1", "projectId")
        .expect("component containing dots should be accepted");
}

#[test]
fn validate_project_component_rejects_slashes() {
    let error = validate_project_component("folder/name", "projectId")
        .err()
        .expect("slash-containing component should return an error");

    assert_eq!(error, "invalid params.projectId: folder/name");
}

#[test]
fn path_home_dir_returns_some_on_macos() {
    let dir = path::home_dir();

    #[cfg(target_os = "macos")]
    assert!(dir.is_some(), "expected HOME-derived path on macOS");

    #[cfg(not(target_os = "macos"))]
    let _ = dir;
}

#[test]
fn path_expand_home_dir_expands_and_preserves_expected_inputs() {
    let home = path::home_dir().expect("home directory available for expansion tests");

    assert_eq!(path::expand_home_dir("~"), home);
    assert_eq!(path::expand_home_dir("~/foo"), home.join("foo"));
    assert_eq!(path::expand_home_dir("/abs"), PathBuf::from("/abs"));
    assert_eq!(path::expand_home_dir("relative"), PathBuf::from("relative"));
}

#[test]
fn path_home_root_returns_ok() {
    let root = path::home_root().expect("home root should resolve");
    assert!(!root.as_os_str().is_empty());
}

#[test]
fn path_canonical_or_raw_canonicalizes_existing_and_preserves_missing() {
    let temp = TestDir::new("path-canonical-or-raw");

    let existing = temp.join("exists.txt");
    fs::write(&existing, "fixture").expect("write existing file");
    assert_eq!(
        path::canonical_or_raw(existing.clone()),
        fs::canonicalize(existing).expect("canonicalize existing file"),
    );

    let missing = temp.join("missing.txt");
    assert_eq!(path::canonical_or_raw(missing.clone()), missing);
}

#[test]
fn validate_path_rejects_empty_string() {
    let error =
        super::super::storage::fs::validate_path("   ").expect_err("empty path should be rejected");

    assert_eq!(error, "path must not be empty");
}

#[test]
fn validate_path_rejects_null_bytes() {
    let error = super::super::storage::fs::validate_path("bad\0path")
        .expect_err("null bytes should be rejected");

    assert_eq!(error, "path must not contain null bytes");
}

#[test]
fn resolve_existing_path_errors_for_missing_file() {
    let temp = TestDir::new("fs-resolve-missing");
    let missing_path = temp.join("missing.txt");

    let error =
        super::super::storage::fs::resolve_existing_path(&missing_path.display().to_string())
            .expect_err("missing path should fail to resolve");

    assert!(error.contains("failed to resolve"));
}

#[test]
fn is_allowed_path_rejects_paths_outside_allowed_roots() {
    assert!(!super::super::storage::fs::is_allowed_path(Path::new(
        &disallowed_absolute_path()
    )));
}

#[test]
fn nearest_existing_ancestor_returns_closest_existing_parent() {
    let temp = TestDir::new("fs-nearest-ancestor");
    let existing_parent = temp.join("existing");
    fs::create_dir_all(&existing_parent).expect("create existing parent");
    let missing_descendant = existing_parent.join("missing/child/file.txt");

    let ancestor = super::super::storage::fs::nearest_existing_ancestor(&missing_descendant)
        .expect("existing ancestor should be found");

    assert_eq!(ancestor, existing_parent);
}
