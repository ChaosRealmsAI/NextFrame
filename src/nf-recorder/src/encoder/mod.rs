//! Video encoding helpers backed by `AVAssetWriter` and VideoToolbox-friendly pixel buffers.

mod config;
mod ffmpeg;
mod pipeline;
mod pixel_buffer;

use std::ffi::c_void;
use std::fs;
use std::path::{Path, PathBuf};

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_core_graphics::CGImage;
use objc2_foundation::NSString;

use crate::progress::ProgressOverlay;

use ffmpeg::mux_audio_track;
pub use ffmpeg::{concat_segments, probe_audio_duration};
use pixel_buffer::create_pixel_buffer_from_cgimage;

const K_CV_PIXEL_FORMAT_TYPE_32_BGRA: u32 = 0x4247_5241;
type CVReturn = i32;
type CVPixelBufferRef = *mut c_void;
type CFAllocatorRef = *const c_void;
type CFDictionaryRef = *const c_void;

#[link(name = "AVFoundation", kind = "framework")]
// SAFETY: This empty extern block only requests the linker to link AVFoundation.
unsafe extern "C" {} // SAFETY: This empty extern block only requests the linker to link AVFoundation.

#[link(name = "CoreMedia", kind = "framework")]
// SAFETY: This empty extern block only requests the linker to link CoreMedia.
unsafe extern "C" {} // SAFETY: This empty extern block only requests the linker to link CoreMedia.

#[link(name = "CoreVideo", kind = "framework")]
// SAFETY: This empty extern block only requests the linker to link CoreVideo.
unsafe extern "C" {} // SAFETY: This empty extern block only requests the linker to link CoreVideo.

// SAFETY: These imported framework symbols use Apple's declared signatures and stay valid for the linked process lifetime.
unsafe extern "C" {
    // SAFETY: These imported framework symbols use Apple's declared signatures and stay valid while linked.
    // SAFETY: These imported framework symbols use Apple's declared signatures and stay valid while linked.
    // SAFETY: These imported framework symbols use Apple's declared signatures and stay valid while linked.
    // SAFETY: These imported framework symbols use Apple's declared signatures and stay valid while linked.
    static AVFileTypeMPEG4: &'static NSString;
    static AVMediaTypeVideo: &'static NSString;

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

#[derive(Clone, Copy)]
pub(super) struct FrameSize {
    pub(super) width: usize,
    pub(super) height: usize,
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

    /// Appends a CGImage upscaled to the given output size.
    /// Used when render_scale < 1.0 — the CGImage is smaller than the output.
    pub fn write_cgimage_scaled(
        &mut self,
        image: &CGImage,
        output_width: usize,
        output_height: usize,
        overlay: Option<ProgressOverlay<'_>>,
    ) -> Result<(), String> {
        if self.writer.is_none() {
            self.init_writer(FrameSize {
                width: output_width,
                height: output_height,
            })?;
        }
        let pixel_buffer = pixel_buffer::create_pixel_buffer_from_cgimage_scaled(
            image,
            FrameSize {
                width: output_width,
                height: output_height,
            },
            overlay,
        )?;
        self.append_pixel_buffer(pixel_buffer)
    }
}

pub fn mux_audio(
    video_path: &Path,
    audio_path: Option<&Path>,
    duration_sec: f64,
    output_path: &Path,
) -> Result<(), String> {
    mux_audio_track(video_path, audio_path, duration_sec, output_path)
}

/// Returns the only supported encoder backend.
pub fn detect_backend() -> EncoderBackend {
    EncoderBackend::VideoToolbox
}
