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

// SAFETY: These imported framework constants are process-global and valid for the life of the process.
unsafe extern "C" {
    // SAFETY: see above.
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
        // SAFETY: This imported CoreVideo key is a valid process-global NSString constant.
        unsafe { kCVPixelBufferPixelFormatTypeKey }, // SAFETY: see above.
        // SAFETY: This imported CoreVideo key is a valid process-global NSString constant.
        unsafe { kCVPixelBufferWidthKey }, // SAFETY: see above.
        // SAFETY: This imported CoreVideo key is a valid process-global NSString constant.
        unsafe { kCVPixelBufferHeightKey }, // SAFETY: see above.
        // SAFETY: This imported CoreVideo key is a valid process-global NSString constant.
        unsafe { kCVPixelBufferIOSurfacePropertiesKey }, // SAFETY: see above.
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
    let max_keyframe_interval = NSNumber::numberWithUnsignedInteger(target_keyframe_interval(fps));
    let compression_keys = [
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoAverageBitRateKey }, // SAFETY: see above.
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoMaxKeyFrameIntervalKey }, // SAFETY: see above.
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoProfileLevelKey }, // SAFETY: see above.
    ];
    let compression_values: [&NSObject; 3] = [
        &*bitrate_value,
        &*max_keyframe_interval,
        profile_level_nsobject(frame_size, fps),
    ];
    let compression_properties = NSDictionary::from_slices(&compression_keys, &compression_values);

    let keys = [
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoCodecKey }, // SAFETY: see above.
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoWidthKey }, // SAFETY: see above.
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoHeightKey }, // SAFETY: see above.
        // SAFETY: This imported AVFoundation key is a valid process-global NSString constant.
        unsafe { AVVideoCompressionPropertiesKey }, // SAFETY: see above.
    ];
    let values: [&NSObject; 4] = [
        // SAFETY: This imported AVFoundation value is a valid process-global NSString constant.
        unsafe { AVVideoCodecTypeH264 }, // SAFETY: see above.
        &*width_value,
        &*height_value,
        &*compression_properties,
    ];
    NSDictionary::from_slices(&keys, &values)
}

fn target_video_bitrate(frame_size: FrameSize, fps: usize, crf: u8) -> usize {
    let pixels = (frame_size.width * frame_size.height) as f64;
    let quality_scale = crf_to_quality_scale(crf);
    let bits_per_pixel = (0.045 * quality_scale).clamp(0.03, 0.22);
    (pixels * fps as f64 * bits_per_pixel).round().max(1.0) as usize
}

fn crf_to_quality_scale(crf: u8) -> f64 {
    2f64.powf((18.0 - crf.min(51) as f64) / 8.0)
}

fn target_keyframe_interval(fps: usize) -> usize {
    fps.saturating_mul(2)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum H264ProfileLevel {
    High31,
    High40,
    High51,
}

fn select_h264_profile_level(frame_size: FrameSize, fps: usize) -> H264ProfileLevel {
    let macroblocks_per_row = frame_size.width.div_ceil(16);
    let macroblocks_per_column = frame_size.height.div_ceil(16);
    let macroblocks_per_frame = macroblocks_per_row.saturating_mul(macroblocks_per_column);
    let macroblocks_per_second = macroblocks_per_frame.saturating_mul(fps);

    if macroblocks_per_frame <= 3_600 && macroblocks_per_second <= 108_000 {
        H264ProfileLevel::High31
    } else if macroblocks_per_frame <= 8_192 && macroblocks_per_second <= 245_760 {
        H264ProfileLevel::High40
    } else {
        H264ProfileLevel::High51
    }
}

fn profile_level_nsobject(frame_size: FrameSize, fps: usize) -> &'static NSObject {
    match select_h264_profile_level(frame_size, fps) {
        // SAFETY: This imported AVFoundation profile constant is a valid process-global NSString.
        H264ProfileLevel::High31 | H264ProfileLevel::High40 | H264ProfileLevel::High51 => unsafe {
            AVVideoProfileLevelH264HighAutoLevel
        }, // SAFETY: see above.
    }
}

pub(super) fn lookup_class(name: &'static std::ffi::CStr) -> Result<&'static AnyClass, String> {
    AnyClass::get(name)
        .ok_or_else(|| format!("Objective-C class not found: {}", name.to_string_lossy()))
}

pub(super) fn nsurl_from_path(path: &Path) -> Retained<NSURL> {
    NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()))
}

pub(super) fn writer_error_string(writer: &AnyObject, context: &str) -> String {
    // SAFETY: `writer` is an `AVAssetWriter`, so `error` returns either null or a live `NSError *`.
    let error: *mut NSError = unsafe { msg_send![writer, error] }; // SAFETY: see above.
    ns_error_ptr_to_string(error, context)
}

pub(super) fn ns_error_ptr_to_string(error: *mut NSError, context: &str) -> String {
    // SAFETY: Objective-C error out-pointers are either null or valid for this formatting scope.
    match unsafe { error.as_ref() } {
        // SAFETY: see above.
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
    // SAFETY: `NSDefaultRunLoopMode` is a valid process-global Foundation NSString constant.
    let default_mode = unsafe { NSDefaultRunLoopMode }; // SAFETY: see above.
    let _ = run_loop.runMode_beforeDate(default_mode, &date);
}

#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
#[cfg(test)]
mod tests {
    use super::{
        FrameSize, H264ProfileLevel, crf_to_quality_scale, select_h264_profile_level,
        target_keyframe_interval, target_video_bitrate,
    };

    #[test]
    fn calculates_bitrate_for_common_resolutions() {
        let fps = 30;
        let crf = 18;

        assert_eq!(
            target_video_bitrate(
                FrameSize {
                    width: 1920,
                    height: 1080,
                },
                fps,
                crf,
            ),
            2_799_360
        );
        assert_eq!(
            target_video_bitrate(
                FrameSize {
                    width: 1280,
                    height: 720,
                },
                fps,
                crf,
            ),
            1_244_160
        );
        assert_eq!(
            target_video_bitrate(
                FrameSize {
                    width: 3840,
                    height: 2160,
                },
                fps,
                crf,
            ),
            11_197_440
        );
    }

    #[test]
    fn calculates_keyframe_interval_from_fps() {
        assert_eq!(target_keyframe_interval(30), 60);
        assert_eq!(target_keyframe_interval(60), 120);
        assert_eq!(target_keyframe_interval(usize::MAX), usize::MAX);
    }

    #[test]
    fn selects_profile_level_from_frame_size_and_fps() {
        assert_eq!(
            select_h264_profile_level(
                FrameSize {
                    width: 1280,
                    height: 720
                },
                30
            ),
            H264ProfileLevel::High31
        );
        assert_eq!(
            select_h264_profile_level(
                FrameSize {
                    width: 1920,
                    height: 1080,
                },
                30,
            ),
            H264ProfileLevel::High40
        );
        assert_eq!(
            select_h264_profile_level(
                FrameSize {
                    width: 3840,
                    height: 2160,
                },
                30,
            ),
            H264ProfileLevel::High51
        );
    }

    #[test]
    fn maps_crf_to_quality_scale() {
        let losslessish = crf_to_quality_scale(0);
        let visually_lossless = crf_to_quality_scale(18);
        let medium = crf_to_quality_scale(23);
        let clamped = crf_to_quality_scale(60);

        assert!((visually_lossless - 1.0).abs() < f64::EPSILON);
        assert!(losslessish > visually_lossless);
        assert!(visually_lossless > medium);
        assert!((clamped - crf_to_quality_scale(51)).abs() < f64::EPSILON);
    }
}
