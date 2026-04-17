//! nf-recorder — hidden WKWebView → IOSurface → Metal → VTCompressionSession HEVC HDR10 → fMP4.
//!
//! Walking skeleton: exposes the `Recorder` trait and module seams; no FFI yet.

pub mod capture;
pub mod compositor;
pub mod encoder;
pub mod frame_pool;
pub mod muxer;
pub mod sei_injector;
pub mod worker;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// High-level recorder contract. Real impl is a state machine over the whole pipeline.
pub trait Recorder {
    fn record(&mut self, spec: RecordSpec) -> anyhow::Result<RecordHandle>;
    fn progress(&self) -> Progress;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSpec {
    pub bundle_html: PathBuf,
    pub output_mp4: PathBuf,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration_sec: f64,
    pub hdr10: bool,
}

impl Default for RecordSpec {
    fn default() -> Self {
        Self {
            bundle_html: PathBuf::from("out/bundle.html"),
            output_mp4: PathBuf::from("out/out.mp4"),
            width: 3840,
            height: 2160,
            fps: 30,
            duration_sec: 0.0,
            hdr10: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordHandle {
    pub id: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Progress {
    pub frames_done: u64,
    pub total: u64,
}

pub struct StubRecorder {
    progress: Progress,
}

impl StubRecorder {
    pub fn new() -> Self {
        Self {
            progress: Progress::default(),
        }
    }
}

impl Default for StubRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl Recorder for StubRecorder {
    fn record(&mut self, _spec: RecordSpec) -> anyhow::Result<RecordHandle> {
        Err(anyhow::anyhow!("walking stub: recorder not implemented"))
    }

    fn progress(&self) -> Progress {
        self.progress
    }
}

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
