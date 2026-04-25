# NextFrame Charter

NextFrame turns structured JSON atoms into editable, verifiable, and exportable video.

## North Star

An AI agent can create a composition, verify the JSON, open it in the desktop editor, change text/style/timing, preview the result, and export the same saved source to MP4.

## Product Principles

- JSON is the source of truth.
- AI-authored JSON must be self-verifiable before a human is asked to judge it.
- Preview and export must use the same compiled source.
- HTML/CSS/SVG/Canvas/JS components are first-class video building blocks.
- The desktop editor is an inspection and authoring surface for AI-generated compositions, not a pile of feature-specific tabs.
- Local export must be interruptible and conservative by default.
- Repository structure must stay simple enough for a new AI or engineer to navigate without oral context.

## Current User

Primary user: a PM/operator working with AI agents to produce video from structured ideas.

Secondary user: AI coding agents that need stable CLI verification and clear repository boundaries.

## Anti-Goals · 红线

- 不做云端订阅 · 不做账号体系 · NextFrame 是单机 / 离线优先工具。
- 不做模板套娃(套图 / 套字 / 套转场)· AI 从结构化 JSON 生成 · 不从模板填空。
- 不上框架(Electron / React / Vue / Next.js / Tauri v1)· 用库 · 直调平台原生 API。详 `tech-choice` rule。
- 不让 AI 跳过 `nf verify` 直接交付 · 自验门禁是必跑 · 不是建议。
- 不靠拖拽 timeline 出视频 · 拖拽是辅助 · JSON 是源。
- 不在 spec 里堆叙述 · 6 份固定文档覆盖式最新态 · 历史进 devlog + git log。

## Core Assumptions · 核心假设

- 主用户是 PM + AI agents · 不是视频剪辑师 · 工具语义对齐 PM 心智 · 不模仿 PR / FCP。
- 视频生成的瓶颈是"结构化 + 自验" · 不是渲染速度。
- macOS 是主战场(NextFrame.app · WebView + native bridge)· Windows/Linux 是后续。
- 单 composition 适合单机内存 · 不需要流式 / 远端渲染 · 单机 GPU 够用。
- AI 自验工具(nf capture / click / devtools / verify)走产品内建代码路径 · 不调外部 GUI 自动化框架。

## Terms

- Composition: one JSON video document under `examples/*/compositions/`.
- Clip: one video segment inside a composition. This is the AI authoring unit.
- Anchor: a named time point scoped to one clip unless explicitly documented otherwise.
- Track: one lane inside a clip. Tracks have `kind` values such as `component`, `tts`, `subtitle_timeline`, `subtitle`, or `audio`.
- Item: one timed unit inside a track.
- Component: HTML/SVG/Canvas/JS module mounted by the runtime.
- Source: compiled export/preview JSON consumed by the runtime and recorder.
- Archive: local non-source material stored outside the repo at `../NextFrame.archive/`.
