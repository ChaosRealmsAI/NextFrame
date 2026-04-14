use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use objc2::rc::Retained;
use objc2_app_kit::NSImage;
use objc2_foundation::{NSDate, NSDefaultRunLoopMode, NSPoint, NSRect, NSRunLoop};

use super::{OFFSCREEN_ORIGIN_X, OFFSCREEN_ORIGIN_Y, WebViewHost};

pub(super) type SnapshotResultSlot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
pub(super) type EvalResultSlot = Rc<RefCell<Option<Result<Option<String>, String>>>>;

impl WebViewHost {
    /// Returns the current capture size in backing pixels.
    pub fn target_pixel_size(&self) -> (usize, usize) {
        (
            (self.view_width * self.dpr).round().max(1.0) as usize,
            (self.view_height * self.dpr).round().max(1.0) as usize,
        )
    }

    /// Pumps layout and the main run loop so WebKit can flush pending updates.
    pub fn flush_render(&self, duration: Duration) -> Result<(), String> {
        self.sync_view_hierarchy();
        pump_main_run_loop(duration);
        Ok(())
    }

    pub(super) fn sync_view_hierarchy(&self) {
        self.web_view
            .setFrame(NSRect::new(NSPoint::new(0.0, 0.0), self.target_size));
        self.web_view.layoutSubtreeIfNeeded();
        self.web_view.displayIfNeeded();
        self.window.displayIfNeeded();
    }

    pub(super) fn park_offscreen(&self) {
        if self.offscreen_parked.replace(true) {
            return;
        }
        self.window
            .setFrameOrigin(NSPoint::new(OFFSCREEN_ORIGIN_X, OFFSCREEN_ORIGIN_Y));
        self.window.displayIfNeeded();
        self.web_view.displayIfNeeded();
    }

    pub(super) fn wait_for_animation_frame(&self, _timeout: Duration) -> Result<(), String> {
        // A short compositor settle time is more reliable here than polling rAF.
        std::thread::sleep(Duration::from_millis(200));
        self.sync_view_hierarchy();
        self.flush_render(Duration::from_millis(100))?;
        Ok(())
    }

    pub(super) fn current_url(&self) -> Option<String> {
        // SAFETY: `self.web_view` is live, and `URL` returns either null or a live borrowed `NSURL`.
        unsafe { self.web_view.URL() } // SAFETY: see above.
            .and_then(|url| url.absoluteString().map(|value| value.to_string()))
    }
}

pub(super) fn offscreen_origin(index: usize) -> NSPoint {
    NSPoint::new(
        OFFSCREEN_ORIGIN_X - index as f64 * 64.0,
        OFFSCREEN_ORIGIN_Y - index as f64 * 48.0,
    )
}

pub(super) fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    // SAFETY: `NSDefaultRunLoopMode` is a valid process-global Foundation NSString constant.
    let default_mode = unsafe { NSDefaultRunLoopMode }; // SAFETY: see above.
    let _ = run_loop.runMode_beforeDate(default_mode, &date);
}
