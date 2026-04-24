# Claude Code Video Toolkit · Deep Tech

> Repo: `digitalsamba/claude-code-video-toolkit` · 927★ · 146 forks · v0.14.2 · size 14.3 MB · language Python (主) + TS (Remotion).
> 维护者:Digital Samba(视频会议 SaaS 公司 · toolkit 是副业 · 用于做自家 sprint-review 视频)
> 作者自述:"月复一月手工打磨 · AI 让编码变快 · 但每个 skill/template/tool 都是反复迭代出来的"(非 AI 生成声明)

---

## 0. 项目骨架(tree 一眼全貌)

```
claude-code-video-toolkit/
├── .claude/                          ← Claude Code 识别的配置目录
│   ├── settings.json                 ← 空对象 {}(没任何 hooks / permissions)
│   ├── commands/                     ← 13 条 slash commands
│   │   ├── brand.md · contribute.md · design.md
│   │   ├── generate-voiceover.md · record-demo.md · redub.md
│   │   ├── scene-review.md · setup.md · skills.md
│   │   ├── template.md · versions.md · video.md · voice-clone.md
│   └── skills/                       ← 11 个 skill(domain knowledge)
│       ├── acestep/       SKILL.md + reference.md
│       ├── elevenlabs/    SKILL.md + reference.md
│       ├── ffmpeg/        SKILL.md + reference.md
│       ├── frontend-design/  SKILL.md(单文件 · 从 Anthropic 官方 skills 抄来)
│       ├── ltx2/          SKILL.md
│       ├── moviepy/       SKILL.md
│       ├── playwright-recording/  SKILL.md
│       ├── qwen-edit/     SKILL.md + examples.md + parameters.md + prompting.md
│       ├── remotion-official/  SKILL.md(从 remotion-dev/skills 同步)
│       ├── remotion/      SKILL.md + reference.md(toolkit-specific extensions)
│       └── runpod/        SKILL.md + reference.md
├── skills/                           ← 🚨 另有一份 skill 入口(顶级目录)
│   └── openclaw-video-toolkit/
│       └── SKILL.md                  ← ★ 对外分发入口 · 名叫 "video_toolkit" · frontmatter 含 openclaw metadata
├── tools/                            ← 22 个 Python CLI(每个 tool 一个脚本)
│   ├── qwen3_tts.py · flux2.py · ltx2.py · sadtalker.py
│   ├── music_gen.py · image_edit.py · upscale.py · dewatermark.py
│   ├── voiceover.py · chain_video.py · sync_timing.py · verify_setup.py
│   ├── addmusic.py · music.py · sfx.py · redub.py
│   ├── locate_watermark.py · notebooklm_brand.py · file_transfer.py
│   ├── cloud_gpu.py · config.py
│   └── requirements.txt
├── docker/                           ← 15 个云 GPU Docker 镜像(Modal × 8 + RunPod × 7)
│   ├── modal-flux2/ · modal-qwen3-tts/ · modal-ltx2/ · modal-sadtalker/
│   ├── modal-image-edit/ · modal-upscale/ · modal-music-gen/ · modal-propainter/
│   ├── runpod-acestep/ · runpod-flux2/ · runpod-qwen3-tts/ · runpod-sadtalker/
│   └── runpod-realesrgan/ · runpod-qwen-edit/ · runpod-propainter/
├── templates/                        ← 3 套 Remotion 模板
│   ├── sprint-review/   (React + Remotion · package.json + src/Root.tsx + config/)
│   ├── sprint-review-v2/
│   └── product-demo/
├── brands/                           ← 品牌 profile(一个品牌一目录)
│   └── {brand}/brand.json + voice.json + assets/
├── projects/                         ← gitignored · 用户项目
├── examples/                         ← hello-world + quick-spot + data-viz-chart(样例)
├── lib/                              ← Remotion 共享组件 + transitions
│   ├── components/  AnimatedBackground · SlideTransition · Label · Vignette ...
│   └── transitions/ glitch · rgbSplit · zoomBlur · lightLeak · clockWipe · ...
├── _internal/
│   └── toolkit-registry.json         ← ★ 核心元数据索引 · skills/commands/tools/templates 全挂
├── assets/ · brands/ · playwright/ · showcase/ · docs/ · docker/
├── CLAUDE.md          (592 行 · 巨型 · 详见 §5)
├── README.md          (16.6 KB · 含 banner gif · 作者手写声明)
└── .env.example       (所有云 GPU endpoint URL 模板)
```

**两个关键发现**:
1. **没有 `.claude/hooks/`** — 这个 toolkit **完全不用 hooks**(settings.json 是空 `{}`)· 纯靠 skills + commands + CLAUDE.md 驱动
2. **两份 skill 目录共存**:`.claude/skills/` 是 Claude Code 原生识别 · `skills/openclaw-video-toolkit/` 是对接 "openclaw"(一个第三方 Claude Code skill marketplace · 见 frontmatter metadata.openclaw)

---

## 1. Skills 包结构(★★★ · 核心抄袭对象)

### 1.1 skill 文件的真实长相(frontmatter 标准)

**最小合法 frontmatter**(所有 skill 都有):
```yaml
---
name: <skill-slug>
description: <一句话 + "Use when..." 触发线索 + triggers include ...>
---
```

**扩展字段**(可选 · 部分 skill 用):
```yaml
---
name: video_toolkit                          # 对外分发用
description: Create professional videos ...  # Claude 自动触发的唯一依据
metadata:
  openclaw:                                  # 第三方 marketplace 兼容字段
    emoji: "🎬"
    skillKey: "video-toolkit"
    os: ["darwin", "linux"]
    requires:
      bins: ["node", "python3", "ffmpeg", "npm"]
license: Complete terms in LICENSE.txt       # 可选
---
```

**frontmatter 后的 body** = 纯 markdown · Claude 直接当系统知识读。结构惯例:

```markdown
# <Skill Name>

简短定位(1-2 段介绍)

## Quick Start / Quick Reference     ← 必有 · 放最常用 3-5 个命令
```bash
python3 tools/xxx.py --prompt "..." --output out.mp3
```

## Parameters                         ← 必有 · 表格化
| Parameter | Default | Description |
|---|---|---|
| ... | ... | ... |

## When to Use / When NOT to Use     ← 必有 · 明确边界
- Use when: ...
- Skip when: ...

## Prompting Guide / Patterns        ← 每个 AI model 必有"怎么写 prompt"一章
...

## Troubleshooting / Common Issues
...
```

### 1.2 skill 装到 Claude Code 后怎么用?

**机制**(从 toolkit 行为倒推 + Anthropic 官方文档):
1. Claude Code 启动 → 自动扫 `~/.claude/skills/*/SKILL.md` + `./.claude/skills/*/SKILL.md`
2. 把每个 skill 的 `frontmatter.description` **当做"触发器描述"注入系统提示词**(progressive disclosure · 不注入 body)
3. 用户说话 → Claude 自己判断"匹不匹配某个 skill 的 description" → 匹配则主动 Read 那份 SKILL.md + 任何 `reference.md` / `examples.md` 同目录文件
4. 后续任务内 Claude 按 SKILL.md 里的命令 / 模式执行

所以 **description 字段 = skill 的"广告词" + "召唤咒语"** · 必须含:
- 动词(Create · Generate · Convert · Edit)
- 触发词清单("Use when ..." · "Triggers include ...")
- 场景关键词(video generation · text-to-video · watermark removal · ...)

### 1.3 完整 skill markdown 样例 · `ltx2` 全文前 60 行

```markdown
---
name: ltx2
description: AI video generation with LTX-2.3 22B — text-to-video, image-to-video clips for video production. Use when generating video clips, animating images, creating b-roll, animated backgrounds, or motion content. Triggers include video generation, animate image, b-roll, motion, video clip, text-to-video, image-to-video.
---

# LTX-2.3 Video Generation

Generate ~5 second video clips from text prompts or images using the LTX-2.3 22B DiT model.
Runs on Modal (A100-80GB). Requires `MODAL_LTX2_ENDPOINT_URL` in `.env`.

## Quick Reference

```bash
# Text-to-video
python3 tools/ltx2.py --prompt "A sunset over the ocean, golden light on waves, cinematic" --output sunset.mp4

# Image-to-video (animate a still image)
python3 tools/ltx2.py --prompt "Gentle camera drift, soft ambient motion" --input photo.jpg --output animated.mp4

# Fast mode (fewer steps, quicker)
python3 tools/ltx2.py --prompt "..." --quality fast --output quick.mp4
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| --prompt | (required) | Text description of the video |
| --input | - | Input image for image-to-video |
| --width | 768 | Video width (divisible by 64) |
| --height | 512 | Video height (divisible by 64) |
| --num-frames | 121 | Frame count, must satisfy `(n-1) % 8 == 0` |
| --fps | 24 | FPS |
| --quality | standard | `standard` (30 steps) or `fast` (15 steps) |
| --seed | random | Seed for reproducibility |

## Valid Frame Counts
`(n - 1) % 8 == 0`: 25 (~1s), 49 (~2s), 73 (~3s), 97 (~4s), 121 (~5s default), 161 (~6.7s) ...

## Common Resolutions
| 768×512 | 3:2 · default | ... |
...

## Prompting Guide
...(具体怎么写 prompt)...
```

**特点**:
- 一个 skill 只聚焦一个 tool(ltx2 = 只讲 LTX-2 视频生成)
- body 本质是一份"带 tone 的 README" · 但**明确告诉 Claude "这个 tool 怎么用 + 什么时候不用"**
- Parameters 表格化 · Claude 一眼抓参数
- "When NOT to Use" 明确边界(比如 `qwen-edit` 说"背景替换效果差 · 别用")

### 1.4 skills 的 3 种层次(toolkit 的实际分级)

toolkit 把 11 个 skill 分成三层:

| 层 | 举例 | 性质 |
|---|---|---|
| **外部技术** | `remotion-official`(官方同步)· `frontend-design`(Anthropic 官方 skill) | 不是自己写的 · 从上游同步 |
| **Toolkit 扩展** | `remotion`(toolkit 在 Remotion 上的自定义组件 + 自定义 transitions) | 自家在标准工具上加的东西 |
| **Tool 说明书** | `ltx2` / `qwen-edit` / `elevenlabs` / `ffmpeg` / `acestep` / `moviepy` / `playwright-recording` / `runpod` | **每个 Python CLI tool 一份 skill** · 讲"这个 tool 怎么用 · 什么时候用 · 怎么写 prompt" |

**关键洞察**:`tools/*.py` + `.claude/skills/*/SKILL.md` **一对一**配对 —— tool 是产品 · skill 是产品说明书。Claude 读 skill → 知道调哪个 tool + 怎么调。

### 1.5 `_internal/toolkit-registry.json` · 元数据索引

**全部 skill / command / tool / template / component / transition / cloud-endpoint 的结构化元数据**(version / path / status / created / updated / upstream)都在这一个 JSON 里:

```json
{
  "name": "claude-code-video-toolkit",
  "version": "0.14.2",
  "skills": {
    "remotion-official": {
      "path": ".claude/skills/remotion-official/",
      "description": "...",
      "status": "stable",
      "upstream": "https://github.com/remotion-dev/skills",
      "created": "2026-02-19",
      "updated": "2026-02-19"
    },
    "ltx2": { "status": "beta", "created": "2026-03-25", ... },
    ...
  },
  "commands": { ... },
  "tools": { ... },
  "templates": { ... }
}
```

CLAUDE.md 明确说:"This file focuses on workflow guidance. **For structured data, consult the registry.**" 人读 CLAUDE.md 讲故事 · Claude 查 registry 拿数据。

### 1.6 安装方式

**只有一种** —— `git clone`:
```bash
git clone https://github.com/digitalsamba/claude-code-video-toolkit.git
cd claude-code-video-toolkit
python3 -m pip install -r tools/requirements.txt
claude         # 在 toolkit 根目录启动 Claude Code
```

**没有 `npm install -g`**·**没有 marketplace**· 用户必须物理 clone 到本地 · `.claude/` 必须在启动目录。

"openclaw" metadata 是对接 openclaw marketplace(外部 · 第三方)· 但 toolkit 本身没做 npm/pypi 包。

---

## NextFrame 启发(P0)· skills 包 day-1 该怎么写

**3 个 day-1 skill + 命名 + 定位**(抄 toolkit 的分层 + 单文件自包含):

1. **`.claude/skills/nextframe-toolkit/SKILL.md`** — 顶级入口 skill(对应 toolkit 的 `openclaw-video-toolkit/SKILL.md`)
   - frontmatter:`name: nextframe_toolkit` · description 写"Build videos from JSON scenes — anchor-based timing, track-based composition, renders HTML preview or 4K MP4"
   - body:Quick Start(`nf build scene.json → out.html` / `nf render scene.json → out.mp4`)+ Project structure + 整个工作流总入口

2. **`.claude/skills/nf-anchors/SKILL.md`** — 讲 Anchors 概念(v0.8 核心)
   - frontmatter:`name: nf-anchors · description: Anchor-based timeline — how to place elements at time markers, chain events ...`
   - body:Anchors 是啥 · 怎么写 `anchor.json` · 常见 pattern · 典型错误(anchor 叠不上 / 时间跳跃)

3. **`.claude/skills/nf-tracks/SKILL.md`** — 讲 Tracks 概念
   - body:Tracks 是啥 · 每 track 职责 · 怎么跨 track 同步 · 典型 pattern

**再加 3 个 tool-specific skill**(对应每个 Rust CLI subcommand):

4. **`.claude/skills/nf-build/SKILL.md`** — `nf build` 命令(JSON→HTML)
5. **`.claude/skills/nf-render/SKILL.md`** — `nf render` 命令(HTML→MP4)
6. **`.claude/skills/nf-preview/SKILL.md`** — `nf preview` 命令(本地服起来看)

**每个 SKILL.md 的固定骨架**(抄 toolkit):
```markdown
---
name: nf-xxx
description: <动词> + Use when ... + Triggers include ...
---
# NextFrame XXX

## Quick Reference
(3-5 常用命令)

## Parameters
(表格)

## When to Use / When NOT to Use

## Common Patterns

## Troubleshooting
```

**分发方式**(day-1):单仓 `ChaosRealmsAI/nextframe-skills` · `git clone` 到 `~/.claude/skills/nextframe/` · 装机文档 3 行说清楚。别急着 npm。

---

## 2. Slash Commands(★★)

### 2.1 13 条命令清单(全貌)

| 命令 | 干啥 | 类型 |
|---|---|---|
| `/setup` | 一次性配置(云 GPU · R2 · voice · 环境 check) | 主入口 · 新用户跑一次 |
| `/video` | 视频项目生命周期主入口(扫旧项目 · resume 或新建) | 主入口 · 每次视频工作跑 |
| `/brand` | 品牌 profile 管理(列 / 编辑 / 新建) | CRUD |
| `/template` | 模板列表(展示 sprint-review · product-demo 等) | 列表 |
| `/skills` | skill 列表 + 新建 skill 引导 | 元操作 |
| `/versions` | toolkit 版本 / 更新检查 | 元操作 |
| `/contribute` | 对仓库贡献引导(PR 流程) | 元操作 |
| `/record-demo` | Playwright 浏览器录屏(按项目 context 走) | 执行性 |
| `/generate-voiceover` | ElevenLabs / Qwen3-TTS 生成配音(有前置 gate) | 执行性 |
| `/voice-clone` | 语音克隆(ElevenLabs + 参考音频) | 执行性 |
| `/redub` | 重新配音已有视频(word-level 时间重映射) | 执行性 |
| `/scene-review` | 在 Remotion Studio 中逐场景 review(质量闸口) | 质量性 |
| `/design` | 视觉精修(触发 frontend-design skill) | 质量性 |

### 2.2 命令文件格式

**frontmatter 极简**:
```yaml
---
description: <命令干啥的 1 行>
---
```

**body** = 一大段 markdown prompt · Claude 把整个 body 当 task 描述读。**不是 template · 不是 JSON schema · 就是一封给 Claude 的"操作指南信"**。

**典型结构**(所有命令都这样):

```markdown
# <Command Name>

<1-2 段定位 · 这命令干啥>

## Entry Point / Entry Point Logic   ← 必有

### Step 0: <前置 check>               ← 可选 · 有副作用时用
如果 .env 没配 → 提示 /setup · 但不 blocker ...

### Step 1: Scan / Detect / Read State
```
1. Glob projects/*/project.json
2. For each ... Read ...
3. Sort ...
```

### Step 2: Present Options
```
(Claude 该展示给用户的文字原样 copy · 包括空行 / emoji / 列表)
```

## Your Tasks                          ← 必有 · 核心
1. Gather Config — 用 AskUserQuestion tool 问 <具体 2-4 个问题 + 选项>
2. Execute — 跑 `python tools/xxx.py ...`
3. Update state — 写 project.json · phase 迁移 · 追加 session 历史
4. Regenerate project CLAUDE.md

## Project Integration                 ← 可选 · 有项目 context 时用
Before gathering configuration, check if we're in a project:
1. Look for project.json in current dir or parent projects/*/
2. If found → read project state
3. Check review gate:
   If phase == "review" or no reviewStatus → WARN + offer /scene-review first
```

### 2.3 三个特别关键的模式

**A. 前置 gate · 阻断式 prompt 而非硬 block**
`/generate-voiceover` 开头:
```
If project has `phase: "review"` or no `reviewStatus` on scenes:

⚠️  Scene review not complete.

Generating voiceover before review risks:
- Narration that doesn't match visuals
- Timing mismatches
- Wasted API credits if script needs changes

Run `/scene-review` first to verify each scene in Remotion Studio.

Options:
1. Run /scene-review first (recommended)
2. Generate voiceover anyway (not recommended)

Only proceed if user explicitly chooses option 2.
```
→ Claude 看到这段会**主动劝阻** · 但不硬 abort · 用户选 2 才走。

**B. 用 `AskUserQuestion` tool 搜集参数**
所有交互命令都明确调用:
```
Use the AskUserQuestion tool to collect:
  Question 1 - Basic Setup:
    - URL to record
    - Output filename
  Question 2 - Output Location:
    Options: ./output (default) / auto-detect from project / custom
  Question 3 - Viewport:
    1080p (default) / 720p / Mobile / Custom
```
→ Claude 实际会弹 AskUserQuestion 卡片给用户点。

**C. 状态写回(project.json)**
每条 execute 命令结尾都有:
```
After generation completes:
  - Update project.json:
    - Set audio.voiceover.status: "present"
    - If per-scene, set audio.voiceover.mode: "per_scene"
    - Transition phase if appropriate (review → audio → editing)
  - Add session entry
  - Regenerate project CLAUDE.md
```
→ **每个项目有自己的 CLAUDE.md** · 每次命令跑完会重新生成 · Claude 下次进项目读新鲜的 context。

### 2.4 调用方式
用户在 Claude Code 里直接打 `/video` · `/setup` · Claude Code 读 `.claude/commands/video.md` 的 body 作为 prompt 执行。

---

## NextFrame 启发 · /nf-xxx 命令该出哪些

按 toolkit 的"主入口 + CRUD + 执行 + 质量"四分法:

| 性质 | NextFrame 命令 | 对标 toolkit |
|---|---|---|
| **主入口** | `/nf` 或 `/video`(扫 projects/*/project.json · resume/new) | `/video` |
| **主入口** | `/nf-setup`(首次用 · 查 Rust toolchain · 装依赖) | `/setup` |
| **CRUD** | `/nf-template`(列 scene 模板) | `/template` |
| **CRUD** | `/nf-skills`(列 NextFrame 自家 skills) | `/skills` |
| **执行** | `/nf-build`(JSON→HTML) | `/record-demo` |
| **执行** | `/nf-render`(HTML→MP4) | `/generate-voiceover` |
| **质量** | `/nf-preview`(本地起 http server 看) | `/scene-review` |

不抄:`/redub` `/voice-clone` 那些是 AI 音频 · NextFrame 不碰。

---

## 3. Hooks / 自动化

**直接结论:toolkit 完全不用 hooks** · `.claude/settings.json` 是空对象 `{}`。

全部自动化靠两层:
1. **skill description 的触发词** — Claude 自己判断啥时候 Read 哪份 SKILL.md
2. **命令 body 的 Step 指令** — Claude 按 step 跑(scan → present → ask → execute → write-back)

**对 NextFrame 的启示**:
- day-1 可以不上 hooks · 跟 toolkit 一样完全靠 skills + commands 跑
- 要加 hook 的话只在刚性位置(比如 `PreToolUse` 拦 `rm -rf spec/`)· 不要为了"自动化"而加

---

## 4. 外接 AI 工具栈整合(★)

### 4.1 集成模式 · "Python CLI wrapper + skill 说明书" 双层

不是让 Claude 直接调 API。**每个外接 AI 服务都有一个 `tools/xxx.py` 包起来 · 然后 `.claude/skills/xxx/SKILL.md` 当说明书**。

| AI 服务 | Python wrapper | Skill | 实际部署 |
|---|---|---|---|
| **Qwen3-TTS** | `tools/qwen3_tts.py` | `skills/acestep`(+ 顶层 CLAUDE.md) | Modal 或 RunPod 自托管(Docker 镜像 `docker/modal-qwen3-tts/`) |
| **ElevenLabs**(商业 TTS) | `tools/voiceover.py --provider elevenlabs` | `.claude/skills/elevenlabs/` | 直接走 ElevenLabs cloud API(要 API key) |
| **FLUX.2**(图像生成) | `tools/flux2.py` | — | Modal 或 RunPod · `docker/modal-flux2/` |
| **Qwen-Image-Edit**(图像编辑) | `tools/image_edit.py` | `.claude/skills/qwen-edit/` + examples.md + prompting.md | RunPod(`docker/runpod-qwen-edit/`) |
| **ACE-Step 1.5**(音乐生成) | `tools/music_gen.py` | `.claude/skills/acestep/` | 默认 acemusic cloud API · 可选自托管 Modal/RunPod |
| **LTX-2.3**(视频生成) | `tools/ltx2.py` · 另有 `tools/chain_video.py` 做连续场景串接 | `.claude/skills/ltx2/` | Modal A100-80GB |
| **SadTalker**(talking head) | `tools/sadtalker.py` | — | Modal/RunPod |
| **RealESRGAN**(超分) | `tools/upscale.py` | — | RunPod |
| **ProPainter**(去水印) | `tools/dewatermark.py` | — | Modal/RunPod |

### 4.2 Python tool 的标准接口

**所有 tool 统一 CLI 约定**:
- `--cloud runpod|modal` — 选云提供商
- `--setup` — 一次性部署到云(自动创建 endpoint · 写 `.env`)
- `--progress json` — 结构化 JSON Lines 进度输出(stderr) · 给 Claude 读
- `--help` — 每个 tool 必有
- 错误处理:`Missing dependency` → 提示跑 `pip install -r tools/requirements.txt`

**Claude 调用模式**(从 openclaw SKILL.md 摘):
```
exec command:"cd ~/.openclaw/workspace/claude-code-video-toolkit && python3 tools/chain_video.py --output-dir /path/ --progress json ..." yieldMs:10000
```
→ 用 `yieldMs:10000` 每 10 秒让控制权交回 Claude · Claude 读 `--progress json` 输出 → 向用户播报进度 → 再 poll · **不用 background:true**(原因:Claude Code 的 agent run 结束 response 就结束 · background 没法中途汇报)。

### 4.3 API key 配置方式

**完全走 `.env` 文件** · `.env.example` 里所有 key 全列:
```bash
# 默认所有 key 注释掉(optional)
# ELEVENLABS_API_KEY=
# MODAL_LTX2_ENDPOINT_URL=
# RUNPOD_API_KEY=
# ACEMUSIC_API_KEY=
# R2_ACCESS_KEY_ID=
```

Python tool 用 `python-dotenv` 读。`.env` 在 `.gitignore`。

### 4.4 文件传输 · Cloudflare R2

**AI 工具要传大文件(图/音/视频)去云 GPU** · toolkit 用 Cloudflare R2(10 GB free tier + 零 egress fee):
```
.env:
  R2_ACCOUNT_ID=
  R2_ACCESS_KEY_ID=
  R2_SECRET_ACCESS_KEY=
  R2_BUCKET_NAME=video-toolkit
```
`tools/file_transfer.py` 是统一 upload/download wrapper · 所有云 GPU tool 都调它。没配 R2 就 fallback 到免费文件床(catbox.moe 之类)。

---

## 5. Remotion 底座的封装

### 5.1 templates/ 结构

**3 个模板 · 每个是独立的 Remotion 项目**:
```
templates/sprint-review/
├── package.json          (standard Remotion deps)
├── remotion.config.ts    (video config)
├── tsconfig.json
├── README.md             (怎么改配置 · 怎么加 demo)
├── CLAUDE.md             (每模板自己的 Claude context)
├── .gitignore
└── src/
    ├── Root.tsx          (Remotion composition 入口)
    ├── SprintReview.tsx  (主 composition)
    ├── index.ts
    ├── components/       (TitleSlide / DemoSlide / SummarySlide ...)
    └── config/
        └── sprint-config.ts   ← ★ 用户改这个
```

### 5.2 用户路径(最小闭环)

```bash
# 从 template 拷到 projects/(gitignored)
cp -r templates/sprint-review projects/my-video
cd projects/my-video
npm install

# 改 config(不改代码)
vim src/config/sprint-config.ts
# 放 demo 视频
cp ~/recording.mp4 public/demos/demo-feature.mp4

# 预览
npm run studio     # 本地起 Remotion Studio at :3000

# 导出
npm run render     # Remotion CLI 出 MP4
```

**不写 React 代码 · 只改 config** = 用户目标。模板组件/动画都预做好。

### 5.3 `lib/components/` + `lib/transitions/` · 跨模板共享组件

**不是独立 npm 包** · 就是仓库里的相对路径 import:
```tsx
import { AnimatedBackground, SlideTransition, Label } from '../../../../lib/components';
import { glitch, lightLeak, clockWipe } from '../../../../lib/transitions';
```

| 共享组件 | 用途 |
|---|---|
| `AnimatedBackground` | 漂浮形状背景(4 variant) |
| `SlideTransition` | 场景转场(fade/zoom/slide-up/blur-fade) |
| `Label` | 浮动标签 + JIRA ref 角标 |
| `Vignette` | 电影边缘暗角 |
| `LogoWatermark` | 角 logo |
| `SplitScreen` | 分屏对比 |
| `NarratorPiP` | 画中画讲解人 |
| `Envelope` | 3D 信封开启动画 |
| `PointingHand` | 动画手指 |
| `MazeDecoration` | 等距网格装饰 |

7 个自定义 transition:`glitch / rgbSplit / zoomBlur / lightLeak / clockWipe / pixelate / checkerboard` · 每个带可调参数(如 `checkerboard` 9 种 pattern:sequential / random / diagonal / alternating / spiral / rows / columns / center-out / corners-in)。

---

## 6. Python + TS 分工

**Python 55% · TypeScript 42%**(GitHub 显示)

| 语言 | 职责 | 文件 |
|---|---|---|
| **Python** | AI 模型调用 + 媒体处理 CLI + 云部署 | `tools/*.py`(22 个)· `docker/*/app.py`(Modal 入口) |
| **TypeScript** | Remotion composition + 视频渲染 | `templates/*/src/*.tsx` · `lib/components/*.tsx` · `lib/transitions/*.ts` |

**不是混用** · 是**分工**:AI 处理完的素材(mp3 / png / mp4)放 `public/` · Remotion 读素材合成最终视频。Python 和 TS 各干各的 · 通过**文件系统**通信。

**Docker 镜像里也是 Python**(`docker/modal-qwen3-tts/app.py` 是 Modal Python SDK · `docker/runpod-flux2/` 同样 Python)。

### NextFrame 选择

NextFrame 是 Rust + TS:
- Rust 干**所有核心**(engine / CLI / renderer / video encoding)· 别分出 Python
- TS 只在**用户手写 scene.json → HTML preview 的前端层**(零框架 · 纯 HTML + CSS + TS)
- **不抄这个双语言 stack** — toolkit 之所以 Python 多是因为 Python 是 AI 生态 lingua franca · NextFrame 核心在引擎不在模型调用

---

## 7. Modal / RunPod 云 GPU

### 7.1 两个云 · 可切换

- **Modal**(推荐):$30/月 free 算力 · 冷启动快 · `pip install modal && modal setup` 一次性认证 · `modal deploy docker/modal-xxx/app.py` 一键部署 · 控制台打印 endpoint URL
- **RunPod**(备选):pay-per-second · 约 $0.44/hr · 每 tool `--setup` 自动创 template + endpoint · ID 写回 `.env`

### 7.2 CLAUDE.md 建议组合

```
"Modal was added as a reliability fallback after RunPod outages, and offers faster cold starts."
```

→ 默认 Modal · RunPod 做备用。

### 7.3 成本预估(toolkit 自述)

- "更多 5-分钟视频 / 月 — Modal Starter 的 $30 够用"
- R2 free tier 10 GB + 0 egress 覆盖文件传输
- → **每月做个位数视频实际 $0**(只在超量时付)

### 7.4 Latency 数据(从 skill 提取)

| Tool | 模型 | GPU | 冷启动 + 推理 |
|---|---|---|---|
| LTX-2.3 | 22B DiT | A100-80GB | 5 秒视频 ~ 几十秒到分钟级 |
| FLUX.2 | FLUX image gen | — | 每图几秒 |
| Qwen3-TTS | Qwen3 | — | 短句秒级 |
| SadTalker | — | — | 取决于音频长度 |

---

## 8. 上手引导 / README + 第一个视频路径

### 8.1 README 结构(16.6 KB · 中等偏长)

1. **Banner GIF**(toolkit-banner.gif · 5 个大写词:NARRATE ▸ SCORE ▸ GENERATE ▸ COMPOSE ▸ RENDER)
2. **Quick Start**(5 行命令 · 复制即跑)
3. "What's free" 段(明确告诉用户哪些免费 · 哪些付费)
4. Requirements
5. **Note from the Author**(非 AI 生成声明 · 人味)
6. 功能列表
7. 详细文档链接
8. Contributing
9. License

### 8.2 用户第一个视频最短路径(README 明确列):

```bash
cd examples/hello-world && npm install && npm run render
# 没 API key 也能跑 · 立刻出 MP4
```

→ **"不用 setup 也能出视频"** 是 toolkit 最聪明的设计:降低第一次成功门槛。

### 8.3 完整用户路径(含 AI)

```
1. git clone ... && cd ...
2. pip install -r tools/requirements.txt    (可选 · AI 工具要)
3. claude                                     (在 toolkit 根启动 Claude Code)
4. /setup                                     (~ 5 min · 配云 GPU / R2 / voice)
5. /video                                     (扫项目 / 创新项目)
   → 选模板(sprint-review / product-demo)
   → 选品牌
   → 交互式规划 scene
   → 生成 VOICEOVER-SCRIPT.md
6. /record-demo     (录浏览器 demo · Playwright)
7. /scene-review    (逐场景在 Remotion Studio 看 · 质量闸口)
8. /design          (可选 · frontend-design skill 精修视觉)
9. /generate-voiceover   (ElevenLabs / Qwen3-TTS)
10. python3 tools/sync_timing.py --apply   (配音时长对齐场景时长)
11. npm run studio      (最终预览)
12. npm run render      (输出 MP4)
```

10 步 · **每步都有 slash command 或 1 行 Python** · 用户不碰代码。

---

## 总结 · 对 NextFrame 5 条具体启发(重点)

### 1. NextFrame Claude skills 包 day-1 应该长这样

**目录结构**:
```
nextframe-skills/                       ← 独立仓 · ChaosRealmsAI/nextframe-skills
├── README.md                           ← 装机 3 行
├── .claude/
│   ├── settings.json                   ← 空 {} · 不上 hooks
│   ├── skills/
│   │   ├── nextframe-toolkit/SKILL.md  ← 主入口(对应 openclaw-video-toolkit)
│   │   ├── nf-anchors/SKILL.md         ← v0.8 核心概念
│   │   ├── nf-tracks/SKILL.md          ← v0.8 核心概念
│   │   ├── nf-build/SKILL.md           ← JSON → HTML
│   │   ├── nf-render/SKILL.md          ← HTML → MP4
│   │   └── nf-preview/SKILL.md         ← 本地预览
│   └── commands/
│       ├── nf.md                       ← 主入口命令
│       ├── nf-setup.md                 ← 首次配置
│       ├── nf-build.md                 ← 建视频
│       └── nf-render.md                ← 导出
└── _internal/
    └── registry.json                   ← 结构化元数据
```

**每 SKILL.md 骨架**(强抄):
```yaml
---
name: nf-xxx
description: <动词> + Use when <场景> + Triggers include <关键词1, 关键词2, ...>
---
```
+ body:Quick Reference → Parameters 表 → When to Use/Not → Common Patterns → Troubleshooting

**装机方式**:
```bash
git clone https://github.com/ChaosRealmsAI/nextframe-skills.git ~/.claude
# 或
git clone ... && cp -r .claude ~/
```

### 2. 抄分发渠道 · 单渠道即可

**toolkit 只用 GitHub clone** · 没 npm · 没 marketplace · 900+ star。
→ NextFrame day-1 同样走 GitHub clone · 别上 npm(维护成本高 · 用户量小时不值)。如果将来有 openclaw/marketplace · 再加 frontmatter metadata。

### 3. 避坑 · 多语言 stack

toolkit Python+TS 是因为 AI 生态被迫。**NextFrame 单 Rust + TS 更干净** —— 引擎 Rust · 前端 TS · **别引入 Python 做 wrapper**(NextFrame 核心不需要外接 AI 模型)。

### 4. 避坑 · 强绑 Remotion

toolkit **整个视频渲染都靠 Remotion**(React-based)· 强绑风险:Remotion 出问题整个 toolkit 瘫;用户必须会 npm/React。
→ NextFrame **自家 engine** · 不绑任何外部框架 · 是核心竞争力。Remotion 的教训:`lib/components/` 共享组件要深拷贝 · 跨模板相对路径 `'../../../../lib/components'` 暴露(脆)。NextFrame 的 scene 模板要**自包含**不要共享组件引用。

### 5. 观察 · Digital Samba 带流量策略

**母公司 Digital Samba = B2B 视频会议 SaaS**(提 WebRTC SDK)· 主业跟视频 **强相关**但 toolkit 是独立副业。
- 策略看起来是:**开源副业 toolkit → 吸引 dev 用户注意 → 间接推 Digital Samba 主产品**(README 有母公司链接)
- 作者声明"非 AI 生成 · 月复一月打磨"→ 立技术品牌 · 拉 PR 贡献
- 927 star + 146 fork 印证奏效

→ **NextFrame 的类比**:如果没母公司 · 走**"直接切开发者工具市场"**策略:多抄 toolkit 的"最小可跑 demo"(`cd examples/hello-world && npm run render` 立刻出视频 · 不要 API key)· 降第一次成功门槛。

---

## 关键文件索引(绝对 URL)

**总入口**:
- https://github.com/digitalsamba/claude-code-video-toolkit
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/main/README.md
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/main/CLAUDE.md
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/main/_internal/toolkit-registry.json
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/main/.env.example

**skills 示例(都是 raw)**:
- `.../skills/openclaw-video-toolkit/SKILL.md`(顶级入口 · 对外分发)
- `.../.claude/skills/ltx2/SKILL.md`(tool-specific skill 范例)
- `.../.claude/skills/qwen-edit/SKILL.md`(+ examples.md / parameters.md / prompting.md 多文件范例)
- `.../.claude/skills/remotion/SKILL.md`(toolkit 自定义组件 skill)
- `.../.claude/skills/frontend-design/SKILL.md`(从 Anthropic 官方抄来)
- `.../.claude/skills/remotion-official/SKILL.md`(从 remotion-dev/skills 同步)
- `.../.claude/skills/ffmpeg/SKILL.md` · `elevenlabs/SKILL.md` · `acestep/SKILL.md` · `moviepy/SKILL.md` · `playwright-recording/SKILL.md` · `runpod/SKILL.md`

**commands 示例**:
- `.../.claude/commands/video.md`(主入口命令 · 最完整)
- `.../.claude/commands/setup.md`(首次配置向导)
- `.../.claude/commands/scene-review.md`(质量闸口)
- `.../.claude/commands/generate-voiceover.md`(带前置 gate 的执行命令)
- `.../.claude/commands/record-demo.md` · `.../.claude/commands/brand.md` · `.../.claude/commands/template.md` · `.../.claude/commands/skills.md`

**Python tool 示例**:
- `.../tools/qwen3_tts.py`(CLI 接口规范样例)
- `.../tools/chain_video.py`(多场景串接 · 最复杂)
- `.../tools/requirements.txt`

**Templates**:
- `.../templates/sprint-review/src/Root.tsx`
- `.../templates/sprint-review/src/config/sprint-config.ts`
- `.../templates/sprint-review/README.md`

**Docker(云 GPU 部署)**:
- `.../docker/modal-ltx2/app.py` · `.../docker/modal-qwen3-tts/app.py`
- `.../docker/runpod-qwen-edit/` 等共 15 个

---

## Appendix · 版本节奏观察

从 registry.json + releases 时间戳看:
- 2025-12-04:第一批 skill 落地(remotion / elevenlabs)
- 2025-12-08:beta 扩展(ffmpeg · playwright-recording)
- 2025-12-10:frontend-design 引入(从 Anthropic 官方抄)
- 2026-01-03:qwen-edit(AI 图像编辑 skill)
- 2026-02-19:remotion-official 从上游同步(节省自维护成本)
- 2026-02-23:runpod · 2026-03-22:acestep · 2026-03-25:ltx2 · 2026-04-08:ltx2 更新 · 2026-04-~:moviepy + hello-world example

**节奏**:大约每月 1-2 个新 skill · **每个 skill 初始 beta · 用一阵稳定了改 stable**。NextFrame 可以抄这个节奏。
