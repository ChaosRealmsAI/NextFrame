# 任务 · v0.22.0 · nf poster-import CLI

主 agent 持锁 `feature:v0.22.0-poster`。你是 v0.22.0 的 **poster-import** 路 · 在 `crates/nf-cli` 加 1 个子命令 · 把 poster-show 产物拼成 NextFrame composition。

## 工作根

```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.0-0e3c8b70
```

## 必读现状

```bash
cat spec/charter.md
cat spec/architecture.md
cat crates/nf-cli/src/main.rs                                 # 看 clap 子命令注册法
ls crates/nf-cli/src/commands/                                # 看现有命令实现风格
cat crates/nf-cli/src/commands/verify.rs | head -80           # 风格样板
cat examples/v2-showcase/compositions/voice-subtitle-smoke.json  # 目标 composition 形态(audio + subtitle 已示范)
cat tmp/v021-explain/audio/manifest.json                      # 输入数据全貌
cat tmp/v021-explain/audio/slide-01.timeline.json | head -40  # 输入 timeline 格式
ls tmp/v021-explain/posters/                                  # 7 张 PNG 文件名
cat tmp/v021-explain/batch.json                               # 7 段原始 text
```

## harness preflight(硬)

```bash
harness tools
harness search "composition"
harness show nf-composition
```

不造新工具(本任务是新 CLI · 不是验证工具)。

## 交付 1 件

### `target/debug/nf poster-import <src_dir> --out=<project_slug>`

新增子命令 · 入口 `crates/nf-cli/src/commands/poster_import.rs` + main.rs 注册。

**输入**:`<src_dir>` 目录(如 `tmp/v021-explain/`)· 必含:
- `posters/N-<name>.png`(N 张图 · 文件名规则 = `<编号>-<slug>.png`)
- `audio/manifest.json`(总览 · `entries[]` 含 `id` + `text` + `file`)
- `audio/slide-NN.mp3`(N 段音频)
- `audio/slide-NN.timeline.json`(N 段 word-level timeline · 字段 `segments[].words[]` · word 字段名是 `word` 不是 `text` · 注意转换!)

**输出**:`examples/<project_slug>/`(默认 `examples/v021-explain/`)
```
examples/v021-explain/
├── project.json              ← 路 A 已写 · 你不动
├── components/
│   └── html.image-slide.js   ← 路 A 已写
├── audio/
│   └── slide-NN.mp3          ← 你复制
├── compositions/
│   └── main.json             ← 你拼
```

**逻辑要求**:

1. 解析 `audio/manifest.json` 拿 7 entries(已知 `id` + `text` + `file`)
2. 对每 entry · 算 audio duration_ms:
   - 读 `audio/slide-NN.timeline.json` 拿 `segments[].end_ms` 最大值 = duration_ms
   - 或者用 ffprobe(可选 · 优先 timeline 算)
3. 累加 cumulative_ms 当 anchor 偏移:
   - slide-1 · start=0 · end=cum1
   - slide-2 · start=cum1 · end=cum1+dur2
   - ... 依次
4. 拼 composition.json:
   ```json
   {
     "schema": "nextframe.composition.v2",
     "id": "main",
     "name": "v021 explain",
     "duration": "<total>ms",
     "viewport": { "w": 1920, "h": 1080, "ratio": "16:9" },
     "theme": "default",
     "export": { "resolution": "1080p" },
     "anchors": {
       "slide-1": "0ms",
       "slide-2": "<cum1>ms",
       ...
       "out": "<total>ms"
     },
     "tracks": [
       // 每张 slide 出 3 个 track:image / audio / subtitle
       { "id": "img-1", "kind": "component", "component": "html.image-slide",
         "z": 10, "time": { "start": "slide-1", "end": "slide-2" },
         "params": { "src": "components/posters/slide-01.png" } },
       { "id": "audio-1", "kind": "audio",
         "time": { "start": "slide-1", "end": "slide-2" },
         "src": "audio/slide-01.mp3", "volume": 1 },
       { "id": "sub-1", "kind": "subtitle", "z": 80,
         "time": { "start": "slide-1", "end": "slide-2" },
         "style": { "active_color": "#ffca66", "color": "#fff", "size_px": 42, "position": "bottom", "padding": 68 },
         "params": { "words": [...转换 timeline.segments.flatMap(s => s.words.map(w => ({text: w.word, start_ms: w.start_ms, end_ms: w.end_ms})))...] } },
       // ... 7 组 = 21 tracks 总
     ]
   }
   ```
5. 复制 PNG · `posters/N-name.png` → `examples/v021-explain/components/posters/slide-NN.png`(命名标准化 slide-01..slide-07)
   - **注意**:component params.src 走 component dir 还是 episode root?查现有 component 怎么用 ctx · 选稳定的方案
6. 复制 MP3 · `audio/slide-NN.mp3` → `examples/v021-explain/audio/slide-NN.mp3`

**输出 stdout · JSON**:

```json
{
  "composition_path": "examples/v021-explain/compositions/main.json",
  "slides": 7,
  "duration_ms": 105000,
  "tracks": 21
}
```

## 自验(必跑)

```bash
cargo build -p nf-cli
target/debug/nf poster-import tmp/v021-explain --out=v021-explain
target/debug/nf composition validate --project=v021-explain --composition=main
```

预期 · validate 输出 0 error 0 critical。出错读 `next step ·` 行。

如果 component params.src 路径错 · 可能撞 `nf-project` 的资源解析 · 调一下:看 `crates/nf-project/src/lib.rs` 里 audio_src / image 是怎么 resolve 的 · 确保统一。

## 禁

- 不动 v2 schema · 不动 nf-shell · 不动 nf-recorder
- 不糊 ffmpeg / shell out · 全 Rust + serde_json
- 不 commit / 不 push
- 不动 path 之外的 examples/

## 报告

- ✅/❌ `target/debug/nf poster-import --help` 含 poster-import 子命令
- ✅/❌ 跑通 · 输出 examples/v021-explain/compositions/main.json
- ✅/❌ `nf composition validate` 0 error
- ✅/❌ 21 tracks · 7 slides · duration_ms 总值
- 一句话 · 你做了啥 + 踩了啥坑
