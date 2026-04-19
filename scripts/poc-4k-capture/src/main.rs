use std::env;
use std::ffi::c_void;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::ptr::{self, NonNull};
use std::time::Instant;

use libc::{getrusage, rusage, RUSAGE_SELF};
use nf_shell_mac::carenderer::CARendererSampler;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy, NSColor};
use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFString, CFType};
use objc2_core_media::kCMVideoCodecType_HEVC;
use objc2_core_video::{
    kCVPixelBufferHeightKey, kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferPixelFormatTypeKey,
    kCVPixelBufferWidthKey, kCVPixelFormatType_32BGRA,
};
use objc2_io_surface::{IOSurfaceLockOptions, IOSurfaceRef};
use objc2_quartz_core::{CALayer, CATransaction};
use objc2_video_toolbox::{
    kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_HEVC_Main10_AutoLevel,
    kVTProfileLevel_HEVC_Main_AutoLevel, VTCompressionSession, VTEncodeInfoFlags, VTSession,
    VTSessionSetProperty,
};
use serde::{Deserialize, Serialize};

const WIDTH: u32 = 3840;
const HEIGHT: u32 = 2160;
const FRAME_COUNT: usize = 5;
const RAW_PIXEL_FORMAT: &str = "bgra";
const RAW_FRAME_BYTES: usize = WIDTH as usize * HEIGHT as usize * 4;

struct SceneLayers {
    root: objc2::rc::Retained<CALayer>,
    hero: objc2::rc::Retained<CALayer>,
    accent: objc2::rc::Retained<CALayer>,
    marker: objc2::rc::Retained<CALayer>,
    pulse: objc2::rc::Retained<CALayer>,
}

#[derive(Serialize)]
struct FrameMetric {
    frame_index: usize,
    raw_path: String,
    png_path: String,
    sample_ms: f64,
    center_rgba: [u8; 4],
    peak_rss_bytes_after_frame: u64,
    raw_file_size_bytes: u64,
    png_file_size_bytes: u64,
}

#[derive(Serialize)]
struct HostInfo {
    arch: String,
    cpu_brand: String,
    os_version: String,
    is_intel_host: bool,
}

#[derive(Deserialize, Serialize)]
struct FfprobeStream {
    codec_name: Option<String>,
    codec_type: Option<String>,
    pix_fmt: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Serialize)]
struct Main10Probe {
    session_create_status: i32,
    main_profile_set_status: Option<i32>,
    main10_profile_set_status: Option<i32>,
    current_host_supports_main10: bool,
    intel_mac_support_status: String,
}

#[derive(Serialize)]
struct PocReport {
    output_dir: String,
    width: u32,
    height: u32,
    frame_count: usize,
    raw_pixel_format: String,
    raw_frame_bytes: usize,
    total_sample_ms: f64,
    avg_sample_ms: f64,
    max_sample_ms: f64,
    budget_60fps_ms: f64,
    meets_60fps_budget: bool,
    peak_rss_bytes: u64,
    peak_rss_mb: f64,
    frame_pool_capacity: u32,
    frame_pool_estimated_peak_bytes: u64,
    frame_pool_estimated_peak_mb: f64,
    host: HostInfo,
    ffprobe_frame0: Option<FfprobeStream>,
    hevc_main10_probe: Main10Probe,
    frames: Vec<FrameMetric>,
}

fn main() -> Result<(), String> {
    let output_dir = env::args()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| "usage: poc-4k-capture <output-dir>".to_string())?;

    fs::create_dir_all(&output_dir).map_err(|e| format!("mkdir {}: {e}", output_dir.display()))?;

    let mtm =
        MainThreadMarker::new().ok_or_else(|| "runner must start on main thread".to_string())?;
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Prohibited);
    app.finishLaunching();

    let scene = build_scene();
    let sampler = CARendererSampler::new(WIDTH, HEIGHT)
        .map_err(|e| format!("CARendererSampler::new: {e}"))?;
    update_scene(&scene, 0);
    let _ = sampler
        .sample(&scene.root)
        .map_err(|e| format!("warm-up sample: {e}"))?;

    let mut frames = Vec::with_capacity(FRAME_COUNT);
    let mut total_sample_ms = 0.0_f64;
    let mut max_sample_ms = 0.0_f64;
    let mut peak_rss_bytes = current_peak_rss_bytes()?;
    let mut bgra = vec![0u8; RAW_FRAME_BYTES];

    for frame_index in 0..FRAME_COUNT {
        update_scene(&scene, frame_index);

        let t0 = Instant::now();
        let handle = sampler
            .sample(&scene.root)
            .map_err(|e| format!("sample frame {frame_index}: {e}"))?;
        let sample_ms = t0.elapsed().as_secs_f64() * 1000.0;
        total_sample_ms += sample_ms;
        max_sample_ms = max_sample_ms.max(sample_ms);

        copy_surface_bgra_into(
            handle.as_iosurface(),
            WIDTH as usize,
            HEIGHT as usize,
            &mut bgra,
        )?;
        let center_rgba = center_rgba(&bgra, WIDTH as usize, HEIGHT as usize);

        let raw_path = output_dir.join(format!("frame-{frame_index}.bgra"));
        fs::write(&raw_path, &bgra)
            .map_err(|e| format!("write {}: {e}", raw_path.display()))?;

        let png_path = output_dir.join(format!("frame-{frame_index}.png"));
        write_png_with_ffmpeg(&raw_path, &png_path)?;

        peak_rss_bytes = peak_rss_bytes.max(current_peak_rss_bytes()?);

        let raw_meta = fs::metadata(&raw_path)
            .map_err(|e| format!("stat {}: {e}", raw_path.display()))?;
        let png_meta = fs::metadata(&png_path)
            .map_err(|e| format!("stat {}: {e}", png_path.display()))?;

        frames.push(FrameMetric {
            frame_index,
            raw_path: file_name_string(&raw_path)?,
            png_path: file_name_string(&png_path)?,
            sample_ms,
            center_rgba,
            peak_rss_bytes_after_frame: peak_rss_bytes,
            raw_file_size_bytes: raw_meta.len(),
            png_file_size_bytes: png_meta.len(),
        });
    }

    let ffprobe_frame0 = ffprobe_raw_frame(&output_dir.join("frame-0.bgra"));
    let host = host_info(&output_dir)?;
    let main10_probe = probe_hevc_main10()?;

    let report = PocReport {
        output_dir: output_dir.display().to_string(),
        width: WIDTH,
        height: HEIGHT,
        frame_count: FRAME_COUNT,
        raw_pixel_format: RAW_PIXEL_FORMAT.to_string(),
        raw_frame_bytes: RAW_FRAME_BYTES,
        total_sample_ms,
        avg_sample_ms: total_sample_ms / FRAME_COUNT as f64,
        max_sample_ms,
        budget_60fps_ms: 1000.0 / 60.0,
        meets_60fps_budget: max_sample_ms <= (1000.0 / 60.0),
        peak_rss_bytes,
        peak_rss_mb: bytes_to_mb(peak_rss_bytes),
        frame_pool_capacity: 4,
        frame_pool_estimated_peak_bytes: (RAW_FRAME_BYTES as u64) * 4,
        frame_pool_estimated_peak_mb: bytes_to_mb((RAW_FRAME_BYTES as u64) * 4),
        host,
        ffprobe_frame0,
        hevc_main10_probe: main10_probe,
        frames,
    };

    let report_path = output_dir.join("report.json");
    let report_file = File::create(&report_path)
        .map_err(|e| format!("create {}: {e}", report_path.display()))?;
    serde_json::to_writer_pretty(report_file, &report)
        .map_err(|e| format!("write report.json: {e}"))?;

    Ok(())
}

fn build_scene() -> SceneLayers {
    let root = CALayer::layer();
    root.setBounds(rect(0.0, 0.0, WIDTH as f64, HEIGHT as f64));
    root.setPosition(point(WIDTH as f64 / 2.0, HEIGHT as f64 / 2.0));
    root.setContentsScale(1.0);
    root.setBackgroundColor(Some(&cg_color(0.06, 0.08, 0.11, 1.0)));

    let hero = CALayer::layer();
    hero.setFrame(rect(240.0, 240.0, 3360.0, 1680.0));
    hero.setBackgroundColor(Some(&cg_color(0.10, 0.14, 0.22, 1.0)));

    let accent = CALayer::layer();
    accent.setFrame(rect(240.0, 280.0, 960.0, 120.0));
    accent.setBackgroundColor(Some(&cg_color(0.96, 0.50, 0.16, 1.0)));

    let marker = CALayer::layer();
    marker.setFrame(rect(0.0, 520.0, 420.0, 420.0));
    marker.setBackgroundColor(Some(&cg_color(0.14, 0.77, 0.74, 1.0)));

    let pulse = CALayer::layer();
    pulse.setFrame(rect(320.0, 1440.0, 3040.0, 120.0));
    pulse.setBackgroundColor(Some(&cg_color(0.96, 0.95, 0.92, 1.0)));

    root.addSublayer(&hero);
    root.addSublayer(&accent);
    root.addSublayer(&marker);
    root.addSublayer(&pulse);

    SceneLayers {
        root,
        hero,
        accent,
        marker,
        pulse,
    }
}

fn update_scene(scene: &SceneLayers, frame_index: usize) {
    let step = frame_index as f64;
    let accent_x = 240.0 + (step * 520.0);
    let marker_x = 360.0 + (step * 620.0);
    let marker_y = 520.0 + (step * 180.0);
    let pulse_width = 860.0 + (step * 460.0);
    let hero_blue = 0.22 + (step * 0.04);

    CATransaction::begin();
    CATransaction::setDisableActions(true);
    CATransaction::setAnimationDuration(0.0);

    scene
        .root
        .setBackgroundColor(Some(&cg_color(0.06, 0.08 + step * 0.01, 0.11 + step * 0.01, 1.0)));
    scene
        .hero
        .setBackgroundColor(Some(&cg_color(0.10, 0.14, hero_blue.min(0.42), 1.0)));
    scene
        .accent
        .setFrame(rect(accent_x, 280.0, 960.0, 120.0));
    scene
        .accent
        .setBackgroundColor(Some(&cg_color(0.96, 0.50 + step * 0.05, 0.16, 1.0)));
    scene
        .marker
        .setFrame(rect(marker_x, marker_y, 420.0, 420.0));
    scene
        .marker
        .setBackgroundColor(Some(&cg_color(0.14 + step * 0.09, 0.77, 0.74 - step * 0.08, 1.0)));
    scene
        .pulse
        .setFrame(rect(320.0, 1440.0, pulse_width, 120.0));
    scene
        .pulse
        .setBackgroundColor(Some(&cg_color(0.96, 0.95 - step * 0.03, 0.92, 1.0)));

    scene.root.setNeedsDisplay();
    scene.hero.setNeedsDisplay();
    scene.accent.setNeedsDisplay();
    scene.marker.setNeedsDisplay();
    scene.pulse.setNeedsDisplay();
    scene.root.displayIfNeeded();
    CATransaction::commit();
    CATransaction::flush();
}

fn cg_color(r: f64, g: f64, b: f64, a: f64) -> objc2::rc::Retained<objc2_core_graphics::CGColor> {
    NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, a).CGColor()
}

fn point(x: f64, y: f64) -> objc2_core_foundation::CGPoint {
    objc2_core_foundation::CGPoint { x, y }
}

fn rect(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> objc2_core_foundation::CGRect {
    objc2_core_foundation::CGRect {
        origin: point(x, y),
        size: objc2_core_foundation::CGSize { width, height },
    }
}

fn copy_surface_bgra_into(
    surface: &IOSurfaceRef,
    width: usize,
    height: usize,
    output: &mut [u8],
) -> Result<(), String> {
    let row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| format!("width overflow: {width}"))?;
    let total = row_bytes
        .checked_mul(height)
        .ok_or_else(|| format!("raster overflow: {width}x{height}"))?;
    let packed = &mut output[..];
    if packed.len() != total {
        return Err(format!(
            "packed buffer len mismatch: got {} expected {total}",
            packed.len()
        ));
    }

    let mut seed: u32 = 0;
    let lock_status = unsafe { surface.lock(IOSurfaceLockOptions::ReadOnly, &mut seed) };
    if lock_status != 0 {
        return Err(format!("IOSurfaceLock(ReadOnly) failed: {lock_status}"));
    }

    let base = surface.base_address();
    let bytes_per_row = surface.bytes_per_row();
    if bytes_per_row < row_bytes {
        let _ = unsafe { surface.unlock(IOSurfaceLockOptions::ReadOnly, &mut seed) };
        return Err(format!(
            "bytes_per_row ({bytes_per_row}) < width*4 ({row_bytes})"
        ));
    }

    let base_ptr = base.as_ptr() as *const u8;
    for y in 0..height {
        let src_row = unsafe { base_ptr.add(y * bytes_per_row) };
        let dst_row = &mut packed[y * row_bytes..(y + 1) * row_bytes];
        unsafe {
            ptr::copy_nonoverlapping(src_row, dst_row.as_mut_ptr(), row_bytes);
        }
    }

    let unlock_status = unsafe { surface.unlock(IOSurfaceLockOptions::ReadOnly, &mut seed) };
    if unlock_status != 0 {
        return Err(format!("IOSurfaceUnlock(ReadOnly) failed: {unlock_status}"));
    }

    Ok(())
}

fn center_rgba(bgra: &[u8], width: usize, height: usize) -> [u8; 4] {
    let cx = width / 2;
    let cy = height / 2;
    let idx = (cy * width + cx) * 4;
    [bgra[idx + 2], bgra[idx + 1], bgra[idx], bgra[idx + 3]]
}

fn write_png_with_ffmpeg(raw_path: &Path, png_path: &Path) -> Result<(), String> {
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            RAW_PIXEL_FORMAT,
            "-video_size",
            "3840x2160",
            "-i",
        ])
        .arg(raw_path)
        .args(["-frames:v", "1"])
        .arg(png_path)
        .status()
        .map_err(|e| format!("spawn ffmpeg: {e}"))?;
    if !status.success() {
        return Err(format!(
            "ffmpeg raw->png failed for {} with {}",
            raw_path.display(),
            status
        ));
    }
    Ok(())
}

fn current_peak_rss_bytes() -> Result<u64, String> {
    let mut usage = std::mem::MaybeUninit::<rusage>::uninit();
    let status = unsafe { getrusage(RUSAGE_SELF, usage.as_mut_ptr()) };
    if status != 0 {
        return Err(format!("getrusage failed: {status}"));
    }
    let usage = unsafe { usage.assume_init() };
    Ok(usage.ru_maxrss as u64)
}

fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

fn host_info(output_dir: &Path) -> Result<HostInfo, String> {
    let arch = run_text_command("uname", &["-m"])?;
    let cpu_brand = run_text_command("sysctl", &["-n", "machdep.cpu.brand_string"])?;
    let os_version = run_text_command("sw_vers", &["-productVersion"])?;
    let host = HostInfo {
        is_intel_host: arch == "x86_64",
        arch,
        cpu_brand,
        os_version,
    };

    let host_path = output_dir.join("host.txt");
    fs::write(
        &host_path,
        format!(
            "arch={}\ncpu_brand={}\nos_version={}\n",
            host.arch, host.cpu_brand, host.os_version
        ),
    )
    .map_err(|e| format!("write {}: {e}", host_path.display()))?;

    Ok(host)
}

fn ffprobe_raw_frame(path: &Path) -> Option<FfprobeStream> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pixel_format",
            RAW_PIXEL_FORMAT,
            "-video_size",
            "3840x2160",
            "-show_entries",
            "stream=codec_name,codec_type,pix_fmt,width,height",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let first = value.get("streams")?.as_array()?.first()?.clone();
    serde_json::from_value(first).ok()
}

fn probe_hevc_main10() -> Result<Main10Probe, String> {
    let attrs = pixel_buffer_attributes(WIDTH as i32, HEIGHT as i32);
    let mut session_ptr: *mut VTCompressionSession = ptr::null_mut();

    let create_status = unsafe {
        VTCompressionSession::create(
            None,
            WIDTH as i32,
            HEIGHT as i32,
            kCMVideoCodecType_HEVC,
            None,
            Some(attrs.as_ref()),
            None,
            Some(dummy_vt_output_callback),
            ptr::null_mut(),
            NonNull::from(&mut session_ptr),
        )
    };

    if create_status != 0 {
        return Ok(Main10Probe {
            session_create_status: create_status,
            main_profile_set_status: None,
            main10_profile_set_status: None,
            current_host_supports_main10: false,
            intel_mac_support_status: "unverified_non_intel_host".to_string(),
        });
    }

    let session_nn = NonNull::new(session_ptr)
        .ok_or_else(|| "VTCompressionSessionCreate returned null session".to_string())?;
    let session = unsafe { CFRetained::from_raw(session_nn) };

    let main_status = set_vt_property(
        &session,
        unsafe { kVTCompressionPropertyKey_ProfileLevel },
        unsafe { kVTProfileLevel_HEVC_Main_AutoLevel }.as_ref(),
    );
    let main10_status = set_vt_property(
        &session,
        unsafe { kVTCompressionPropertyKey_ProfileLevel },
        unsafe { kVTProfileLevel_HEVC_Main10_AutoLevel }.as_ref(),
    );

    unsafe {
        session.invalidate();
    }

    let current_host_supports_main10 = main10_status == 0;
    let intel_mac_support_status = if env::consts::ARCH == "x86_64" {
        if current_host_supports_main10 {
            "supported_on_current_intel_host"
        } else {
            "unsupported_on_current_intel_host"
        }
    } else {
        "unverified_non_intel_host"
    }
    .to_string();

    Ok(Main10Probe {
        session_create_status: create_status,
        main_profile_set_status: Some(main_status),
        main10_profile_set_status: Some(main10_status),
        current_host_supports_main10,
        intel_mac_support_status,
    })
}

fn set_vt_property(session: &VTCompressionSession, key: &CFString, value: &CFType) -> i32 {
    unsafe {
        let vt_session: &VTSession = &*(session as *const VTCompressionSession as *const VTSession);
        VTSessionSetProperty(vt_session, key, Some(value))
    }
}

fn pixel_buffer_attributes(width: i32, height: i32) -> CFRetained<CFDictionary<CFType, CFType>> {
    let w = CFNumber::new_i32(width);
    let h = CFNumber::new_i32(height);
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

unsafe extern "C-unwind" fn dummy_vt_output_callback(
    _output_callback_ref_con: *mut c_void,
    _source_frame_ref_con: *mut c_void,
    _status: i32,
    _info_flags: VTEncodeInfoFlags,
    _sample_buffer: *mut objc2_core_media::CMSampleBuffer,
) {
}

fn file_name_string(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("non-utf8 file name: {}", path.display()))
}

fn run_text_command(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("spawn {cmd}: {e}"))?;
    if !output.status.success() {
        return Err(format!("{cmd} exited with {}", output.status));
    }
    let text = String::from_utf8(output.stdout)
        .map_err(|e| format!("{cmd} stdout utf8: {e}"))?;
    Ok(text.trim().to_string())
}
