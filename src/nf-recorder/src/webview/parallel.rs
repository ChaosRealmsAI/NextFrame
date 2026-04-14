//! `ParallelHost` — manages multiple `WebViewHost` instances for parallel experiments.

use objc2::MainThreadMarker;
use objc2_foundation::NSPoint;

use super::{VIEW_HEIGHT, VIEW_WIDTH, WebViewHost, offscreen_origin};

/// Owns multiple `WebViewHost` instances for parallel experiments and benchmarks.
#[allow(dead_code)]
pub(crate) struct ParallelHost {
    hosts: Vec<WebViewHost>,
}

#[allow(dead_code)]
impl ParallelHost {
    /// Creates a set of hosts with staggered window placement.
    pub(crate) fn new(count: usize, headed: bool, dpr: f64) -> Result<Self, String> {
        Self::with_size(count, headed, dpr, VIEW_WIDTH, VIEW_HEIGHT)
    }

    /// Creates a set of hosts with custom viewport size.
    pub(crate) fn with_size(
        count: usize,
        headed: bool,
        dpr: f64,
        view_width: f64,
        view_height: f64,
    ) -> Result<Self, String> {
        if count == 0 {
            return Err("parallel host count must be greater than 0".into());
        }

        let mtm = MainThreadMarker::new().ok_or("recorder must start on the main thread")?;
        let mut hosts = Vec::with_capacity(count);
        for index in 0..count {
            let host = WebViewHost::new(mtm, headed, dpr, view_width, view_height)?;
            host.set_window_title(&format!("recorder-{}", index + 1));
            // Keep hidden hosts offscreen while still varying their coordinates so the
            // compositor does not treat every surface as an identical layer.
            let origin = if headed {
                NSPoint::new(100.0 + index as f64 * 48.0, 100.0 + index as f64 * 36.0)
            } else {
                offscreen_origin(index)
            };
            host.set_window_origin(origin.x, origin.y);
            hosts.push(host);
        }
        Ok(Self { hosts })
    }

    /// Returns the number of managed hosts.
    pub(crate) fn len(&self) -> usize {
        self.hosts.len()
    }

    /// Reports whether there are no managed hosts.
    pub(crate) fn is_empty(&self) -> bool {
        self.hosts.is_empty()
    }

    /// Returns a host by index.
    pub(crate) fn host(&self, index: usize) -> Option<&WebViewHost> {
        self.hosts.get(index)
    }

    /// Returns all managed hosts.
    pub(crate) fn hosts(&self) -> &[WebViewHost] {
        &self.hosts
    }
}
