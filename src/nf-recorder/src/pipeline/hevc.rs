//! v1.55 · HEVC Main 8-bit pipeline.
//!
//! Mirrors the existing H.264 path but swaps VideoToolbox to
//! `kCMVideoCodecType_HEVC` + `kVTProfileLevel_HEVC_Main_AutoLevel`.

use nf_shell_mac::IOSurfaceHandle;

use super::mp4_writer::Mp4Writer;
use super::vt_wrap::VtCompressor;
use super::{ColorSpec, OutputStats, PipelineError, RecordOpts, RecordPipeline, VideoCodec};

pub struct PipelineHevcMain {
    compressor: VtCompressor,
    opts: RecordOpts,
    writer: Option<Mp4Writer>,
    frames_pushed: u64,
}

#[allow(unsafe_code)]
unsafe impl Send for PipelineHevcMain {}

impl RecordPipeline for PipelineHevcMain {
    fn new(opts: RecordOpts) -> Result<Self, PipelineError> {
        if !matches!(opts.color, ColorSpec::BT709_SDR_8bit) {
            return Err(PipelineError::EncoderInitFailed);
        }
        if opts.codec != VideoCodec::HevcMain8 {
            return Err(PipelineError::EncoderInitFailed);
        }

        let compressor = VtCompressor::new_hevc_main(
            opts.width,
            opts.height,
            opts.fps,
            opts.bitrate_bps,
            opts.color,
        )?;

        Ok(Self {
            compressor,
            opts,
            writer: None,
            frames_pushed: 0,
        })
    }

    fn push_frame(
        &mut self,
        surface: IOSurfaceHandle,
        pts_ms: u64,
    ) -> Result<(), PipelineError> {
        let pixel_buffer = surface
            .as_cv_pixel_buffer()
            .map_err(|e| PipelineError::IoError(format!("{e}")))?;

        let force_keyframe = self.frames_pushed == 0 || self.frames_pushed % 60 == 0;
        self.compressor
            .encode_pixel_buffer_with_options(&pixel_buffer, pts_ms, force_keyframe)?;

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

        self.frames_pushed += 1;
        Ok(())
    }

    fn finish(mut self) -> Result<OutputStats, PipelineError> {
        self.compressor.finalize()?;

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
