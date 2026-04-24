# v0.4.2 · clips + TTS 双模块 12 ally 审查汇总

**时间**: 2026-04-21 18:50 · autopilot 主 agent 汇总
**12 ally reports**: clips/reports/D{1-6}.md + tts/reports/D{1-6}.md

## 模块级汇总

| 模块 | D1 | D2 | D3 | D4 | D5 | D6 | P0 | P1 |
|---|---|---|---|---|---|---|---|---|
| **clips pipeline** | 0/5 | 0/3 | 1/1 | 1/2 | 0/0 | 2/4 | **4** | 15 |
| **nf-tts** | 1/4 | 0/3 | 0/4 | 1/4 | 0/3 | 3/5 | **5** | 23 |
| **合计** | | | | | | | **9** | 38 |

## 本版修 4 fix(P0 中优先正确性 bug)

### Fix-A · tts Cache key 漏 backend + Volcengine 参数(D1 P0 + D6 P0-3 合并)
- **位置**: `crates/nf-tts/src/cache/mod.rs`
- **根因**: cache key 只 hash text/voice · 不含 backend(edge/volcengine)/emotion/speech_rate 等 · 跨 backend 切换或改情感会**静默返错音频**
- **修**: cache key 覆盖 `backend + voice + text + emotion + speech_rate + loudness_rate + volume + pitch + rate` 全部 SynthParams 字段
- **优先级**: P0 正确性

### Fix-B · tts Edge WebSocket receive 无超时(D6 P0-1)
- **位置**: `crates/nf-tts/src/backend/edge/ws.rs`
- **根因**: synth 的 WS recv 循环无超时 · 网络半开 / 服务器不回可**永久卡死**
- **修**: recv 加 `tokio::time::timeout(10s)` · 超时返 RecvTimeout error
- **优先级**: P0 正确性

### Fix-C · tts Volcengine 并发临时文件名冲突(D6 P0-2)
- **位置**: `crates/nf-tts/src/backend/volcengine/` (client.rs / audio.rs)
- **根因**: 固定临时文件名 · `max_concurrency=2` 下并发 synth 互相覆盖/删除
- **修**: 临时文件名加 `uuid::Uuid::new_v4()` · 每个 synth 独立
- **优先级**: P0 正确性

### Fix-D · clips 测试 hermetic(D3 P0 + 命名错修)
- **位置**: `crates/videocut-align/tests/` + `crates/videocut-transcribe/tests/` + `crates/nf-source/src/cli.rs` 错误 hint
- **根因**:
  - 测试依赖 missing `python/align_ffa.py` 和 `python/whisper_transcribe.py`
  - 错误 hint `SPLICE_WHISPER_SCRIPT` 实际变量名 `VIDEOCUT_WHISPER_SCRIPT`
  - download/transcribe/align/cut 4 个 critical path 全无 hermetic smoke test
- **修**:
  - 命名错 1 行 fix
  - 补 4 个 command smoke test(fake yt-dlp + fake ffmpeg + fake helper)
- **优先级**: P0 正确性 + 可维护性

## 本版不改(延下版 ADR)

### P0 clips-D6-1 · transcribe Python helper 冷启动 + large-v3 模型重复加载
- 重构级: Python helper 改 long-running worker / batch mode
- 代价高 · 需设计决策 · ADR 候选

### P0 clips-D6-2 · sentences.json 内存倍增(Word 多次 clone)
- 重构级: 数据所有权调整(words.json ranges vs 嵌入)· 流式 serialize
- 代价中 · 设计决策 · ADR 候选

### P1 × 38 条
- 选改: 只看高价值低成本
- 默认: 入 REVIEW.md + 下版挑

## 验收

1. `cargo check --workspace` + `clippy` 双绿
2. `cargo test -p nf-tts -p videocut-align -p videocut-transcribe -p nf-source` 新补 test 过
3. 回归验: `cargo run -p nf-tts -- synth --text "你好 · 测试" --voice zh-CN-YunxiNeural --out output/test.mp3` 产 mp3
4. clips 回归: `cargo run -p nf-source -- download --local-mp4 <fixture> --out output/src.mp4` 过
