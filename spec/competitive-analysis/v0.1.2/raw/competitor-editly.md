# Editly

**1. 一句话**: "Slick, declarative command line video editing & API" —— Node.js + ffmpeg 的声明式视频编辑器 · JSON5 spec 描述剪辑 · CLI/API 双入口。
**出生**: 2020 年(首次提交 2020-04-15)

**2. 技术架构**
- 主语言: TypeScript(87.7%)+ JavaScript(11.1%)· ESM only
- 渲染层: ffmpeg(编码/合成主力) + HTML5 Canvas + Fabric.js + WebGL/GLSL(via headless-gl) + ffmpeg audio filters
- 核心思路: 逐帧用 canvas/fabric/gl 渲染图层 → 喂给 ffmpeg 组装 MP4
- 部署: npm 包(`editly`)· 依赖外部 ffmpeg/ffprobe · Linux 需额外 headless-gl 步骤
- 最新 release: v0.15.0-rc.1(2025-01-19)

**3. AI 集成**: **完全无**。README 零 LLM / prompt → JSON / AI 描述。纯声明式 · 人写(或外部脚本生成)JSON5。

**4. 输出**: mp4=✅ · mkv=✅ · gif=✅ · 4K=部分(README 提"supports any input size, e.g. 4K video and DSLR photos" · 输出分辨率任意但**无 4K 专项优化或明确 pipeline**)· HDR=❌(无任何 HDR / 10-bit 提及)· 帧序列=❌(直接出 mp4/mkv/gif · 不暴露中间帧)

**5. 商业**: MIT · 纯开源。仅 PayPal 捐赠 + GitHub Sponsors 链接。**无 cloud 服务 / 无付费版 / 无企业版**。单一作者(mifi)业余维护。

**6. DX**: README 文档详细(layer types / transitions / defaults / JSON5 schema 都有)· `examples/` 目录带可运行 JSON5 样本(videos.json5 等)· 但**无正式 JSON Schema 文件**(只靠 README 描述 + TS types)· JS API 和 CLI 双入口 · 易上手(npm install + 一个 json5 就能跑)。

**7. 强 vs 弱(NextFrame 视角)**

强:
- **JSON spec 抽象早验证过**: clips[] + layers[] + transition + audio · schema 简洁直观 · 证明"JSON → 视频"思路成立(NextFrame 同类路线)
- **layer 类型丰富**: video/audio/image/title/subtitle/news-title/slide-in-text/fill-color/radial-gradient/linear-gradient/rainbow/canvas/fabric/**gl(GLSL shader)** —— 底层能力已下探到 shader
- **transition 生态复用 gl-transitions**: 社区资源直接用 · 不重造轮子
- **MIT + 单文件 spec**: 5.4K stars 验证市场需求 · 上手门槛低

弱:
- **HTML 表达力 vs primitive 图层**: editly 是"图层栈 + 固定 layer type"模型 · **不是 HTML/CSS/DOM** · 做复杂布局 / 动态文字排版 / 响应式 UI 远不如 NextFrame 的 HTML 路线(editly 要写 canvas/fabric/gl 代码 · NextFrame 写 HTML/CSS/JS 即可)
- **无 4K HDR 专项**: 4K 靠"分辨率参数任意"带过 · 无 10-bit / Rec.2020 / HDR10 / Dolby Vision pipeline
- **无 AI 集成**: 纯声明式 · 没有 prompt → spec 或 agent 驱动设计(NextFrame 的 "外接 AI agent" 差异点明确)
- **活跃度下行**: 最近一次 commit 2025-02-20 · 距今(2026-04-21)约 14 个月无更新 · 最新 release 仍是 `v0.15.0-rc.1`(rc 状态未转正)· 单一作者维护 · **半停滞**
- **依赖链重**: Node.js + ffmpeg + headless-gl(Linux 坑)· NextFrame 的 Rust 单二进制更干净
- **渲染性能**: 逐帧 canvas → ffmpeg 管道 · 无 GPU 加速视频层 · 4K 大片慢

**8. 数据**
- URL: https://github.com/mifi/editly
- GitHub: mifi/editly
- Stars: 5,380 · Fork: 367
- License: MIT · 主语言: TypeScript
- 活跃度: **半停滞**。最后 commit **2025-02-20**(14 个月前)· 最新 release v0.15.0-rc.1 于 2025-01-19(rc 未转正)· 作者转向其他项目 · repo 未 archive 但事实性停更
- npm: 包名 `editly`(下载数据 npm 页 403 拿不到 · 但有第三方 fork `editly-faster` 说明社区仍在尝试维护)

---

**结论(对 NextFrame 1-2 句启发)**:
Editly 验证了"JSON spec → 视频"思路的市场(5.4K stars)· 但它的**图层栈模型** + **canvas/fabric 渲染**是上一代思路 —— NextFrame 用 **HTML/CSS/JS 作为描述层**在表达力上是代差(排版/动画/交互远超 fabric)· 加上 **Rust 单二进制 + 4K HDR + AI agent 外接**是 editly 完全没覆盖的空白。editly 活跃度下行(半停滞)也说明这条赛道等新解法 —— NextFrame 可直接收割。
