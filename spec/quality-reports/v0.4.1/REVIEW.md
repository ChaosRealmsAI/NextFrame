# v0.4.1 · nf-recorder 6 维度质量审查汇总

**生成**: 2026-04-21 18:10 · autopilot 主 agent 汇总
**6 ally 报告**: reports/D{1-6}-*.md
**scope**: 本审查 · 只改 nf-recorder 内部 · 不碰上游接口

## P0/P1/P2 汇总

| 维度 | P0 | P1 | P2 | 总评 |
|---|---|---|---|---|
| D1 模块拆分 | 0 | 3 | ? | lib 导出面过宽 · pipeline codec 有重复 |
| D2 代码质量 | 0 | 1 | ? | panic/unwrap 基本干净 · FFI 管理合规 |
| D3 测试覆盖 | **3** | 3 | ? | 核心 seek 契约/parallel 路径缺 unit test · 关键路径 blind |
| D4 清洁度 | 0 | 2 | ? | 无 unused import warning · 但 v1.x 历史注释密度高 |
| D5 维护性 | 0 | 0 | ? | 文档密度 OK · unsafe SAFETY 注释率合格 |
| D6 性能风险 | **2** | 3 | ? | 4K patch 主逻辑保留 · parallel stdout 阻塞风险 · pool 无背压 |

**总计 P0 = 5 / P1 = 12**。本版修 4 P0 + 选 P1(v1.x 注释清理)· 记 1 P0 到 ADR 候选.

## 本版修复清单(4 task)

### Fix-1 · P0-D6-1 · orchestrator 子进程 stdout 不 drain 导致 parallel+4K hang

- **位置**: `crates/nf-recorder/src/orchestrator.rs:155-180`
- **根因**: `spawn` 用 `Stdio::piped()` 但父进程只 `wait()` · 子进程每帧 `emit(RecordFrame)` 写 stdout · pipe buffer 满后子进程阻塞 · 父进程 wait 也阻塞 → deadlock
- **修法**: 段子进程 stdout 改 `Stdio::null()`(丢弃每帧细节 · 只保留 exit code) · 或父进程开 drain 线程(更重)
- **选**: `Stdio::null()` · 简单直接 · segment 内部事件本就不需父进程看
- **ally prompt**: `spec/prompts/v0.4.1/fixes/fix-1-stdout-drain.md`
- **验**: parallel=4 跑 5s 4K 不 hang + cargo test 过

### Fix-2 · P0-D3-1 · record_loop seek 契约 helpers 无 unit test

- **位置**: `crates/nf-recorder/src/record_loop.rs:351-388,461-650`
- **影响函数**: `verify_frame_ready` · `parse_json_result` · `wait_for_export_seek_ready` · `wait_for_video_state_ready` · `js_number_as_u64`
- **修法**: 5 函数改 pub(crate) · 抽出 mod `seek_contract` · 加 `#[cfg(test)]` unit tests 覆盖 6 种失败路径:
  - frameReady=false
  - 缺 seq 字段
  - t 超容差
  - 非 JSON string
  - stale seq timeout
  - video-state 畸形 payload
- **ally prompt**: `spec/prompts/v0.4.1/fixes/fix-2-seek-contract-tests.md`

### Fix-3 · P0-D3-2 · orchestrator 并行路径无 integration test

- **位置**: `crates/nf-recorder/src/orchestrator.rs:70-267`
- **修法**:
  - 抽纯函数(range 切片 / 降级策略)加 unit test
  - 用 fake `NF_RECORDER_BIN` + fake `ffmpeg`(shell script)做 process-level integration test
  - 验 spawn args + 失败聚合 + concat list + cleanup
- **ally prompt**: `spec/prompts/v0.4.1/fixes/fix-3-orchestrator-tests.md`
- **依赖**: Fix-1 先做(避免 stdout 阻塞影响 test)

### Fix-4 · P1-D4 · v1.x 历史注释批量清理

- **位置**: 9 文件(cli.rs · export_api.rs · orchestrator.rs · record_loop.rs · frame_pool.rs · events.rs · pipeline/vt_wrap.rs + 2 tests)
- **修法**: doc comment 首句从 "v1.14 T-09 subcommand refactor" 改成当前语义("CLI parser for nf-recorder" 直接描述)· 历史引用统一写成 `// Historical: v1.14 T-09 ...`(单独一行 · 不占首句)
- **ally prompt**: `spec/prompts/v0.4.1/fixes/fix-4-v1x-comments.md`
- **低风险 easy win**

## 不改(本版记录 · 留下版)

### P0-D6-2 · frame_pool 无背压导致 4K parallel 内存无上限
- **位置**: `frame_pool.rs + record_loop.rs + vt_wrap.rs`
- **原因不改**: 需设计决策(bounded in-flight 算法 · VT output drain 逻辑)· 重构风险高 · 本审查版不碰
- **Action**: 写 `spec/adrs.json` 候选 ADR "nf-recorder 真 bounded in-flight pool"· v0.5+ 处理

### P0-D3-3 · FramePool SPSC 审查维度不一致
- **原因**: 跟 P0-D6-2 同根源 · 等 bounded pool ADR 落地后再处理
- **Fix-4 里可顺便加 /// 明确当前是 telemetry counter · 不是 SPSC pool**

### P1/P2 其他
- D1 lib 导出面过宽 · pipeline codec 有重复: 下版重构
- D5 各项: 暂无 P0/P1 · 跳
- D4 dead_code allow 收敛: Fix-4 顺带(低成本)

## 修完验收

1. `cargo check --workspace` 绿
2. `cargo clippy --workspace --all-targets` 绿
3. `cargo test -p nf-recorder` 新增 tests 通过
4. 4K HEVC 回归录制: `cargo run --release -p nf-recorder -- tests/fixtures/recorder/bundle.html -o output/html-4k.mp4 --max-duration 5 --fps 30 --res 4k --bitrate 40M` · ffprobe duration=5.0 · codec=hevc · size ~3.2MB
5. 主 agent `open` mp4 → 画面正常
