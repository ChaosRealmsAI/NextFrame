use std::path::{Path, PathBuf};
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

/// Simple percent-decoding for file URLs.
fn urlencoding_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| (c as char).to_digit(16));
            let lo = chars.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                result.push((h * 16 + l) as u8 as char);
            } else {
                result.push('%');
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

fn strip_query_and_fragment(input: &str) -> &str {
    let end = input
        .find(|ch| ch == '?' || ch == '#')
        .unwrap_or(input.len());
    &input[..end]
}

pub(crate) fn resolve_media_src(
    src: &str,
    server_base_url: Option<&str>,
    root: &Path,
    html_path: &Path,
) -> Option<PathBuf> {
    let raw = strip_query_and_fragment(src.trim());
    if raw.is_empty() {
        return None;
    }

    if let Some(stripped) = raw.strip_prefix("file://") {
        let decoded = urlencoding_decode(stripped.trim_start_matches("localhost/"));
        let path = PathBuf::from(decoded);
        return path.exists().then_some(path);
    }

    if raw.starts_with("http://") || raw.starts_with("https://") {
        if let Some(base_url) = server_base_url
            && let Some(relative) = raw.strip_prefix(base_url)
        {
            let path = root.join(urlencoding_decode(relative.trim_start_matches('/')));
            if path.exists() {
                return Some(path);
            }
        }
        if let Some((_, path_part)) = raw.split_once("://")
            && let Some((_, slash_and_path)) = path_part.split_once('/')
        {
            let path = root.join(urlencoding_decode(slash_and_path));
            if path.exists() {
                return Some(path);
            }
        }
        return None;
    }

    let decoded = urlencoding_decode(raw);
    let absolute = PathBuf::from(&decoded);
    if absolute.is_absolute() && absolute.exists() {
        return Some(absolute);
    }
    if decoded.starts_with('/') {
        let from_root = root.join(decoded.trim_start_matches('/'));
        if from_root.exists() {
            return Some(from_root);
        }
        if absolute.exists() {
            return Some(absolute);
        }
    }

    let parent = html_path.parent().unwrap_or_else(|| Path::new("."));
    let relative = parent.join(decoded);
    relative.exists().then_some(relative)
}

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

    // Query page-declared duration (v0.3 engine exposes this via JS)
    let page_duration = host.query_page_duration();
    let effective_duration = if let Some(dur) = page_duration {
        if dur > 0.0 && dur.is_finite() {
            println!(
                "  segment {}: page reports duration={:.1}s (plan had {:.1}s)",
                index + 1,
                dur,
                plan.effective_duration_sec
            );
            dur
        } else {
            plan.effective_duration_sec
        }
    } else {
        plan.effective_duration_sec
    };
    let server_base_url = server.map(|server| server.base_url());

    // Trigger one __onFrame at t=0 so all scene components get created
    // (audioTrack sets window.__audioSrc during create, videoClip initializes, etc.)
    host.inject_state(
        0,
        "",
        0.0,
        index,
        total_segments,
        segment_titles,
        segment_durations,
        0.0,
    )?;
    host.flush_render(Duration::from_millis(200))?;
    let video_layers = host.query_video_layers();
    if !video_layers.is_empty() {
        println!(
            "  segment {}: detected {} videoClip layer(s)",
            index + 1,
            video_layers.len()
        );
    }

    // Query page audio source (v0.3 audioTrack component sets window.__audioSrc)
    let audio_override = if cli.disable_audio {
        None
    } else if plan.metadata.audio_path.is_none() {
        if let Some(src) = host.query_page_audio_src() {
            let audio_path = resolve_media_src(
                &src,
                server_base_url.as_deref(),
                root,
                &plan.metadata.html_path,
            );
            if let Some(path) = &audio_path {
                println!("  segment {}: page audio: {}", index + 1, path.display());
            } else {
                eprintln!(
                    "  warn seg {}: could not resolve page audio src {}",
                    index + 1,
                    src
                );
            }
            audio_path
        } else {
            None
        }
    } else {
        None
    };

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
    let effective_audio = if cli.disable_audio {
        None
    } else {
        audio_override
            .as_deref()
            .or(plan.metadata.audio_path.as_deref())
    };
    let mut encoder = SegmentEncoder::spawn(
        &segment_path,
        effective_audio,
        effective_duration.max(0.1),
        cli.fps,
        cli.crf,
        backend,
    )?;
    let mut clock = SegmentClock::new(
        &plan.metadata,
        cli.fps,
        offset_sec,
        total_duration_sec,
        effective_duration,
        cli.no_skip,
        cli.skip_aggressive,
    );

    let mut capture_method = CaptureMethod::LayerRender;
    let is_upscaling = cli.render_scale < 1.0;
    let (output_pw, output_ph) = host.target_pixel_size();
    if is_upscaling {
        let render_w = ((output_pw as f64 * cli.render_scale).round() as usize).max(2) & !1;
        let render_h = ((output_ph as f64 * cli.render_scale).round() as usize).max(2) & !1;
        println!(
            "  segment {} capture: {} (render {}x{} → upscale {}x{})",
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
                    if is_upscaling {
                        encoder.write_cgimage_scaled(image, output_pw, output_ph, prog)?;
                    } else {
                        encoder.write_cgimage_with_progress(image, prog)?;
                    }
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
                    let image =
                        capture_frame(host, index, fi, &mut capture_method, cli.render_scale)?;
                    let prog = progress_rect
                        .as_ref()
                        .map(|pb| pb.overlay(decision.progress_pct));
                    if is_upscaling {
                        encoder.write_cgimage_scaled(&image, output_pw, output_ph, prog)?;
                    } else {
                        encoder.write_cgimage_with_progress(&image, prog)?;
                    }
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
                    let image =
                        capture_frame(host, index, last_fi, &mut capture_method, cli.render_scale)?;
                    for (_, d) in &decisions[run_start..run_end] {
                        let prog = progress_rect.as_ref().map(|pb| pb.overlay(d.progress_pct));
                        if is_upscaling {
                            encoder.write_cgimage_scaled(&image, output_pw, output_ph, prog)?;
                        } else {
                            encoder.write_cgimage_with_progress(&image, prog)?;
                        }
                    }
                    last_image = Some(image);
                }

                i = run_end;
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
    encoder.finish()?;

    let frames_recorded = range_end - range_start;
    println!(
        "  ✓ {} ({:.1}s, {} frames, {} skipped, {})",
        plan.metadata
            .html_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("segment"),
        plan.audio_duration_sec.max(effective_duration),
        frames_recorded,
        clock.skipped_frames(),
        backend.label()
    );

    Ok(SegmentSummary {
        path: segment_path,
        total_frames: frames_recorded,
        skipped_frames: clock.skipped_frames(),
        video_layers,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::resolve_media_src;
    use std::fs;
    use std::path::Path;

    #[test]
    fn resolves_relative_media_against_html_parent() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("demo.html");
        let media = root.join("clip.mp4");
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&media, b"clip").unwrap();

        let resolved = resolve_media_src("clip.mp4", None, &root, &html);

        assert_eq!(resolved.as_deref(), Some(media.as_path()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolves_server_media_url_to_root_path() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("slides").join("demo.html");
        let media_dir = root.join("videos");
        let media = media_dir.join("clip.mp4");
        fs::create_dir_all(html.parent().unwrap()).unwrap();
        fs::create_dir_all(&media_dir).unwrap();
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&media, b"clip").unwrap();

        let resolved = resolve_media_src(
            "http://127.0.0.1:9000/videos/clip.mp4?cache=1",
            Some("http://127.0.0.1:9000"),
            &root,
            &html,
        );

        assert_eq!(resolved.as_deref(), Some(media.as_path()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolves_percent_encoded_file_url() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("demo.html");
        let media = root.join("clip name.mp4");
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&media, b"clip").unwrap();
        let url = format!("file://{}", media.display()).replace(' ', "%20");

        let resolved = resolve_media_src(&url, None, Path::new("/"), &html);

        assert_eq!(resolved.as_deref(), Some(media.as_path()));
        let _ = fs::remove_dir_all(root);
    }
}

pub fn capture_frame(
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
