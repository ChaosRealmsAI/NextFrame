use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use super::cli::{RECORDER_PATH_ENV, build_cli_args, resolve_parallel_executable};
use super::probe::probe_page;
use crate::api::{OUTPUT_JSON_ENV, RecordArgs, RecordOutput};
use crate::overlay::{PerfLogContext, write_perf_log};
use crate::util::create_temp_dir;

pub(super) fn record_parallel(
    args: &RecordArgs,
    frame_files: &[PathBuf],
    out: &Path,
    requested: usize,
) -> Result<RecordOutput, String> {
    let cli: crate::CommonArgs = args.clone().into();
    let plans = crate::plan::build_segment_plans(frame_files)?;
    let plan_duration_sec: f64 = plans.iter().map(|plan| plan.effective_duration_sec).sum();
    let page_probes = frame_files
        .iter()
        .map(|frame_file| probe_page(frame_file, &cli))
        .collect::<Vec<_>>();
    let html_duration_sec = page_probes
        .iter()
        .all(|probe| probe.duration_sec.is_some())
        .then(|| {
            page_probes
                .iter()
                .filter_map(|probe| probe.duration_sec)
                .sum()
        });
    let audio_src = plans
        .iter()
        .map(|plan| plan.metadata.audio_path.as_deref())
        .zip(page_probes.iter().map(|probe| probe.audio_path.as_deref()))
        .find_map(|(planned, probed)| probed.or(planned));
    let video_layers_count: usize = page_probes
        .iter()
        .map(|probe| probe.video_layers_count)
        .sum();

    let cpus = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    let num_procs = if requested == 0 {
        frame_files.len().min(cpus / 2).clamp(1, 4)
    } else {
        requested.min(frame_files.len()).max(1)
    };

    if num_procs <= 1 {
        return Err("--parallel 1 is equivalent to serial mode; omit --parallel".into());
    }

    let exe = resolve_parallel_executable()?;
    let temp_root = create_temp_dir()?;
    let chunk_size = frame_files.len().div_ceil(num_procs);
    let groups: Vec<&[PathBuf]> = frame_files.chunks(chunk_size).collect();
    let actual_procs = groups.len();
    let group_sizes: Vec<usize> = groups.iter().map(|group| group.len()).collect();

    println!(
        "\n  parallel: {} processes, {} files ({})\n",
        actual_procs,
        frame_files.len(),
        group_sizes
            .iter()
            .map(|count| count.to_string())
            .collect::<Vec<_>>()
            .join("/")
    );

    let started_at = Instant::now();
    let mut children = Vec::with_capacity(actual_procs);
    let mut group_outputs = Vec::with_capacity(actual_procs);
    let mut group_result_files = Vec::with_capacity(actual_procs);

    for (idx, group) in groups.iter().enumerate() {
        let group_out = temp_root.join(format!("group-{idx:02}.mp4"));
        let group_result = temp_root.join(format!("group-{idx:02}.json"));
        let group_args = RecordArgs {
            frames: group.to_vec(),
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
            frame_range: None,
            render_scale: args.render_scale,
            disable_audio: args.disable_audio,
        };

        let mut cmd = Command::new(&exe);
        cmd.args(build_cli_args(&group_args));
        cmd.env(OUTPUT_JSON_ENV, &group_result);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|err| format!("failed to spawn recorder process {}: {err}", idx + 1))?;
        println!(
            "  [{}] spawned (pid {}, {} slides)",
            idx + 1,
            child.id(),
            group.len()
        );

        children.push(child);
        group_outputs.push(group_out);
        group_result_files.push(group_result);
    }

    let mut failed = false;
    for (idx, child) in children.into_iter().enumerate() {
        let output = child
            .wait_with_output()
            .map_err(|err| format!("failed to wait for process {}: {err}", idx + 1))?;

        if output.status.success() {
            println!("  [{}] done", idx + 1);
        } else {
            trace_log!(
                "  [{}] FAILED (exit {}): {}",
                idx + 1,
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            );
            failed = true;
        }
    }

    if failed {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(format!(
            "one or more parallel recorder processes failed; set {RECORDER_PATH_ENV} to the recorder CLI binary when using library-driven parallel mode"
        ));
    }

    for (idx, path) in group_outputs.iter().enumerate() {
        if !path.exists() {
            let _ = fs::remove_dir_all(&temp_root);
            return Err(format!(
                "group {} output missing: {}",
                idx + 1,
                path.display()
            ));
        }
    }

    let mut total_frames = 0usize;
    let mut skipped_frames = 0usize;
    let mut duration_sec = 0.0f64;
    for (idx, result_path) in group_result_files.iter().enumerate() {
        let bytes = fs::read(result_path).map_err(|err| {
            format!(
                "failed to read group {} result {}: {err}",
                idx + 1,
                result_path.display()
            )
        })?;
        let group_output: RecordOutput = serde_json::from_slice(&bytes).map_err(|err| {
            format!(
                "failed to decode group {} result {}: {err}",
                idx + 1,
                result_path.display()
            )
        })?;
        total_frames += group_output.total_frames;
        skipped_frames += group_output.skipped_frames;
        duration_sec += group_output.duration_sec;
    }

    println!("\n  concat {} groups...", actual_procs);
    let concat_result = super::super::concat_output(&group_outputs, out, duration_sec);
    let _ = fs::remove_dir_all(&temp_root);
    concat_result?;

    let elapsed = started_at.elapsed();
    let output_size_mb = fs::metadata(out)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    let measured_fps = total_frames as f64 / elapsed.as_secs_f64().max(0.001);

    println!("\n  ✓ {}", out.display());
    println!(
        "  {:.1} MB | {} processes | {:.1}s total\n",
        output_size_mb,
        actual_procs,
        elapsed.as_secs_f64()
    );

    write_perf_log(
        out,
        total_frames,
        skipped_frames,
        duration_sec,
        elapsed.as_secs_f64(),
        0.0,
        measured_fps,
        output_size_mb,
        (
            (args.width * args.dpr).round() as usize,
            (args.height * args.dpr).round() as usize,
        ),
        "parallel",
        PerfLogContext {
            output_path: Some(out),
            frame_files,
            video_overlay: None,
            html_duration_sec,
            plan_duration_sec,
            width: args.width,
            height: args.height,
            dpr: args.dpr,
            target_fps: args.fps,
            parallel: Some(actual_procs),
            render_scale: args.render_scale,
            has_audio: audio_src.is_some(),
            video_layers_count,
            audio_src,
            crf: args.crf,
            no_skip: args.no_skip,
            skip_aggressive: args.skip_aggressive,
        },
    );

    Ok(RecordOutput {
        output_path: out.to_path_buf(),
        total_frames,
        skipped_frames,
        duration_sec,
    })
}
