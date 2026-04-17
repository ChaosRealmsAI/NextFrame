use std::fs;
use std::path::Path;

use anyhow::{Context, Result, anyhow, bail};

use crate::capture::sample_pixel_buffer;
use crate::compositor::MetalCompositor;
use crate::encoder::Encoder;
use crate::muxer::FragmentedMp4Writer;
use crate::progress::ProgressState;
use crate::worker::Worker;
use crate::{Progress, RecordHandle, RecordSpec, Recorder};

type ProgressSink = dyn Fn(Progress) -> Result<()> + Send + Sync + 'static;

pub struct PipelineRecorder {
    progress: ProgressState,
    progress_sink: Option<Box<ProgressSink>>,
}

impl Default for PipelineRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineRecorder {
    pub fn new() -> Self {
        Self {
            progress: ProgressState::new(0),
            progress_sink: None,
        }
    }

    pub fn with_progress_sink<F>(mut self, sink: F) -> Self
    where
        F: Fn(Progress) -> Result<()> + Send + Sync + 'static,
    {
        self.progress_sink = Some(Box::new(sink));
        self
    }

    fn emit_progress(&self, progress: Progress) -> Result<()> {
        if let Some(sink) = self.progress_sink.as_ref() {
            sink(progress)?;
        }
        Ok(())
    }
}

impl Recorder for PipelineRecorder {
    fn record(&mut self, spec: RecordSpec) -> Result<RecordHandle> {
        validate_spec(&spec)?;
        ensure_parent_dir(&spec.out_path)?;

        let total_frames = frame_count(spec.duration_s, spec.fps)?;
        self.progress = ProgressState::new(total_frames);
        self.emit_progress(self.progress.snapshot())?;

        let width = spec.resolution.0 as usize;
        let height = spec.resolution.1 as usize;
        let worker_count = spec.worker_count.max(1);
        let mut workers = (0..worker_count)
            .map(|_| Worker::new(&spec.bundle_path, width, height, spec.fps))
            .collect::<Result<Vec<_>>>()?;

        let compositor = MetalCompositor::new(width, height)?;
        let mut encoder = Encoder::new(width, height, spec.fps)?;
        let mut muxer: Option<FragmentedMp4Writer> = None;

        for frame_index in 0..total_frames {
            if self.progress.is_cancelled() {
                bail!("record cancelled");
            }
            let worker_index = (frame_index as usize) % workers.len();
            let logical_t = frame_index as f64 / spec.fps as f64;
            let captured = workers[worker_index].capture_frame(frame_index + 1, logical_t)?;
            let source_pixel = sample_pixel_buffer(captured.sample.as_ref())?;
            let composited = compositor.composite(source_pixel)?;
            let encoded = encoder.encode_frame(frame_index as u32, composited.pixel_buffer())?;
            if muxer.is_none() {
                muxer = Some(FragmentedMp4Writer::new(
                    &spec.out_path,
                    width as u16,
                    height as u16,
                    spec.fps,
                    encoded.sample_entry.clone(),
                )?);
            }
            if let Some(muxer) = muxer.as_mut() {
                muxer.write_sample(&encoded)?;
            }
            self.emit_progress(self.progress.increment())?;
        }

        encoder.finish()?;
        if let Some(muxer) = muxer.as_mut() {
            muxer.finish()?;
        } else {
            return Err(anyhow!("encoder produced no samples"));
        }

        Ok(RecordHandle {
            out_path: spec.out_path,
            total_frames,
        })
    }

    fn progress(&self) -> Progress {
        self.progress.snapshot()
    }

    fn cancel(&mut self) {
        self.progress.cancel();
    }
}

fn validate_spec(spec: &RecordSpec) -> Result<()> {
    if spec.bundle_path.as_os_str().is_empty() {
        bail!("bundle_path must not be empty");
    }
    if !spec.bundle_path.is_file() {
        bail!("bundle_path does not exist: {}", spec.bundle_path.display());
    }
    if spec.fps == 0 {
        bail!("fps must be > 0");
    }
    if spec.resolution.0 == 0 || spec.resolution.1 == 0 {
        bail!("resolution must be > 0");
    }
    if spec.duration_s <= 0.0 {
        bail!("duration_s must be > 0");
    }
    Ok(())
}

fn frame_count(duration_s: f64, fps: u32) -> Result<u64> {
    let frames = (duration_s * fps as f64).round();
    if !(frames.is_finite() && frames > 0.0) {
        bail!("duration/fps produced an invalid frame count");
    }
    Ok(frames as u64)
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create output directory {}", parent.display()))?;
        }
    }
    Ok(())
}
