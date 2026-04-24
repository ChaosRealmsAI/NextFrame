# D4 · clips pipeline 清洁度审查

## 总评(1 句)
`nf-source + videocut-*` 编译与 clippy 层面干净，没有 `#[allow(dead_code)]` / TODO / FIXME，但迁移残留命名、公开但当前未消费的 API/schema、以及 ffmpeg/时间策略 magic number 仍需收敛。

## 范围
- 主审: `crates/nf-source/`, `crates/videocut-core/`, `crates/videocut-download/`, `crates/videocut-transcribe/`, `crates/videocut-align/`, `crates/videocut-cut/`
- 交叉验证: `crates/nf-guide/flows/clips/`，只用于确认 pipeline prompt/doc 是否仍指导旧路径。

## Findings(按 P0/P1/P2 排)

### P0
无。

### P1 · Whisper helper 缺失时提示旧环境变量 `SPLICE_WHISPER_SCRIPT`
- **分类**: 过时
- **位置**: `crates/videocut-transcribe/src/lib.rs:281`, `crates/videocut-transcribe/src/lib.rs:307`
- **问题**: resolver 实际读取 `VIDEOCUT_WHISPER_SCRIPT`，但最终错误信息提示用户设置 `SPLICE_WHISPER_SCRIPT`。这不是纯注释残留；缺脚本时会把排障导向错误变量。
- **证据**:
```rust
if let Ok(path) = std::env::var("VIDEOCUT_WHISPER_SCRIPT") { ... }

bail!("python/whisper_transcribe.py not found (set SPLICE_WHISPER_SCRIPT)")
```
- **建议**: 错误提示改成 `VIDEOCUT_WHISPER_SCRIPT`；顺手 grep `SPLICE_` / `splice` 保证运行时消息不再引用旧名。
- **代价**: 低。

### P1 · clips guide 仍指导 bare ffmpeg / no CLI，和当前 nf-source crate 脱节
- **分类**: 过时
- **位置**: `crates/nf-guide/flows/clips/02-plan.md:5`, `crates/nf-guide/flows/clips/03-cut.md:3`, `crates/nf-guide/flows/clips/03-cut.md:29`
- **问题**: 代码里已有 `nf-source download/transcribe/align/cut/preview`，但 clips guide 的 cut 步仍写 “bare ffmpeg” 和 “没有 nf-cli wrapper”。这会让 agent 绕过本次审查的 Rust pipeline，继续走旧 shell/jq 流程。
- **证据**:
```md
Code（ffmpeg + jq）· 你（Agent）直接跑 bare 命令 · 没有 nf-cli wrapper。

# 一次跑完 · 每个 clip 切一刀 + 合成 cut_report.json
```
- **建议**: guide 改为以 `nf-source cut` 为主路径，bare ffmpeg 只保留为调试 fallback；plan/cut 输出 schema 与 `videocut-core` 保持同一份口径。
- **代价**: 中。需要同步 clips prompt 文案和验收命令。

### P2 · 旧产品名 `splice` 仍出现在 core doc/test fixture
- **分类**: 过时
- **位置**: `crates/videocut-core/src/srt.rs:1`, `crates/videocut-core/src/cut_report.rs:1`, `crates/videocut-core/src/preview.rs:138`, `crates/videocut-core/src/preview.rs:151`
- **问题**: `videocut-core` 的模块说明仍写 `splice import` / `splice cut`，preview 测试 fixture 也用 `splice` 文本。它们不影响运行，但会污染当前 `nf-source` / `videocut` 命名。
- **建议**: 模块 doc 改成 `videocut` / `nf-source` 当前语义；测试文本换成中性 fixture。
- **代价**: 低。

### P2 · 公开 pass-through API 当前无外部调用点
- **分类**: dead code / 废抽象
- **位置**: `crates/videocut-transcribe/src/lib.rs:151`, `crates/videocut-transcribe/src/lib.rs:156`, `crates/videocut-cut/src/lib.rs:100`
- **问题**: `videocut_transcribe::extract_audio()` 和 `duration_seconds()` 只是包一层 `videocut-core`，`rg` 未找到 `nf-source + videocut-*` 内调用点；`cut_clip()` 是 `pub`，但当前只被 `cut_one()` 内部调用。这些 public API 会让 dead-code 审查误以为已有外部 contract。
- **证据**:
```rust
pub fn extract_audio(video: &Path, wav_path: &Path) -> Result<()> {
    extract_audio_to_wav(video, wav_path)
}

pub fn duration_seconds(path: &Path) -> Result<f64> {
    probe_duration(path)
}
```
- **建议**: 若不是稳定外部 API，改为 `pub(crate)` 或删除 pass-through；若要保留，补 doc 说明这是 crate public contract，而非 CLI 当前路径需要。
- **代价**: 低到中，取决于是否承诺外部 crate 使用。

### P2 · `Plan.bridges/skipped` schema 被解析和导出，但当前 pipeline 不消费
- **分类**: dead code
- **位置**: `crates/videocut-core/src/plan.rs:19`, `crates/videocut-core/src/plan.rs:21`, `crates/videocut-core/src/plan.rs:35`, `crates/videocut-core/src/plan.rs:43`, `crates/videocut-core/src/lib.rs:16`
- **问题**: `PlanBridge` / `PlanSkipped` 只在 schema 与 round-trip test 中出现；`cut` 只遍历 `plan.clips`，`preview` 只读 `cut_report.success`。当前 prompts 的 plan 示例也只要求 `clips`。这些字段属于未消费数据面，容易让生成 plan 的 agent 以为 bridge/skipped 会进入后续产物。
- **建议**: 若 bridge/skipped 只是给人读，doc 明确 “accepted but ignored by cut”；否则把它们写入 `cut_report` 或 preview manifest，使字段有下游用途。
- **代价**: 中。涉及 schema contract 取舍。

### P2 · `videocut-core` 同时 `pub mod` 和 `pub use`，内部边界过宽
- **分类**: 废抽象 / 其他
- **位置**: `crates/videocut-core/src/lib.rs:3`, `crates/videocut-core/src/lib.rs:13`
- **问题**: core crate 既公开所有模块，又在 crate root 重导出稳定类型/函数。当前调用方基本走 root re-export；宽 `pub mod` 会把 `media/python/time/srt` 等 helper 也变成外部可依赖入口，增加后续清 dead code / 改 helper 签名的兼容成本。
- **建议**: 保留 root re-export 作为稳定面；不需要外部路径的模块改 `pub(crate)` 或 `mod`。如果要开放模块路径，补 “module path is stable” 的明确承诺。
- **代价**: 中。可能是 breaking API，但 v0.4.2 阶段成本可控。

### P2 · ffmpeg / timing 策略常量散落，部分 magic number 未命名
- **分类**: 其他 / magic number
- **位置**: `crates/videocut-core/src/media.rs:17`, `crates/videocut-core/src/media.rs:20`, `crates/videocut-transcribe/src/audio.rs:20`, `crates/videocut-transcribe/src/audio.rs:23`, `crates/videocut-transcribe/src/lib.rs:215`, `crates/videocut-cut/src/lib.rs:103`, `crates/videocut-cut/src/lib.rs:115`, `crates/videocut-cut/src/lib.rs:125`, `crates/videocut-cut/src/lib.rs:129`, `crates/videocut-cut/src/lib.rs:233`
- **问题**: `16000`、`44100`、`192k`、CRF `18`、pre-seek `1.0s`、overlap dedupe `0.05s`、preview text `40` chars 都是实际产品策略，但分散在命令构造中。`DURATION_TOLERANCE_SEC` 和 `CHUNK_MINUTES` 已命名，说明这里可以统一。
- **建议**: 提取成命名常量，如 `TRANSCRIBE_SAMPLE_RATE_HZ`, `CUT_AUDIO_SAMPLE_RATE_HZ`, `CUT_AUDIO_BITRATE`, `CUT_CRF`, `CUT_PRESEEK_SEC`, `WORD_DEDUPE_TOLERANCE_SEC`, `TEXT_PREVIEW_EDGE_CHARS`。
- **代价**: 低。

## 四类汇总

### dead code
- `#[allow(dead_code)]`: 0 处。
- 编译器/clippy dead/unused warning: 0 处。
- 可疑未消费 API: `videocut_transcribe::extract_audio`, `videocut_transcribe::duration_seconds`, `videocut_cut::cut_clip` 的 public 可见性。
- 可疑未消费 schema: `Plan.bridges`, `Plan.skipped`, `PlanBridge`, `PlanSkipped`。

### 过时
- 运行时错误残留: `SPLICE_WHISPER_SCRIPT`。
- 旧产品名残留: `splice import`, `splice cut`, preview fixture `splice`。
- clips guide 残留: 仍把 cut 定义为 bare ffmpeg/jq 且写 “没有 nf-cli wrapper”。
- `v0.5` 历史引用: 主审代码未命中；仓库 `spec/devlog` 中有合法历史记录，不计入本报告问题。

### 废抽象
- `videocut_transcribe` 的 `extract_audio` / `duration_seconds` 是对 `videocut-core` 的一行 pass-through，当前 CLI 路径无调用点。
- `videocut-core` 的 root re-export + 全量 `pub mod` 双入口让 helper 边界偏宽。

### 其他清洁
- TODO / FIXME / HACK / XXX: 主审代码 0 命中。
- magic number: media 编码、采样率、preseek、dedupe tolerance、preview 截断长度应命名。
- `videocut-download::civil_from_days` 内部有标准日历算法数字；已有单测且作用域局部，本次不列 finding，但建议后续若引入时间库可替换。

## 亮点(好的清洁状态 · 别改)
- `cargo check -p nf-source --all-targets` 通过且无 warning。
- `cargo clippy -p nf-source --all-targets -- -W dead_code -W unused` 通过且无 warning。
- `nf-source` CLI 层很薄，命令分发没有明显 unused import / dead branch。
- `DURATION_TOLERANCE_SEC`, `CHUNK_MINUTES`, `OVERLAP_SECONDS` 已经是正确方向，后续常量清理可沿用这个风格。

## 命令记录
```bash
rg -n "#\\[(allow|expect)\\((dead_code|unused|unused_.*)|TODO|FIXME|HACK|XXX|v0\\.5|v1\\.|splice|SPLICE" crates/nf-source crates/videocut-* crates/nf-guide/flows/clips -S
cargo check -p nf-source --all-targets
cargo clippy -p nf-source --all-targets -- -W dead_code -W unused
cargo test -p nf-source --all-targets
rg -n "videocut_transcribe::(extract_audio|duration_seconds)|cut_clip\\(|bridges|skipped|PlanBridge|PlanSkipped" crates/nf-source crates/videocut-* -S
rg -n "\\b(0\\.05|1\\.0|18|40|16000|44100|192k)\\b" crates/nf-source/src crates/videocut-*/src -S
```

## 汇总
- P0 数: 0 / P1 数: 2 / P2 数: 5
- 分类数: dead code 2 / 过时 3 / 废抽象 2 / 其他 2
- 整体分(1-10): 8
