# Etro.js

**1. 定位 + 出生年**
TypeScript 浏览器端视频编辑框架(programmatic video editing in the browser)· 2020 前后起家 · latest v0.13.0(2026-03-18)· 定位"浏览器里的 after-effects 底层"· 给你搭视频编辑器工具 / 不是给你直接出片。

**2. 技术架构**
- TypeScript 94% · 纯 Web 技术栈
- 核心抽象:`Movie` / `Layer` / `Effect` · layer 类型(video / audio / image / text)
- **WebGL + GLSL shaders** 做硬件加速的视频特效 · 用户可自写 shader
- Web Audio API 处理音频
- 浏览器内实时合成 · 无服务端渲染

**3. AI 集成**
**无**。纯 JS API 驱动 · 完全没 agent / LLM / prompt 集成痕迹。

**4. 输出(4K? HDR?)**
- 三种输出模式:canvas 实时播 / WebRTC 流 / blob 录制(MediaRecorder)
- **codec 不明确** — 依赖浏览器 MediaRecorder 能力(WebM / VP9 / H.264 视浏览器)
- **分辨率:未声明 4K** · 理论可设 canvas 尺寸但受浏览器和 GPU 限制
- **HDR:完全不支持 / 未提及**

**5. 商业模式**
开源 GPL-3.0 · 社区驱动 · 无商业化 · 无 SaaS。

**6. DX 文档**
- 官网 etrojs.dev 有 Getting Started / API reference / tutorials
- Discord + Twitter 社区渠道
- npm `etro` 包 · 手写 JS API 风格(new Movie / addLayer)

**7. 强 vs 弱(NextFrame 视角)**

| | Etro | NextFrame |
|---|---|---|
| 强于 NextFrame | WebGL shader 特效生态成熟 · 纯浏览器零后端 · 实时预览丝滑 | - |
| 弱于 NextFrame | **无 AI 原生** / **无 CLI** / 无 4K HDR / 非 agent-friendly(JS API 需人类手写) / 输出靠 MediaRecorder 不可控 / 无桌面壳 | agent-first · CLI 驱动 · Rust 后端 4K HDR 硬解 · macOS 壳 |

**Etro 是 AE 编辑器的"零件库"** · NextFrame 是"AI 输入 → 成片输出"的管线。不是直接竞品 · 但同赛道底层能力参照物。

**8. URL / 活跃度**
- Docs: https://etrojs.dev
- GitHub: https://github.com/etro-js/etro
- **Stars: 1.1k · Forks: 90 · 822 commits · 21 releases**
- 活跃度:中等 · v0.13.0(2026-03-18)· 月更级别 · 非爆款

---

# 探索发现

## 探索 1 · HyperFrames(HeyGen 出品 · 最直接竞品 🔴)

**1. 定位 + 出生年**
"An open-source, agent-native HTML-to-video system" · HeyGen 官方孵化(github.com/heygen-com/hyperframes)· 2025-2026 新品 · **跟 NextFrame 定位几乎一致** — AI agent 写 HTML/CSS/JS → headless browser 抓帧 → MP4。

**2. 技术架构**
- **headless browser 渲染**(Puppeteer/Playwright 类)· frame-by-frame 捕获 · FFmpeg 合成
- 支持动画栈:**CSS / GSAP / Lottie / shaders / Three.js** — 基本覆盖 web 动画全生态
- 云 + 本地双形态("Zero Setup Cloud" + 开源自部署)

**3. AI 集成**
**agent-native 是一级卖点** · 整个系统设计就为"AI 写代码 → 出视频"· 比 NextFrame 还前瞻(NextFrame 是外接 agent · HyperFrames 是内建 agent workflow)。

**4. 输出**
- 格式:**MP4 / MOV / WebM**
- **分辨率:4K+** · 明确声明
- 质量硬指标:**"100% Deterministic Frame Capture · 0 Dropped Frames"**
- **HDR:未明确提及** — 但 4K+ 是公开的

**5. 商业模式**
双轨:**开源 core + 云 SaaS + API 付费**。HeyGen 背书(HeyGen 自己是 AI avatar 视频大厂 · 估值十亿级)。

**6. DX 文档**
官网 hyperframes.app · 免费小工具(URL→MP4 / JSON→chart video)· GitHub 开源 · API doc 齐。

**7. 强 vs 弱(NextFrame 视角)**
- **强于 NextFrame:** HeyGen 资源池(分发 + 品牌)· 云 SaaS 零部署 · 动画生态齐全(Lottie/Three.js 现成支持)· **"deterministic frame capture"确定性承诺** — 这是 NextFrame 该抄的硬指标
- **弱于 NextFrame:** 云优先 → 数据隐私 / 本地性弱 · 无 macOS 桌面壳 · Rust 原生 vs Node.js headless 性能差距(NextFrame 底层可挖更深)· 未宣称 HDR

**🔴 结论:HyperFrames 是 NextFrame 最接近的正面竞品 · 必须持续追踪 · 差异化要想清楚**(Rust+HDR+本地桌面壳是 NextFrame 的护城河方向)。

**8. URL**
- 官网: https://hyperframes.app
- GitHub: https://github.com/heygen-com/hyperframes
- Stars: 信息有限(新项目)· 但 HeyGen 背书意味起势快

---

## 探索 2 · Claude Code Video Toolkit(digitalsamba)

**1. 定位 + 出生年**
"AI-native video production workspace for Claude Code" · v0.14.2(2026-04-09 · 非常活跃)· **Claude Code 专属的视频生产工具箱** — skills + commands + templates + Python 工具链。

**2. 技术架构**
- **底座是 Remotion**(React 组件渲染视频)· FFmpeg 做最终合成
- Python 55.7% + TypeScript 42.3% + Dockerfile 2% — 多语言混搭
- 整合 Playwright(截屏 / web 交互)· Modal / RunPod(云 GPU)
- 外接 AI 能力:Qwen3-TTS · ElevenLabs · FLUX.2(图)· ACE-Step(音乐)· LTX-2(AI 视频片段)

**3. AI 集成**
**不是框架 · 是 Claude Code 的 skills 包** — 给 Claude Code 装上一套"懂视频生产"的知识 + 工具 · 让 Claude 跑 slash command 端到端做视频。这个形态 NextFrame 可以参考(出 claude-code skills 包分发)。

**4. 输出**
- **MP4 · FFmpeg 渲染 · 分辨率可配置**
- 未声明 4K / HDR · 应该支持但不是卖点

**5. 商业模式**
**MIT 开源** · 无商业化 · digitalsamba(视频会议厂)做的开源侧项目。

**6. DX 文档**
GitHub README + 内置 slash commands · 为 Claude Code 而生 · 装了就能用。

**7. 强 vs 弱(NextFrame 视角)**
- **强于 NextFrame:** **分发形态聪明**(Claude skills 包 · 即装即用)· 生态整合广(TTS / 图 / 音乐 / AI 视频片段一条龙)· Remotion 成熟底座
- **弱于 NextFrame:** React/Remotion 底座 = JS 性能天花板 · 非 4K HDR 专业向 · 多语言 stack 维护复杂 · 无桌面壳

**8. URL**
- GitHub: https://github.com/digitalsamba/claude-code-video-toolkit
- **Stars: 926 · Forks: 146 · v0.14.2(2026-04-09 · 非常活跃)**
- License: MIT

---

**汇总结论(3 竞品对 NextFrame 综合启发)**:

1. **HyperFrames 是最近距离镜像 · 差异化必须想清楚** — 它用 Node.js headless browser · NextFrame 用 Rust · Rust 的价值必须体现在**性能 / 4K HDR 硬解码 / macOS 原生集成**这三点硬指标上 · 否则用户选它不选你。

2. **Agent-native 已成行业共识(3/3 新玩家都标)** · NextFrame "外接 AI agent" 思路正确但不激进 — 可考虑像 Claude Code Video Toolkit 一样**出 Claude skills 包**做分发(低成本让 Claude 懂 NextFrame)。

3. **Etro.js 路线(纯浏览器 WebGL)已被超越** — 2026 主流是 "headless browser 抓帧 + FFmpeg 合成" · HyperFrames 的 "**deterministic frame capture · 0 dropped frames**" 是该抄的硬承诺(NextFrame 要把 4K HDR 每一帧可验证做成招牌)。
