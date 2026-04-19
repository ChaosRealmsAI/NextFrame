# Audio Pipeline — 语音生成状态机

把 script 段落变成可播放音频 + 词级时间戳（nf-tts TTS）。

## 流程图

```
  ┌──────────┐
  │  voice   │  Agent 选 engine + voice → 写 pipeline.audio
  └────┬─────┘
       ▼
  ┌──────────┐
  │  synth   │  对每段 script-segment 跑 audio-synth（nf-tts）
  │ (per seg)│  循环每段
  └────┬─────┘
       ▼
  ┌──────────┐
  │  review  │  听每段，确认音色/节奏/错字
  └──────────┘
```

## 每步命令

| 步骤 | 查提示词 | 谁做 | 实际 CLI |
|------|---------|------|---------|
| 0 | `nf-guide audio voice` | **Agent** | 决定后通过 `audio-synth --voice X --backend Y` 隐式写入 |
| 1 | `nf-guide audio synth` | Code | `nextframe audio-synth <project> <episode> --segment N [--voice ...] [--backend edge|volcengine]` |
| 2 | `nf-guide audio review` | **Agent** | 用 `audio.status` IPC 或直接听 `audio/seg-N/*.mp3` |

## 状态检测

```
~/NextFrame/projects/<project>/<episode>/
├── pipeline.json
│   └── audio: {voice, speed, segments: [{segment, mp3, timeline}]}
└── audio/
    └── seg-1/audio.mp3 + timeline.json   ← per segment
```

- `pipeline.json audio.voice` 非 null → voice 选过了
- 每段 `audio/seg-N/audio.mp3` 存在 → 那段合成完了

## 粒度

每个 `audio-synth` 处理**一段**。N 段 script 跑 N 次。

## Agent 怎么进场

1. `nf-guide audio` — 看流程
2. `nf-guide audio voice` — 拿到 voice 决策提示词
3. 决定 engine + voice
4. 对每个 script segment N: `nextframe audio-synth <project> <episode> --segment N --voice X --backend edge`
5. `nf-guide audio review` — 听检查

**nf-tts CLI 是内置工具**，audio-synth 内部已经接好。Agent 只决策 + 触发。
