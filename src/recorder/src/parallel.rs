use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::CommonArgs;
use crate::encoder::concat_segments;
use crate::util::create_temp_dir;

fn select_num_processes(frame_count: usize, requested: usize, cpus: usize) -> usize {
    if requested == 0 {
        frame_count.min(cpus / 2).clamp(1, 4)
    } else {
        requested.min(frame_count).max(1)
    }
}

fn segment_ranges(frame_count: usize, num_procs: usize) -> Vec<std::ops::Range<usize>> {
    if frame_count == 0 || num_procs == 0 {
        return Vec::new();
    }

    let chunk_size = frame_count.div_ceil(num_procs);
    (0..frame_count)
        .step_by(chunk_size)
        .map(|start| start..(start + chunk_size).min(frame_count))
        .collect()
}

fn group_output_path(temp_root: &Path, idx: usize) -> PathBuf {
    temp_root.join(format!("group-{idx:02}.mp4"))
}

fn build_subprocess_args(cli: &CommonArgs, group: &[PathBuf], group_out: &Path) -> Vec<OsString> {
    let mut args = Vec::with_capacity(group.len() + 14);

    args.push("slide".into());
    args.extend(group.iter().map(|file| file.as_os_str().to_os_string()));

    args.push("--out".into());
    args.push(group_out.as_os_str().to_os_string());
    args.push("--fps".into());
    args.push(cli.fps.to_string().into());
    args.push("--crf".into());
    args.push(cli.crf.to_string().into());
    args.push("--dpr".into());
    args.push(cli.dpr.to_string().into());
    args.push("--width".into());
    args.push(cli.width.to_string().into());
    args.push("--height".into());
    args.push(cli.height.to_string().into());

    if cli.no_skip {
        args.push("--no-skip".into());
    }
    if cli.skip_aggressive {
        args.push("--skip-aggressive".into());
    }
    if cli.headed {
        args.push("--headed".into());
    }

    args
}

#[allow(dead_code)]
pub(crate) fn run_parallel(
    cli: &CommonArgs,
    frame_files: &[PathBuf],
    out: &Path,
    requested: usize,
) -> Result<(), String> {
    use std::process::{Command, Stdio};

    let cpus = std::thread::available_parallelism()
        .map(|v| v.get())
        .unwrap_or(4);
    let num_procs = select_num_processes(frame_files.len(), requested, cpus);

    if num_procs <= 1 {
        return Err("--parallel 1 is equivalent to serial mode; omit --parallel".into());
    }

    let temp_root = create_temp_dir()?;
    let exe =
        env::current_exe().map_err(|err| format!("failed to find recorder executable: {err}"))?;

    let ranges = segment_ranges(frame_files.len(), num_procs);
    let actual_procs = ranges.len();

    let group_sizes: Vec<usize> = ranges.iter().map(|range| range.end - range.start).collect();
    println!(
        "\n  parallel: {} processes, {} files ({})\n",
        actual_procs,
        frame_files.len(),
        group_sizes
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join("/")
    );

    let started_at = Instant::now();
    let mut children = Vec::with_capacity(actual_procs);
    let mut group_outputs = Vec::with_capacity(actual_procs);

    for (idx, range) in ranges.iter().enumerate() {
        let group = &frame_files[range.clone()];
        let group_out = group_output_path(&temp_root, idx);
        let mut cmd = Command::new(&exe);

        cmd.args(build_subprocess_args(cli, group, &group_out));

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

        if idx + 1 < ranges.len() {
            std::thread::sleep(Duration::from_millis(500));
        }
        group_outputs.push(group_out);
    }

    let mut failed = false;
    for (idx, mut child) in children.into_iter().enumerate() {
        let status = child
            .wait()
            .map_err(|err| format!("failed to wait for process {}: {err}", idx + 1))?;

        if status.success() {
            println!("  [{}] done", idx + 1);
        } else {
            let stderr = child.stderr.take().map(|mut s| {
                let mut buf = String::new();
                let _ = std::io::Read::read_to_string(&mut s, &mut buf);
                buf
            });
            trace_log!(
                "  [{}] FAILED (exit {}): {}",
                idx + 1,
                status,
                stderr.unwrap_or_default().trim()
            );
            failed = true;
        }
    }

    if failed {
        let _ = fs::remove_dir_all(&temp_root);
        return Err("one or more parallel recorder processes failed".into());
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

    println!("\n  concat {} groups...", actual_procs);
    concat_segments(&group_outputs, out)?;

    let _ = fs::remove_dir_all(&temp_root);

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

    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    fn sample_cli() -> CommonArgs {
        CommonArgs {
            frames: Vec::new(),
            dir: None,
            out: PathBuf::from("out.mp4"),
            fps: 30,
            crf: 23,
            dpr: 2.0,
            jobs: None,
            no_skip: false,
            skip_aggressive: false,
            headed: false,
            width: 1280.0,
            height: 720.0,
            parallel: None,
            frame_range: None,
            render_scale: 1.0,
            disable_audio: false,
        }
    }

    fn into_strings(args: Vec<OsString>) -> Vec<String> {
        args.into_iter()
            .map(|arg| arg.into_string().expect("test args should be valid UTF-8"))
            .collect()
    }

    #[test]
    fn selects_default_process_count_from_cpu_budget() {
        assert_eq!(select_num_processes(10, 0, 16), 4);
        assert_eq!(select_num_processes(3, 0, 8), 3);
        assert_eq!(select_num_processes(1, 0, 8), 1);
    }

    #[test]
    fn selects_requested_process_count_without_exceeding_frames() {
        assert_eq!(select_num_processes(10, 3, 16), 3);
        assert_eq!(select_num_processes(3, 8, 16), 3);
        assert_eq!(select_num_processes(0, 8, 16), 1);
    }

    #[test]
    fn distributes_segment_indices_across_workers() {
        assert_eq!(segment_ranges(10, 3), vec![0..4, 4..8, 8..10]);
        assert_eq!(segment_ranges(3, 4), vec![0..1, 1..2, 2..3]);
        assert!(segment_ranges(0, 4).is_empty());
    }

    #[test]
    fn generates_group_output_paths_with_zero_padded_indices() {
        let temp_root = Path::new("/tmp/nextframe-recorder");

        assert_eq!(
            group_output_path(temp_root, 0),
            PathBuf::from("/tmp/nextframe-recorder/group-00.mp4")
        );
        assert_eq!(
            group_output_path(temp_root, 12),
            PathBuf::from("/tmp/nextframe-recorder/group-12.mp4")
        );
    }

    #[test]
    fn builds_subprocess_args_with_optional_flags() {
        let mut cli = sample_cli();
        cli.no_skip = true;
        cli.skip_aggressive = true;
        cli.headed = true;

        let group = vec![
            PathBuf::from("slides/001.png"),
            PathBuf::from("slides/002.png"),
        ];
        let args = into_strings(build_subprocess_args(
            &cli,
            &group,
            Path::new("/tmp/group-00.mp4"),
        ));

        assert_eq!(
            args,
            vec![
                "slide",
                "slides/001.png",
                "slides/002.png",
                "--out",
                "/tmp/group-00.mp4",
                "--fps",
                "30",
                "--crf",
                "23",
                "--dpr",
                "2",
                "--width",
                "1280",
                "--height",
                "720",
                "--no-skip",
                "--skip-aggressive",
                "--headed",
            ]
        );
    }

    #[test]
    fn builds_subprocess_args_without_optional_flags() {
        let cli = sample_cli();
        let group = vec![PathBuf::from("slides/001.png")];
        let args = into_strings(build_subprocess_args(
            &cli,
            &group,
            Path::new("group-00.mp4"),
        ));

        assert_eq!(
            args,
            vec![
                "slide",
                "slides/001.png",
                "--out",
                "group-00.mp4",
                "--fps",
                "30",
                "--crf",
                "23",
                "--dpr",
                "2",
                "--width",
                "1280",
                "--height",
                "720",
            ]
        );
    }
}
