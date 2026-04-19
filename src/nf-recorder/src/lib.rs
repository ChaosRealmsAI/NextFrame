#![deny(unsafe_op_in_unsafe_fn)]

pub mod pipeline;
pub mod frame_pool;   // T-09 填
pub mod record_loop;  // T-09 填
pub mod events;       // T-10 填
pub mod cli;          // T-10 填
pub mod snapshot;     // T-18 · product-internal single-frame PNG
pub mod verify_mp4;   // T-17 · product-internal MP4 atom verifier
pub mod orchestrator; // v1.15 · 并行录制父进程 · spawn N 子 + ffmpeg concat
pub mod export_api;   // v1.44 · high-level lib API · 从 source.json 直接导出 MP4

pub use pipeline::{RecordPipeline, RecordOpts, OutputStats, ColorSpec, PipelineError};
pub use export_api::{run_export_from_source, ExportOpts};
