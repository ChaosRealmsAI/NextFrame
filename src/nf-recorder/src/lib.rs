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
    pub bundle_html: PathBuf,
    pub output_mp4: PathBuf,
    pub width: u32,
    pub height: u32,
    pub duration_sec: f64,
    pub hdr10: bool,
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
            bundle_html: PathBuf::new(),
            output_mp4: PathBuf::from("out.mp4"),
            width: 1280,
            height: 720,
            duration_sec: 1.0,
            hdr10: true,
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
    pub id: String,
}

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub struct StubRecorder {
    inner: PipelineRecorder,
}

impl StubRecorder {
    pub fn new() -> Self {
        Self {
            inner: PipelineRecorder::new(),
        }
    }
}

impl Default for StubRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl Recorder for StubRecorder {
    fn record(&mut self, spec: RecordSpec) -> anyhow::Result<RecordHandle> {
        self.inner.record(spec)
    }

    fn progress(&self) -> Progress {
        self.inner.progress()
    }

    fn cancel(&mut self) {
        self.inner.cancel();
    }
}
