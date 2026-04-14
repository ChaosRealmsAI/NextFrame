//! Custom `WKURLSchemeHandler` implementations for `nf://` and `nfdata://`.

use std::fs::{self, File};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{AnyThread, DeclaredClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_foundation::{
    NSCocoaErrorDomain, NSData, NSError, NSHTTPURLResponse, NSMutableDictionary,
    NSObjectProtocol, NSString, NSURL, NSURLRequest,
};
use objc2_web_kit::{WKURLSchemeHandler, WKURLSchemeTask, WKWebView};

pub(crate) const NF_SCHEME: &str = "nf";
pub(crate) const NFDATA_SCHEME: &str = "nfdata";

pub(crate) struct SchemeHandlerIvars {
    root: PathBuf,
}

pub(crate) struct SchemeHandlers {
    pub(crate) nf: Retained<NfSchemeHandler>,
    pub(crate) nfdata: Retained<NfDataSchemeHandler>,
}

macro_rules! define_scheme_handler {
    ($name:ident) => {
        define_class!(
            #[unsafe(super(NSObject))]
            #[thread_kind = MainThreadOnly]
            #[ivars = SchemeHandlerIvars]
            pub(crate) struct $name;

            unsafe impl NSObjectProtocol for $name {}

            #[allow(non_snake_case)]
            unsafe impl WKURLSchemeHandler for $name {
                #[unsafe(method(webView:startURLSchemeTask:))]
                unsafe fn web_view_start_urlscheme_task(
                    &self,
                    _web_view: &WKWebView,
                    task: &ProtocolObject<dyn WKURLSchemeTask>,
                ) {
                    serve_task(task, &self.ivars().root);
                }

                #[unsafe(method(webView:stopURLSchemeTask:))]
                unsafe fn web_view_stop_urlscheme_task(
                    &self,
                    _web_view: &WKWebView,
                    _task: &ProtocolObject<dyn WKURLSchemeTask>,
                ) {
                }
            }
        );
    };
}

define_scheme_handler!(NfSchemeHandler);
define_scheme_handler!(NfDataSchemeHandler);

pub(crate) fn create_handlers(mtm: MainThreadMarker) -> SchemeHandlers {
    let nf = mtm
        .alloc::<NfSchemeHandler>()
        .set_ivars(SchemeHandlerIvars {
            root: web_root_path(),
        });
    let nfdata = mtm
        .alloc::<NfDataSchemeHandler>()
        .set_ivars(SchemeHandlerIvars {
            root: projects_root_path(),
        });
    SchemeHandlers {
        nf: unsafe { msg_send![super(nf), init] }, // SAFETY: Newly allocated Objective-C object.
        nfdata: unsafe { msg_send![super(nfdata), init] }, // SAFETY: Newly allocated Objective-C object.
    }
}

struct HttpReply {
    status: i64,
    mime: &'static str,
    body: Vec<u8>,
    len: u64,
    range: Option<String>,
    accepts_ranges: bool,
}

fn serve_task(task: &ProtocolObject<dyn WKURLSchemeTask>, root: &Path) {
    let request = unsafe { task.request() }; // SAFETY: WebKit provides a live task with a valid request object.
    let Some(url) = request.URL() else {
        fail_task(task, "missing request URL");
        return;
    };
    let include_body = request
        .HTTPMethod()
        .map(|method| !method.to_string().eq_ignore_ascii_case("HEAD"))
        .unwrap_or(true);
    let reply = build_reply(&request, &url, root, include_body);
    if let Err(err) = send_reply(task, &url, &reply) {
        fail_task(task, &err);
    }
}

fn build_reply(request: &NSURLRequest, url: &NSURL, root: &Path, include_body: bool) -> HttpReply {
    let request_path = url.path().map(|path| path.to_string()).unwrap_or_default();
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let file_path = match resolve_file_path(&root, &request_path) {
        Ok(path) => path,
        Err(status) => return status_reply(status),
    };
    let metadata = match file_path.metadata() {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return status_reply(403),
        Err(err) => return status_reply(io_status(err.kind())),
    };

    let total_len = metadata.len();
    let mime = mime_type(&file_path);
    if let Some(header) = request.valueForHTTPHeaderField(&NSString::from_str("Range")) {
        return match parse_range_header(&header.to_string(), total_len) {
            Some((start, end)) => {
                let body = if include_body {
                    match read_range(&file_path, start, end) {
                        Ok(body) => body,
                        Err(kind) => return status_reply(io_status(kind)),
                    }
                } else {
                    Vec::new()
                };
                HttpReply {
                    status: 206,
                    mime,
                    body,
                    len: end.saturating_sub(start).saturating_add(1),
                    range: Some(format!("bytes {start}-{end}/{total_len}")),
                    accepts_ranges: true,
                }
            }
            None => HttpReply {
                status: 416,
                mime: "text/plain; charset=utf-8",
                body: b"range not satisfiable".to_vec(),
                len: 21,
                range: Some(format!("bytes */{total_len}")),
                accepts_ranges: true,
            },
        };
    }

    let body = if include_body {
        match fs::read(&file_path) {
            Ok(body) => body,
            Err(err) => return status_reply(io_status(err.kind())),
        }
    } else {
        Vec::new()
    };
    HttpReply {
        status: 200,
        mime,
        body,
        len: total_len,
        range: None,
        accepts_ranges: true,
    }
}

fn send_reply(task: &ProtocolObject<dyn WKURLSchemeTask>, url: &NSURL, reply: &HttpReply) -> Result<(), String> {
    let headers = NSMutableDictionary::<NSString, NSString>::new();
    insert_header(&headers, "Content-Type", reply.mime);
    insert_header(&headers, "Content-Length", &reply.len.to_string());
    if reply.accepts_ranges {
        insert_header(&headers, "Accept-Ranges", "bytes");
    }
    if let Some(range) = &reply.range {
        insert_header(&headers, "Content-Range", range);
    }
    let version = NSString::from_str("HTTP/1.1");
    let Some(response) = NSHTTPURLResponse::initWithURL_statusCode_HTTPVersion_headerFields(
        NSHTTPURLResponse::alloc(),
        url,
        reply.status as isize,
        Some(&version),
        Some(&headers),
    ) else {
        return Err("failed to create HTTP response".to_string());
    };
    unsafe { // SAFETY: Task protocol requires didReceiveResponse, then didReceiveData, then didFinish in order.
        task.didReceiveResponse(&response);
        if !reply.body.is_empty() {
            let data = NSData::with_bytes(&reply.body);
            task.didReceiveData(&data);
        }
        task.didFinish();
    }
    Ok(())
}

fn fail_task(task: &ProtocolObject<dyn WKURLSchemeTask>, reason: &str) {
    tracing::error!("scheme handler failed: {reason}");
    let error = unsafe { NSError::errorWithDomain_code_userInfo(NSCocoaErrorDomain, 0, None) }; // SAFETY: NSError factory method with a valid Cocoa error domain constant.
    unsafe { task.didFailWithError(&error) }; // SAFETY: didFailWithError terminates the live scheme task exactly once.
}

fn insert_header(headers: &NSMutableDictionary<NSString, NSString>, key: &str, value: &str) {
    let key = NSString::from_str(key);
    let value = NSString::from_str(value);
    let key = ProtocolObject::from_ref(&*key);
    unsafe { headers.setObject_forKey(&value, key) }; // SAFETY: NSString key and value are valid Objective-C objects for NSMutableDictionary insertion.
}

fn resolve_file_path(root: &Path, raw_path: &str) -> Result<PathBuf, i64> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let mut relative = PathBuf::new();
    for segment in raw_path.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains('\\') {
            return Err(403);
        }
        relative.push(segment);
    }
    if relative.as_os_str().is_empty() {
        relative.push("index.html");
    }
    let joined = root.join(relative);
    let Some(file_name) = joined.file_name() else {
        return Err(403);
    };
    let Some(parent) = joined.parent() else {
        return Err(403);
    };
    let canonical_parent = parent.canonicalize().map_err(|err| io_status(err.kind()))?;
    canonical_parent
        .starts_with(&root)
        .then_some(canonical_parent.join(file_name))
        .ok_or(403)
}

fn read_range(path: &Path, start: u64, end: u64) -> Result<Vec<u8>, ErrorKind> {
    let mut file = File::open(path).map_err(|err| err.kind())?;
    file.seek(SeekFrom::Start(start)).map_err(|err| err.kind())?;
    let mut body = vec![0u8; end.saturating_sub(start).saturating_add(1) as usize];
    file.read_exact(&mut body).map_err(|err| err.kind())?;
    Ok(body)
}

fn parse_range_header(header: &str, total_len: u64) -> Option<(u64, u64)> {
    let header = header.trim().strip_prefix("bytes=")?;
    let (start, end) = header.split_once('-')?;
    let max = total_len.checked_sub(1)?;
    let start = start.parse::<u64>().ok()?;
    let end = if end.trim().is_empty() { max } else { end.parse::<u64>().ok()?.min(max) };
    (start <= end).then_some((start, end))
}

fn io_status(kind: ErrorKind) -> i64 {
    match kind {
        ErrorKind::NotFound => 404,
        ErrorKind::PermissionDenied => 403,
        _ => 500,
    }
}

fn status_reply(status: i64) -> HttpReply {
    let body = match status {
        403 => "forbidden",
        404 => "not found",
        500 => "internal error",
        _ => "request failed",
    };
    HttpReply {
        status,
        mime: "text/plain; charset=utf-8",
        body: body.as_bytes().to_vec(),
        len: body.len() as u64,
        range: None,
        accepts_ranges: false,
    }
}

fn mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or_default() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        _ => "application/octet-stream",
    }
}

fn web_root_path() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../nf-runtime/web");
    if manifest.exists() {
        return manifest;
    }
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors() {
            let candidate = ancestor.join("src/nf-runtime/web");
            if candidate.exists() {
                return candidate;
            }
        }
    }
    manifest
}

fn projects_root_path() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
        .join("NextFrame/projects")
}

#[cfg(test)]
mod tests {
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
        assert_eq!(mime_type(Path::new("archive.tar.gz")), "application/octet-stream");
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
        assert_eq!(resolve_file_path(&tmp, "/"), Ok(tmp.canonicalize().unwrap().join("index.html")));
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
}
