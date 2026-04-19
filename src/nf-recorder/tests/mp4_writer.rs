//! T-08 self-check · Mp4Writer writes fragmented MP4 with moov-front.
//!
//! Builds **one** real VT-encoded 1920×1080 H.264 frame (to obtain a valid
//! `CompressedFrame.format_description` carrying SPS/PPS), then replays its
//! AVCC bitstream 60 times into `Mp4Writer` with strictly increasing `pts_ms`.
//! The resulting MP4 is validated to:
//!   1. have `OutputStats.moov_front == true`
//!   2. exist on disk with a reasonable size
//!   3. have file-leading atoms `ftyp … moov …` before any `mdat`
//!
//! Tests run on macOS only.

#![cfg(target_os = "macos")]
#![allow(clippy::unwrap_used)] // integration tests are allowed to unwrap
#![allow(clippy::expect_used)]

use std::ptr::NonNull;

use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFType};
use objc2_core_video::{
    kCVPixelBufferHeightKey, kCVPixelBufferIOSurfacePropertiesKey,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelBufferWidthKey, kCVPixelFormatType_32BGRA,
    CVPixelBuffer, CVPixelBufferCreate, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
};

use nf_recorder::pipeline::mp4_writer::Mp4Writer;
use nf_recorder::pipeline::vt_wrap::{CompressedFrame, VtCompressor};
use nf_recorder::pipeline::ColorSpec;

const WIDTH: usize = 1920;
const HEIGHT: usize = 1080;
const FPS: u32 = 60;
const BITRATE: u32 = 12_000_000;
const FRAME_COUNT: usize = 60;

#[test]
fn writes_minimal_mp4_with_moov_front() {
    let tmp_path = std::env::temp_dir().join("test-mp4-writer.mp4");

    // ── Step 1: produce one real VT-encoded frame to capture a valid
    // format_description (avcC / SPS / PPS) + AVCC bitstream. ──────────────
    let template = encode_one_real_frame();

    // ── Step 2: replay 60 frames through Mp4Writer ──────────────────────────
    let mut writer = Mp4Writer::new(&tmp_path, WIDTH as u32, HEIGHT as u32, FPS)
        .expect("Mp4Writer::new failed");

    for i in 0..FRAME_COUNT {
        // 60 fps → 1000/60 ≈ 16 ms per frame (prompt asks pts_ms = i * 16).
        let pts_ms = (i as u64) * 16;
        let frame = CompressedFrame {
            data: template.data.clone(),
            pts_ms,
            dts_ms: pts_ms,
            is_keyframe: i == 0,
            format_description: template.format_description.clone(),
        };
        writer.append(&frame).expect("Mp4Writer::append failed");
    }

    let stats = writer.close().expect("Mp4Writer::close failed");

    // ── Step 3: assert OutputStats ──────────────────────────────────────────
    assert_eq!(stats.frames, FRAME_COUNT as u64, "expected 60 frames");
    assert!(stats.moov_front, "moov_front must be true");
    assert_eq!(stats.path, tmp_path, "output path round-trips");
    assert!(
        stats.size_bytes > 0,
        "file must be non-empty, got {} bytes",
        stats.size_bytes
    );

    // ── Step 4: re-verify moov-before-mdat by reading the file directly. ────
    let bytes = std::fs::read(&tmp_path).expect("read output file");
    let moov_before_mdat = scan_moov_before_mdat(&bytes);
    assert!(
        moov_before_mdat,
        "top-level atom layout should be ftyp -> moov -> … -> mdat (got layout with mdat before moov)"
    );

    // Print a summary for the test runner / auto-report.
    println!(
        "writes_minimal_mp4_with_moov_front ok · frames={} · size_bytes={} · moov_front={} · duration_ms={} · path={}",
        stats.frames, stats.size_bytes, stats.moov_front, stats.duration_ms, stats.path.display()
    );
}

// ─── helpers ────────────────────────────────────────────────────────────────

fn encode_one_real_frame() -> CompressedFrame {
    // Build a 1920×1080 32BGRA IOSurface-backed CVPixelBuffer.
    let attrs = pb_attributes();
    let mut pb_ptr: *mut CVPixelBuffer = std::ptr::null_mut();
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
    let pb_nn = NonNull::new(pb_ptr).expect("CVPixelBufferCreate returned null");
    let pixel_buffer: CFRetained<CVPixelBuffer> = unsafe { CFRetained::from_raw(pb_nn) };

    // Solid gray (128,128,128) BGRA.
    fill_solid(&pixel_buffer, 128, 128, 128);

    let compressor = VtCompressor::new(
        WIDTH as u32,
        HEIGHT as u32,
        FPS,
        BITRATE,
        ColorSpec::BT709_SDR_8bit,
    )
    .expect("VtCompressor::new failed");

    compressor
        .encode_pixel_buffer(&pixel_buffer, 0)
        .expect("encode_pixel_buffer failed");
    compressor.finalize().expect("VT finalize failed");

    // Pull the first produced CompressedFrame — this is our template.
    let mut produced: Option<CompressedFrame> = None;
    while let Some(cf) = compressor.poll_output() {
        if produced.is_none() {
            produced = Some(cf);
        }
    }
    produced.expect("VT produced no output frames")
}

fn pb_attributes() -> CFRetained<CFDictionary<CFType, CFType>> {
    let w = CFNumber::new_i32(WIDTH as i32);
    let h = CFNumber::new_i32(HEIGHT as i32);
    let fmt = CFNumber::new_i32(kCVPixelFormatType_32BGRA as i32);
    let iosurface = CFDictionary::<CFType, CFType>::empty();
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
    let lock_status = unsafe { CVPixelBufferLockBaseAddress(pb, CVPixelBufferLockFlags::empty()) };
    assert_eq!(lock_status, 0, "CVPixelBufferLockBaseAddress failed");

    let base = CVPixelBufferGetBaseAddress(pb);
    assert!(!base.is_null(), "CVPixelBufferGetBaseAddress null");
    let bytes_per_row = CVPixelBufferGetBytesPerRow(pb);

    let pixel: [u8; 4] = [b, g, r, 0xff];
    for row in 0..HEIGHT {
        let row_ptr = unsafe { (base as *mut u8).add(row * bytes_per_row) };
        for col in 0..WIDTH {
            unsafe {
                row_ptr
                    .add(col * 4)
                    .copy_from_nonoverlapping(pixel.as_ptr(), 4);
            }
        }
    }

    let _ = unsafe { CVPixelBufferUnlockBaseAddress(pb, CVPixelBufferLockFlags::empty()) };
}

/// Walk the top-level MP4 atoms in `bytes`. Returns true iff we reach the
/// first `moov` atom before any `mdat` atom.
fn scan_moov_before_mdat(bytes: &[u8]) -> bool {
    let mut offset: usize = 0;
    let mut saw_mdat = false;
    while offset + 8 <= bytes.len() {
        let size32 = u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ]);
        let atom_type = &bytes[offset + 4..offset + 8];
        let size = if size32 == 1 {
            if offset + 16 > bytes.len() {
                break;
            }
            let mut size64_bytes = [0u8; 8];
            size64_bytes.copy_from_slice(&bytes[offset + 8..offset + 16]);
            u64::from_be_bytes(size64_bytes)
        } else if size32 == 0 {
            (bytes.len() - offset) as u64
        } else {
            size32 as u64
        };
        if atom_type == b"moov" {
            return !saw_mdat;
        }
        if atom_type == b"mdat" {
            saw_mdat = true;
        }
        if size < 8 {
            return false;
        }
        let Ok(step) = usize::try_from(size) else {
            return false;
        };
        if step == 0 || offset.checked_add(step).is_none_or(|n| n > bytes.len()) {
            return false;
        }
        offset += step;
    }
    false
}
