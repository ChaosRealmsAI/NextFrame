use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::Progress;

#[derive(Clone)]
pub struct ProgressState {
    frames_done: Arc<AtomicU64>,
    total: u64,
    cancelled: Arc<AtomicBool>,
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    started_at: Instant,
}

impl ProgressState {
    pub fn new(total: u64) -> Self {
        Self {
            frames_done: Arc::new(AtomicU64::new(0)),
            total,
            cancelled: Arc::new(AtomicBool::new(false)),
            inner: Arc::new(Mutex::new(Inner {
                started_at: Instant::now(),
            })),
        }
    }

    pub fn increment(&self) -> Progress {
        let frames_done = self.frames_done.fetch_add(1, Ordering::AcqRel) + 1;
        self.snapshot_with_frames(frames_done)
    }

    pub fn snapshot(&self) -> Progress {
        self.snapshot_with_frames(self.frames_done.load(Ordering::Acquire))
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    fn snapshot_with_frames(&self, frames_done: u64) -> Progress {
        let elapsed = self
            .inner
            .lock()
            .map(|inner| inner.started_at.elapsed().as_secs_f64())
            .unwrap_or(0.0);
        Progress {
            frames_done,
            total: self.total,
            fps_observed: if elapsed > 0.0 {
                frames_done as f64 / elapsed
            } else {
                0.0
            },
        }
    }
}
