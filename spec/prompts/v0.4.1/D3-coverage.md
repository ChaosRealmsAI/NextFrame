# D3 · 测试覆盖审查 · ally gpt-5.4

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 任务

审查 `crates/nf-recorder/` **测试覆盖** · 产 `spec/quality-reports/v0.4.1/reports/D3-coverage.md`.

## 审查维度

1. **测试文件对源比例** · tests/ 7 个文件 vs src/ 5527 行 · 覆盖了哪些关键路径?
2. **关键路径**:
   - seek 契约(record_loop 对 window.__nf.seek 的 frameReady/seq 验证)
   - encode 路径(VT h264 / hevc · pipeline/vt_wrap)
   - mp4 写(mp4_writer · moov atom · faststart)
   - frame_pool(SPSC ArrayQueue · producer/consumer 同步)
   - orchestrator(parallel 子进程启动 + ffmpeg concat)
   - snapshot(CARenderer → IOSurface → PNG)
3. **每 test 质量**:
   - 是 unit test(pure fn) 还是 integration(真 VT 调用)?
   - 测 happy path 还是 edge case?
   - 有无被 `#[ignore]` 跳?
4. **缺的覆盖**: 列应补但没有的 test(优先级 P0-P2)

## 读什么

- ✅ `crates/nf-recorder/tests/*.rs`(全 7 个)
- ✅ `crates/nf-recorder/src/**/*.rs` 里的 `#[cfg(test)] mod tests`
- ✅ `crates/nf-recorder/Cargo.toml` 的 `[[test]]` 配置

## 命令辅助

```bash
cd crates/nf-recorder
ls tests/                                  # 文件清单
wc -l tests/*.rs src/**/*.rs               # 行数对比
grep -rn "#\[test\]\|#\[tokio::test\]" tests/ src/  # 所有 #[test] 函数
grep -rn "#\[ignore\]" tests/ src/         # ignored tests
cargo test -p nf-recorder --no-run 2>&1 | tail -20  # 能 build 的 tests
```

## 报告格式

同 D1 + 一张表:

```
| 关键路径 | 现有 test | 行数 | 质量 | 缺什么 |
|---|---|---|---|---|
| seek 契约 | tests/cli_events.rs | 120 | integration 真 HeadlessShell | 缺 timeout 路径 |
| ... | ... | ... | ... | ... |
```

## 禁

- ❌ 写新 test(只审)
- ❌ 跑 cargo test(会很慢 + 需 TCC)· 只静态分析
