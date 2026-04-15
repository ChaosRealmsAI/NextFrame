//! encoder encoding pipeline
use std::fs;
use std::ptr;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_core_graphics::CGImage;
use objc2_core_media::kCMTimeZero;
use objc2_foundation::NSError;

use super::config::{
    lookup_class, ns_error_ptr_to_string, nsurl_from_path, pixel_buffer_attributes,
    pump_main_run_loop, video_output_settings, writer_error_string,
};
use super::ffmpeg::mux_audio_track;
use super::pixel_buffer::frame_time;
use super::{
    AVFileTypeMPEG4, AVMediaTypeVideo, CVBufferRelease, CVPixelBufferRef, FrameSize, SegmentEncoder,
};
use crate::error_with_fix;

impl SegmentEncoder {
    /// Finalizes the writer and muxes the optional audio track into the output segment.
    pub fn finish(self) -> Result<(), String> {
        if self.frame_count == 0 {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "finish the encoded segment",
                    "no video frames were appended",
                    "Record at least one frame before finishing the segment.",
                ),
            );
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
        let writer = writer.ok_or_else(|| {
            error_with_fix(
                "finish the encoded segment",
                "the asset writer was not initialized",
                "Initialize the writer by appending a frame before finishing the segment.",
            )
        })?;
        let input = input.ok_or_else(|| {
            error_with_fix(
                "finish the encoded segment",
                "the asset writer input was not initialized",
                "Initialize the writer by appending a frame before finishing the segment.",
            )
        })?;

        // SAFETY: `input` is a live `AVAssetWriterInput`, and finish only marks it complete once.
        unsafe { // SAFETY: `input` is a live `AVAssetWriterInput`, and finish only marks it complete once.
            // SAFETY: `input` is a live `AVAssetWriterInput`, and finish only marks it complete once.
            // SAFETY: `input` is a live `AVAssetWriterInput`, and finish only marks it complete once.
            // SAFETY: `input` is a live `AVAssetWriterInput`, and finish only marks it complete once.
            let _: () = msg_send![&*input, markAsFinished];
        }

        let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
        let writer_for_block = writer.clone();
        let finish = RcBlock::new(move || {
            // SAFETY: `writer_for_block` is a live `AVAssetWriter`, and `status` is a valid accessor here.
            let status: isize = unsafe { msg_send![&*writer_for_block, status] }; // SAFETY: `writer_for_block` is a live `AVAssetWriter`, and `status` is a valid accessor here.
            let result = if status == 2 {
                Ok(())
            } else {
                Err(
                    /* Internal: AVFoundation writer failure formatted below */
                    writer_error_string(
                        &writer_for_block,
                        "finish the encoded segment",
                        "Inspect the AVAssetWriter error details and retry the recording job.",
                    ),
                )
            };
            let _ = done_tx.send(result);
        });

        // SAFETY: `writer` and `finish` are live Objective-C objects for this completion registration.
        unsafe { // SAFETY: `writer` and `finish` are live Objective-C objects for this completion registration.
            // SAFETY: `writer` and `finish` are live Objective-C objects for this completion registration.
            // SAFETY: `writer` and `finish` are live Objective-C objects for this completion registration.
            // SAFETY: `writer` and `finish` are live Objective-C objects for this completion registration.
            let _: () = msg_send![&*writer, finishWritingWithCompletionHandler: &*finish];
        }

        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            match done_rx.recv_timeout(Duration::from_millis(20)) {
                Ok(Ok(())) => break,
                Ok(Err(err)) /* Fix: propagate the worker error below */ => return Err(err),
                Err(mpsc::RecvTimeoutError::Timeout) /* Internal: completion wait is still in progress */ => {
                    if Instant::now() >= deadline {
                        return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                            "finish the encoded segment",
                            "AVAssetWriter did not finish within 30 seconds",
                            "Reduce output size or retry after system load drops.",
                        ));
                    }
                    pump_main_run_loop(Duration::from_millis(10));
                }
                Err(mpsc::RecvTimeoutError::Disconnected) /* Internal: completion channel ended unexpectedly */ => {
                    return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                        "finish the encoded segment",
                        "the AVAssetWriter completion channel disconnected unexpectedly",
                        "Retry the recording job after ensuring the process remains stable.",
                    ));
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
            trace_log!(
                "  warn leaving video-only segment at {} after mux failure ({})",
                video_path.display(),
                backend.label()
            );
        }
        mux_result
    }

    pub(super) fn ensure_writer(&mut self, cg_image: &CGImage) -> Result<(), String> {
        if self.writer.is_some() {
            return Ok(());
        }

        let frame_size = FrameSize {
            width: CGImage::width(Some(cg_image)),
            height: CGImage::height(Some(cg_image)),
        };
        if frame_size.width == 0 || frame_size.height == 0 {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "initialize the video writer",
                    "the captured frame image was empty",
                    "Retry after the page finishes rendering and the capture size is non-zero.",
                ),
            );
        }
        if !frame_size.width.is_multiple_of(2) || !frame_size.height.is_multiple_of(2) {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "initialize the video writer",
                    format!(
                        "the captured frame size {}x{} is not even",
                        frame_size.width, frame_size.height
                    ),
                    "Use even pixel dimensions for H.264 output.",
                ),
            );
        }
        self.init_writer(frame_size)
    }

    pub(super) fn init_writer(&mut self, frame_size: FrameSize) -> Result<(), String> {
        if self.writer.is_some() {
            return Ok(());
        }

        let writer_class = lookup_class(c"AVAssetWriter")?;
        let input_class = lookup_class(c"AVAssetWriterInput")?;
        let adaptor_class = lookup_class(c"AVAssetWriterInputPixelBufferAdaptor")?;
        let output_settings = video_output_settings(frame_size, self.fps, self.crf);
        let pb_attributes = pixel_buffer_attributes(frame_size);
        let output_url = nsurl_from_path(&self.video_path);

        let mut error: *mut NSError = ptr::null_mut();
        // SAFETY: `writer_class`, `output_url`, and `error` satisfy `AVAssetWriter`'s factory contract.
        let writer: Option<Retained<AnyObject>> = unsafe { // SAFETY: `writer_class`, `output_url`, and `error` satisfy `AVAssetWriter`'s factory contract.
            // SAFETY: `writer_class`, `output_url`, and `error` satisfy `AVAssetWriter`'s factory contract.
            // SAFETY: `writer_class`, `output_url`, and `error` satisfy `AVAssetWriter`'s factory contract.
            // SAFETY: `writer_class`, `output_url`, and `error` satisfy `AVAssetWriter`'s factory contract.
            msg_send![
                writer_class,
                assetWriterWithURL: &*output_url,
                fileType: AVFileTypeMPEG4,
                error: &mut error
            ]
        };
        let Some(writer) = writer else {
            return Err(
                /* Internal: Apple framework failure formatted below */
                ns_error_ptr_to_string(
                    error,
                    "initialize AVAssetWriter",
                    "Check the output path and codec availability, then retry the recording job.",
                ),
            );
        };
        // SAFETY: `writer` is live, and this setter is valid before writing starts.
        unsafe { // SAFETY: `writer` is live, and this setter is valid before writing starts.
            // SAFETY: `writer` is live, and this setter is valid before writing starts.
            // SAFETY: `writer` is live, and this setter is valid before writing starts.
            // SAFETY: `writer` is live, and this setter is valid before writing starts.
            let _: () = msg_send![&*writer, setShouldOptimizeForNetworkUse: true];
        }

        // SAFETY: `writer` is live, and these settings are queried with the documented media type.
        let can_apply: bool = unsafe { // SAFETY: `writer` is live, and these settings are queried with the documented media type.
            // SAFETY: `writer` is live, and these settings are queried with the documented media type.
            // SAFETY: `writer` is live, and these settings are queried with the documented media type.
            // SAFETY: `writer` is live, and these settings are queried with the documented media type.
            msg_send![
                &*writer,
                canApplyOutputSettings: Some(&*output_settings),
                forMediaType: AVMediaTypeVideo
            ]
        };
        if !can_apply {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "configure AVAssetWriter output settings",
                    format!(
                        "AVAssetWriter rejected output settings for {}x{}",
                        frame_size.width, frame_size.height
                    ),
                    "Use a supported output size, fps, and codec combination.",
                ),
            );
        }

        // SAFETY: `input_class` and these arguments satisfy `AVAssetWriterInput`'s factory contract.
        let input: Option<Retained<AnyObject>> = unsafe { // SAFETY: `input_class` and these arguments satisfy `AVAssetWriterInput`'s factory contract.
            // SAFETY: `input_class` and these arguments satisfy `AVAssetWriterInput`'s factory contract.
            // SAFETY: `input_class` and these arguments satisfy `AVAssetWriterInput`'s factory contract.
            // SAFETY: `input_class` and these arguments satisfy `AVAssetWriterInput`'s factory contract.
            msg_send![
                input_class,
                assetWriterInputWithMediaType: AVMediaTypeVideo,
                outputSettings: Some(&*output_settings)
            ]
        };
        let Some(input) = input else {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "create AVAssetWriterInput",
                    "AVAssetWriterInput returned nil",
                    "Retry after ensuring AVFoundation video encoding is available.",
                ),
            );
        };
        // SAFETY: `input` is live, and this setter is valid before the input is added to the writer.
        unsafe { // SAFETY: `input` is live, and this setter is valid before the input is added to the writer.
            // SAFETY: `input` is live, and this setter is valid before the input is added to the writer.
            // SAFETY: `input` is live, and this setter is valid before the input is added to the writer.
            // SAFETY: `input` is live, and this setter is valid before the input is added to the writer.
            let _: () = msg_send![&*input, setExpectsMediaDataInRealTime: false];
        }

        // SAFETY: `writer` and `input` are live, and `canAddInput:` only checks compatibility.
        let can_add: bool = unsafe { msg_send![&*writer, canAddInput: &*input] }; // SAFETY: `writer` and `input` are live, and `canAddInput:` only checks compatibility.
        if !can_add {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "attach the video input to AVAssetWriter",
                    "AVAssetWriter rejected the video input",
                    "Retry with supported output settings and codec configuration.",
                ),
            );
        }
        // SAFETY: `writer` and `input` are live, and initialization adds the input at most once.
        unsafe { // SAFETY: `writer` and `input` are live, and initialization adds the input at most once.
            // SAFETY: `writer` and `input` are live, and initialization adds the input at most once.
            // SAFETY: `writer` and `input` are live, and initialization adds the input at most once.
            // SAFETY: `writer` and `input` are live, and initialization adds the input at most once.
            let _: () = msg_send![&*writer, addInput: &*input];
        }

        // SAFETY: `adaptor_class`, `input`, and `pb_attributes` satisfy the adaptor factory contract.
        let adaptor: Option<Retained<AnyObject>> = unsafe { // SAFETY: `adaptor_class`, `input`, and `pb_attributes` satisfy the adaptor factory contract.
            // SAFETY: `adaptor_class`, `input`, and `pb_attributes` satisfy the adaptor factory contract.
            // SAFETY: `adaptor_class`, `input`, and `pb_attributes` satisfy the adaptor factory contract.
            // SAFETY: `adaptor_class`, `input`, and `pb_attributes` satisfy the adaptor factory contract.
            msg_send![
                adaptor_class,
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput: &*input,
                sourcePixelBufferAttributes: Some(&*pb_attributes)
            ]
        };
        let Some(adaptor) = adaptor else {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "create AVAssetWriterInputPixelBufferAdaptor",
                    "the pixel buffer adaptor returned nil",
                    "Retry after ensuring AVFoundation video encoding is available.",
                ),
            );
        };

        // SAFETY: `writer` is configured and live, so `startWriting` is valid before any appends.
        let started: bool = unsafe { msg_send![&*writer, startWriting] }; // SAFETY: `writer` is configured and live, so `startWriting` is valid before any appends.
        if !started {
            return Err(
                /* Internal: AVFoundation writer failure propagated below */
                writer_error_string(
                    &writer,
                    "start AVAssetWriter",
                    "Check the output path and codec availability, then retry the recording job.",
                ),
            );
        }
        // SAFETY: `writer` has started writing, and `kCMTimeZero` is the documented initial session time.
        unsafe { // SAFETY: `writer` has started writing, and `kCMTimeZero` is the documented initial session time.
            // SAFETY: `writer` has started writing, and `kCMTimeZero` is the documented initial session time.
            // SAFETY: `writer` has started writing, and `kCMTimeZero` is the documented initial session time.
            // SAFETY: `writer` has started writing, and `kCMTimeZero` is the documented initial session time.
            let _: () = msg_send![&*writer, startSessionAtSourceTime: kCMTimeZero];
        }

        self.writer = Some(writer);
        self.input = Some(input);
        self.adaptor = Some(adaptor);
        Ok(())
    }

    pub(super) fn append_pixel_buffer(
        &mut self,
        pixel_buffer: CVPixelBufferRef,
    ) -> Result<(), String> {
        let input = self.input.as_ref().ok_or_else(|| {
            error_with_fix(
                "append the captured frame",
                "the writer input was not initialized",
                "Initialize the writer by calling `ensure_writer` before appending frames.",
            )
        })?;
        let deadline = Instant::now() + Duration::from_secs(10);
        while {
            // SAFETY: `input` is live, and `isReadyForMoreMediaData` is a side-effect-free query.
            let ready: bool = unsafe { msg_send![&**input, isReadyForMoreMediaData] }; // SAFETY: `input` is live, and `isReadyForMoreMediaData` is a side-effect-free query.
            !ready
        } {
            let writer = self.writer.as_ref().ok_or_else(|| {
                error_with_fix(
                    "append the captured frame",
                    "the asset writer was not initialized",
                    "Initialize the writer by calling `ensure_writer` before appending frames.",
                )
            })?;
            // SAFETY: `writer` is live, and `status` is a valid accessor while waiting for readiness.
            let status: isize = unsafe { msg_send![&**writer, status] }; // SAFETY: `writer` is live, and `status` is a valid accessor while waiting for readiness.
            if status != 1 {
                return Err(
                    /* Fix: user-facing error formatted below */
                    error_with_fix(
                        "append the captured frame",
                        format!(
                            "AVAssetWriter entered a failed state while waiting for input (status={status})"
                        ),
                        "Inspect the AVAssetWriter error details and retry the recording job.",
                    ),
                );
            }
            if Instant::now() >= deadline {
                return Err(
                    /* Fix: user-facing error formatted below */
                    error_with_fix(
                        "append the captured frame",
                        "AVAssetWriter was not ready for more data after 10 seconds",
                        "Reduce output size or retry after system load drops.",
                    ),
                );
            }
            pump_main_run_loop(Duration::from_millis(1));
        }

        let adaptor = self.adaptor.as_ref().ok_or_else(|| {
            error_with_fix(
                "append the captured frame",
                "the pixel buffer adaptor was not initialized",
                "Initialize the writer by calling `ensure_writer` before appending frames.",
            )
        })?;
        let presentation_time = frame_time(self.frame_count, self.fps)?;
        // SAFETY: `adaptor` is live, `pixel_buffer` stays valid through the call, and time is monotonic.
        let appended: bool = unsafe { // SAFETY: `adaptor` is live, `pixel_buffer` stays valid through the call, and time is monotonic.
            // SAFETY: `adaptor` is live, `pixel_buffer` stays valid through the call, and time is monotonic.
            // SAFETY: `adaptor` is live, `pixel_buffer` stays valid through the call, and time is monotonic.
            // SAFETY: `adaptor` is live, `pixel_buffer` stays valid through the call, and time is monotonic.
            msg_send![
                &**adaptor,
                appendPixelBuffer: pixel_buffer,
                withPresentationTime: presentation_time
            ]
        };
        // SAFETY: this function owns one retain on `pixel_buffer`, so releasing it once is correct.
        unsafe { // SAFETY: this function owns one retain on `pixel_buffer`, so releasing it once is correct.
            // SAFETY: this function owns one retain on `pixel_buffer`, so releasing it once is correct.
            // SAFETY: this function owns one retain on `pixel_buffer`, so releasing it once is correct.
            // SAFETY: this function owns one retain on `pixel_buffer`, so releasing it once is correct.
            CVBufferRelease(pixel_buffer);
        }
        if !appended {
            let writer = self.writer.as_ref().ok_or_else(|| {
                error_with_fix(
                    "append the captured frame",
                    "the asset writer disappeared after append failure",
                    "Retry the recording job after ensuring the encoder stays initialized.",
                )
            })?;
            return Err(
                /* Internal: AVFoundation writer failure propagated below */
                writer_error_string(
                    writer,
                    "append the captured frame",
                    "Inspect the AVAssetWriter error details and retry the recording job.",
                ),
            );
        }

        self.frame_count += 1;
        Ok(())
    }
}
