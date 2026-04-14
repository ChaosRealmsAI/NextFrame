//! Custom `WKURLSchemeHandler` implementations for `nf://` and `nfdata://`.

use std::fs::{self, File};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{DeclaredClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_foundation::{
    NSCocoaErrorDomain, NSData, NSError, NSHTTPURLResponse, NSMutableDictionary,
    NSObjectProtocol, NSString, NSURL, NSURLRequest,
};
use objc2_web_kit::{WKURLSchemeHandler, WKURLSchemeTask, WKWebView};

pub(crate) const NF_SCHEME: &str = "nf";
pub(crate) const NFDATA_SCHEME: &str = "nfdata";

struct SchemeHandlerIvars {
    root: PathBuf,
}

pub(crate) struct SchemeHandlers {
    pub(crate) nf: Retained<NfSchemeHandler>,
    pub(crate) nfdata: Retained<NfDataSchemeHandler>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = SchemeHandlerIvars]
    pub(crate) struct NfSchemeHandler;

    unsafe impl NSObjectProtocol for NfSchemeHandler {}

    unsafe impl WKURLSchemeHandler for NfSchemeHandler {
        #[unsafe(method(webView:startURLSchemeTask:))]
        unsafe fn webView_startURLSchemeTask(
            &self,
            _web_view: &WKWebView,
            task: &ProtocolObject<dyn WKURLSchemeTask>,
        ) {
            serve_task(task, &self.ivars().root);
        }

        #[unsafe(method(webView:stopURLSchemeTask:))]
        unsafe fn webView_stopURLSchemeTask(
            &self,
            _web_view: &WKWebView,
            _task: &ProtocolObject<dyn WKURLSchemeTask>,
        ) {
        }
    }
);

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = SchemeHandlerIvars]
    pub(crate) struct NfDataSchemeHandler;

    unsafe impl NSObjectProtocol for NfDataSchemeHandler {}

    unsafe impl WKURLSchemeHandler for NfDataSchemeHandler {
        #[unsafe(method(webView:startURLSchemeTask:))]
        unsafe fn webView_startURLSchemeTask(
            &self,
            _web_view: &WKWebView,
            task: &ProtocolObject<dyn WKURLSchemeTask>,
        ) {
            serve_task(task, &self.ivars().root);
        }

        #[unsafe(method(webView:stopURLSchemeTask:))]
        unsafe fn webView_stopURLSchemeTask(
            &self,
            _web_view: &WKWebView,
            _task: &ProtocolObject<dyn WKURLSchemeTask>,
        ) {
        }
    }
);

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
        nf: unsafe { msg_send![super(nf), init] },
        nfdata: unsafe { msg_send![super(nfdata), init] },
    }
}

struct HttpReply {
    status: i64,
    mime: &'static str,
    body: Vec<u8>,
    content_length: u64,
    content_range: Option<String>,
    accept_ranges: bool,
}

fn serve_task(task: &ProtocolObject<dyn WKURLSchemeTask>, root: &Path) {
    let request = unsafe { task.request() };
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
    let canonical_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let Ok(file_path) = resolve_file_path(&canonical_root, &request_path) else {
        return text_reply(403, "forbidden");
    };
    let metadata = match file_path.metadata() {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return text_reply(403, "forbidden"),
        Err(err) if err.kind() == ErrorKind::NotFound => return text_reply(404, "not found"),
        Err(err) if err.kind() == ErrorKind::PermissionDenied => return text_reply(403, "forbidden"),
        Err(_) => return text_reply(500, "internal error"),
    };

    let total_len = metadata.len();
    let mime = mime_type(&file_path);
    let range_header = request.valueForHTTPHeaderField(&NSString::from_str("Range"));
    if let Some(header) = range_header {
        return match parse_range_header(&header.to_string(), total_len) {
            Some((start, end)) => ranged_reply(&file_path, mime, start, end, include_body),
            None => HttpReply {
                status: 416,
                mime: "text/plain; charset=utf-8",
                body: b"range not satisfiable".to_vec(),
                content_length: 21,
                content_range: Some(format!("bytes */{total_len}")),
                accept_ranges: true,
            },
        };
    }

    let body = if include_body {
        fs::read(&file_path).unwrap_or_default()
    } else {
        Vec::new()
    };
    HttpReply {
        status: 200,
        mime,
        content_length: total_len,
        body,
        content_range: None,
        accept_ranges: true,
    }
}

fn ranged_reply(path: &Path, mime: &'static str, start: u64, end: u64, include_body: bool) -> HttpReply {
    let body = if include_body {
        read_range(path, start, end).unwrap_or_default()
    } else {
        Vec::new()
    };
    HttpReply {
        status: 206,
        mime,
        content_length: end.saturating_sub(start).saturating_add(1),
        body,
        content_range: Some(format!("bytes {start}-{end}/{}", fs::metadata(path).map(|m| m.len()).unwrap_or(0))),
        accept_ranges: true,
    }
}

fn send_reply(
    task: &ProtocolObject<dyn WKURLSchemeTask>,
    url: &NSURL,
    reply: &HttpReply,
) -> Result<(), String> {
    let headers = NSMutableDictionary::<NSString, NSString>::new();
    insert_header(&headers, "Content-Type", reply.mime);
    insert_header(&headers, "Content-Length", &reply.content_length.to_string());
    if reply.accept_ranges {
        insert_header(&headers, "Accept-Ranges", "bytes");
    }
    if let Some(content_range) = &reply.content_range {
        insert_header(&headers, "Content-Range", content_range);
    }

    let version = NSString::from_str("HTTP/1.1");
    let Some(response) = NSHTTPURLResponse::initWithURL_statusCode_HTTPVersion_headerFields(
        NSHTTPURLResponse::alloc(),
        url,
        reply.status,
        Some(&version),
        Some(&headers),
    ) else {
        return Err("failed to create HTTP response".to_string());
    };

    unsafe {
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
    let description = NSString::from_str(reason);
    let error = unsafe {
        NSError::errorWithDomain_code_userInfo(&NSCocoaErrorDomain, 0, None)
    };
    let _ = description;
    unsafe { task.didFailWithError(&error) };
}

fn insert_header(headers: &NSMutableDictionary<NSString, NSString>, key: &str, value: &str) {
    let key = NSString::from_str(key);
    let value = NSString::from_str(value);
    let key = ProtocolObject::from_ref(&*key);
    unsafe { headers.setObject_forKey(&value, key) };
}

fn resolve_file_path(root: &Path, raw_path: &str) -> Result<PathBuf, ()> {
    let mut relative = PathBuf::new();
    for segment in raw_path.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains('\\') {
            return Err(());
        }
        relative.push(segment);
    }
    if relative.as_os_str().is_empty() {
        relative.push("index.html");
    }
    let joined = root.join(relative);
    let canonical = joined.canonicalize().map_err(|_| ())?;
    canonical.starts_with(root).then_some(canonical).ok_or(())
}

fn read_range(path: &Path, start: u64, end: u64) -> Result<Vec<u8>, ()> {
    let mut file = File::open(path).map_err(|_| ())?;
    file.seek(SeekFrom::Start(start)).map_err(|_| ())?;
    let mut body = vec![0u8; end.saturating_sub(start).saturating_add(1) as usize];
    file.read_exact(&mut body).map_err(|_| ())?;
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

fn text_reply(status: i64, body: &str) -> HttpReply {
    HttpReply {
        status,
        mime: "text/plain; charset=utf-8",
        content_length: body.len() as u64,
        body: body.as_bytes().to_vec(),
        content_range: None,
        accept_ranges: false,
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
