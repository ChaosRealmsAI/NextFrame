//! CVPixelBuffer creation from CGImage with optional progress overlay.

use std::ptr;

use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo, CGImageByteOrderInfo,
};
use objc2_core_media::CMTime;
use objc2_foundation::{NSDictionary, NSObject, NSString};
use objc2_foundation::{NSPoint as CGPoint, NSRect as CGRect, NSSize as CGSize};

use super::config::pixel_buffer_attributes;
use super::{
    CVBufferRelease, CVPixelBufferCreate, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
    CVPixelBufferLockBaseAddress, CVPixelBufferRef, CVPixelBufferUnlockBaseAddress, FrameSize,
    K_CV_PIXEL_FORMAT_TYPE_32_BGRA,
};
use crate::progress::ProgressOverlay;

// CGInterpolationQuality values
#[allow(non_upper_case_globals)]
const kCGInterpolationHigh: i32 = 3;

// SAFETY: This imports CoreGraphics with the declared system signature for valid CGContext pointers.
unsafe extern "C" {
    // SAFETY: see above.
    fn CGContextSetInterpolationQuality(context: *const std::ffi::c_void, quality: i32);
}

/// Creates a CVPixelBuffer at `output_size` and draws the CGImage into it.
/// If the image is smaller than the output, it is upscaled with high-quality interpolation.
pub(super) fn create_pixel_buffer_from_cgimage_scaled(
    image: &CGImage,
    output_size: FrameSize,
    overlay: Option<ProgressOverlay<'_>>,
) -> Result<CVPixelBufferRef, String> {
    let frame_size = output_size;
    let image_w = CGImage::width(Some(image));
    let image_h = CGImage::height(Some(image));
    let is_upscaling = image_w < frame_size.width || image_h < frame_size.height;

    let attributes = pixel_buffer_attributes(frame_size);
    let mut pixel_buffer: CVPixelBufferRef = ptr::null_mut();
    // SAFETY: `pixel_buffer` is writable out-storage, and the attributes match this BGRA buffer request.
    let create_result = unsafe {
        // SAFETY: see above.
        CVPixelBufferCreate(
            ptr::null(),
            frame_size.width,
            frame_size.height,
            K_CV_PIXEL_FORMAT_TYPE_32_BGRA,
            (&*attributes as *const NSDictionary<NSString, NSObject>).cast(),
            &mut pixel_buffer,
        )
    };
    if create_result != 0 || pixel_buffer.is_null() {
        return Err(format!(
            "CVPixelBufferCreate failed with status {}",
            create_result
        ));
    }

    // SAFETY: `pixel_buffer` is a live `CVPixelBufferRef` returned by `CVPixelBufferCreate`.
    let lock_result = unsafe { CVPixelBufferLockBaseAddress(pixel_buffer, 0) }; // SAFETY: see above.
    if lock_result != 0 {
        // SAFETY: this function still owns the created `pixel_buffer` on the error path.
        unsafe { CVBufferRelease(pixel_buffer) }; // SAFETY: see above.
        return Err(format!(
            "CVPixelBufferLockBaseAddress failed with status {}",
            lock_result
        ));
    }

    let draw_result = (|| {
        // SAFETY: the locked pixel buffer exposes a valid base address for direct access.
        let base_address = unsafe { CVPixelBufferGetBaseAddress(pixel_buffer) }; // SAFETY: see above.
        if base_address.is_null() {
            return Err("CVPixelBuffer base address was null".to_string());
        }
        // SAFETY: the locked pixel buffer permits querying its row stride.
        let bytes_per_row = unsafe { CVPixelBufferGetBytesPerRow(pixel_buffer) }; // SAFETY: see above.
        let color_space =
            CGColorSpace::new_device_rgb().ok_or("CGColorSpace::new_device_rgb returned nil")?;
        let bitmap_info =
            CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
        // SAFETY: `base_address`, dimensions, stride, and format match the locked BGRA pixel buffer.
        let context = unsafe {
            // SAFETY: see above.
            CGBitmapContextCreate(
                base_address,
                frame_size.width,
                frame_size.height,
                8,
                bytes_per_row,
                Some(color_space.as_ref()),
                bitmap_info,
            )
        }
        .ok_or("CGBitmapContextCreate returned nil")?;

        // Set high-quality interpolation when upscaling
        if is_upscaling {
            // SAFETY: `context` is live, and CoreGraphics accepts its pointer for interpolation changes.
            unsafe {
                // SAFETY: see above.
                let ctx_ptr: *const CGContext = &*context;
                CGContextSetInterpolationQuality(ctx_ptr.cast(), kCGInterpolationHigh);
            }
        }

        // Draw image — if smaller than output, CGContext automatically upscales
        CGContext::draw_image(
            Some(context.as_ref()),
            CGRect::new(
                CGPoint::new(0.0, 0.0),
                CGSize::new(frame_size.width as f64, frame_size.height as f64),
            ),
            Some(image),
        );
        // Draw progress bar overlay
        if let Some(ov) = overlay {
            draw_progress_overlay(context.as_ref(), frame_size.height, &ov);
        }
        Ok(())
    })();

    // SAFETY: `pixel_buffer` is still locked, and this call balances the earlier lock.
    let unlock_result = unsafe { CVPixelBufferUnlockBaseAddress(pixel_buffer, 0) }; // SAFETY: see above.
    if unlock_result != 0 {
        // SAFETY: this function still owns the created `pixel_buffer` on the error path.
        unsafe { CVBufferRelease(pixel_buffer) }; // SAFETY: see above.
        return Err(format!(
            "CVPixelBufferUnlockBaseAddress failed with status {}",
            unlock_result
        ));
    }

    if let Err(err) = draw_result {
        // SAFETY: the caller has not taken ownership yet, so this function must release the buffer.
        unsafe { CVBufferRelease(pixel_buffer) }; // SAFETY: see above.
        return Err(err);
    }

    Ok(pixel_buffer)
}

pub(super) fn create_pixel_buffer_from_cgimage(
    image: &CGImage,
    overlay: Option<ProgressOverlay<'_>>,
) -> Result<CVPixelBufferRef, String> {
    let frame_size = FrameSize {
        width: CGImage::width(Some(image)),
        height: CGImage::height(Some(image)),
    };
    let attributes = pixel_buffer_attributes(frame_size);
    let mut pixel_buffer: CVPixelBufferRef = ptr::null_mut();
    // SAFETY: `pixel_buffer` is writable out-storage, and the attributes match this BGRA buffer request.
    let create_result = unsafe {
        // SAFETY: see above.
        CVPixelBufferCreate(
            ptr::null(),
            frame_size.width,
            frame_size.height,
            K_CV_PIXEL_FORMAT_TYPE_32_BGRA,
            (&*attributes as *const NSDictionary<NSString, NSObject>).cast(),
            &mut pixel_buffer,
        )
    };
    if create_result != 0 || pixel_buffer.is_null() {
        return Err(format!(
            "CVPixelBufferCreate failed with status {}",
            create_result
        ));
    }

    // SAFETY: `pixel_buffer` is a live `CVPixelBufferRef` returned by `CVPixelBufferCreate`.
    let lock_result = unsafe { CVPixelBufferLockBaseAddress(pixel_buffer, 0) }; // SAFETY: see above.
    if lock_result != 0 {
        // SAFETY: this function still owns the created `pixel_buffer` on the error path.
        unsafe {
            // SAFETY: see above.
            CVBufferRelease(pixel_buffer);
        }
        return Err(format!(
            "CVPixelBufferLockBaseAddress failed with status {}",
            lock_result
        ));
    }

    let draw_result = (|| {
        // SAFETY: the locked pixel buffer exposes a valid base address for direct access.
        let base_address = unsafe { CVPixelBufferGetBaseAddress(pixel_buffer) }; // SAFETY: see above.
        if base_address.is_null() {
            return Err("CVPixelBuffer base address was null".to_string());
        }
        // SAFETY: the locked pixel buffer permits querying its row stride.
        let bytes_per_row = unsafe { CVPixelBufferGetBytesPerRow(pixel_buffer) }; // SAFETY: see above.
        let color_space =
            CGColorSpace::new_device_rgb().ok_or("CGColorSpace::new_device_rgb returned nil")?;
        let bitmap_info =
            CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
        // SAFETY: `base_address`, dimensions, stride, and format match the locked BGRA pixel buffer.
        let context = unsafe {
            // SAFETY: see above.
            CGBitmapContextCreate(
                base_address,
                frame_size.width,
                frame_size.height,
                8,
                bytes_per_row,
                Some(color_space.as_ref()),
                bitmap_info,
            )
        }
        .ok_or("CGBitmapContextCreate returned nil")?;
        CGContext::draw_image(
            Some(context.as_ref()),
            CGRect::new(
                CGPoint::new(0.0, 0.0),
                CGSize::new(frame_size.width as f64, frame_size.height as f64),
            ),
            Some(image),
        );
        // Draw progress bar overlay + segment dots
        if let Some(ov) = overlay {
            let cg_y = frame_size.height.saturating_sub(ov.y + ov.h);
            // Fill bar
            if ov.fill_w > 0 {
                CGContext::set_rgb_fill_color(Some(context.as_ref()), ov.r, ov.g, ov.b, 0.9);
                CGContext::fill_rect(
                    Some(context.as_ref()),
                    CGRect::new(
                        CGPoint::new(ov.x as f64, cg_y as f64),
                        CGSize::new(ov.fill_w as f64, ov.h as f64),
                    ),
                );
            }
            // Segment dividers (thin vertical bars, same height as progress bar)
            let div_w = 2.0_f64.max(ov.h as f64 * 0.4);
            CGContext::set_rgb_fill_color(Some(context.as_ref()), 1.0, 1.0, 1.0, 0.7);
            for &ratio in ov.dots {
                let div_x = ov.x as f64 + ov.max_w as f64 * ratio - div_w / 2.0;
                CGContext::fill_rect(
                    Some(context.as_ref()),
                    CGRect::new(
                        CGPoint::new(div_x, cg_y as f64),
                        CGSize::new(div_w, ov.h as f64),
                    ),
                );
            }
        }
        Ok(())
    })();

    // SAFETY: `pixel_buffer` is still locked, and this call balances the earlier lock.
    let unlock_result = unsafe { CVPixelBufferUnlockBaseAddress(pixel_buffer, 0) }; // SAFETY: see above.
    if unlock_result != 0 {
        // SAFETY: this function still owns the created `pixel_buffer` on the error path.
        unsafe {
            // SAFETY: see above.
            CVBufferRelease(pixel_buffer);
        }
        return Err(format!(
            "CVPixelBufferUnlockBaseAddress failed with status {}",
            unlock_result
        ));
    }

    if let Err(err) = draw_result {
        // SAFETY: the caller has not taken ownership yet, so this function must release the buffer.
        unsafe {
            // SAFETY: see above.
            CVBufferRelease(pixel_buffer);
        }
        return Err(err);
    }

    Ok(pixel_buffer)
}

fn draw_progress_overlay(context: &CGContext, frame_height: usize, ov: &ProgressOverlay<'_>) {
    let cg_y = frame_height.saturating_sub(ov.y + ov.h);
    if ov.fill_w > 0 {
        CGContext::set_rgb_fill_color(Some(context), ov.r, ov.g, ov.b, 0.9);
        CGContext::fill_rect(
            Some(context),
            CGRect::new(
                CGPoint::new(ov.x as f64, cg_y as f64),
                CGSize::new(ov.fill_w as f64, ov.h as f64),
            ),
        );
    }
    let div_w = 2.0_f64.max(ov.h as f64 * 0.4);
    CGContext::set_rgb_fill_color(Some(context), 1.0, 1.0, 1.0, 0.7);
    for &ratio in ov.dots {
        let div_x = ov.x as f64 + ov.max_w as f64 * ratio - div_w / 2.0;
        CGContext::fill_rect(
            Some(context),
            CGRect::new(
                CGPoint::new(div_x, cg_y as f64),
                CGSize::new(div_w, ov.h as f64),
            ),
        );
    }
}

pub(super) fn frame_time(frame_index: usize, fps: usize) -> Result<CMTime, String> {
    let timescale = i32::try_from(fps).map_err(|_| format!("fps {fps} does not fit in i32"))?;
    // SAFETY: `timescale` is checked and positive, and `frame_index` is only used as a value input.
    Ok(unsafe { CMTime::new(frame_index as i64, timescale) }) // SAFETY: see above.
}
