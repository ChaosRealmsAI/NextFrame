//! Shared error formatting helpers for user-facing publish commands.

use std::fmt::Display;
use std::panic::AssertUnwindSafe;

pub(crate) fn error_with_fix(action: &str, reason: impl Display, fix: &str) -> String {
    format!("failed to {action}: {reason}. Fix: {fix}")
}

pub(crate) fn ensure_fix(err: impl Into<String>, action: &str, fix: &str) -> String {
    let err = err.into();
    if err.contains(". Fix: ") || err.starts_with("Internal: ") {
        err
    } else {
        error_with_fix(action, err, fix)
    }
}

/// Wrap a closure that performs Objective-C message sends in an exception-catching boundary.
/// `action` describes the high-level operation for the error message (e.g. "update the macOS publish UI").
pub(crate) fn with_objc_boundary(action: &str, f: impl FnOnce()) -> Result<(), String> {
    // SAFETY: `objc2::exception::catch` is the intended wrapper around Objective-C message sends at FFI boundaries.
    let result = unsafe { objc2::exception::catch(AssertUnwindSafe(f)) }; // SAFETY: `objc2::exception::catch` is the intended wrapper around Objective-C message sends at FFI boundaries.
    result.map_err(|e| {
        error_with_fix(
            action,
            format!("Objective-C raised an exception: {e:?}"),
            "Retry after the UI settles. If it keeps failing, restart nf-publish.",
        )
    })
}
