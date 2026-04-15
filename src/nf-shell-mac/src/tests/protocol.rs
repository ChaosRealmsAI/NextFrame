#![allow(clippy::unwrap_used)]
#![allow(clippy::expect_used)]

use super::*;
use std::fs;
use std::io::ErrorKind;
use std::os::unix::fs::symlink;
use std::path::Path;
use std::process;

fn create_test_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nf-protocol-{name}-{}", process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn parse_range_full_range() {
    assert_eq!(parse_range_header("bytes=0-499", 1000), Some((0, 499)));
}

#[test]
fn parse_range_open_ended() {
    assert_eq!(parse_range_header("bytes=500-", 1000), Some((500, 999)));
}

#[test]
fn parse_range_clamps_to_file_length() {
    assert_eq!(parse_range_header("bytes=0-9999", 500), Some((0, 499)));
}

#[test]
fn parse_range_zero_length_file() {
    assert_eq!(parse_range_header("bytes=0-0", 0), None);
}

#[test]
fn parse_range_start_exceeds_end() {
    assert_eq!(parse_range_header("bytes=600-100", 1000), None);
}

#[test]
fn parse_range_missing_prefix() {
    assert_eq!(parse_range_header("0-499", 1000), None);
}

#[test]
fn parse_range_whitespace_trimmed() {
    assert_eq!(parse_range_header("  bytes=10-20  ", 100), Some((10, 20)));
}

#[test]
fn mime_known_extensions() {
    let cases: &[(&str, &str)] = &[
        ("index.html", "text/html; charset=utf-8"),
        ("style.css", "text/css; charset=utf-8"),
        ("app.js", "text/javascript; charset=utf-8"),
        ("data.json", "application/json; charset=utf-8"),
        ("photo.png", "image/png"),
        ("photo.jpg", "image/jpeg"),
        ("photo.jpeg", "image/jpeg"),
        ("icon.svg", "image/svg+xml"),
        ("clip.mp4", "video/mp4"),
        ("clip.webm", "video/webm"),
        ("track.mp3", "audio/mpeg"),
        ("sound.wav", "audio/wav"),
        ("font.woff2", "font/woff2"),
        ("font.ttf", "font/ttf"),
    ];
    for (file, expected) in cases {
        assert_eq!(mime_type(Path::new(file)), *expected, "file: {file}");
    }
}

#[test]
fn mime_unknown_extension_fallback() {
    assert_eq!(
        mime_type(Path::new("archive.tar.gz")),
        "application/octet-stream"
    );
    assert_eq!(mime_type(Path::new("noext")), "application/octet-stream");
}

#[test]
fn io_status_mapping() {
    assert_eq!(io_status(ErrorKind::NotFound), 404);
    assert_eq!(io_status(ErrorKind::PermissionDenied), 403);
    assert_eq!(io_status(ErrorKind::BrokenPipe), 500);
}

#[test]
fn status_reply_bodies() {
    let r403 = status_reply(403);
    assert_eq!(r403.status, 403);
    assert_eq!(r403.body, b"forbidden");
    assert!(!r403.accepts_ranges);
    let r404 = status_reply(404);
    assert_eq!(r404.body, b"not found");
    let r500 = status_reply(500);
    assert_eq!(r500.body, b"internal error");
    let r418 = status_reply(418);
    assert_eq!(r418.body, b"request failed");
}

#[test]
fn resolve_rejects_dot_dot_traversal() {
    let tmp = create_test_dir("resolve-dot-dot");
    assert_eq!(resolve_file_path(&tmp, "/../etc/passwd"), Err(403));
    assert_eq!(resolve_file_path(&tmp, "/foo/../../bar"), Err(403));
}

#[test]
fn resolve_rejects_backslash() {
    let tmp = create_test_dir("resolve-backslash");
    assert_eq!(resolve_file_path(&tmp, "/foo\\bar"), Err(403));
}

#[test]
fn resolve_defaults_to_index_html() {
    let tmp = create_test_dir("resolve-index");
    assert_eq!(
        resolve_file_path(&tmp, "/"),
        Ok(tmp.canonicalize().unwrap().join("index.html"))
    );
}

#[test]
fn resolve_finds_existing_file() {
    let tmp = create_test_dir("resolve-existing");
    fs::write(tmp.join("hello.txt"), "hi").unwrap();
    let result = resolve_file_path(&tmp, "/hello.txt");
    assert!(result.is_ok(), "expected Ok, got {result:?}");
    assert!(result.unwrap().ends_with("hello.txt"));
}

#[test]
fn resolve_allows_leaf_symlink_target_outside_root() {
    let tmp = create_test_dir("resolve-leaf-symlink");
    let external = create_test_dir("resolve-leaf-symlink-external");
    let external_file = external.join("clip.mp4");
    let symlink_path = tmp.join("clip.mp4");
    fs::write(&external_file, "video").unwrap();
    symlink(&external_file, &symlink_path).unwrap();
    let result = resolve_file_path(&tmp, "/clip.mp4");
    assert_eq!(
        result,
        Ok(tmp.canonicalize().unwrap().join("clip.mp4")),
        "expected leaf symlink to resolve inside root",
    );
}

#[test]
fn resolve_rejects_symlink_directory_escape() {
    let tmp = create_test_dir("resolve-dir-symlink");
    let external = create_test_dir("resolve-dir-symlink-external");
    let escape = tmp.join("escape");
    let external_file = external.join("secret.txt");
    fs::write(&external_file, "secret").unwrap();
    symlink(&external, &escape).unwrap();
    let result = resolve_file_path(&tmp, "/escape/secret.txt");
    assert_eq!(result, Err(403));
}

#[test]
fn read_range_returns_correct_slice() {
    let tmp = create_test_dir("read-range");
    let path = tmp.join("data.bin");
    fs::write(&path, b"0123456789").unwrap();
    let result = read_range(&path, 2, 5).unwrap();
    assert_eq!(result, b"2345");
}

#[test]
fn read_range_nonexistent_file() {
    let path = std::env::temp_dir().join("nf-test-range-nofile.bin");
    let result = read_range(&path, 0, 10);
    assert!(result.is_err());
}

#[test]
fn build_reply_allows_leaf_symlink_target_outside_root() {
    let tmp = create_test_dir("build-reply-leaf-symlink");
    let external = create_test_dir("build-reply-leaf-symlink-external");
    fs::write(external.join("clip.mp4"), "video").unwrap();
    symlink(external.join("clip.mp4"), tmp.join("clip.mp4")).unwrap();
    let url = NSURL::URLWithString(&NSString::from_str("nfdata://localhost/clip.mp4")).unwrap();
    let request = NSURLRequest::requestWithURL(&url);
    let reply = build_reply(&request, &url, &tmp, true);
    assert_eq!(reply.status, 200);
}
