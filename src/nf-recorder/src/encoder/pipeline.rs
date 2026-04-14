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

impl SegmentEncoder {
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

        // SAFETY: `input` is a live `AVAssetWriterInput`, and finish only marks it complete once.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
            let _: () = msg_send![&*input, markAsFinished];
        }

        let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
        let writer_for_block = writer.clone();
        let finish = RcBlock::new(move || {
            // SAFETY: `writer_for_block` is a live `AVAssetWriter`, and `status` is a valid accessor here.
            let status: isize = unsafe { msg_send![&*writer_for_block, status] }; // SAFETY: see above.
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

        // SAFETY: `writer` and `finish` are live Objective-C objects for this completion registration.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
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
            return Err("snapshot produced an empty CGImage".into());
        }
        if !frame_size.width.is_multiple_of(2) || !frame_size.height.is_multiple_of(2) {
            return Err(format!(
                "snapshot size must be even for H.264, got {}x{}",
                frame_size.width, frame_size.height
            ));
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
        let writer: Option<Retained<AnyObject>> = unsafe { // SAFETY: see above.
            // SAFETY: see above.
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
        // SAFETY: `writer` is live, and this setter is valid before writing starts.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
            let _: () = msg_send![&*writer, setShouldOptimizeForNetworkUse: true];
        }

        // SAFETY: `writer` is live, and these settings are queried with the documented media type.
        let can_apply: bool = unsafe { // SAFETY: see above.
            // SAFETY: see above.
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

        // SAFETY: `input_class` and these arguments satisfy `AVAssetWriterInput`'s factory contract.
        let input: Option<Retained<AnyObject>> = unsafe { // SAFETY: see above.
            // SAFETY: see above.
            msg_send![
                input_class,
                assetWriterInputWithMediaType: AVMediaTypeVideo,
                outputSettings: Some(&*output_settings)
            ]
        };
        let Some(input) = input else {
            return Err("AVAssetWriterInput factory returned nil".into());
        };
        // SAFETY: `input` is live, and this setter is valid before the input is added to the writer.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
            let _: () = msg_send![&*input, setExpectsMediaDataInRealTime: false];
        }

        // SAFETY: `writer` and `input` are live, and `canAddInput:` only checks compatibility.
        let can_add: bool = unsafe { msg_send![&*writer, canAddInput: &*input] }; // SAFETY: see above.
        if !can_add {
            return Err("AVAssetWriter refused the video input".into());
        }
        // SAFETY: `writer` and `input` are live, and initialization adds the input at most once.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
            let _: () = msg_send![&*writer, addInput: &*input];
        }

        // SAFETY: `adaptor_class`, `input`, and `pb_attributes` satisfy the adaptor factory contract.
        let adaptor: Option<Retained<AnyObject>> = unsafe { // SAFETY: see above.
            // SAFETY: see above.
            msg_send![
                adaptor_class,
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput: &*input,
                sourcePixelBufferAttributes: Some(&*pb_attributes)
            ]
        };
        let Some(adaptor) = adaptor else {
            return Err("AVAssetWriterInputPixelBufferAdaptor factory returned nil".into());
        };

        // SAFETY: `writer` is configured and live, so `startWriting` is valid before any appends.
        let started: bool = unsafe { msg_send![&*writer, startWriting] }; // SAFETY: see above.
        if !started {
            return Err(writer_error_string(
                &writer,
                "AVAssetWriter startWriting failed",
            ));
        }
        // SAFETY: `writer` has started writing, and `kCMTimeZero` is the documented initial session time.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
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
        let input = self
            .input
            .as_ref()
            .ok_or_else(|| "writer input was not initialized".to_string())?;
        let deadline = Instant::now() + Duration::from_secs(10);
        while {
            // SAFETY: `input` is live, and `isReadyForMoreMediaData` is a side-effect-free query.
            let ready: bool = unsafe { msg_send![&**input, isReadyForMoreMediaData] }; // SAFETY: see above.
            !ready
        } {
            let writer = self
                .writer
                .as_ref()
                .ok_or_else(|| "writer was not initialized".to_string())?;
            // SAFETY: `writer` is live, and `status` is a valid accessor while waiting for readiness.
            let status: isize = unsafe { msg_send![&**writer, status] }; // SAFETY: see above.
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
        // SAFETY: `adaptor` is live, `pixel_buffer` stays valid through the call, and time is monotonic.
        let appended: bool = unsafe { // SAFETY: see above.
            // SAFETY: see above.
            msg_send![
                &**adaptor,
                appendPixelBuffer: pixel_buffer,
                withPresentationTime: presentation_time
            ]
        };
        // SAFETY: this function owns one retain on `pixel_buffer`, so releasing it once is correct.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
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
