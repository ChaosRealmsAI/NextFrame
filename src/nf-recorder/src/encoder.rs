//! VTCompressionSession HEVC 10-bit HDR10 encoder seam.

use crate::worker::FrameRef;

#[derive(Debug, Clone, Copy)]
pub struct EncoderConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub hdr10: bool,
    pub bitrate_bps: u64,
}

pub trait VideoEncoder {
    fn start(&mut self, cfg: EncoderConfig) -> anyhow::Result<()>;
    fn push_frame(&mut self, frame: FrameRef, pts_ns: u64) -> anyhow::Result<()>;
    fn finish(&mut self) -> anyhow::Result<Vec<u8>>;
}

pub struct StubEncoder;

impl VideoEncoder for StubEncoder {
    fn start(&mut self, _cfg: EncoderConfig) -> anyhow::Result<()> {
        Ok(())
    }

    fn push_frame(&mut self, _frame: FrameRef, _pts_ns: u64) -> anyhow::Result<()> {
        Ok(())
    }

    fn finish(&mut self) -> anyhow::Result<Vec<u8>> {
        Ok(Vec::new())
    }
}
