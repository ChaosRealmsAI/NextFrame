# D4 · nf-recorder 清洁度审查

## 总评(1 句)
一般偏好: `nf-recorder` 当前没有 unused import / dead_code 编译警告，但 v1.x 历史注释密度很高，并有少量显式 dead-code allow、预留 API 和硬编码常数需要收敛。

## Findings(按 P0/P1/P2 排)

### P1 · 过时 v1.x 版本引用仍覆盖主要模块
- **分类**: 过时版本引用
- **位置**: `crates/nf-recorder/src/cli.rs:1`, `src/export_api.rs:1`, `src/orchestrator.rs:1`, `src/record_loop.rs:1`, `src/frame_pool.rs:1`, `src/events.rs:1`, `src/pipeline/vt_wrap.rs:1`, `tests/hevc_encode.rs:1`, `tests/regression_bug_a.rs:1`
- **问题**: 当前审查版本是 v0.4.1，但源码和测试注释仍大量引用 v1.14 / v1.15 / v1.44 / v1.55 / v1.56 / v1.67.1。部分是历史来源可保留，但当前写法把“历史来源”“当前合约版本”“临时文件名”混在一起，容易让读者误判 nf-recorder 仍处在 v1.x 线。
- **证据**:
```rust
// crates/nf-recorder/src/cli.rs:1-3
//! CLI parser for `nf-recorder` · v1.14 T-09 / T-18 subcommand refactor.
//!
//! Contract source: `spec/versions/v1.14/spec/interfaces-delta.json`

// crates/nf-recorder/src/export_api.rs:1
//! v1.44 · High-level export API · 从 source.json 直接产 MP4。

// crates/nf-recorder/tests/hevc_encode.rs:1
//! HEVC integration coverage for v1.67.1 Bug-B / Bug-C fixes.
```
- **建议**: 把模块级 doc 改成 v0.4.1 当前语义；如确需保留历史迁移来源，统一写成 `Historical source: v1.xx ...` 或放到 changelog，不要放在首句和 CLI `about`。
- **代价**: 中。主要是注释和测试临时文件名清理，但涉及多文件统一口径。

### P1 · `#[allow(dead_code)]` 掩盖真实未用字段
- **分类**: dead code
- **位置**: `crates/nf-recorder/src/pipeline/mp4_writer.rs:64`, `src/pipeline/mp4_writer.rs:66`, `src/pipeline/vt_wrap.rs:198`
- **问题**: `Mp4Writer.width/height` 只在构造时写入，未参与输出统计、校验或日志；`VtCompressor.callback_refcon` 需要持有裸指针生命周期，但使用 `#[allow(dead_code)]` 而非更精确的说明型结构，容易和普通未用字段混在一起。
- **证据**:
```rust
// crates/nf-recorder/src/pipeline/mp4_writer.rs:63-67
output_path: PathBuf,
#[allow(dead_code)] // T-07 集成 / 日志用
width: u32,
#[allow(dead_code)]
height: u32,

// crates/nf-recorder/src/pipeline/vt_wrap.rs:196-199
/// lifetime of the session; released implicitly when `state` is dropped.
#[allow(dead_code)]
callback_refcon: *const VtCallbackState,
```
- **建议**: `width/height` 若确实只为未来日志保留，应删除或写入 `OutputStats`/debug 日志；`callback_refcon` 建议改成带语义的 guard/newtype 字段名，或至少用 `#[expect(dead_code, reason = "...")]` 明确这是 FFI lifetime anchor。
- **代价**: 低到中。`Mp4Writer` 字段可直接删；`callback_refcon` 清理需确认 VT callback refcon retain/release 不被破坏。

### P2 · `FramePool` 是单计数 wrapper，抽象收益不足
- **分类**: 废抽象
- **位置**: `crates/nf-recorder/src/frame_pool.rs:1`, `src/frame_pool.rs:16`, `src/record_loop.rs:310`, `src/record_loop.rs:420`
- **问题**: 文件注释明确称它是 v1.14 placeholder；当前只包装 `submitted: u64` 计数。`record_loop` 只调用 `new()` 和 `note_submitted()`，返回值也未使用；`capacity()` / `submitted()` 在 crate 内无调用点。
- **证据**:
```rust
// crates/nf-recorder/src/frame_pool.rs:10-12
//! This struct is kept as a named entry point so future versions can swap
//! in a real pool (v1.19 multi-worker) without touching `record_loop.rs`.
//! Today it only records statistics.

// crates/nf-recorder/src/record_loop.rs:310,420
let mut pool = FramePool::new(FRAME_POOL_CAPACITY);
pool.note_submitted();
```
- **建议**: 在 v0.4.1 若没有真实 pool 行为，优先 inline 为 `frames_submitted: u64` 或直接复用 `frames_encoded`；若要保留扩展点，把 module 限制为 `pub(crate)` 并补一条当前指标消费路径。
- **代价**: 低。

### P2 · `verify --json` 是 no-op 预留 flag
- **分类**: dead code
- **位置**: `crates/nf-recorder/src/cli.rs:114`, `src/main.rs:32`
- **问题**: CLI 暴露 `--json`，但 dispatch 中绑定为 `_json` 后丢弃；注释说“默认输出已经是 JSON-Line”，因此该 flag 当前没有行为差异。
- **证据**:
```rust
// crates/nf-recorder/src/cli.rs:114-116
/// Reserved · default output is already JSON-Line on stdout.
#[arg(long)]
json: bool,

// crates/nf-recorder/src/main.rs:32-37
Some(Command::Verify {
    file,
    expect_fps,
    expect_bitrate,
    json: _json,
}) => dispatch_verify(file, expect_fps, expect_bitrate),
```
- **建议**: 删除 flag，或让它实际切换输出格式；若保持兼容，文档应明确“accepted for compatibility, no effect”。
- **代价**: 低。

### P2 · `PipelineError` 和 `ColorSpec` 有预留枚举分支未由当前路径构造
- **分类**: dead code
- **位置**: `crates/nf-recorder/src/pipeline/mod.rs:36`, `src/pipeline/mod.rs:57`, `src/pipeline/mod.rs:59`, `src/record_loop.rs:154`
- **问题**: `ColorSpec::BT2020_HDR10_10bit`、`PipelineError::FrameOutOfOrder`、`PipelineError::Timeout` 当前不是编译器意义上的 dead code，因为它们是 pub API；但在 `nf-recorder` crate 内只有匹配/映射，没有构造路径。`Timeout` 只由 `mp4_writer` finish timeout 构造，`FrameOutOfOrder` 没有构造点。
- **证据**:
```rust
// crates/nf-recorder/src/pipeline/mod.rs:36-39
pub enum ColorSpec {
    BT709_SDR_8bit,
    BT2020_HDR10_10bit,
}

// crates/nf-recorder/src/pipeline/mod.rs:56-59
#[error("frame out of order")]
FrameOutOfOrder,
#[error("timeout")]
Timeout,
```
- **建议**: 对外 API 若需要预留 HDR / PTS 乱序错误，保留但加 `#[non_exhaustive]` 或注释说明当前不可达；否则先收敛到当前 v0.4.1 实际可产生的分支。
- **代价**: 中。涉及外部 API 兼容判断。

### P2 · keyframe interval `60` 在三处硬编码
- **分类**: 其他清洁 / magic number
- **位置**: `crates/nf-recorder/src/pipeline/h264.rs:86`, `src/pipeline/hevc.rs:52`, `src/pipeline/vt_wrap.rs:490`
- **问题**: 强制 IDR 判断和 VT `MaxKeyFrameInterval` 分别硬编码 `60`。注释说明它代表 “1s @ 60fps / 2s @ 30fps”，但没有命名常量，后续若改 GOP 策略容易漏改。
- **证据**:
```rust
// crates/nf-recorder/src/pipeline/h264.rs:86
let force_keyframe = self.frames_pushed == 0 || self.frames_pushed % 60 == 0;

// crates/nf-recorder/src/pipeline/vt_wrap.rs:490-497
// v1.55 · one forced keyframe every 60 frames (1s @ 60fps / 2s @ 30fps).
set_prop(..., CFNumber::new_i32(60).as_ref())?;
```
- **建议**: 提取 `KEYFRAME_INTERVAL_FRAMES: u64/i32 = 60`，由 H.264、HEVC pipeline 和 VT session 配置共用；同时可处理 clippy 的 `is_multiple_of` warning。
- **代价**: 低。

### P2 · clippy 清洁 warning 未归零
- **分类**: 其他清洁
- **位置**: `crates/nf-recorder/src/cli.rs:265`, `src/orchestrator.rs:323`, `src/pipeline/h264.rs:86`, `src/pipeline/hevc.rs:52`, `src/verify_mp4.rs:409`, `src/verify_mp4.rs:914`, `src/verify_mp4.rs:976`
- **问题**: `cargo clippy -p nf-recorder -- -W dead_code -W unused` 对 `nf-recorder` 本身没有 dead_code/unused warning，但仍报 7 个默认 clippy warning，包括 manual char comparison、unnecessary `map_or`、manual `is_multiple_of`、type complexity、collapsible if。
- **证据**:
```rust
// crates/nf-recorder/src/cli.rs:265
trimmed.splitn(2, |c| c == 'x' || c == 'X')

// crates/nf-recorder/src/orchestrator.rs:323-326
current.file_stem()
    .and_then(|s| s.to_str())
    .map_or(false, |n| n == "nf-recorder")

// crates/nf-recorder/src/verify_mp4.rs:409
fn iter_children(body: &[u8]) -> Result<Vec<([u8; 4], &[u8])>, VerifyError>
```
- **建议**: 这些不是行为 bug，但作为清洁度门禁应归零；`iter_children` 的 type alias 若只为这一处服务，注意不要引入“只用一次 typedef”的新废抽象。
- **代价**: 低。

## 四类汇总

### dead code
- `#[allow(dead_code)]`: 3 处，分别是 `Mp4Writer.width`、`Mp4Writer.height`、`VtCompressor.callback_refcon`。
- 可疑未消费 API/flag: `FramePool::submitted/capacity`、`PipelineH264_1080p::compressor()`、`VtCompressor::pending_output()`、`SendableFormatDescription::into_inner()`、`verify --json`。
- enum 预留: `ColorSpec::BT2020_HDR10_10bit`、`PipelineError::FrameOutOfOrder` 在 crate 内没有构造点；`PipelineError::Timeout` 有构造点但只覆盖 writer finish timeout。
- `output_surface` warning 不属于本次范围: clippy 输出显示它来自 `crates/nf-shell-mac/src/headless/mac.rs:101`，不是 `crates/nf-recorder/`。

### 过时版本引用
- `rg -n "v1\\." src tests` 命中模块级 doc、行内注释、测试说明和临时文件名；主要集中在 v1.14 / v1.15 / v1.44 / v1.55 / v1.56 / v1.67.1。
- v0.4.1 是 rename 线，建议把当前说明改成 v0.4.1，历史版本仅作为 provenance。

### 废抽象
- `RecordPipeline` 不是单实现 trait: 当前有 H.264 和 HEVC 两个实现，保留合理。
- `FramePool` 当前是最明显废抽象，只包装一个提交计数，且容量字段不参与行为。
- `ResolvedExportPreset` 不是废抽象: 它同时承载 viewport、bitrate、codec 三个解析结果，避免重复读取 source preset。

### 其他清洁(TODO / magic number / dead branch / unused import)
- TODO / FIXME / HACK / XXX: 未命中。
- unused imports: clippy 未报告 `nf-recorder` unused import。
- dead branch: 未发现 `if false` / `cfg!(never)` / 明显永不进入 match arm。
- magic number: GOP/keyframe interval `60` 应命名；MP4 atom parser 中大量 `8/16/4` 属格式字段宽度，已有局部上下文，优先级较低。

## 亮点(好的清洁状态 · 别改)
- clippy 在 `nf-recorder` 上没有 `dead_code` / `unused import` warning；显式 dead-code 面积很小。
- `TODO|FIXME|HACK|XXX` 未命中，说明迁移遗留任务没有散落在源码内。
- pipeline trait 当前至少有 H.264 / HEVC 两个实现，不属于“单实现 trait”废抽象。
- 大部分 magic number 已被命名，如 `PARALLEL_MIN_DURATION_MS`、`PARALLEL_MAX`、`PROGRESS_EVERY`、`PTS_TIMESCALE`、`MEDIA_TIMESCALE`、`FINISH_TIMEOUT`。

## 命令记录
```bash
cd crates/nf-recorder
rg -n "#\\[allow\\(dead_code\\)\\]|#\\[allow\\(unused|#\\[cfg\\(test\\)" src tests
rg -n "TODO|FIXME|HACK|XXX|v1\\.(13|14|15|44|56|58|67)" src tests
rg -n "v1\\." src tests
cargo clippy -p nf-recorder -- -W dead_code -W unused
find src tests -name '*.rs' -print0 | xargs -0 wc -l | tail -20
```

## 汇总
- P0 数: 0 / P1 数: 2 / P2 数: 5
- 整体分(1-10): 7
