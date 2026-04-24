# D5 · nf-recorder 维护性审查

**版本**: `v0.4.1`
**范围**: `crates/nf-recorder/**/*.rs`
**结论**: C+ · 可维护性中等；运行路径说明较充分，但公开面过宽、历史版本引用污染、unsafe 注释格式不稳定。

## 维度打分

| # | 维度 | 分 | 说明 |
|---|---|---:|---|
| 1 | 文档密度 | B- | `///` 行数多，`record_loop` / `snapshot` 契约说明较好；但核心 `pipeline/mod.rs` 的公开 trait/类型几乎无 `///`。 |
| 2 | unsafe 注释率 | D | 严格按上一行 `SAFETY` 统计为 `33 / 94 = 35.1%`；`vt_wrap.rs` 大量 unsafe 被 `#[allow(unsafe_code)]` 隔开，机器检查不可用。 |
| 3 | ABI 稳定性 | B | 当前主要被本 workspace binary/tests 使用，外部引用风险低；但 `lib.rs` 和 `pipeline/mod.rs` 直接 `pub mod` 暴露内部实现，变更面偏大。 |
| 4 | 新人可读性 | C+ | 模块内长注释有帮助；`lib.rs` 无整体架构说明，`run` / `run_parallel` 超 100 行，新人需要跨文件追踪状态机。 |
| 5 | 跨版本引用过时 | D | 大量 `v1.14` / `v1.44` / `v1.56` / `T-xx` 历史标签，对 `v0.4.1` 读者噪声高。 |
| 6 | spec 对齐 | D | 源码引用 `spec/versions/v1.14/spec/interfaces-delta.json` 和 task prompt 路径；当前 repo 内不存在这些路径。 |

## 指标

- doc 覆盖率估算: `doc_lines / pub_count = 220 / 35 = 6.29`
- pub 统计口径: `^pub fn|^pub struct|^pub enum`，不含 `pub trait` / `pub mod` / inherent methods。
- unsafe 注释率: `SAFETY_count / unsafe_count = 33 / 94 = 35.1%`
- unsafe 分布:
  - `snapshot.rs`: `12` 个 unsafe，严格上一行 `SAFETY` 命中 `7`
  - `pipeline/mp4_writer.rs`: `37` 个 unsafe，严格上一行 `SAFETY` 命中 `26`
  - `pipeline/vt_wrap.rs`: `45` 个 unsafe，严格上一行 `SAFETY` 命中 `0`；实际有若干说明，但被 `#[allow(unsafe_code)]` 放在注释和 unsafe 之间，且部分同组 unsafe 无逐块说明。

## 主要发现

### D5-1 · `lib.rs` 没有 crate-level 架构说明

- 位置: `crates/nf-recorder/src/lib.rs:1`
- 现状: 只有 `#![deny(unsafe_op_in_unsafe_fn)]` 和一组 `pub mod` / `pub use`。
- 影响: 新人无法从入口判断模块分层、主路径、CLI 与 library API 的边界，也看不出哪些模块是稳定 API、哪些只是内部实现被临时公开。
- 建议: 增加 `//!` crate-level 总览，说明三条入口: CLI record/snapshot/verify、高层 `run_export_from_source`、底层 pipeline；同时标明哪些 `pub mod` 是 crate 内复用而非外部稳定承诺。

### D5-2 · 公开 API 面过宽，维护边界不清

- 位置:
  - `crates/nf-recorder/src/lib.rs:3-11`
  - `crates/nf-recorder/src/pipeline/mod.rs:4-14`
- 现状: `cli`、`events`、`orchestrator`、`snapshot`、`verify_mp4`、`pipeline::{h264, hevc, mp4_writer, vt_wrap}` 全部通过 `pub mod` 暴露。
- 影响: 虽然本版无外部引用，但测试和 workspace 调用可以直接依赖内部类型，例如 `VtCompressor` / `Mp4Writer`。后续改签名或移动模块时，编译影响面会覆盖 binary、crate tests 和可能的 workspace 调用。
- 建议: v0.4.1 可接受 ABI 变化；优先把 public contract 写清楚，而不是急着兼容。下一次整理时可考虑只重导出稳定层，内部模块改 `pub(crate)` 或明确标注 internal。

### D5-3 · 核心 pipeline 公开类型缺文档

- 位置: `crates/nf-recorder/src/pipeline/mod.rs:9-62`
- 现状: `RecordPipeline`、`RecordOpts`、`VideoCodec`、`ColorSpec`、`OutputStats`、`PipelineError` 都是公开 API，但无 `///` 总说明，字段也无契约说明。
- 影响: 调用方不清楚 `push_frame` 的时序要求、`IOSurfaceHandle` 生命周期、`OutputStats.duration_ms` 的时间基、`ColorSpec::BT2020_HDR10_10bit` 当前是否可用。
- 建议: 至少补齐 trait 方法契约和 `RecordOpts` / `OutputStats` 字段语义；特别说明 `RecordPipeline` 当前是单生产者录制线程模型，和 `VtCompressor` 异步输出队列的关系。

### D5-4 · unsafe 注释格式不一致，不能可靠审计

- 位置:
  - `crates/nf-recorder/src/pipeline/vt_wrap.rs:268-300`
  - `crates/nf-recorder/src/pipeline/vt_wrap.rs:472-604`
  - `crates/nf-recorder/src/pipeline/vt_wrap.rs:630-634`
  - `crates/nf-recorder/src/snapshot.rs:478-488`
- 现状: `mp4_writer.rs` 基本做到每块前置 `SAFETY`；`vt_wrap.rs` 常见结构是 `// SAFETY`、`#[allow(unsafe_code)]`、`unsafe`，严格工具无法识别；有些 unsafe 复用上方组注释但不是逐块说明。`snapshot.rs` 内像素循环中 `g/r/a` 的 unsafe 解引用复用上一条注释，严格统计漏掉。
- 影响: 后续不能用简单 grep 做门禁；reviewer 也难以判断每一个 FFI 调用、CF 指针转换、callback refcon 解引用是否满足同一套不变量。
- 建议: 统一为紧贴 unsafe 的格式，必要时把多个同源 unsafe 合并成一个块并放一条完整 `// SAFETY:`；`try_set_prop` 这类函数应补同 `set_prop` 一样的 VTSession ABI 说明。

### D5-5 · 长函数拆分不足

- 位置:
  - `crates/nf-recorder/src/record_loop.rs:199` `run` 约 260 行
  - `crates/nf-recorder/src/orchestrator.rs:70` `run_parallel` 约 197 行
  - `crates/nf-recorder/src/export_api.rs:166` `run_export_from_source` 约 102 行
  - `crates/nf-recorder/src/verify_mp4.rs:232` `scan_top_level` 约 104 行
  - `crates/nf-recorder/src/verify_mp4.rs:800` `parse_sps_vui` 约 220 行
- 现状: `record_loop::run` 的阶段注释清楚，但同时处理 shell boot、duration probe、JS mode switch、video-state probe、pipeline、事件和 frame loop。`run_parallel` 同时做 probe、range split、spawn、wait、concat、cleanup。
- 影响: 修复一个小契约时容易碰到多段状态，回归风险集中在单函数内。
- 建议: 不需要大重构；优先抽出已稳定的阶段函数，如 `prepare_record_shell`、`build_pipeline`、`drive_frame_loop`、`spawn_segments`、`concat_segments`。

### D5-6 · 命名基本一致，但 viewport/output 维度语义可更清楚

- 位置:
  - `crates/nf-recorder/src/export_api.rs:74`
  - `crates/nf-recorder/src/record_loop.rs:54-57`
  - `crates/nf-recorder/src/pipeline/mod.rs:19-20`
- 现状: 没发现 `surface_dim` vs `output_dim` 这类明显冲突；主要使用 `viewport`、`width`、`height`。
- 风险: `ExportOpts.viewport`、`RecordConfig.width/height`、`RecordOpts.width/height` 实际都表示输出/渲染 viewport。跨层转换时语义靠上下文理解。
- 建议: 文档中统一称为 `viewport/output raster size`，避免未来引入 source size、CSS layout size、IOSurface physical size 后混淆。

## 过时引用清单

| 位置 | 引用 |
|---|---|
| `crates/nf-recorder/src/cli.rs:1` | `v1.14 T-09 / T-18` |
| `crates/nf-recorder/src/cli.rs:3` | `spec/versions/v1.14/spec/interfaces-delta.json` |
| `crates/nf-recorder/src/cli.rs:29` | `v1.14` |
| `crates/nf-recorder/src/cli.rs:38` | CLI about 文案含 `(v1.14)` |
| `crates/nf-recorder/src/cli.rs:69` | `v1.15 / v1.56` |
| `crates/nf-recorder/src/export_api.rs:1` | `v1.44` |
| `crates/nf-recorder/src/export_api.rs:21` | `v1.44` |
| `crates/nf-recorder/src/export_api.rs:24` | `v1.44` |
| `crates/nf-recorder/src/export_api.rs:79` | `v1.44.1 / v1.56` |
| `crates/nf-recorder/src/export_api.rs:152` | `v1.44` |
| `crates/nf-recorder/src/export_api.rs:240` | `v1.44.1 / v1.56` |
| `crates/nf-recorder/src/export_api.rs:385` | `v1.14 FrameReadyContract` |
| `crates/nf-recorder/src/orchestrator.rs:25` | `v1.56` |
| `crates/nf-recorder/src/orchestrator.rs:28` | `v1.56` |
| `crates/nf-recorder/src/orchestrator.rs:120` | `v1.44.1` |
| `crates/nf-recorder/src/orchestrator.rs:122` | `v1.44+` |
| `crates/nf-recorder/src/orchestrator.rs:297` | `v1.44.1` |
| `crates/nf-recorder/src/frame_pool.rs:1` | `v1.14 T-09` |
| `crates/nf-recorder/src/frame_pool.rs:3` | `v1.14` |
| `crates/nf-recorder/src/frame_pool.rs:22` | `v1.14` |
| `crates/nf-recorder/src/frame_pool.rs:43` | `v1.14` |
| `crates/nf-recorder/src/main.rs:1` | `v1.14 T-09 / T-17 / T-18` |
| `crates/nf-recorder/src/lib.rs:11` | `T-17` / `v1.44` inline comment |
| `crates/nf-recorder/src/events.rs:1` | `v1.14 T-09` |
| `crates/nf-recorder/src/events.rs:3` | `spec/versions/v1.14/spec/interfaces-delta.json` |
| `crates/nf-recorder/src/events.rs:11` | `v1.14` |
| `crates/nf-recorder/src/events.rs:18` | `v1.14` |
| `crates/nf-recorder/src/events.rs:33` | `v1.14.0/1` |
| `crates/nf-recorder/src/events.rs:35` | `v1.14.2` |
| `crates/nf-recorder/src/events.rs:44` | `v1.14 = 30` |
| `crates/nf-recorder/src/snapshot.rs:1` | `v1.14 T-18` |
| `crates/nf-recorder/src/verify_mp4.rs:7` | `v1.14` |
| `crates/nf-recorder/src/verify_mp4.rs:615` | `v1.14 encoder` |
| `crates/nf-recorder/src/record_loop.rs:1` | `v1.14 T-09` |
| `crates/nf-recorder/src/record_loop.rs:9` | `spec/versions/v1.14/spec/interfaces-delta.json` |
| `crates/nf-recorder/src/record_loop.rs:38` | `v1.14` |
| `crates/nf-recorder/src/record_loop.rs:47` | `interfaces-delta.json` |
| `crates/nf-recorder/src/record_loop.rs:58` | `v1.14` |
| `crates/nf-recorder/src/record_loop.rs:71` | `interfaces-delta` |
| `crates/nf-recorder/src/record_loop.rs:74` | `spec/versions/v1.14/plan/prompts/task-10-cli-events.md` |
| `crates/nf-recorder/src/record_loop.rs:127` | `interfaces-delta.json.exit_codes` |
| `crates/nf-recorder/src/record_loop.rs:209` | `interfaces-delta.json` |
| `crates/nf-recorder/src/record_loop.rs:239` | `v1.14.4` |
| `crates/nf-recorder/src/record_loop.rs:390` | `BUG-20260419-v1.14-compositor-commit` |
| `crates/nf-recorder/src/record_loop.rs:391` | `v1.14.3` |
| `crates/nf-recorder/src/record_loop.rs:515` | `interfaces-delta.json` |
| `crates/nf-recorder/src/pipeline/vt_wrap.rs:1` | `v1.14 T-07` |
| `crates/nf-recorder/src/pipeline/vt_wrap.rs:192` | `v1.14 target` |
| `crates/nf-recorder/src/pipeline/vt_wrap.rs:215` | `v1.14` |
| `crates/nf-recorder/src/pipeline/h264.rs:1` | `v1.14 T-07 + T-8.5` |
| `crates/nf-recorder/src/pipeline/h264.rs:25` | `v1.14` |
| `crates/nf-recorder/src/pipeline/h264.rs:40` | `v1.14` |

## spec 对齐问题

- `spec/versions/v1.14/spec/interfaces-delta.json` 不存在，但被 `cli.rs:3`、`events.rs:3`、`record_loop.rs:9` 引用。
- `spec/versions/v1.14/plan/prompts/task-10-cli-events.md` 不存在，但被 `record_loop.rs:74` 引用。
- 多处只写 `interfaces-delta.json`，没有 v0.4.1 下可追踪路径。对当前版本读者来说，应改成当前 spec 路径、ADR 名称，或删除历史任务引用。

## 优先级建议

1. 补 `lib.rs` crate-level 架构说明，并标注 public surface 稳定性。
2. 统一 unsafe 注释格式，让 `rg -B1 "unsafe {" | rg SAFETY` 能成为有效门禁。
3. 给 `pipeline/mod.rs` 的公开 trait/类型补契约文档。
4. 清理 `v1.*` / `T-*` 历史引用；只保留仍有决策价值的 ADR/BUG 编号，并改成当前可解析路径。
5. 后续小步拆分 `record_loop::run` 和 `orchestrator::run_parallel` 的阶段函数。

## 校验命令

在 `crates/nf-recorder` 下复跑任务给定命令，结果如下:

```text
grep -rn "^///" src/ | wc -l
220

grep -rn "^pub fn\|^pub struct\|^pub enum" src/ | wc -l
35

grep -rB1 "unsafe {" src/ | grep -c "SAFETY"
33

grep -c "unsafe {" src/**/*.rs
src/pipeline/mp4_writer.rs:37
src/pipeline/vt_wrap.rs:45
src/snapshot.rs:12
```

上面的 `grep -c "unsafe {" src/**/*.rs` 仅列非零文件；其余 `src/**/*.rs` 输出为 `0`。过时引用命令 `grep -rn "v1\.\(13\|14\|44\|56\|67\)\|interfaces-delta" src/` 已复跑，命中清单见上方“过时引用清单”。`git diff -- crates/nf-recorder` 为空，确认本次未改源码。
