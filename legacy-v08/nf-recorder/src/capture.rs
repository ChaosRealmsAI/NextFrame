//! Capture helpers for converting `WKWebView` output into `CGImage` frames.

use std::ffi::c_void;

use objc2::AnyThread;
use objc2::msg_send;
use objc2::rc::Retained;
use objc2_app_kit::{NSBitmapFormat, NSBitmapImageRep, NSImage};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGBitmapContextCreateImage, CGColorSpace, CGContext, CGImage,
    CGImageAlphaInfo, CGImageByteOrderInfo,
};
use objc2_foundation::{NSPoint as CGPoint, NSRect as CGRect, NSSize as CGSize};
use objc2_quartz_core::CALayer;

use crate::error_with_fix;

/// Retries allowed when the snapshot fallback still returns an all-black frame.
pub const BLACK_FRAME_MAX_RETRIES: usize = 3;

const BLACK_FRAME_RGB_THRESHOLD: u8 = 8;
const BLACK_FRAME_SAMPLE_GRID: usize = 16;
const BLACK_FRAME_THUMBNAIL_SIZE: usize = 100;
const BLACK_FRAME_MIN_VISIBLE_SAMPLES: usize = 4;

/// Reports whether an `NSImage` appears to be effectively black.
pub fn is_nsimage_black(image: &NSImage) -> Result<bool, String> {
    let cg_image = cgimage_from_nsimage(image)?;
    let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg_image);
    let width = bitmap.pixelsWide() as usize;
    let height = bitmap.pixelsHigh() as usize;
    let samples_per_pixel = bitmap.samplesPerPixel() as usize;
    let bits_per_pixel = bitmap.bitsPerPixel() as usize;
    if width == 0 || height == 0 {
        return Ok(true);
    }
    if samples_per_pixel < 3 || bits_per_pixel < 24 {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "inspect the snapshot bitmap",
                format!(
                    "unsupported bitmap format with samplesPerPixel={} and bitsPerPixel={}",
                    samples_per_pixel, bits_per_pixel
                ),
                "Capture the frame using a standard RGBA snapshot format and retry.",
            ),
        );
    }

    let data = bitmap.bitmapData();
    if data.is_null() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "inspect the snapshot bitmap",
                "NSBitmapImageRep returned a null bitmapData pointer",
                "Retry the capture after the page finishes rendering.",
            ),
        );
    }
    let bytes_per_row = bitmap.bytesPerRow() as usize;
    let format = bitmap.bitmapFormat();
    let step_x = (width / 16).max(1);
    let step_y = (height / 16).max(1);
    let threshold = 8u8;

    for y in (0..height).step_by(step_y) {
        // SAFETY: `data` points to the bitmap allocation, and this row offset stays within it.
        let row = unsafe { data.add(y * bytes_per_row) }; // SAFETY: `data` points to the bitmap allocation, and this row offset stays within it.
        for x in (0..width).step_by(step_x) {
            // SAFETY: this pixel offset stays within the current row for the sampled coordinates.
            let pixel = unsafe { row.add(x * samples_per_pixel) }; // SAFETY: this pixel offset stays within the current row for the sampled coordinates.
            // SAFETY: `pixel` points to one pixel, and `samples_per_pixel` matches the bitmap metadata.
            let channels = unsafe { std::slice::from_raw_parts(pixel, samples_per_pixel) }; // SAFETY: `pixel` points to one pixel, and `samples_per_pixel` matches the bitmap metadata.
            let (r, g, b) = rgb_components(channels, format);
            if r > threshold || g > threshold || b > threshold {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

/// Extracts a `CGImage` from an `NSImage`.
pub fn cgimage_from_nsimage(image: &NSImage) -> Result<Retained<CGImage>, String> {
    // SAFETY: `image` is live, and AppKit allows null rect/context/hints for this conversion call.
    unsafe {
        // SAFETY: `image` is live, and AppKit allows null rect/context/hints for this conversion call.
        // SAFETY: `image` is live, and AppKit allows null rect/context/hints for this conversion call.
        // SAFETY: `image` is live, and AppKit allows null rect/context/hints for this conversion call.
        image
            .CGImageForProposedRect_context_hints(std::ptr::null_mut(), None, None)
            .ok_or_else(|| {
                error_with_fix(
                    "convert the snapshot image to CGImage",
                    "NSImage did not yield a CGImage",
                    "Retry the capture after the page finishes rendering.",
                )
            })
    }
}

/// Renders a `CALayer` tree into a bitmap-backed `CGImage`.
pub fn layer_render_cgimage(
    layer: &CALayer,
    width: usize,
    height: usize,
) -> Result<Retained<CGImage>, String> {
    if width == 0 || height == 0 {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "render the webview layer",
                "the render target size is zero",
                "Pass a non-zero capture width and height before retrying.",
            ),
        );
    }

    let bytes_per_row = width * 4;
    let mut buffer = vec![0u8; bytes_per_row * height];
    let color_space = CGColorSpace::new_device_rgb().ok_or_else(|| {
        error_with_fix(
            "create the RGB color space",
            "CoreGraphics returned no device RGB color space",
            "Retry the capture after the graphics stack is initialized.",
        )
    })?;
    let bitmap_info =
        CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
    // SAFETY: `buffer` owns the target bytes, and the dimensions and format match this bitmap context.
    let context = unsafe {
        // SAFETY: `buffer` owns the target bytes, and the dimensions and format match this bitmap context.
        // SAFETY: `buffer` owns the target bytes, and the dimensions and format match this bitmap context.
        // SAFETY: `buffer` owns the target bytes, and the dimensions and format match this bitmap context.
        CGBitmapContextCreate(
            buffer.as_mut_ptr().cast::<c_void>(),
            width,
            height,
            8,
            bytes_per_row,
            Some(color_space.as_ref()),
            bitmap_info,
        )
    }
    .ok_or_else(|| {
        error_with_fix(
            "create the bitmap render context",
            "CoreGraphics returned no bitmap context",
            "Reduce the capture size or retry after graphics resources are available.",
        )
    })?;

    let bounds = layer.bounds();
    let scale_x = if bounds.size.width > 0.0 {
        width as f64 / bounds.size.width
    } else {
        1.0
    };
    let scale_y = if bounds.size.height > 0.0 {
        height as f64 / bounds.size.height
    } else {
        1.0
    };

    CGContext::translate_ctm(Some(context.as_ref()), 0.0, height as f64);
    CGContext::scale_ctm(Some(context.as_ref()), scale_x, -scale_y);

    // SAFETY: `layer` and `context` are live, and `renderInContext:` accepts a valid bitmap context.
    let _: () = unsafe { msg_send![layer, renderInContext: &*context] }; // SAFETY: `layer` and `context` are live, and `renderInContext:` accepts a valid bitmap context.

    let image = CGBitmapContextCreateImage(Some(&context)).ok_or_else(|| {
        error_with_fix(
            "extract the rendered frame image",
            "CoreGraphics returned no CGImage from the bitmap context",
            "Retry the capture after the page finishes rendering.",
        )
    })?;
    Ok(image.into())
}

/// Samples a downscaled `CGImage` to detect the black-frame failure mode.
pub fn is_cgimage_mostly_black(image: &CGImage) -> Result<bool, String> {
    let thumbnail_width = CGImage::width(Some(image)).clamp(1, BLACK_FRAME_THUMBNAIL_SIZE);
    let thumbnail_height = CGImage::height(Some(image)).clamp(1, BLACK_FRAME_THUMBNAIL_SIZE);
    let bytes_per_row = thumbnail_width * 4;
    let mut buffer = vec![0u8; bytes_per_row * thumbnail_height];
    let color_space = CGColorSpace::new_device_rgb().ok_or_else(|| {
        error_with_fix(
            "create the RGB color space",
            "CoreGraphics returned no device RGB color space",
            "Retry the capture after the graphics stack is initialized.",
        )
    })?;
    let bitmap_info =
        CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
    // SAFETY: `buffer` owns the thumbnail bytes, and the dimensions and format match this context.
    let context = unsafe {
        // SAFETY: `buffer` owns the thumbnail bytes, and the dimensions and format match this context.
        // SAFETY: `buffer` owns the thumbnail bytes, and the dimensions and format match this context.
        // SAFETY: `buffer` owns the thumbnail bytes, and the dimensions and format match this context.
        CGBitmapContextCreate(
            buffer.as_mut_ptr().cast::<c_void>(),
            thumbnail_width,
            thumbnail_height,
            8,
            bytes_per_row,
            Some(color_space.as_ref()),
            bitmap_info,
        )
    }
    .ok_or_else(|| {
        error_with_fix(
            "create the thumbnail render context",
            "CoreGraphics returned no bitmap context",
            "Reduce the capture size or retry after graphics resources are available.",
        )
    })?;

    CGContext::draw_image(
        Some(context.as_ref()),
        CGRect::new(
            CGPoint::new(0.0, 0.0),
            CGSize::new(thumbnail_width as f64, thumbnail_height as f64),
        ),
        Some(image),
    );

    let step_x = (thumbnail_width / BLACK_FRAME_SAMPLE_GRID).max(1);
    let step_y = (thumbnail_height / BLACK_FRAME_SAMPLE_GRID).max(1);
    let mut visible_samples = 0usize;
    for y in (0..thumbnail_height).step_by(step_y) {
        let row = &buffer[y * bytes_per_row..(y + 1) * bytes_per_row];
        for x in (0..thumbnail_width).step_by(step_x) {
            let pixel = &row[x * 4..x * 4 + 4];
            let blue = pixel[0];
            let green = pixel[1];
            let red = pixel[2];
            if red > BLACK_FRAME_RGB_THRESHOLD
                || green > BLACK_FRAME_RGB_THRESHOLD
                || blue > BLACK_FRAME_RGB_THRESHOLD
            {
                visible_samples += 1;
                if visible_samples >= BLACK_FRAME_MIN_VISIBLE_SAMPLES {
                    return Ok(false);
                }
            }
        }
    }

    Ok(true)
}

fn rgb_components(bytes: &[u8], format: NSBitmapFormat) -> (u8, u8, u8) {
    let alpha_first = format.contains(NSBitmapFormat::AlphaFirst);
    let little_endian = format.contains(NSBitmapFormat::ThirtyTwoBitLittleEndian);
    let big_endian = format.contains(NSBitmapFormat::ThirtyTwoBitBigEndian);

    if little_endian && alpha_first {
        (bytes[2], bytes[1], bytes[0])
    } else if little_endian && !alpha_first {
        (bytes[0], bytes[1], bytes[2])
    } else if big_endian && alpha_first {
        (bytes[1], bytes[2], bytes[3])
    } else {
        (bytes[0], bytes[1], bytes[2])
    }
}
