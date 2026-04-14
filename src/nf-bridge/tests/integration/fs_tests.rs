use super::*;

#[test]
fn dispatch_fs_read_with_valid_temp_file_returns_contents() {
    let temp = TestDir::new("integration-fs-read");
    let path = temp.join("note.txt");
    fs::write(&path, "hello from integration test").expect("write temp file");

    let response = dispatch_request("fs.read", json!({ "path": path.display().to_string() }));

    assert!(response.ok);
    assert_eq!(response.id, "req-fs.read");
    assert_eq!(
        response.result,
        json!({
            "path": path.display().to_string(),
            "contents": "hello from integration test",
        })
    );
    assert_eq!(response.error, None);
}

#[test]
fn dispatch_fs_write_creates_file() {
    let temp = TestDir::new("integration-fs-write");
    let path = temp.join("written.txt");

    let response = dispatch_request(
        "fs.write",
        json!({
            "path": path.display().to_string(),
            "contents": "written by dispatch",
        }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-fs.write");
    assert_eq!(
        fs::read_to_string(&path).expect("read written file"),
        "written by dispatch"
    );
    assert_eq!(
        response.result.get("path"),
        Some(&json!(path.display().to_string()))
    );
}

#[test]
fn dispatch_fs_write_then_read_round_trips() {
    let temp = TestDir::new("integration-fs-round-trip");
    let path = temp.join("round-trip.txt");

    let write_response = dispatch_request(
        "fs.write",
        json!({
            "path": path.display().to_string(),
            "contents": "hello\nfrom\ndispatch",
        }),
    );
    assert!(write_response.ok);
    assert_eq!(
        write_response.result,
        json!({
            "path": path.display().to_string(),
            "bytesWritten": "hello\nfrom\ndispatch".len(),
        })
    );

    let read_response = dispatch_request("fs.read", json!({ "path": path.display().to_string() }));
    assert!(read_response.ok);
    assert_eq!(
        read_response.result,
        json!({
            "path": path.display().to_string(),
            "contents": "hello\nfrom\ndispatch",
        })
    );
}

#[test]
fn dispatch_fs_list_dir_returns_expected_entries() {
    let temp = TestDir::new("integration-fs-list-dir");
    let nested_dir = temp.join("nested");
    let a_path = temp.join("a.txt");
    let b_path = temp.join("b.txt");
    fs::write(&b_path, "b").expect("write b.txt");
    fs::write(&a_path, "a").expect("write a.txt");
    fs::create_dir_all(&nested_dir).expect("create nested dir");
    let canonical_a_path = fs::canonicalize(&a_path).expect("canonicalize a.txt");
    let canonical_b_path = fs::canonicalize(&b_path).expect("canonicalize b.txt");
    let canonical_nested_dir = fs::canonicalize(&nested_dir).expect("canonicalize nested dir");

    let response = dispatch_request(
        "fs.listDir",
        json!({ "path": temp.path.display().to_string() }),
    );
    assert!(response.ok);
    assert_eq!(
        response.result,
        json!({
            "path": temp.path.display().to_string(),
            "entries": [
                {
                    "name": "a.txt",
                    "path": canonical_a_path.display().to_string(),
                    "isDir": false,
                },
                {
                    "name": "b.txt",
                    "path": canonical_b_path.display().to_string(),
                    "isDir": false,
                },
                {
                    "name": "nested",
                    "path": canonical_nested_dir.display().to_string(),
                    "isDir": true,
                }
            ]
        })
    );
}

#[test]
fn dispatch_fs_read_with_nonexistent_path_returns_error() {
    let temp = TestDir::new("integration-fs-read-missing");
    let path = temp.join("missing.txt");

    let response = dispatch_request("fs.read", json!({ "path": path.display().to_string() }));

    assert!(!response.ok);
    assert_eq!(response.id, "req-fs.read");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "failed to resolve");
}

#[test]
fn dispatch_fs_write_with_empty_path_returns_error() {
    let response = dispatch_request(
        "fs.write",
        json!({
            "path": "",
            "contents": "no destination",
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-fs.write");
    assert_eq!(response.result, Value::Null);
    assert_eq!(response.error.as_deref(), Some("path must not be empty"));
}

#[test]
fn dispatch_fs_write_and_read_20_times_without_cross_contamination() {
    let temp = TestDir::new("integration-fs-stress");

    thread::scope(|scope| {
        let mut handles = Vec::new();

        for iteration in 0..20 {
            let path = temp.join(&format!("entry-{iteration}.txt"));
            let content = format!("payload-{iteration}-{}", "x".repeat(2048 + iteration));

            handles.push(scope.spawn(move || {
                let write_response = dispatch_request_with_id(
                    format!("req-fs.write-{iteration}"),
                    "fs.write",
                    json!({
                        "path": path.display().to_string(),
                        "contents": content,
                    }),
                );
                assert!(
                    write_response.ok,
                    "fs.write failed: {:?}",
                    write_response.error
                );

                let read_response = dispatch_request_with_id(
                    format!("req-fs.read-{iteration}"),
                    "fs.read",
                    json!({ "path": path.display().to_string() }),
                );
                assert!(
                    read_response.ok,
                    "fs.read failed: {:?}",
                    read_response.error
                );

                let read_back = read_response
                    .result
                    .get("contents")
                    .and_then(Value::as_str)
                    .expect("read contents")
                    .to_string();

                (path, read_back)
            }));
        }

        for (iteration, handle) in handles.into_iter().enumerate() {
            let (path, read_back) = handle.join().expect("join fs request");
            let expected = format!("payload-{iteration}-{}", "x".repeat(2048 + iteration));
            assert_eq!(read_back, expected);
            assert_eq!(
                fs::read_to_string(&path).expect("read file from disk"),
                expected
            );
        }
    });
}
