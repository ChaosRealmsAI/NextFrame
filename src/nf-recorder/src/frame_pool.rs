//! Frame buffer pool — producer-consumer queue between worker and encoder.
//!
//! Real impl uses `crossbeam::queue::ArrayQueue<IoSurfaceSlot>`; skeleton is a thin
//! wrapper over `std::collections::VecDeque` so the trait surface is stable.

use std::collections::VecDeque;

use crate::worker::FrameRef;

pub trait FramePool {
    fn acquire(&mut self) -> Option<FrameRef>;
    fn release(&mut self, frame: FrameRef);
    fn capacity(&self) -> usize;
}

pub struct StubPool {
    cap: usize,
    free: VecDeque<FrameRef>,
}

impl StubPool {
    pub fn new(cap: usize) -> Self {
        let mut free = VecDeque::with_capacity(cap);
        for i in 0..cap {
            free.push_back(FrameRef {
                io_surface_id: i as u64,
            });
        }
        Self { cap, free }
    }
}

impl FramePool for StubPool {
    fn acquire(&mut self) -> Option<FrameRef> {
        self.free.pop_front()
    }

    fn release(&mut self, frame: FrameRef) {
        if self.free.len() < self.cap {
            self.free.push_back(frame);
        }
    }

    fn capacity(&self) -> usize {
        self.cap
    }
}
