use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use crossbeam::channel;
use crossbeam::queue::ArrayQueue;
use objc2_core_foundation::CFRetained;
use objc2_core_video::CVPixelBuffer;

use crate::capture::retain_sample_pixel_buffer;
use crate::compositor::MetalCompositor;
use crate::encoder::Encoder;
use crate::frame_pool::{sleep_then_spin_until, FramePool};
use crate::muxer::FragmentedMp4Writer;
use crate::progress::ProgressState;
use crate::worker::Worker;
use crate::{Progress, RecordHandle, RecordSpec, Recorder};

type ProgressSink = dyn Fn(Progress) -> Result<()> + Send + Sync + 'static;

pub struct PipelineRecorder {
    progress: ProgressState,
    progress_sink: Option<Arc<ProgressSink>>,
}

#[derive(Clone)]
struct FramePermit {
    _slot_index: usize,
}

struct CapturedPacket {
    frame_index: u64,
    permit: Arc<FramePermit>,
    pixel_buffer: SendPixelBuffer,
}

struct CompositedPacket {
    frame_index: u64,
    permit: Arc<FramePermit>,
    pixel_buffer: SendPixelBuffer,
}

enum WorkerMessage {
    Frame(CapturedPacket),
    Shutdown,
}

enum EncoderMessage {
    Frame(CompositedPacket),
}

struct EncoderThreadConfig {
    frame_pool: FramePool<FramePermit>,
    progress: ProgressState,
    progress_sink: Option<Arc<ProgressSink>>,
    out_path: PathBuf,
    width: usize,
    height: usize,
    fps: u32,
    total_frames: u64,
}

struct SendPixelBuffer(CFRetained<CVPixelBuffer>);

// SAFETY: CoreVideo pixel buffers are reference-counted objects designed to be shared across
// queue boundaries; the recorder only transfers retained references and never aliases mutable CPU access.
unsafe impl Send for SendPixelBuffer {}

// SAFETY: Shared access is read-only in the recorder pipeline; mutation is delegated to CoreVideo/Metal APIs.
unsafe impl Sync for SendPixelBuffer {}

impl SendPixelBuffer {
    fn new(pixel_buffer: CFRetained<CVPixelBuffer>) -> Self {
        Self(pixel_buffer)
    }

    fn as_ref(&self) -> &CVPixelBuffer {
        self.0.as_ref()
    }
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
        self.progress_sink = Some(Arc::new(sink));
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
        let pool_size = worker_count + 2;
        let mut workers = (0..worker_count)
            .map(|_| Worker::new(&spec.bundle_path, width, height, spec.fps))
            .collect::<Result<Vec<_>>>()?;
        let frame_pool = FramePool::new(
            (0..pool_size)
                .map(|slot| Arc::new(FramePermit { _slot_index: slot }))
                .collect(),
        )?;
        let worker_queues = (0..worker_count)
            .map(|_| Arc::new(ArrayQueue::new(pool_size)))
            .collect::<Vec<_>>();
        let (encoder_tx, encoder_rx) = channel::unbounded::<EncoderMessage>();
        let compositor_threads =
            spawn_compositor_threads(worker_queues.clone(), encoder_tx.clone(), width, height);
        let encoder_thread = spawn_encoder_thread(
            encoder_rx,
            EncoderThreadConfig {
                frame_pool: frame_pool.clone(),
                progress: self.progress.clone(),
                progress_sink: self.progress_sink.clone(),
                out_path: spec.out_path.clone(),
                width,
                height,
                fps: spec.fps,
                total_frames,
            },
        );

        let record_result = self.dispatch_capture_frames(
            &spec,
            total_frames,
            &mut workers,
            &frame_pool,
            &worker_queues,
        );
        shutdown_worker_queues(&worker_queues);
        drop(encoder_tx);

        let compositor_result = join_compositor_threads(compositor_threads);
        record_result?;
        compositor_result?;
        join_thread(encoder_thread, "encoder")?;

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

impl PipelineRecorder {
    fn dispatch_capture_frames(
        &self,
        spec: &RecordSpec,
        total_frames: u64,
        workers: &mut [Worker],
        frame_pool: &FramePool<FramePermit>,
        worker_queues: &[Arc<ArrayQueue<WorkerMessage>>],
    ) -> Result<()> {
        for frame_index in 0..total_frames {
            if self.progress.is_cancelled() {
                bail!("record cancelled");
            }
            let permit = acquire_permit(frame_pool, &self.progress)?;
            let worker_index = (frame_index as usize) % workers.len();
            let logical_t = frame_index as f64 / spec.fps as f64;
            let captured = workers[worker_index].capture_frame(frame_index + 1, logical_t)?;
            let pixel_buffer = retain_sample_pixel_buffer(captured.sample.as_ref())?;
            push_worker_message(
                &worker_queues[worker_index],
                WorkerMessage::Frame(CapturedPacket {
                    frame_index,
                    permit,
                    pixel_buffer: SendPixelBuffer::new(pixel_buffer),
                }),
            );
        }
        Ok(())
    }
}

fn spawn_compositor_threads(
    worker_queues: Vec<Arc<ArrayQueue<WorkerMessage>>>,
    encoder_tx: channel::Sender<EncoderMessage>,
    width: usize,
    height: usize,
) -> Vec<thread::JoinHandle<Result<()>>> {
    worker_queues
        .into_iter()
        .map(|queue| {
            let encoder_tx = encoder_tx.clone();
            thread::spawn(move || -> Result<()> {
                let compositor = MetalCompositor::new(width, height)?;
                loop {
                    match pop_worker_message(&queue) {
                        WorkerMessage::Frame(packet) => {
                            let composited =
                                compositor.composite_layers(&[packet.pixel_buffer.as_ref()])?;
                            encoder_tx
                                .send(EncoderMessage::Frame(CompositedPacket {
                                    frame_index: packet.frame_index,
                                    permit: packet.permit,
                                    pixel_buffer: SendPixelBuffer::new(
                                        composited.into_pixel_buffer(),
                                    ),
                                }))
                                .map_err(|_| anyhow!("encoder channel closed unexpectedly"))?;
                        }
                        WorkerMessage::Shutdown => return Ok(()),
                    }
                }
            })
        })
        .collect()
}

fn spawn_encoder_thread(
    encoder_rx: channel::Receiver<EncoderMessage>,
    config: EncoderThreadConfig,
) -> thread::JoinHandle<Result<()>> {
    thread::spawn(move || {
        let mut encoder = Encoder::new(config.width, config.height, config.fps)?;
        let mut muxer = None;
        let mut pending = BTreeMap::<u64, CompositedPacket>::new();
        let mut next_frame = 0_u64;

        while let Ok(message) = encoder_rx.recv() {
            match message {
                EncoderMessage::Frame(packet) => {
                    pending.insert(packet.frame_index, packet);
                    drain_encoder_ready_frames(
                        &mut pending,
                        &mut next_frame,
                        &mut encoder,
                        &mut muxer,
                        &config.frame_pool,
                        &config.progress,
                        config.progress_sink.as_deref(),
                        &config.out_path,
                        config.width,
                        config.height,
                        config.fps,
                    )?;
                }
            }
        }

        drain_encoder_ready_frames(
            &mut pending,
            &mut next_frame,
            &mut encoder,
            &mut muxer,
            &config.frame_pool,
            &config.progress,
            config.progress_sink.as_deref(),
            &config.out_path,
            config.width,
            config.height,
            config.fps,
        )?;
        if next_frame != config.total_frames {
            bail!(
                "encoder drained {next_frame} of {} frames",
                config.total_frames
            );
        }
        encoder.finish()?;
        if let Some(muxer) = muxer.as_mut() {
            muxer.finish()?;
        } else {
            bail!("encoder produced no samples");
        }
        Ok(())
    })
}

#[allow(clippy::too_many_arguments)]
fn drain_encoder_ready_frames(
    pending: &mut BTreeMap<u64, CompositedPacket>,
    next_frame: &mut u64,
    encoder: &mut Encoder,
    muxer: &mut Option<FragmentedMp4Writer>,
    frame_pool: &FramePool<FramePermit>,
    progress: &ProgressState,
    progress_sink: Option<&ProgressSink>,
    out_path: &Path,
    width: usize,
    height: usize,
    fps: u32,
) -> Result<()> {
    while let Some(packet) = pending.remove(next_frame) {
        let frame_index =
            u32::try_from(*next_frame).context("frame index exceeds encoder range")?;
        let encoded = encoder.encode_frame(frame_index, packet.pixel_buffer.as_ref())?;
        if muxer.is_none() {
            *muxer = Some(FragmentedMp4Writer::new(
                out_path,
                width as u16,
                height as u16,
                fps,
                encoded.sample_entry.clone(),
            )?);
        }
        if let Some(muxer) = muxer.as_mut() {
            muxer.write_sample(&encoded)?;
        }
        frame_pool.release(packet.permit)?;
        if let Some(sink) = progress_sink {
            sink(progress.increment())?;
        } else {
            let _ = progress.increment();
        }
        *next_frame += 1;
    }
    Ok(())
}

fn acquire_permit(
    frame_pool: &FramePool<FramePermit>,
    progress: &ProgressState,
) -> Result<Arc<FramePermit>> {
    loop {
        if let Some(permit) = frame_pool.acquire() {
            return Ok(permit);
        }
        if progress.is_cancelled() {
            bail!("record cancelled");
        }
        sleep_then_spin_until(Instant::now() + Duration::from_micros(250));
    }
}

fn push_worker_message(queue: &ArrayQueue<WorkerMessage>, message: WorkerMessage) {
    let mut message = Some(message);
    while let Some(pending) = message.take() {
        match queue.push(pending) {
            Ok(()) => return,
            Err(returned) => {
                message = Some(returned);
                thread::yield_now();
            }
        }
    }
}

fn pop_worker_message(queue: &ArrayQueue<WorkerMessage>) -> WorkerMessage {
    loop {
        if let Some(message) = queue.pop() {
            return message;
        }
        thread::yield_now();
    }
}

fn shutdown_worker_queues(worker_queues: &[Arc<ArrayQueue<WorkerMessage>>]) {
    for queue in worker_queues {
        push_worker_message(queue, WorkerMessage::Shutdown);
    }
}

fn join_compositor_threads(handles: Vec<thread::JoinHandle<Result<()>>>) -> Result<()> {
    for handle in handles {
        join_thread(handle, "compositor")?;
    }
    Ok(())
}

fn join_thread<T>(handle: thread::JoinHandle<Result<T>>, name: &str) -> Result<T> {
    handle
        .join()
        .map_err(|_| anyhow!("{name} thread panicked"))?
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
