//! Custom `WKURLSchemeHandler` implementations for `nf://` and `nfdata://`.

use std::fs::{self, File};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DeclaredClass, MainThreadMarker, MainThreadOnly};
use objc2_foundation::{
    NSCocoaErrorDomain, NSData, NSError, NSHTTPURLResponse, NSMutableDictionary, NSObjectProtocol,
    NSString, NSURLRequest, NSURL,
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
            // SAFETY: the generated scheme-handler class is registered as an NSObject subclass for objc2.
            #[thread_kind = MainThreadOnly]
            #[ivars = SchemeHandlerIvars]
            pub(crate) struct $name;

            unsafe impl NSObjectProtocol for $name {} // SAFETY: $name is an NSObject subclass that satisfies NSObjectProtocol expectations.

            #[allow(non_snake_case)]
            unsafe impl WKURLSchemeHandler for $name {
                // SAFETY: $name is registered with WebKit as a main-thread URL scheme handler.
                #[unsafe(method(webView:startURLSchemeTask:))] // SAFETY: Selector matches WKURLSchemeHandler's Objective-C start callback.
                unsafe fn web_view_start_urlscheme_task(
                    // SAFETY: WebKit supplies a live task and web view for the duration of this callback.
                    &self,
                    _web_view: &WKWebView,
                    task: &ProtocolObject<dyn WKURLSchemeTask>,
                ) {
                    serve_task(task, &self.ivars().root);
                }

                #[unsafe(method(webView:stopURLSchemeTask:))] // SAFETY: Selector matches WKURLSchemeHandler's Objective-C stop callback.
                unsafe fn web_view_stop_urlscheme_task(
                    // SAFETY: WebKit supplies a live task and web view when cancelling an in-flight load.
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
    let (request_root, relative_path) = resolve_request_target(root, &request_path);
    let file_path = match resolve_file_path(&request_root, &relative_path) {
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

fn resolve_request_target(root: &Path, request_path: &str) -> (PathBuf, String) {
    if let Some(stripped) = request_path.strip_prefix("/generated/") {
        return (
            nf_bridge::path::preview_bundle_cache_dir(),
            format!("/{stripped}"),
        );
    }

    (
        root.canonicalize().unwrap_or_else(|_| root.to_path_buf()),
        request_path.to_string(),
    )
}

fn send_reply(
    task: &ProtocolObject<dyn WKURLSchemeTask>,
    url: &NSURL,
    reply: &HttpReply,
) -> Result<(), String> {
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
        return Err(
            "Internal: failed to create HTTP response. Fix: verify the reply URL and headers are valid Objective-C values."
                .to_string(),
        );
    };
    unsafe {
        // SAFETY: WKURLSchemeTask requires response, optional data, then finish while the task is live.
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
    unsafe { headers.setObject_forKey(&value, key) }; // SAFETY: key and value are live NSString objects inserted into an Objective-C NSMutableDictionary.
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
    file.seek(SeekFrom::Start(start))
        .map_err(|err| err.kind())?;
    let mut body = vec![0u8; end.saturating_sub(start).saturating_add(1) as usize];
    file.read_exact(&mut body).map_err(|err| err.kind())?;
    Ok(body)
}

fn parse_range_header(header: &str, total_len: u64) -> Option<(u64, u64)> {
    let header = header.trim().strip_prefix("bytes=")?;
    let (start, end) = header.split_once('-')?;
    let max = total_len.checked_sub(1)?;
    let start = start.parse::<u64>().ok()?;
    let end = if end.trim().is_empty() {
        max
    } else {
        end.parse::<u64>().ok()?.min(max)
    };
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
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
    {
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
#[path = "tests/protocol.rs"]
mod tests;
