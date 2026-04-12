//! Video encoding helpers backed by `AVAssetWriter` and VideoToolbox-friendly pixel buffers.

use std::ffi::{OsStr, c_void};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::ptr;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_app_kit::NSImage;
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo, CGImageByteOrderInfo,
};
// CGPoint/CGRect/CGSize are type aliases for NSPoint/NSRect/NSSize on macOS
use objc2_core_media::{CMTime, kCMTimeZero};
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSDictionary, NSError, NSNumber, NSObject, NSRunLoop, NSString,
    NSURL,
};
use objc2_foundation::{NSPoint as CGPoint, NSRect as CGRect, NSSize as CGSize};

use crate::capture::cgimage_from_nsimage;
use crate::progress::ProgressOverlay;

const K_CV_PIXEL_FORMAT_TYPE_32_BGRA: u32 = 0x4247_5241;
type CVReturn = i32;
type CVPixelBufferRef = *mut c_void;
type CFAllocatorRef = *const c_void;
type CFDictionaryRef = *const c_void;

#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {}

#[link(name = "CoreMedia", kind = "framework")]
unsafe extern "C" {}

#[link(name = "CoreVideo", kind = "framework")]
unsafe extern "C" {}

unsafe extern "C" {
    static AVFileTypeMPEG4: &'static NSString;
    static AVMediaTypeVideo: &'static NSString;
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

    fn CVPixelBufferCreate(
        allocator: CFAllocatorRef,
        width: usize,
        height: usize,
        pixel_format_type: u32,
        pixel_buffer_attributes: CFDictionaryRef,
        pixel_buffer_out: *mut CVPixelBufferRef,
    ) -> CVReturn;
    fn CVPixelBufferGetBaseAddress(pixel_buffer: CVPixelBufferRef) -> *mut c_void;
    fn CVPixelBufferGetBytesPerRow(pixel_buffer: CVPixelBufferRef) -> usize;
    fn CVPixelBufferLockBaseAddress(pixel_buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
    fn CVPixelBufferUnlockBaseAddress(pixel_buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
    fn CVBufferRelease(buffer: CVPixelBufferRef);
}

#[derive(Debug, Clone, Copy)]
/// Encoder implementation selected for the current run.
pub enum EncoderBackend {
    VideoToolbox,
}

impl EncoderBackend {
    /// Returns the human-readable backend label used in logs.
    pub fn label(self) -> &'static str {
        "h264_videotoolbox"
    }
}

/// Encodes one video segment and optionally muxes audio into the finished file.
pub struct SegmentEncoder {
    writer: Option<Retained<AnyObject>>,
    input: Option<Retained<AnyObject>>,
    adaptor: Option<Retained<AnyObject>>,
    output_path: PathBuf,
    video_path: PathBuf,
    audio_path: Option<PathBuf>,
    duration_sec: f64,
    fps: usize,
    crf: u8,
    frame_count: usize,
    backend: EncoderBackend,
}

impl SegmentEncoder {
    /// Creates a new segment encoder that writes video to a temporary file before muxing audio.
    pub fn spawn(
        output_path: &Path,
        audio_path: Option<&Path>,
        duration_sec: f64,
        fps: usize,
        crf: u8,
        backend: EncoderBackend,
    ) -> Result<Self, String> {
        let output_path = output_path.to_path_buf();
        let video_path = output_path.with_extension("video.mp4");
        let _ = fs::remove_file(&output_path);
        let _ = fs::remove_file(&video_path);

        Ok(Self {
            writer: None,
            input: None,
            adaptor: None,
            output_path,
            video_path,
            audio_path: audio_path
                .filter(|path| path.exists())
                .map(|path| path.to_path_buf()),
            duration_sec,
            fps,
            crf,
            frame_count: 0,
            backend,
        })
    }

    /// Appends an `NSImage` frame to the segment.
    #[allow(dead_code)]
    pub(crate) fn write_nsimage(&mut self, image: &NSImage) -> Result<(), String> {
        let cg_image = cgimage_from_nsimage(image)?;
        self.write_cgimage(&cg_image)
    }

    /// Appends a `CGImage` frame to the segment.
    #[allow(dead_code)]
    pub(crate) fn write_cgimage(&mut self, image: &CGImage) -> Result<(), String> {
        self.write_cgimage_with_progress(image, None)
    }

    /// Appends a `CGImage` frame with an optional progress bar overlay.
    pub fn write_cgimage_with_progress(
        &mut self,
        image: &CGImage,
        overlay: Option<ProgressOverlay<'_>>,
    ) -> Result<(), String> {
        self.ensure_writer(image)?;
        let pixel_buffer = create_pixel_buffer_from_cgimage(image, overlay)?;
        self.append_pixel_buffer(pixel_buffer)
    }

    /// Finalizes the writer and muxes the optional audio track into the output segment.
    pub fn finish(self) -> Result<(), String> {
        if self.frame_count == 0 {
            return Err("cannot finish segment without any video frames".into());
        }

        let Self {
            writer,
            input,
            adaptor: _,
            output_path,
            video_path,
            audio_path,
            duration_sec,
            fps: _,
            crf: _,
            frame_count: _,
            backend,
        } = self;
        let writer = writer.ok_or_else(|| "writer missing during finish".to_string())?;
        let input = input.ok_or_else(|| "writer input missing during finish".to_string())?;

        unsafe {
            let _: () = msg_send![&*input, markAsFinished];
        }

        let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
        let writer_for_block = writer.clone();
        let finish = RcBlock::new(move || {
            let status: isize = unsafe { msg_send![&*writer_for_block, status] };
            let result = if status == 2 {
                Ok(())
            } else {
                Err(writer_error_string(
                    &writer_for_block,
                    "finishWriting completed with a failure",
                ))
            };
            let _ = done_tx.send(result);
        });

        unsafe {
            let _: () = msg_send![&*writer, finishWritingWithCompletionHandler: &*finish];
        }

        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            match done_rx.recv_timeout(Duration::from_millis(20)) {
                Ok(Ok(())) => break,
                Ok(Err(err)) => return Err(err),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if Instant::now() >= deadline {
                        return Err("timed out waiting for AVAssetWriter to finish".into());
                    }
                    pump_main_run_loop(Duration::from_millis(10));
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("finishWriting completion channel disconnected".into());
                }
            }
        }

        let mux_result = mux_audio_track(
            &video_path,
            audio_path.as_deref(),
            duration_sec,
            &output_path,
        );
        if mux_result.is_ok() {
            let _ = fs::remove_file(&video_path);
        }
        if mux_result.is_err() {
            eprintln!(
                "  warn leaving video-only segment at {} after mux failure ({})",
                video_path.display(),
                backend.label()
            );
        }
        mux_result
    }

    fn ensure_writer(&mut self, cg_image: &CGImage) -> Result<(), String> {
        if self.writer.is_some() {
            return Ok(());
        }

        let frame_size = FrameSize {
            width: CGImage::width(Some(cg_image)),
            height: CGImage::height(Some(cg_image)),
        };
        if frame_size.width == 0 || frame_size.height == 0 {
            return Err("snapshot produced an empty CGImage".into());
        }
        if !frame_size.width.is_multiple_of(2) || !frame_size.height.is_multiple_of(2) {
            return Err(format!(
                "snapshot size must be even for H.264, got {}x{}",
                frame_size.width, frame_size.height
            ));
        }

        let writer_class = lookup_class(c"AVAssetWriter")?;
        let input_class = lookup_class(c"AVAssetWriterInput")?;
        let adaptor_class = lookup_class(c"AVAssetWriterInputPixelBufferAdaptor")?;
        let output_settings = video_output_settings(frame_size, self.fps, self.crf);
        let pixel_buffer_attributes = pixel_buffer_attributes(frame_size);
        let output_url = nsurl_from_path(&self.video_path);

        let mut error: *mut NSError = ptr::null_mut();
        let writer: Option<Retained<AnyObject>> = unsafe {
            msg_send![
                writer_class,
                assetWriterWithURL: &*output_url,
                fileType: AVFileTypeMPEG4,
                error: &mut error
            ]
        };
        let Some(writer) = writer else {
            return Err(ns_error_ptr_to_string(error, "AVAssetWriter init failed"));
        };
        unsafe {
            let _: () = msg_send![&*writer, setShouldOptimizeForNetworkUse: true];
        }

        let can_apply: bool = unsafe {
            msg_send![
                &*writer,
                canApplyOutputSettings: Some(&*output_settings),
                forMediaType: AVMediaTypeVideo
            ]
        };
        if !can_apply {
            return Err(format!(
                "AVAssetWriter rejected output settings for {}x{}",
                frame_size.width, frame_size.height
            ));
        }

        let input: Option<Retained<AnyObject>> = unsafe {
            msg_send![
                input_class,
                assetWriterInputWithMediaType: AVMediaTypeVideo,
                outputSettings: Some(&*output_settings)
            ]
        };
        let Some(input) = input else {
            return Err("AVAssetWriterInput factory returned nil".into());
        };
        unsafe {
            let _: () = msg_send![&*input, setExpectsMediaDataInRealTime: false];
        }

        let can_add: bool = unsafe { msg_send![&*writer, canAddInput: &*input] };
        if !can_add {
            return Err("AVAssetWriter refused the video input".into());
        }
        unsafe {
            let _: () = msg_send![&*writer, addInput: &*input];
        }

        let adaptor: Option<Retained<AnyObject>> = unsafe {
            msg_send![
                adaptor_class,
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput: &*input,
                sourcePixelBufferAttributes: Some(&*pixel_buffer_attributes)
            ]
        };
        let Some(adaptor) = adaptor else {
            return Err("AVAssetWriterInputPixelBufferAdaptor factory returned nil".into());
        };

        let started: bool = unsafe { msg_send![&*writer, startWriting] };
        if !started {
            return Err(writer_error_string(
                &writer,
                "AVAssetWriter startWriting failed",
            ));
        }
        unsafe {
            let _: () = msg_send![&*writer, startSessionAtSourceTime: kCMTimeZero];
        }

        self.writer = Some(writer);
        self.input = Some(input);
        self.adaptor = Some(adaptor);
        Ok(())
    }

    fn append_pixel_buffer(&mut self, pixel_buffer: CVPixelBufferRef) -> Result<(), String> {
        let input = self
            .input
            .as_ref()
            .ok_or_else(|| "writer input was not initialized".to_string())?;
        let deadline = Instant::now() + Duration::from_secs(10);
        while {
            let ready: bool = unsafe { msg_send![&**input, isReadyForMoreMediaData] };
            !ready
        } {
            let writer = self
                .writer
                .as_ref()
                .ok_or_else(|| "writer was not initialized".to_string())?;
            let status: isize = unsafe { msg_send![&**writer, status] };
            if status != 1 {
                return Err(format!(
                    "AVAssetWriter entered failed state (status={status}) while waiting for input"
                ));
            }
            if Instant::now() >= deadline {
                return Err("AVAssetWriter not ready for more data after 10s timeout".to_string());
            }
            pump_main_run_loop(Duration::from_millis(1));
        }

        let adaptor = self
            .adaptor
            .as_ref()
            .ok_or_else(|| "pixel buffer adaptor was not initialized".to_string())?;
        let presentation_time = frame_time(self.frame_count, self.fps)?;
        let appended: bool = unsafe {
            msg_send![
                &**adaptor,
                appendPixelBuffer: pixel_buffer,
                withPresentationTime: presentation_time
            ]
        };
        unsafe {
            CVBufferRelease(pixel_buffer);
        }
        if !appended {
            let writer = self
                .writer
                .as_ref()
                .ok_or_else(|| "writer missing after append failure".to_string())?;
            return Err(writer_error_string(writer, "appendPixelBuffer failed"));
        }

        self.frame_count += 1;
        Ok(())
    }
}

/// Returns the only supported encoder backend.
pub fn detect_backend() -> EncoderBackend {
    EncoderBackend::VideoToolbox
}

/// Uses `ffprobe` to inspect the duration of an optional audio track.
pub fn probe_audio_duration(audio_path: Option<&Path>) -> Result<f64, String> {
    let Some(path) = audio_path else {
        return Ok(0.0);
    };
    if !path.exists() {
        return Err(format!("audio file does not exist: {}", path.display()));
    }
    let output = Command::new("ffprobe")
        .args([
            OsStr::new("-v"),
            OsStr::new("quiet"),
            OsStr::new("-show_entries"),
            OsStr::new("format=duration"),
            OsStr::new("-of"),
            OsStr::new("csv=p=0"),
            path.as_os_str(),
        ])
        .output()
        .map_err(|err| format!("failed to launch ffprobe for {}: {err}", path.display()))?;
    if !output.status.success() {
        return Err(format!(
            "ffprobe failed for {}: exit {}",
            path.display(),
            output.status
        ));
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|err| {
            format!(
                "failed to parse ffprobe duration for {}: {err}",
                path.display()
            )
        })
}

/// Concatenates the finished segment files into the final output MP4.
pub fn concat_segments(segment_paths: &[PathBuf], output_path: &Path) -> Result<(), String> {
    if segment_paths.len() == 1 {
        // Single segment: just rename, no ffmpeg needed
        fs::rename(&segment_paths[0], output_path)
            .or_else(|_| fs::copy(&segment_paths[0], output_path).map(|_| ()))
            .map_err(|err| format!("failed to move single segment to output: {err}"))?;
        return Ok(());
    }

    // Use filter_complex concat (re-encodes) instead of demuxer concat (-c copy).
    // Demuxer concat breaks when segments have different time_base (e.g. after overlay
    // re-encodes some segments but not others), causing wrong total duration.
    let mut args: Vec<String> = vec!["-y".into()];
    for path in segment_paths {
        args.push("-i".into());
        args.push(path.to_string_lossy().into_owned());
    }

    // Build filter_complex: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[v][a]
    let n = segment_paths.len();
    let mut filter = String::with_capacity(n * 12 + 40);
    for i in 0..n {
        filter.push_str(&format!("[{i}:v][{i}:a]"));
    }
    filter.push_str(&format!("concat=n={n}:v=1:a=1[v][a]"));

    args.extend_from_slice(&[
        "-filter_complex".into(),
        filter,
        "-map".into(),
        "[v]".into(),
        "-map".into(),
        "[a]".into(),
        "-c:v".into(),
        "h264_videotoolbox".into(),
        "-q:v".into(),
        "65".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.to_string_lossy().into_owned(),
    ]);

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|err| format!("failed to launch concat ffmpeg: {err}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "ffmpeg concat failed: {}",
        String::from_utf8_lossy(&output.stderr)
    ))
}

#[derive(Clone, Copy)]
struct FrameSize {
    width: usize,
    height: usize,
}

fn create_pixel_buffer_from_cgimage(
    image: &CGImage,
    overlay: Option<ProgressOverlay<'_>>,
) -> Result<CVPixelBufferRef, String> {
    let frame_size = FrameSize {
        width: CGImage::width(Some(image)),
        height: CGImage::height(Some(image)),
    };
    let attributes = pixel_buffer_attributes(frame_size);
    let mut pixel_buffer: CVPixelBufferRef = ptr::null_mut();
    let create_result = unsafe {
        CVPixelBufferCreate(
            ptr::null(),
            frame_size.width,
            frame_size.height,
            K_CV_PIXEL_FORMAT_TYPE_32_BGRA,
            (&*attributes as *const NSDictionary<NSString, NSObject>).cast(),
            &mut pixel_buffer,
        )
    };
    if create_result != 0 || pixel_buffer.is_null() {
        return Err(format!(
            "CVPixelBufferCreate failed with status {}",
            create_result
        ));
    }

    let lock_result = unsafe { CVPixelBufferLockBaseAddress(pixel_buffer, 0) };
    if lock_result != 0 {
        unsafe {
            CVBufferRelease(pixel_buffer);
        }
        return Err(format!(
            "CVPixelBufferLockBaseAddress failed with status {}",
            lock_result
        ));
    }

    let draw_result = (|| {
        let base_address = unsafe { CVPixelBufferGetBaseAddress(pixel_buffer) };
        if base_address.is_null() {
            return Err("CVPixelBuffer base address was null".to_string());
        }
        let bytes_per_row = unsafe { CVPixelBufferGetBytesPerRow(pixel_buffer) };
        let color_space =
            CGColorSpace::new_device_rgb().ok_or("CGColorSpace::new_device_rgb returned nil")?;
        let bitmap_info =
            CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
        let context = unsafe {
            CGBitmapContextCreate(
                base_address,
                frame_size.width,
                frame_size.height,
                8,
                bytes_per_row,
                Some(color_space.as_ref()),
                bitmap_info,
            )
        }
        .ok_or("CGBitmapContextCreate returned nil")?;
        CGContext::draw_image(
            Some(context.as_ref()),
            CGRect::new(
                CGPoint::new(0.0, 0.0),
                CGSize::new(frame_size.width as f64, frame_size.height as f64),
            ),
            Some(image),
        );
        // Draw progress bar overlay + segment dots
        if let Some(ov) = overlay {
            let cg_y = frame_size.height.saturating_sub(ov.y + ov.h);
            // Fill bar
            if ov.fill_w > 0 {
                CGContext::set_rgb_fill_color(Some(context.as_ref()), ov.r, ov.g, ov.b, 0.9);
                CGContext::fill_rect(
                    Some(context.as_ref()),
                    CGRect::new(
                        CGPoint::new(ov.x as f64, cg_y as f64),
                        CGSize::new(ov.fill_w as f64, ov.h as f64),
                    ),
                );
            }
            // Segment dividers (thin vertical bars, same height as progress bar)
            let div_w = 2.0_f64.max(ov.h as f64 * 0.4);
            CGContext::set_rgb_fill_color(Some(context.as_ref()), 1.0, 1.0, 1.0, 0.7);
            for &ratio in ov.dots {
                let div_x = ov.x as f64 + ov.max_w as f64 * ratio - div_w / 2.0;
                CGContext::fill_rect(
                    Some(context.as_ref()),
                    CGRect::new(
                        CGPoint::new(div_x, cg_y as f64),
                        CGSize::new(div_w, ov.h as f64),
                    ),
                );
            }
        }
        Ok(())
    })();

    let unlock_result = unsafe { CVPixelBufferUnlockBaseAddress(pixel_buffer, 0) };
    if unlock_result != 0 {
        unsafe {
            CVBufferRelease(pixel_buffer);
        }
        return Err(format!(
            "CVPixelBufferUnlockBaseAddress failed with status {}",
            unlock_result
        ));
    }

    if let Err(err) = draw_result {
        unsafe {
            CVBufferRelease(pixel_buffer);
        }
        return Err(err);
    }

    Ok(pixel_buffer)
}

fn frame_time(frame_index: usize, fps: usize) -> Result<CMTime, String> {
    let timescale = i32::try_from(fps).map_err(|_| format!("fps {fps} does not fit in i32"))?;
    Ok(unsafe { CMTime::new(frame_index as i64, timescale) })
}

fn mux_audio_track(
    video_path: &Path,
    audio_path: Option<&Path>,
    duration_sec: f64,
    output_path: &Path,
) -> Result<(), String> {
    let mut args = vec![
        "-y".to_string(),
        "-i".into(),
        video_path.as_os_str().to_string_lossy().into_owned(),
    ];

    if let Some(audio_path) = audio_path.filter(|path| path.exists()) {
        args.push("-i".into());
        args.push(audio_path.as_os_str().to_string_lossy().into_owned());
    } else {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            format!("anullsrc=r=48000:cl=stereo:d={duration_sec:.3}"),
        ]);
    }

    args.extend([
        "-c:v".into(),
        "copy".into(),
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "192k".into(),
        "-shortest".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.as_os_str().to_string_lossy().into_owned(),
    ]);

    let output = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|err| {
            format!(
                "failed to start ffmpeg audio mux for {}: {err}",
                output_path.display()
            )
        })?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "ffmpeg audio mux failed for {}: {}",
        output_path.display(),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn pixel_buffer_attributes(frame_size: FrameSize) -> Retained<NSDictionary<NSString, NSObject>> {
    let pixel_format_value =
        NSNumber::numberWithUnsignedInteger(K_CV_PIXEL_FORMAT_TYPE_32_BGRA as usize);
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

fn video_output_settings(
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

fn lookup_class(name: &'static std::ffi::CStr) -> Result<&'static AnyClass, String> {
    AnyClass::get(name)
        .ok_or_else(|| format!("Objective-C class not found: {}", name.to_string_lossy()))
}

fn nsurl_from_path(path: &Path) -> Retained<NSURL> {
    NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()))
}

fn writer_error_string(writer: &AnyObject, context: &str) -> String {
    let error: *mut NSError = unsafe { msg_send![writer, error] };
    ns_error_ptr_to_string(error, context)
}

fn ns_error_ptr_to_string(error: *mut NSError, context: &str) -> String {
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

fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &date);
}
