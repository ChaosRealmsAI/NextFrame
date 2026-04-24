# D5 · nf-tts 维护性审查

## 总评

结论：**有 P1 维护性缺口，建议修复后再视为 D5 达标**。

本轮只审查 `crates/nf-tts/`，未修改业务代码。审查范围覆盖：文档密度、Rust `pub` API surface、CLI 子命令 help 完整度（`synth` / `batch` / `align` / `karaoke`）、过时 `v1.x` 引用、新人可读性。

主要风险集中在三处：第一，D5 点名的 `align` / `karaoke` 独立子命令并不存在，用户运行 `nf-tts align --help` 或 `nf-tts karaoke --help` 只能得到 `unrecognized subcommand`；第二，README 与当前实现明显脱节，包含“只实现 edge backend”和已不存在的 `--srt` 用法；第三，library 对外 API 极小但 rustdoc 覆盖几乎为空，且 `Manifest` 的公开字段 / 方法涉及未从 crate root 导出的 `ManifestFailure`。

辅助命令结果：

- `cargo run --quiet --manifest-path crates/nf-tts/Cargo.toml -- --help`：通过；列出 `synth` / `batch` / `play` / `preview` / `voices` / `concat` / `config`，没有 `align` / `karaoke`。
- `cargo run --quiet --manifest-path crates/nf-tts/Cargo.toml -- synth --help`：通过；有长 help、输出模型、质量 playbook、示例。
- `cargo run --quiet --manifest-path crates/nf-tts/Cargo.toml -- batch --help`：通过；有 JSON schema、默认行为、示例。
- `cargo run --quiet --manifest-path crates/nf-tts/Cargo.toml -- align --help`：失败，`unrecognized subcommand 'align'`。
- `cargo run --quiet --manifest-path crates/nf-tts/Cargo.toml -- karaoke --help`：失败，`unrecognized subcommand 'karaoke'`。
- `RUSTDOCFLAGS='-D missing_docs' cargo doc --manifest-path crates/nf-tts/Cargo.toml --lib --no-deps`：失败，`29` 个 missing docs 错误。
- `cargo check --manifest-path crates/nf-tts/Cargo.toml`：通过。

## Doc 覆盖估算

- Rust 源码总行数：`5397` 行。
- Rust doc comment 行数：`230` 行，源码 doc-line 密度约 `4.3%`。
- crate 级外部文档：`README.md` `148` 行，`CLAUDE.md` `38` 行；但 README 关键内容过时，不能按有效覆盖全量计算。
- rustdoc-visible library API：`missing_docs` 报 `29` 个错误；除 `VoxConfig::resolve_voice()` 有一句说明外，主要导出类型 / 字段 / 方法基本无 rustdoc。估算 public library API 文档覆盖约 `3%`。
- CLI help 覆盖：本轮要求的 4 个子命令中，`synth` / `batch` 有完整长 help，`align` / `karaoke` 不存在；按命令维度约 `50%`。若只看已存在的 `synth` / `batch`，选项级 help 基本完整，估算 `90%+`。

## P0 Findings

无。

## P1 Findings

### P1-1 · `align` / `karaoke` 子命令缺失，D5 指定 help 覆盖只有 2/4

位置：`crates/nf-tts/src/cli/args.rs:18`

```rust
pub enum Command {
    Synth(SynthArgs),
    Batch(BatchArgs),
    Play(PlayArgs),
    Preview { ... },
    Voices { ... },
    Concat { ... },
    Config { ... },
}
```

D5 检查项明确包含 `synth/batch/align/karaoke` 子命令 help 完整度。当前 clap command enum 只有 `synth` / `batch` / `play` / `preview` / `voices` / `concat` / `config`，没有 `align` 或 `karaoke`。实际执行结果：

```text
error: unrecognized subcommand 'align'
error: unrecognized subcommand 'karaoke'
```

代码内部确实有 alignment 与 karaoke 能力：`crate::whisper::align_audio()` 在 `synth` / `batch` 路径被调用，`crate::output::karaoke::write_karaoke_html()` 会生成 sidecar HTML。但用户无法独立重跑 alignment、从既有 `timeline.json` 重新生成 karaoke、或通过 `--help` 发现这些能力的输入 / 输出契约。

建议：若 v0.4.2 目标包含独立工作流，应增加 `align` 与 `karaoke` 子命令，并为其补齐输入、输出、覆盖策略、失败模式、依赖项说明。若产品不打算提供独立子命令，应在 D5/spec/README 中明确它们不是 CLI surface，只是 `synth` / `batch` 的副产物。

### P1-2 · README 是新人入口，但与当前 CLI / backend 状态不一致

位置：`crates/nf-tts/README.md:14`

```md
The backend abstraction is in place, but this repository currently implements only the `edge` backend.
```

位置：`crates/nf-tts/src/backend/mod.rs:116`

```rust
match name {
    DEFAULT_BACKEND => Ok(Arc::new(edge::EdgeBackend::new())),
    "volcengine" => Ok(Arc::new(volcengine::VolcengineBackend::new())),
```

README 说当前只实现 `edge` backend，但源码和 CLI help 都已经支持 `volcengine`。这会直接误导新人判断可用能力，也会让维护者误删或忽略 Volcengine 路径。

位置：`crates/nf-tts/README.md:69`

```md
cargo run -- synth --file notes.txt --voice zh-CN-YunxiNeural --srt -d out
```

当前 `synth --help` 没有 `--srt`，字幕 / karaoke 是默认开启，通过 `--no-sub` 关闭。README 的示例命令对新人是直接不可执行的负反馈。

建议：把 README 改成当前事实源：binary 名、backend 列表、默认 4 产物、`--no-sub` 语义、Volcengine 参数、whisperX 依赖、`cargo run --manifest-path ...` 或 workspace 下的正确运行方式。README 应避免与 `cli::LONG_ABOUT` 分叉，至少从同一份契约摘录。

### P1-3 · Library public API 很小但没有 rustdoc，且导出边界不干净

位置：`crates/nf-tts/src/lib.rs:7`

```rust
pub use config::VoxConfig;
pub use output::manifest::{Manifest, ManifestEntry};
```

位置：`crates/nf-tts/src/output/manifest.rs:14`

```rust
pub failures: Vec<ManifestFailure>,
```

位置：`crates/nf-tts/src/output/manifest.rs:52`

```rust
pub fn add_failure(&mut self, failure: ManifestFailure) {
```

对外 library surface 当前只 re-export `VoxConfig`、`Manifest`、`ManifestEntry`，看起来很克制；但 `Manifest` 的公开字段和公开方法涉及 `ManifestFailure`，而 `ManifestFailure` 没有从 crate root re-export。外部用户能看到这个类型参与 API，却没有清晰稳定的导入路径，API 边界不完整。

同时，`RUSTDOCFLAGS='-D missing_docs' cargo doc --lib --no-deps` 报 `29` 个 missing docs：`VoxConfig` 结构体 / 字段 / 多数方法、`Manifest` / `ManifestEntry` 结构体字段、`Manifest` 的构造与写入方法均缺文档。对于一个主要是 CLI 的 crate，这不一定要求大面积开放 library API；但一旦 `lib.rs` 已经导出，就应该说明哪些是稳定 API，哪些只是测试 / 内部复用。

建议：二选一收口。若不承诺 library API，把 manifest/config 导出降到最小，或在 crate-level docs 标注 unstable/internal。若承诺公开 API，则 re-export `ManifestFailure`，补齐类型 / 字段 / 方法 rustdoc，并在 CI 加 `#![warn(missing_docs)]` 或至少对 `lib` 开启。

## P2 Findings

### P2-1 · 过时 `v1.x` 引用仍散落在代码和维护文档中

位置：`crates/nf-tts/src/whisper/mod.rs:17`

```rust
the `voice` parameter was added in v1.12.1
```

位置：`crates/nf-tts/CLAUDE.md:9`

```md
Default output (4 files · flat into -d · since v1.12.2)
```

位置：`crates/nf-tts/CLAUDE.md:36`

```md
Migration (v0.8 → v1.12)
```

当前审查目录是 `spec/quality-reports/v0.4.2/...`，`Cargo.toml` 版本是 `0.1.0`，但 `CLAUDE.md` 和部分源码注释仍以 `v1.12.x` 解释 schema / migration。`src/backend/edge/ws.rs` 中的 `edge/v1` 是上游协议 URL，不应算项目版本；但 `v1.12.1` / `v1.12.2` / `v1.12.5` 这些明显是历史项目版本引用。

建议：把历史版本号迁移为“legacy schema / old nested layout / current flat sidecar layout”这类语义标签；如必须保留迁移脉络，集中放到 changelog/archive，不要散落在新手入口和核心模块注释中。

### P2-2 · `whisper` 目录存在未挂载的遗留文件，新人容易读错实现

位置：`crates/nf-tts/src/whisper/mod.rs:23`

```rust
mod aligner;
pub(crate) mod timeline;
```

`whisper/mod.rs` 只挂载 `aligner.rs` 与 `timeline.rs`，但目录下还存在 `process.rs`、`parse.rs`、`align.rs`。搜索模块引用只发现 `align.rs` 内部引用 `crate::whisper::parse`，没有发现这些文件被当前 module tree 挂载。

这会造成两个维护问题：新人从文件名会自然打开 `align.rs` / `parse.rs`，但那不是当前编译路径；`rg pub` 也会把这些孤儿文件的 `pub struct Timeline` / `pub fn align_audio` 算进去，夸大 API surface 并干扰审查。

建议：确认这些文件是否仍需要保留。若已废弃，删除或移动到 archive；若仍有价值，挂入 module tree 并补测试。至少在文件头标注“legacy, not compiled”可降低误读。

### P2-3 · 文档密度分布不均，关键流程说明集中在 CLI help 而不是模块边界

`synth` / `batch` 的 clap help 很强，尤其 `SYNTH_LONG_ABOUT` 和 `BATCH_LONG_ABOUT` 已覆盖输出模型、质量建议、JSON schema 和示例。但源码 doc density 只有约 `4.3%`，且分布明显偏斜：`cli/args.rs`、`whisper/mod.rs`、`whisper/timeline.rs` 文档较多，`queue/scheduler.rs`、`cli/synth.rs`、`cli/batch.rs`、`backend/volcengine/client.rs` 等核心执行路径主要靠局部变量和测试理解。

维护风险不是“注释太少”本身，而是系统契约散落：默认 4 产物、alignment 失败是否降级、duration 的权威来源、cache/event/manifest 的一致性，主要写在 CLI long help 或 `CLAUDE.md`，模块边界没有稳定契约说明。新人需要同时读 help 文案、README、CLAUDE、源码才能拼出真实行为。

建议：把高价值契约下沉到模块级 rustdoc 或短 ADR：output sidecar contract、alignment failure contract、manifest/event contract、backend parameter contract。CLI help 可以继续面向用户，但不要成为唯一事实源。

### P2-4 · 命名与入口仍有 `vox` / `nf-tts` 混用

位置：`crates/nf-tts/README.md:1`

```md
# vox
```

位置：`crates/nf-tts/src/cli/args.rs:7`

```rust
#[command(name = "vox", version, about = "Multi-backend TTS CLI, agent-friendly", long_about = super::LONG_ABOUT)]
```

位置：`crates/nf-tts/Cargo.toml:2`

```toml
name = "nf-tts"
```

crate / binary 是 `nf-tts`，README 标题和 clap metadata 仍使用 `vox`。当前实际 help 的 usage 显示为 `nf-tts`，但 `--brief` 输出是 `vox — multi-backend TTS CLI`。这类命名混用对老用户可接受，对新人和自动化脚本会增加入口判断成本。

建议：确定 canonical name。若是 `nf-tts`，把 README 标题、clap name、brief 文案改齐；若是 `vox`，则 Cargo package / bin / docs 也应说明 alias 和迁移关系。

## 亮点

- CLI 长 help 对 `synth` / `batch` 的用户任务覆盖较好，能直接指导输出产物、Edge 质量调参、Volcengine 专属参数和 batch JSON schema。
- `lib.rs` 对外 re-export 很少，没有把 `backend` / `queue` / `cli` 全量暴露为 public crate API，整体 API surface 有收口意图。
- `whisper/mod.rs` 对从 transcription 到 forced alignment 的设计动机解释充分，属于新人可读性较好的局部文档。
- `cargo check` 通过，当前审查没有发现因为文档或 public surface 导致的编译破坏。

## 汇总

- P0：无。
- P1：`align` / `karaoke` 子命令缺失；README 与实现脱节；library public API rustdoc 和导出边界不足。
- P2：过时 `v1.x` 引用；`whisper` 孤儿文件；文档密度分布不均；`vox` / `nf-tts` 命名混用。
- Doc 覆盖估算：Rust doc-line 密度约 `4.3%`；public library API rustdoc 覆盖约 `3%`；D5 指定 CLI 子命令 help 覆盖约 `50%`。
