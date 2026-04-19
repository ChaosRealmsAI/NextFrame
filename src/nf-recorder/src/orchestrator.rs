//! v1.15 · 时间切片并行录制 orchestrator。
//!
//! 父进程职责（ADR-061）:
//! 1. probe bundle duration (启一次 MacHeadlessShell · load_bundle · call __nf.getDuration)
//! 2. 按 --parallel N 平分 total_frames 为 N 段 · frame-index 半开区间
//! 3. spawn N 个子进程 nf-recorder · 各带 `--frame-range start,end` + 独立 `segment_i.mp4`
//! 4. wait 全部子进程完成 · 错误聚合
//! 5. ffmpeg concat demuxer `-c copy` 合并为最终 output · 零重编码
//!
//! 降级路径: `parallel <= 1` 或 `duration < 6s` 直接走单进程 record_loop。
//! 子进程路径: caller 已设 `cfg.frame_range = Some(...)` · 本函数不被调用。

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use nf_shell_mac::{DesktopShell, MacHeadlessShell, ShellConfig};

use crate::events::{emit, Event};
use crate::record_loop::{RecordConfig, RecordError};

/// 并行模式最低启用阈值 (ms) · 低于此走单进程 (N 进程 boot ~1s × N 吃掉收益)。
///
/// v1.44.1 · 从 6000 降到 2000 · 让 3-5s 短 demo 也能触发并行验证 ·
/// 生产使用时建议仍按 6s 判断(可通过 env `NF_PARALLEL_MIN_MS` 覆盖)。
pub const PARALLEL_MIN_DURATION_MS: u64 = 2000;

/// 运行并行录制流水线 · 父进程入口。
pub async fn run_parallel(cfg: RecordConfig, parallel: usize) -> Result<(), RecordError> {
    let t0 = Instant::now();

    // 1. probe duration · 启一次 shell · 快速读 + close。
    let duration_ms = probe_duration(&cfg).await?;
    let frame_dur_ms = 1000.0_f64 / f64::from(cfg.fps);
    let total_frames = ((duration_ms as f64) / frame_dur_ms).round() as u64;
    if total_frames == 0 {
        return Err(RecordError::NoFrames);
    }

    // 2. 降级判断 · 短视频 / parallel=1 走单进程。
    let effective_n = if duration_ms < PARALLEL_MIN_DURATION_MS || parallel <= 1 {
        1
    } else {
        parallel
    };
    if effective_n == 1 {
        // 降级 · 直接跑 record_loop (cfg.frame_range 为 None · 等价全 range)。
        eprintln!(
            "[v1.15 orchestrator] parallel={parallel} · duration_ms={duration_ms} · \
             degrading to single-process (duration<6s or parallel<=1)"
        );
        return crate::record_loop::run(cfg).await.map(|_stats| ());
    }

    emit(Event::RecordParallelStart {
        parallel: effective_n,
        total_frames,
        duration_ms,
    });

    // 3. 平分 N 段 · frame-index 半开区间。
    let step = total_frames / effective_n as u64;
    let remainder = total_frames % effective_n as u64;
    let mut ranges: Vec<(u64, u64)> = Vec::with_capacity(effective_n);
    let mut cursor = 0u64;
    for i in 0..effective_n {
        // 最后一段吸收余数 · 保证 sum == total_frames。
        let extra = if (i as u64) < remainder { 1 } else { 0 };
        let end = cursor + step + extra;
        ranges.push((cursor, end));
        cursor = end;
    }
    debug_assert_eq!(cursor, total_frames);

    // 4. spawn N 子进程 · 输出到临时 segment_i.mp4。
    //
    // v1.44.1 · 找 nf-recorder binary:
    //   v1.15 假设 current_exe = nf-recorder · 直接 spawn 自己;
    //   v1.44+ 从 nf-shell lib 调用时 current_exe = nf-shell · 不能直接 spawn
    //   (nf-shell 的 main 走 event_loop · 不跑 record_loop).
    // 策略:优先找同目录的 nf-recorder · 兜底用 current_exe (单 binary 场景兼容).
    let self_exe = resolve_recorder_binary()?;
    let tmp_dir = cfg.output.parent().unwrap_or(Path::new("."));
    let stem = cfg
        .output
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "out".to_string());

    let segment_paths: Vec<PathBuf> = (0..effective_n)
        .map(|i| tmp_dir.join(format!("{stem}.seg{i:02}.mp4")))
        .collect();

    let mut children = Vec::with_capacity(effective_n);
    for (i, (start, end)) in ranges.iter().enumerate() {
        let seg_path = &segment_paths[i];
        let bitrate_str = format!("{}", cfg.bitrate_bps);
        let fps_str = format!("{}", cfg.fps);
        let max_dur_str = format!("{}", cfg.max_duration_s);
        let range_str = format!("{start},{end}");
        let res_str = match cfg.width {
            1920 => "1080p".to_string(),
            _ => format!("{}x{}", cfg.width, cfg.height),
        };
        emit(Event::RecordSegmentStart {
            idx: i,
            start: *start,
            end: *end,
            output: seg_path.display().to_string(),
        });
        let child = Command::new(&self_exe)
            .arg(&cfg.bundle)
            .arg("-o")
            .arg(seg_path)
            .arg("--fps")
            .arg(&fps_str)
            .arg("--bitrate")
            .arg(&bitrate_str)
            .arg("--max-duration")
            .arg(&max_dur_str)
            .arg("--res")
            .arg(&res_str)
            .arg("--frame-range")
            .arg(&range_str)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                RecordError::PipelineError(format!("spawn segment {i}: {e}"))
            })?;
        children.push((i, *start, *end, child));
    }

    // 5. wait · 聚合错误。
    for (i, start, end, mut child) in children {
        let status = child
            .wait()
            .map_err(|e| RecordError::PipelineError(format!("wait segment {i}: {e}")))?;
        if !status.success() {
            // 收 stderr 供 debug。
            let mut stderr_bytes = Vec::new();
            if let Some(mut s) = child.stderr.take() {
                use std::io::Read;
                let _ = s.read_to_end(&mut stderr_bytes);
            }
            let msg = String::from_utf8_lossy(&stderr_bytes).into_owned();
            return Err(RecordError::PipelineError(format!(
                "segment {i} exited non-zero (code {:?}): {msg}",
                status.code()
            )));
        }
        emit(Event::RecordSegmentDone {
            idx: i,
            start,
            end,
            output: segment_paths[i].display().to_string(),
        });
    }

    // 6. ffmpeg concat demuxer · -c copy · 零重编码。
    emit(Event::RecordConcatStart {
        segments: segment_paths.iter().map(|p| p.display().to_string()).collect(),
    });
    let list_path = tmp_dir.join(format!("{stem}.concat.txt"));
    let list_content = segment_paths
        .iter()
        .map(|p| {
            // ffmpeg concat 语法 · 绝对路径安全 · 单引号包裹防空格。
            let abs = p
                .canonicalize()
                .unwrap_or_else(|_| p.clone());
            format!("file '{}'", abs.display())
        })
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&list_path, list_content)
        .map_err(|e| RecordError::PipelineError(format!("write concat list: {e}")))?;

    let concat_status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&list_path)
        .arg("-c")
        .arg("copy")
        .arg("-movflags")
        .arg("+faststart")
        .arg(&cfg.output)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| RecordError::PipelineError(format!("spawn ffmpeg concat: {e}")))?;
    if !concat_status.success() {
        return Err(RecordError::PipelineError(format!(
            "ffmpeg concat failed (code {:?})",
            concat_status.code()
        )));
    }

    // 7. 清理 segments · 不留临时文件 (保留 concat.txt 便于 debug)。
    for p in &segment_paths {
        let _ = std::fs::remove_file(p);
    }

    // 8. 总结事件。
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let size_bytes = std::fs::metadata(&cfg.output).map(|m| m.len()).unwrap_or(0);
    emit(Event::RecordDone {
        out: cfg.output.clone(),
        duration_ms,
        size_bytes,
        moov_front: true,
    });
    emit(Event::RecordParallelDone {
        parallel: effective_n,
        wall_time_ms: elapsed_ms,
    });

    Ok(())
}

/// probe bundle 自报 duration (ms) · 启一次 shell · call __nf.getDuration · drop。
///
/// 失败退回 cfg.max_duration_s × 1000 (用户预设 cap)。
async fn probe_duration(cfg: &RecordConfig) -> Result<u64, RecordError> {
    let shell = MacHeadlessShell::new_headless(ShellConfig {
        viewport: (cfg.width, cfg.height),
        device_pixel_ratio: 1.0,
        bundle_url: cfg.bundle.clone(),
    })
    .map_err(|e| RecordError::CARendererInitFailed(format!("probe shell: {e}")))?;

    shell
        .load_bundle(&cfg.bundle)
        .map_err(|e| RecordError::BundleLoadFailed(format!("probe load: {e}")))?;

    let script =
        "return (window.__nf && typeof window.__nf.getDuration === 'function') \
         ? window.__nf.getDuration() : null;";
    let probe = shell
        .call_async(script)
        .await
        .map_err(|e| RecordError::ShellError(format!("probe call: {e}")))?;
    let max_cap_ms = u64::from(cfg.max_duration_s).saturating_mul(1000);
    let duration_ms = match crate::record_loop::js_number_as_u64(Some(&probe)) {
        Some(0) | None => max_cap_ms,
        Some(d) => d.min(max_cap_ms),
    };
    Ok(duration_ms)
}

/// v1.44.1 · 解析 nf-recorder binary 路径 · 供 orchestrator spawn 子进程用。
///
/// 探测顺序:
/// 1. `$NF_RECORDER_BIN` 环境变量 (开发时 override)
/// 2. `current_exe().parent()/nf-recorder` (cargo 默认布局: target/release/{nf-shell,nf-recorder})
/// 3. `current_exe()` 自身 (nf-recorder 单 binary 场景 · v1.15 兼容路径)
fn resolve_recorder_binary() -> Result<PathBuf, RecordError> {
    if let Ok(env_path) = std::env::var("NF_RECORDER_BIN") {
        let p = PathBuf::from(env_path);
        if p.exists() {
            return Ok(p);
        }
    }
    let current = std::env::current_exe()
        .map_err(|e| RecordError::PipelineError(format!("current_exe: {e}")))?;
    if let Some(parent) = current.parent() {
        let candidate = parent.join("nf-recorder");
        if candidate.exists() {
            return Ok(candidate);
        }
        let candidate_exe = parent.join("nf-recorder.exe"); // windows safety
        if candidate_exe.exists() {
            return Ok(candidate_exe);
        }
    }
    // v1.15 兼容 · 若当前就是 nf-recorder 自己 · 直接用。
    if current
        .file_stem()
        .and_then(|s| s.to_str())
        .map_or(false, |n| n == "nf-recorder")
    {
        return Ok(current);
    }
    Err(RecordError::PipelineError(format!(
        "nf-recorder binary not found next to {} · set NF_RECORDER_BIN env var",
        current.display()
    )))
}
