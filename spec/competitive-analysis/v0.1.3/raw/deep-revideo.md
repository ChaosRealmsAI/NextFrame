# Revideo · Deep Tech

> 研究日期: 2026-04-21 · 基础信息接 v0.1.2 浅扫
> 一句定性: **开源仓事实性停滞**(主仓最新 commit 2025-05-09 · 9 个月无 feature commit)· 团队已全量 pivot 到闭源 **Midrender**(YC S23 · Konstantin Hohr 独自继续) · `re.video` 域名 **308 永久重定向** 到 `midrender.com/revideo`(关键信号)· NextFrame 从中主要学**API 形状 + 部署架构 + 避坑**,不学商业路径。

---

## 1. Fork Delta(★★ 重点)

### Revideo 比 Motion Canvas 多的(3 根支柱)

| 增量 | 关键 PR / 提交 | 落地位置 |
|---|---|---|
| **headless 渲染** (把 mc 从独立 app 变成 library) | PR #33 `feat(renderer): use ffmpeg to step through frames of video elements` (2024-04-10 merge · 24 files · +572/-82) | `packages/renderer/server/render-video.ts` (13KB · 核心) + `packages/renderer/client/render.ts` (3.4KB) |
| **并行化 render** (worker + 端口池) | PR #33 内 11 个 commit 一起出 · 后续 PR #308 cli/examples 整合 | `render-video.ts` 的 `workers: number` + `viteBasePort` 配置 |
| **audio 导出 + `<Audio/>` 组件** | PR 分散在 v0.5.x 系列 · 代表性 feature 是 v0.10.0 (`feat: export transparent webm and prores videos` #309, 2024-10-07) | `packages/2d` 的 Audio node · `packages/ffmpeg` 包 wrap ffmpeg 调用 |

### 关键 API: `renderVideo()`(抄这个)

```typescript
// packages/renderer/server/render-video.ts
export async function renderVideo({
  projectFile,       // 路径到 project.ts
  variables,         // 动态变量(模板参数化)
  settings = defaultSettings,
}: RenderVideoParams): Promise<string>;  // 返回 MP4 路径

interface RenderSettings {
  outFile?: string;           // 默认 'video.mp4'
  outDir?: string;            // 默认 './out'
  workers?: number;           // 并行 worker 数
  viteBasePort?: number;      // 默认 9000 · 每 worker 取 basePort+i
  logProgress?: boolean;
  progressCallback?: (worker: number, progress: number) => void;
  ffmpeg?: FfmpegSettings;
  puppeteer?: PuppeteerLaunchOptions;
}
```

并行模型(极简):

```typescript
for (let i = 0; i < numOfWorkers; i++) {
  renderPromises.push(
    initializeBrowserAndStartRendering(
      projectFile, outputFileName, outputFolderName,
      i, numOfWorkers, settings, hiddenFolderId,
      variables, settings.progressCallback,
    ),
  );
}
await Promise.all(renderPromises);
// 收尾: concatenateMedia + mergeAudioWithVideo + 清 worker 临时目录
```

### 没改动的(继承自 motion-canvas)

- **generator / yield 动画 API** — 每个 yield = 1 帧 · coroutine 时序
- **Canvas 2D 渲染** (不是 DOM · 跟 Remotion 的 CSS/DOM 分野)
- **Signal 响应式系统**
- **scene graph / node tree**(`Rect` / `Circle` / `Txt` / `Img` / `Video` / `Audio`)
- **TSX 语法**

### packages/ 全景(14 个子包)

```
packages/
├── 2d/              ★ 继承 mc · 2D scene 组件库
├── core/            ★ 继承 mc · runtime(signals + animations + scenes)
├── ffmpeg/          ✨ 新增 · ffmpeg 命令 wrapper(concat + merge + 静音补齐)
├── renderer/        ✨ 新增 · headless 渲染核心(client + server 拆分)
│   ├── client/      render.ts 3.4KB(puppeteer 里跑)
│   └── server/      render-video.ts 13KB(Node 主控 · 并行 + 合并)
├── cli/             ✨ 新增 · `revideo serve` / `revideo editor` 2 条命令
├── player/          ✨ 新增 · browser 端预览 runtime
├── player-react/    ✨ 新增 · React 组件壳(给 NextJS / CRA 用)
├── create/          ✨ 新增 · `npm init @revideo` scaffold
├── template/        ✨ 新增 · create 的模板源
├── examples/        示例
├── telemetry/       ✨ 新增 · PostHog 匿名统计(DISABLE_TELEMETRY 关)
├── e2e/             端到端测试
├── ui/              继承 mc · editor UI
└── vite-plugin/     继承 mc · build 链路
```

**NextFrame 启发**:
- ★★ `renderer/` 拆 client + server 是关键 · **客户端跑在 puppeteer / browser 里读 Canvas · 服务端是 Node 主控派 worker**。这种两段式 headless 渲染架构直接抄
- ★ `ffmpeg/` 独立包封 concat + audio merge + silence fill · 单一职责清晰 · NextFrame 如果做 mp4 合流也应独立包
- ★ `cli/` 只 2 条命令 `serve` + `editor` · 极简 · NextFrame 别一开始堆 10 条 CLI

---

## 2. Headless Rendering(★)

### CLI 命令(v0.10.4 版本)

```bash
# serve: 启动 render 端点 + watch mode
revideo serve --projectFile ./src/project.ts --port 4000

# editor: 启动 web editor 预览
revideo editor --projectFile ./src/project.ts --port 9000
```

程序级别只有这 2 条 · 其余用 `@revideo/renderer` 的 Node API 自己起 server。

### server 端标准 pattern(官方推荐 Express)

```typescript
// 典型 saas-template 用法
import express from 'express';
import { renderVideo } from '@revideo/renderer';

app.post('/render', async (req, res) => {
  const outputPath = await renderVideo({
    projectFile: './src/project.ts',
    variables: req.body,       // 模板参数
    settings: { workers: 4 },
  });
  res.sendFile(outputPath);
});
```

### 部署模型(官方 "Deploying a Rendering Service in Production")

| 场景 | 推荐 | 备注 |
|---|---|---|
| 长视频 · 速度关键 | **AWS Lambda + `renderPartialVideo()` 分片** | 文档明说 "parallelized Rendering on AWS Lambda performs significantly faster due to much better cold start times"(Lambda 比 Cloud Run 好) |
| 短视频 · 不急 | **Cloud Run + 单进程 renderVideo**(Express 包) | 简单 · 但 cold start 慢 |
| 分布式 | `renderPartialVideo()` 拆段 · 外部 orchestrator 调 N 个 serverless 函数 · 最后主控合流 | 10min 视频切 10 个 worker 每个 1min 同时跑 |

### 资源需求(官方硬指标)

- **每任务最少 8-10 GB RAM**(puppeteer + Canvas + ffmpeg 都吃内存)
- 并发任务没隔离 = 性能线性劣化

**NextFrame 启发**:
- ★★ `renderVideo(project, variables, settings)` 这个 API 形状 = **模板 + 变量 + 设置 → 产物路径** · NextFrame 的 `source.json → mp4` 完全可以是同形状 · 别发明新 schema
- ★★ 并行模型"主控派 N worker + 每 worker 独立端口 + 最后合流"是 serverless 友好的经典模式 · NextFrame 以后上云抄
- ★ 8-10 GB RAM 下限是**任何基于 puppeteer 的 render 方案都绕不过的物理天花板** · NextFrame 如果选 puppeteer 路线要接受这个成本 · 选原生 Rust 渲染可以降 5-10 倍

---

## 3. Midrender 关系(★ 最关键信号)

### 时间线重建

| 时间 | 事件 |
|---|---|
| 2023 夏 | Revideo 加入 YC S23(原 YC 项目名就叫 Revideo) |
| 2024-03 | Revideo 开源仓首 push · 从 motion-canvas fork |
| 2024-04-10 | PR #33 核心 headless render 能力 merge |
| 2024-04 | Product Hunt launch · #9 of day · 319 upvotes |
| 2024-05~10 | 活跃开发期 · v0.5.x → v0.10.0(10 月 8 日 release · 主要 feature 完结) |
| 2024-10 ~ 2025-02 | 活跃骤降 · 零 feature commit · 只有 chore/fix |
| **2025-05-09** | **最新 commit**(至 2026-04-21 止共 9 个月无提交)· 2 个 PR 都是 chore: `move tex init into static function` + `remove chromajs` |
| 2026-04-21 | 仓库开放 issue 61 条 · 最近 issue #377 (2026-03) 无人回 |
| 2026-04-21 | `re.video` 域 **308 永久重定向** 到 `midrender.com/revideo` · YC 公司页已改名 `Midrender` |

### Midrender 的官方说辞(midrender.com/revideo 原文翻译)

> "The team primarily works on Midrender. The engine is still developed as part of Midrender, but recent changes have not yet been upstreamed to the open-source repository."

翻译: **团队主力做闭源 Midrender · 改动没 upstream 回开源 · GitHub 仓摆着但没人管**。

### YC 公司页说明(已改名)

- YC 页面现已登记 "Midrender · YC S23"
- **founder 只剩 1 位**:Konstantin Hohr (hkonsti)(San Francisco · 原来的 "Justus Mattern" 已从 YC 页面消失 · Justus 可能独立了或已离开)
- 公司描述改为 "Turn product features into launch videos"(对标 HeyGen / Arcade / Supademo 赛道)

### MCP server(闭源侧)

Midrender 主页明说:
> "Midrender speaks MCP, so you can connect it to agents like Claude Code or Cursor and create motion content from your terminal."

**公开信息为零** — MCP endpoint 在 Midrender SaaS 内部 · 无 GitHub 仓 · 无 schema 公布 · 必须订阅后才能用。

### Midrender 定价(2026-04 snapshot)

| 层 | 价格 | 额度 |
|---|---|---|
| Free | $0 | $3/mo AI credit · 720p 导出 · 无信用卡 |
| Pro | $50/mo | $50/mo AI credit(over-use 按成本计)· unlimited export · 目标 "teams shipping launch content regularly" |

定价偏向 **product launch 视频场景**(每月几个视频量级)· 不是"日更创作者"(那是 HeyGen / Submagic 的地盘)。

### 开源 vs 闭源边界(法律 / IP)

- 开源仓 MIT license(永久自由)· 已发布的 v0.10.4 可永久 fork / 商用
- **但**新功能(AI 理解代码生成动画 / MCP / 可视化 editor 高级交互)**全在闭源 Midrender**
- 开源仓的 engine 代码法律上仍可被第三方 fork maintain · 只是没人真做

**NextFrame 启发(开源策略 · 关键)**:
1. ★★★ **开源仓被架空是"YC video 框架"常见死亡路径** — HeyGen 没开源 · Remotion 靠商业 license · Revideo 试图纯 MIT + SaaS 分离失败 → 团队 ROI 算账不合理 → pivot 闭源
2. ★★★ NextFrame 如果走开源路线 · 要么 **Remotion 模式**(MIT + 企业 license 门槛)· 要么**完全闭源从头**· 别抄 Revideo 的"开源主仓 + 云服务分离"结构
3. ★★ NextFrame 永远 **主分支 commit 一切 · 不藏私货**(用户记忆里明确红线)· Revideo 的反例已刻
4. ★ MCP server 值得做 · 但**必开源**(作为产品形象)· 不像 Midrender 藏在订阅后

---

## 4. Audio 支持(motion-canvas 没的)

### 模型

- `<Audio/>` 组件 作为 scene node(跟 `<Video/>` `<Img/>` 平级)
- 参数: `src` `play()` `pause()` · 动画时间线挂接
- 跨 scene 同步通过 generator 帧时钟 · 每 yield 前进 1 帧 · audio 当前位置跟帧 ID 绑定

### ffmpeg 合流策略

```
[worker N 输出] video-no-audio.mp4  +  audio.wav
                                ↓ mergeAudioWithVideo()
                         final-worker-N.mp4
                                ↓ concatenateMedia()
                            final.mp4
```

**missing audio 补齐**: `createSilentAudioFile(audioFilePath, duration)` · 没 audio 的 scene 段塞静音 · 保证合流时轨道对齐

### 开源仓近期 audio 痛点(2025-2026 issues)

- #373 "multiples scene can't have audios in same rendering"(多 scene audio 同渲染失败)
- #371 "local audio files don't work as expected"
- #367 "Rendered video without sound when using a video file with a local path"

**都无维护响应**(印证 §3 结论)。

**NextFrame 启发**:
- ★ audio merge 策略"分段渲染视频 + 分段 audio + 最后 concat + 静音补齐"是 serverless 友好的正确模式
- ★ 别低估 "多 scene 多 audio 同步" 的复杂度 · Revideo 死在这 · NextFrame 如果 v0.5+ 做 audio 要先 POC

---

## 5. SaaS Template

`github.com/redotvideo/revideo-saas-template`(**已废弃** — README 自己说 "very old version of Revideo and is currently not maintained anymore"):

### 架构

```
┌──────────────────────────────────┐
│  /ui (NextJS App Router)         │
│   + @revideo/player-react 预览    │
└────────────┬─────────────────────┘
             │ WebSocket
┌────────────▼─────────────────────┐
│  /websocket-server (Node.js)     │
│   · GPT-4 写脚本                 │
│   · DALL-E 生背景图              │
│   · ElevenLabs 生 voiceover      │
│   · Deepgram 字幕(wordtiming)    │
│   · AWS S3 存储                  │
└────────────┬─────────────────────┘
             │ call renderVideo()
┌────────────▼─────────────────────┐
│  /revideo (Revideo project)      │
│   YouTube Shorts 模板 · variables │
└──────────────────────────────────┘
```

**目标产物**: AI-generated YouTube Shorts

**Stars: 32 · 已放弃** — 官方推荐改看 `redotvideo/examples` 仓里的 SaaS 示例

### 部署

**无具体目标**(README 没说 Cloud Run / Lambda 部署)· 只能本地跑 · 印证 saas-template 是"样品"不是"可部署产品"

**NextFrame 启发**:
- ★ "WebSocket + Node server + render worker" 3 层拆分是经典 · NextFrame 如果做 SaaS 面抄这架构
- ★ 但**别把"AI 脚本生成"跟"渲染引擎"耦合**(Revideo 犯的错)· NextFrame 应清晰分层: 脚本层 / 合成层 / 渲染层 各独立

---

## 6. YC + 商业信息

### 团队

| 人 | 背景 | 当前状态 |
|---|---|---|
| **Justus Mattern** (@justusmattern27) | RWTH Aachen 物理(2023 dropout)+ 计算机 · Jodel 做 content moderation · AI 背景 | **已从 Midrender YC 页面消失** · 可能离队(最后 commit 2024-10-22) |
| **Konstantin Hohr** (@hkonsti) | Jodel + DynamoAI(federated learning)+ RWTH Aachen CS | **现 Midrender 唯一 founder** · 主持所有最后的开源 commit |

### YC Launch (2024 春)

- Product Hunt #9 of day · 319 upvotes
- tagline: "Create videos with code"
- 核心卖点: MIT 全开源(对标 Remotion 商业 license)· 14.3s 渲 60s FHD 视频(WebCodecs)
- 团队当时预期: 开源吸流量 + SaaS 变现(managed rendering platform)
- **2 年后**: SaaS 没起来 · 改做 Midrender(AI 理解代码生成 launch video · 全新定位)

### Midrender 当前 ARR / 用户数

- **未公开** · beta 标签 · YC 页面仅显示 "team size: 1"
- 定价 $50/mo Pro · 按赛道估 MRR $10-50K 量级(订阅类 YC 公司 Year-1 典型)

---

## 7. 跟 Remotion 的差异化叙事

### 当年(2024 launch 时 justusm 本人在 HN 回复)

| 维度 | Revideo | Remotion |
|---|---|---|
| 动画模型 | **imperative** generator + yield · 每 yield = 1 帧 | **declarative** React · `frame: number` → JSX |
| 渲染层 | Canvas 2D (可 canvas.toBlob 纯 browser 渲染) | DOM + CSS(靠 puppeteer screenshot) |
| 速度 | 快(Canvas 直取像素 · 官方说快于 Remotion) | 慢(screenshot 每帧开销) |
| 授权 | **MIT** 永久自由 | 3+ 员工公司需商业 license |

### 2026 现实

- **Remotion**:~60K weekly downloads · 活跃维护 · 商业 license 养团队健康
- **Revideo**:`@revideo/core` ~3K weekly downloads · 仓库事实停滞 · 团队 pivot Midrender
- **Motion Canvas**:原作者仍活跃 · "hand-crafted animations"(艺术家场景)
- **推荐位**(2026 共识):
  - Remotion → 动态视频规模化(marketing / 社媒 / 个性化)
  - Motion Canvas → 手工动画 / 艺术类
  - Revideo → **不推荐新项目**(见 issue #356 "Still maintained?" + #363 "revideo 比 mc 强在哪?" 都无人答)

### 还活跃吗(客观评估)

- 开源仓: **死**(9 个月无 commit · 26 条 open issue 无响应 · core 被 chromajs/tex init 这类 chore 拖尾)
- 商业团队: **存活 · 但改名 Midrender**
- engine 维护: **仅在闭源 Midrender 内部**

---

## 8. 已知痛点(2025-2026 最新)

最近 30 天没任何活动(最新 issue #377 "Add bt709 for CanvasColorSpace" 开 1 个月 0 回应)。

### 2025-2026 典型 issue 模式

| 类别 | issue# | 无响应证据 |
|---|---|---|
| **维护焦虑** | #356 "Still maintained?" (2025-04) · #363 "What does revideo offer over motioncanvas?" (2025-05) | 都 0-1 回复 无 maintainer 回 |
| **audio bug** | #373 · #371 · #367 · #360 | 全 0-1 回复 |
| **shader bug** | #369 #370 | 0 回复 |
| **部署 / 路径** | #362 vercel fluid · #364 outDir 配置 · #368 ffmpeg exit 1 | 0 回复 |
| **新 feature 请求** | #365 Support motion-canvas Camera(mc 有 · revideo 漏) | 0 回复 |

### 用户抱怨"开源仓被架空"的具体证据

1. PR #344 "Fix clean up with absolute output folder" 从 2024 底开到现在 **未 merge 未 close**
2. PR #361 "IOS handling for video and Audio play" 2025 开 · 未动
3. PR #374 "fix: update" 2025 开 · 未动
4. Issue #356 "Still maintained?" 已开 **1 年 0 官方回应**
5. Issue #363 提问 "revideo 比 mc 强在哪" · maintainer 不回(按 §3 推论 maintainer 忙 Midrender)
6. `re.video` 域 308 重定向到 midrender · 就是官方放弃的法律信号

---

## 总结(对 NextFrame 5 条启发)

1. **抄**: `renderVideo(project, variables, settings) → path` 的 **API 形状 + 并行 worker + 端口池 + 合流收尾** 的 headless 渲染架构 · 这是 2026 年业界最简洁的 render pipeline 形态 · 直接拿来做 NextFrame 的 `source.json → mp4` 接口设计参考

2. **抄**: 部署模型分两档 — Cloud Run 单进程(简单短视频)+ Lambda 分片并行(`renderPartialVideo()` 长视频)· 都是 serverless 友好模式 · NextFrame v1.2+ 上云抄这个拓扑(但**先本地跑通再说**)

3. **避**: **Revideo 开源仓被架空是"YC video 框架"死亡范式** — 开源吸流量 + SaaS 变现路径在 video 赛道不通(Remotion 模式才通:MIT + 企业 license 门槛)· NextFrame 如果开源 · **必 commit 主分支 · 不藏私货**(用户红线已在)· 或干脆不走"开源吸量 + SaaS 分离"路径

4. **观察**: motion-canvas fork 路径踩坑实录 — 继承基础系统(signals + scene graph + TSX)+ 增 3 支柱(headless + audio + parallel)是可行增量 · 但**fork 后 4 年维护成本吃掉主力团队** · NextFrame 不 fork 而是从零 · 减包袱赢得方向控制权(v0.1 empty shell 重启合理)

5. **观察**: 赛道格局 2026-04 — HeyGen(人脸 / 口播)· Arcade/Supademo(点击流 mockup)· **Midrender(代码理解 → launch video)** · Remotion(程序化视频引擎)· Revideo/Motion Canvas(开源动画引擎)· NextFrame 想挤入 "AI 视频引擎" 要明确定位 · **Midrender 的"读代码生成动画"** 是正在被抢的生态位 · NextFrame 看要不要错位("读结构化 JSON 生成视频"跟读代码完全不同赛道)

---

## 关键 URL 索引

- 开源主仓(事实停滞)· https://github.com/redotvideo/revideo
- 开源示例(含 Cloud Run / Lambda 示例)· https://github.com/redotvideo/examples
- SaaS 模板(**已标废弃**)· https://github.com/redotvideo/revideo-saas-template
- 文档站 · https://docs.re.video
- **原官网 308 重定向到闭源** · https://re.video/ → https://midrender.com/revideo
- Midrender 主页 · https://midrender.com
- Midrender 定价 · https://midrender.com/pricing
- YC 公司页(已改名 Midrender) · https://www.ycombinator.com/companies/midrender
- YC launch 页(Revideo 原版)· https://www.ycombinator.com/launches/Kq1-revideo-create-videos-with-code
- Product Hunt launch · https://www.producthunt.com/products/revideo
- HN 创始人回应 vs Remotion · https://news.ycombinator.com/item?id=41114294
- 核心 PR #33 (ffmpeg 帧提取) · https://github.com/redotvideo/revideo/pull/33
- "Still maintained?" issue · https://github.com/redotvideo/revideo/issues/356
- "revideo vs motioncanvas?" issue · https://github.com/redotvideo/revideo/issues/363
- 生产部署指南 · https://docs.re.video/rendering-in-production/
- Render API 源码 · https://github.com/redotvideo/revideo/blob/main/packages/renderer/server/render-video.ts
- CLI 源码(仅 serve + editor 2 条) · https://github.com/redotvideo/revideo/blob/main/packages/cli/src/index.ts
- 第三方对比 · https://www.pkgpulse.com/blog/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026
- 第三方对比 repo · https://github.com/StreamUI/streamui-vs-remotion-vs-revideo
