# D1 · nf-recorder 模块拆分审查

## 总评(1 句)
一般偏好：主链路分层方向清楚且未见循环依赖，但 lib 导出面过宽、runtime seek 合约重复、pipeline codec 实现重复，后续演进会放大维护成本。

## Findings(按 P0/P1/P2 排)

（无 P0。）

### P1 · lib.rs 把内部实现模块整体暴露给外部
- **位置**: crates/nf-recorder/src/lib.rs:3-14; crates/nf-recorder/src/pipeline/mod.rs:4-7
- **问题**: `cli` / `events` / `frame_pool` / `orchestrator` / `record_loop` / `snapshot` / `verify_mp4` / `pipeline::{h264,hevc,mp4_writer,vt_wrap}` 都是 `pub mod`。这会把 CLI 解析、子进程 orchestration、FramePool 占位实现、VT/AVAssetWriter 细节都变成稳定外部 API；同时 `lib.rs` 又 re-export `RecordPipeline` / `RecordOpts` / `PipelineError`，导致外部可直接绕过 `export_api` 绑定到底层 pipeline。
- **建议**: 以 `run_export_from_source` / `ExportOpts` / `ExportResolution` / `OutputStats` 作为主要 lib API；把实现模块改成 `mod` 或 `pub(crate) mod`。因为 `src/main.rs` 作为 bin crate 不能访问 `pub(crate)`，可在 lib 暴露一个窄的 `run_cli()` / `main_entry()` 供 main 调用，再把 CLI dispatch 留在库内部。`pipeline` 子模块保留 crate 内可见，只按需要 re-export `VideoCodec` / `OutputStats`。
- **代价**: 中(涉及 main 调用入口和公开 API 收口)

### P1 · record_loop 与 snapshot 重复实现 runtime seek/视频就绪合约
- **位置**: crates/nf-recorder/src/record_loop.rs:265-286; crates/nf-recorder/src/record_loop.rs:351-388; crates/nf-recorder/src/record_loop.rs:461-630; crates/nf-recorder/src/snapshot.rs:144-181; crates/nf-recorder/src/snapshot.rs:240-299; crates/nf-recorder/src/snapshot.rs:579-644
- **问题**: 两个高层入口都在检测 `__nf_seek_export` / `getVideoState`、轮询 seek seq、解析 JSON、判断 video clips ready，并各自处理 JS number 到整数的兼容。`orchestrator` 还调用 `record_loop::js_number_as_u64` 做 duration probe，说明这块其实是共享的 runtime-driver 层，而不是 record loop 私有逻辑。
- **建议**: 新增 crate-private `runtime_driver` / `seek_contract` 模块，集中提供 `detect_capabilities`、`seek_and_wait`、`wait_video_state_ready`、`parse_json_result`、`js_number_as_u64`。`record_loop` 和 `snapshot` 只保留各自的采样/编码/PNG 责任，`orchestrator::probe_duration` 也改用共享数字解析或 duration probe helper。
- **代价**: 中(抽共享 helper，调用点较多但行为可保持)

### P1 · H.264 与 HEVC pipeline 的生命周期逻辑重复
- **位置**: crates/nf-recorder/src/pipeline/h264.rs:47-141; crates/nf-recorder/src/pipeline/hevc.rs:22-96
- **问题**: 两个文件都实现同一套 `RecordPipeline` 生命周期：校验 `RecordOpts`、创建 `VtCompressor`、push 时 `IOSurface -> CVPixelBuffer`、强制关键帧、poll VT 输出、lazy-init `Mp4Writer`、finish 时 flush/drain/close。当前差异主要是 codec 校验和 compressor 构造函数，重复逻辑会让 keyframe 策略、writer 初始化、flush 行为在两条 codec 路径中漂移。
- **建议**: 抽一个 crate-private `VtMp4Pipeline` / `EncodedVideoPipeline`，由 `VideoCodec` 或 compressor factory 决定 H.264/HEVC；`h264.rs` / `hevc.rs` 可以保留为薄 wrapper 或构造器，避免外部命名立刻变化。
- **代价**: 中(改 pipeline 内部结构，外部 trait 可不变)

### P2 · export_api.rs 同时承担 API、source 打包、HTML 模板和执行调度
- **位置**: crates/nf-recorder/src/export_api.rs:21-66; crates/nf-recorder/src/export_api.rs:184-217; crates/nf-recorder/src/export_api.rs:345-513
- **问题**: 公开 API 文件内直接 include runtime/tracks、解析并改写 source.json、生成 150+ 行 HTML/JS 模板、管理临时 HTML 文件，并决定走 `record_loop` 还是 `orchestrator`。这些职责都服务同一导出入口，但 HTML/runtime 打包细节把 API 文件拉到 513 行，降低了主流程可读性。
- **建议**: 保持 `run_export_from_source` 在 `export_api.rs`，把 `track_source_for` / `build_tracks_map_json` / `override_source_viewport` / `build_export_html` 移到 crate-private `export_html` 或 `source_bundle` 子模块；`export_api` 只做参数校验、preset resolve、临时文件生命周期和调用录制。
- **代价**: 低/中(纯移动私有函数为主)

### P2 · verify_mp4.rs 是自包含但过大的多职责文件
- **位置**: crates/nf-recorder/src/verify_mp4.rs:81-220; crates/nf-recorder/src/verify_mp4.rs:232-335; crates/nf-recorder/src/verify_mp4.rs:379-618; crates/nf-recorder/src/verify_mp4.rs:668-1020; crates/nf-recorder/src/verify_mp4.rs:1022-1069
- **问题**: 单文件 1069 行，混合了 public `verify` API、assertion 构建、top-level atom scan、moov/trak/stbl 解析、H.264 SPS Exp-Golomb bit reader。自包含减少依赖是优点，但未来支持 HEVC `hvcC` / 更多断言时，修改点会集中在一个超大文件。
- **建议**: 保留 `verify_mp4::verify` 和数据类型作为公开入口，将实现拆成私有子模块或文件：`atom`(scan/iter children)、`mp4_video`(moov/trak/stbl)、`h264_sps`(bit reader/VUI)、`assertions`(6 条断言)。外部 API 不需要变化。
- **代价**: 中(文件移动和私有路径调整)

### P2 · frame_pool 是公开的占位拆分，当前没有实际池职责
- **位置**: crates/nf-recorder/src/frame_pool.rs:1-12; crates/nf-recorder/src/frame_pool.rs:16-48; crates/nf-recorder/src/record_loop.rs:310-420
- **问题**: `FramePool` 当前只保存 `capacity` 和 `submitted`，`record_loop` 只调用 `new` / `note_submitted`，没有复用 IOSurface、没有队列、也没有 back-pressure；`submitted()` / `capacity()` 还通过 `pub mod frame_pool` 暴露给外部。这个文件名暗示底层资源池，但实现只是 telemetry counter。
- **建议**: 在真正引入多 worker 前，把它收为 `pub(crate)`，或直接内联为 `record_loop` 的局部计数；如果保留未来扩展点，建议改名/注释为 telemetry，避免外部依赖一个还不是 pool 的类型。
- **代价**: 低(收窄可见性或内联)

## 亮点(好的拆分 · 别改)
- `events.rs` 只定义 stdout JSON-Line 事件和 `emit`，没有反向依赖录制实现，边界清楚。
- `cli.rs` 负责 clap shape、参数解析和 `RecordConfig` 转换；`main.rs` 负责三类命令 dispatch，职责分离基本合理。
- pipeline 底层方向整体清楚：`h264` / `hevc` 依赖 `vt_wrap` 和 `mp4_writer`，`mp4_writer` 只消费 `CompressedFrame`，`vt_wrap` 不知道 writer，底层没有反向调用高层。
- `orchestrator` 只从高层调用 `record_loop` 做降级/子进程录制，`record_loop` 没有反向依赖 `orchestrator`，内部 `use crate::` 图未见环。
- `snapshot::iosurface_to_png` 已经是 `pub(crate)`，PNG 编码细节没有进入 lib public re-export，方向正确。

## 汇总
- P0 数: 0 / P1 数: 3 / P2 数: 3
- 整体分(1-10): 7
- 依赖检查: `cargo tree -p nf-recorder` 未见 crate 级循环；内部 `use crate::` 关系也未见静态环，主要边是 `export_api -> orchestrator/record_loop`、`orchestrator -> record_loop/events`、`record_loop -> pipeline/frame_pool/events`、`pipeline::{h264,hevc,mp4_writer} -> vt_wrap/公共类型`。
