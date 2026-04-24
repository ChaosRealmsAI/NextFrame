# Revideo

**1. 一句话**: 把 motion-canvas 从"独立桌面动画 app"fork 成"开发者用 TS 描述视频模板 + API 动态渲染"的框架,定位程序化视频生成基础设施。
**出生**: 2024 年 4 月(YC W24/S24 Launch · fork 自 motion-canvas,后者由 aarthificial 2022 年开始)
**关系**: **是 motion-canvas 的 fork** · 动画引擎/generator 协程时序模型/Canvas 2D 渲染全部继承;增量是 headless 渲染 + 并行化 + audio 支持 + API 化。

**2. 技术架构**
- **语言**: 纯 TypeScript(框架本体 + 用户写的视频模板都是 TS)
- **渲染层**: Canvas 2D(继承 motion-canvas)· headless 模式下跑 headless browser 抽帧 · **视频元素帧抽取用 ffmpeg**(PR #33 明确 `use ffmpeg to step through frames of video elements`,替代 HTML video seek)
- **合成出片**: ffmpeg 拼帧 + 音轨
- **预览**: React Player 组件嵌浏览器实时预览
- **部署形态**: 库 + CLI 暴露渲染 endpoint(官方给了 Google Cloud Run 部署例子)· Lerna monorepo + Vite 构建
- **license**: MIT

**3. AI 集成**: **Revideo 本体没有 AI 集成**(README / docs 0 处 MCP / LLM / agent 提及)。**但团队整个转向了 Midrender**(2025 起官方声明 "The team behind Revideo now primarily works on Midrender · Revideo 的 animation engine continues to be developed as part of Midrender, though recent changes have not yet been upstreamed")。**Midrender 是闭源 visual editor + 内置 MCP server**,可以接 Claude Code / Cursor 从终端生成动画内容。所以"AI 集成"活在 Midrender 里 · Revideo 开源仓处于半维护态。

**4. 输出**: MP4 / WebM(ffmpeg 合成) · **没找到任何 4K / HDR 的声明** · 文档只提 "export to MP4" · 实测分辨率受 Canvas 2D + headless browser 性能限制,典型是 1080p。live preview 强项(React Player)。
**5. 商业**: Revideo 开源免费 MIT · **真正的变现在 Midrender**(闭源 SaaS,有 pricing 页,freemium/tiered)。开源仓是漏斗顶。
**6. DX**: docs.re.video 文档齐 · 有 saas-template 仓 · examples 仓带若干示例(avatar / TikTok 模板) · "TypeScript 程序员 5 分钟上手"友好 · 对非 React/TS 用户不友好。

**7. 强 vs 弱(NextFrame 视角)**

强:
- **生态路径验证**: "程序化视频"这个 niche 有市场 · YC 背书 · 3.7k stars 说明需求真实
- **TS 单一语言**: 整条链路 TS · 对前端 agent 友好 · 编辑器/preview/render 都同一套
- **motion-canvas 血统**: generator 协程时序模型是精品 · 动画表达力高于 Remotion 的 React frame 模型
- **headless 渲染 + API 化**: 证明了 "motion-canvas 思路能当 SaaS 后端用"

弱:
- **Canvas 2D 天花板**: 没 HDR · 没 10-bit · 没硬编码加速路径 · 4K 慢到不可用(这是 NextFrame 的破局点)
- **AI 集成全在闭源 Midrender**: 开源仓半弃坑 · 用户想要 "AI → 视频" 只能上 Midrender SaaS
- **TS 思维绑定**: 视频描述 = TS 代码 + generator · LLM 生成 TS 比生成 HTML/CSS 难调教(syntax error / type error 调参高)
- **无桌面壳**: 纯库/API,用户要自己搭前端 · 没有 NextFrame 那种 macOS 原生壳
- **渲染后端绑 headless browser**: 调试困难 · 性能上限低

**8. 数据**
- URL: https://revideo.org · docs.re.video · https://midrender.com/revideo
- GitHub: https://github.com/redotvideo/revideo
- Stars: **3.7k**(2026 Q1)
- 活跃度: **半维护**(团队主力转 Midrender · upstream 落后于闭源分支 · 开源仓仍接 PR 但节奏慢)
- npm: `@revideo/core` / `@revideo/cli` / `@revideo/player` · 具体下载量未查到
- YC: W24/S24 Launch(2024-04-11)· 现已 pivot 为 Midrender(YC 页独立)

---

**结论(对 NextFrame 1-2 句启发)**:
1. **"开源动画引擎 + 闭源 AI SaaS"是验证过的商业路径**(Revideo → Midrender),NextFrame 如果走开源引擎可参考 · **但 AI 层设计要从第一天就想清楚开/闭源边界** · 不要像 Revideo 开源仓被架空。
2. **NextFrame 选 HTML/CSS/JS 描述 + Rust 渲染 + 4K HDR 是对 Revideo 的精准差异化打击** — HTML 比 TS generator 更适合 LLM 生成(HTML 是 LLM 最熟的 DSL)· Rust 渲染后端能打穿 Canvas 2D 的 4K/HDR 天花板 · macOS 原生壳避开 "用户自己搭前端" 的落地摩擦。Revideo 验证了市场 · NextFrame 的技术栈正好填它的坑。
