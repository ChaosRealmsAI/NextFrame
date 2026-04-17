use std::path::Path;
use std::ptr::NonNull;
use std::time::Duration;

use objc2::rc::Retained;
use objc2_foundation::{NSData, NSDate, NSDefaultRunLoopMode, NSRunLoop, NSString, NSURL};

pub fn nsdata_to_vec(data: &NSData) -> Vec<u8> {
    let len = data.length();
    let mut bytes = vec![0u8; len];
    if let Some(ptr) = NonNull::new(bytes.as_mut_ptr().cast()) {
        // SAFETY: `bytes` is allocated for `len` bytes and remains alive for the call.
        unsafe {
            data.getBytes_length(ptr, len);
        }
    }
    bytes
}

pub fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let until = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    // SAFETY: `NSDefaultRunLoopMode` is a valid Foundation run-loop mode constant.
    let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &until);
}

pub fn nsurl_from_path(path: &Path) -> Retained<NSURL> {
    let text = NSString::from_str(&path.display().to_string());
    NSURL::fileURLWithPath(&text)
}
