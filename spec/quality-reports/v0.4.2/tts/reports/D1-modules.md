# D1 · nf-tts 模块拆分审查

## 总评

`nf-tts` 当前没有 Rust 编译层面的循环依赖，Edge / Volcengine / whisperX / output 的基本分目录已经成形；主要问题是公共 API 面与二进制真实模块树脱节，backend trait 抽象把不同供应商参数揉进同一个 `SynthParams`，并且 sidecar 输出逻辑散落在 CLI 与 batch scheduler 中，已经导致 cache 与 karaoke 行为不一致。

辅助验证：

- `cargo check -p nf-tts`：通过。
- 依赖方向静态观察：`main -> cli -> backend/cache/output/queue/whisper`，`queue -> backend/cache/output/whisper`，`output::karaoke -> whisper::timeline`，`whisper::timeline -> backend::WordBoundary`；未见可编译的模块环。

## Findings(按 P0/P1/P2 排)

### P0 · Cache key 没有覆盖 backend 与 Volcengine 专属参数，会静默复用错误音频

- **位置**: `crates/nf-tts/src/backend/mod.rs:26-57`, `crates/nf-tts/src/cache/mod.rs:17-20`, `crates/nf-tts/src/cli/synth.rs:135-141`, `crates/nf-tts/src/queue/scheduler.rs:52-58`, `crates/nf-tts/src/backend/volcengine/client.rs:83-123`
- **问题**: `SynthParams` 同时承载 Edge 的 `rate/volume/pitch` 和 Volcengine 的 `emotion/emotion_scale/speech_rate/loudness_rate/volc_pitch/context_text/dialect`，但 cache key 只包含 `text/voice/rate/pitch/volume`。Volcengine 请求实际会使用 emotion/context/dialect 等字段，两个不同风格请求可能命中同一缓存并返回旧音频；同时 key 也没有包含 `backend`，Edge 与 Volcengine 在同 voice/text 参数碰撞时也没有结构性隔离。
- **建议**: 把 backend 抽象改成可生成稳定 cache identity 的接口，例如 `Backend::cache_key_material(&SynthParams)` 或先拆 `SynthRequest { text, voice, backend, options }`，其中 `options` 是 `EdgeOptions | VolcengineOptions`。短期修正也至少应把 `backend_name` 与所有会影响合成结果的 provider 参数纳入 `Cache::key`。
- **代价**: 中。需要改 `Cache::key` 签名、`cli/synth` 与 `queue/scheduler` 调用点，并补缓存回归测试；外部 JSON schema 可保持不变。

### P1 · `lib.rs` 是一套窄 stub，和二进制真实模块树分裂

- **位置**: `crates/nf-tts/src/lib.rs:2-8`, `crates/nf-tts/src/main.rs:2-9`, `crates/nf-tts/tests/smoke.rs:4`
- **问题**: library target 只声明 `config` 和内联 `output::manifest`，仅导出 `VoxConfig/Manifest/ManifestEntry`；binary target 又在 `main.rs` 独立声明完整 `backend/cache/cli/lang/output/queue/whisper` 模块树。结果是集成测试只能测配置与 manifest，真实 TTS backend、trait、whisperX、karaoke、batch scheduler 都不是 `nf_tts` 的库 API，也无法从 integration test 直接复用。长期会出现“库测试绿，但二进制主路径未被库面约束”的维护偏差。
- **建议**: 让 `lib.rs` 成为唯一模块根：声明真实模块树，内部实现用 `pub(crate)`，只 re-export 稳定入口，例如 `run_cli`、`Backend`/`SynthParams`/`SynthResult`、`VoxConfig`、`Manifest`、`Timeline` 或更窄的 `synthesize` facade；`main.rs` 只负责 `Cli::parse()` 后调用库入口。
- **代价**: 中。需要调整模块可见性和若干 `crate::` 路径，但行为可以保持不变。

### P1 · `whisper` 目录保留未挂载的旧实现文件，模块职责不可信

- **位置**: `crates/nf-tts/src/whisper/mod.rs:23-24`, `crates/nf-tts/src/whisper/align.rs:6-25`, `crates/nf-tts/src/whisper/process.rs:42-94`, `crates/nf-tts/src/whisper/parse.rs:9-66`, `crates/nf-tts/src/whisper/timeline.rs:16-28`
- **问题**: 当前 `mod.rs` 只挂载 `aligner` 和 `timeline`，但目录里仍有 `align.rs/process.rs/parse.rs` 这一套旧实现。旧 `parse.rs` 定义了另一份 `Timeline` schema，只有 `segments`，`TimelineWord` 字段还是 `word`；新 `timeline.rs` 已经是 `duration_ms/voice/words/segments` 双 schema。旧文件不参与编译，容易让 reviewer 或后续修改者误以为它们仍是模块边界的一部分。
- **建议**: 删除旧文件，或移动到 `tests/fixtures/legacy`/文档归档；如果需要保留迁移参考，应在 `whisper/mod.rs` 明确标注不编译的历史来源，并避免同目录同名职责文件并存。
- **代价**: 低。纯清理为主；若担心误删，可先用 `cargo check -p nf-tts --all-targets` 验证无引用。

### P1 · sidecar 输出职责散落，导致 batch 路径不生成 karaoke

- **位置**: `crates/nf-tts/src/cli/args.rs:140-143`, `crates/nf-tts/src/cli/synth.rs:149-170`, `crates/nf-tts/src/cli/synth.rs:184-207`, `crates/nf-tts/src/queue/scheduler.rs:137-161`, `crates/nf-tts/src/output/karaoke.rs:17-37`
- **问题**: CLI help 写明 batch 每个 job 产出 `{filename}.mp3 + .timeline.json + .srt + .karaoke.html`，但 batch scheduler 只写 timeline 和 srt，没有调用 `write_karaoke_html`。同一段“align -> write timeline -> write srt -> write karaoke”在 `synth.rs` 的 cache miss/cache hit 路径重复，batch 又实现了一个少功能版本。模块边界上，sidecar bundle 不是 CLI 或 scheduler 私有职责。
- **建议**: 抽 `output::sidecars::write_timed_sidecars(audio_path, text, voice, options)` 或 `subtitle::generate_bundle`，统一处理 whisperX alignment、timeline JSON、SRT、karaoke HTML 和错误降级。`synth` 与 `scheduler` 只决定是否启用 sidecar，不直接拼步骤。
- **代价**: 中。需要移动逻辑并补 batch 生成 karaoke 的测试；可顺便统一 cached/non-cached duration 处理。

### P1 · backend trait 太薄，能力/配置/参数校验都泄漏到调用方和文档

- **位置**: `crates/nf-tts/src/backend/mod.rs:103-122`, `crates/nf-tts/src/backend/edge/ssml.rs:5-16`, `crates/nf-tts/src/backend/volcengine/client.rs:83-123`, `crates/nf-tts/src/backend/volcengine/mod.rs:13-16`, `crates/nf-tts/src/cli/args.rs:87-90`
- **问题**: `Backend` 只有 `max_concurrency/list_voices/synthesize`，但没有 `name/capabilities/default_voice/validate_params/cache_key_material`。调用方可以把 Volcengine-only 参数传给 Edge，也可以把 Edge-only prosody 传给 Volcengine；当前 CLI 文档只能说明“Edge ignores silently”。Volcengine backend 还在构造函数内读取 env 并带硬编码默认凭证/resource，配置来源与 backend factory 绑死。
- **建议**: 给 backend 增加能力描述和参数校验层，或拆成 `BackendSpec` + typed options。`create_backend` 接收显式 config，避免 backend 自己读环境和默认 token；CLI/Job 先解析为 provider-specific request，再交给 trait。
- **代价**: 中/高。会触及 CLI args、batch job schema、config 和 backend factory；可以先加非破坏性 `capabilities()` 与 `validate()`，再逐步拆 options。

### P2 · `WordBoundary` 放在 backend 层，让 output/whisper 反向依赖 TTS backend 概念

- **位置**: `crates/nf-tts/src/backend/mod.rs:87-100`, `crates/nf-tts/src/output/srt.rs:6-20`, `crates/nf-tts/src/whisper/timeline.rs:7-58`, `crates/nf-tts/src/backend/volcengine/audio.rs:7-8`
- **问题**: `WordBoundary` 目前既表示 backend 原生边界，也表示 whisperX timeline 转出的字幕 segment。`output::srt` 和 `whisper::timeline` 因此都依赖 `crate::backend`，把通用 timed text model 放进供应商 backend 域里。它不是编译循环，但会让未来把 alignment/output 独立成库时先被 backend 类型拖住。
- **建议**: 抽 `timing`/`subtitle` 域模型，例如 `TimedSpan { text, offset_ms, duration_ms }`；backend `SynthResult`、whisper `Timeline::to_boundaries`、srt writer 都依赖该中立模型。
- **代价**: 低/中。字段同构，主要是移动类型与改 import。

### P2 · Edge transport 文件承担 REST、WS、retry、metadata parser 多职责

- **位置**: `crates/nf-tts/src/backend/edge/ws.rs:57-102`, `crates/nf-tts/src/backend/edge/ws.rs:104-175`, `crates/nf-tts/src/backend/edge/ws.rs:177-312`, `crates/nf-tts/src/backend/edge/ws.rs:314-323`
- **问题**: `ws.rs` 同时负责 voices REST 请求、WebSocket frame 收发、重试策略、metadata JSON 解析、audio binary slicing、UA 生成和时钟偏差更新。文件不算巨大，但职责横跨 transport、protocol、domain mapping，后续调 Edge 协议时很容易把解析和网络重试一起改动。
- **建议**: 拆成 `voices.rs`、`protocol.rs`、`transport.rs` 或至少抽 `parse_audio_metadata`/`parse_binary_audio_frame` 为纯函数并单测；`ws.rs` 保持 orchestration。
- **代价**: 低/中。主要是私有函数移动，可保持 public surface 不变。

### P2 · Volcengine backend 混合协议帧、请求 JSON、音频后处理和外部进程依赖

- **位置**: `crates/nf-tts/src/backend/volcengine/client.rs:52-81`, `crates/nf-tts/src/backend/volcengine/client.rs:83-148`, `crates/nf-tts/src/backend/volcengine/client.rs:157-229`, `crates/nf-tts/src/backend/volcengine/audio.rs:41-68`, `crates/nf-tts/src/backend/volcengine/audio.rs:70-196`
- **问题**: `client.rs` 既构造业务 JSON，又编码/解析二进制 event frame，还管理 WebSocket 收包循环；`audio.rs` 在 backend 内直接调用 `ffprobe/ffmpeg` 做时长与静音检测。这样 backend 的“远端协议”和“本地音频分析”绑在一起，也让 `SynthResult.boundaries` 的来源不清晰。
- **建议**: 拆 `protocol.rs` 负责 frame encode/decode，`request.rs` 负责 JSON payload，`audio_analysis.rs` 或上层 alignment service 负责 ffmpeg 依赖；如果 whisperX 是默认字幕来源，Volcengine silence boundary 可以降级为可选 fallback。
- **代价**: 中。协议拆分可纯移动，音频分析职责移动需要重新定义 fallback 策略。

### P2 · `lang.rs` 直接访问具体 backend 子模块默认 voice

- **位置**: `crates/nf-tts/src/lang.rs:2-20`, `crates/nf-tts/src/backend/mod.rs:2-3`, `crates/nf-tts/src/backend/volcengine/mod.rs:16`
- **问题**: `lang::auto_detect_voice_volcengine` 直接引用 `crate::backend::volcengine::DEFAULT_VOICE`，迫使 `backend::volcengine` 在 crate 内暴露，并把语言启发式和具体供应商模块常量耦合。当前可编译，但不是理想方向：voice policy 应该在 backend registry/capability 层或 config 层，而不是从 language helper 反向钻进 provider module。
- **建议**: 把默认 voice 解析移到 `backend::default_voice_for(backend, text)` 或 backend capability；`lang.rs` 只返回语言/locale 判断，不返回供应商 voice id。
- **代价**: 低。调用点集中在 `cli/synth.rs:87-97` 与 `cli/preview.rs:33-39`。

## 亮点(好的拆分 · 别改)

- `backend/edge/{drm,ssml,ws}.rs` 和 `backend/volcengine/{client,audio}.rs` 至少已经按供应商隔离，没有 Edge 与 Volcengine 代码互相 import。
- `whisper/mod.rs` 对外只暴露 `align_audio` 和 timeline 类型，当前新实现入口收口清楚。
- `output/{manifest,naming,srt,event,karaoke}.rs` 多数文件职责小，适合作为后续 `sidecars` facade 的底层构件。
- `queue/job.rs` 的 JSON job model 与 `queue/scheduler.rs` 分开是正确方向，后续可继续把 sidecar/cache 从 scheduler 中抽走。

## 汇总

- P0 数: 1
- P1 数: 4
- P2 数: 4
- 整体分(1-10): 6
- 循环依赖结论: 未发现 Rust 模块循环；主要是 domain model 放置不当造成的概念耦合，包括 `output -> whisper -> backend` 与 `scheduler -> output/whisper/backend/cache` 的中心化依赖。
