use std::path::PathBuf;
use nf_shell_mac::IOSurfaceHandle;

pub mod h264;       // T-07 填
pub mod vt_wrap;    // T-07 填
pub mod mp4_writer; // T-08 填

pub trait RecordPipeline: Send {
    fn new(opts: RecordOpts) -> Result<Self, PipelineError> where Self: Sized;
    fn push_frame(&mut self, surface: IOSurfaceHandle, pts_ms: u64) -> Result<(), PipelineError>;
    fn finish(self) -> Result<OutputStats, PipelineError>;
}

#[derive(Debug, Clone)]
pub struct RecordOpts {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_bps: u32,
    pub output: PathBuf,
    pub color: ColorSpec,
}

#[derive(Debug, Clone, Copy)]
#[allow(non_camel_case_types)]
pub enum ColorSpec {
    BT709_SDR_8bit,
    BT2020_HDR10_10bit,
}

#[derive(Debug, Clone)]
pub struct OutputStats {
    pub frames: u64,
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub moov_front: bool,
    pub path: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("encoder init failed")]
    EncoderInitFailed,
    #[error("writer session failed")]
    WriterSessionFailed,
    #[error("frame out of order")]
    FrameOutOfOrder,
    #[error("timeout")]
    Timeout,
    #[error("io error: {0}")]
    IoError(String),
}
