# Fix-3 · orchestrator 并行路径测试

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 根因(D3 P0-2)

`orchestrator.rs:70-267` `run_parallel` 负责:
- probe video duration
- range 切片(半开区间)
- spawn N 子进程
- wait + 失败聚合
- ffmpeg concat 合并
- 清理临时段

当前只 `tests/cli_events.rs:149-168` 测了 `resolve_requested_parallel` 纯函数 · `regression_bug_a.rs` 用 `--parallel 1` 不走并行路径. **并行核心 0 覆盖**.

## 修法

### 1. 抽纯函数 + unit test

识别并抽出 range/降级的纯函数(如果现在是内联的):

```rust
// orchestrator.rs (pub(crate))
pub(crate) fn compute_frame_ranges(total_frames: u64, parallel: usize) -> Vec<(u64, u64)> { ... }
pub(crate) fn should_downgrade_to_serial(duration_sec: f64, parallel: usize) -> bool { ... }

#[cfg(test)]
mod tests {
    // range 均匀切
    #[test] fn ranges_split_evenly() { assert_eq!(compute_frame_ranges(120, 4), vec![(0,30),(30,60),(60,90),(90,120)]); }
    // range 剩余给最后
    #[test] fn ranges_remainder_to_last() { assert_eq!(compute_frame_ranges(122, 4), vec![(0,30),(30,60),(60,90),(90,122)]); }
    // duration < 6s → 降级 serial
    #[test] fn short_video_downgrades() { assert!(should_downgrade_to_serial(5.0, 4)); }
    // parallel=1 → 不降级
    #[test] fn parallel_one_no_downgrade() { assert!(!should_downgrade_to_serial(10.0, 1)); }
}
```

### 2. process-level integration test(fake binaries)

`tests/orchestrator_parallel.rs` (新建 · 或扩 `cli_events.rs`):

```rust
#[test]
fn run_parallel_invokes_child_processes_and_concat() {
    let tmpdir = tempfile::tempdir().unwrap();
    // 准备 fake nf-recorder · fake ffmpeg(shell script)
    let fake_recorder = tmpdir.path().join("fake-nf-recorder");
    std::fs::write(&fake_recorder, "#!/bin/sh\n# record 参数记到 stderr + 产空 mp4\necho \"$@\" >&2\ntouch \"$4\"  # output path\nexit 0\n").unwrap();
    // chmod +x

    let fake_ffmpeg = tmpdir.path().join("fake-ffmpeg");
    std::fs::write(&fake_ffmpeg, "#!/bin/sh\necho ffmpeg \"$@\" >&2\ntouch \"${@:$#}\"\nexit 0\n").unwrap();

    // env NF_RECORDER_BIN=fake · PATH 前置 tmpdir(含 fake ffmpeg)
    // 跑 run_parallel(cfg, 4)
    // 断言:
    //   - 4 个子进程 spawn(检 fake recorder 被调用 4 次 · 通过 stderr 记录)
    //   - concat list 文件存在
    //   - 最终 mp4 产生
    //   - 临时段被 cleanup
}
```

如果 orchestrator 没有 env NF_RECORDER_BIN override 机制 · **不加** feature flag · 简化: 只测 `compute_frame_ranges` + `should_downgrade_to_serial` 纯函数(跳 integration).

**如果实在无法做 integration(main thread 约束/私有 spawn 路径)· 至少做纯函数 unit tests · integration 缺做 P1 延下版**.

### 3. 与 Fix-1 兼容

Fix-1 已改 `stdout(Stdio::null())`. 本 test 若需读子进程 stdout 验证 · 暂不读 · 只靠 stderr + 文件 side-effect 验.

## 验

```bash
cd crates/nf-recorder
cargo test -p nf-recorder --tests 2>&1 | tail -20  # 新 tests 通过(至少纯函数)
cargo clippy -p nf-recorder --all-targets 2>&1 | tail -5
```

## 禁

- ❌ 改 run_parallel 业务逻辑(只加测试)
- ❌ 加新 pub API
- ❌ 碰 pub 接口给上游

## 依赖

Fix-1 已完成(stdout → null)· 本 task 基于该状态.
