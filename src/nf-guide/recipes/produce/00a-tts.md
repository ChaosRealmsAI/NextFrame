# Step 00a: TTS 生成（可选起点）

纯 TTS 视频从这里起手。访谈 / 已有原声 clip 可以跳过。

## 目标

这一步结束时，你手里必须有两样东西：

- `seg0.mp3` 或等价音频文件
- `seg0.words.json`

`seg0.words.json` 是下一步 `nextframe anchors from-tts` 的输入，不再走 v0.6 matches。

## 推荐命令

```bash
nextframe audio-synth <project> <episode> --segment=1 --json
```

读返回 JSON，记下 TTS 产物路径。把 word timing JSON 整理成后续步骤统一使用的名字：

```bash
cp <returned-timeline-json> ./seg0.words.json
cp <returned-mp3> ./seg0.mp3
```

如果你的本地 CLI 已经支持直接输出 `seg0.words.json`，直接用它，不必再复制。

## 验证 words 文件

```bash
node -e "const d=require('./seg0.words.json'); const segs=Array.isArray(d.segments)?d.segments:[]; const words=segs.flatMap(s=>Array.isArray(s.words)?s.words:[]); console.log({segments:segs.length, words:words.length});"
```

要求：

- 至少 1 个 segment
- 至少 1 个 word
- word 里带起止时间字段

## 下一步

```bash
nf-guide produce anchors
```
