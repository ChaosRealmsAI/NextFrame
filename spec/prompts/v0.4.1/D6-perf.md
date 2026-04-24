# D6 · 性能风险审查 · ally gpt-5.4

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 任务

审查 `crates/nf-recorder/` **性能风险** · 产 `spec/quality-reports/v0.4.1/reports/D6-perf.md`.

## 审查维度

1. **hotpath 分配** · record_loop 循环内 / snapshot 每帧内 有无 `Vec::new`/`String::new`/`Box::new`/`clone()` 等 heap 分配? 应该 pool / preallocate?
2. **FFI 生命周期** · IOSurface · CVPixelBuffer · CMSampleBuffer · AVAssetWriter 的 Retain / Release 配对 · 有无泄漏风险?
3. **内存 bound** · frame_pool capacity 3 合理吗? 高 fps / 4K 会不会背压?
4. **VT 4K patch 正确性** · v1.67.1 rate-control + async flush 的逻辑(vt_wrap.rs + mp4_writer.rs)· 核验:
   - `kVTCompressionPropertyKey_AverageBitRate` / `DataRateLimits` 设置
   - async flush(`VTCompressionSessionCompleteFrames`)调用时机
   - Bug-A regression(tail 黑帧) / Bug-B rate-control / Bug-C async flush 的逻辑在不在 · 注释清不清
5. **async 开销** · `call_async` 每帧 main thread block · 有无空转?
6. **I/O 热点** · 每帧 `println!` JSON event · 高 fps 会不会 stdout 瓶颈?

## 读什么

- ✅ `crates/nf-recorder/src/record_loop.rs`(主循环)
- ✅ `crates/nf-recorder/src/pipeline/**`(编码栈)
- ✅ `crates/nf-recorder/src/frame_pool.rs`
- ✅ `crates/nf-recorder/src/orchestrator.rs`(parallel 子进程)
- ✅ `crates/nf-recorder/src/events.rs`(stdout 序列化)

## 命令辅助

```bash
cd crates/nf-recorder
grep -rn "clone()\|to_vec()\|to_string()\|Vec::new\|Box::new" src/record_loop.rs src/pipeline/ src/frame_pool.rs
grep -rn "Retain\|retain\|CFRetain\|CFRelease\|release" src/
grep -B3 -A10 "AverageBitRate\|DataRateLimits\|CompleteFrames" src/pipeline/vt_wrap.rs
grep -rn "println!\|emit!" src/  # stdout hotspots
```

## 报告格式

同 D1 + 特别加:
- **v1.67.1 4K patch 保留度**: 明确指出 rate-control + async flush + tail-frame Bug-A regression 的代码位置(文件:行号)· 确认未被误改
- **hotpath 分配热度**: 列每帧循环内的分配点 · 优先级(每帧 / 每 clip / 每次 run)

## 禁

- ❌ 修代码(只审)
- ❌ 跑 benchmark(只静态分析)
- ❌ 建议换 codec(超 scope · 保留 h264 + hevc)
