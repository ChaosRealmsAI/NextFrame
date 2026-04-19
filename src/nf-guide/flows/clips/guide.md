# Clips Pipeline — 智能切片状态机

长视频 → 挑亮点 → 切片 → 多语言字幕 → **字级 karaoke HTML** → 传播文案。每步有提示词，跑 `nf-guide clips <step>` 获取。

## 工作目录约定（v1.13.1 硬规则）

```
projects/<project>/<episode>/
├── sources/<slug>/
│   ├── source.mp4          # yt-dlp
│   ├── meta.json
│   ├── sentences.json      # whisperx 句级 · flat [{id,start,end,text}]
│   └── words.json          # whisperx 词级 · flat [{text,start,end}]
├── plan.json               # Agent 挑 highlight · clips[].from/to = **sentence id**（不是秒）
├── clips/
│   ├── cut_report.json     # ffmpeg 切片 · start/end = **秒**（真实时间戳）
│   ├── clip_NN.mp4
│   ├── clip_NN.translations.*.json
│   ├── clip_NN.karaoke.html   # karaoke 步产物
│   └── index.html          # 所有 clips sidebar 切换
└── run.log
```

**易混点**（BUG-20260419 真踩过）：`plan.from/to` 是 sentence id · `cut_report.start/end` 才是秒。字级对齐消费**秒**不消费 id。

## 流程图

```
  ┌──────────┐
  │ download │  yt-dlp 下载源视频
  └────┬─────┘
       ▼
  ┌──────────┐
  │transcribe│  WhisperX 转写 → sentences.json + words.json
  └────┬─────┘
       ▼
  ┌──────────┐
  │   plan   │  Agent 挑 3-5 个 highlight → plan.json
  └────┬─────┘
       ▼
  ┌──────────┐
  │   cut    │  ffmpeg 按 plan 切 clip_NN.mp4 + cut_report.json
  └────┬─────┘
       │
       ├── 每个 clip 独立做 ──────────┐
       │                              │
       ▼                              ▼
  ┌────────────┐                ┌────────────┐
  │ translate  │  Agent 翻译   │  polish    │  Agent 写文案
  │ (per clip  │  1对N切cue     │ (per clip  │  多平台适配
  │  per lang) │                │  per lang) │
  └────┬───────┘                └────┬───────┘
       │                             │
       └──────────┬──────────────────┘
                  ▼
            ┌──────────┐
            │ karaoke  │  Code · `nf karaoke <episode>` 一键产 index.html
            │ (终点)   │  sidebar 切所有 clips · 中英双行字级同步
            └──────────┘
```

**Pipeline 终点 = karaoke HTML**（可直接双击播放 + 分享 · 不在本流程做平台发布）。

## 每步命令

**查提示词**：`nf-guide clips <step>`（产 prompt 文本）
**实际执行**：
- **Code 步骤**（download / transcribe / cut）→ agent 跑 prompt 里给的 bare 命令（`yt-dlp` / `whisperx` / `ffmpeg`）· **没有 `nf-cli source-*` wrapper**
- **Agent 步骤**（plan / translate / polish）→ agent 自己读 JSON / 写 JSON · **没有工具调你 · 你就是 LLM**
- **karaoke** → 跑内置 `nf karaoke <episode-dir>`（nf-cli 子命令 · 已有）

| 步骤 | 查提示词 | 谁做 | CLI | 产物（gate） |
|------|---------|------|-----|--------------|
| 0 | `nf-guide clips download` | Code | bare `yt-dlp` | `sources/<slug>/source.mp4` + `meta.json` |
| 1 | `nf-guide clips transcribe` | Code | bare `whisperx` + `jq` | `sources/<slug>/{source,sentences,words}.json` |
| 2 | `nf-guide clips plan` | **Agent** | 自读自写 | `plan.json` |
| 3 | `nf-guide clips cut` | Code | bare `ffmpeg` + `jq` | `clips/clip_NN.mp4` + `cut_report.json` |
| 4 | `nf-guide clips translate` | **Agent** | 自读自写 | `clips/clip_NN.translations.<lang>.json` |
| 5 | `nf-guide clips polish` | **Agent** | 自读自写 | `clips/clip_NN.caption.<lang>.md` |
| 6 | `nf-guide clips karaoke` | Code | **`nf karaoke <episode-dir>`** | `clips/index.html` |

## 粒度原则

每次命令处理一个东西：

| 步骤 | 一次处理 |
|------|----------|
| download | 一个源 |
| transcribe | 一个源 |
| plan | 一整个 episode（一次挑 N 个 clip） |
| cut | 一整个 episode（按 plan 批量切） |
| **translate** | **一个 clip 一个语言**（并行友好） |
| **polish** | **一个 clip**（默认出所有平台版本） |

## 状态检测

文件在 = 那步做过。没有就是没做过。

```
episode/
├── sources/<slug>/
│   ├── source.mp4              ← download ✓
│   ├── sentences.json          ← transcribe ✓
│   └── words.json              ← transcribe ✓
├── plan.json                   ← plan ✓
└── clips/
    ├── clip_01.mp4             ← cut ✓
    ├── cut_report.json         ← cut ✓
    ├── clip_01.translations.zh.json  ← translate zh ✓
    ├── clip_02.translations.zh.json
    ├── clip_01.caption.zh.md   ← polish zh ✓
    └── clip_01.publish.json    ← publish ✓
```

## 回路

- plan 结果不满意 → 改 plan.json → 重跑 cut
- translate 某 clip 不满意 → 删 `clip_NN.translations.zh.json` → 重跑 translate
- polish 某 clip 不满意 → 删 `clip_NN.caption.zh.md` → 重跑 polish

每步**幂等**：命令重跑不会破坏已产物，除非显式 `--force`。

## Agent 怎么进场

Agent（Claude / GPT / 你这个会话）执行时：
1. `nf-guide clips` → 看这份 guide，知道整体流程
2. `nf-guide clips <step>` → 拿到那步的完整操作手册
3. 按手册里的 CLI 操作 + 提示词规则干活，写产物
4. 下一步再跑 `nf-guide clips <next-step>`

**CLI 不调 LLM API、不需要 API key。Agent 就是 LLM。**
