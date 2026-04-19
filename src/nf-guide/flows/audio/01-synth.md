# Step 1: 逐段合成（Code 干，每次一段）

## CLI

```bash
# 第一段（带 voice flag 落盘到 pipeline.audio）
nextframe audio-synth <project> <episode> --segment 1 --voice <NAME> --backend edge

# 后续段（不用再传 voice，自动用 pipeline.audio.voice）
nextframe audio-synth <project> <episode> --segment 2
nextframe audio-synth <project> <episode> --segment 3
...
```

## CLI 内部做什么

1. 读 `pipeline.json` 拿到 `script.segments[N-1].narration`
2. 调 `nf-tts synth` 工具（内置）—— 用 voice + backend
3. 输出到 `audio/seg-N/audio.mp3` + `timeline.json`（含词级时间戳）
4. 把结果路径回写 `pipeline.audio.segments[N-1]`
5. 如果传了 `--voice`，更新 `pipeline.audio.voice`

## 输入

- script.segments[N-1].narration（必须先 script-set）
- voice + backend（首次需要，后续从 pipeline.audio 读）

## 产出（gate: all-audio-synth）

```
<episode>/audio/
├── seg-1/
│   ├── audio.mp3
│   └── timeline.json   ← 词级时间戳 {sentences: [{start_ms, end_ms, words: [...]}]}
├── seg-2/
└── seg-3/
```

`pipeline.json`:
```json
"audio": {
  "voice": "zh-CN-XiaoyiNeural",
  "speed": 1.0,
  "segments": [
    {"segment": 1, "mp3": "audio/seg-1/audio.mp3", "timeline": "audio/seg-1/timeline.json", "duration": 5.2}
  ]
}
```

## 谁做

Code（nf-tts + ffprobe）。

## 错误

- `script segment N has empty narration` → 先 script-set
- `nf-tts not found` → 装 nf-tts 或 set `NF_TTS_BIN` 环境变量
- 网络失败（edge backend）→ 重试

## 内置工具

`nf-tts` 是项目使用的 TTS CLI（边缘自研 + 微软 Edge / 火山引擎包装）。`audio-synth` 是 nf-tts 的 NextFrame wrapper，加了路径管理 + pipeline.json 写入。

不要直接调 `nf-tts` —— 走 `audio-synth` 才能正确落盘。
