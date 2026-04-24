# D2 · nf-tts 代码质量审查

## 总评

结论：**有 P1 可靠性 / 正确性风险，建议修复后再视为质量达标**。

本轮只审查 `crates/nf-tts/` 内源码与 `Cargo.toml`。workspace lint 已对 `unwrap_used` / `expect_used` / `panic` / `unreachable` / `todo` 设为 `deny`，`nf-tts` 继承该配置；直接 `unwrap()` / `expect()` 命中均在测试模块或 integration test 中，未发现生产代码直接 panic 路径。`cargo clippy -p nf-tts --all-targets -- -D warnings` 通过，说明 deny lint 在当前 crate 可执行收口。FFI / unsafe 未在 `nf-tts` 中出现。

主要风险集中在 async 网络与音频辅助处理：Edge backend 的 REST / WebSocket 没有外层 timeout，网络半开或服务端不发 `turn.end` 时可能永久挂住；Volcengine 的音频时长 / 静音检测临时文件名只使用进程 id，在 batch 并发下会互相覆盖；缓存 key 没包含 backend 与 Volcengine 专属参数，可能复用到错误音频。音频探测失败目前也会静默降级，错误不能传到调用层。

辅助命令结果：

- `rg -n "unwrap\\(|expect\\(|panic!|unreachable!|todo!|unimplemented!|unsafe|extern \"C\"" crates/nf-tts/src crates/nf-tts/tests -g '*.rs'`：生产代码无直接 panic / unsafe；命中集中在 `#[cfg(test)]` / `tests/`。
- `cargo clippy -p nf-tts --all-targets -- -D warnings`：通过。
- `cargo test -p nf-tts`：通过，`50` 个测试通过。

## P0 Findings

无。

## P1 Findings

### P1-1 · Edge REST / WebSocket 无 timeout，网络半开会让 CLI 或 batch job 永久挂住

位置：`crates/nf-tts/src/backend/edge/ws.rs:67`

```rust
let client = reqwest::Client::new();
let resp = client
    .get(&url)
    ...
    .send()
    .await?;
```

位置：`crates/nf-tts/src/backend/edge/ws.rs:205`

```rust
let (ws_stream, response) = connect_async(request).await?;
```

位置：`crates/nf-tts/src/backend/edge/ws.rs:239`

```rust
while let Some(msg) = stream.next().await {
```

Edge backend 对 `reqwest::Client` 没有 configured timeout，对 `connect_async`、发送 speech config / SSML、接收 `stream.next()` 也没有 `tokio::time::timeout`。重试逻辑只在 `synthesize_chunk()` 返回错误后触发；如果 TCP/TLS/WebSocket 半开、服务端接受连接但不发送 `turn.end`、或 REST voice list 卡住，future 不会返回错误，batch 中对应 job 会一直占住 semaphore permit，整体命令也可能无法结束。

建议：给 REST client 设置 connect/read/overall timeout；给 Edge `synthesize_chunk` 包一层 per-chunk deadline，并区分 connect、send、first-byte、turn.end deadline。timeout 错误应进入现有 retry wrapper，并在最终错误中带 backend、chunk index、attempt 信息。

### P1-2 · Volcengine 音频探测临时文件只用 PID 命名，batch 并发会互相覆盖

位置：`crates/nf-tts/src/backend/volcengine/mod.rs:62`

```rust
fn max_concurrency(&self) -> usize {
    2
}
```

位置：`crates/nf-tts/src/queue/scheduler.rs:92`

```rust
let handle = tokio::spawn(async move {
```

位置：`crates/nf-tts/src/backend/volcengine/audio.rs:43`

```rust
let tmp = std::env::temp_dir().join(format!("vox-dur-{}.mp3", std::process::id()));
```

位置：`crates/nf-tts/src/backend/volcengine/audio.rs:75`

```rust
let tmp = std::env::temp_dir().join(format!("vox-sil-{}.mp3", std::process::id()));
```

Volcengine backend 明确允许并发 `2`，scheduler 会为 batch job spawn 多个任务。`get_audio_duration_ms()` 与 `detect_sentence_boundaries()` 的临时 mp3 文件名只包含进程 id，因此同一进程内两个 Volcengine job 会写入同一路径。结果可能是 ffprobe / ffmpeg 读取到另一个 job 的音频、文件被另一个 job 删除，或 duration / boundary 与实际输出音频不匹配。由于调用层随后会静默 fallback 或 `unwrap_or_default()`，这类错误很难被用户发现。

建议：使用 `tempfile::NamedTempFile` 或至少加入 UUID / job id，并确保写入、探测、删除在同一唯一路径上完成。相关错误不要静默吞掉，应带路径、命令、exit status 传播或记录。

### P1-3 · cache key 漏掉 backend 与 Volcengine 专属参数，可能返回错误音频

位置：`crates/nf-tts/src/cache/mod.rs:18`

```rust
pub fn key(text: &str, voice: &str, rate: &str, pitch: &str, volume: &str) -> String {
    let input = format!("{text}\0{voice}\0{rate}\0{pitch}\0{volume}");
```

位置：`crates/nf-tts/src/cli/synth.rs:135`

```rust
let cache_key = Cache::key(
    &text,
    &params.voice,
    &params.rate,
    &params.pitch,
    &params.volume,
);
```

位置：`crates/nf-tts/src/queue/scheduler.rs:52`

```rust
let cache_key = Cache::key(
    &job.text,
    &params.voice,
    &params.rate,
    &params.pitch,
    &params.volume,
);
```

`SynthParams` 包含 `emotion`、`emotion_scale`、`speech_rate`、`loudness_rate`、`volc_pitch`、`context_text`、`dialect` 等 Volcengine 会改变输出音频的参数，但 cache key 只包含 Edge 的 rate / pitch / volume。相同 text + voice 下，用户第一次用 `--emotion news` 合成后，第二次改成 `--emotion happy` 或不同 `--context-text`，仍可能命中旧缓存。backend 名也不在 key 中，后续若出现同名 voice 或配置复用，会扩大误命中面。

建议：cache key 基于完整、稳定序列化的 `SynthParams` 加 backend name 生成；如果要保持兼容，可给 cache schema/version 加前缀，避免旧 key 与新 key 混用。

## P2 Findings

### P2-1 · 音频 duration / boundary 探测错误被静默降级，错误传播不完整

位置：`crates/nf-tts/src/backend/volcengine/audio.rs:62`

```rust
output
    .ok()
    .and_then(|command| String::from_utf8(command.stdout).ok())
    .and_then(|stdout| stdout.trim().parse::<f64>().ok())
    .map(|secs| (secs * 1000.0) as u64)
    .unwrap_or_else(|| (audio.len() as u64) * 1000 / 16000)
```

位置：`crates/nf-tts/src/backend/volcengine/mod.rs:112`

```rust
let boundaries = if sentences.len() > 1 {
    detect_sentence_boundaries(&audio, &sentences).unwrap_or_default()
} else {
    Vec::new()
};
```

`ffprobe` spawn 失败、非零退出、stderr 报错、stdout 非数字都会变成基于 bytes 的粗略估算；`ffmpeg silencedetect` 失败则直接变成空 boundaries。对 CLI 用户来说命令仍成功，但 manifest duration、SRT/karaoke 对齐依据可能已经不可信。

建议：让 `get_audio_duration_ms()` 返回 `Result<u64>`，至少把 ffprobe/ffmpeg 的 spawn error、exit status、stderr 纳入 warning 或错误链。若业务上允许降级，也应在 manifest/event 中标记 `duration_estimated=true` 或输出明确 warning。

### P2-2 · Edge retry 依赖错误字符串 contains，分类脆弱且缺少上下文

位置：`crates/nf-tts/src/backend/edge/ws.rs:155`

```rust
let error_text = format!("{e:?}");
let is_retryable = error_text.contains("connection")
    || error_text.contains("Connection")
    || error_text.contains("timeout")
    || error_text.contains("Timeout")
    || error_text.contains("Io(")
    || error_text.contains("tungstenite");
```

当前 retry 判断绑定到 debug 字符串，库升级或不同平台错误文案变化后可能误判。最终错误也没有 chunk index、attempt、URL 阶段等上下文，排查 Edge 失败时只能看到底层 anyhow/tungstenite 信息。

建议：将 Edge transport 错误分层：connect/send/receive/protocol/empty-audio/metadata-parse。retry 依据 typed error 或 source chain 分类，并把 attempt、chunk length、request id 写入上下文。

### P2-3 · 配置读取失败静默回落默认值，会掩盖坏配置

位置：`crates/nf-tts/src/config.rs:31`

```rust
if path.exists() {
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| toml::from_str(&s).ok())
        .unwrap_or_default()
} else {
    Self::default()
}
```

配置文件存在但不可读、TOML 语法错误、字段类型错误都会退回默认配置，CLI 不提示用户。结果可能是 backend、voice alias、默认输出目录悄悄失效，并进一步触发错误 backend 或错误 voice 的合成请求。

建议：`load()` 返回 `Result<Self>`，调用层用 context 报出配置路径和解析错误；若需要兼容宽松模式，可只在文件不存在时默认，文件存在但坏掉时返回错误。

### P2-4 · Edge protocol metadata / binary frame 异常被忽略，边界数据失败不可见

位置：`crates/nf-tts/src/backend/edge/ws.rs:250`

```rust
if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_body) {
```

位置：`crates/nf-tts/src/backend/edge/ws.rs:288`

```rust
if data.len() < 2 {
    continue;
}
...
if header_len + 2 > data.len() {
    continue;
}
```

Edge audio metadata JSON 解析失败、字段缺失、binary frame header 异常都会被忽略。音频为空时最终会报错，但音频非空且 metadata 全丢时命令仍成功，`duration_ms` / boundaries 可能缺失或偏差，用户无法区分“服务端确实没给 metadata”和“解析失败”。

建议：记录一次性 warning 或把 metadata parse 状态放入 `SynthResult`；binary frame header 异常应至少计数并在结束时作为 protocol warning 暴露。

## 亮点

- workspace lint 对 `unwrap_used` / `expect_used` / `panic` / `unreachable` / `todo` 是 `deny`，`nf-tts` 继承配置且 clippy 全 target 通过。
- 生产代码未发现直接 `unsafe` / FFI / `extern "C"`。
- Volcengine 主请求有整体 timeout：`timeout(Duration::from_secs(timeout_secs), self.synthesize_inner(...))`，比 Edge path 更安全。
- `whisper::process::run_ffa()` 对 Python 子进程 spawn、exit status、UTF-8、JSON parse 都有 context，错误链质量明显好于音频 ffprobe/ffmpeg helper。
- batch manifest 会记录单 job failure，`ensure_batch_success()` 在有失败时返回非零错误，不会把部分失败伪装成整体成功。

## 汇总

- panic/unwrap/expect：生产路径通过；测试模块显式 allow，可接受。
- lint deny：已配置并经 clippy 验证通过。
- error handling：主流程多用 `anyhow::Result` 传播，但配置加载、cache put、音频探测、Edge metadata/protocol 警告存在静默吞错。
- async：Volcengine 有 overall timeout；Edge REST/WS 无 timeout 是主要阻塞风险。
- reqwest / tungstenite：错误能传播，但 Edge retry 分类和上下文不足。
- FFI：无。
- audio decoding / probing：没有库级 decode；依赖 ffprobe/ffmpeg，当前错误传播不完整，且并发临时文件命名有 P1 风险。
