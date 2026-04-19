//! `snapshot` · v1.14 T-18 · product-internal single-frame PNG sampling.
//!
//! **Why this exists (self-verification rule)**: VP-4 needs pixel-level diff
//! between "mp4 frame at t_ms" and "snapshot at t_ms"; both must come from
//! the **same CARenderer / IOSurface path** — any external tool (playwright /
//! chromium) samples a different pipeline and destroys diff validity.
//!
//! ## Flow (aligned with `record_loop::run`)
//! 1. `MacHeadlessShell::new_headless` at `(width, height)` · `dpr=1`.
//! 2. `load_bundle` · blocks until navigation finished.
//! 3. `callAsync("document.body.dataset.mode='record'; return true;")` — flips
//!    the runtime into record mode (RAF off · determinism on · per ADR-041).
//! 4. `callAsync("return await window.__nf.seek(t_ms);")` — awaits
//!    `{ t, frameReady: true, seq }` (T-12 contract).
//! 5. `shell.snapshot()` → `IOSurfaceHandle` (zero-copy CARenderer sample).
//! 6. `iosurface_to_png` locks BGRA pixels · swaps to RGBA · encodes.
//! 7. Write PNG to `out`.
//!
//! ## Key pitfall (T-12 lesson)
//! `callAsyncJavaScript` bridges JS Numbers back as `f64` (via NSNumber). If
//! we pulled `t` we'd need `as_f64().and_then(|f| if f.fract()==0.0 { Some(f as u64) })`.
//! Here we only care about `frameReady: bool`, so `as_bool()` is enough —
//! but we still validate the contract shape for visibility.

use std::ffi::c_void;
use std::path::Path;
use std::ptr::NonNull;

use nf_shell_mac::{DesktopShell, IOSurfaceHandle, MacHeadlessShell, ShellConfig};

/// Errors returned by `snapshot` · mapped 1-to-1 onto exit codes in `main`.
#[derive(Debug, thiserror::Error)]
pub enum SnapshotError {
    /// Shell init / load / snapshot bubble.
    #[error("shell: {0}")]
    Shell(String),
    /// `callAsyncJavaScript` itself failed or timed out.
    #[error("js call: {0}")]
    JsCall(String),
    /// Runtime did not return `frameReady: true` for the requested `t_ms`.
    #[error("frameReady=false at t_ms={t_ms}")]
    FrameNotReady { t_ms: u64 },
    /// Runtime returned a non-object / missing-field payload.
    #[error("frameReady contract violation: {0}")]
    FrameReadyContract(String),
    /// `IOSurfaceLock(ReadOnly)` returned non-zero.
    #[error("IOSurfaceLock failed: {0}")]
    IoSurfaceLock(i32),
    /// `png` encoder failure (buffer write or header).
    #[error("png encode: {0}")]
    PngEncode(String),
    /// Disk write failure.
    #[error("io: {0}")]
    Io(String),
    /// Derived code for `events::Event::Error` emission.
    #[error("bundle load failed: {0}")]
    BundleLoad(String),
}

impl SnapshotError {
    /// Enum-string code for the stdout `error` event.
    #[must_use]
    pub fn code_str(&self) -> &'static str {
        match self {
            Self::Shell(_) => "SHELL_ERROR",
            Self::JsCall(_) => "JS_CALL_FAILED",
            Self::FrameNotReady { .. } => "FRAME_READY_FALSE",
            Self::FrameReadyContract(_) => "FRAME_READY_CONTRACT",
            Self::IoSurfaceLock(_) => "IOSURFACE_LOCK_FAILED",
            Self::PngEncode(_) => "PNG_ENCODE_FAILED",
            Self::Io(_) => "IO_ERROR",
            Self::BundleLoad(_) => "BUNDLE_LOAD_FAILED",
        }
    }

    /// Process exit code · `1` for user error (bundle-load) · `2` for internal.
    #[must_use]
    pub fn exit_code(&self) -> u8 {
        match self {
            Self::BundleLoad(_) => 1,
            _ => 2,
        }
    }
}

/// Snapshot one frame · produces a PNG at `out`.
///
/// Runs on the current thread — the caller (nf-recorder main) uses a
/// `tokio::runtime::Builder::new_current_thread()` runtime so `call_async`
/// can pump the macOS main run loop.
pub async fn snapshot(
    bundle: &Path,
    t_ms: u64,
    out: &Path,
    width: u32,
    height: u32,
) -> Result<(), SnapshotError> {
    // 1. Boot headless shell (NSWindow orderOut · WKWebView child · CARenderer sampler).
    let shell = MacHeadlessShell::new_headless(ShellConfig {
        viewport: (width, height),
        device_pixel_ratio: 1.0,
        bundle_url: bundle.to_path_buf(),
    })
    .map_err(|e| SnapshotError::Shell(format!("{e}")))?;

    // 2. Load bundle · blocks until navigation finished (DEFAULT_TIMEOUT = 15s).
    shell
        .load_bundle(bundle)
        .map_err(|e| SnapshotError::BundleLoad(format!("{e}")))?;

    // 3. Flip runtime into record mode (deterministic · RAF off · per ADR-041).
    //    `call_async` returns `serde_json::Value` — `true` confirms the flip.
    let mode_flip = shell
        .call_async("document.body.dataset.mode = 'record'; return true;")
        .await
        .map_err(|e| SnapshotError::JsCall(format!("{e}")))?;
    if mode_flip.as_bool() != Some(true) {
        return Err(SnapshotError::FrameReadyContract(format!(
            "mode flip returned non-true: {mode_flip}"
        )));
    }

    // 4. Seek + await frameReady. Runtime contract: `{ t, frameReady, seq }`.
    let script = format!("return await window.__nf.seek({t_ms});");
    let v = shell
        .call_async(&script)
        .await
        .map_err(|e| SnapshotError::JsCall(format!("{e}")))?;

    // Validate frameReady. Missing / wrong type / false all count as failure.
    let ready = v
        .get("frameReady")
        .and_then(|x| x.as_bool())
        .ok_or_else(|| {
            SnapshotError::FrameReadyContract(format!(
                "missing frameReady at t_ms={t_ms} · got {v}"
            ))
        })?;
    if !ready {
        return Err(SnapshotError::FrameNotReady { t_ms });
    }

    // 5. Sample CARenderer → IOSurface (zero-copy · same path as record).
    //
    // WKWebView layer commit is not synchronous with `window.__nf.seek(t)`
    // resolving — WebContent process paints the frame slightly after the JS
    // promise fires · CoreAnimation then commits to the IOSurface the next
    // time we `setLayer / render`. carenderer_sample test converges within
    // ≤ 30 iterations by pumping the run loop + CATransaction flush between
    // `sample` calls (POC-04B observation).
    //
    // In production record_loop this is hidden because 60fps sampling has
    // throwaway first frames until layer commits catch up. For single-frame
    // snapshot we loop until center pixel reads non-transparent or we hit
    // the max budget. Each iteration pumps the main run loop via `call_async`
    // (cheap noop) so WebContent has a chance to deliver its commit.
    let surface = sample_until_committed(&shell).await?;

    // 6. Encode PNG from BGRA pixels (swap → RGBA).
    let png = iosurface_to_png(&surface)?;

    // 7. Write to disk.
    std::fs::write(out, &png).map_err(|e| SnapshotError::Io(e.to_string()))?;

    Ok(())
}

/// Max sampler retries when waiting for the WebContent layer to commit.
///
/// `carenderer_sample` test observed ≤ 30 frames to converge in debug build;
/// release build is typically ≤ 5. 60 leaves comfortable head-room.
const MAX_COMMIT_RETRIES: u32 = 60;

/// Sample CARenderer until the IOSurface reflects a **stable committed
/// layer paint** — not just "some bytes are non-zero" (that flips at the
/// initial grey system paint before CSS applies).
///
/// Strategy:
/// 1. Ask JS for a 2-RAF round-trip via `call_async` — this guarantees the
///    current composited frame has been handed off to CoreAnimation.
/// 2. Read center pixel. If two consecutive reads are identical *and*
///    non-zero, treat the surface as stable.
///
/// Falls back to the last attempted surface after `MAX_COMMIT_RETRIES`
/// iterations (downstream diff will reveal the stale content).
async fn sample_until_committed(
    shell: &MacHeadlessShell,
) -> Result<IOSurfaceHandle, SnapshotError> {
    // 50 ms setTimeout gate · lets the WebContent process lay out + paint +
    // flush a frame to CoreAnimation between samples. RAF does NOT work
    // reliably here: record-mode runtimes and off-screen WKWebViews both
    // throttle `requestAnimationFrame`, causing callAsyncJavaScript to
    // time out. `setTimeout` keeps pumping the main run loop (which picks
    // up WebContent IPC + CA commits) without relying on display frames.
    const PAINT_WAIT: &str = "return await new Promise(resolve => \
        setTimeout(() => resolve(true), 50));";

    let mut last: Option<IOSurfaceHandle> = None;
    let mut prev_center: Option<(u8, u8, u8, u8)> = None;
    let mut stable_count: u32 = 0;

    for _ in 0..MAX_COMMIT_RETRIES {
        // Force a layout/paint commit window before each sample.
        shell
            .call_async(PAINT_WAIT)
            .await
            .map_err(|e| SnapshotError::JsCall(format!("pump paint: {e}")))?;

        let handle = shell
            .snapshot()
            .map_err(|e| SnapshotError::Shell(format!("{e}")))?;

        let center = read_center_pixel(&handle)?;
        let non_zero = center.0 != 0 || center.1 != 0 || center.2 != 0 || center.3 != 0;

        if non_zero && prev_center == Some(center) {
            stable_count += 1;
            // Two identical non-zero centers in a row → paint has settled.
            if stable_count >= 1 {
                return Ok(handle);
            }
        } else {
            stable_count = 0;
        }

        prev_center = Some(center);
        last = Some(handle);
    }

    last.ok_or_else(|| SnapshotError::Shell("no snapshot attempts".into()))
}

/// Peek the BGRA center pixel · returns `(B, G, R, A)`.
///
/// `IOSurfaceLock(ReadOnly)` is cheap (atomic refcount + seed bump) so a
/// single 4-byte read per iteration is negligible compared to the full
/// raster copy done later in `iosurface_to_png`.
fn read_center_pixel(handle: &IOSurfaceHandle) -> Result<(u8, u8, u8, u8), SnapshotError> {
    let surface = handle.as_iosurface();
    let width = handle.width as usize;
    let height = handle.height as usize;
    if width == 0 || height == 0 {
        return Ok((0, 0, 0, 0));
    }

    let mut seed: u32 = 0;
    // SAFETY: IOSurfaceLock(ReadOnly) · seed is a valid out slot.
    let lock_status = unsafe {
        surface.lock(
            objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
            &mut seed as *mut u32,
        )
    };
    if lock_status != 0 {
        return Err(SnapshotError::IoSurfaceLock(lock_status));
    }

    let base = surface.base_address();
    let bpr = surface.bytes_per_row();
    let cx = width / 2;
    let cy = height / 2;
    // SAFETY: lock held · cy*bpr + cx*4 in-bounds for width*height surface.
    let px = unsafe {
        let ptr = (base.as_ptr() as *const u8).add(cy * bpr + cx * 4);
        (*ptr, *ptr.add(1), *ptr.add(2), *ptr.add(3))
    };

    // SAFETY: symmetric unlock · same seed.
    let unlock_status = unsafe {
        surface.unlock(
            objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
            &mut seed as *mut u32,
        )
    };
    if unlock_status != 0 {
        return Err(SnapshotError::IoSurfaceLock(unlock_status));
    }
    Ok(px)
}

/// Lock an IOSurface(ReadOnly), copy the BGRA8 raster, swap to RGBA8,
/// and encode as PNG bytes.
///
/// `bytes_per_row` may be > `width * 4` (hardware row padding) · we copy
/// row-by-row into a tightly-packed `width*height*4` buffer so the PNG
/// encoder does not need to know about padding.
pub(crate) fn iosurface_to_png(handle: &IOSurfaceHandle) -> Result<Vec<u8>, SnapshotError> {
    let surface = handle.as_iosurface();
    let width = handle.width as usize;
    let height = handle.height as usize;
    if width == 0 || height == 0 {
        return Err(SnapshotError::FrameReadyContract(format!(
            "IOSurface zero extent: {width}x{height}"
        )));
    }

    let mut seed: u32 = 0;
    // SAFETY: IOSurfaceLock(ReadOnly) · seed is a valid out-parameter slot ·
    // main-thread invariant is upheld by caller (snapshot is awaited on the
    // current-thread tokio runtime that owns main thread).
    let lock_status = unsafe {
        surface.lock(
            objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
            &mut seed as *mut u32,
        )
    };
    if lock_status != 0 {
        return Err(SnapshotError::IoSurfaceLock(lock_status));
    }

    let base: NonNull<c_void> = surface.base_address();
    let bytes_per_row = surface.bytes_per_row();
    let row_bytes = width.checked_mul(4).ok_or_else(|| {
        SnapshotError::FrameReadyContract(format!("width overflow: {width}"))
    })?;
    if bytes_per_row < row_bytes {
        // Unlock before bail-out to keep refcount balanced.
        // SAFETY: symmetric unlock with same seed · always sound after a
        // successful lock.
        let _ = unsafe {
            surface.unlock(
                objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
                &mut seed as *mut u32,
            )
        };
        return Err(SnapshotError::FrameReadyContract(format!(
            "bytes_per_row ({bytes_per_row}) < width*4 ({row_bytes})"
        )));
    }

    // Tightly-packed RGBA buffer. Capacity checked for overflow.
    let total = row_bytes.checked_mul(height).ok_or_else(|| {
        SnapshotError::FrameReadyContract(format!(
            "raster overflow: {width}x{height}"
        ))
    })?;
    let mut rgba: Vec<u8> = vec![0u8; total];

    // SAFETY: lock held · base pointer valid for `bytes_per_row * height` bytes.
    // We read `width*4` bytes per row and swap BGRA → RGBA per pixel.
    let base_ptr = base.as_ptr() as *const u8;
    for y in 0..height {
        // SAFETY: y < height · row offset stays within locked surface.
        let src_row = unsafe { base_ptr.add(y * bytes_per_row) };
        let dst_row = &mut rgba[y * row_bytes..(y + 1) * row_bytes];
        for x in 0..width {
            // SAFETY: x < width · 4 bytes per pixel · src_row[x*4..x*4+4] in-bounds.
            let px = unsafe { src_row.add(x * 4) };
            // BGRA → RGBA
            // SAFETY: 4 valid bytes starting at px.
            let b = unsafe { *px };
            let g = unsafe { *px.add(1) };
            let r = unsafe { *px.add(2) };
            let a = unsafe { *px.add(3) };
            let dst_off = x * 4;
            dst_row[dst_off] = r;
            dst_row[dst_off + 1] = g;
            dst_row[dst_off + 2] = b;
            dst_row[dst_off + 3] = a;
        }
    }

    // SAFETY: symmetric unlock with same seed.
    let unlock_status = unsafe {
        surface.unlock(
            objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
            &mut seed as *mut u32,
        )
    };
    if unlock_status != 0 {
        return Err(SnapshotError::IoSurfaceLock(unlock_status));
    }

    // PNG encode · RGBA8 · no filter hint (default).
    let mut buf: Vec<u8> = Vec::with_capacity(total / 4); // rough pre-alloc
    {
        let mut encoder = png::Encoder::new(&mut buf, handle.width, handle.height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| SnapshotError::PngEncode(format!("header: {e}")))?;
        writer
            .write_image_data(&rgba)
            .map_err(|e| SnapshotError::PngEncode(format!("image data: {e}")))?;
        // writer Drop flushes · explicit drop for clarity.
        drop(writer);
    }

    Ok(buf)
}
