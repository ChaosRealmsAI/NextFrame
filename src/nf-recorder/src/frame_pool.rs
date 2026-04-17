use std::hint::spin_loop;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, bail};
use crossbeam::queue::ArrayQueue;

const SPIN_THRESHOLD: Duration = Duration::from_micros(250);

pub struct FramePool<T> {
    free: Arc<ArrayQueue<Arc<T>>>,
}

impl<T> Clone for FramePool<T> {
    fn clone(&self) -> Self {
        Self {
            free: self.free.clone(),
        }
    }
}

impl<T> FramePool<T> {
    pub fn new(preallocated: Vec<Arc<T>>) -> Result<Self> {
        if preallocated.is_empty() {
            bail!("frame pool requires at least one slot");
        }
        let free = Arc::new(ArrayQueue::new(preallocated.len()));
        for slot in preallocated {
            free.push(slot)
                .map_err(|_| anyhow!("failed to seed frame pool"))?;
        }
        Ok(Self { free })
    }

    pub fn acquire(&self) -> Option<Arc<T>> {
        self.free.pop()
    }

    pub fn release(&self, slot: Arc<T>) -> Result<()> {
        self.free
            .push(slot)
            .map_err(|_| anyhow!("frame pool overflow on release"))
    }

    pub fn capacity(&self) -> usize {
        self.free.capacity()
    }
}

pub fn sleep_then_spin_until(deadline: Instant) {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return;
        }
        let remaining = deadline.saturating_duration_since(now);
        if remaining > SPIN_THRESHOLD {
            std::thread::sleep(remaining - SPIN_THRESHOLD);
            continue;
        }
        spin_loop();
    }
}
