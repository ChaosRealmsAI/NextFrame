# D6 · nf-recorder 性能风险审查

## 总评(1 句)
整体 4K patch 主逻辑保留完整，但当前 hotpath 有两个实质风险：并行子进程 stdout 可能因每帧 JSON 事件阻塞，4K 每帧 IOSurface + VT in-flight 缺少真实内存上限。

## Findings(按 P0/P1/P2 排)

### P0 · parallel 子进程 stdout 被 pipe 但父进程不 drain，长视频可被每帧事件卡死
- **位置**: `crates/nf-recorder/src/orchestrator.rs:155-173`, `crates/nf-recorder/src/orchestrator.rs:177-180`, `crates/nf-recorder/src/record_loop.rs:423-430`, `crates/nf-recorder/src/events.rs:124-130`
- **问题**: orchestrator spawn segment 时 `.stdout(Stdio::piped())`，但成功路径只 `wait()`，没有读取 child stdout。子进程 record_loop 每帧 `emit(Event::RecordFrame)`，`events::emit` 每次 `serde_json::to_string` + `writeln!` + `flush`。4K/60fps/长视频/parallel=4 时 pipe buffer 填满后，子进程会阻塞在 stdout 写入，父进程又阻塞在 `wait()`，形成导出 hang。
- **建议**: segment 子进程 stdout 要么 `Stdio::null()`，要么父进程开 drain 线程/异步任务消费并按需聚合关键事件。若仍需要 segment telemetry，建议只让父进程 emit segment start/done/progress，子进程 per-frame 事件默认关闭。
- **代价**: 中。

### P0 · `frame_pool capacity=3` 是名义值，不能限制 4K in-flight IOSurface 内存
- **位置**: `crates/nf-recorder/src/frame_pool.rs:1-12`, `crates/nf-recorder/src/frame_pool.rs:21-34`, `crates/nf-recorder/src/record_loop.rs:310-420`, `crates/nf-shell-mac/src/headless/mac.rs:569-596`, `crates/nf-recorder/src/pipeline/vt_wrap.rs:159-165`, `crates/nf-recorder/src/pipeline/vt_wrap.rs:681`
- **问题**: `FramePool::new(3)` 只计数，`note_submitted()` 不参与背压。与此同时 `snapshot()` 为避免异步 VT 覆盖旧 surface，每帧新建独立 IOSurface；4K BGRA 单帧约 3840*2160*4 = 31.6 MiB。VT encode 前 `retain_source_buffer()` 把 CVPixelBuffer 留在 `VecDeque`，直到 callback `release_source_buffer()`。如果 VT/AVAssetWriter 短时滞后，in-flight surface 数量没有显式上限，parallel=4 会放大内存峰值。
- **建议**: 建真实 bounded in-flight 控制：以 resolution/parallel 推导最大 outstanding frames，超过上限时阻塞 producer 或主动 drain VT output；保留“每帧独立 IOSurface”的正确性约束，但让独立 surface 数量受控。
- **代价**: 中-高。

### P1 · encoded frame 进入 writer 前有两次 heap buffer/copy
- **位置**: `crates/nf-recorder/src/pipeline/vt_wrap.rs:802-830`, `crates/nf-recorder/src/pipeline/mp4_writer.rs:274-358`
- **问题**: VT callback 对每个 `CMSampleBuffer` 调 `copy_block_bytes()`，分配 `Vec<u8>` 并从 `CMBlockBuffer` 拷贝压缩码流；随后 `Mp4Writer::build_sample_buffer()` 每帧再 `malloc(len)` 并把 `cf.data` 拷贝进新的 `CMBlockBuffer`。这不是原始 4K 像素拷贝，但高码率 4K HEVC/H264 下仍是每帧固定 heap + memcpy。
- **建议**: 中期可让 `CompressedFrame` 持有 retained `CMBlockBuffer`/`CMSampleBuffer` 或复用 writer 侧 byte buffer，至少消掉第二次 copy。短期可记录此为 hotpath tradeoff，不要在上层再复制 `CompressedFrame`。
- **代价**: 高。

### P1 · 每帧 JS bridge 仍有主线程阻塞和分配，export bridge 只降低 `call_async` 路径成本
- **位置**: `crates/nf-recorder/src/record_loop.rs:353-384`, `crates/nf-recorder/src/record_loop.rs:461-510`, `crates/nf-shell-mac/src/headless/mac.rs:112-121`, `crates/nf-shell-mac/src/headless/mac.rs:131-144`, `crates/nf-shell-mac/src/headless/mac.rs:404-428`
- **问题**: 每帧至少构造 seek script；旧路径每帧走 `call_async`，底层 `Box::pin` + `Arc<Mutex>` + `RcBlock` + main runloop poll。新 export bridge 用 `eval_fire_and_forget` 降低等待成本，但有 active video probe 时仍会 `eval_sync` 轮询，每轮也会分配 wrapper script / block / shared state。当前 loop 有 `sleep(4ms/16ms)`，不是 CPU 空转，但确实是每帧主线程同步开销。
- **建议**: 保持 export bridge 优先；后续若做长视频/高 fps，可把 seek 参数改成固定 JS 函数 + arguments，避免每帧 `format!` script，并把 video-state probe 变成 runtime 侧一次性聚合返回。
- **代价**: 中。

### P1 · `verify_moov_front` close 阶段整文件读入内存
- **位置**: `crates/nf-recorder/src/pipeline/mp4_writer.rs:243-250`, `crates/nf-recorder/src/pipeline/mp4_writer.rs:437-484`
- **问题**: writer close 后调用 `std::fs::read(path)` 扫 MP4 atom。它不是每帧 hotpath，但长 4K 输出可能一次性分配几百 MB 到数 GB，只为判断 `moov` 是否在 `mdat` 前。
- **建议**: 改成 streaming atom scan；通常只需读文件头部 atom，即使保守也应分块读取。
- **代价**: 低。

### P2 · per-frame stdout 事件本身是高频 I/O 热点
- **位置**: `crates/nf-recorder/src/record_loop.rs:423-439`, `crates/nf-recorder/src/events.rs:121-130`
- **问题**: 即使不走 orchestrator，单进程每帧 JSON serialize + stdout lock + flush 也会把终端/调用方 pipe 纳入关键路径。60fps 短视频问题不大，但高 fps 或慢 consumer 会让 encode loop 被 I/O 反压。
- **建议**: per-frame event 默认采样或可配置关闭；保留每 30 帧 progress 和 done。若必须保留逐帧事件，至少不要每行 flush。
- **代价**: 低。

## v1.67.1 4K patch 保留度

| patch 点 | 当前位置 | 结论 |
|---|---|---|
| Bug-B rate-control | `crates/nf-recorder/src/pipeline/vt_wrap.rs:499-532` | **保留**。H264 路径会设置 `AverageBitRate` + `DataRateLimits`；HEVC 先尝试 `ConstantBitRate`，不支持时 fallback 到 `AverageBitRate` + `DataRateLimits`。 |
| Bug-C async flush | `crates/nf-recorder/src/pipeline/vt_wrap.rs:398-409`, `crates/nf-recorder/src/pipeline/h264.rs:115-133`, `crates/nf-recorder/src/pipeline/hevc.rs:74-88` | **保留**。`finish()` 先 `VTCompressionSessionCompleteFrames(kCMTimeInvalid)`，再 drain tail queue 写入 MP4。`Drop` 也有兜底 complete + invalidate: `vt_wrap.rs:450-460`。 |
| Bug-A tail/4K serial regression | `crates/nf-recorder/tests/regression_bug_a.rs:14-98`, `crates/nf-recorder/tests/hevc_encode.rs:92-145`, `crates/nf-shell-mac/src/headless/mac.rs:569-596`, `crates/nf-recorder/src/pipeline/mp4_writer.rs:222-235` | **实现与回归守卫均在**。测试覆盖 4K 10s serial no-crash、HEVC tail frames non-black；snapshot 每帧独立 IOSurface 避免异步 encoder 读到被覆盖 surface；writer end time 用 last pts + frame duration。 |

注释清晰度：核心 patch 注释足够说明“为什么不能复用 IOSurface”“为什么 finish 前 CompleteFrames”。但文件内仍混有 v1.14/v1.55/v1.67 历史叙述，这属于维护性问题，不影响 D6 对 patch 保留度的判断。

## hotpath 分配热度

| 热度 | 分配/拷贝点 | 位置 | 说明 |
|---|---|---|---|
| 每帧 | seek script `format!` | `record_loop.rs:354`, `record_loop.rs:372-373` | 每帧构造 JS 字符串。 |
| 每帧 | export bridge fallback `serde_json::json!` | `record_loop.rs:365-369` | 无 active video probe 时每帧构造 JSON Value。 |
| 每帧/每轮询 | `eval_sync`/`call_async` boxed future + Arc/Mutex/RcBlock | `nf-shell-mac/src/headless/mac.rs:131-144`, `nf-shell-mac/src/headless/mac.rs:404-428` | 主线程 bridge 开销；有 sleep，不是空转。 |
| 每帧 | 独立 IOSurface | `nf-shell-mac/src/headless/mac.rs:569-596` | 正确性需要，但 4K 内存重。 |
| 每帧 | `CVPixelBufferCreateWithIOSurface` retained object | `nf-shell-mac/src/iosurface.rs:70-85`, `pipeline/h264.rs:76-80`, `pipeline/hevc.rs:47-50` | zero-copy 像素，但有 CF object 生命周期成本。 |
| 每帧 | source pixel buffer retain 入 `VecDeque` | `vt_wrap.rs:159-165`, `vt_wrap.rs:368` | callback 释放；缺显式上限。 |
| 每 60 帧 / segment 首帧 | force keyframe CFDictionary | `vt_wrap.rs:350-363`, `pipeline/h264.rs:86-88`, `pipeline/hevc.rs:52-54` | 非每帧常态；可接受。 |
| 每 encoded frame | compressed bytes `Vec<u8>` | `vt_wrap.rs:812-830` | 从 CMBlockBuffer 拷贝出 AVCC bytes。 |
| 每 encoded frame | writer side `malloc` + copy + CMSampleBuffer | `mp4_writer.rs:282-358` | 第二次码流拷贝。 |
| 每帧 | stdout JSON line + flush | `record_loop.rs:425-430`, `events.rs:124-130` | I/O 热点；parallel 下会变成 pipe deadlock 风险。 |
| 每 clip/segment | lazy `Mp4Writer::new` | `pipeline/h264.rs:93-100`, `pipeline/hevc.rs:56-63` | 首个 encoded frame 才创建；合理。 |
| 每次 run | `mode_switch.replace` / start event path string | `record_loop.rs:243-263`, `record_loop.rs:313-319` | 不在循环内；低风险。 |
| 每次 run close | whole-file MP4 read | `mp4_writer.rs:437-484` | 长 4K 输出内存峰值风险。 |

## FFI 生命周期审查

- **IOSurface**: `IOSurfaceHandle` 持 `CFRetained<IOSurfaceRef>`，clone/drop 对应 CFRetain/CFRelease；`snapshot()` 每帧创建 +1 surface 并交给 handle，生命周期说明清楚：`nf-shell-mac/src/iosurface.rs:24-31`, `nf-shell-mac/src/headless/mac.rs:581-596`。
- **CVPixelBuffer**: `CVPixelBufferCreateWithIOSurface` 按 Create Rule 返回 +1，`CFRetained::from_raw` 接管；VT 前额外 retain 到 `in_flight`，callback pop 释放，encode 失败 `cancel_last_source_buffer()`，finalize/drop `drain_source_buffers()` 兜底：`nf-shell-mac/src/iosurface.rs:70-85`, `vt_wrap.rs:159-184`, `vt_wrap.rs:368-392`, `vt_wrap.rs:681`, `vt_wrap.rs:398-409`, `vt_wrap.rs:450-460`。
- **CMSampleBuffer/CMBlockBuffer**: VT callback 对 sample 做 `CFRetained::retain` 后读；writer 侧 `CMBlockBuffer::create_with_memory_block` 成功后由 Retained 接管，失败手动 `free`，`CMSampleBuffer::create_ready` 后 Retained 接管：`vt_wrap.rs:697-727`, `mp4_writer.rs:282-317`, `mp4_writer.rs:333-358`。
- **AVAssetWriter**: writer/input 都是 `Retained<>`；`close(self)` 消费对象，顺序为 endSession → markAsFinished → finishWriting completion：`mp4_writer.rs:58-73`, `mp4_writer.rs:212-235`, `mp4_writer.rs:398-429`。

结论：未看到明显 retain/release 配对泄漏；真正风险是生命周期正确但缺少 outstanding 数量上限。

## 亮点(别改)
- `VTCompressionSessionCompleteFrames(kCMTimeInvalid)` 在 writer close 前执行，且随后 drain output queue，tail frame 逻辑方向正确。
- 每帧独立 IOSurface 虽然贵，但它是避免异步 VT 读取被下一帧覆盖的关键正确性设计。
- `AllowFrameReordering=false`、固定 keyframe interval、segment 首帧强制 IDR 保留，和 parallel concat 的需求一致。

## 汇总
- P0 数: 2 / P1 数: 3 / P2 数: 1
- 整体分(1-10): 6.8
- 本次未跑 benchmark / cargo test；结论仅基于静态代码审查。
