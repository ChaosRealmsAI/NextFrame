use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use mp4_atom::{Atom, Decode, Header, Hev1};
use objc2_core_foundation::{
    CFBoolean, CFData, CFDictionary, CFNumber, CFRetained, CFString, CFType,
};
use objc2_core_media::{
    kCMTimeInvalid, kCMVideoCodecType_HEVC, CMBlockBuffer, CMSampleBuffer, CMTime,
    CMVideoFormatDescription, CMVideoFormatDescriptionCopyAsBigEndianImageDescriptionBlockBuffer,
};
use objc2_core_video::{
    kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_2020,
    kCVImageBufferContentLightLevelInfoKey, kCVImageBufferMasteringDisplayColorVolumeKey,
    kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ,
    kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_2020,
    kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferMetalCompatibilityKey,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelFormatType_ARGB2101010LEPacked, CVAttachmentMode,
    CVBuffer, CVImageBuffer, CVPixelBuffer,
};
use objc2_video_toolbox::{
    kVTCompressionPropertyKey_AllowFrameReordering, kVTCompressionPropertyKey_ColorPrimaries,
    kVTCompressionPropertyKey_ContentLightLevelInfo, kVTCompressionPropertyKey_ExpectedFrameRate,
    kVTCompressionPropertyKey_HDRMetadataInsertionMode,
    kVTCompressionPropertyKey_MasteringDisplayColorVolume,
    kVTCompressionPropertyKey_MaxKeyFrameInterval, kVTCompressionPropertyKey_ProfileLevel,
    kVTCompressionPropertyKey_Quality, kVTCompressionPropertyKey_RealTime,
    kVTCompressionPropertyKey_TransferFunction, kVTCompressionPropertyKey_YCbCrMatrix,
    kVTHDRMetadataInsertionMode_Auto, kVTProfileLevel_HEVC_Main10_AutoLevel,
    kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder,
    kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder, VTCompressionSession,
    VTEncodeInfoFlags, VTSession, VTSessionSetProperty,
};

use crate::sei_injector::{
    prepend_hdr10_prefix_sei, HDR10_CONTENT_LIGHT_BYTES, HDR10_MASTERING_DISPLAY_BYTES,
};

pub struct EncodedSample {
    pub pts: u64,
    pub duration: u32,
    pub is_sync: bool,
    pub data: Vec<u8>,
    pub sample_entry: Hev1,
}

struct CallbackState {
    inner: Mutex<CallbackInner>,
    cv: Condvar,
}

struct FrameContext {
    expected_sync: bool,
}

#[derive(Default)]
struct CallbackInner {
    queue: VecDeque<Result<EncodedSample, String>>,
}

pub struct Encoder {
    session: CFRetained<VTCompressionSession>,
    callback_state: Arc<CallbackState>,
    callback_ref_con: *const CallbackState,
    fps: u32,
}

impl Encoder {
    pub fn new(width: usize, height: usize, fps: u32) -> Result<Self> {
        let encoder_spec = CFDictionary::<CFType, CFType>::from_slices(
            &[
                // SAFETY: These VideoToolbox keys are process-global constants.
                unsafe { kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder }
                    .as_ref(),
                // SAFETY: These VideoToolbox keys are process-global constants.
                unsafe { kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder }
                    .as_ref(),
            ],
            &[CFBoolean::new(true).as_ref(), CFBoolean::new(true).as_ref()],
        );
        let empty = CFDictionary::<CFType, CFType>::from_slices(&[], &[]);
        let source_attrs = CFDictionary::<CFType, CFType>::from_slices(
            &[
                // SAFETY: These CoreVideo keys are process-global constants.
                unsafe { kCVPixelBufferPixelFormatTypeKey }.as_ref(),
                // SAFETY: These CoreVideo keys are process-global constants.
                unsafe { kCVPixelBufferMetalCompatibilityKey }.as_ref(),
                // SAFETY: These CoreVideo keys are process-global constants.
                unsafe { kCVPixelBufferIOSurfacePropertiesKey }.as_ref(),
            ],
            &[
                CFNumber::new_i32(kCVPixelFormatType_ARGB2101010LEPacked as i32).as_ref(),
                CFBoolean::new(true).as_ref(),
                empty.as_ref(),
            ],
        );

        let callback_state = Arc::new(CallbackState {
            inner: Mutex::new(CallbackInner::default()),
            cv: Condvar::new(),
        });
        let callback_ref_con = Arc::into_raw(callback_state.clone());

        let mut raw_session: *mut VTCompressionSession = std::ptr::null_mut();
        // SAFETY: VTCompressionSessionCreate initializes a new retained session in `raw_session`.
        let status = unsafe {
            VTCompressionSession::create(
                None,
                width as i32,
                height as i32,
                kCMVideoCodecType_HEVC,
                Some(encoder_spec.as_ref()),
                Some(source_attrs.as_ref()),
                None,
                Some(output_callback),
                callback_ref_con.cast_mut().cast(),
                NonNull::from(&mut raw_session),
            )
        };
        cvt(status, "VTCompressionSessionCreate")?;
        let raw_session = NonNull::new(raw_session).context("VTCompressionSession was null")?;
        // SAFETY: VTCompressionSessionCreate returns a +1 retained session.
        let session = unsafe { CFRetained::from_raw(raw_session) };
        let encoder = Self {
            session,
            callback_state,
            callback_ref_con,
            fps,
        };
        encoder.configure()?;
        Ok(encoder)
    }

    pub fn encode_frame(
        &mut self,
        frame_index: u32,
        pixel_buffer: &CVPixelBuffer,
    ) -> Result<EncodedSample> {
        self.attach_color_metadata(pixel_buffer)?;
        let pts = unsafe { CMTime::new(frame_index as i64, self.fps as i32) };
        let duration = unsafe { CMTime::new(1, self.fps as i32) };
        let mut flags = VTEncodeInfoFlags::empty();
        // SAFETY: The pixel buffer stays alive for the duration of the synchronous encode call setup.
        let status = unsafe {
            self.session.encode_frame(
                as_cv_image_buffer(pixel_buffer),
                pts,
                duration,
                None,
                Box::into_raw(Box::new(FrameContext {
                    expected_sync: frame_index == 0 || frame_index.is_multiple_of(self.fps),
                }))
                .cast(),
                &mut flags,
            )
        };
        cvt(status, "VTCompressionSessionEncodeFrame")?;

        let mut guard = self
            .callback_state
            .inner
            .lock()
            .map_err(|_| anyhow!("encoder callback mutex poisoned"))?;
        loop {
            if let Some(sample) = guard.queue.pop_front() {
                return sample.map_err(|message| anyhow!(message));
            }
            let (next_guard, timeout) = self
                .callback_state
                .cv
                .wait_timeout(guard, Duration::from_secs(5))
                .map_err(|_| anyhow!("encoder callback condvar poisoned"))?;
            guard = next_guard;
            if timeout.timed_out() {
                bail!("timed out waiting for VTCompressionSession output");
            }
        }
    }

    pub fn finish(&mut self) -> Result<()> {
        cvt(
            // SAFETY: Flushing outstanding frames is required before tearing down the encoder.
            unsafe { self.session.complete_frames(kCMTimeInvalid) },
            "VTCompressionSessionCompleteFrames",
        )
    }

    fn configure(&self) -> Result<()> {
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_ProfileLevel },
            // SAFETY: The profile value is a constant singleton value.
            unsafe { kVTProfileLevel_HEVC_Main10_AutoLevel }.as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_RealTime },
            CFBoolean::new(false).as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_AllowFrameReordering },
            CFBoolean::new(false).as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_ExpectedFrameRate },
            CFNumber::new_i32(self.fps as i32).as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_MaxKeyFrameInterval },
            CFNumber::new_i32(self.fps as i32).as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_Quality },
            CFNumber::new_f32(0.85).as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_ColorPrimaries },
            // SAFETY: The value is a constant singleton value.
            unsafe { kCVImageBufferColorPrimaries_ITU_R_2020 }.as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_TransferFunction },
            // SAFETY: The value is a constant singleton value.
            unsafe { kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ }.as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_YCbCrMatrix },
            // SAFETY: The value is a constant singleton value.
            unsafe { kCVImageBufferYCbCrMatrix_ITU_R_2020 }.as_ref(),
        )?;

        let mastering = CFData::from_bytes(&HDR10_MASTERING_DISPLAY_BYTES);
        let clli = CFData::from_bytes(&HDR10_CONTENT_LIGHT_BYTES);
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_MasteringDisplayColorVolume },
            mastering.as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_ContentLightLevelInfo },
            clli.as_ref(),
        )?;
        set_property(
            &self.session,
            // SAFETY: The property key is a constant singleton value.
            unsafe { kVTCompressionPropertyKey_HDRMetadataInsertionMode },
            // SAFETY: The value is a constant singleton value.
            unsafe { kVTHDRMetadataInsertionMode_Auto }.as_ref(),
        )?;
        cvt(
            // SAFETY: Preparing the session finalizes its configuration before frame submission.
            unsafe { self.session.prepare_to_encode_frames() },
            "VTCompressionSessionPrepareToEncodeFrames",
        )
    }

    fn attach_color_metadata(&self, pixel_buffer: &CVPixelBuffer) -> Result<()> {
        let mastering = CFData::from_bytes(&HDR10_MASTERING_DISPLAY_BYTES);
        let clli = CFData::from_bytes(&HDR10_CONTENT_LIGHT_BYTES);
        let buffer = as_cv_buffer(pixel_buffer);
        // SAFETY: The pixel buffer is live for the duration of the encode and attachments are copied/retained by CVBuffer.
        unsafe {
            buffer.set_attachment(
                kCVImageBufferColorPrimariesKey,
                kCVImageBufferColorPrimaries_ITU_R_2020.as_ref(),
                CVAttachmentMode::ShouldPropagate,
            );
            buffer.set_attachment(
                kCVImageBufferTransferFunctionKey,
                kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ.as_ref(),
                CVAttachmentMode::ShouldPropagate,
            );
            buffer.set_attachment(
                kCVImageBufferYCbCrMatrixKey,
                kCVImageBufferYCbCrMatrix_ITU_R_2020.as_ref(),
                CVAttachmentMode::ShouldPropagate,
            );
            buffer.set_attachment(
                kCVImageBufferMasteringDisplayColorVolumeKey,
                mastering.as_ref(),
                CVAttachmentMode::ShouldPropagate,
            );
            buffer.set_attachment(
                kCVImageBufferContentLightLevelInfoKey,
                clli.as_ref(),
                CVAttachmentMode::ShouldPropagate,
            );
        }
        Ok(())
    }
}

impl Drop for Encoder {
    fn drop(&mut self) {
        // SAFETY: Invalidating the session is required before dropping it.
        unsafe {
            self.session.invalidate();
            drop(Arc::from_raw(self.callback_ref_con));
        }
    }
}

unsafe extern "C-unwind" fn output_callback(
    output_ref_con: *mut c_void,
    source_frame_ref_con: *mut c_void,
    status: i32,
    _info_flags: VTEncodeInfoFlags,
    sample_buffer: *mut CMSampleBuffer,
) {
    // SAFETY: `output_ref_con` is the Arc pointer installed at session creation time.
    let state = unsafe { Arc::from_raw(output_ref_con.cast::<CallbackState>()) };
    let frame_context = if source_frame_ref_con.is_null() {
        None
    } else {
        // SAFETY: `source_frame_ref_con` is the Box<FrameContext> pointer submitted with the frame.
        Some(unsafe { Box::from_raw(source_frame_ref_con.cast::<FrameContext>()) })
    };
    let result = collect_encoded_sample(
        status,
        sample_buffer,
        frame_context
            .as_ref()
            .map(|context| context.expected_sync)
            .unwrap_or(false),
    );
    if let Ok(mut guard) = state.inner.lock() {
        guard.queue.push_back(result);
        state.cv.notify_all();
    }
    let _ = Arc::into_raw(state);
}

fn collect_encoded_sample(
    status: i32,
    sample_buffer: *mut CMSampleBuffer,
    expected_sync: bool,
) -> Result<EncodedSample, String> {
    if status != 0 {
        return Err(format!("encoder callback returned status {status}"));
    }
    // SAFETY: VideoToolbox returns a valid sample buffer pointer when `status == 0`.
    let sample = unsafe { sample_buffer.as_ref() }
        .ok_or_else(|| "encoder callback returned null sample".to_string())?;
    // SAFETY: Encoded output always carries a CMBlockBuffer payload.
    let block = unsafe { sample.data_buffer() }
        .ok_or_else(|| "compressed sample missing block buffer".to_string())?;
    let data_len = unsafe { block.data_length() };
    let mut data = vec![0_u8; data_len];
    let dst = NonNull::new(data.as_mut_ptr().cast::<c_void>())
        .ok_or_else(|| "failed to construct output buffer pointer".to_string())?;
    // SAFETY: `dst` points at a writable buffer of `data_len` bytes.
    let block_status = unsafe { block.copy_data_bytes(0, data_len, dst) };
    if block_status != 0 {
        return Err(format!("CMBlockBufferCopyDataBytes failed: {block_status}"));
    }

    // SAFETY: The encoded sample carries a live format description.
    let format = unsafe { sample.format_description() }
        .ok_or_else(|| "missing format description".to_string())?;
    // SAFETY: HEVC video samples use CMVideoFormatDescription at this pointer.
    let video_format = unsafe { &*((&*format as *const _) as *const CMVideoFormatDescription) };
    let sample_entry =
        copy_sample_entry(video_format).map_err(|error: anyhow::Error| error.to_string())?;

    let pts = unsafe { sample.presentation_time_stamp() };
    let duration = unsafe { sample.duration() };
    let data = if expected_sync {
        prepend_hdr10_prefix_sei(&data)
    } else {
        data
    };
    Ok(EncodedSample {
        pts: pts.value as u64,
        duration: duration.value.max(1) as u32,
        is_sync: expected_sync,
        data,
        sample_entry,
    })
}

fn copy_sample_entry(video_format: &CMVideoFormatDescription) -> Result<Hev1> {
    let mut raw: *mut CMBlockBuffer = std::ptr::null_mut();
    // SAFETY: CoreMedia fills `raw` with an owned block buffer holding the sample entry bytes.
    cvt(
        unsafe {
            CMVideoFormatDescriptionCopyAsBigEndianImageDescriptionBlockBuffer(
                None,
                video_format,
                CFString::system_encoding(),
                Some(objc2_core_media::kCMImageDescriptionFlavor_ISOFamily),
                NonNull::from(&mut raw),
            )
        },
        "CMVideoFormatDescriptionCopyAsBigEndianImageDescriptionBlockBuffer",
    )?;
    let block = NonNull::new(raw).context("sample description block buffer was null")?;
    // SAFETY: The CoreMedia call returned a retained block buffer.
    let block = unsafe { CFRetained::from_raw(block) };
    let len = unsafe { block.data_length() };
    let mut bytes = vec![0_u8; len];
    let dst = NonNull::new(bytes.as_mut_ptr().cast::<c_void>())
        .context("sample description destination pointer was null")?;
    // SAFETY: `dst` points to a writable byte vector of the requested size.
    cvt(
        unsafe { block.copy_data_bytes(0, len, dst) },
        "CMBlockBufferCopyDataBytes(sample description)",
    )?;
    if bytes.len() >= 8 && &bytes[4..8] == b"hvc1" {
        bytes[4..8].copy_from_slice(b"hev1");
    }
    let mut body = bytes.as_slice();
    let header = Header::decode(&mut body).map_err(|error| anyhow!(error))?;
    if header.kind != (*b"hev1").into() {
        bail!("expected hev1 sample entry, got {}", header.kind);
    }
    let size = header.size.context("hev1 sample entry size missing")?;
    let mut atom_body = body[..size].as_ref();
    let mut hev1 = Hev1::decode_body(&mut atom_body).map_err(|error| anyhow!(error))?;
    hev1.data_reference_index = 1;
    Ok(hev1)
}

fn set_property(session: &VTCompressionSession, key: &CFString, value: &CFType) -> Result<()> {
    cvt(
        // SAFETY: The session is live and both key/value point at immutable CoreFoundation objects.
        unsafe { VTSessionSetProperty(as_vt_session(session), key, Some(value)) },
        &format!("VTSessionSetProperty({key})"),
    )
}

fn as_vt_session(session: &VTCompressionSession) -> &VTSession {
    // SAFETY: VTCompressionSession is toll-free bridged to VTSession.
    unsafe { &*(session as *const VTCompressionSession as *const VTSession) }
}

fn as_cv_image_buffer(pixel: &CVPixelBuffer) -> &CVImageBuffer {
    // SAFETY: CVPixelBuffer is a subtype of CVImageBuffer.
    unsafe { &*(pixel as *const CVPixelBuffer as *const CVImageBuffer) }
}

fn as_cv_buffer(pixel: &CVPixelBuffer) -> &CVBuffer {
    pixel
}

fn cvt(status: i32, context: &str) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        bail!("{context} failed with OSStatus {status}")
    }
}
