//! Parallel recording: spawns multiple recorder processes and concatenates results.

use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use super::{OUTPUT_JSON_ENV, RecordArgs, RecordOutput};
use crate::util::create_temp_dir;

const RECORDER_PATH_ENV: &str = "NEXTFRAME_RECORDER_PATH";

#[derive(Default)]
struct PageProbe {
    duration_sec: Option<f64>,
    audio_path: Option<PathBuf>,
}

pub(super) fn record_parallel(
    args: &RecordArgs,
    frame_files: &[PathBuf],
    out: &Path,
    requested: usize,
) -> Result<RecordOutput, String> {
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
    let concat_result = super::concat_output(&group_outputs, out, duration_sec);
    let _ = fs::remove_dir_all(&temp_root);
    concat_result?;

    let elapsed = started_at.elapsed();
    let output_size_mb = fs::metadata(out)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);

    println!("\n  ✓ {}", out.display());
    println!(
        "  {:.1} MB | {} processes | {:.1}s total\n",
        output_size_mb,
        actual_procs,
        elapsed.as_secs_f64()
    );

    Ok(RecordOutput {
        output_path: out.to_path_buf(),
        total_frames,
        skipped_frames,
        duration_sec,
    })
}

fn resolve_parallel_executable() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os(RECORDER_PATH_ENV).map(PathBuf::from) {
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "{RECORDER_PATH_ENV} does not point to a file: {}",
            path.display()
        ));
    }

    let current = env::current_exe()
        .map_err(|err| format!("failed to find current executable for parallel recorder: {err}"))?;
    if current.is_file() {
        return Ok(current);
    }

    Err(format!(
        "failed to resolve recorder executable; set {RECORDER_PATH_ENV} to the nextframe-recorder CLI binary"
    ))
}

/// Parallel recording for a single HTML file by splitting the frame range.
/// Each subprocess records a slice of the total frames, then results are concatenated.
pub(super) fn record_parallel_single(
    args: &RecordArgs,
    html_file: &Path,
    out: &Path,
    requested: usize,
) -> Result<RecordOutput, String> {
    // Probe: determine total frame count from HTML page duration
    let cli: crate::CommonArgs = args.clone().into();
    let plans = crate::plan::build_segment_plans(&[html_file.to_path_buf()])?;
    let plan_duration = plans
        .first()
        .map(|p| p.effective_duration_sec)
        .unwrap_or(10.0);
    let planned_audio = plans
        .first()
        .and_then(|plan| plan.metadata.audio_path.clone());

    // Quick WebView probe for page-declared duration and runtime audio source.
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
        // Fall back to serial
        return super::record_single(&cli, &[html_file.to_path_buf()], out);
    }

    let exe = resolve_parallel_executable()?;
    let temp_root = create_temp_dir()?;

    // Split frame range evenly
    let chunk = total_frames.div_ceil(num_procs);
    let mut ranges = Vec::new();
    let mut start = 0usize;
    while start < total_frames {
        let end = (start + chunk).min(total_frames);
        ranges.push((start, end));
        start = end;
    }
    let actual_procs = ranges.len();

    println!(
        "\n  parallel (frame-slice): {} processes, {} total frames, {:.1}s duration\n",
        actual_procs, total_frames, duration,
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
        // Add frame-range
        cli_args.push(OsString::from("--frame-range"));
        cli_args.push(OsString::from(range_start.to_string()));
        cli_args.push(OsString::from(range_end.to_string()));
        cmd.args(cli_args);
        cmd.env(OUTPUT_JSON_ENV, &group_result);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|err| format!("failed to spawn recorder process {}: {err}", idx + 1))?;
        println!(
            "  [{}] spawned (pid {}, frames {}..{})",
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
        return Err("one or more parallel frame-slice processes failed".into());
    }

    // Aggregate results
    let mut total_frames_recorded = 0usize;
    let mut skipped_frames = 0usize;
    for result_path in &group_result_files {
        if let Ok(bytes) = fs::read(result_path) {
            if let Ok(r) = serde_json::from_slice::<RecordOutput>(&bytes) {
                total_frames_recorded += r.total_frames;
                skipped_frames += r.skipped_frames;
            }
        }
    }

    println!("\n  concat {} slices...", actual_procs);
    super::concat_output(&group_outputs, out, duration)?;
    if let Some(audio_path) = final_audio.as_deref() {
        let muxed_out = out.with_extension("muxed.mp4");
        let _ = fs::remove_file(&muxed_out);
        println!("  mux original audio once...");
        crate::encoder::mux_audio(out, Some(audio_path), duration, &muxed_out)?;
        fs::rename(&muxed_out, out).map_err(|err| {
            format!(
                "failed to replace concat output with remuxed file {}: {err}",
                muxed_out.display()
            )
        })?;
    }
    let _ = fs::remove_dir_all(&temp_root);

    let elapsed = started_at.elapsed();
    let output_size_mb = fs::metadata(out)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);

    println!("\n  ✓ {}", out.display());
    println!(
        "  {:.1} MB | {} processes | {:.1}s total | {:.1} effective fps\n",
        output_size_mb,
        actual_procs,
        elapsed.as_secs_f64(),
        total_frames_recorded as f64 / elapsed.as_secs_f64().max(0.001),
    );

    Ok(RecordOutput {
        output_path: out.to_path_buf(),
        total_frames: total_frames_recorded,
        skipped_frames,
        duration_sec: duration,
    })
}

/// Quick probe: load HTML in a temporary WebView and query runtime metadata.
fn probe_page(html_path: &Path, cli: &crate::CommonArgs) -> PageProbe {
    use objc2::MainThreadMarker;

    let Some(mtm) = MainThreadMarker::new() else {
        return PageProbe::default();
    };
    let Ok(host) = crate::webview::WebViewHost::new(mtm, false, cli.dpr, cli.width, cli.height)
    else {
        return PageProbe::default();
    };

    let root = html_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    let Ok(root) = root.canonicalize() else {
        return PageProbe::default();
    };
    let server = crate::server::HttpFileServer::start(root.clone()).ok();
    if let Some(ref server) = server {
        let Ok(url) = crate::webview::relative_http_url(&server.base_url(), &root, html_path)
        else {
            return PageProbe::default();
        };
        if host.load_url(&url).is_err() {
            return PageProbe::default();
        }
    } else {
        if host.load_file_url(html_path, &root).is_err() {
            return PageProbe::default();
        }
    }
    if host
        .wait_until_ready(std::time::Duration::from_secs(15))
        .is_err()
    {
        return PageProbe::default();
    }
    if host.prepare_page().is_err() {
        return PageProbe::default();
    }
    std::thread::sleep(std::time::Duration::from_millis(200));

    let duration_sec = host.query_page_duration();
    let segment_titles = [String::from("segment")];
    let segment_durations = [duration_sec.unwrap_or(0.0)];
    let _ = host.inject_state(0, "", 0.0, 0, 1, &segment_titles, &segment_durations, 0.0);
    let _ = host.flush_render(std::time::Duration::from_millis(200));
    let server_base_url = server.as_ref().map(|server| server.base_url());
    let audio_path = host.query_page_audio_src().and_then(|src| {
        crate::record::resolve_media_src(&src, server_base_url.as_deref(), &root, html_path)
    });

    PageProbe {
        duration_sec,
        audio_path,
    }
}

fn build_cli_args(args: &RecordArgs) -> Vec<OsString> {
    let mut cli_args = Vec::with_capacity(args.frames.len() + 16);
    cli_args.push(OsString::from("slide"));
    for frame in &args.frames {
        cli_args.push(frame.as_os_str().to_os_string());
    }
    cli_args.push(OsString::from("--out"));
    cli_args.push(args.out.as_os_str().to_os_string());
    cli_args.push(OsString::from("--fps"));
    cli_args.push(OsString::from(args.fps.to_string()));
    cli_args.push(OsString::from("--crf"));
    cli_args.push(OsString::from(args.crf.to_string()));
    cli_args.push(OsString::from("--dpr"));
    cli_args.push(OsString::from(args.dpr.to_string()));
    cli_args.push(OsString::from("--width"));
    cli_args.push(OsString::from(args.width.to_string()));
    cli_args.push(OsString::from("--height"));
    cli_args.push(OsString::from(args.height.to_string()));

    if let Some(jobs) = args.jobs {
        cli_args.push(OsString::from("--jobs"));
        cli_args.push(OsString::from(jobs.to_string()));
    }
    if args.no_skip {
        cli_args.push(OsString::from("--no-skip"));
    }
    if args.skip_aggressive {
        cli_args.push(OsString::from("--skip-aggressive"));
    }
    if args.headed {
        cli_args.push(OsString::from("--headed"));
    }
    if args.render_scale < 1.0 {
        cli_args.push(OsString::from("--render-scale"));
        cli_args.push(OsString::from(args.render_scale.to_string()));
    }
    if args.disable_audio {
        cli_args.push(OsString::from("--disable-audio"));
    }

    cli_args
}
