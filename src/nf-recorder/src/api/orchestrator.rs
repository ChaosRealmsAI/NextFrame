//! api recording orchestration
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use objc2::MainThreadMarker;

use crate::CommonArgs;
use crate::api::RecordOutput;
use crate::overlay::{
    PerfLogContext, build_video_overlay_specs, overlay_video, overlay_video_layers, write_perf_log,
};
use crate::parser::SlideType;
use crate::plan::{build_segment_plans, detect_root};
use crate::record::record_segment;
use crate::util::{auto_jobs, create_temp_dir};
use crate::{encoder, server, webview};

pub(super) fn record_single(
    cli: &CommonArgs,
    frame_files: &[PathBuf],
    out: &Path,
) -> Result<RecordOutput, String> {
    let root = detect_root(frame_files)?;
    let requested_jobs = cli.jobs.unwrap_or_else(|| auto_jobs(cli.dpr));
    let effective_jobs = 1usize;

    println!("\n  recorder — CALayer.render + takeSnapshot fallback + VideoToolbox");
    println!("  frames: {}", frame_files.len());
    println!(
        "  output: {}x{} @{}fps CRF{} DPR {:.2}",
        (cli.width * cli.dpr).round() as usize,
        (cli.height * cli.dpr).round() as usize,
        cli.fps,
        cli.crf,
        cli.dpr
    );
    println!("  jobs: {requested_jobs} requested, {effective_jobs} active capture lane");
    println!("  file: {}\n", out.display());

    let plans = build_segment_plans(frame_files)?;
    let total_duration_sec: f64 = plans.iter().map(|plan| plan.effective_duration_sec).sum();
    let total_frame_budget: usize = plans
        .iter()
        .map(|plan| ((plan.effective_duration_sec + 0.5) * cli.fps as f64).ceil() as usize)
        .sum();
    println!(
        "  total audio: {:.1}s -> {} frames\n",
        total_duration_sec, total_frame_budget
    );

    let temp_root = create_temp_dir()?;
    let server = match server::HttpFileServer::start(root.clone()) {
        Ok(server) => {
            println!("  server: {}\n", server.base_url());
            Some(server)
        }
        Err(err) => {
            trace_log!("  warn server disabled: {err}");
            trace_log!("  warn falling back to file:// loadFileURL mode\n");
            None
        }
    };

    let backend = encoder::detect_backend();
    let mtm = MainThreadMarker::new().ok_or("recorder must start on the main thread")?;
    let mut host = webview::WebViewHost::new(mtm, cli.headed, cli.dpr, cli.width, cli.height)?;
    let pixel_size = host.target_pixel_size();
    println!(
        "  capture: {}x{} ({})\n",
        pixel_size.0,
        pixel_size.1,
        backend.label()
    );

    let started_at = Instant::now();
    let mut offset_sec = 0.0f64;
    let mut segment_paths = Vec::with_capacity(plans.len());
    let mut summaries = Vec::with_capacity(plans.len());
    let mut total_frames = 0usize;
    let segment_titles: Vec<String> = plans
        .iter()
        .map(|plan| {
            plan.metadata
                .html_path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("segment")
                .to_owned()
        })
        .collect();
    let total_segments = plans.len();
    let segment_durations: Vec<f64> = plans
        .iter()
        .map(|plan| plan.effective_duration_sec)
        .collect();

    let recording_result = (|| -> Result<(), String> {
        for (index, plan) in plans.iter().enumerate() {
            let summary = record_segment(
                &mut host,
                server.as_ref(),
                &root,
                plan,
                index,
                &temp_root,
                offset_sec,
                total_duration_sec,
                cli,
                backend,
                total_segments,
                &segment_titles,
                &segment_durations,
                None,
            )?;
            offset_sec += plan.effective_duration_sec;
            total_frames += summary.total_frames;

            let video_layer_overlays = build_video_overlay_specs(
                &summary.video_layers,
                &root,
                &plan.metadata.html_path,
                cli.width,
                cli.height,
                cli.dpr,
            )?;
            if !video_layer_overlays.is_empty() {
                overlay_video_layers(&summary.path, &video_layer_overlays)?;
            }

            if summary.video_layers.is_empty()
                && plan.metadata.slide_type == SlideType::Clip
                && let Some(ref audio) = plan.metadata.audio_path
            {
                let ext = audio.extension().and_then(|ext| ext.to_str()).unwrap_or("");
                if matches!(ext, "mp4" | "mov" | "webm") {
                    println!(
                        "  auto-overlay: clip segment {} → {}",
                        index + 1,
                        audio.display()
                    );
                    overlay_video(&summary.path, audio)?;
                }
            }

            segment_paths.push(summary.path.clone());
            summaries.push(summary);
        }

        concat_output(&segment_paths, out, total_duration_sec)?;
        Ok(())
    })();

    let _ = fs::remove_dir_all(&temp_root);
    recording_result?;

    let elapsed = started_at.elapsed();
    let output_size_mb = fs::metadata(out)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    let skipped_frames: usize = summaries.iter().map(|summary| summary.skipped_frames).sum();
    let measured_fps = total_frames as f64 / elapsed.as_secs_f64().max(0.001);
    let html_duration_sec = summaries
        .iter()
        .all(|summary| summary.page_duration_sec.is_some())
        .then(|| {
            summaries
                .iter()
                .filter_map(|summary| summary.page_duration_sec)
                .sum()
        });
    let video_layers_count: usize = summaries
        .iter()
        .map(|summary| summary.video_layers.len())
        .sum();
    let audio_src = summaries
        .iter()
        .find_map(|summary| summary.audio_path.as_deref());

    println!("\n  ✓ {}", out.display());
    println!(
        "  {:.1} MB | {}x{} | {}fps | {} | skipped {}",
        output_size_mb,
        pixel_size.0,
        pixel_size.1,
        cli.fps,
        backend.label(),
        skipped_frames
    );
    println!(
        "  {} frames in {:.2}s = {:.1} fps\n",
        total_frames,
        elapsed.as_secs_f64(),
        measured_fps
    );

    write_perf_log(
        out,
        total_frames,
        skipped_frames,
        total_duration_sec,
        elapsed.as_secs_f64(),
        0.0,
        measured_fps,
        output_size_mb,
        pixel_size,
        backend.label(),
        PerfLogContext {
            output_path: Some(out),
            frame_files,
            video_overlay: None,
            html_duration_sec,
            plan_duration_sec: total_duration_sec,
            width: cli.width,
            height: cli.height,
            dpr: cli.dpr,
            target_fps: cli.fps,
            parallel: cli.parallel,
            render_scale: cli.render_scale,
            has_audio: audio_src.is_some(),
            video_layers_count,
            audio_src,
            crf: cli.crf,
            no_skip: cli.no_skip,
            skip_aggressive: cli.skip_aggressive,
        },
    );

    Ok(RecordOutput {
        output_path: out.to_path_buf(),
        total_frames,
        skipped_frames,
        duration_sec: total_duration_sec,
    })
}

pub(super) fn concat_output(
    segment_paths: &[PathBuf],
    out: &Path,
    expected_duration_sec: f64,
) -> Result<(), String> {
    println!("\n  ffmpeg concat...");
    encoder::concat_segments(segment_paths, out)?;

    if segment_paths.len() > 1 {
        match encoder::probe_audio_duration(Some(out)) {
            Ok(actual) if actual > 0.0 => {
                let delta = f64::abs(actual - expected_duration_sec);
                if delta > 2.0 {
                    return Err(format!(
                        "concat duration mismatch: output {actual:.1}s vs expected {expected_duration_sec:.1}s (delta {delta:.1}s). \
                         This is a bug — segments have incompatible time_base."
                    ));
                }
                println!("  duration check: {actual:.1}s ≈ {expected_duration_sec:.1}s ✓");
            }
            _ => {
                trace_log!("  warn: could not verify output duration");
            }
        }
    }

    Ok(())
}
