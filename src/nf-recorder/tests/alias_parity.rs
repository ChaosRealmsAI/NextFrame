use anyhow::Result;
use nf_recorder::io_surface_alias::{
    MetalAliasContext, create_bgra_surface, fill_test_surface, resident_bytes,
};
use objc2_metal::MTLPixelFormat;

#[test]
fn iosurface_alias_preserves_pixels() -> Result<()> {
    let width = 256usize;
    let height = 144usize;
    let rss_before = resident_bytes()?;
    let surface = create_bgra_surface(width, height)?;
    fill_test_surface(surface.as_ref(), width, height)?;
    let alias = MetalAliasContext::new()?;
    let texture =
        alias.alias_texture(surface.as_ref(), MTLPixelFormat::BGRA8Unorm, width, height)?;
    let rgba = alias.readback_rgba(texture.as_ref(), width, height)?;
    let rss_after = resident_bytes()?;

    assert_eq!(&rgba[0..4], &[255, 0, 0, 255]);
    let second_pixel = (33 * width + 33) * 4;
    assert_eq!(&rgba[second_pixel..second_pixel + 4], &[255, 0, 0, 255]);
    let third_pixel = (33 * width + 1) * 4;
    assert_eq!(&rgba[third_pixel..third_pixel + 4], &[0, 255, 0, 255]);
    // P-E6 empirical: alias adds ~4.7 MB in isolation. Budget 64 MB tolerates
    // test harness / accumulated allocator state when run with the rest of the
    // suite (same bin prior tests allocate before this one).
    assert!((rss_after as i64 - rss_before as i64).unsigned_abs() < 64 * 1024 * 1024);
    Ok(())
}
