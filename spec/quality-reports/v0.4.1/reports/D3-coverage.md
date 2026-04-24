# D3 · nf-recorder 测试覆盖审查

审查对象: `crates/nf-recorder/`

审查方式: 静态分析 + build-only verification。未运行测试本体，也未新增或修改测试。

## 总评(1 句)

一般偏好: `nf-recorder` 对 VT/AVAssetWriter/CARenderer 有高价值真集成 smoke，但对 seek 契约、orchestrator 真并行、frame_pool 和失败路径覆盖不足，当前不能视为关键路径测试充分。

## 盘点

盘点结果:

- `tests/` 实际为 8 个 `.rs` 文件，不是任务说明里的 7 个。
- `tests/*.rs` 共 1874 行，`src/**/*.rs` 共 5527 行，测试/源行数比约 33.9%。
- `#[test]` 共 33 个，另有 `tests/snapshot.rs` 一个 `harness = false` 手写 main 测试。
- `#[ignore]` 为 0。
- `src/**/*.rs` 未发现 `#[cfg(test)] mod tests`，源内无 unit test 模块。
- `Cargo.toml` 只有 `snapshot` 一个显式 `[[test]]`，且 `harness = false`；其余 integration tests 走 Cargo 默认发现。

## 关键路径覆盖表

| 关键路径 | 现有 test | 行数 | 质量 | 缺什么 |
|---|---:|---:|---|---|
| seek 契约 | `tests/snapshot.rs`; 间接覆盖 `snapshot()` 调 `window.__nf.seek` happy path | 295 | integration，真 `NSApplication` + CARenderer + inline bundle；仅验证 `frameReady:true` 后能出红色 PNG | `record_loop::verify_frame_ready` 无直接测试；缺 timeout、`frameReady=false`、缺 `seq`、`t` mismatch、非 JSON string、export bridge stale seq、video-state 未 ready/畸形 payload |
| encode: VT H.264 / `vt_wrap` | `tests/vt_encode.rs`; `tests/mp4_writer.rs` 间接产一帧 H.264 | 172 + 220 | macOS 真 VideoToolbox integration；验证单帧 keyframe、format_description、非空 AVCC | 缺无效参数、unsupported color、callback error/frame dropped、`pending_output`、多帧 PTS/DTS、forced keyframe cadence、H.264 pipeline wrapper `PipelineH264_1080p::push_frame/finish` 真 IOSurface 路径 |
| encode: HEVC / `hevc.rs` | `tests/hevc_encode.rs` | 399 | macOS 真 VT HEVC；单帧基础断言 + 3s export 尾帧非黑 + bitrate 回归 | 两个 export 测试会在 `target/release/nf-shell` 或 `ffprobe` 缺失时早退，覆盖信号不稳定；缺 HEVC writer/mp4 atom 兼容断言、profile/bitrate fallback、segment 首帧 keyframe |
| MP4 写 / moov atom / faststart | `tests/mp4_writer.rs`; `tests/verify_mp4.rs` | 220 + 129 | 真 VT H.264 帧送 `Mp4Writer`，读文件扫 `moov < mdat`；verifier 有 bogus/missing file error path | `Mp4Writer` 只测 happy path；缺空 data、空 session、finish timeout、backpressure、sample attachment NotSync、HEVC/hvc1 输出、畸形 atom size/64-bit atom/多 trak verifier fixtures |
| frame_pool / SPSC ArrayQueue | 无 | 0 | 当前 `src/frame_pool.rs` 只是计数器，不是 SPSC ArrayQueue | 若规格仍要求 SPSC ArrayQueue，这是实现与测试双缺口；至少缺 capacity、producer/consumer、满队列、drain、并发同步与饱和计数测试 |
| orchestrator 并行子进程 + ffmpeg concat | `tests/cli_events.rs` 只测 `resolve_requested_parallel`; `tests/regression_bug_a.rs` 明确 `--parallel 1` | 398 + 184 | 纯函数覆盖默认 4K=4、显式串行、>8 拒绝；重 export regression 不是真并行 | `run_parallel` 未被真测；缺 duration probe、短视频降级、range 切分余数、spawn 参数、子进程失败聚合、`NF_RECORDER_BIN`、ffmpeg concat 成功/失败、临时 segment 清理、parallel events |
| snapshot: CARenderer -> IOSurface -> PNG | `tests/snapshot.rs` | 295 | harness=false main-thread integration；真 bundle、真 `snapshot()`、PNG decode、中心红色像素 | 缺 `frameReady=false`、seek contract mismatch、paint/sample retry fallback、black fallback、zero extent/row padding/IOSurface lock error、viewport parse CLI subcommand事件 |
| CLI / events | `tests/cli_events.rs` | 398 | 纯函数/轻集成，覆盖 bitrate/res/fps/missing bundle、部分 Event JSON-Line | Event 枚举已扩展到 snapshot/verify/parallel/segment/concat，但测试仍只覆盖旧 record/error 形态；缺 `parse_viewport`、`parse_frame_range`、0 bitrate、overflow bitrate、自定义 `WxH` codec policy |
| verify_mp4 | `tests/verify_mp4.rs` | 129 | 有 missing/non-MP4 error path；真实 battle artifact 存在时跑 6 断言 | 主 happy path 依赖外部 artifact，缺失即早退；缺纯 fixture 覆盖 moov-after-mdat、非 BT.709、fps/bitrate fail、unsupported codec、truncated atoms |
| arch gate: no sync eval | `tests/arch_no_eval.rs` | 77 | 纯扫描，防 `evaluateJavaScript` 回归 | 只过滤行注释，不解析字符串/块注释；是架构 guard，不覆盖功能行为 |

## 每个测试文件质量

| 文件 | 测试数 | 类型 | happy / edge | ignore / skip 风险 |
|---|---:|---|---|---|
| `tests/cli_events.rs` | 23 | unit / light integration；真实临时 bundle 文件过 `to_config` | bitrate/res/fps happy + reject；event JSON shape | 无 `#[ignore]`；未覆盖新增 Event 变体和隐藏 frame-range |
| `tests/vt_encode.rs` | 1 | macOS integration，真 CVPixelBuffer + VT H.264 | happy path 单帧 | `cfg(target_os="macos")`；无 skip，但仅单帧 |
| `tests/hevc_encode.rs` | 3 | macOS integration，真 VT + 可选 `nf-shell` export + `ffprobe` | 单帧 happy；尾帧非黑/bitrate 回归 | 无 `#[ignore]`；`nf-shell` 或 `ffprobe` 缺失时 2 个测试早退通过 |
| `tests/mp4_writer.rs` | 1 | macOS integration，真 VT H.264 + AVAssetWriter | happy path 60 帧 + moov-front | `cfg(target_os="macos")`；无失败路径 |
| `tests/snapshot.rs` | 1 | harness=false macOS main-thread E2E | happy path 红色 PNG | 无 `#[ignore]`；只覆盖 t=0、单色中心像素 |
| `tests/verify_mp4.rs` | 3 | unit/fixture-ish + optional artifact integration | bogus/missing edge；battle MP4 happy | battle artifact 不存在时早退通过 |
| `tests/regression_bug_a.rs` | 1 | macOS heavy export regression | 4K 10s serial no crash | `nf-shell` 缺失时早退通过；`ffprobe` 缺失时少做结构验证 |
| `tests/arch_no_eval.rs` | 1 | static architecture test | forbidden API edge guard | 无 `#[ignore]`；非功能覆盖 |

## Findings(按 P0/P1/P2 排)

### P0 · record_loop seek 契约核心失败路径无直接测试

- **位置**: `crates/nf-recorder/src/record_loop.rs:351-388`, `src/record_loop.rs:461-650`, `tests/snapshot.rs:160-242`
- **问题**: `verify_frame_ready`、`parse_json_result`、`wait_for_export_seek_ready`、`wait_for_video_state_ready`、`js_number_as_u64` 都是 seek 契约的关键实现，但没有源内 unit test。当前只有 `snapshot` happy path 间接证明好 payload 可走通，不能证明 fatal error 映射、timeout、mismatch、stale seq 等录制失败路径正确。
- **建议**: 抽出 crate-private `seek_contract` helper 或至少给私有函数加源内 unit tests，覆盖 `frameReady=false`、缺 `seq`、`t` 超容差、非 JSON string、stale seq timeout、video-state 畸形 payload。

### P0 · orchestrator 真并行路径没有测试

- **位置**: `crates/nf-recorder/src/orchestrator.rs:70-267`, `tests/cli_events.rs:149-168`, `tests/regression_bug_a.rs:15-98`
- **问题**: `run_parallel` 负责 probe duration、range 切片、spawn 子进程、wait、ffmpeg concat、清理临时段和事件输出，是 4K 默认导出的关键路径。现有测试只覆盖 `resolve_requested_parallel` 纯函数；重 export regression 明确传 `--parallel 1`，不是并行路径。
- **建议**: 抽纯函数覆盖 range/降级策略；再用 fake `NF_RECORDER_BIN` + fake `ffmpeg` 做 process-level integration，验证 spawn args、失败聚合、concat list、cleanup 和 parallel events。

### P0 · frame_pool 与 SPSC ArrayQueue 审查维度不一致且无测试

- **位置**: `crates/nf-recorder/src/frame_pool.rs:1-48`, `crates/nf-recorder/src/record_loop.rs:310`, `src/record_loop.rs:420`
- **问题**: 审查维度要求 `frame_pool(SPSC ArrayQueue · producer/consumer 同步)`，但当前 `FramePool` 只是 `capacity + submitted` 计数器，没有 ArrayQueue 行为，也没有任何测试。
- **建议**: 明确 v0.4.1 规格。如果要 SPSC pool，先实现再补 capacity/full/empty/producer-consumer ordering 测试；如果只保留 telemetry，更新规格并补计数器 unit test。

### P1 · 多个重集成测试在环境缺失时早退通过，覆盖信号不稳定

- **位置**: `tests/hevc_encode.rs:93-147`, `tests/hevc_encode.rs:149-189`, `tests/verify_mp4.rs:45-103`, `tests/regression_bug_a.rs:15-98`
- **问题**: `target/release/nf-shell`、`ffprobe`、battle MP4 artifact 缺失时，测试会 `eprintln!` 后 `return`，CI 可显示通过但没有真正覆盖对应关键路径。
- **建议**: 将重测拆成显式 gated test profile，或用 fixture/fake 降低环境依赖；至少在报告/CI 中区分 “skipped by precondition” 与 “passed”。

### P1 · Event 覆盖过期

- **位置**: `crates/nf-recorder/src/events.rs:18-132`, `tests/cli_events.rs:249-397`
- **问题**: `events.rs` 已有 `snapshot.done`、`verify.result`、`record.parallel.*`、`record.segment.*`、`record.concat.start`，但测试仍只覆盖旧 record/error 形态。
- **建议**: 为所有 Event 变体补 JSON shape / JSON-Line 单行测试，尤其是 orchestrator 事件和 verify result 的 asserts 结构。

### P1 · verify_mp4 atom parser 测试样本不足

- **位置**: `crates/nf-recorder/src/verify_mp4.rs:81-1069`, `tests/verify_mp4.rs:44-128`
- **问题**: `verify_mp4.rs` 1069 行，只有 3 个外部测试；主 happy path 依赖 battle MP4 artifact，缺失即早退。畸形 atom、moov-after-mdat、非 BT.709、fps/bitrate fail、unsupported codec 都没有稳定 fixture。
- **建议**: 增加小型 byte fixture 或生成器，覆盖 parser 和 6 条 assertion 的 pass/fail 分支。

## 亮点

- `vt_encode.rs`、`hevc_encode.rs`、`mp4_writer.rs`、`snapshot.rs` 都是真 macOS 图形/编码栈集成，不只是 mock，能抓到 FFI/系统框架层面的回归。
- `snapshot` 使用 `harness = false` 保证 AppKit/WebKit 主线程约束，测试设计贴近实际运行条件。
- `cli_events.rs` 对 CLI 基础参数和旧 Event JSON-Line 形态覆盖密集，作为低成本回归网有价值。
- `arch_no_eval.rs` 作为架构 gate 能防止同步 WebKit JS API 回归，虽非功能测试但方向明确。

## 建议补测清单

P0:

- `record_loop` seek contract unit tests: `verify_frame_ready` 覆盖 `frameReady=false`、缺字段、非 object、`t` 超 0.01ms、`seq` 非整数/负数；`parse_json_result` 覆盖非 JSON string；`js_number_as_u64` 覆盖 u64/i64/f64/负数/小数/NaN。
- `record_loop` async wait tests with fake shell seam or extracted poll helper: export seek stale seq timeout、video-state not ready timeout、malformed clips payload。
- orchestrator pure extraction tests: range 切分含余数、短视频降级判断、parallel=0/>8、`NF_PARALLEL_MIN_MS` override。
- orchestrator process-level test with fake `NF_RECORDER_BIN` and fake `ffmpeg`: 校验 spawn args、segment failure aggregation、concat list、cleanup、events。
- frame_pool: 明确规格。如果要 SPSC ArrayQueue，先实现再测 capacity/full/empty/producer-consumer ordering；如果 v0.4.1 只要计数器，应更新规格并补 `new/note_submitted/saturating` unit test。

P1:

- `Mp4Writer` failure fixtures: empty frame data、close without append、bad output path、finish timeout seam、keyframe vs non-keyframe attachment。
- `verify_mp4` byte-level fixtures: moov after mdat、missing moov/mdat、truncated largesize、unsupported codec、non-BT.709 SPS、fps/bitrate assertion failure。
- Event JSON tests for `snapshot.done`、`verify.result`、`record.parallel.*`、`record.segment.*`、`record.concat.start`。
- CLI tests for `parse_viewport`、`parse_frame_range`、custom `WxH` resolution、bitrate 0/overflow、snapshot/verify subcommand parse。

P2:

- VT multi-frame tests: monotonic PTS/DTS、`pending_output` behavior、forced keyframe every 60 frames。
- HEVC writer/verifier compatibility test with a tiny deterministic HEVC MP4 fixture。
- Snapshot PNG unit seam for BGRA -> RGBA row padding and zero extent, so pixel conversion is covered without AppKit/TCC。
- Static arch scanner improvement: block comments / string literal awareness if false positives become common。

## 汇总

- P0 数: 3 / P1 数: 3 / P2 数: 0(补测建议另列 P2)
- 整体分(1-10): 5
- 覆盖状态: 关键集成 smoke 有价值，但系统性不足；最需要补的是 seek 契约失败路径、orchestrator 真并行、frame_pool 规格/实现/测试一致性。

## 命令记录

已执行的只读命令:

```bash
ls -la crates/nf-recorder/tests
wc -l crates/nf-recorder/tests/*.rs crates/nf-recorder/src/*.rs crates/nf-recorder/src/pipeline/*.rs
rg -n "#\\[(tokio::test|test|ignore)" crates/nf-recorder/tests crates/nf-recorder/src
rg -n "#\\[cfg\\(test\\)\\]|mod tests" crates/nf-recorder/src
sed -n '1,220p' crates/nf-recorder/Cargo.toml
cargo test -p nf-recorder --no-run 2>&1 | tail -20
```

Verification 结果:

- `cargo test -p nf-recorder --no-run` 通过，`Finished test profile`。
- 编译出了 `src/lib.rs`、`src/main.rs` 以及 8 个 integration test executable。
- 输出中有 2 个 warning，均来自 scope 外依赖 `crates/nf-shell-mac/src/headless/mac.rs`：`activateIgnoringOtherApps` deprecated、`output_surface` never read。

未执行测试本体:

```bash
cargo test -p nf-recorder
```
