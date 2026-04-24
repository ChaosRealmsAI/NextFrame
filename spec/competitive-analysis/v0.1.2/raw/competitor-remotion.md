# Remotion

**1. 一句话**: React-based "programmatic video" 框架 — 用 React/TSX 组件描述视频 · 渲染器用 headless Chrome 逐帧截图拼 mp4。
**出生**: 2020 年(首版开源) · 2026-01 Agent Skills 发布后 AI-native 定位大涨

**2. 技术架构**
- 主语言: TypeScript(仓库 74.2% TS) · 核心 render pipeline 用 Node 驱动 puppeteer
- 渲染层: **headless Chromium(默认 headless-shell · 可选 chrome-for-testing)** + Puppeteer 逐帧 screenshot · 音视频合成交 ffmpeg。GPU 在 headless 默认禁用(要显式开)。存在第三方 Rust 重写 `rustymotion` 想替掉 Chrome
- 部署: 本地 CLI / 服务端 / Serverless(AWS Lambda 官方模板) · SaaS 模板 "Prompt to Motion Graphics" 已提供
- 依赖 Node?: **是**(`npx create-video` · Node runtime 强绑)

**3. AI 集成**: 不内建 LLM · 走**外接 agent skills** 模式 — 2026-01-20 发布 Agent Skills · 对 Claude Code / Gemini CLI / Cursor / OpenCode / Codex 同时支持(Claude Code + Gemini CLI 各 ~108K 装机 · Cursor/OpenCode/Codex 各 ~92-93K)。文档原生 markdown 可抓(`.md` 后缀 / Accept header 内容协商)· agent 吃 prompt → 生成 React 组件代码 → Remotion render。官方 SaaS 模板 "Prompt to Motion Graphics" 封装此链路

**4. 输出**: mp4=是(主) · webm/gif/png 序列/audio-only 都支 · 4K=是(scale factor 放大 · vector 锐利) · HDR=**否**(headless Chrome 只出 sRGB · 官方明确不做 HDR · 硬伤) · 帧序列=是 · live preview=是(Remotion Studio 本地预览 + Player 组件运行时播放)

**5. 商业**: **双轨 source-available**(非标准开源 · 自定 LICENSE.md · 商业条款限制)· 免费个人/≤3 人团队商用 · Creators $25/seat/月 · Automators $0.01/render + $100/月 minimum · Enterprise $500+/月。无官方 cloud render(鼓励自己部署 Lambda)· 卖 Editor Starter 模板和 store 物料

**6. DX**: 文档=**优秀**(AI-first · 可抓 markdown · 例子 gallery 丰富 · showcase 多) · 例子=**多**(官方 examples + 社区模板 + av/remotion-bits 积木库) · 上手难度=**React 开发者 10 分钟上手 · 非 React 有门槛**(必须会 React/TSX)

**7. 强 vs 弱(NextFrame 视角)**

强(我该学):
- **AI-native 文档基础设施**: `.md` URL 后缀 + Accept header 内容协商 · agent 直接抓 markdown · NextFrame 文档应该一开始就这么做
- **Agent Skills 打包模式**: 把"框架能力"封成 skill 上架 skills.sh · 让任何 agent(Claude Code / Cursor / Codex)即插即用 — NextFrame "任何 agent 都能驱动"(P9)需要同款发行通道
- **Player 组件 + Studio live preview**: 编辑循环体验 · 不是每次 render 等几分钟 · NextFrame 的 preview 必须做到同级
- **Serverless Lambda 模板**: 让用户自己部署 · 不抢 cloud render 生意 · 商业克制
- **商业分层清晰**(免费 ≤3 人 / Creators / Automators 按 render / Enterprise): 可借鉴

弱(我已胜过 / 该避开):
- **HDR 不支持(硬伤)**: Chrome headless 只出 sRGB · 架构决定天花板 · NextFrame 4K HDR 60fps 从设计就绕开此坑 = **直接胜过**
- **逐帧 screenshot + Puppeteer 性能**: 渲染慢是共识(rustymotion 第三方 Rust 重写就因此诞生)· NextFrame Rust 原生 + GPU 路径起点就高
- **强绑 React + Node**: 不会 React 的人(含 PM / 设计 / 大多数视频作者)进不来 · NextFrame **JSON project(声明式)+ frame pure 纯函数** 语言无关 · 门槛更低 · agent 写更干净
- **source-available 不是真开源**: 有团队规模限制和商业条款 · 企业采纳有摩擦 · NextFrame 可选更干脆的 license
- **"Make videos with React" 定位偏开发者**: NextFrame "AI agent 把结构化信息变视频" 定位更上游 · 打的是 agent 生产力而非前端工程师手艺

**8. 数据**
- URL: https://remotion.dev
- GitHub: https://github.com/remotion-dev/remotion
- Stars: **44.1k**(另有 25.3k 的旧数据 · GitHub 当前页是 44.1k)
- 活跃度: **极活跃** · 2026-04-20 刚发 v4.0.450(本月有 release)· 持续高频迭代
- npm 下载: ~170k/周(`remotion` 包)

---

**结论(对 NextFrame 1-2 句启发)**: Remotion 是当前 programmatic video + AI agent 赛道最强对手 · **架构天花板**已定(Chrome headless · 无 HDR · Node 绑定 · React 门槛)· NextFrame 的 Rust + 4K HDR 60fps + JSON-pure-frame + agent 无关 是站得住的差异化。必须立刻抄 Remotion 的**AI-native docs(`.md` 后缀)+ Agent Skills 发行通道 + live preview DX** — 这三点决定 agent 生态话语权 · 技术再强没 agent 用不上就输。
