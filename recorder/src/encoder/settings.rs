//! AVFoundation video output settings and ObjC helper utilities.

use std::path::Path;
use std::time::Duration;

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSDictionary, NSError, NSNumber, NSObject, NSRunLoop, NSString,
    NSURL,
};

use super::FrameSize;

unsafe extern "C" {
    static AVVideoAverageBitRateKey: &'static NSString;
    static AVVideoCodecKey: &'static NSString;
    static AVVideoCodecTypeH264: &'static NSString;
    static AVVideoCompressionPropertiesKey: &'static NSString;
    static AVVideoHeightKey: &'static NSString;
    static AVVideoMaxKeyFrameIntervalKey: &'static NSString;
    static AVVideoProfileLevelH264HighAutoLevel: &'static NSString;
    static AVVideoProfileLevelKey: &'static NSString;
    static AVVideoWidthKey: &'static NSString;
    static kCVPixelBufferHeightKey: &'static NSString;
    static kCVPixelBufferIOSurfacePropertiesKey: &'static NSString;
    static kCVPixelBufferPixelFormatTypeKey: &'static NSString;
    static kCVPixelBufferWidthKey: &'static NSString;
}

pub(super) fn pixel_buffer_attributes(
    frame_size: FrameSize,
) -> Retained<NSDictionary<NSString, NSObject>> {
    let pixel_format_value =
        NSNumber::numberWithUnsignedInteger(super::K_CV_PIXEL_FORMAT_TYPE_32_BGRA as usize);
    let width_value = NSNumber::numberWithUnsignedInteger(frame_size.width);
    let height_value = NSNumber::numberWithUnsignedInteger(frame_size.height);
    let empty_keys: [&NSString; 0] = [];
    let empty_values: [&NSObject; 0] = [];
    let io_surface_properties = NSDictionary::from_slices(&empty_keys, &empty_values);

    let keys = [
        unsafe { kCVPixelBufferPixelFormatTypeKey },
        unsafe { kCVPixelBufferWidthKey },
        unsafe { kCVPixelBufferHeightKey },
        unsafe { kCVPixelBufferIOSurfacePropertiesKey },
    ];
    let values: [&NSObject; 4] = [
        &*pixel_format_value,
        &*width_value,
        &*height_value,
        &*io_surface_properties,
    ];
    NSDictionary::from_slices(&keys, &values)
}

pub(super) fn video_output_settings(
    frame_size: FrameSize,
    fps: usize,
    crf: u8,
) -> Retained<NSDictionary<NSString, NSObject>> {
    let width_value = NSNumber::numberWithUnsignedInteger(frame_size.width);
    let height_value = NSNumber::numberWithUnsignedInteger(frame_size.height);
    let bitrate_value =
        NSNumber::numberWithUnsignedInteger(target_video_bitrate(frame_size, fps, crf));
    let max_keyframe_interval = NSNumber::numberWithUnsignedInteger(fps.saturating_mul(2));
    let compression_keys = [
        unsafe { AVVideoAverageBitRateKey },
        unsafe { AVVideoMaxKeyFrameIntervalKey },
        unsafe { AVVideoProfileLevelKey },
    ];
    let compression_values: [&NSObject; 3] = [&*bitrate_value, &*max_keyframe_interval, unsafe {
        AVVideoProfileLevelH264HighAutoLevel
    }];
    let compression_properties = NSDictionary::from_slices(&compression_keys, &compression_values);

    let keys = [
        unsafe { AVVideoCodecKey },
        unsafe { AVVideoWidthKey },
        unsafe { AVVideoHeightKey },
        unsafe { AVVideoCompressionPropertiesKey },
    ];
    let values: [&NSObject; 4] = [
        unsafe { AVVideoCodecTypeH264 },
        &*width_value,
        &*height_value,
        &*compression_properties,
    ];
    NSDictionary::from_slices(&keys, &values)
}

fn target_video_bitrate(frame_size: FrameSize, fps: usize, crf: u8) -> usize {
    let pixels = (frame_size.width * frame_size.height) as f64;
    let quality_scale = 2f64.powf((18.0 - crf.min(51) as f64) / 8.0);
    let bits_per_pixel = (0.045 * quality_scale).clamp(0.03, 0.22);
    (pixels * fps as f64 * bits_per_pixel).round().max(1.0) as usize
}

pub(super) fn lookup_class(name: &'static std::ffi::CStr) -> Result<&'static AnyClass, String> {
    AnyClass::get(name)
        .ok_or_else(|| format!("Objective-C class not found: {}", name.to_string_lossy()))
}

pub(super) fn nsurl_from_path(path: &Path) -> Retained<NSURL> {
    NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()))
}

pub(super) fn writer_error_string(writer: &AnyObject, context: &str) -> String {
    let error: *mut NSError = unsafe { msg_send![writer, error] };
    ns_error_ptr_to_string(error, context)
}

pub(super) fn ns_error_ptr_to_string(error: *mut NSError, context: &str) -> String {
    match unsafe { error.as_ref() } {
        Some(error) => format!("{context}: {}", ns_error_to_string(error)),
        None => context.to_string(),
    }
}

fn ns_error_to_string(error: &NSError) -> String {
    format!(
        "{} (domain={}, code={})",
        error.localizedDescription(),
        error.domain(),
        error.code()
    )
}

pub(super) fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &date);
}
