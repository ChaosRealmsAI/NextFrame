# D2 · nf-recorder 代码质量审查

## 总评

结论：**有 P1 阻塞风险，建议修复后再视为质量达标**。

本轮只审查 `crates/nf-recorder/` 内源码与 `Cargo.toml`。panic 路径整体干净：`unwrap()` / `expect(` / `panic!(` / `unreachable!(` / `todo!(` 均未命中，未发现绕过 `Result` 的直接 panic 路径。`thiserror` 枚举覆盖了 recorder / pipeline / snapshot / verify 的主要错误域，但 pipeline 层多处 FFI 状态码、`NSError`、writer error 被折叠成泛化错误，定位失败原因会比较困难。线程/异步方面，没有 `tokio::spawn` / `block_on`；主二进制使用 `#[tokio::main(flavor = "current_thread")]`，符合 `call_async` 主线程约束。最大风险在 orchestrator 子进程 stdout/stderr 使用 pipe 但父进程不持续消费，长录制时可能卡死。

辅助命令结果：

- `grep -rn "unwrap()" src/ | wc -l`：`0`
- `grep -rn "expect(" src/`：无命中
- `grep -rn "unreachable\|panic!\|todo!" src/`：无命中
- `cargo clippy -p nf-recorder --all-targets -- -D warnings 2>&1 | tail -30`：未能跑到 `nf-recorder` 自身，失败在 scope 外依赖 `nf-shell-mac` 的 `deprecated` 与 `dead_code` warning。

## P0 Findings

无。

## P1 Findings

### P1-1 · orchestrator 子进程 stdout/stderr pipe 未消费，长录制可能死锁

位置：`crates/nf-recorder/src/orchestrator.rs:155`

```rust
let child = Command::new(&self_exe)
    .arg(&cfg.bundle)
    .arg("-o")
    .arg(seg_path)
    .arg("--fps")
    .arg(&fps_str)
    .arg("--bitrate")
    .arg(&bitrate_str)
    .arg("--max-duration")
    .arg(&max_dur_str)
    .arg("--res")
    .arg(&res_str)
    .arg("--frame-range")
    .arg(&range_str)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| RecordError::PipelineError(format!("spawn segment {i}: {e}")))?;
```

位置：`crates/nf-recorder/src/orchestrator.rs:177`

```rust
for (i, start, end, mut child) in children {
    let status = child
        .wait()
        .map_err(|e| RecordError::PipelineError(format!("wait segment {i}: {e}")))?;
    if !status.success() {
        // 收 stderr 供 debug。
        let mut stderr_bytes = Vec::new();
        if let Some(mut s) = child.stderr.take() {
            use std::io::Read;
            let _ = s.read_to_end(&mut stderr_bytes);
        }
```

子进程是 `nf-recorder`，会向 stdout 发 JSON-Line 事件，包括逐帧 `RecordFrame`。父进程把 stdout/stderr 都设为 pipe，但只在 `wait()` 返回失败后读取 stderr，stdout 永远不读。若任一子进程输出超过 OS pipe buffer，子进程会阻塞在写 stdout/stderr，父进程阻塞在 `wait()`，形成死锁。该风险与视频时长、帧数、并行段数量正相关，属于并行录制路径的实际可靠性问题。

建议：若父进程不需要子进程事件，改为 `stdout(Stdio::null())` 并明确 stderr 策略；若需要诊断输出，应在 wait 前并发 drain stdout/stderr，或使用 `wait_with_output()` 但注意仍要避免 async current-thread runtime 上长期阻塞。

## P2 Findings

### P2-1 · pipeline FFI / AVAssetWriter 错误信息大量丢失，`thiserror` 变体过粗

位置：`crates/nf-recorder/src/pipeline/mod.rs:50`

```rust
#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("encoder init failed")]
    EncoderInitFailed,
    #[error("writer session failed")]
    WriterSessionFailed,
    #[error("frame out of order")]
    FrameOutOfOrder,
    #[error("timeout")]
    Timeout,
    #[error("io error: {0}")]
    IoError(String),
}
```

位置：`crates/nf-recorder/src/pipeline/vt_wrap.rs:285`

```rust
if status != 0 {
    return Err(PipelineError::EncoderInitFailed);
}
```

位置：`crates/nf-recorder/src/pipeline/mp4_writer.rs:96`

```rust
let writer = unsafe { AVAssetWriter::assetWriterWithURL_fileType_error(&url, file_type) }
    .map_err(|_e| PipelineError::WriterSessionFailed)?;
```

位置：`crates/nf-recorder/src/pipeline/mp4_writer.rs:149`

```rust
// SAFETY: appendSampleBuffer 消费 sample · 返回 true 成功, false 看 writer.error。
let ok = unsafe { input.appendSampleBuffer(&sample) };
if !ok {
    return Err(PipelineError::WriterSessionFailed);
}
```

当前错误链多数使用 `?` 正常传播，没有 `.unwrap()` 绕过；问题是传播前信息被丢弃。VT `OSStatus`、`VTSessionSetProperty` 失败的 key/status、`AVAssetWriter` 初始化返回的 `NSError`、`appendSampleBuffer=false` 后的 `writer.error` 都没有进入 `PipelineError`。这会让调用层只能看到 “encoder init failed” 或 “writer session failed”，难以区分参数不支持、格式描述错误、磁盘/权限、编码器拒绝等根因。

建议：保持 `thiserror`，但给 `PipelineError` 增加带上下文的变体或让现有变体携带 `String`，至少记录 FFI status code、失败阶段、关键参数；`AVAssetWriter` 路径应把 `NSError` / `writer.error` 的描述串入错误。

### P2-2 · `PipelineHevcMain` 的 `unsafe impl Send` 缺少 SAFETY 理由注释

位置：`crates/nf-recorder/src/pipeline/hevc.rs:19`

```rust
#[allow(unsafe_code)]
unsafe impl Send for PipelineHevcMain {}
```

同目录 H.264 pipeline 对等实现有完整注释说明 ObjC/CF 引用计数与单线程驱动约束，但 HEVC path 只有 `#[allow(unsafe_code)]`，没有解释为什么 `VtCompressor`、`Mp4Writer`、`Retained` 包装对象跨线程移动是安全的。考虑 workspace 对 unsafe 质量约束较强，这属于可维护性缺口：后续读者无法判断该 unsafe impl 是复制 H.264 约束、还是 HEVC 有额外保证。

建议：补齐 `// SAFETY:` 注释，说明它与 H.264 pipeline 相同：pipeline 只被单 recorder 线程驱动，ObjC/CF 对象只移动所有权，不并发 mutate。

### P2-3 · `SegQueue::is_empty()` + `push()` 不是 “只记录第一个错误”

位置：`crates/nf-recorder/src/pipeline/vt_wrap.rs:136`

```rust
struct VtCallbackState {
    output_queue: SegQueue<CompressedFrame>,
    /// Records only the first error to keep the queue bounded.
    first_error: SegQueue<String>,
    /// Holds source CVPixelBuffers until the matching VT callback fires.
    in_flight: Mutex<VecDeque<SendablePixelBuffer>>,
}
```

位置：`crates/nf-recorder/src/pipeline/vt_wrap.rs:153`

```rust
fn record_error(&self, message: String) {
    if self.first_error.is_empty() {
        self.first_error.push(message);
    }
}
```

`SegQueue::is_empty()` 与后续 `push()` 不是原子操作。多个 VT callback 并发报错时，多个线程都可能观察到 empty 并 push，注释里的 “only the first error / bounded” 不成立。通常错误数受帧数限制，不像无界后台 loop 那样无限增长，因此评为 P2；但这会影响错误队列边界假设和首错语义。

建议：如果确实只保留首错，可改成 `Mutex<Option<String>>`、`OnceLock<String>`，或用原子标记配合单次写入。

## 亮点

- panic 禁用执行得较好：直接 `unwrap()` / `expect()` / `panic!()` / `unreachable!()` / `todo!()` 未命中。
- `Mutex` poisoning 在 VT in-flight 队列中使用 `unwrap_or_else(|poisoned| poisoned.into_inner())`，不会因 poisoning 直接 panic。
- `Retained::from_raw`、`CFRetained::retain`、IOSurface lock/unlock、CMBlockBuffer malloc/free 路径大多有局部 SAFETY 注释，生命周期意图清楚。
- `call_async` 主线程约束在二进制入口和 `record_loop` / `snapshot` 注释中有明确约束，主入口实际使用 current-thread tokio runtime。

## 汇总

- panic 路径：通过，直接禁用项无命中。
- error handling：有改进项，pipeline 层错误枚举与映射过粗，丢 FFI/ObjC 诊断信息。
- thread safety：VT in-flight `Mutex` 基本合规；orchestrator 子进程 pipe 未消费存在死锁风险。
- async 风险：无 `tokio::spawn` / `block_on`；主线程 runtime 符合约束，但 async orchestrator 内部存在阻塞 wait。
- FFI 正确性：主要生命周期和 retain/release 配对有注释；HEVC `unsafe impl Send` 注释缺失，需要补齐安全理由。
