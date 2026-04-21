//! `FramePool` · v1.14 T-09 placeholder.
//!
//! v1.14 runs with `worker_count = 1` (scope.json) · the recorder thread is
//! the sole driver of the VT encoder which already owns a tiny internal
//! reorder queue inside VideoToolbox. A classic multi-producer SPSC pool
//! (crossbeam ArrayQueue) is over-engineered for this case: we never hold
//! more than one outstanding `IOSurface` at a time because `push_frame`
//! drains the compressor's output queue synchronously each iteration.
//!
//! This struct is kept as a named entry point so future versions can swap
//! in a real pool (v1.19 multi-worker) without touching `record_loop.rs`.
//! Today it only records statistics.

/// Simplified pool · counts submissions for telemetry.
#[derive(Debug, Default)]
pub struct FramePool {
    capacity: usize,
    submitted: u64,
}

impl FramePool {
    /// Construct an empty pool with a nominal `capacity` (v1.14 ignores it).
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            submitted: 0,
        }
    }

    /// Record one frame submission · returns the new running count.
    pub fn note_submitted(&mut self) -> u64 {
        self.submitted = self.submitted.saturating_add(1);
        self.submitted
    }

    /// Total frames submitted since construction.
    #[must_use]
    pub fn submitted(&self) -> u64 {
        self.submitted
    }

    /// Nominal capacity (unused in v1.14 · reserved for v1.19).
    #[must_use]
    pub fn capacity(&self) -> usize {
        self.capacity
    }
}
