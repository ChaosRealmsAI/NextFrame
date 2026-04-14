//! recording segment setup
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::clock::SegmentClock;
use crate::encoder::SegmentEncoder;
use crate::plan::{SegmentPlan, VideoLayerInfo};
use crate::progress::ProgressBar;
use crate::webview::{WebViewHost, relative_http_url};
use crate::webview::inject::FrameState;

use super::config::SegmentRecordingConfig;
use super::resolve_media_src;

pub(super) struct SegmentContext {
    pub(super) page_duration_sec: Option<f64>,
    pub(super) effective_duration: f64,
    pub(super) video_layers: Vec<VideoLayerInfo>,
    pub(super) progress_bar: Option<ProgressBar>,
    pub(super) segment_path: PathBuf,
    pub(super) effective_audio_path: Option<PathBuf>,
    pub(super) encoder: SegmentEncoder,
    pub(super) clock: SegmentClock,
}

pub(super) fn prepare_segment(
    host: &mut WebViewHost,
    plan: &SegmentPlan,
    cfg: &SegmentRecordingConfig<'_>,
) -> Result<SegmentContext, String> {
    let index = cfg.index;
    let cli = cfg.cli;
    let root = cfg.root;

    host.reset_webview()?;
    if let Some(server) = cfg.server {
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
    let page_duration_sec = page_duration.and_then(|dur| {
        if dur > 0.0 && dur.is_finite() {
            Some(dur)
        } else {
            None
        }
    });
    let effective_duration = if let Some(dur) = page_duration_sec {
        trace_log!(
            "segment {}: page reports duration={:.1}s (plan had {:.1}s)",
            index + 1,
            dur,
            plan.effective_duration_sec
        );
        dur
    } else {
        plan.effective_duration_sec
    };
    let server_base_url = cfg.server.map(|server| server.base_url());

    // Trigger one __onFrame at t=0 so all scene components get created
    // (audioTrack sets window.__audioSrc during create, videoClip initializes, etc.)
    host.inject_state(&FrameState {
        cue_index: 0,
        subtitle_text: "",
        progress_pct: 0.0,
        segment_index: index,
        total_segments: cfg.total_segments,
        segment_titles: cfg.segment_titles,
        segment_durations: cfg.segment_durations,
        video_time_sec: 0.0,
    })?;
    host.flush_render(Duration::from_millis(200))?;
    let video_layers = host.query_video_layers();
    if !video_layers.is_empty() {
        trace_log!(
            "segment {}: detected {} videoClip layer(s)",
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
                trace_log!("segment {}: page audio: {}", index + 1, path.display());
            } else {
                trace_log!(
                    "warn seg {}: could not resolve page audio src {}",
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
    let progress_bar = if cfg.total_segments > 1 {
        let rect = host.query_progress_rect(cli.dpr);
        match &rect {
            Some(r) => trace_log!(
                "progress bar found: {}x{} at ({},{})",
                r.width,
                r.height,
                r.x,
                r.y
            ),
            None => trace_log!("progress bar: not found in DOM"),
        }
        rect.map(|rect| {
            let bar = ProgressBar::new(rect, cfg.segment_durations);
            match cfg.progress_color {
                Some((r, g, b)) => bar.with_color(r, g, b),
                None => bar,
            }
        })
    } else {
        None
    };

    let segment_path = cfg.temp_root.join(format!("seg{:03}.mp4", index));
    let effective_audio = if cli.disable_audio {
        None
    } else {
        audio_override
            .as_deref()
            .or(plan.metadata.audio_path.as_deref())
    };
    let effective_audio_path = effective_audio.map(Path::to_path_buf);
    let encoder = SegmentEncoder::spawn(
        &segment_path,
        effective_audio,
        effective_duration.max(0.1),
        cli.fps,
        cli.crf,
        cfg.backend,
    )?;
    let clock = SegmentClock::new(
        &plan.metadata,
        cli.fps,
        cfg.offset_sec,
        cfg.total_duration_sec,
        effective_duration,
        cli.no_skip,
        cli.skip_aggressive,
    );

    Ok(SegmentContext {
        page_duration_sec,
        effective_duration,
        video_layers,
        progress_bar,
        segment_path,
        effective_audio_path,
        encoder,
        clock,
    })
}
