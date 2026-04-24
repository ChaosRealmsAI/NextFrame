# D3 · nf-tts 测试覆盖审查

## 总评

结论：**当前 D3 覆盖不达标，主要缺口在 integration 覆盖与关键 I/O / 网络边界。**

`cargo test -p nf-tts` 当前通过：`50` 个测试通过，`0` failed，`0` ignored。其中 `49` 个是源码内 unit tests，只有 `1` 个 `tests/` integration test。外部 `tests/` 只有 `crates/nf-tts/tests/smoke.rs` 一份、`83` 行；相对 `src/**/*.rs` `5397` 行，`tests/` 对源比例约 `1.54%`（若把 `src/output/karaoke_template.html` 也算入源产物，比例约 `1.46%`）。这说明 crate 目前主要靠内联 unit tests，而不是端到端或跨模块测试约束真实 CLI 行为。

辅助验证：

- `cargo test -p nf-tts -- --list`：列出 `50` 个可运行测试；`src/lib.rs` 8 个，`src/main.rs` 41 个，`tests/smoke.rs` 1 个，doc tests 0 个。
- `cargo test -p nf-tts`：通过，`50 passed; 0 ignored`。
- `rg -n "#\\[ignore\\]" crates/nf-tts/src crates/nf-tts/tests`：无命中。
- `rg -c "#\\[(tokio::)?test\\]" crates/nf-tts/src crates/nf-tts/tests`：静态可见 `67` 个 test 标记；其中 `17` 个在未挂载的 `src/whisper/{align.rs,parse.rs,process.rs}` 旧文件内，实际没有进入测试清单。

## 覆盖矩阵

| 区域 / 关键路径 | 源码范围 | 当前测试 | integration vs unit / ignored | 覆盖判断 | 优先级 |
|---|---:|---|---|---|---|
| 全量 `nf-tts` | `src/**/*.rs` 5397 行；`tests/**/*.rs` 83 行 | 可运行 50 个；静态 test 标记 67 个 | 49 unit / 1 integration / 0 ignored；`tests/` 对源约 1.54% | 外部集成面过薄，不能代表 CLI / backend / output 真实路径 | P1 |
| `synth` 单条合成 | `src/cli/synth.rs:37` | 仅 `SynthArgs -> SynthCommand` 与 flat/subdir 两个 unit tests | 2 unit / 0 integration / 0 ignored | 未测 text/file/stdin 输入、backend factory、cache hit/miss、sidecar 生成、event 输出、写文件失败 | P1 |
| backend Edge | `backend/edge/{drm,ssml,ws}.rs` | `drm` 2 个格式测试，`ssml` 2 个纯函数测试 | 4 unit / 0 integration / 0 ignored | `ws.rs` 的 voices REST、WebSocket 收发、retry、metadata JSON、binary frame 解析完全无测试 | P1 |
| backend Volcengine | `backend/volcengine/{mod,client,audio}.rs` | 无可运行测试 | 0 unit / 0 integration / 0 ignored | 请求 JSON、二进制 frame encode/decode、错误 frame、ffprobe/ffmpeg helper、voice filter、empty audio 都未覆盖 | P1 |
| whisper / alignment | `whisper/mod.rs`, `aligner.rs`, `timeline.rs` | `timeline.rs` 22 个纯函数/schema unit tests | 22 unit / 0 integration / 0 ignored；另有 17 个旧文件 tests 未编译 | timeline 覆盖较好，但 `align_audio -> aligner::run_ffa -> python3 align_ffa.py` subprocess 边界无测试；旧测试文件造成虚假覆盖感 | P1 |
| cache | `cache/mod.rs` | 仅被 smoke / scheduler 间接触达，且没有 cache-hit 断言 | 0 direct unit / 0 integration / 0 ignored | `Cache::key/get/put`、目录创建、命中复制、参数隔离均未直接约束；D1/D2 的 cache key 漏参风险没有测试兜底 | P1 |
| output bundle | `output/{manifest,event,karaoke,naming,srt}.rs` | manifest 8 个 lib tests 间接覆盖；naming 4、srt timestamp 1、karaoke 2 | unit 为主 / smoke 1 个 manifest round-trip / 0 ignored | 单件纯函数尚可；`Event` 无测试，`write_srt` 文件内容无完整断言，`synth` 与 `batch` 的 timeline+srt+karaoke bundle 没有统一集成测试 | P2 |
| batch / queue | `cli/batch.rs`, `queue/{job,scheduler}.rs` | batch helper 4 个，scheduler mock backend 2 个 | 6 unit-ish / 0 external integration / 0 ignored | 有 mock backend 基础覆盖，但未测 JSON file/stdin/dry-run、cache hit、gen_srt、manifest 写盘、CLI 入口；`Job::to_synth_params` 无直接参数矩阵 | P2 |
| CLI 其他命令与配置 | `args.rs`, `play.rs`, `preview.rs`, `voices.rs`, `concat.rs`, `config_cmd.rs`, `config.rs`, `lang.rs` | config/alias 经 `lib.rs` 和 smoke 部分覆盖 | unit 零散 / 0 command integration / 0 ignored | Clap 解析、help flag、config set/get save/load 错误、lang auto voice、play/preview player 检测、voices backend 选择、concat 输出均缺少测试 | P2 |

## P0 Findings

无。当前没有发现“测试套件失效、关键测试被 ignore、或 `cargo test -p nf-tts` 无法运行”级别问题。

## P1 Findings

### P1-1 · 外部 integration 覆盖几乎不存在，`synth` 真实主路径没有被测试

位置：`crates/nf-tts/tests/smoke.rs:42`, `crates/nf-tts/src/cli/synth.rs:37`, `crates/nf-tts/src/cli/synth.rs:248`

唯一 integration test 只覆盖 `VoxConfig` alias 与 `Manifest::write_to()` round-trip。`synth::run()` 的核心路径没有 integration 测试：文本来源、默认目录、backend 选择、voice auto-detect、cache hit/miss、`backend.synthesize()`、mp3 写盘、`--no-sub` / `gen_srt`、timeline/srt/karaoke 产物、stdout event 都未被跨模块验证。当前 `cli::synth` 的两个 unit tests 只断言 flat/subdir 参数映射。

建议：先把 `lib.rs` 模块面整理到能注入 mock backend / temp config，再补 `synth` integration：cache miss 写 mp3、第二次 cache hit、`--no-sub` 不产 sidecar、mock aligner 产 timeline/srt/karaoke、backend 错误返回非零。

### P1-2 · backend 协议层缺少纯函数测试和 mock 网络测试

位置：`crates/nf-tts/src/backend/edge/ws.rs:58`, `crates/nf-tts/src/backend/edge/ws.rs:105`, `crates/nf-tts/src/backend/edge/ws.rs:144`, `crates/nf-tts/src/backend/volcengine/client.rs:83`, `crates/nf-tts/src/backend/volcengine/client.rs:157`, `crates/nf-tts/src/backend/volcengine/audio.rs:41`

Edge 只有 token/SSML 纯函数测试，`ws.rs` 没有任何测试；Volcengine backend 没有可运行测试。最需要覆盖的是协议解析和错误分类：Edge metadata JSON、binary frame slicing、retryable vs non-retryable error；Volcengine send/finish frame、audio event frame、session finished、error frame JSON 提取、voice filter、empty text/audio。没有这些测试时，供应商协议轻微变化会直接落到用户运行时。

建议：先抽 `parse_audio_metadata`、`parse_binary_audio_frame`、Volcengine frame builder/parser 为私有纯函数并单测；再用 mock WebSocket / mock HTTP server 覆盖 happy path、timeout、malformed frame、服务端错误。

### P1-3 · whisper 实际入口没有 subprocess 边界测试，且旧文件测试未编译

位置：`crates/nf-tts/src/whisper/mod.rs:23`, `crates/nf-tts/src/whisper/mod.rs:40`, `crates/nf-tts/src/whisper/aligner.rs:12`, `crates/nf-tts/src/whisper/align.rs:57`, `crates/nf-tts/src/whisper/parse.rs:210`, `crates/nf-tts/src/whisper/process.rs:134`

`timeline.rs` 的 schema / segment 逻辑有 22 个 unit tests，覆盖较好；但 `align_audio()` 的真实链路会调用 `aligner::run_ffa()`，再 spawn `python3 scripts/align_ffa.py`，该边界没有测试。更糟的是目录里保留 `align.rs/parse.rs/process.rs` 旧实现，里面有 17 个 `#[test]` 标记，但 `whisper/mod.rs` 没有挂载这些模块，`cargo test -- --list` 不会运行它们。

建议：删除或归档未挂载旧文件，避免虚假覆盖；为 `VOX_ALIGN_SCRIPT` 注入 fake align script，覆盖 success JSON、empty units、non-zero exit、invalid UTF-8/JSON、missing script，以及 `align_audio` 空文本不 spawn 的路径。

### P1-4 · cache 关键行为没有直接测试，无法兜住错误复用音频风险

位置：`crates/nf-tts/src/cache/mod.rs:10`, `crates/nf-tts/src/cli/synth.rs:135`, `crates/nf-tts/src/queue/scheduler.rs:52`

`Cache::new/key/get/put` 没有 direct unit tests；scheduler tests 使用了 cache，但只走 miss -> put，不断言后续 hit，也不覆盖 synth cache copy。D1/D2 已指出 cache key 没包含 backend 和 Volcengine 专属参数，当前测试套件没有任何用例能发现“同 text/voice 但 emotion/context/dialect 不同却命中旧 mp3”的问题。

建议：补 cache key 参数矩阵测试，至少包含 backend、voice、rate/pitch/volume、emotion、speech_rate、context_text、dialect；再补 batch/synth cache hit integration，断言 backend 不被二次调用且输出来自 cache。

## P2 Findings

### P2-1 · output 单件有测试，但 sidecar bundle 没有端到端约束

位置：`crates/nf-tts/src/output/event.rs:19`, `crates/nf-tts/src/output/srt.rs:8`, `crates/nf-tts/src/output/karaoke.rs:17`, `crates/nf-tts/src/queue/scheduler.rs:137`

`naming`、`srt` timestamp、`karaoke` 基本 HTML 替换已有 unit tests，但 `Event` JSON shape 未测，`write_srt()` 没有完整文件内容/空 boundaries 测试，manifest failure serialization 只在 scheduler 间接覆盖。更关键的是 `synth` cache hit/miss 和 `batch` sidecar bundle 没有统一 integration，导致“batch 不产 karaoke”这类行为不会被测试发现。

建议：抽 sidecar bundle 后用 temp dir + fake timeline 覆盖 timeline JSON、SRT、karaoke 三件套；补 event JSON snapshot / serde value 断言。

### P2-2 · CLI parser、config、辅助命令缺少命令级测试

位置：`crates/nf-tts/src/cli/args.rs:8`, `crates/nf-tts/src/config.rs:29`, `crates/nf-tts/src/cli/config_cmd.rs:5`, `crates/nf-tts/src/cli/play.rs:87`, `crates/nf-tts/src/cli/concat.rs:5`

当前没有 `assert_cmd` 或 `Cli::try_parse_from` 覆盖 clap 行为；`config::load()` 的文件存在但坏 TOML、`config_cmd set/get` 的 save/load、`lang` auto voice、`concat` 空输入/缺文件/输出目录、`play/preview` player 检测都没有测试。它们不是最核心的音频质量路径，但容易在 CLI 选项新增时回归。

建议：先补 parser-level unit tests，不必启动真实网络；config tests 应隔离 `XDG_CONFIG_HOME` / temp config dir，避免污染用户配置。

### P2-3 · 缺少覆盖率度量和 CI 门槛，测试数量容易被未编译旧文件误导

位置：`crates/nf-tts/src/whisper/mod.rs:23`, `crates/nf-tts/src/whisper/align.rs:33`, `crates/nf-tts/src/whisper/parse.rs:206`, `crates/nf-tts/src/whisper/process.rs:130`

本次只能用 `cargo test -- --list` 与静态检索审计覆盖形态；仓库内没有看到 `cargo llvm-cov` / tarpaulin 报告或 D3 覆盖阈值。静态 test 标记是 67 个，但实际可运行只有 50 个，差值来自未编译旧文件，说明单看 `rg "#[test]"` 会高估覆盖。

建议：在 CI 中加入 `cargo test -p nf-tts --all-targets` 与覆盖报告；D3 口径应以 `cargo test -- --list` 和 coverage 工具为准，同时清理未挂载测试文件。

## 汇总

- P0 数：0
- P1 数：4
- P2 数：3
- `tests/` 对源比例：`83 / 5397 = 1.54%`（仅 Rust 源）；`83 / 5694 = 1.46%`（含 HTML 模板）。
- integration vs unit：`1` 个 integration，`49` 个 unit，`0` ignored，`0` doc tests。
- 关键路径覆盖结论：`whisper::timeline`、`output::naming`、`batch/scheduler` 的部分纯函数和 mock path 有基础覆盖；`synth` 真实路径、backend 协议、cache hit/miss、whisper subprocess、sidecar bundle、CLI parser/config 命令级行为仍是主要缺口。
