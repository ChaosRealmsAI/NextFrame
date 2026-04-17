use anyhow::Result;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSColor, NSView, NSWindow};
use objc2_foundation::NSDictionary;

use crate::bindings::nsdata_to_vec;

pub fn capture_window_png(window: &NSWindow) -> Result<Vec<u8>> {
    let content_view = window
        .contentView()
        .ok_or_else(|| anyhow::anyhow!("window missing content view"))?;
    let bitmap = capture_view_bitmap(&content_view)?;
    png_bytes_from_bitmap(&bitmap)
}

pub fn preview_center_has_nonwhite_pixels(view: &NSView) -> Result<bool> {
    let bitmap = capture_view_bitmap(view)?;
    let width = bitmap.pixelsWide() as i32;
    let height = bitmap.pixelsHigh() as i32;
    if width <= 0 || height <= 0 {
        return Ok(false);
    }

    let sample_w = (width / 6).max(16);
    let sample_h = (height / 6).max(16);
    let start_x = ((width - sample_w) / 2).max(0);
    let start_y = ((height - sample_h) / 2).max(0);
    for y in start_y..(start_y + sample_h).min(height) {
        for x in start_x..(start_x + sample_w).min(width) {
            if let Some(color) = bitmap.colorAtX_y(x as isize, y as isize) {
                if !is_close_to_white(&color) {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

fn capture_view_bitmap(view: &NSView) -> Result<Retained<NSBitmapImageRep>> {
    let rect = view.bounds();
    let bitmap = view
        .bitmapImageRepForCachingDisplayInRect(rect)
        .ok_or_else(|| anyhow::anyhow!("failed to create bitmap rep for view"))?;
    view.cacheDisplayInRect_toBitmapImageRep(rect, &bitmap);
    Ok(bitmap)
}

fn png_bytes_from_bitmap(bitmap: &NSBitmapImageRep) -> Result<Vec<u8>> {
    let props = NSDictionary::<objc2_app_kit::NSBitmapImageRepPropertyKey, AnyObject>::new();
    // SAFETY: Empty properties dictionary is valid for PNG output.
    let data =
        unsafe { bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &props) }
            .ok_or_else(|| anyhow::anyhow!("failed to encode bitmap as PNG"))?;
    Ok(nsdata_to_vec(&data))
}

fn is_close_to_white(color: &NSColor) -> bool {
    color.redComponent() > 0.95
        && color.greenComponent() > 0.95
        && color.blueComponent() > 0.95
        && color.alphaComponent() > 0.8
}
