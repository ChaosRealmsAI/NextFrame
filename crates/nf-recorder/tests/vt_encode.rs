//! T-07 self-check · VT compressor encodes a single BGRA frame into H.264.
//!
//! Creates a 1920×1080 32BGRA CVPixelBuffer (IOSurface-backed), fills it with a
//! solid color, encodes it via `VtCompressor::encode_pixel_buffer`, finalizes,
//! and asserts the output queue contains at least one `CompressedFrame` with:
//!   - `is_keyframe = true` (first frame of a new GOP)
//!   - a non-null `format_description` (SPS/PPS attached)
//!   - a non-empty AVCC bitstream
//!
//! Tests run on macOS only.

#![cfg(target_os = "macos")]
// Integration tests use `assert!` (panic) as the test-runner signal.
#![allow(clippy::panic)]
#![allow(clippy::assertions_on_constants)]

use std::ptr::NonNull;

use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFType};
use objc2_core_video::{
    kCVPixelBufferHeightKey, kCVPixelBufferIOSurfacePropertiesKey,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelBufferWidthKey, kCVPixelFormatType_32BGRA,
    CVPixelBuffer, CVPixelBufferCreate, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
};

use nf_recorder::pipeline::vt_wrap::VtCompressor;
use nf_recorder::pipeline::ColorSpec;

const WIDTH: usize = 1920;
const HEIGHT: usize = 1080;
const FPS: u32 = 60;
const BITRATE: u32 = 12_000_000;

#[test]
fn vt_encodes_single_iosurface() {
    // ── 1. Build a 1920×1080 32BGRA IOSurface-backed CVPixelBuffer ──────────
    let attrs = pb_attributes();

    let mut pb_ptr: *mut CVPixelBuffer = std::ptr::null_mut();
    // SAFETY: CVPixelBufferCreate with a valid attributes dict and a writable
    // out-pointer slot. The generic bounds on `attrs` contain CF types only.
    let status = unsafe {
        CVPixelBufferCreate(
            None,
            WIDTH,
            HEIGHT,
            kCVPixelFormatType_32BGRA,
            Some(attrs.as_ref()),
            NonNull::from(&mut pb_ptr),
        )
    };
    assert_eq!(status, 0, "CVPixelBufferCreate failed with {status}");
    let pb_nn = match NonNull::new(pb_ptr) {
        Some(p) => p,
        None => {
            assert!(false, "CVPixelBufferCreate returned null");
            return;
        }
    };
    // SAFETY: CVPixelBufferCreate hands back a +1-retained pointer.
    let pixel_buffer: CFRetained<CVPixelBuffer> = unsafe { CFRetained::from_raw(pb_nn) };

    // Fill solid teal (B=180, G=120, R=40, A=255) in BGRA order.
    fill_solid(&pixel_buffer, 180, 120, 40);

    // ── 2. Instantiate the VT compressor ────────────────────────────────────
    let compressor = match VtCompressor::new(
        WIDTH as u32,
        HEIGHT as u32,
        FPS,
        BITRATE,
        ColorSpec::BT709_SDR_8bit,
    ) {
        Ok(c) => c,
        Err(err) => {
            assert!(false, "VtCompressor::new failed: {err}");
            return;
        }
    };

    assert_eq!(compressor.width(), WIDTH as u32);
    assert_eq!(compressor.height(), HEIGHT as u32);
    assert_eq!(compressor.fps(), FPS);
    assert_eq!(compressor.bitrate_bps(), BITRATE);

    // ── 3. Encode one frame + finalize ──────────────────────────────────────
    if let Err(err) = compressor.encode_pixel_buffer(&pixel_buffer, 0) {
        assert!(false, "encode_pixel_buffer failed: {err}");
        return;
    }
    if let Err(err) = compressor.finalize() {
        assert!(false, "finalize failed: {err}");
        return;
    }

    // ── 4. Drain the output queue ───────────────────────────────────────────
    let mut frames = Vec::new();
    while let Some(cf) = compressor.poll_output() {
        frames.push(cf);
    }

    assert!(
        !frames.is_empty(),
        "expected at least one CompressedFrame after finalize, got 0"
    );

    let first = &frames[0];
    assert!(
        first.is_keyframe,
        "first encoded frame must be an IDR keyframe"
    );
    assert!(!first.data.is_empty(), "AVCC bitstream was empty");
    assert_eq!(first.pts_ms, 0, "first frame pts should be 0");

    // Format description sanity: the wrapper must round-trip through
    // SendableFormatDescription without losing the pointer.
    let _fmt = first.format_description.as_ref_format();

    println!(
        "vt_encodes_single_iosurface ok · frames={} · bytes={} · keyframe={}",
        frames.len(),
        first.data.len(),
        first.is_keyframe
    );
}

fn pb_attributes() -> CFRetained<CFDictionary<CFType, CFType>> {
    let w = CFNumber::new_i32(WIDTH as i32);
    let h = CFNumber::new_i32(HEIGHT as i32);
    let fmt = CFNumber::new_i32(kCVPixelFormatType_32BGRA as i32);
    let iosurface = CFDictionary::<CFType, CFType>::empty();
    // SAFETY: CFDictionary::from_slices accepts CF-typed refs with matching counts.
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

fn fill_solid(pb: &CVPixelBuffer, b: u8, g: u8, r: u8) {
    // SAFETY: FFI lock/unlock pair on a valid buffer.
    let lock_status = unsafe { CVPixelBufferLockBaseAddress(pb, CVPixelBufferLockFlags::empty()) };
    assert_eq!(lock_status, 0, "CVPixelBufferLockBaseAddress failed");

    let base = CVPixelBufferGetBaseAddress(pb);
    assert!(!base.is_null(), "CVPixelBufferGetBaseAddress null");
    let bytes_per_row = CVPixelBufferGetBytesPerRow(pb);

    let pixel: [u8; 4] = [b, g, r, 0xff];
    for row in 0..HEIGHT {
        // SAFETY: row * bytes_per_row stays within the locked pixel buffer.
        let row_ptr = unsafe { (base as *mut u8).add(row * bytes_per_row) };
        for col in 0..WIDTH {
            // SAFETY: col * 4 stays within a row of WIDTH BGRA pixels.
            unsafe {
                row_ptr
                    .add(col * 4)
                    .copy_from_nonoverlapping(pixel.as_ptr(), 4);
            }
        }
    }

    // SAFETY: balances the earlier Lock call.
    let _unlock = unsafe { CVPixelBufferUnlockBaseAddress(pb, CVPixelBufferLockFlags::empty()) };
}
