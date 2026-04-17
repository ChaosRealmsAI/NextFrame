use std::ptr::NonNull;
use std::slice;

use anyhow::{Context, Result, bail};
use objc2_core_foundation::{CFBoolean, CFDictionary, CFNumber, CFRetained, CFType};
use objc2_core_video::{
    CVPixelBuffer, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow, CVPixelBufferGetHeight,
    CVPixelBufferGetPixelFormatType, CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress,
    CVPixelBufferLockFlags, CVPixelBufferPool, CVPixelBufferUnlockBaseAddress,
    kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferPixelFormatTypeKey,
    kCVPixelBufferWidthKey, kCVPixelBufferHeightKey, kCVPixelBufferMetalCompatibilityKey,
    kCVPixelFormatType_32BGRA,
};

#[derive(Debug, Clone, Copy)]
pub enum Pattern {
    MovingRect,
}

pub fn make_bgra_test_frame(
    width: usize,
    height: usize,
    frame_index: u32,
) -> Result<CFRetained<CVPixelBuffer>> {
    let pool = create_pool(width, height)?;
    let mut raw = std::ptr::null_mut();
    // SAFETY: CoreVideo creates an owned pixel buffer in the provided out pointer.
    let status = unsafe {
        CVPixelBufferPool::create_pixel_buffer(None, pool.as_ref(), NonNull::from(&mut raw))
    };
    cvt(status, "CVPixelBufferPoolCreatePixelBuffer")?;
    let pixel_buffer = NonNull::new(raw).context("pattern pixel buffer was null")?;
    // SAFETY: CoreVideo returned a +1 retained pixel buffer in `raw`.
    let pixel_buffer = unsafe { CFRetained::from_raw(pixel_buffer) };
    fill_bgra_pattern(pixel_buffer.as_ref(), Pattern::MovingRect, frame_index)?;
    Ok(pixel_buffer)
}

pub fn fill_bgra_pattern(
    pixel_buffer: &CVPixelBuffer,
    pattern: Pattern,
    frame_index: u32,
) -> Result<()> {
    let width = CVPixelBufferGetWidth(pixel_buffer);
    let height = CVPixelBufferGetHeight(pixel_buffer);
    let pixel_format = CVPixelBufferGetPixelFormatType(pixel_buffer);
    if pixel_format != kCVPixelFormatType_32BGRA {
        bail!("unexpected pattern pixel format 0x{pixel_format:08x}");
    }

    // SAFETY: Locking the base address is required before mutating the pixel buffer bytes.
    let status =
        unsafe { CVPixelBufferLockBaseAddress(pixel_buffer, CVPixelBufferLockFlags::empty()) };
    cvt(status, "CVPixelBufferLockBaseAddress")?;

    let fill_result = fill_locked(pixel_buffer, pattern, frame_index, width, height);

    // SAFETY: Unlocking balances the successful lock above.
    let unlock_status =
        unsafe { CVPixelBufferUnlockBaseAddress(pixel_buffer, CVPixelBufferLockFlags::empty()) };
    cvt(unlock_status, "CVPixelBufferUnlockBaseAddress")?;

    fill_result
}

fn fill_locked(
    pixel_buffer: &CVPixelBuffer,
    pattern: Pattern,
    frame_index: u32,
    width: usize,
    height: usize,
) -> Result<()> {
    let stride = CVPixelBufferGetBytesPerRow(pixel_buffer);
    let base = NonNull::new(CVPixelBufferGetBaseAddress(pixel_buffer).cast::<u8>())
        .context("pattern pixel buffer base address was null")?;
    for y in 0..height {
        // SAFETY: The buffer is locked and `stride` bytes are valid for each row.
        let row = unsafe { slice::from_raw_parts_mut(base.as_ptr().add(y * stride), stride) };
        for x in 0..width {
            let [r, g, b, a] = pattern_pixel(pattern, x, y, width, height, frame_index);
            let offset = x * 4;
            row[offset] = b;
            row[offset + 1] = g;
            row[offset + 2] = r;
            row[offset + 3] = a;
        }
    }
    Ok(())
}

fn pattern_pixel(
    pattern: Pattern,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
    frame_index: u32,
) -> [u8; 4] {
    match pattern {
        Pattern::MovingRect => {
            let rect_w = (width / 4).max(40);
            let rect_h = (height / 4).max(40);
            let span_x = width + rect_w;
            let span_y = height + rect_h;
            let rect_x = ((frame_index as usize * 19) % span_x).saturating_sub(rect_w / 2);
            let rect_y = ((frame_index as usize * 11) % span_y).saturating_sub(rect_h / 2);
            let in_rect = x >= rect_x
                && x < rect_x.saturating_add(rect_w)
                && y >= rect_y
                && y < rect_y.saturating_add(rect_h);

            if in_rect {
                [234, 51, 35, 255]
            } else {
                let xr = ((x as f32 / width.max(1) as f32) * 90.0).round() as u8;
                let yg = ((y as f32 / height.max(1) as f32) * 80.0).round() as u8;
                [10 + xr / 2, 24 + yg / 2, 64 + xr, 255]
            }
        }
    }
}

fn create_pool(width: usize, height: usize) -> Result<CFRetained<CVPixelBufferPool>> {
    let empty = CFDictionary::<CFType, CFType>::from_slices(&[], &[]);
    let attrs = CFDictionary::<CFType, CFType>::from_slices(
        &[
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferPixelFormatTypeKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferWidthKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferHeightKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferMetalCompatibilityKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferIOSurfacePropertiesKey }.as_ref(),
        ],
        &[
            CFNumber::new_i32(kCVPixelFormatType_32BGRA as i32).as_ref(),
            CFNumber::new_i32(width as i32).as_ref(),
            CFNumber::new_i32(height as i32).as_ref(),
            CFBoolean::new(true).as_ref(),
            empty.as_ref(),
        ],
    );
    let mut raw = std::ptr::null_mut();
    // SAFETY: CoreVideo initializes the pool and stores it in the out pointer on success.
    let status = unsafe {
        CVPixelBufferPool::create(None, None, Some(attrs.as_ref()), NonNull::from(&mut raw))
    };
    cvt(status, "CVPixelBufferPoolCreate")?;
    let raw = NonNull::new(raw).context("CVPixelBufferPoolCreate returned null")?;
    // SAFETY: CoreVideo returns a retained pool reference in `raw`.
    Ok(unsafe { CFRetained::from_raw(raw) })
}

fn cvt(status: i32, context: &str) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        bail!("{context} failed with OSStatus {status}")
    }
}
