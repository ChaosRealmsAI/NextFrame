//! recording frame capture loop
use std::time::Duration;

use objc2::rc::{Retained, autoreleasepool};
use objc2_core_graphics::CGImage;

use crate::CommonArgs;
use crate::capture::{
    BLACK_FRAME_MAX_RETRIES, cgimage_from_nsimage, is_cgimage_mostly_black, is_nsimage_black,
};
use crate::plan::SegmentPlan;
use crate::webview::WebViewHost;

use super::setup::SegmentContext;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum CaptureMethod {
    LayerRender,
    TakeSnapshot,
}

impl CaptureMethod {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::LayerRender => "CALayer.render",
            Self::TakeSnapshot => "WKWebView.takeSnapshot",
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn record_frames(
    host: &WebViewHost,
    plan: &SegmentPlan,
    index: usize,
    cli: &CommonArgs,
    total_segments: usize,
    segment_titles: &[String],
    segment_durations: &[f64],
    context: &mut SegmentContext,
) -> Result<usize, String> {
    let progress_bar = context.progress_bar.as_ref();
    let encoder = &mut context.encoder;
    let clock = &mut context.clock;
    let mut capture_method = CaptureMethod::LayerRender;
    let is_upscaling = cli.render_scale < 1.0;
    let (output_pw, output_ph) = host.target_pixel_size();
    if is_upscaling {
        let render_w = ((output_pw as f64 * cli.render_scale).round() as usize).max(2) & !1;
        let render_h = ((output_ph as f64 * cli.render_scale).round() as usize).max(2) & !1;
        println!(
            "  segment {} capture: {} (render {}x{} -> upscale {}x{})",
            index + 1,
            capture_method.label(),
            render_w,
            render_h,
            output_pw,
            output_ph,
        );
    } else {
        println!(
            "  segment {} capture: {}",
            index + 1,
            capture_method.label()
        );
    }

    let mut last_image: Option<Retained<CGImage>> = None;
    let total_frames = clock.total_frames();
    // Frame range for intra-segment parallelism
    let (range_start, range_end) = match cli.frame_range {
        Some((s, e)) => (s.min(total_frames), e.min(total_frames)),
        None => (0, total_frames),
    };
    let no_timing_data = plan.metadata.total_cues == 0 && plan.metadata.subtitles.is_empty();
    let batch_size = if cli.no_skip || no_timing_data {
        1usize
    } else {
        5usize
    };
    let mut frame_index = range_start;
    while frame_index < range_end {
        let batch_end = (frame_index + batch_size).min(range_end);
        let mut decisions = Vec::with_capacity(batch_end - frame_index);
        for fi in frame_index..batch_end {
            let mut decision = clock.next(fi);
            if !cli.no_skip {
                let prev_time_sec = if fi == 0 {
                    -1.0 / cli.fps as f64
                } else {
                    (fi - 1) as f64 / cli.fps as f64
                };
                if host.has_frame_changed(prev_time_sec, decision.timestamp_sec)? == Some(true) {
                    decision.needs_capture = true;
                }
            }
            clock.record_capture_decision(decision.needs_capture);
            decisions.push((fi, decision));
        }

        autoreleasepool(|_| -> Result<(), String> {
            for (fi, decision) in &decisions {
                if !decision.needs_capture && last_image.is_some() {
                    let image = last_image
                        .as_ref()
                        .ok_or_else(|| "missing cached frame for skipped render".to_string())?;
                    let prog = progress_bar.map(|pb| pb.overlay(decision.progress_pct));
                    if is_upscaling {
                        encoder.write_cgimage_scaled(image, output_pw, output_ph, prog)?;
                    } else {
                        encoder.write_cgimage_with_progress(image, prog)?;
                    }
                    continue;
                }

                host.inject_state(
                    decision.cue_index,
                    &decision.subtitle_text,
                    decision.progress_pct,
                    index,
                    total_segments,
                    segment_titles,
                    segment_durations,
                    decision.timestamp_sec,
                )?;
                let image = capture_frame(host, index, *fi, &mut capture_method, cli.render_scale)?;
                let prog = progress_bar.map(|pb| pb.overlay(decision.progress_pct));
                if is_upscaling {
                    encoder.write_cgimage_scaled(&image, output_pw, output_ph, prog)?;
                } else {
                    encoder.write_cgimage_with_progress(&image, prog)?;
                }
                last_image = Some(image);
            }
            Ok(())
        })?;

        let last_in_batch = batch_end - 1;
        if frame_index.is_multiple_of(100) || last_in_batch + 1 == range_end {
            println!(
                "    seg {}: frame {}/{} (skip {})",
                index + 1,
                last_in_batch + 1 - range_start,
                range_end - range_start,
                clock.skipped_frames()
            );
        }

        frame_index = batch_end;
    }

    Ok(range_end - range_start)
}

pub(super) fn capture_frame(
    host: &WebViewHost,
    segment_index: usize,
    frame_index: usize,
    capture_method: &mut CaptureMethod,
    render_scale: f64,
) -> Result<Retained<CGImage>, String> {
    if *capture_method == CaptureMethod::LayerRender {
        match host.snapshot_via_layer_scaled(render_scale) {
            Ok(image) => {
                if frame_index == 0 && is_cgimage_mostly_black(&image)? {
                    eprintln!(
                        "  warn seg {} frame {}: {} produced a mostly black image; falling back to {}",
                        segment_index + 1,
                        frame_index + 1,
                        CaptureMethod::LayerRender.label(),
                        CaptureMethod::TakeSnapshot.label()
                    );
                    *capture_method = CaptureMethod::TakeSnapshot;
                    println!(
                        "  segment {} capture: {}",
                        segment_index + 1,
                        capture_method.label()
                    );
                } else {
                    return Ok(image);
                }
            }
            Err(err) => {
                eprintln!(
                    "  warn seg {} frame {}: {} failed ({err}); falling back to {}",
                    segment_index + 1,
                    frame_index + 1,
                    CaptureMethod::LayerRender.label(),
                    CaptureMethod::TakeSnapshot.label()
                );
                *capture_method = CaptureMethod::TakeSnapshot;
                println!(
                    "  segment {} capture: {}",
                    segment_index + 1,
                    capture_method.label()
                );
            }
        }
    }

    for attempt in 0..=BLACK_FRAME_MAX_RETRIES {
        let image = host.snapshot_nsimage()?;
        if !is_nsimage_black(&image)? {
            return cgimage_from_nsimage(&image);
        }
        if attempt < BLACK_FRAME_MAX_RETRIES {
            host.flush_render(Duration::from_millis(50))?;
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    Err(format!(
        "segment {} frame {} remained black after {} snapshot attempts",
        segment_index + 1,
        frame_index + 1,
        BLACK_FRAME_MAX_RETRIES + 1
    ))
}
