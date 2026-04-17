use objc2::{class, msg_send};
use objc2_core_media::CMSampleBuffer;

pub fn flush_core_animation_transactions() {
    // SAFETY: Sending `flush` to CATransaction is the documented way to force a commit;
    // the selector is process-global and takes no object parameters.
    unsafe {
        let _: () = msg_send![class!(CATransaction), flush];
    }
}

/// # Safety
///
/// `sample` must be a valid retained `CMSampleBuffer` pointer obtained from Objective-C/CF code,
/// and this call must balance exactly one previous retain.
pub unsafe fn release_sample_buffer(sample: *mut CMSampleBuffer) {
    // SAFETY: `sample` was retained before being stored; balancing that retain with `release`
    // is correct as long as the pointer is non-null and points to a live Objective-C object.
    unsafe {
        let _: () = msg_send![sample, release];
    }
}
