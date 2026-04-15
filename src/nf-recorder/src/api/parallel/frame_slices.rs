//! api parallel frame-slice recording
use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

use super::cli::{build_cli_args, resolve_parallel_executable};
use super::probe::probe_page;
use crate::api::{OUTPUT_JSON_ENV, RecordArgs, RecordOutput};
use crate::error_with_fix;
use crate::overlay::{PerfLogContext, PerfMetrics, write_perf_log};
use crate::util::create_temp_dir;

/// Parallel recording for a single HTML file by splitting the frame range.
/// Each subprocess records a slice of the total frames, then results are concatenated.
pub(super) fn record_parallel_single(
    args: &RecordArgs,
    html_file: &Path,
    out: &Path,
    requested: usize,
) -> Result<RecordOutput, String> {
    let cli: crate::CommonArgs = args.clone().into();
    let plans = crate::plan::build_segment_plans(&[html_file.to_path_buf()])?;
    let plan_duration = plans
        .first()
        .map(|plan| plan.effective_duration_sec)
        .unwrap_or(10.0);
    let planned_audio = plans
        .first()
        .and_then(|plan| plan.metadata.audio_path.clone());

    let page_probe = probe_page(html_file, &cli);
    let duration = page_probe.duration_sec.unwrap_or(plan_duration);
    let final_audio = if cli.disable_audio {
        None
    } else {
        planned_audio
            .or(page_probe.audio_path)
            .filter(|path| path.exists())
    };
    let total_frames = ((duration + 0.5) * args.fps as f64).ceil() as usize;

    let cpus = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    let num_procs = if requested == 0 {
        (cpus / 2).clamp(1, 4)
    } else {
        requested.max(1)
    };

    if num_procs <= 1 || total_frames < 2 {
        return super::super::orchestrator::record_single(&cli, &[html_file.to_path_buf()], out);
    }

    let exe = resolve_parallel_executable()?;
    let temp_root = create_temp_dir()?;

    let chunk = total_frames.div_ceil(num_procs);
    let mut ranges = Vec::new();
    let mut start = 0usize;
    while start < total_frames {
        let end = (start + chunk).min(total_frames);
        ranges.push((start, end));
        start = end;
    }
    let actual_procs = ranges.len();

    trace_log!(
        "parallel (frame-slice): {} processes, {} total frames, {:.1}s duration",
        actual_procs,
        total_frames,
        duration,
    );

    let started_at = Instant::now();
    let mut children = Vec::with_capacity(actual_procs);
    let mut group_outputs = Vec::with_capacity(actual_procs);
    let mut group_result_files = Vec::with_capacity(actual_procs);

    for (idx, &(range_start, range_end)) in ranges.iter().enumerate() {
        let group_out = temp_root.join(format!("slice-{idx:02}.mp4"));
        let group_result = temp_root.join(format!("slice-{idx:02}.json"));
        let group_args = RecordArgs {
            frames: vec![html_file.to_path_buf()],
            dir: None,
            out: group_out.clone(),
            fps: args.fps,
            crf: args.crf,
            dpr: args.dpr,
            jobs: args.jobs,
            no_skip: args.no_skip,
            skip_aggressive: args.skip_aggressive,
            headed: args.headed,
            width: args.width,
            height: args.height,
            parallel: None,
            frame_range: Some((range_start, range_end)),
            render_scale: args.render_scale,
            disable_audio: true,
        };

        let mut cmd = Command::new(&exe);
        let mut cli_args = build_cli_args(&group_args);
        cli_args.push(OsString::from("--frame-range"));
        cli_args.push(OsString::from(range_start.to_string()));
        cli_args.push(OsString::from(range_end.to_string()));
        cmd.args(cli_args);
        cmd.env(OUTPUT_JSON_ENV, &group_result);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let child = cmd.spawn().map_err(|err| {
            error_with_fix(
                &format!("spawn recorder process {}", idx + 1),
                err,
                "Check that the recorder binary exists and the system can launch subprocesses.",
            )
        })?;
        trace_log!(
            "[{}] spawned (pid {}, frames {}..{})",
            idx + 1,
            child.id(),
            range_start,
            range_end
        );

        children.push(child);
        group_outputs.push(group_out);
        group_result_files.push(group_result);
    }

    let mut failed = false;
    for (idx, child) in children.into_iter().enumerate() {
        let output = child.wait_with_output().map_err(|err| {
            error_with_fix(
                &format!("wait for recorder process {}", idx + 1),
                err,
                "Check that the recorder subprocess is still running and retry the command.",
            )
        })?;

        if output.status.success() {
            trace_log!("[{}] done", idx + 1);
        } else {
            trace_log!(
                "[{}] FAILED (exit {}): {}",
                idx + 1,
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            );
            failed = true;
        }
    }

    if failed {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "complete the frame-slice recording job",
                "one or more recorder subprocesses exited with a failure",
                "Inspect the subprocess stderr output and retry the recording job.",
            ),
        );
    }

    let mut total_frames_recorded = 0usize;
    let mut skipped_frames = 0usize;
    for result_path in &group_result_files {
        if let Ok(bytes) = fs::read(result_path)
            && let Ok(result) = serde_json::from_slice::<RecordOutput>(&bytes)
        {
            total_frames_recorded += result.total_frames;
            skipped_frames += result.skipped_frames;
        }
    }

    trace_log!("concat {} slices", actual_procs);
    super::super::orchestrator::concat_output(&group_outputs, out, duration)?;
    if let Some(audio_path) = final_audio.as_deref() {
        let muxed_out = out.with_extension("muxed.mp4");
        let _ = fs::remove_file(&muxed_out);
        trace_log!("mux original audio once");
        crate::encoder::mux_audio(out, Some(audio_path), duration, &muxed_out)?;
        fs::rename(&muxed_out, out).map_err(|err| {
            error_with_fix(
                "replace the concatenated output with the remuxed file",
                format!("{}: {err}", muxed_out.display()),
                "Check that the output path is writable and retry the recording job.",
            )
        })?;
    }
    let _ = fs::remove_dir_all(&temp_root);

    let elapsed = started_at.elapsed();
    let output_size_mb = fs::metadata(out)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    let frame_files = [html_file.to_path_buf()];

    trace_log!("output ready: {}", out.display());
    trace_log!(
        "{:.1} MB | {} processes | {:.1}s total | {:.1} effective fps",
        output_size_mb,
        actual_procs,
        elapsed.as_secs_f64(),
        total_frames_recorded as f64 / elapsed.as_secs_f64().max(0.001),
    );

    write_perf_log(
        out,
        &PerfMetrics {
            total_frames: total_frames_recorded,
            skipped_frames,
            content_duration: duration,
            record_secs: elapsed.as_secs_f64(),
            overlay_secs: 0.0,
            fps: total_frames_recorded as f64 / elapsed.as_secs_f64().max(0.001),
            size_mb: output_size_mb,
            pixel_size: (
                (args.width * args.dpr).round() as usize,
                (args.height * args.dpr).round() as usize,
            ),
            encoder: "parallel",
        },
        PerfLogContext {
            output_path: Some(out),
            frame_files: &frame_files,
            video_overlay: None,
            html_duration_sec: page_probe.duration_sec,
            plan_duration_sec: plan_duration,
            width: args.width,
            height: args.height,
            dpr: args.dpr,
            target_fps: args.fps,
            parallel: Some(actual_procs),
            render_scale: args.render_scale,
            has_audio: final_audio.is_some(),
            video_layers_count: page_probe.video_layers_count,
            audio_src: final_audio.as_deref(),
            crf: args.crf,
            no_skip: args.no_skip,
            skip_aggressive: args.skip_aggressive,
        },
    );

    Ok(RecordOutput {
        output_path: out.to_path_buf(),
        total_frames: total_frames_recorded,
        skipped_frames,
        duration_sec: duration,
    })
}
