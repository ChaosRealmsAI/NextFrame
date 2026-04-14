//! fs tests
use super::*;

#[test]
fn fs_read_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-read");
    let file_path = temp.join("note.txt");
    fs::write(&file_path, "hello bridge").expect("write fixture");

    let response = dispatch(request(
        "fs.read",
        json!({ "path": file_path.display().to_string() }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result,
        json!({
            "path": file_path.display().to_string(),
            "contents": "hello bridge",
        })
    );

    let error_response = dispatch(request(
        "fs.read",
        json!({ "path": disallowed_absolute_path() }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "outside sandbox");
}

#[test]
fn fs_read_rejects_parent_traversal_path() {
    let response = dispatch(request("fs.read", json!({ "path": "../../../etc/passwd" })));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_read_rejects_symlink_escape() {
    let temp = TestDir::new("fs-read-symlink");
    let link_path = temp.join("passwd-link");
    create_file_symlink(Path::new(&disallowed_absolute_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "fs.read",
        json!({ "path": link_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_write_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-write");
    let file_path = temp.join("write.txt");

    let response = dispatch(request(
        "fs.write",
        json!({
            "path": file_path.display().to_string(),
            "contents": "written from test",
        }),
    ));
    assert!(response.ok);
    assert_eq!(
        fs::read_to_string(&file_path).expect("read written file"),
        "written from test"
    );

    let error_response = dispatch(request(
        "fs.write",
        json!({
            "path": "../escape.txt",
            "contents": "nope",
        }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "outside sandbox");
}

#[test]
fn fs_write_rejects_absolute_system_path() {
    let response = dispatch(request(
        "fs.write",
        json!({
            "path": absolute_write_rejection_path(),
            "contents": "blocked write",
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_write_rejects_symlink_parent_escape() {
    let temp = TestDir::new("fs-write-parent-symlink");
    let link_path = temp.join("escape-dir");
    create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

    let response = dispatch(request(
        "fs.write",
        json!({
            "path": link_path.join("blocked.txt").display().to_string(),
            "contents": "blocked write",
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_write_rejects_symlink_target_escape() {
    let temp = TestDir::new("fs-write-target-symlink");
    let link_path = temp.join("hosts-link");
    create_file_symlink(Path::new(&absolute_write_rejection_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "fs.write",
        json!({
            "path": link_path.display().to_string(),
            "contents": "blocked write",
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_list_dir_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-list");
    fs::write(temp.join("b.txt"), "b").expect("write b");
    fs::write(temp.join("a.txt"), "a").expect("write a");
    fs::create_dir(temp.join("nested")).expect("create nested dir");

    let response = dispatch(request(
        "fs.listDir",
        json!({ "path": temp.path.display().to_string() }),
    ));
    assert!(response.ok);

    let entries = response
        .result
        .get("entries")
        .and_then(Value::as_array)
        .expect("entries array");
    let names = entries
        .iter()
        .filter_map(|entry| entry.get("name").and_then(Value::as_str))
        .collect::<Vec<_>>();
    assert_eq!(names, vec!["a.txt", "b.txt", "nested"]);

    let error_response = dispatch(request("fs.listDir", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.path");
}

#[test]
fn fs_list_dir_rejects_symlink_escape() {
    let temp = TestDir::new("fs-list-symlink");
    let link_path = temp.join("etc-link");
    create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

    let response = dispatch(request(
        "fs.listDir",
        json!({ "path": link_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_reveal_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-reveal");
    let file_path = temp.join("export.mp4");
    fs::write(&file_path, "video").expect("write export file");

    let response = dispatch(request(
        "fs.reveal",
        json!({ "path": file_path.display().to_string() }),
    ));
    assert!(response.ok);
    assert_eq!(response.result.get("revealed"), Some(&json!(true)));

    let error_response = dispatch(request("fs.reveal", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.path");
}

#[test]
fn handle_fs_write_base64_writes_decoded_bytes() {
    let temp = TestDir::new("fs-write-base64");
    let file_path = temp.join("nested/output.bin");
    let expected_bytes = b"\0bridge\xffbytes\n";
    let encoded = encoding::base64_encode(expected_bytes);

    let response = super::super::storage::fs::handle_fs_write_base64(&json!({
        "path": file_path.display().to_string(),
        "data": format!("data:application/octet-stream;base64,{encoded}"),
    }))
    .expect("base64 write should succeed");

    assert_eq!(
        response,
        json!({
            "path": file_path.display().to_string(),
            "bytesWritten": expected_bytes.len(),
        })
    );
    assert_eq!(
        fs::read(&file_path).expect("read written bytes"),
        expected_bytes
    );
}

#[test]
fn handle_fs_write_base64_rejects_invalid_data() {
    let temp = TestDir::new("fs-write-base64-invalid");
    let file_path = temp.join("output.bin");

    let error = super::super::storage::fs::handle_fs_write_base64(&json!({
        "path": file_path.display().to_string(),
        "data": "%%%not-base64%%%",
    }))
    .expect_err("invalid base64 should fail");

    assert!(error.contains("invalid base64 character"));
    assert!(!file_path.exists());
}

#[test]
fn handle_fs_mtime_returns_reasonable_value_for_existing_file() {
    let temp = TestDir::new("fs-mtime");
    let file_path = temp.join("mtime.txt");
    fs::write(&file_path, "mtime").expect("write mtime fixture");

    let expected_mtime = fs::metadata(&file_path)
        .expect("read file metadata")
        .modified()
        .expect("read modified time")
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let response = super::super::storage::fs::handle_fs_mtime(&json!({
        "path": file_path.display().to_string(),
    }))
    .expect("mtime should succeed");
    let mtime = response
        .get("mtime")
        .and_then(Value::as_u64)
        .expect("mtime should be present");

    assert!(mtime > 0);
    assert!(mtime.abs_diff(expected_mtime) <= 2_000);
}
