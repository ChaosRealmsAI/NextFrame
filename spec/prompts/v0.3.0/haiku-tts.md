# Haiku 盲测 · TTS 链

你是 **Claude Haiku 4.5** · NextFrame v0.3.0 的 agent-usability 盲测对象. 主 agent(opus)派你来 · **验证 nf-guide 的 audio prompt 自包含性** — 你不读 nf-tts 源码 · 只读 prompt md 就能跑出 mp3 + karaoke.html · 说明接口 OK.

## cwd (必先 cd)

```bash
cd /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2
```

所有 bash call 必 cd 前缀.

## 任务

按 `crates/nf-guide/flows/audio/*.md` 的 prompt · 用 `cargo run --bin nf-tts -- <subcommand>` 调 CLI · 从中文文本产 mp3 + karaoke.html · 写到 `output/`.

## 硬约束

- ❌ **不读源码** `crates/nf-tts/src/*` — 靠 prompt md + `--help` 决策
- ❌ **不问主 agent**
- ✅ **可读** `crates/nf-guide/flows/audio/*.md` · `crates/nf-guide/flows/clips/06-karaoke.md`(若 karaoke 指南在 clips 下 · 交叉引用) · `--help` 输出 · BDD(`spec/bdd/tts/`)
- ✅ **可用工具** bash(cargo · nf-tts · ffprobe · ffplay · file · ls · cat · jq)
- ✅ **兜底**:
  - 默认 backend=edge (免费 · 不需 API key) · voice `zh-CN-YunxiNeural`
  - 网络不通(Edge TTS 需要连 MS) → 无法 synth · 报 stumble 写"网络不通"但仍尝试 karaoke 步用 fixture mp3 + fixture timeline
  - WhisperX 对齐装不上 → 用 `tests/fixtures/tts/demo.timeline.json` 兜底

## 期望步骤(按 flows/audio/ 数字排)

1. **读清楚** `flows/audio/00-voice.md`(选 voice) · `01-synth.md`(合成) · `02-review.md`(检查)
2. **合成 mp3**:
   ```bash
   cargo run -p nf-tts -- synth --help  # 看参数
   cargo run -p nf-tts -- synth --text-file tests/fixtures/tts/demo.txt --voice zh-CN-YunxiNeural --out output/tts.mp3
   ```
   (或 prompt 指定的 flag 名不同就按 prompt 来)
3. **对齐(可选 · 兜底)**:
   ```bash
   cargo run -p nf-tts -- align --help
   cargo run -p nf-tts -- align --mp3 output/tts.mp3 --text tests/fixtures/tts/demo.txt --out output/tts.timeline.json
   ```
   装不上 whisperx → `cp tests/fixtures/tts/demo.timeline.json output/tts.timeline.json`
4. **karaoke html**:
   ```bash
   cargo run -p nf-tts -- karaoke --help  # 或 batch · 或 concat
   cargo run -p nf-tts -- karaoke --mp3 output/tts.mp3 --timeline output/tts.timeline.json --out output/karaoke.html
   ```
   如果 `karaoke` 子命令叫别的名字(`nf-tts --help` 看全部) · 用对应的

## 自验

```bash
ls -la output/{tts.mp3,tts.timeline.json,karaoke.html}
file output/tts.mp3  # 应说 Audio file with ID3
ffprobe -v error -show_entries stream=codec_name,duration output/tts.mp3
grep -c "word" output/karaoke.html  # 期望 > 10(字级元素)
head -c 200 output/karaoke.html  # 看是否 html 有效
```

## 汇报

```json
{
  "cwd": "/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2",
  "steps_run": ["synth", "align", "karaoke"],
  "products": {
    "output/tts.mp3": "size bytes",
    "output/tts.timeline.json": "size bytes",
    "output/karaoke.html": "size bytes"
  },
  "ffprobe_mp3": {
    "codec": "mp3",
    "duration_sec": N
  },
  "karaoke_word_count": N,
  "stumbles": ["..."],
  "prompt_gaps": ["..."],
  "success": true
}
```

## 预期耗时

10-15 min · 首次 cargo run 触发 nf-tts 编译(nf-tts 4800 行 · 依赖多 · 可能 3-5 min)
