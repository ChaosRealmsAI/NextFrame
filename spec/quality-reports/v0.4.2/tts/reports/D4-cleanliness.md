# D4 · nf-tts 清洁度审查

## 总评(1 句)
`nf-tts` 已挂入编译的代码在 clippy/test 层面较干净，但目录内仍有文件级死代码、输出链路重复、批量 karaoke 产物不一致、过时版本注释和若干 magic number，应先收敛边界再继续扩展。

## Findings(按 P0/P1/P2 排)

### P0 · 无
- **分类**: P0
- **结论**: 未发现会阻断发布的清洁度问题。

### P1 · `whisper` 目录保留未挂入模块树的旧实现
- **分类**: dead code / 废抽象 / 过时 schema
- **位置**: `crates/nf-tts/src/whisper/mod.rs:23`, `crates/nf-tts/src/whisper/align.rs:15`, `crates/nf-tts/src/whisper/parse.rs:10`, `crates/nf-tts/src/whisper/process.rs:42`
- **问题**: `mod.rs` 只声明 `mod aligner; pub(crate) mod timeline;`，没有声明 `align` / `parse` / `process`。因此 `align.rs`、`parse.rs`、`process.rs` 当前不参与编译、测试和 clippy；其中还保留旧 `align_audio(audio_path, original_text)` 签名、旧 `TimelineWord { word }` schema、重复的 `detect_language` / `build_timeline` / `run_ffa` 实现。
- **证据**:
```rust
// crates/nf-tts/src/whisper/mod.rs:23-32
mod aligner;
pub(crate) mod timeline;

pub use timeline::Timeline;
#[allow(unused_imports)]
pub use timeline::{TimelineSegment, TimelineWord};

// crates/nf-tts/src/whisper/parse.rs:23-26
pub struct TimelineWord {
    pub word: String,
    pub start_ms: u64,
    pub end_ms: u64,
}
```
- **建议**: 删除旧三文件，或明确重新接入并迁移到当前 `{duration_ms, voice, words[].text, segments}` schema；若保留作参考，应移到 `archive/` 或文档，不放在 `src/`。
- **代价**: 中。主要是确认没有外部脚本或文档仍指向这些文件。

### P1 · backend `boundaries` 产出链路与 output 对齐链路重复，且当前被丢弃
- **分类**: 废抽象 / backend-output 重复
- **位置**: `crates/nf-tts/src/backend/mod.rs:97`, `src/backend/edge/ws.rs:108`, `src/backend/volcengine/mod.rs:112`, `src/cli/synth.rs:180`, `src/queue/scheduler.rs:123`
- **问题**: `Backend::synthesize` 返回 `SynthResult.boundaries`，Edge 解析 word boundary，Volcengine 还调用 ffmpeg silence detect 估计 sentence boundary；但 `synth` 路径只用 whisperX 生成 timeline/SRT/karaoke，完全不消费 `result.boundaries`。batch 路径也把它解构为 `_boundaries` 后丢弃。结果是 backend 和 output 同时承担“时间边界”职责，实际只有 whisper timeline 生效。
- **证据**:
```rust
// crates/nf-tts/src/backend/mod.rs:97-101
pub struct SynthResult {
    pub audio: Vec<u8>,
    pub duration_ms: Option<u64>,
    pub boundaries: Vec<WordBoundary>,
}

// crates/nf-tts/src/queue/scheduler.rs:123
(job, params, Ok((out_path, audio, duration_ms, _boundaries))) => {
```
- **建议**: 二选一：要么把 backend boundaries 作为 whisper 失败时的 fallback，并统一进入 `output::srt/karaoke`；要么从 `SynthResult` 和 backend 实现中删除 boundaries 产出，避免 Edge metadata 解析和 Volcengine silence detect 成为无效复杂度。
- **代价**: 中。若保留 fallback，需要定义 boundary 精度和 manifest 语义；若删除，需要改 backend contract 和测试。

### P1 · cache key 与默认输出 hash 重复拼接参数，且遗漏 backend/Volcengine 风格参数
- **分类**: 废抽象 / cache-output 重复 / magic key material
- **位置**: `crates/nf-tts/src/cache/mod.rs:18`, `src/output/naming.rs:8`, `src/cli/synth.rs:113`, `src/queue/scheduler.rs:52`
- **问题**: `Cache::key` 和 `naming::hash_name` 都手写同一组 key material：`text\0voice\0rate\0pitch\0volume`。但 `SynthParams` 还包含 `backend` 选择以及 `emotion`、`emotion_scale`、`speech_rate`、`loudness_rate`、`volc_pitch`、`context_text`、`dialect` 等 Volcengine 参数。当前相同文本和 voice 在不同 backend/style 下可能命中同一 cache 或默认输出名。
- **证据**:
```rust
// crates/nf-tts/src/cache/mod.rs:18-20
pub fn key(text: &str, voice: &str, rate: &str, pitch: &str, volume: &str) -> String {
    let input = format!("{text}\0{voice}\0{rate}\0{pitch}\0{volume}");
    blake3::hash(input.as_bytes()).to_hex().to_string()
}

// crates/nf-tts/src/output/naming.rs:8-12
pub fn hash_name(text: &str, voice: &str, rate: &str, pitch: &str, volume: &str) -> String {
    let input = format!("{text}\0{voice}\0{rate}\0{pitch}\0{volume}");
    let hash = blake3::hash(input.as_bytes());
    ...
}
```
- **建议**: 提取一个单一的 `SynthesisKey`/key builder，显式包含 backend 和所有影响音频的参数；cache 用完整 digest，默认短文件名从同一个 digest 派生，避免两处漂移。
- **代价**: 中。会改变 cache 命中和默认文件名，需要迁移策略或接受 cache miss。

### P1 · batch help/文档承诺 karaoke，但 scheduler 不生成
- **分类**: karaoke_template.html 一致性 / 输出契约不一致
- **位置**: `crates/nf-tts/src/cli/args.rs:142`, `crates/nf-tts/src/cli/mod.rs:19`, `crates/nf-tts/src/queue/scheduler.rs:137`, `crates/nf-tts/src/cli/synth.rs:196`
- **问题**: CLI help 写明 batch 每个 job 产出 `{filename}.mp3 + .timeline.json + .srt + .karaoke.html`；`synth` 路径确实调用 `write_karaoke_html`。但 `queue::scheduler` 的 batch 路径只写 timeline 和 SRT，没有调用 `output::karaoke::write_karaoke_html`；cache hit 分支甚至不生成 timeline/SRT/karaoke。
- **证据**:
```rust
// crates/nf-tts/src/cli/args.rs:140-143
DEFAULTS:
  - Output files go into -d (same naming as `synth`)
  - Each job produces: {filename}.mp3 + .timeline.json + .srt + .karaoke.html

// crates/nf-tts/src/queue/scheduler.rs:137-147
if gen_srt {
    match crate::whisper::align_audio(&out_path, &job.text, &params.voice) {
        Ok(Some(timeline)) => {
            if let Ok(json_path) = timeline.write_json(&out_path) { ... }
            if let Ok(srt_path) = srt::write_srt(&out_path, &timeline.to_boundaries()) { ... }
```
- **建议**: 抽出共享 sidecar writer，例如 `output::write_sidecars(out_path, text, voice, include_karaoke)`，让 synth、batch、cache hit 同走一条路径；或修改 batch help，明确 batch 不生成 karaoke。
- **代价**: 低到中。主要是去重 sidecar 逻辑并补一条 batch karaoke 测试。

### P2 · `allow` 使用面积小，但有生产代码冗余/遮蔽
- **分类**: allow / unused
- **位置**: `crates/nf-tts/src/whisper/mod.rs:31`, `src/whisper/aligner.rs:13`, `src/whisper/timeline.rs:269`, `src/cli/batch.rs:161`, `src/lib.rs:12`, `src/output/karaoke.rs:51`, `tests/smoke.rs:1`
- **问题**: 生产代码里 `#[allow(unused_imports)]` 用来压住 `TimelineSegment/TimelineWord` re-export，但 `whisper` 是私有模块，外部不会通过该 re-export 使用这些类型；`aligner::FfaOutput.duration_ms` 当前已被 `timeline::build_timeline` 消费，`#[allow(dead_code)]` 已显得过时。测试模块的 `unwrap_used/expect_used` allow 可以接受，但最好保持只限测试。
- **建议**: 删除不必要 re-export 或改为直接使用 `crate::whisper::timeline::*`；把 `allow(dead_code)` 改成无 allow，若编译器仍报错再用 `#[expect(..., reason = "...")]`。
- **代价**: 低。

### P2 · v1.x/0.1.0 版本标识仍出现在当前 v0.4.2 代码和文档中
- **分类**: 过时版本引用
- **位置**: `crates/nf-tts/Cargo.toml:3`, `src/whisper/mod.rs:19`, `src/whisper/timeline.rs:13`, `src/whisper/timeline.rs:530`, `src/output/naming.rs:56`, `crates/nf-tts/CLAUDE.md:9`
- **问题**: 当前审查目标是 v0.4.2，但 crate 版本仍是 `0.1.0`，模块注释和测试注释仍以 `v1.12.x` 作为当前 schema/行为说明。部分历史来源可以保留，但现在混在模块首段、测试标题和样例文件名里，容易让读者误判当前发布线。
- **建议**: 当前契约用 v0.4.2 或不写版本；历史迁移来源统一写成 `Historical source: v1.12.x`，不要放在模块首句或 CLI 主说明。Cargo 包版本也应和 workspace/release 口径对齐。
- **代价**: 低。

### P2 · magic number 分散在网络协议、时间换算和 UI 模板中
- **分类**: magic number
- **位置**: `crates/nf-tts/src/backend/edge/ws.rs:106`, `src/backend/edge/ws.rs:276`, `src/backend/edge/drm.rs:43`, `src/backend/volcengine/mod.rs:98`, `src/backend/volcengine/client.rs:17`, `src/backend/volcengine/client.rs:134`, `src/output/karaoke_template.html:211`
- **问题**: 部分常数已有上下文，但仍散落为裸值：Edge split `4096`、Edge ticks `10_000`、Sec-MS-GEC 5 分钟窗口 `300.0`、Volcengine timeout `60 + chars/10` capped `180`、事件码 `152/352`、二进制帧头 `[0x11, ...]`、模板时间换算 `60000/1000`。后续调参或协议升级容易漏改。
- **建议**: 为协议/单位换算提取局部常量，尤其是 `EDGE_MAX_SSML_BYTES`、`EDGE_TICKS_PER_MS`、`GEC_ROUNDING_SECONDS`、`VOLCENGINE_BASE_TIMEOUT_SECS`、`VOLCENGINE_MAX_TIMEOUT_SECS`、模板内的 `MS_PER_SECOND/MS_PER_MINUTE`。
- **代价**: 低。

### P2 · `karaoke_template.html` 对当前 schema 基本一致，但容错和文案仍绑定旧假设
- **分类**: karaoke_template.html 一致性
- **位置**: `crates/nf-tts/src/output/karaoke.rs:11`, `src/output/karaoke_template.html:114`, `src/output/karaoke_template.html:180`, `src/output/karaoke_template.html:221`
- **问题**: writer 和 template 的两个占位符一致，模板使用 `TIMELINE.words[].text`、`TIMELINE.duration_ms`、`TIMELINE.voice`，与当前 `timeline.rs` schema 一致。残留问题是模板 banner 固定写 `Edge TTS + whisperX`，但 CLI 支持 Volcengine；此外 `setTimeUI` 中 `(t / TIMELINE.duration_ms) * 100` 对空 timeline / `duration_ms == 0` 会产生 `NaN%`。
- **建议**: 文案改为 backend-agnostic，或在 timeline/模板注入 backend；`duration_ms <= 0` 时把进度置 0 并显示空态。
- **代价**: 低。

## 分类汇总

### dead code
- 明确死代码: `src/whisper/align.rs`、`src/whisper/parse.rs`、`src/whisper/process.rs` 未被 `mod.rs` 挂入。
- 编译器/clippy 对已挂入模块未报告 `dead_code` / `unused` warning。
- `SynthResult.boundaries` 当前属于“产出后未消费”的逻辑死路径，不是编译器意义 dead code。

### allow / unused
- 生产代码 allow: `#[allow(unused_imports)]` 1 处，`#[allow(dead_code)]` 当前挂入模块 1 处。
- 测试 allow: `unwrap_used` / `expect_used` 多处，范围限定在测试模块和 `tests/smoke.rs`。

### TODO/FIXME
- `TODO|FIXME|HACK|XXX|todo!|unimplemented!` 未命中。

### 过时版本 v1.x 注释
- 命中 `whisper` 模块 doc、timeline schema 注释、测试分组、`CLAUDE.md` 和一个 `v1.12-demo.mp3` 测试样例。
- `Cargo.toml` 包版本仍为 `0.1.0`，与 v0.4.2 审查线不一致。

### 废抽象 / 重复
- `whisper` 新旧实现并存，旧实现未编译。
- backend boundaries 与 whisper timeline 是两套 timing abstraction，目前只有 whisper 被 output 消费。
- cache key 与 output hash 是两套手写 key material，且遗漏影响音频的参数。
- synth 和 batch sidecar 写入逻辑重复且行为不一致。

### magic number
- 网络协议值、时间换算、重试/timeout、UI 时间格式应提取常量。
- Unicode 范围 `0x4E00..=0x9FFF` 等属于语言检测领域常量，建议命名但优先级低于协议/timeout。

### karaoke_template.html 一致性
- 占位符和当前 timeline schema 一致。
- batch 路径未生成 karaoke，与 CLI help/CLAUDE 输出说明不一致。
- 模板文案固定 Edge，且 duration 0 时进度可能 NaN。

## 亮点(好的清洁状态 · 别改)
- `cargo clippy -p nf-tts --all-targets -- -W dead_code -W unused` 无 warning。
- `cargo test -p nf-tts --all-targets` 全部通过：lib 8、main 41、smoke 1。
- TODO/FIXME/HACK/XXX 未散落在源码里。
- `karaoke.rs` 对 `{{AUDIO_SRC}}` 做 attribute escaping，并有占位符替换测试。

## 命令记录
```bash
rg -n "TODO|FIXME|HACK|XXX|allow|unused|dead_code|v1\\.|legacy" crates/nf-tts
rg -n "mod (align|parse|process)|whisper::(align|parse|process)|parse::|process::|align::" crates/nf-tts/src crates/nf-tts/tests
rg -n "Cache::key|hash_name|blake3::hash" crates/nf-tts/src
rg -n "\\{\\{AUDIO_SRC\\}\\}|\\{\\{TIMELINE_JSON\\}\\}|TIMELINE\\.words|write_karaoke_html" crates/nf-tts/src crates/nf-tts/CLAUDE.md
cargo clippy -p nf-tts --all-targets -- -W dead_code -W unused
cargo test -p nf-tts --all-targets
```

## 汇总
- P0 数: 0
- P1 数: 4
- P2 数: 4
- 整体分(1-10): 7
