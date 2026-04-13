use super::*;

#[test]
fn recorder_request_construction_preserves_fields() {
    let output_path = PathBuf::from("exports/final.mp4");
    let request = RecorderRequest {
        url: "file:///tmp/runtime/web/index.html?record=true".to_string(),
        output_path: output_path.clone(),
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 12.5,
        crf: 18,
    };

    assert_eq!(
        request.url,
        "file:///tmp/runtime/web/index.html?record=true"
    );
    assert_eq!(request.output_path, output_path);
    assert_eq!(request.width, 1920);
    assert_eq!(request.height, 1080);
    assert_eq!(request.fps, 60);
    assert_eq!(request.duration, 12.5);
    assert_eq!(request.crf, 18);
}

#[test]
fn build_recording_url_encodes_special_characters_in_path() {
    let temp = TestDir::new("recorder build #1");
    let web_dir = temp.join("runtime/web");
    fs::create_dir_all(&web_dir).expect("create runtime web dir");
    let web_path = web_dir.join("index.html");
    fs::write(&web_path, "<!doctype html>").expect("write recorder frame");

    let url = build_recording_url(&temp.path).expect("build recording url");
    let canonical_web_path = web_path
        .canonicalize()
        .expect("canonicalize recorder frame");
    let raw_path = canonical_web_path.to_string_lossy().replace('\\', "/");
    let encoded_path = raw_path.replace('#', "%23").replace(' ', "%20");
    let prefix = if raw_path.starts_with('/') {
        "file://"
    } else {
        "file:///"
    };

    assert_eq!(url, format!("{prefix}{encoded_path}?record=true"));
    assert!(url.contains("%20"));
    assert!(url.contains("%23"));
}

#[test]
fn resolve_recorder_frame_path_from_file_url_returns_decoded_path() {
    let resolved = resolve_recorder_frame_path_from_url(
        "file://localhost/tmp/recorded%20frame.html?record=true#frame-1",
        Path::new("."),
    )
    .expect("resolve file recorder url");

    assert_eq!(resolved, PathBuf::from("/tmp/recorded frame.html"));
}

#[test]
fn resolve_recorder_frame_path_from_http_url_returns_relative_file() {
    let temp = TestDir::new("recorder-http");
    let frame_path = temp.join("runtime/web/recorded frame.html");
    let frame_parent = frame_path
        .parent()
        .expect("recorder frame path should have parent");
    fs::create_dir_all(frame_parent).expect("create frame parent dir");
    fs::write(&frame_path, "<html></html>").expect("write recorder frame");

    let resolved = resolve_recorder_frame_path_from_url(
        "http://localhost/runtime/web/recorded%20frame.html?record=true#frame-1",
        &temp.path,
    )
    .expect("resolve http recorder url");

    assert_eq!(resolved, frame_path);
}

#[test]
fn resolve_recorder_frame_path_from_invalid_url_returns_error() {
    let result =
        resolve_recorder_frame_path_from_url("ftp://example.com/frame.html", Path::new("."));

    assert_eq!(
        result.as_ref().map_err(std::string::String::as_str),
        Err("unsupported recorder url: ftp://example.com/frame.html")
    );
}

#[test]
fn decode_file_url_path_decodes_percent_encoded_segments() {
    let decoded =
        decode_file_url_path("/tmp/encoded%20dir/Recorder%23One.html").expect("decode file url");

    assert_eq!(decoded, PathBuf::from("/tmp/encoded dir/Recorder#One.html"));
}
