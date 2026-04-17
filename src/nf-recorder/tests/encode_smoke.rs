use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use nf_recorder::compositor::MetalCompositor;
use nf_recorder::encoder::Encoder;
use nf_recorder::muxer::FragmentedMp4Writer;
use nf_recorder::pattern::make_bgra_test_frame;

#[test]
fn encode_smoke_outputs_hevc_main10_fragmented_mp4() -> Result<()> {
    let out_path = temp_path("encode-smoke.mp4");
    let width = 640usize;
    let height = 360usize;
    let fps = 30u32;
    let frames = 30u32;
    let compositor = MetalCompositor::new(width, height)?;
    let mut encoder = Encoder::new(width, height, fps)?;
    let mut muxer = None;

    for frame_index in 0..frames {
        let source = make_bgra_test_frame(width, height, frame_index)?;
        let composited = compositor.composite(source.as_ref())?;
        let encoded = encoder.encode_frame(frame_index, composited.pixel_buffer())?;
        if muxer.is_none() {
            muxer = Some(FragmentedMp4Writer::new(
                &out_path,
                width as u16,
                height as u16,
                fps,
                encoded.sample_entry.clone(),
            )?);
        }
        if let Some(muxer) = muxer.as_mut() {
            muxer.write_sample(&encoded)?;
        }
    }
    encoder.finish()?;
    if let Some(muxer) = muxer.as_mut() {
        muxer.finish()?;
    } else {
        bail!("muxer was never initialized");
    }

    let ffprobe = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,profile,pix_fmt,color_primaries,color_transfer",
            "-of",
            "default=nokey=0:noprint_wrappers=1",
        ])
        .arg(&out_path)
        .output()
        .context("run ffprobe")?;
    if !ffprobe.status.success() {
        bail!("ffprobe failed: {}", String::from_utf8_lossy(&ffprobe.stderr));
    }
    let stdout = String::from_utf8(ffprobe.stdout)?;
    assert!(stdout.contains("codec_name=hevc"), "{stdout}");
    assert!(stdout.contains("profile=Main 10"), "{stdout}");
    assert!(stdout.contains("pix_fmt=yuv420p10le"), "{stdout}");
    assert!(stdout.contains("color_primaries=bt2020"), "{stdout}");
    assert!(stdout.contains("color_transfer=smpte2084"), "{stdout}");

    let bytes = fs::read(&out_path)?;
    let moof_count = bytes.windows(4).filter(|window| *window == b"moof").count();
    assert_eq!(moof_count, frames as usize);
    Ok(())
}

fn temp_path(name: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("nf-recorder-{nonce}-{name}"))
}
