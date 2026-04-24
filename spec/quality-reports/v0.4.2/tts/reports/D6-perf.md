# D6 · nf-tts 性能风险审查

## 总评

`nf-tts` 当前瓶颈不在纯 Rust CPU，而在外部边界：WebSocket 无超时、Python/ffmpeg/ffprobe 子进程、cache key 语义不完整，以及 batch 并发只限制 synth 调用、不限制任务数量和后处理成本。

风险结论基于静态审查；已跑 crate 测试验证当前编译/测试状态。未跑 benchmark、未跑真实 TTS/WhisperX。

## Findings(按 P0/P1/P2)

### P0 · Edge WebSocket receive 没有超时，断线/半开连接可让 synth 和 batch 永久卡住

- **位置**: `crates/nf-tts/src/backend/edge/ws.rs:143-175`, `crates/nf-tts/src/backend/edge/ws.rs:177-205`, `crates/nf-tts/src/backend/edge/ws.rs:239-303`
- **问题**: Edge retry 只在 `synthesize_chunk()` 返回错误后触发，但 `stream.next().await` 外没有 `tokio::time::timeout`。如果服务端或网络进入半开状态、不发 `turn.end` 也不 close，当前 task 会无限等待；batch 中该 handle 也会阻塞后续 manifest/对齐处理。
- **建议**: 给 connect、首包、整体 chunk receive 分别设 timeout；timeout 应进入 retry 分类。batch 层还需要单 job 总超时，避免一个卡死 job 阻塞整批收尾。
- **代价**: 中。

### P0 · Volcengine 并发 synth 使用进程级固定临时文件名，`max_concurrency=2` 下会互相覆盖/删除

- **位置**: `crates/nf-tts/src/backend/volcengine/mod.rs:62-64`, `crates/nf-tts/src/backend/volcengine/mod.rs:112-120`, `crates/nf-tts/src/backend/volcengine/audio.rs:42-60`, `crates/nf-tts/src/backend/volcengine/audio.rs:71-93`
- **问题**: `get_audio_duration_ms()` 写 `/tmp/vox-dur-{pid}.mp3`，`detect_sentence_boundaries()` 写 `/tmp/vox-sil-{pid}.mp3`。batch 允许同一进程内 2 个 Volcengine job 并发，两个 job 会共享同一个 tmp path，可能发生 A 覆盖 B、B 删除 A、ffprobe/ffmpeg 读到错误音频或文件不存在。
- **建议**: 临时文件名加入 UUID/job id，或使用 `NamedTempFile`；同时把 ffprobe/ffmpeg 结果错误显式计入 job error，不要静默 fallback 掩盖竞态。
- **代价**: 低。

### P0 · cache key 漏掉 backend 和 Volcengine 语义参数，会产生“高命中率但错音频”

- **位置**: `crates/nf-tts/src/cache/mod.rs:17-20`, `crates/nf-tts/src/cli/synth.rs:135-141`, `crates/nf-tts/src/queue/scheduler.rs:52-58`, `crates/nf-tts/src/queue/scheduler.rs:127-135`, `crates/nf-tts/src/backend/mod.rs:36-56`
- **问题**: key 只包含 `text/voice/rate/pitch/volume`。Volcengine 的 `emotion`、`emotion_scale`、`speech_rate`、`loudness_rate`、`volc_pitch`、`context_text`、`dialect` 都不参与 key，backend 名也不参与 key。结果是不同语义请求可能命中同一个 mp3，表现为 cache hit 率好看但产物错误。
- **建议**: key 输入改为规范化后的完整 `SynthParams + backend + cache schema version`。改 key schema 时建议隔离旧 cache，避免旧错误条目继续命中。
- **代价**: 低-中。

### P1 · batch 对所有未命中 job 直接 `tokio::spawn`，并发只限制网络 synth，不限制任务数量和内存

- **位置**: `crates/nf-tts/src/queue/scheduler.rs:38-40`, `crates/nf-tts/src/queue/scheduler.rs:65-93`, `crates/nf-tts/src/queue/scheduler.rs:118-123`
- **问题**: 每个未命中 job 都创建 task，task 内再等 semaphore。大 batch 会持有所有 job text、params、path、backend Arc 和 JoinHandle；实际网络并发被限制，但 runtime task 数、调度成本和内存没有上限。
- **建议**: 改为 bounded work queue / `buffer_unordered(max_total_inflight)`。如果要保留 per-backend limit，可用全局 inflight 上限叠加 per-backend semaphore。
- **代价**: 中。

### P1 · batch 没有 in-flight cache 去重，重复文本会并发 miss 后重复请求外部 TTS

- **位置**: `crates/nf-tts/src/queue/scheduler.rs:52-89`, `crates/nf-tts/src/queue/scheduler.rs:92-116`, `crates/nf-tts/src/queue/scheduler.rs:127-135`
- **问题**: cache 只在 spawn 前查一次。批里多个相同 key 如果同时 miss，会全部进入 synth，最后再各自写同一个 cache 文件。短文本批量生成时，这会直接放大 WS 连接数、外部服务成本和尾延迟。
- **建议**: 增加 per-key singleflight：同 key 第一个 job synth，后续 job await 结果并复制输出；cache 写入用临时文件 + atomic rename。
- **代价**: 中。

### P1 · WhisperX 每次对齐都启动 Python 进程并重新 import/load model；batch 后处理还是串行

- **位置**: `crates/nf-tts/src/whisper/mod.rs:40-59`, `crates/nf-tts/src/whisper/aligner.rs:47-65`, `crates/nf-tts/scripts/align_ffa.py:192-219`, `crates/nf-tts/scripts/align_ffa.py:232-240`, `crates/nf-tts/src/queue/scheduler.rs:121-162`
- **问题**: `align_audio()` 是同步函数，内部 `python3 align_ffa.py` + `wait_with_output()` 无超时。Python 脚本每次 import `whisperx`、load audio、load align model、CPU align。batch 的 synth 可以并发，但 handle 收集后对齐在 Rust 主流程里逐个执行，N 个 job 会产生 N 次 Python 冷/温启动成本。
- **建议**: 短期加 align timeout、并把 alignment 放到 `spawn_blocking` 或独立 bounded worker。中期做 Python worker/pool 或 timeline cache；cache hit 时优先复用 timeline/srt/karaoke 产物，而不是只复用 mp3。
- **代价**: 中-高。

### P1 · WebSocket 连接没有复用；短文本 batch 会被握手成本主导，Volcengine 还缺 retry/reconnect

- **位置**: `crates/nf-tts/src/backend/edge/ws.rs:105-130`, `crates/nf-tts/src/backend/edge/ws.rs:181-205`, `crates/nf-tts/src/backend/volcengine/client.rs:26-46`
- **问题**: Edge 每个 chunk 建一次 WS，长文本 chunks 串行处理；Volcengine 每个 synth 建一次 WS。短句 batch 下，TLS/WS 握手、UUID/header 构造和服务端 session 建立可能比音频生成更显著。Edge 有字符串匹配式 retry，Volcengine 只有整体 timeout，没有 retry/reconnect。
- **建议**: 先度量连接耗时占比。若协议允许，做 backend client 级连接/session 复用；否则至少加连接阶段 telemetry、Volcengine retry、Edge chunk timeout，并对短文本 batch 做 singleflight 去重。
- **代价**: 中-高，取决于服务端协议是否允许复用。

### P1 · Volcengine 音频后处理同步调用 ffprobe/ffmpeg，且一次请求可能触发多次子进程

- **位置**: `crates/nf-tts/src/backend/volcengine/mod.rs:98-120`, `crates/nf-tts/src/backend/volcengine/audio.rs:41-68`, `crates/nf-tts/src/backend/volcengine/audio.rs:70-131`
- **问题**: synth 的网络部分有 timeout，但后面的 `get_audio_duration_ms()` / `detect_sentence_boundaries()` 使用阻塞 `std::process::Command::output()`。多句文本会跑 ffmpeg silencedetect，函数内又调用一次 ffprobe 获取总时长；这发生在 async runtime worker 上。
- **建议**: 放入 `spawn_blocking`；合并 duration 探测，避免同一 audio 重复 ffprobe；为子进程加 timeout。
- **代价**: 中。

### P2 · cache hit 只复用 mp3，不复用 timeline/srt/karaoke，字幕场景的 hit 率收益被削弱

- **位置**: `crates/nf-tts/src/cli/synth.rs:142-175`, `crates/nf-tts/src/queue/scheduler.rs:65-88`, `crates/nf-tts/src/queue/scheduler.rs:137-162`
- **问题**: `synth --srt` 即使命中 mp3 cache，仍会重新跑 WhisperX、重写 timeline/srt/karaoke。batch cache hit 路径只复制 mp3 并直接 done，不会生成字幕产物；miss 路径也只写 timeline/srt，没有 karaoke。
- **建议**: cache 维度区分 audio artifact 与 alignment artifact；timeline/srt/karaoke 可按 `audio cache key + original text + voice + aligner version` 缓存/复用。顺便对齐 batch 文档和实现。
- **代价**: 中。

### P2 · karaoke HTML 生成是多次全量序列化/复制，长 timeline 下成本可见

- **位置**: `crates/nf-tts/src/output/karaoke.rs:26-35`, `crates/nf-tts/src/whisper/timeline.rs:24-28`, `crates/nf-tts/src/whisper/timeline.rs:245-264`
- **问题**: Timeline 同时保存 flat `words` 和 nested `segments[*].words`，`build_timeline()` 会 clone 出一份 flat words；写 JSON 用 pretty serialize，写 karaoke 又 compact serialize 一遍；HTML 模板使用两次 `.replace()`，每次复制整份模板/中间字符串。
- **建议**: 对长音频优先避免重复结构或让 karaoke 只嵌入一种 word 数据；HTML 写入可改为 streaming writer：先写模板前缀，再写 JSON，再写后缀。
- **代价**: 低-中。

### P2 · Edge/Volcengine hotpath 分配较多，但大多不是当前首要瓶颈

- **位置**: `crates/nf-tts/src/backend/edge/ssml.rs:20-25`, `crates/nf-tts/src/backend/edge/ssml.rs:57-108`, `crates/nf-tts/src/backend/edge/ws.rs:210-233`, `crates/nf-tts/src/backend/edge/ws.rs:246-297`, `crates/nf-tts/src/backend/volcengine/client.rs:83-138`, `crates/nf-tts/src/backend/volcengine/client.rs:221-223`
- **问题**: SSML escape 是连续 `replace()`；split 会 `clean_text()` 全量 collect，再为每个 chunk `to_string()`；Edge metadata 每条 parse 到 `serde_json::Value`，每个 boundary `to_string()`；Volcengine frame parse 对 audio payload `to_vec()` 后又 append 到聚合 Vec，存在一次额外 chunk copy。
- **建议**: 在解决 P0/P1 前不建议大改；后续可用 criterion/heap profiling 定量后再做 streaming escape、typed metadata struct、减少 Volcengine payload copy。
- **代价**: 中。

## hotpath 清单

| 热度 | 路径 | 分配/阻塞点 | 影响 |
|---|---|---|---|
| 每 Edge chunk | `edge/ws.rs:181-205` | 新 UUID、URL/header、TLS/WS connect | 短文本 batch 握手成本高；断线无 timeout。 |
| 每 Edge chunk | `edge/ssml.rs:20-25`, `edge/ws.rs:221-233` | XML escape 多次 `replace()` + SSML `format!` | 文本越长复制越多。 |
| 每 Edge metadata | `edge/ws.rs:246-278` | `serde_json::Value` parse + word `String` | word boundary 多时 allocation 明显。 |
| 每 Edge audio frame | `edge/ws.rs:287-297`, `edge/ws.rs:129` | audio chunk append；最终 all_audio 聚合 | 大音频 Vec 增长和复制。 |
| 每 Volcengine synth | `volcengine/client.rs:83-138` | `json!` tree、payload Vec、frame Vec | 请求构造成本固定。 |
| 每 Volcengine audio frame | `volcengine/client.rs:221-223`, `volcengine/client.rs:67-69` | payload `to_vec()` 后再 append | 每个音频包多一次拷贝。 |
| 每 Volcengine synth | `volcengine/audio.rs:42-68` | temp file + ffprobe subprocess | 同步阻塞 async worker；并发 tmp path 冲突。 |
| 多句 Volcengine | `volcengine/audio.rs:71-131` | temp file + ffmpeg + 再 ffprobe | 子进程成本高，且 tmp path 冲突。 |
| 每 uncached batch job | `queue/scheduler.rs:92-118` | 先 spawn 所有任务，任务内等 semaphore | 大 batch 任务数无上限。 |
| 每 cache key | `cache/mod.rs:17-20` | `format!` 拼接 key 输入 | 小成本；更大风险是 key 字段缺失。 |
| 每 alignment | `whisper/aligner.rs:47-65`, `scripts/align_ffa.py:192-240` | Python spawn/import/model load/CPU align | 字幕主瓶颈；无 timeout。 |
| 每 timeline | `whisper/timeline.rs:181-264` | segment Vec、word Vec、flat words clone | 长音频重复持有 word 数据。 |
| 每 karaoke | `output/karaoke.rs:26-35` | timeline serialize + 两次模板 replace + write | 长 timeline 下 HTML 生成成本可见。 |

## cache 命中率判断

- 当前 manifest 有 `total/synthesized/cached/errors`，可以粗算 batch hit rate，但没有按 backend、voice、key、artifact 类型拆分。
- 真实收益会被两点拉低：重复 miss 没有 singleflight；subtitle/karaoke 场景 cache hit 仍会重新跑 alignment。
- 当前 key 漏字段会制造 false hit，因此任何“高命中率”指标在修 key 前都不可信。

## 并发 synth 风险判断

- Edge: backend limit 是 3，但每个 job 内长文本 chunks 串行；无 receive timeout 是主要风险。
- Volcengine: backend limit 是 2，但 temp file 使用 pid，当前并发度已经足以触发竞态。
- batch: per-backend semaphore 只限制进入 `backend.synthesize()` 的数量，不限制 queued task 总量，也不限制 WhisperX/ffmpeg/ffprobe 后处理并发或阻塞。

## 汇总

- P0 数: 3
- P1 数: 5
- P2 数: 3
- 建议优先级: 先修 Edge timeout、Volcengine tmp file、cache key；再做 batch bounded queue/singleflight；最后再优化 karaoke/SSML/metadata 分配。

## 验证

- `cargo test -p nf-tts --all-targets`
- 结果: 通过。`src/lib.rs` 8 passed；`src/main.rs` 41 passed；`tests/smoke.rs` 1 passed。
