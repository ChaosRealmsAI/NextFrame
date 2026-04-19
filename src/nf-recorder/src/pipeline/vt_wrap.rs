//! VTCompressionSession wrapper · v1.14 T-07
//!
//! Rust wrapper around `VTCompressionSession` producing H.264 AVC compressed frames.
//! The output callback pushes each `CompressedFrame` onto a lock-free `SegQueue`
//! so `encode_pixel_buffer` never blocks on the encoder's queue. `finalize` drains
//! pending frames via `VTCompressionSessionCompleteFrames(kCMTimeInvalid)`.
//!
//! Shape mirrors POC-02 (`poc/POC-02-vt-h264/src/main.rs`): BT.709 triple,
//! Main profile AutoLevel, `AllowFrameReordering=false`, `MaxKeyFrameInterval=fps`.
//!
//! ## Contract with T-08 (Mp4Writer)
//! `CompressedFrame::data` is H.264 **AVCC** (length-prefixed NAL units — the
//! default VT output format). `format_description` carries SPS/PPS and is
//! attached to every frame for convenience (VT only re-creates it when the
//! codec configuration changes, so typically the same instance is shared).

use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::Arc;

use crossbeam::queue::SegQueue;
use objc2_core_foundation::{
    kCFBooleanTrue, CFArray, CFBoolean, CFDictionary, CFNumber, CFRetained, CFString, CFType,
};
use objc2_core_media::{
    kCMSampleAttachmentKey_NotSync, kCMTimeInvalid, kCMVideoCodecType_H264, CMBlockBuffer,
    CMSampleBuffer, CMTime, CMVideoFormatDescription,
};
use objc2_core_video::{
    kCVImageBufferColorPrimaries_ITU_R_709_2, kCVImageBufferTransferFunction_ITU_R_709_2,
    kCVImageBufferYCbCrMatrix_ITU_R_709_2, kCVPixelBufferHeightKey,
    kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferPixelFormatTypeKey,
    kCVPixelBufferWidthKey, kCVPixelFormatType_32BGRA, CVImageBuffer, CVPixelBuffer,
};
use objc2_video_toolbox::{
    kVTCompressionPropertyKey_AllowFrameReordering, kVTCompressionPropertyKey_AverageBitRate,
    kVTCompressionPropertyKey_ColorPrimaries, kVTCompressionPropertyKey_ExpectedFrameRate,
    kVTCompressionPropertyKey_MaxKeyFrameInterval, kVTCompressionPropertyKey_ProfileLevel,
    kVTCompressionPropertyKey_RealTime, kVTCompressionPropertyKey_TransferFunction,
    kVTCompressionPropertyKey_YCbCrMatrix, kVTEncodeFrameOptionKey_ForceKeyFrame,
    kVTProfileLevel_H264_Main_AutoLevel, VTCompressionSession, VTEncodeInfoFlags, VTSession,
    VTSessionSetProperty,
};
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_foundation::{NSCopying, NSDictionary, NSMutableDictionary, NSString};

use super::{ColorSpec, PipelineError};

// ─── Sendable CF wrapper ────────────────────────────────────────────────────

/// Clone + Send wrapper around a CM/CF format description.
///
/// `CMFormatDescription` is a reference-counted CF object with thread-safe
/// retain/release. We wrap `CFRetained` so the struct derives `Clone` without
/// exposing the !Send default of CF types across the queue boundary.
pub struct SendableFormatDescription(CFRetained<CMVideoFormatDescription>);

// SAFETY: CMFormatDescription is a CF object; CFRetain/CFRelease are thread-safe,
// and we only hand ownership between threads (never share mutable state).
#[allow(unsafe_code)]
unsafe impl Send for SendableFormatDescription {}
// SAFETY: Same justification as Send — the underlying CF object is immutable
// once created and has thread-safe reference counting.
#[allow(unsafe_code)]
unsafe impl Sync for SendableFormatDescription {}

impl Clone for SendableFormatDescription {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl SendableFormatDescription {
    pub fn new(inner: CFRetained<CMVideoFormatDescription>) -> Self {
        Self(inner)
    }

    pub fn as_ref_format(&self) -> &CMVideoFormatDescription {
        &self.0
    }

    pub fn into_inner(self) -> CFRetained<CMVideoFormatDescription> {
        self.0
    }
}

// ─── CompressedFrame ────────────────────────────────────────────────────────

/// A single encoded H.264 frame produced by the compressor callback.
///
/// Consumed by `Mp4Writer::append` (T-08) to construct a `CMSampleBuffer`
/// and hand it off to `AVAssetWriterInput`.
#[derive(Clone)]
pub struct CompressedFrame {
    /// H.264 **AVCC** bitstream (length-prefixed NAL units). This is the raw
    /// VT output format — no conversion needed for AVAssetWriter.
    pub data: Vec<u8>,
    /// Presentation timestamp in milliseconds.
    pub pts_ms: u64,
    /// Decode timestamp in milliseconds. Equal to `pts_ms` here because
    /// `AllowFrameReordering=false`.
    pub dts_ms: u64,
    /// Whether this is an IDR keyframe.
    pub is_keyframe: bool,
    /// H.264 format description containing SPS/PPS. Stable across a compression
    /// session unless the encoder re-configures.
    pub format_description: SendableFormatDescription,
}

// ─── VtCompressor ───────────────────────────────────────────────────────────

/// Shared state between the producer side and the VT output callback.
struct VtCallbackState {
    output_queue: SegQueue<CompressedFrame>,
    /// Records only the first error to keep the queue bounded.
    first_error: SegQueue<String>,
}

impl VtCallbackState {
    fn new() -> Self {
        Self {
            output_queue: SegQueue::new(),
            first_error: SegQueue::new(),
        }
    }

    fn record_error(&self, message: String) {
        if self.first_error.is_empty() {
            self.first_error.push(message);
        }
    }
}

/// VideoToolbox H.264 Main/AutoLevel compressor (v1.14 target: 1080p @ 30/60).
pub struct VtCompressor {
    session: CFRetained<VTCompressionSession>,
    state: Arc<VtCallbackState>,
    /// Raw Arc pointer handed to VT as the callback refcon. Kept alive for the
    /// lifetime of the session; released implicitly when `state` is dropped.
    #[allow(dead_code)]
    callback_refcon: *const VtCallbackState,
    width: u32,
    height: u32,
    fps: u32,
    bitrate_bps: u32,
}

// SAFETY: VTCompressionSession retain/release is thread-safe. The callback
// refcon is only dereferenced on VT's private encoder queue; we never alias it
// from a producer thread.
#[allow(unsafe_code)]
unsafe impl Send for VtCompressor {}

impl VtCompressor {
    /// Create a new H.264 VT compressor. Only `ColorSpec::BT709_SDR_8bit` is
    /// supported in v1.14 (HDR10 lands in v1.24 per ADR-052).
    pub fn new(
        width: u32,
        height: u32,
        fps: u32,
        bitrate_bps: u32,
        color: ColorSpec,
    ) -> Result<Self, PipelineError> {
        if !matches!(color, ColorSpec::BT709_SDR_8bit) {
            return Err(PipelineError::EncoderInitFailed);
        }
        if width == 0 || height == 0 || fps == 0 || bitrate_bps == 0 {
            return Err(PipelineError::EncoderInitFailed);
        }

        let state = Arc::new(VtCallbackState::new());
        let refcon_ptr = Arc::as_ptr(&state);

        let attrs = pixel_buffer_attributes(width as i32, height as i32);

        let mut session_ptr: *mut VTCompressionSession = std::ptr::null_mut();
        // SAFETY: All pointer / dict / callback arguments satisfy VT's documented
        // lifetime requirements. The out slot is writable stack memory.
        #[allow(unsafe_code)]
        let status = unsafe {
            VTCompressionSession::create(
                None,
                width as i32,
                height as i32,
                kCMVideoCodecType_H264,
                None,
                Some(attrs.as_ref()),
                None,
                Some(vt_output_callback),
                refcon_ptr as *mut c_void,
                NonNull::from(&mut session_ptr),
            )
        };
        if status != 0 {
            return Err(PipelineError::EncoderInitFailed);
        }
        let session_nn = match NonNull::new(session_ptr) {
            Some(p) => p,
            None => return Err(PipelineError::EncoderInitFailed),
        };
        // SAFETY: VT returned a +1-retained session pointer.
        #[allow(unsafe_code)]
        let session = unsafe { CFRetained::from_raw(session_nn) };

        configure_session(&session, fps as i32, bitrate_bps as i32)?;

        // SAFETY: prepare_to_encode_frames is an FFI call on a valid session.
        #[allow(unsafe_code)]
        let prep = unsafe { session.prepare_to_encode_frames() };
        if prep != 0 {
            return Err(PipelineError::EncoderInitFailed);
        }

        Ok(Self {
            session,
            state,
            callback_refcon: refcon_ptr,
            width,
            height,
            fps,
            bitrate_bps,
        })
    }

    /// Encode a single pixel buffer. Does **not** block waiting for the encoder —
    /// output is delivered asynchronously and retrievable via `poll_output`.
    ///
    /// `force_keyframe=true` forces this frame to emit as IDR. v1.15 uses this for
    /// the very first frame of every subprocess so each segment MP4 starts with a
    /// keyframe · enabling `ffmpeg concat -c copy` (no re-encode) at merge time.
    pub fn encode_pixel_buffer(
        &self,
        pixel_buffer: &CVPixelBuffer,
        pts_ms: u64,
        force_keyframe: bool,
    ) -> Result<(), PipelineError> {
        // SAFETY: CMTime::new is a plain struct initializer.
        #[allow(unsafe_code)]
        let pts = unsafe { CMTime::new(pts_ms as i64, 1000) };
        // One frame duration in the same 1ms timescale (fps > 0 by new()).
        let per_frame_ms = (1000i64 / (self.fps as i64)).max(1);
        // SAFETY: CMTime::new is a plain struct initializer.
        #[allow(unsafe_code)]
        let duration = unsafe { CMTime::new(per_frame_ms, 1000) };

        // v1.15 · Per-frame frameProperties CFDictionary carrying ForceKeyFrame.
        // Built only when force_keyframe=true · None otherwise (zero overhead path
        // for the 99% non-IDR-forced frames).
        let frame_props: Option<Retained<NSMutableDictionary<NSString, CFBoolean>>> =
            if force_keyframe {
                let dict: Retained<NSMutableDictionary<NSString, CFBoolean>> =
                    NSMutableDictionary::new();
                // SAFETY: kVTEncodeFrameOptionKey_ForceKeyFrame is CFString · toll-free to NSString.
                #[allow(unsafe_code)]
                let key: &NSString = unsafe {
                    &*(kVTEncodeFrameOptionKey_ForceKeyFrame as *const CFString as *const NSString)
                };
                let key_proto: &ProtocolObject<dyn NSCopying> = ProtocolObject::from_ref(key);
                // SAFETY: setObject:forKey: on main or bg thread is safe · NSMutableDictionary
                // is a standard Foundation class. CFBoolean::true_() returns a shared singleton.
                // SAFETY: kCFBooleanTrue is a static shared singleton · unwrap safe.
                #[allow(unsafe_code)]
                let b_true: &CFBoolean = unsafe { kCFBooleanTrue }
                    .ok_or(PipelineError::EncoderInitFailed)?;
                // SAFETY: setObject:forKey: on Foundation NSMutableDictionary · thread-safe
                // usage guaranteed by callee context (encode_pixel_buffer is called from record
                // loop main thread only).
                #[allow(unsafe_code)]
                unsafe {
                    dict.setObject_forKey(b_true, key_proto);
                }
                Some(dict)
            } else {
                None
            };

        // SAFETY: VTCompressionSessionEncodeFrame takes a CVImageBuffer (CVPixelBuffer
        // is a subtype — same ABI). frame_properties is a CFDictionary (toll-free from
        // NSDictionary). We pass null for source refcon and info_flags.
        #[allow(unsafe_code)]
        let status = unsafe {
            let image_buffer: &CVImageBuffer =
                &*(pixel_buffer as *const CVPixelBuffer as *const CVImageBuffer);
            let props_ref: Option<&CFDictionary> = frame_props.as_deref().map(|d| {
                let ns_dict: &NSDictionary<NSString, CFBoolean> = d;
                &*(ns_dict as *const NSDictionary<NSString, CFBoolean> as *const CFDictionary)
            });
            self.session.encode_frame(
                image_buffer,
                pts,
                duration,
                props_ref,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if status != 0 {
            return Err(PipelineError::EncoderInitFailed);
        }
        self.check_callback_error()?;
        Ok(())
    }

    /// Flush the encoder. Blocks until all outstanding frames emerge from the
    /// callback.
    pub fn finalize(&self) -> Result<(), PipelineError> {
        // SAFETY: kCMTimeInvalid means "complete every pending frame".
        #[allow(unsafe_code)]
        let status = unsafe { self.session.complete_frames(kCMTimeInvalid) };
        if status != 0 {
            return Err(PipelineError::EncoderInitFailed);
        }
        self.check_callback_error()?;
        Ok(())
    }

    /// Non-blocking dequeue of the next encoded frame.
    pub fn poll_output(&self) -> Option<CompressedFrame> {
        self.state.output_queue.pop()
    }

    /// Count of frames currently queued (approximate — SegQueue len is O(1) but racy).
    pub fn pending_output(&self) -> usize {
        self.state.output_queue.len()
    }

    fn check_callback_error(&self) -> Result<(), PipelineError> {
        if let Some(msg) = self.state.first_error.pop() {
            return Err(PipelineError::IoError(msg));
        }
        Ok(())
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn fps(&self) -> u32 {
        self.fps
    }

    pub fn bitrate_bps(&self) -> u32 {
        self.bitrate_bps
    }
}

impl Drop for VtCompressor {
    fn drop(&mut self) {
        // SAFETY: complete_frames + invalidate are valid on any live VT session
        // and can be called from any thread. After invalidate no further callbacks
        // fire, so the refcon pointer is no longer observed.
        #[allow(unsafe_code)]
        unsafe {
            let _ = self.session.complete_frames(kCMTimeInvalid);
            self.session.invalidate();
        }
    }
}

// ─── Session configuration ──────────────────────────────────────────────────

fn configure_session(
    session: &VTCompressionSession,
    fps: i32,
    bitrate_bps: i32,
) -> Result<(), PipelineError> {
    // Frame reordering off — MP4 / streaming friendly.
    set_prop(
        session,
        // SAFETY: static CFString key with 'static lifetime.
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_AllowFrameReordering
        },
        CFBoolean::new(false).as_ref(),
    )?;
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_ExpectedFrameRate
        },
        CFNumber::new_i32(fps).as_ref(),
    )?;
    // One IDR per second.
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_MaxKeyFrameInterval
        },
        CFNumber::new_i32(fps).as_ref(),
    )?;
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_AverageBitRate
        },
        CFNumber::new_i32(bitrate_bps).as_ref(),
    )?;
    // H.264 Main / AutoLevel.
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_ProfileLevel
        },
        #[allow(unsafe_code)]
        unsafe {
            kVTProfileLevel_H264_Main_AutoLevel
        }
        .as_ref(),
    )?;
    // BT.709 color triple.
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_ColorPrimaries
        },
        #[allow(unsafe_code)]
        unsafe {
            kCVImageBufferColorPrimaries_ITU_R_709_2
        }
        .as_ref(),
    )?;
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_TransferFunction
        },
        #[allow(unsafe_code)]
        unsafe {
            kCVImageBufferTransferFunction_ITU_R_709_2
        }
        .as_ref(),
    )?;
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_YCbCrMatrix
        },
        #[allow(unsafe_code)]
        unsafe {
            kCVImageBufferYCbCrMatrix_ITU_R_709_2
        }
        .as_ref(),
    )?;
    // Non-realtime — let VT consume GPU fully.
    set_prop(
        session,
        #[allow(unsafe_code)]
        unsafe {
            kVTCompressionPropertyKey_RealTime
        },
        CFBoolean::new(false).as_ref(),
    )?;
    Ok(())
}

fn set_prop(
    session: &VTCompressionSession,
    key: &CFString,
    value: &CFType,
) -> Result<(), PipelineError> {
    // SAFETY: FFI setter. VTCompressionSession is a subtype of VTSession (same ABI).
    #[allow(unsafe_code)]
    let status = unsafe {
        let vt_session: &VTSession =
            &*(session as *const VTCompressionSession as *const VTSession);
        VTSessionSetProperty(vt_session, key, Some(value))
    };
    if status != 0 {
        return Err(PipelineError::EncoderInitFailed);
    }
    Ok(())
}

fn pixel_buffer_attributes(width: i32, height: i32) -> CFRetained<CFDictionary<CFType, CFType>> {
    let w = CFNumber::new_i32(width);
    let h = CFNumber::new_i32(height);
    let fmt = CFNumber::new_i32(kCVPixelFormatType_32BGRA as i32);
    let iosurface = CFDictionary::<CFType, CFType>::empty();
    // SAFETY: CFDictionary::from_slices accepts CF-typed refs in matching pairs.
    #[allow(unsafe_code)]
    unsafe {
        CFDictionary::<CFType, CFType>::from_slices(
            &[
                kCVPixelBufferWidthKey.as_ref(),
                kCVPixelBufferHeightKey.as_ref(),
                kCVPixelBufferPixelFormatTypeKey.as_ref(),
                kCVPixelBufferIOSurfacePropertiesKey.as_ref(),
            ],
            &[w.as_ref(), h.as_ref(), fmt.as_ref(), iosurface.as_ref()],
        )
    }
}

// ─── VT output callback ─────────────────────────────────────────────────────

/// Called by VideoToolbox on its private encoder queue. Extracts AVCC bytes,
/// format description and attachments, then pushes `CompressedFrame` to the
/// lock-free queue.
#[allow(unsafe_code)] // Callback ABI requires extern "C-unwind".
unsafe extern "C-unwind" fn vt_output_callback(
    output_callback_ref_con: *mut c_void,
    _source_frame_ref_con: *mut c_void,
    status: i32,
    info_flags: VTEncodeInfoFlags,
    sample_buffer: *mut CMSampleBuffer,
) {
    // SAFETY: refcon was set to Arc::as_ptr(&state) by new(); VtCompressor keeps
    // the Arc alive for the entire session lifetime, and no callback fires after
    // VTCompressionSessionInvalidate (called in Drop).
    let state: &VtCallbackState = unsafe { &*(output_callback_ref_con as *const VtCallbackState) };

    if status != 0 {
        state.record_error(format!("VT output callback status {status}"));
        return;
    }
    if info_flags.contains(VTEncodeInfoFlags::FrameDropped) {
        state.record_error("VT dropped a frame".to_string());
        return;
    }

    let Some(sample_nn) = NonNull::new(sample_buffer) else {
        state.record_error("VT callback returned null CMSampleBuffer".to_string());
        return;
    };

    // SAFETY: VT holds a valid retain on the sample buffer for the duration of the
    // callback; we bump it via CFRetain so we can safely read it here.
    let sample = unsafe { CFRetained::retain(sample_nn) };
    let sample_ref: &CMSampleBuffer = &sample;

    let (pts_ms, dts_ms) = timestamps_ms(sample_ref);
    let is_keyframe = is_sync_frame(sample_ref);

    let data = match copy_sample_bytes(sample_ref) {
        Ok(v) => v,
        Err(msg) => {
            state.record_error(msg);
            return;
        }
    };

    let format_description = match format_description(sample_ref) {
        Some(f) => f,
        None => {
            state.record_error("CMSampleBuffer missing format description".to_string());
            return;
        }
    };

    state.output_queue.push(CompressedFrame {
        data,
        pts_ms,
        dts_ms,
        is_keyframe,
        format_description: SendableFormatDescription::new(format_description),
    });
}

fn timestamps_ms(sample: &CMSampleBuffer) -> (u64, u64) {
    // SAFETY: simple FFI getters on a valid sample.
    #[allow(unsafe_code)]
    let pts = unsafe { sample.presentation_time_stamp() };
    #[allow(unsafe_code)]
    let dts = unsafe { sample.decode_time_stamp() };
    let pts_ms = cmtime_to_ms(pts);
    // DTS defaults to pts when invalid (AllowFrameReordering=false → dts == pts).
    let dts_ms = if dts.timescale <= 0 || dts.value < 0 {
        pts_ms
    } else {
        cmtime_to_ms(dts)
    };
    (pts_ms, dts_ms)
}

fn cmtime_to_ms(t: CMTime) -> u64 {
    if t.timescale <= 0 || t.value < 0 {
        return 0;
    }
    let num = (t.value as i128) * 1000i128;
    let den = t.timescale as i128;
    if den == 0 {
        return 0;
    }
    let ms = num / den;
    if ms < 0 {
        0
    } else {
        ms as u64
    }
}

fn is_sync_frame(sample: &CMSampleBuffer) -> bool {
    // SAFETY: FFI getter on a valid sample; passing `false` means we do not ask
    // CF to allocate a fresh attachments array, which keeps this read-only.
    #[allow(unsafe_code)]
    let attachments_opt = unsafe { sample.sample_attachments_array(false) };
    let Some(attachments) = attachments_opt else {
        // No attachments → treat as sync (AVFoundation default).
        return true;
    };
    let count = CFArray::count(&attachments);
    if count == 0 {
        return true;
    }
    // SAFETY: value_at_index with index 0 (in range due to count > 0) returns
    // a borrowed CFDictionary pointer owned by the array.
    #[allow(unsafe_code)]
    let dict_ptr = unsafe { CFArray::value_at_index(&attachments, 0) };
    if dict_ptr.is_null() {
        return true;
    }
    // SAFETY: VT documents this attachment dict as a CFDictionary<CFString, CFBoolean-ish>.
    #[allow(unsafe_code)]
    let dict = unsafe { &*(dict_ptr as *const CFDictionary) };
    // SAFETY: static CFString key with 'static lifetime.
    #[allow(unsafe_code)]
    let not_sync_key = unsafe { kCMSampleAttachmentKey_NotSync };
    // SAFETY: untyped CFDictionaryGetValue; we pass a CFString as key per Apple's spec.
    #[allow(unsafe_code)]
    let value_ptr = unsafe { dict.value(not_sync_key as *const CFString as *const _) };
    if value_ptr.is_null() {
        return true;
    }
    // SAFETY: value is a borrowed CFBoolean owned by the dictionary.
    #[allow(unsafe_code)]
    let b = unsafe { &*(value_ptr as *const CFBoolean) };
    // NotSync=true → not a keyframe; NotSync=false or absent → keyframe.
    !b.as_bool()
}

fn copy_sample_bytes(sample: &CMSampleBuffer) -> Result<Vec<u8>, String> {
    // SAFETY: data_buffer is a simple FFI getter.
    #[allow(unsafe_code)]
    let block_opt = unsafe { sample.data_buffer() };
    let Some(block) = block_opt else {
        return Err("CMSampleBuffer had no data buffer".to_string());
    };
    copy_block_bytes(&block)
}

fn copy_block_bytes(block: &CMBlockBuffer) -> Result<Vec<u8>, String> {
    // SAFETY: data_length is a simple FFI getter.
    #[allow(unsafe_code)]
    let total = unsafe { block.data_length() };
    if total == 0 {
        return Ok(Vec::new());
    }
    let mut out = vec![0u8; total];
    let dest = match NonNull::new(out.as_mut_ptr() as *mut c_void) {
        Some(p) => p,
        None => return Err("CMBlockBuffer dest pointer null".to_string()),
    };
    // SAFETY: dest points at `total` bytes we just allocated; FFI copies into it.
    #[allow(unsafe_code)]
    let status = unsafe { block.copy_data_bytes(0, total, dest) };
    if status != 0 {
        return Err(format!("CMBlockBufferCopyDataBytes status {status}"));
    }
    Ok(out)
}

fn format_description(sample: &CMSampleBuffer) -> Option<CFRetained<CMVideoFormatDescription>> {
    // SAFETY: FFI getter on a valid sample; returns retained or None.
    #[allow(unsafe_code)]
    unsafe {
        sample.format_description()
    }
}
