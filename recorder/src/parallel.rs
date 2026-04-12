use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::CommonArgs;
use crate::encoder::concat_segments;
use crate::util::create_temp_dir;

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
    let num_procs = if requested == 0 {
        frame_files.len().min(cpus / 2).clamp(1, 4)
    } else {
        requested.min(frame_files.len()).max(1)
    };

    if num_procs <= 1 {
        return Err("--parallel 1 is equivalent to serial mode; omit --parallel".into());
    }

    let temp_root = create_temp_dir()?;
    let exe =
        env::current_exe().map_err(|err| format!("failed to find recorder executable: {err}"))?;

    let chunk_size = frame_files.len().div_ceil(num_procs);
    let groups: Vec<&[PathBuf]> = frame_files.chunks(chunk_size).collect();
    let actual_procs = groups.len();

    let group_sizes: Vec<usize> = groups.iter().map(|g| g.len()).collect();
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

    for (idx, group) in groups.iter().enumerate() {
        let group_out = temp_root.join(format!("group-{idx:02}.mp4"));
        let mut cmd = Command::new(&exe);

        cmd.arg("slide");
        for file in *group {
            cmd.arg(file);
        }

        cmd.args(["--out", &group_out.to_string_lossy()]);
        cmd.args(["--fps", &cli.fps.to_string()]);
        cmd.args(["--crf", &cli.crf.to_string()]);
        cmd.args(["--dpr", &cli.dpr.to_string()]);
        cmd.args(["--width", &cli.width.to_string()]);
        cmd.args(["--height", &cli.height.to_string()]);
        if cli.no_skip {
            cmd.arg("--no-skip");
        }
        if cli.skip_aggressive {
            cmd.arg("--skip-aggressive");
        }
        if cli.headed {
            cmd.arg("--headed");
        }

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

        if idx + 1 < groups.len() {
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
            eprintln!(
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
