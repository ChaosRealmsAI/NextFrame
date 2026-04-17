use std::cell::{Cell, RefCell};
use std::ptr::NonNull;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use dispatch2::{DispatchQueue, DispatchRetained};
use objc2::{AnyThread, DefinedClass};
use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{MainThreadMarker, define_class, msg_send};
use objc2_app_kit::NSWindow;
use objc2_core_foundation::CFRetained;
use objc2_core_media::{CMSampleBuffer, CMTime};
use objc2_core_video::CVPixelBuffer;
use objc2_foundation::{NSError, NSObjectProtocol};
use objc2_screen_capture_kit::{
    SCContentFilter, SCShareableContent, SCStream, SCStreamConfiguration, SCStreamOutput,
    SCStreamOutputType, SCWindow,
};

use crate::bindings::release_sample_buffer;

#[derive(Clone)]
pub struct CapturedFrame {
    pub sequence: u64,
    pub sample: Retained<CMSampleBuffer>,
}

#[derive(Clone, Copy)]
struct SamplePtr(NonNull<CMSampleBuffer>);

// SAFETY: CMSampleBuffer is reference-counted CF/ObjC state; we only move retained pointers
// across threads and guard access to the latest pointer behind a Mutex.
unsafe impl Send for SamplePtr {}

// SAFETY: The underlying pointer is only copied, retained, and released while protected by a Mutex.
unsafe impl Sync for SamplePtr {}

struct OutputState {
    latest: Option<SamplePtr>,
    sequence: u64,
}

struct OutputIvars {
    state: Arc<Mutex<OutputState>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[ivars = OutputIvars]
    struct CaptureOutput;

    unsafe impl NSObjectProtocol for CaptureOutput {}

    unsafe impl SCStreamOutput for CaptureOutput {
        #[allow(non_snake_case)]
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        unsafe fn stream_didOutputSampleBuffer_ofType(
            &self,
            _stream: &SCStream,
            sample_buffer: &CMSampleBuffer,
            r#type: SCStreamOutputType,
        ) {
            if r#type != SCStreamOutputType::Screen {
                return;
            }
            // SAFETY: ScreenCaptureKit guarantees the sample buffer outlives this callback.
            if unsafe { sample_buffer.image_buffer() }.is_none() {
                return;
            }
            // SAFETY: Retaining the Objective-C sample buffer lets us hold it past the callback.
            let Some(retained) =
                (unsafe { Retained::retain(sample_buffer as *const _ as *mut CMSampleBuffer) })
            else {
                return;
            };
            let Some(ptr) = NonNull::new(Retained::into_raw(retained)) else {
                return;
            };
            let mut state = self
                .ivars()
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(previous) = state.latest.replace(SamplePtr(ptr)) {
                // SAFETY: `previous` was retained before being placed in shared state.
                unsafe {
                    release_sample_buffer(previous.0.as_ptr());
                }
            }
            state.sequence += 1;
        }
    }
);

pub struct CaptureSession {
    stream: Retained<SCStream>,
    output: Retained<CaptureOutput>,
    _queue: DispatchRetained<DispatchQueue>,
    state: Arc<Mutex<OutputState>>,
}

impl CaptureSession {
    pub fn new(window: &NSWindow, width: usize, height: usize, fps: u32) -> Result<Self> {
        let _mtm =
            MainThreadMarker::new().context("ScreenCaptureKit setup must run on the main thread")?;
        let sc_window = find_window(window.windowNumber() as u32)?;
        // SAFETY: `sc_window` is a live single-window capture target enumerated from SCShareableContent.
        let filter = unsafe {
            SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &sc_window)
        };

        // SAFETY: SCStreamConfiguration::new constructs a fresh Objective-C configuration object.
        let config = unsafe { SCStreamConfiguration::new() };
        // SAFETY: Mutating the freshly created configuration is valid before starting the stream.
        unsafe {
            config.setWidth(width);
            config.setHeight(height);
            config.setPixelFormat(objc2_core_video::kCVPixelFormatType_32BGRA);
            config.setMinimumFrameInterval(CMTime::new(1, fps as i32));
            config.setQueueDepth(8);
            config.setCapturesAudio(false);
            config.setShowsCursor(false);
            config.setIgnoreShadowsSingleWindow(true);
            config.setIgnoreGlobalClipSingleWindow(true);
            config.setShouldBeOpaque(true);
        }

        let state = Arc::new(Mutex::new(OutputState {
            latest: None,
            sequence: 0,
        }));
        let output = MainThreadMarker::new()
            .context("ScreenCaptureKit output creation must run on the main thread")?
            .alloc::<CaptureOutput>()
            .set_ivars(OutputIvars {
                state: state.clone(),
            });
        // SAFETY: Initializing the Objective-C subclass after ivars are set is required.
        let output: Retained<CaptureOutput> = unsafe { msg_send![super(output), init] };

        // SAFETY: The filter/config objects remain alive for the stream lifetime stored in `Self`.
        let stream = unsafe {
            SCStream::initWithFilter_configuration_delegate(
                SCStream::alloc(),
                &filter,
                &config,
                None,
            )
        };
        let queue = DispatchQueue::new("nf-recorder.capture-output", None);
        // SAFETY: The output object and dispatch queue live until the session drops.
        unsafe {
            stream
                .addStreamOutput_type_sampleHandlerQueue_error(
                    ProtocolObject::from_ref(&*output),
                    SCStreamOutputType::Screen,
                    Some(&queue),
                )
                .map_err(ns_error)?;
        }
        Ok(Self {
            stream,
            output,
            _queue: queue,
            state,
        })
    }

    pub fn start(&mut self) -> Result<()> {
        let finished = Rc::new(Cell::new(false));
        let error = Rc::new(RefCell::new(None::<String>));
        let finished_out = finished.clone();
        let error_out = error.clone();
        let completion = block2::RcBlock::new(move |err: *mut NSError| {
            // SAFETY: ScreenCaptureKit passes either null or a valid NSError pointer.
            if let Some(err) = unsafe { err.as_ref() } {
                *error_out.borrow_mut() = Some(err.localizedDescription().to_string());
            }
            finished_out.set(true);
        });
        // SAFETY: The completion block remains alive until the API invokes it synchronously/asynchronously.
        unsafe {
            self.stream.startCaptureWithCompletionHandler(Some(&completion));
        }
        let deadline = Instant::now() + Duration::from_secs(10);
        while !finished.get() && Instant::now() < deadline {
            crate::worker::pump_main_run_loop(Duration::from_millis(16));
        }
        if let Some(error) = error.borrow_mut().take() {
            bail!("SCStream failed to start: {error}");
        }
        if !finished.get() {
            bail!("timed out waiting for SCStream start");
        }
        Ok(())
    }

    pub fn latest_sequence(&self) -> u64 {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .sequence
    }

    pub fn wait_for_frame_after(&self, sequence: u64, timeout: Duration) -> Result<CapturedFrame> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            crate::worker::pump_main_run_loop(Duration::from_millis(16));
            let state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if state.sequence > sequence {
                if let Some(sample) = state.latest {
                    // SAFETY: We retain another reference before returning the sample.
                    if let Some(retained) = unsafe { Retained::retain(sample.0.as_ptr()) } {
                        return Ok(CapturedFrame {
                            sequence: state.sequence,
                            sample: retained,
                        });
                    }
                }
            }
        }
        Err(anyhow!(
            "timed out waiting for capture frame after sequence {sequence}"
        ))
    }
}

impl Drop for CaptureSession {
    fn drop(&mut self) {
        if let Some(sample) = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .latest
            .take()
        {
            // SAFETY: `sample` was retained before being stored in shared state.
            unsafe {
                release_sample_buffer(sample.0.as_ptr());
            }
        }
        // SAFETY: Removing the stream output during teardown balances the earlier add call.
        let _ = unsafe {
            self.stream.removeStreamOutput_type_error(
                ProtocolObject::from_ref(&*self.output),
                SCStreamOutputType::Screen,
            )
        };
    }
}

pub fn sample_pixel_buffer(sample: &CMSampleBuffer) -> Result<&CVPixelBuffer> {
    // SAFETY: Screen sample buffers carry an image buffer for screen frames; we validate presence.
    let image_buffer = unsafe { sample.image_buffer() }.context("capture sample missing image buffer")?;
    // SAFETY: The CVImageBuffer returned by SCStream is a CVPixelBuffer-backed object.
    Ok(unsafe { &*(CFRetained::as_ptr(&image_buffer).as_ptr() as *const CVPixelBuffer) })
}

pub fn retain_sample_pixel_buffer(sample: &CMSampleBuffer) -> Result<CFRetained<CVPixelBuffer>> {
    let pixel_buffer = sample_pixel_buffer(sample)?;
    // SAFETY: The sample buffer owns a live CVPixelBuffer; retaining it gives the recorder an owned reference.
    Ok(unsafe { CFRetained::retain(NonNull::from(pixel_buffer)) })
}

fn find_window(window_id: u32) -> Result<Retained<SCWindow>> {
    let ready = Rc::new(Cell::new(false));
    let found = Rc::new(RefCell::new(None::<Retained<SCWindow>>));
    let error_text = Rc::new(RefCell::new(None::<String>));
    let ready_out = ready.clone();
    let found_out = found.clone();
    let error_out = error_text.clone();
    let completion = block2::RcBlock::new(
        move |content: *mut SCShareableContent, error: *mut NSError| {
            // SAFETY: ScreenCaptureKit passes either null or a valid NSError pointer.
            if let Some(error) = unsafe { error.as_ref() } {
                *error_out.borrow_mut() = Some(error.localizedDescription().to_string());
                ready_out.set(true);
                return;
            }
            // SAFETY: ScreenCaptureKit passes either null or a valid SCShareableContent pointer.
            let Some(content) = (unsafe { content.as_ref() }) else {
                *error_out.borrow_mut() = Some("SCShareableContent returned nil".to_string());
                ready_out.set(true);
                return;
            };
            // SAFETY: Enumerating the array is safe while `content` lives for the callback duration.
            let windows = unsafe { content.windows() };
            for candidate in windows.iter() {
                // SAFETY: Reading window IDs from enumerated SCWindow handles is safe.
                if unsafe { candidate.windowID() } == window_id {
                    *found_out.borrow_mut() = Some(candidate.clone());
                    break;
                }
            }
            ready_out.set(true);
        },
    );
    // SAFETY: ADR-025 requires `onScreenWindowsOnly=false`; the completion block stays alive.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            false,
            false,
            &completion,
        );
    }
    let deadline = Instant::now() + Duration::from_secs(10);
    while !ready.get() && Instant::now() < deadline {
        crate::worker::pump_main_run_loop(Duration::from_millis(16));
    }
    if let Some(error) = error_text.borrow_mut().take() {
        bail!("failed to enumerate shareable content: {error}");
    }
    let result = found
        .borrow_mut()
        .take()
        .ok_or_else(|| anyhow!("failed to find SCWindow for NSWindow {window_id}"));
    result
}

fn ns_error(error: Retained<NSError>) -> anyhow::Error {
    anyhow!(error.localizedDescription().to_string())
}
