# Haiku 盲测 · clips 链

你是 **Claude Haiku 4.5** · NextFrame v0.3.0 的 agent-usability 盲测对象. 主 agent(opus)派你来 · 目的是**验证 nf-guide 的 clips prompt 自包含性** — 如果你(弱模型)不读源码 · 只读 prompt md 就能跑出 highlight mp4 · 说明接口 OK.

## cwd (必先 cd)

```bash
cd /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2
```

**所有 Bash 命令用上面这个 cwd**(每次 bash call 独立 · 必 cd 前缀).

## 任务

按 `crates/nf-guide/flows/clips/*.md` 里的 prompt 指示 · 用 `cargo run --bin nf-source -- <subcommand>` 调 CLI · 从本地 mp4 产出 highlight mp4 · 写到 `output/`.

## 硬约束

- ❌ **不读源码** `crates/nf-source/src/*` / `crates/videocut-*/src/*` — 靠 prompt md + `--help` 做决策. 偷读 = 违反盲测
- ❌ **不走网络下载** yt-dlp (可能没装 / 没网)
- ❌ **不问主 agent** · 踩坑了自己查 `--help` 或换 prompt 里的备用路径
- ✅ **可读** `crates/nf-guide/flows/clips/*.md`(这是你的 prompt 入口) · `--help` 输出 · BDD scenarios(`spec/bdd/clips/`)
- ✅ **可用工具** bash(cargo · nf-source · ffmpeg · ffprobe · ls · cat · jq)
- ✅ **兜底**:
  - yt-dlp 没装 → prompt 的 "--local-mp4" flag 不存在的话 · 直接 cp tests/fixtures/clips/demo.mp4 output/source.mp4 绕过 download 步
  - whisperx 跑不通 → 用 tests/fixtures/clips/demo.srt 当 transcript 跳过 transcribe 步
  - 任何步骤报错 · 看 `--help` / 看 prompt md 换方式 · 失败 2 次同思路 = 停 + 写进 stumbles[]

## 期望步骤(按 flows/clips/ 目录数字排 · 不保证完全如此)

1. **读清楚** `flows/clips/00-download.md` 到 `03-cut.md`(04 翻译步不做 · 06 karaoke 不做 · 这些是 TTS 链的事)
2. **下载(兜底版)**: `cargo run -p nf-source -- download --help` 看支持啥 flag · 若没 `--local-mp4` · 直接 `cp tests/fixtures/clips/demo.mp4 output/source.mp4`
3. **转写**: 尝试 `cargo run -p nf-source -- transcribe --help`. 若不支持 `--transcript fixture` · 兜底: `cp tests/fixtures/clips/demo.srt output/transcript.srt`
4. **对齐**: `cargo run -p nf-source -- align ...` · 失败兜底: 跳过(直接把 transcript.srt 当 plan 输入)
5. **规划**: `cargo run -p nf-source -- plan ...` · 输出 plan.json(highlight 时间窗) · 若没 plan 子命令 · 手写简单 plan.json: `{"highlights":[{"start":1.0,"end":4.0}]}`
6. **剪切**: `cargo run -p nf-source -- cut --plan output/plan.json --source output/source.mp4 --out output/highlight-1.mp4` · 如果 cut 子命令用不了 · 兜底 ffmpeg: `ffmpeg -i output/source.mp4 -ss 1 -t 3 -c copy output/highlight-1.mp4`

**原则**: prompt 里怎么说就怎么跑 · 跑不通换兜底 · 不改 crates/ 源码

## 自验(你自己先验 · 不靠主 agent)

```bash
ls -la output/highlight-1.mp4  # 必须存在
ffprobe -v error -show_entries stream=codec_name,duration -of default=noprint_wrappers=1 output/highlight-1.mp4  # 有 codec + duration > 0
```

## 汇报格式 (最后一步 · 必填)

```json
{
  "cwd": "/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2",
  "steps_run": ["download", "cp-fallback", "transcribe-skip", "plan", "cut"],
  "products": {
    "output/source.mp4": "size bytes",
    "output/transcript.srt": "size bytes",
    "output/plan.json": "size bytes",
    "output/highlight-1.mp4": "size bytes"
  },
  "ffprobe_highlight_1": {
    "codec": "h264",
    "duration_sec": 3.0,
    "has_audio_stream": true
  },
  "stumbles": [
    "踩坑1: X 子命令 --help 没说 Y flag · 改用 cp 兜底",
    ...
  ],
  "prompt_gaps": [
    "nf-guide/flows/clips/03-cut.md 第 N 段指向不存在的 CLI flag · 建议 prompt 改 A/B/C"
  ],
  "success": true
}
```

## 预期耗时

10-15 min · 读 prompt + 5 步 CLI + 兜底 · 不编译新代码(cargo run 触发首次编译 · 但 clippy 已预热)
