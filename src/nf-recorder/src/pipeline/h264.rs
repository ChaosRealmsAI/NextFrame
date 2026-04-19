//! `PipelineH264_1080p` · v1.14 T-07 + T-8.5 integration
//!
//! `RecordPipeline` impl #1: H.264 AVC Main AutoLevel · 1080p @ 30/60 · BT.709 SDR.
//! Built on `VtCompressor` (this crate's `vt_wrap`) for the encoder and
//! `Mp4Writer` (T-08) for the AVAssetWriter-backed MP4 mux.
//!
//! ## Pipeline
//! `IOSurfaceHandle` (from `nf-shell-mac::MacHeadlessShell::snapshot`)
//!   → `as_cv_pixel_buffer()` (zero-copy wrap)
//!   → `VtCompressor::encode_pixel_buffer` (H.264 AVCC bytes)
//!   → `Mp4Writer::append` (AVAssetWriterInput passthrough · moov-front fragmented MP4)
//!
//! The `Mp4Writer` is **lazy-initialized** on first `push_frame` so we can use
//! the first `CompressedFrame::format_description` as `sourceFormatHint`
//! (AVAssetWriterInput requires a format description at creation time and
//! passthrough mode needs the actual H.264 avcC box — which only the encoder
//! can produce).

use nf_shell_mac::IOSurfaceHandle;

use super::mp4_writer::Mp4Writer;
use super::vt_wrap::VtCompressor;
use super::{ColorSpec, OutputStats, PipelineError, RecordOpts, RecordPipeline};

/// v1.14 H.264 1080p pipeline.
pub struct PipelineH264_1080p {
    compressor: VtCompressor,
    opts: RecordOpts,
    /// Lazy-init: created on first `push_frame` using the first encoded frame's
    /// `format_description` as `sourceFormatHint` (required for passthrough mode).
    writer: Option<Mp4Writer>,
    /// Monotonic push counter used to derive OutputStats.frames and bound pts_ms.
    frames_pushed: u64,
    first_pts_ms: Option<u64>,
    last_pts_ms: u64,
}

// SAFETY: AVAssetWriter / AVAssetWriterInput / CMFormatDescription are CF / ObjC
// reference-counted objects with thread-safe retain/release. The pipeline is
// driven by a single recorder thread in v1.14 (trait doc contract); we never
// concurrently mutate these objects from multiple threads. The Send bound on
// RecordPipeline is what the trait asks for; the auto-traits trip because
// objc2 types carry PhantomData<*const UnsafeCell<()>> to stay conservative.
#[allow(unsafe_code)]
unsafe impl Send for PipelineH264_1080p {}

impl RecordPipeline for PipelineH264_1080p {
    fn new(opts: RecordOpts) -> Result<Self, PipelineError> {
        if !matches!(opts.color, ColorSpec::BT709_SDR_8bit) {
            return Err(PipelineError::EncoderInitFailed);
        }
        let compressor = VtCompressor::new(
            opts.width,
            opts.height,
            opts.fps,
            opts.bitrate_bps,
            opts.color,
        )?;

        // Writer is lazy-initialized in `push_frame` — passthrough mode requires
        // the first `CompressedFrame::format_description` as `sourceFormatHint`.

        Ok(Self {
            compressor,
            opts,
            writer: None,
            frames_pushed: 0,
            first_pts_ms: None,
            last_pts_ms: 0,
        })
    }

    fn push_frame(
        &mut self,
        surface: IOSurfaceHandle,
        pts_ms: u64,
    ) -> Result<(), PipelineError> {
        // 1. IOSurface → CVPixelBuffer (zero-copy · CVPixelBufferCreateWithIOSurface).
        let pixel_buffer = surface
            .as_cv_pixel_buffer()
            .map_err(|e| PipelineError::IoError(format!("{e}")))?;

        // 2. VT compressor enqueues frame · output arrives asynchronously via callback.
        //    v1.15 · force IDR on the very first frame of this pipeline instance · so each
        //    segment MP4 (including parallel subprocess segments) starts with a keyframe ·
        //    enabling `ffmpeg -f concat -c copy` without re-encoding at merge time.
        let force_keyframe = self.frames_pushed == 0;
        self.compressor
            .encode_pixel_buffer(&pixel_buffer, pts_ms, force_keyframe)?;

        // 3. Drain any completed frames from the encoder output queue into the writer.
        // On the very first frame the Mp4Writer is created using the format_description
        // carried by the CompressedFrame (AVAssetWriterInput passthrough requires it).
        while let Some(cf) = self.compressor.poll_output() {
            if self.writer.is_none() {
                self.writer = Some(Mp4Writer::new(
                    &self.opts.output,
                    self.opts.width,
                    self.opts.height,
                    self.opts.fps,
                )?);
            }
            if let Some(w) = self.writer.as_mut() {
                w.append(&cf)?;
            }
        }

        if self.first_pts_ms.is_none() {
            self.first_pts_ms = Some(pts_ms);
        }
        self.last_pts_ms = pts_ms;
        self.frames_pushed += 1;
        Ok(())
    }

    fn finish(mut self) -> Result<OutputStats, PipelineError> {
        // Flush the encoder · VT blocks until all pending frames emerge from the callback.
        self.compressor.finalize()?;

        // Drain the tail of the output queue into the writer. If no frames were
        // ever pushed, writer stays None and we surface an error (empty MP4 is
        // not a valid deliverable).
        while let Some(cf) = self.compressor.poll_output() {
            if self.writer.is_none() {
                self.writer = Some(Mp4Writer::new(
                    &self.opts.output,
                    self.opts.width,
                    self.opts.height,
                    self.opts.fps,
                )?);
            }
            if let Some(w) = self.writer.as_mut() {
                w.append(&cf)?;
            }
        }

        let writer = self
            .writer
            .take()
            .ok_or(PipelineError::WriterSessionFailed)?;
        writer.close()
    }
}

impl PipelineH264_1080p {
    /// Expose the underlying compressor for crate-internal tests (e.g. VP-2
    /// record-mode smoke) that drive encode directly against synthetic pixel buffers.
    #[doc(hidden)]
    pub fn compressor(&self) -> &VtCompressor {
        &self.compressor
    }
}
