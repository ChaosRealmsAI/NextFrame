# Hyperframes

**0. 项目识别**: 候选有 4 个 —— (a) `heygen-com/hyperframes`(HeyGen 开源 HTML→video 框架 · Apache-2.0)· (b) `hyperframes.app`(独立 URL→video SaaS · 赛道相邻但非 AI agent 框架)· (c) `hyperframe.ai`(专业服务解说视频 SaaS · 不同项目)· (d) `hyperframeresearch.com`(云/主机硬件研究)。**锁定 (a) heygen-com/hyperframes** —— 唯一真正在"AI agent 写 HTML/CSS/JS → deterministic MP4"赛道与 NextFrame **正面对线**的项目。2026-03-10 开源 · 当前 8205 stars · HeyGen 官方项目 · 定位和 NextFrame 几乎 1:1(HTML 作为视频 DSL · 让 AI agent 写)。**这就是用户点名的那个 · 且是目前 NextFrame 最强正面竞品**。

**1. 一句话**: HeyGen 出品的开源 HTML→MP4 渲染框架 · 让 AI agent(Claude Code / Codex / Gemini CLI)用 HTML + CSS + GSAP 写视频组件 · headless Chrome + FFmpeg 渲染。
**出生**: 2026 年(repo 2026-03-10 首 commit · 公开时间约 1.5 个月)

**2. 技术架构**
- 主语言:TypeScript(~3.5M bytes · 占绝对主体)+ 少量 JS/Python/Shell
- 结构:Bun 管的 monorepo · 7 packages(`cli` / `core` / `engine` / `producer` / `studio` / `player` / `shader-transitions`)
- 渲染层:**Puppeteer 驱动 headless Chrome · `beginFrame` API 逐帧 seek** · 帧 pipe 给 FFmpeg 编码(直接抄了 Remotion 的 image2pipe 模式 · README 里明确写 attribution)
- 动画层:**Frame Adapter 模式**(插拔动画 runtime)· 官方支持 GSAP / Lottie / CSS / Three.js / shader transitions
- 部署:npm 包 `hyperframes` · 本地或 Docker 跑 · `npx hyperframes init / preview / render`
- 依赖:Node ≥ 22 + FFmpeg
- 授权:**Apache 2.0**(关键卖点 · 对标 Remotion 的 source-available 许可)

**3. AI 集成**: **这是它的 one big bet**。不内置 LLM · 而是"**外接 AI agent 友好**":
- `npx skills add heygen-com/hyperframes` → 给 Claude Code / Cursor / Gemini CLI / Codex 装 skills
- Claude Code 里注册成 slash commands:`/hyperframes`(写组件)/ `/hyperframes-cli`(CLI)/ `/gsap`(动画)/ `/website-to-hyperframes`(URL 转视频)
- CLI 默认 **non-interactive**(专门为 agent 设计 · 不卡 prompt)
- 支持 MCP(GitHub topics 里列了 `mcp`)
- 路径和 NextFrame 完全一致:**产品 = 框架 + agent skills · 用户外接 Claude Code 等**

**4. 输出**:
- 格式:**MP4(h264)· MOV · WebM(VP9 + alpha 通道)**
- 分辨率:默认 1920×1080(launch 视频示例) · API 支持 landscape/portrait + 16:9/9:16 · **4K 未在文档显式承诺 · HDR 无支持**
- deterministic 渲染(相同输入 = 相同输出 · CI 友好)
- 帧精度:`beginFrame` 逐帧抓 · 不靠 wall-clock(这点胜 Remotion)

**5. 商业**: **开源 · 零收费 · 无 per-render 费 · 无 seat cap**。
- HeyGen 公司主营 SaaS(AI 虚拟人视频 · $500M 估值 · 157-332 人团队 · Benchmark 领投的 $60M A 轮)· hyperframes 是开源副项目 —— 目的明显是**卡 AI agent 视频生成的开发者心智 + 给 HeyGen 主 SaaS 导流**(catalog / 模板 / blocks)
- 不是直接商业化 · 但借助 HeyGen 品牌 + 渠道 · 冷启动远超典型开源项目

**6. DX**:
- 完整文档站 `hyperframes.heygen.com`(Introduction / Quickstart / Guides / API Reference / Catalog)
- **50+ 现成 blocks**(社交 overlay / shader transitions / 数据可视化 / 电影感效果)· `npx hyperframes add <name>` 一行装
- Browser-based Studio(可视化组件编辑器)
- 可嵌入 web component `<hyperframes-player>`(别人网页直接播)
- GSAP 专门 skill(动画不用自己查文档)
- **和 Remotion 的对比表**写在 README(诚实列优劣势)—— DX 成熟度极高

**7. 强 vs 弱(NextFrame 视角)**

强(Hyperframes 碾压 NextFrame 的地方):
- **时间机会**:早 NextFrame 约 1.5 个月开源 · 已 8.2k stars + 630 forks + 活跃 PR(今天还在 push)· **先发占位 AI-agent-writes-HTML-for-video 赛道**
- **HeyGen 品牌 + 渠道**:500M 估值公司背书 · 主 SaaS 带流量 · NextFrame 零公司背景起步
- **生态厚度**:7 packages + 50+ blocks catalog + Studio 可视编辑 + web component player · NextFrame 目前 empty shell · 差距约 6-12 月工程量
- **agent 集成路径验证**:skills + MCP + slash commands 这套玩法已经跑通 · 是 NextFrame 想做的也是 agent-first 路径的"已有答案"
- **跨动画库适配**:Frame Adapter 模式容纳 GSAP/Lottie/Three/shader · NextFrame 若走同路等于抄
- **OSS 定位清晰**:Apache 2.0 直接打 Remotion 的 source-available 痛点 · 商业用户全流入
- **团队 + 资金**:HeyGen 有人有钱可持续投入 · NextFrame 单人项目

弱(NextFrame 的真差异化空间):
- **无 4K / HDR**:1080p 为主 · 4K / HDR 未承诺 —— NextFrame 明确瞄 **4K HDR MP4** · 这是**真差异化点**(高端场景:教育 / 产品展示 / 4K 屏播放都卡在这)
- **纯 TypeScript + Node + Chrome**:不是 Rust · 渲染链依赖 Puppeteer + FFmpeg · 性能天花板受 Chrome 帧抓限制 · NextFrame Rust 栈在**速度 / 确定性 / 单二进制分发**上可做文章
- **无 macOS 桌面壳**:纯 CLI + 浏览器 Studio · NextFrame 规划 macOS 原生壳 · PM 友好度更高(若做到)
- **Web 动画天花板**:虽然 GSAP / Three 强 · 但受浏览器 render pipeline 约束 · **Rust + 原生 compositor 路径**(wgpu / Metal / AVFoundation 等)在 HDR / 色彩精度 / 高端视觉效果上有空间
- **场景定位混**:README 示例从 TikTok 9:16 到 bar chart race 到产品 intro 全覆盖 · 缺"专精某垂类"深度 —— NextFrame 可挑"教育讲解 / 数据报告 / 4K HDR 产品展示"某一垂类深做
- **Headless Chrome 的 drift 问题**:Chrome 升级可能破 deterministic · 长期维护成本 —— Rust 原生栈天然免疫

**8. 数据**
- URL: https://hyperframes.heygen.com/(文档)· https://www.hyperframes.dev/(landing)
- GitHub: https://github.com/heygen-com/hyperframes
- Stars: **8205**(2026-04-21 拉取 · 仅 42 天涨到 8k+ · 增速非常猛)
- Forks: 630
- Open issues: 14(被活跃处理中)
- Watchers/subscribers: 25
- 活跃度:**极高** —— 最后 push 2026-04-21 04:46(今天)· 持续集成 skills / catalog / docs · 文档站 `hyperframes.heygen.com` 完整
- License: Apache 2.0
- NPM:已发包 `hyperframes` / `@hyperframes/core` / `@hyperframes/engine` / `@hyperframes/producer` / `@hyperframes/studio` / `@hyperframes/player` / `@hyperframes/shader-transitions`
- 团队规模:HeyGen 母公司 157-332 人(Latka/PitchBook 区间)· hyperframes 专职团队规模未公开 · 但 HeyGen 内部工程资源充沛(曾用 Remotion 生产 · README 致敬)
- 公司:HeyGen(成立 2020 · 估值 $500M · 总融资 $74M · Benchmark 领投 · $100M ARR / 2025 数据)
- 赛道竞品:Remotion(React-based · source-available · 被 Hyperframes 正面对标)

---

**结论(对 NextFrame 1-2 句启发)**: Hyperframes 已经把"**AI agent 写 HTML → MP4**"这条赛道的**开源 JS/TS 位置占了** · NextFrame 走纯 Rust + 4K HDR + macOS 原生壳 + 垂类深做 是**唯一有意义的差异化**。若只做"HTML → MP4 通用框架"已被降维打击(品牌 / 生态 / 时间三维度全输)· 必须在 **4K HDR 色彩精度 / 原生性能 / 桌面体验 / 某垂类场景深做** 至少拿下 2 个才能立。

**调研注**:
- 信息充足 · 文档 + GitHub + README 一手数据齐 · 8 维度全填真数据无空缺
- 用户原话"Hyperframes"有 4 个候选 · 但明显指 HeyGen 这个(赛道 / 热度 / 时机都对得上) · 锁定依据:2026-03-10 开源 + 1.5 月 8.2k stars + HTML+CSS+JS+AI agent 1:1 对标 NextFrame 定位
- 时间线警示:Hyperframes 3/10 开源 · NextFrame 4/21 从 empty shell v0.1.0 重启 · **NextFrame 被先发 42 天** · 差异化窗口正在关闭 · 加快 4K HDR + Rust 栈优势建立
