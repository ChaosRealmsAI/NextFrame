use std::path::Path;
use std::time::Duration;

use objc2::rc::{Retained, autoreleasepool};
use objc2_core_graphics::CGImage;

use crate::CommonArgs;
use crate::capture::{
    BLACK_FRAME_MAX_RETRIES, cgimage_from_nsimage, is_cgimage_mostly_black, is_nsimage_black,
};
use crate::clock::SegmentClock;
use crate::encoder::{EncoderBackend, SegmentEncoder};
use crate::plan::{SegmentPlan, SegmentSummary};
use crate::progress::ProgressBar;
use crate::server::HttpFileServer;
use crate::webview::{WebViewHost, relative_http_url};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureMethod {
    LayerRender,
    TakeSnapshot,
}

impl CaptureMethod {
    pub fn label(self) -> &'static str {
        match self {
            Self::LayerRender => "CALayer.render",
            Self::TakeSnapshot => "WKWebView.takeSnapshot",
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn record_segment(
    host: &mut WebViewHost,
    server: Option<&HttpFileServer>,
    root: &Path,
    plan: &SegmentPlan,
    index: usize,
    temp_root: &Path,
    offset_sec: f64,
    total_duration_sec: f64,
    cli: &CommonArgs,
    backend: EncoderBackend,
    total_segments: usize,
    segment_titles: &[String],
    segment_durations: &[f64],
    progress_color: Option<(f64, f64, f64)>,
) -> Result<SegmentSummary, String> {
    host.reset_webview()?;
    if let Some(server) = server {
        let url = relative_http_url(&server.base_url(), root, &plan.metadata.html_path)?;
        host.load_url(&url)?;
    } else {
        host.load_file_url(&plan.metadata.html_path, root)?;
    }
    host.wait_until_ready(Duration::from_secs(30))?;
    host.prepare_page()?;
    std::thread::sleep(Duration::from_millis(100));
    host.flush_render(Duration::from_millis(50))?;

    // Query #sk-progress slot position for pixel-level progress bar overlay
    let progress_rect = if total_segments > 1 {
        let rect = host.query_progress_rect(cli.dpr);
        match &rect {
            Some(r) => println!(
                "  progress bar found: {}x{} at ({},{})",
                r.width, r.height, r.x, r.y
            ),
            None => println!("  progress bar: not found in DOM"),
        }
        rect.map(|rect| {
            let bar = ProgressBar::new(rect, segment_durations);
            match progress_color {
                Some((r, g, b)) => bar.with_color(r, g, b),
                None => bar,
            }
        })
    } else {
        None
    };

    let segment_path = temp_root.join(format!("seg{:03}.mp4", index));
    let mut encoder = SegmentEncoder::spawn(
        &segment_path,
        plan.metadata.audio_path.as_deref(),
        plan.effective_duration_sec.max(0.1),
        cli.fps,
        cli.crf,
        backend,
    )?;
    let mut clock = SegmentClock::new(
        &plan.metadata,
        cli.fps,
        offset_sec,
        total_duration_sec,
        plan.effective_duration_sec,
        cli.no_skip,
        cli.skip_aggressive,
    );

    let mut capture_method = CaptureMethod::LayerRender;
    println!(
        "  segment {} capture: {}",
        index + 1,
        capture_method.label()
    );

    let mut last_image: Option<Retained<CGImage>> = None;
    let total_frames = clock.total_frames();
    let batch_size = if cli.no_skip { 1usize } else { 5usize };
    let mut frame_index = 0usize;
    while frame_index < total_frames {
        let batch_end = (frame_index + batch_size).min(total_frames);
        let mut decisions = Vec::with_capacity(batch_end - frame_index);
        for fi in frame_index..batch_end {
            decisions.push((fi, clock.next(fi)));
        }

        autoreleasepool(|_| -> Result<(), String> {
            let mut i = 0;
            while i < decisions.len() {
                let (fi, ref decision) = decisions[i];
                if !decision.needs_capture && last_image.is_some() {
                    let image = last_image
                        .as_ref()
                        .ok_or_else(|| "missing cached frame for skipped render".to_string())?;
                    let prog = progress_rect
                        .as_ref()
                        .map(|pb| pb.overlay(decision.progress_pct));
                    encoder.write_cgimage_with_progress(image, prog)?;
                    i += 1;
                    continue;
                }

                let run_start = i;
                let mut run_end = i + 1;
                while run_end < decisions.len() {
                    let (_, ref next_decision) = decisions[run_end];
                    if !next_decision.needs_capture && last_image.is_some() {
                        break;
                    }
                    run_end += 1;
                }

                if run_end - run_start == 1 {
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
                    let image = capture_frame(host, index, fi, &mut capture_method)?;
                    let prog = progress_rect
                        .as_ref()
                        .map(|pb| pb.overlay(decision.progress_pct));
                    encoder.write_cgimage_with_progress(&image, prog)?;
                    last_image = Some(image);
                } else {
                    let batch_frames: Vec<_> = (run_start..run_end)
                        .map(|j| {
                            let (_, ref d) = decisions[j];
                            (
                                d.cue_index,
                                d.subtitle_text.as_str(),
                                d.progress_pct,
                                index,
                                total_segments,
                                segment_titles,
                                segment_durations,
                                d.timestamp_sec,
                            )
                        })
                        .collect();
                    host.inject_states_batch(&batch_frames)?;

                    let last_fi = decisions[run_end - 1].0;
                    let image = capture_frame(host, index, last_fi, &mut capture_method)?;
                    for (_, d) in &decisions[run_start..run_end] {
                        let prog = progress_rect.as_ref().map(|pb| pb.overlay(d.progress_pct));
                        encoder.write_cgimage_with_progress(&image, prog)?;
                    }
                    last_image = Some(image);
                }

                i = run_end;
            }
            Ok(())
        })?;

        let last_in_batch = batch_end - 1;
        if frame_index.is_multiple_of(100) || last_in_batch + 1 == total_frames {
            println!(
                "    seg {}: frame {}/{} (skip {})",
                index + 1,
                last_in_batch + 1,
                total_frames,
                clock.skipped_frames()
            );
        }

        frame_index = batch_end;
    }
    encoder.finish()?;

    println!(
        "  ✓ {} ({:.1}s audio, {} skipped, {})",
        plan.metadata
            .html_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("segment"),
        plan.audio_duration_sec.max(plan.effective_duration_sec),
        clock.skipped_frames(),
        backend.label()
    );

    Ok(SegmentSummary {
        path: segment_path,
        total_frames,
        skipped_frames: clock.skipped_frames(),
    })
}

pub fn capture_frame(
    host: &WebViewHost,
    segment_index: usize,
    frame_index: usize,
    capture_method: &mut CaptureMethod,
) -> Result<Retained<CGImage>, String> {
    if *capture_method == CaptureMethod::LayerRender {
        match host.snapshot_via_layer() {
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
