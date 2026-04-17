#![doc = "nf-recorder — hidden WKWebView → SCStream → IOSurface → Metal → VT HEVC Main 10 HDR10 → fMP4."]

pub mod bindings;
pub mod capture;
pub mod compositor;
pub mod encoder;
pub mod frame_pool;
pub mod io_surface_alias;
pub mod muxer;
pub mod pattern;
pub mod progress;
pub mod recorder;
pub mod sei_injector;
pub mod worker;

use std::path::PathBuf;

pub use progress::ProgressState;
pub use recorder::PipelineRecorder;

pub trait Recorder {
    fn record(&mut self, spec: RecordSpec) -> anyhow::Result<RecordHandle>;
    fn progress(&self) -> Progress;
    fn cancel(&mut self);
}

#[derive(Debug, Clone)]
pub struct RecordSpec {
    pub bundle_path: PathBuf,
    pub out_path: PathBuf,
    pub duration_s: f64,
    pub fps: u32,
    pub resolution: (u32, u32),
    pub worker_count: usize,
}

impl Default for RecordSpec {
    fn default() -> Self {
        Self {
            bundle_path: PathBuf::new(),
            out_path: PathBuf::from("out.mp4"),
            duration_s: 1.0,
            fps: 30,
            resolution: (1280, 720),
            worker_count: 6,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
pub struct Progress {
    pub frames_done: u64,
    pub total: u64,
    pub fps_observed: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecordHandle {
    pub out_path: PathBuf,
    pub total_frames: u64,
}

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
