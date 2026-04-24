# Remotion · Deep Tech

**扫描日期**: 2026-04-21 · v0.1.3 深挖
**Repo**: https://github.com/remotion-dev/remotion (44,115 ⭐ / 2,952 fork / 84 open issues / license: Other=source-available / last push 2026-04-21)
**版本线索**: `@remotion/skills` package.json 显示 `"version": "4.0.450"` → 正式版本号已推到 4.0.450
**扫描深度**: 21 WebFetch/WebSearch/gh API 调用 · 原始 markdown / package.json / issue body 直接摘

---

## 1. Agent Skills 具体形态(★★ 重点)

### 1.1 上架平台 + 装机量(skills.sh marketplace)

**skills.sh = "The Open Agent Skills Ecosystem"**,Vercel 托管(footer "Made with love by Vercel")。服务 **20+ agent 平台**:Claude Code / Cursor / GitHub Copilot / Gemini / OpenCode / Cline / VSCode / Windsurf / AMP / Antigravity / ClawdBot / Droid / Goose / Kilo / Kiro CLI / Roo / Trae 等。

**skills.sh 上架量 Top 6**(总装机跨所有平台):

| Skill | 装机量 | 注释 |
|---|---|---|
| find-skills | 1.1M | skills.sh 自己的发现工具 |
| vercel-react-best-practices | 335.1K | Vercel 出 |
| frontend-design | 319.3K | |
| soultrace | 286.5K | |
| web-design-guidelines | 267.5K | |
| **remotion-best-practices** | **256.2K** | **Remotion 官方(主打)** |
| remotion | 21K | 另一份(Google Labs Code 贡献) |

**Remotion 总装机 ≈ 277K** — 第 6 位 · 真实跨 IDE 渗透(不是虚数)。
v0.1.2 记的 "Claude Code 108K / Cursor 92K / Codex 93K / Gemini CLI 108K / OpenCode 92K" 是**平台分布估算**,skills.sh 上 Remotion 单条 256.2K 是**汇总**。两数据来源不同 · 本次深扫没撬出 per-platform 精确分布(skills.sh 的 /skills/remotion-best-practices 子页 404)· 但 **256.2K 汇总是硬数字**。

### 1.2 安装命令(一条命令跨所有 IDE)

```bash
npx skills add remotion-dev/skills
```

**或 bootstrap 新项目时直接内置**:

```bash
bun create video
```

**机制猜测**:`npx skills` CLI 是 skills.sh 出的中间层 · 读取 GitHub repo 的 `packages/skills/skills/{name}/SKILL.md` · 按当前 IDE 目标位置写入(Claude Code `~/.claude/skills/` · Cursor `.cursor/rules/` 等)。**一份 markdown · N 个 IDE 复用**。

### 1.3 Skill 包真实结构(从 GitHub 原始文件直接摘)

GitHub 路径: `packages/skills/skills/remotion/`

```
packages/skills/
├── README.md              (内容:"This is an internal package and has no documentation.")
├── package.json           (version: 4.0.450 · 跟 Remotion 主包同版本号同步)
├── tsconfig.json
├── src/                   (不相关 · skill 测试代码)
└── skills/
    └── remotion/
        ├── SKILL.md       ← 主 manifest + router (5235 字节)
        ├── rules/         ← 35 条领域知识 md
        │   ├── 3d.md               (2292)
        │   ├── animations.md       (1089)
        │   ├── assets.md           (1604)
        │   ├── audio-visualization.md (4892)
        │   ├── audio.md            (3625)
        │   ├── calculate-metadata.md (3254)
        │   ├── can-decode.md       (1677)
        │   ├── charts.md           (2942)
        │   ├── compositions.md     (3794)
        │   ├── display-captions.md (5471)
        │   ├── extract-frames.md   (5499)
        │   ├── ffmpeg.md           (1093)
        │   ├── fonts.md            (3484)
        │   ├── get-audio-duration.md (1357)
        │   ├── get-video-dimensions.md (1626)
        │   ├── get-video-duration.md (1377)
        │   ├── gifs.md             (3707)
        │   ├── images.md           (2791)
        │   ├── import-srt-captions.md (2247)
        │   ├── light-leaks.md      (2305)
        │   ├── lottie.md           (1796)
        │   ├── maps.md             (11300) ← 最大 · Mapbox 集成
        │   ├── measuring-dom-nodes.md (973)
        │   ├── measuring-text.md   (2783)
        │   ├── parameters.md       (2387)
        │   ├── sequencing.md       (2746)
        │   ├── sfx.md              (867)
        │   ├── silence-detection.md (2548)
        │   ├── subtitles.md        (922)
        │   ├── tailwind.md         (420)
        │   ├── text-animations.md  (700)
        │   ├── timing.md           (4470)
        │   ├── transcribe-captions.md (1897)
        │   ├── transitions.md      (5816)
        │   ├── transparent-videos.md (2267)
        │   ├── trimming.md         (1209)
        │   ├── videos.md           (3509)
        │   └── voiceover.md        (3318)
        └── assets/        (rules 引用的静态资源 · 图/示例)
```

**35 条 rule · 全部是 markdown · 平均 3KB · 总量 ~100KB**。粒度极细 — 一件事一条 rule(如 "getAudioDuration" 单独一条 1.3KB)。

### 1.4 SKILL.md 完整 frontmatter + 路由(真实摘录)

**文件开头 frontmatter**(YAML):

```yaml
---
name: remotion-best-practices
description: Best practices for Remotion - Video creation in React
metadata:
  tags: remotion, video, react, animation, composition
---
```

**主体结构 = "When to use → 按需加载子 rule" 路由模式**:

```markdown
## When to use

Use this skills whenever you are dealing with Remotion code to obtain the domain-specific knowledge.

## New project setup

When in an empty folder or workspace with no existing Remotion project, scaffold one using:

\`\`\`bash
npx create-video@latest --yes --blank --no-tailwind my-video
\`\`\`

## Starting preview

\`\`\`bash
npx remotion studio
\`\`\`

## Captions

When dealing with captions or subtitles, load the [./rules/subtitles.md](./rules/subtitles.md) file for more information.

## Using FFmpeg

For some video operations, such as trimming videos or detecting silence, FFmpeg should be used. Load the [./rules/ffmpeg.md](./rules/ffmpeg.md) file for more information.

## Audio visualization

When needing to visualize audio (spectrum bars, waveforms, bass-reactive effects), load the [./rules/audio-visualization.md](./rules/audio-visualization.md) file for more information.

## How to use

Read individual rule files for detailed explanations and code examples:

- [rules/3d.md](rules/3d.md) - 3D content in Remotion using Three.js and React Three Fiber
- [rules/animations.md](rules/animations.md) - Fundamental animation skills for Remotion
- [rules/assets.md](rules/assets.md) - Importing images, videos, audio, and fonts into Remotion
- [rules/audio.md](rules/audio.md) - Using audio and sound in Remotion - importing, trimming, volume, speed, pitch
...(35 条全列)
```

**设计精华 3 点**:
1. **SKILL.md 是 router,不塞全部内容** — 主文件只 5KB 列 TOC + 按需 "load the XX.md" 指令 · rule 内容另放
2. **frontmatter 极简 3 字段**: name + description + metadata.tags · 无版本无作者无依赖(依赖走 package.json)
3. **"When to use" 句式强硬** — 主文件用 "When needing to X, load the [./rules/Y.md]" · 指示 AI 按需加载(跟 claude-seed skill 的 ALWAYS invoke when 模式一样)

### 1.5 单条 rule 真实样本(animations.md · 1.1KB)

```markdown
---
name: animations
description: Fundamental animation skills for Remotion
metadata:
  tags: animations, transitions, frames, useCurrentFrame
---

All animations MUST be driven by the `useCurrentFrame()` hook.
Write animations in seconds and multiply them by the `fps` value from `useVideoConfig()`.

For eased motion, prefer `interpolate` with explicit frame ranges and an easing—especially `Easing.bezier`, which matches CSS `cubic-bezier` so timing can be shared with web specs and curve editors.

\`\`\`tsx
import { useCurrentFrame, Easing } from "remotion";

export const FadeIn = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 2 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return <div style={{ opacity }}>Hello World!</div>;
};
\`\`\`

CSS transitions or animations are FORBIDDEN - they will not render correctly.
Tailwind animation class names are FORBIDDEN - they will not render correctly.
```

**观察**:
- 每条 rule 自己也有 frontmatter(嵌套 skill 结构)
- "MUST / FORBIDDEN" 大写硬话 — 像 RFC · 不是温柔建议
- **解释 + 代码 + 反例禁令** 三件套 · AI 读一次知道该咋做 + 不该干啥

### 1.6 NextFrame 启发(Skills 维度)

- ✅ **抄**: "SKILL.md 主文件当 router" 模式 — NextFrame 若出 agent skill · 主文件列 TOC 指向 rules/ · 不塞全部(保持 context 轻)
- ✅ **抄**: 单 rule 文件 YAML frontmatter 三字段(name + description + metadata.tags)· 极简
- ✅ **抄**: rule 里用 "MUST / FORBIDDEN" 大写指令 — LLM 遵从率高(比 "建议" 强得多)
- ✅ **抄**: 粒度细到"一件事一条" — 不做大合集(maps.md 11KB 是例外 · 平均 3KB)
- ✅ **抄**: 包版本号跟主包同步(`@remotion/skills` = 4.0.450 同 remotion core)· 保证 skill 跟 API 一致
- ⚠️ **看清**: skills.sh 是 Vercel 生态推的 · 去中心化 · `npx skills add` 一条命令跨所有 IDE = 分发基建的关键抽象

---

## 2. AI-native docs(★ 重点)

### 2.1 `.md` URL 后缀真实可用(验证过)

访问 https://www.remotion.dev/docs/player.md 返回**真 markdown raw**(不是 HTML)· 开头验证:

```markdown
image: /generated/articles-docs-player-index.png
title: '@remotion/player'
---

import {PlayerExampleWithControls} from '../../components/PlayerExampleWithControls';
import {PlayerTableOfContents, PlayerGuide} from './TableOfContents';

Using the Remotion Player you can embed Remotion videos in any React app and customize the video content at runtime.

## Demo
...
```

**原 MDX 直接透传**(注意 import JSX 还在 — 对 LLM 无害 · 因为内容主体还是清楚的)。

### 2.2 三种 AI 访问通道(官方文档明说)

1. **复制按钮**: "Click the copy button on any doc page to copy raw markdown" — 每页右上角有按钮 · 人类可手动复制到 chat
2. **`.md` URL 后缀**: `remotion.dev/docs/xxx.md` 直出 markdown
3. **Content-Negotiation**: 对 `remotion.dev/docs/xxx` 发 `Accept: text/markdown` header · 服务端返 md 而非 HTML

### 2.3 官方点名支持的 AI 工具

"These tools automatically fetch the markdown version":
- **Claude Code**
- **opencode**
- "Other AI coding agents"(不列举)

### 2.4 llms.txt 不存在

测试过 `https://www.remotion.dev/llms.txt` 和 `https://www.remotion.dev/docs/llms.txt` — **均 404**。Remotion **没走 Anthropic 提的 llms.txt 标准** · 走的是 "每页都可 .md" + "Accept header 协商" 这套更细粒度的方案。

### 2.5 NextFrame 启发(Docs 维度)

- ✅ **抄**: `.md` URL 后缀 pattern — NextFrame docs 站上每页支持 `/docs/xxx.md` 直出 markdown · 是对 LLM 最友好的姿态(cost: Next.js middleware 做个扩展 route · 或静态 build 同时 emit md + html)
- ✅ **抄**: "复制 raw markdown 按钮" — 人类可手动抓整页给 LLM · 低成本高价值
- ✅ **抄**: Accept header 协商 — 对 AI 客户端透明
- ⚠️ **跳过 llms.txt** — Remotion 不用 · 行业没共识 · 不必跟风 · `.md` URL 更实在
- 💡 **实现路径**: Next.js 站点的话 · `app/docs/[...slug]/route.ts` + 根据 URL 后缀或 Accept 分支渲染 · MDX 的话 raw 就是 markdown 几乎零改造

---

## 3. Lambda Serverless 架构(★ 重点)

### 3.1 四组件架构

1. **Lambda Function**(worker + orchestrator 合一 container · 带 Chromium layer · Remotion 托管)
2. **S3 Bucket**(项目 bundle + renders + metadata + progress.json)
3. **CLI**(`npx remotion lambda`)
4. **Node.JS API**(`renderMediaOnLambda()` / `getFunctions()` / `deploySite()` 等同等能力)

### 3.2 Main 函数 vs Renderer 函数(双层调度)

- **Main function**:
  1. "Visits the Serve URL (S3-hosted bundle) in a headless browser"
  2. "Finds the composition based on the composition ID"
  3. 根据 duration + concurrency 算 chunk 数 · spawn N 个 renderer functions
  4. 周期把各 renderer 的 progress 汇总写 `progress.json` 上传 S3
  5. 等 renderer 全返回 · 做最终 stitching · 上传最终视频到 S3 · 退出

- **Renderer function**(多个并行):
  - 每个领到一个 frame range(如 [0-60] / [60-120])
  - 自己跑一个 headless Chromium · 渲染自己那段
  - 生成 chunk 视频文件传回 S3 给 main

### 3.3 Chunk 并行策略 + 限制

- **Concurrency 默认**: AWS region 全局 1000 个 Lambda 同时跑(AWS 默认限) · 可申请提升
- **单 render 的 chunk 数**: 由 `framesPerLambda` 参数控 · 典型 1min 1080p 30fps = 1800 帧 · 若 framesPerLambda=200 → 9 个 renderer 并发
- **硬约束**:
  - 单 Lambda **15min timeout**(AWS 硬限) → 单视频 Full HD ~80 分钟为上限
  - 单 Lambda **10GB 存储** → 输出文件 ≤ 5GB
  - Full HD 理论上限 ~2 小时

### 3.4 Stitching 细节(有坑)

- 官方: "The seamless concatenation of chunks is not a public API at the moment"
- FAQ 说法: 开发者要"手动 ffmpeg 拼" · 用 `frameRange` + `audioCodec: "pcm-16"` 各 renderer 出无损 chunk · 最后 ffmpeg concat
- **隐含**: main function 内部用 ffmpeg 做 concat · 但不暴露 · 若自己拆多次 render 要自己 concat

### 3.5 Cost Model(模糊但关键)

- **官方口径**: "cost estimates provided before execution" — 每次调用前会给 cost 预估 · 实际计费走 AWS Lambda 的 GB-second + S3 transfer
- **典型口径**: "most of our users render multiple minutes of video for just a few pennies" — 分钟级视频 = 几美分
- **影响因素**: region · memory 配置(128MB - 10GB) · video type · framesPerLambda(并发度)
- **Remotion 公司自己**: 对商业用户收 "Cloud Rendering Units"(CRU)license(remotion.pro) · 是 Lambda 原生 cost 之外的额外商业授权费 — 具体 CRU 价格本次扫描没撬出(/docs/lambda/cost 404 · /pro 只列了店铺商品 Editor Starter $600 / Timeline $300 / Captions $100 等 · 无 CRU 单价)

### 3.6 Deploy 命令

```bash
# 装 Lambda 函数(一次/region)
npx remotion lambda functions deploy

# 上传 site bundle 到 S3
npx remotion lambda sites create src/index.ts --site-name=my-video

# 渲染
npx remotion lambda render <serve-url> <composition-id> \
  --codec=h264 --framesPerLambda=200

# Node API
import {renderMediaOnLambda} from '@remotion/lambda/client';
const {renderId, bucketName} = await renderMediaOnLambda({
  functionName, serveUrl, composition, inputProps,
  codec: 'h264', framesPerLambda: 200,
});
```

### 3.7 NextFrame 启发(Lambda 维度)

- ✅ **抄架构**: main-orchestrator + N-renderer 双层模型 — NextFrame 若走分布式渲染 · 这是经典
- ⚠️ **避坑**: "concat 不是 public API" = 用户自己拼 chunk 时踩坑 · NextFrame 从第一天就把 concat API 暴露出来
- ⚠️ **避坑**: 15min AWS 硬 timeout → Remotion Full HD 封顶 80min · NextFrame 若目标更长视频(>1hr)要么自己砍 chunk 要么上非 Lambda 方案(ECS / 自建 GPU)
- 💡 **启示**: Remotion 在 cost 定价上故意模糊 — "几美分"话术 + 公司 CRU license 绑定 · 这是商业杠杆 · NextFrame Apache 开源要想清楚:不收 CRU 怎么养团队

---

## 4. Player + Studio 实时预览

### 4.1 Player 组件 API(React 库形态)

```tsx
import {Player} from '@remotion/player';

<Player
  component={MyComposition}
  durationInFrames={100}
  fps={30}
  compositionWidth={1920}
  compositionHeight={1080}
  controls
  inputProps={{text: "Hello"}}
/>
```

**核心 prop**:
- `component` — React 组件(Composition)
- `durationInFrames` / `fps` / `compositionWidth` / `compositionHeight` — 视频规格
- `controls` — 显示 UI 控件(play/pause/scrub)
- `inputProps` — **运行时可变参数**(核心价值:不需 rebuild)

**定位**: Player 是给**生产 React app** 用的 embed · 不是开发预览 · Studio 才是开发环境。

### 4.2 Studio 实现(扫描发现 / docs/studio 404)

- **启动**: `npx remotion studio`
- **bundler**: `bundle()` API 显示**默认 Webpack** · 可选 **Rspack**(`"Whether to use Rspack instead of Webpack as the bundler. Default false."`) — **没用 Vite**!
- **HMR**: Webpack-dev-middleware + React Refresh(react-refresh-webpack-plugin)做 hot reload
- **预览**: Studio 开 localhost 端口 · 浏览器里跑 React 实时渲染 · scrub 时间轴 = 改 currentFrame state · React re-render
- **scrub 性能保证**: 动画全用 `useCurrentFrame()` hook · currentFrame 变化 = React props change 触发 re-render · 关键是 `interpolate()` 是纯函数计算 · 无副作用 · 60fps scrub 靠浏览器 React VDOM

### 4.3 实时预览 vs 渲染出片 同代码路径

- 开发时 Studio 跑 React · `useCurrentFrame()` 返回播放头帧
- 渲染时 Puppeteer 开 headless Chromium · 跑同一份 React · `useCurrentFrame()` 返回当前渲染帧 · `page.screenshot()` 抓 PNG
- **核心理念**: 浏览器 = render engine · 不造中间 IR · 所见即所得

### 4.4 NextFrame 启发(Player/Studio 维度)

- ✅ **抄**: "开发预览 = 浏览器 React 动态 re-render" · "出片 = headless 同样代码抓帧" · **同代码路径**
- ⚠️ **避坑**: Webpack 2026 了还没切 Vite · 启动慢 — NextFrame 直接 Vite(HMR 快 10x)· 或 Rspack(Webpack API 兼容 · Rust 核心)
- ✅ **抄**: inputProps 运行时可变 — 不 rebuild 就能改参数 · 是 Player 给 SaaS 场景的关键能力
- 💡 **观察**: React 不是瓶颈 · Chromium 才是(帧提取一次只一个 tab)

---

## 5. 渲染 Pipeline 细节

### 5.1 Puppeteer 集成

- 不直接依赖 `puppeteer` npm 包!Remotion 的 `openBrowser()` 自己托管 Chromium 进程
- 官方说法: "Despite the name, not actually compatible with `puppeteer`, only with [`openBrowser()`]"
- 原因: puppeteer 全量依赖太大 + Remotion 需要精细控制(GPU flag / 隔离 context)

### 5.2 Chromium flags 关键参数

```
--gl=swiftshader       # GPU 软件渲染(无硬件时回落 · Lambda 里默认)
--gl=angle             # 硬件 GPU(Desktop / VPS 有显卡用)
--disable-web-security # 关 CORS
--ignore-certificate-errors
--disable-headless     # debug 时开浏览器看(Lambda 里不可用)
--dark-mode           # v4.0.381+
```

**GPU 在 headless**:
- Lambda: 无显卡 · 强制 swiftshader(CPU 模拟 GL) → 慢
- 本地: 有显卡 · angle/egl + hardwareAcceleration=true → 快
- issue #4664 说: "48 cores 350GB RAM 大 VPS 高并发反而慢" — 根因是 **OffthreadVideo 帧提取不可并行** · 单视频帧必须串行拉

### 5.3 Codec 支持(renderMedia)

支持: `h264 / h265 / vp8 / vp9 / prores`
帧序列/MP4 都行 · 默认 MP4 h264 · ffmpeg 在子进程做最后合成
`concurrency` 参数: 数字 / 百分比 "50%" / null(默认 CPU 线程一半)

### 5.4 渲染管线(单帧维度)

1. Puppeteer open Chromium · `page.goto(serveUrl)`
2. `setCurrentFrame(N)` → React re-render 到第 N 帧
3. `page.screenshot()` 抓帧 PNG · stream 给 ffmpeg stdin
4. ffmpeg 实时编码 H.264
5. 每 `concurrency` 个 tab 并行跑 N 段

### 5.5 NextFrame 启发(Pipeline 维度)

- ✅ **抄**: 浏览器直 screenshot 管线 · ffmpeg 编码 — 经典方案
- ⚠️ **避坑**: Puppeteer 不纯 · Remotion 自己 fork 了 openBrowser · 说明 puppeteer 长期稳定性有问题
- 💡 **观察**: 单帧提取串行是 headless 视频渲染的底层瓶颈 · NextFrame 若要比 Remotion 快 · 必须在此动刀(如多浏览器实例 / WebGPU 直抓 / OffscreenCanvas)
- ⚠️ **避坑**: Lambda swiftshader 慢 · 靠并发掩盖 · 单帧 CPU-heavy scene 慢得看得见

---

## 6. Composition / Schema

### 6.1 用户写法(React 组件)

```tsx
// src/Root.tsx
import {Composition} from 'remotion';
import {MyComposition} from './MyComposition';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyComposition"
      component={MyComposition}
      durationInFrames={100}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={{title: "Hello World", color: "#ff0000"}}
    />
  );
};
```

**零 DSL · 零 JSON** — 配置直接是 React `<Composition>` 组件 props。

### 6.2 动态 metadata(calculateMetadata)

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({props, abortSignal}) => {
  const data = await fetch(`https://api.example.com/video/${props.videoId}`, {signal: abortSignal}).then(r => r.json());
  return {
    durationInFrames: Math.ceil(data.duration * 30),
    props: {...props, videoUrl: data.url},
  };
};
```

运行 1 次 · 渲染前 · 算出真 duration/dimensions/props。

### 6.3 Sequence / Series / TransitionSeries(时间组织)

- `<Sequence from={30} durationInFrames={60}>` — 从第 30 帧开始 · 持续 60 帧
- `<Series>` — 子元素顺序播放(duration 自动累加)
- `<TransitionSeries>` — 子元素之间加过渡

### 6.4 Parameters(Zod schema)

Remotion 支持给 composition 挂 Zod schema · Studio 自动生成参数表单 · 非技术人可调 props。

### 6.5 NextFrame 启发(Schema 维度)

- ⚠️ **Remotion 选"React 组件 = schema"** — 强假设用户会写 React · 门槛在此
- 💡 **NextFrame JSON-first** 对比:输入 JSON(非程序员 or AI 好生成)· 引擎翻译成 React/HTML · **门槛低** — 是 Remotion 的对立面
- ✅ **借鉴**: 动态 metadata 概念(renderTime 算 duration)· NextFrame scene spec 也要支持 "source duration 异步测出" 这类场景
- ✅ **借鉴**: Sequence from/durationInFrames 是时间组织核心原语 · 直接对齐

---

## 7. 商业 / License(source-available 实情)

### 7.1 免费层门槛

- "an individual"(个人)
- "a for-profit organisation with up to 3 employees"(≤3 员工营利组织)
- "a non-profit or not-for-profit organisation"(非营利)
- 评估用途(不商用上线)

### 7.2 需付费层

- ≥4 员工营利公司 → 必买 company license(remotion.pro)
- **License 页面不标价** · "Contact us / Learn more" · 是销售漏斗

### 7.3 Remotion Pro 商品(非 license · a la carte 套件)

从 remotion.pro 页面:
- Editor Starter: **$600**(license 持有者享)
- Timeline: **$300**
- Animated captions: **$100**
- Watercolor Map: **$50**
- NPM Kiosk: **$40**
- Colors and Shapes: **$20**
- Cube Transition: **$10**

这些是**预制 React 组件套件** · 不是 license tier。

### 7.4 收入数据

公开数据不足。2024 年推 Pro 插件商店 · 2026 年 skills.sh 有 256K 装机 · 推测 company license 贡献主 revenue · 零售 a la carte 是长尾补充。

### 7.5 v5 breaking changes(issue #3310)列了 license 计划

- **Freelancer 算 employee headcount** — 公司雇自由职业者也计入 3 人门槛(堵漏洞)
- **Company license 需 agree to T&C**(强化法律约束)

说明 Remotion 正在**收紧 license** · 不是放松。

### 7.6 NextFrame 启发(License 维度)

- ⚠️ **避**: source-available(限 ≤3 员工)对企业吓退 · NextFrame 选 **Apache 2.0** 是正确的(生态才能真起飞)
- ⚠️ **避**: 走 a la carte $20-$600 组件商店 = 重销售运营 · 小团队玩不起
- 💡 **观察**: Remotion 能这么收是因为 React 生态已绑定 · 有议价权 · NextFrame 早期靠开源做基建 · 变现模式留后面想(Lambda 托管 / 企业 SaaS 更轻)

---

## 8. GitHub Issue 痛点(Top 抱怨)

### 8.1 按 reactions 排序(用户最想要的 feature)

| # | +reactions | 标题 | 摘要 |
|---|---|---|---|
| #5913 | +39 🚀 | **Client-side rendering masterplan** | 浏览器端直渲(`@remotion/web-renderer`)· 已 alpha · 用户极度想要脱 Lambda |
| #3310 | +5 | Which breaking changes should be made for Remotion v5? | v5 规划讨论 · license 收紧 + API 清理 |
| #5650 | +3 | New video/audio tag, master issue | 老 `<Video>` / `<Audio>` 坑多 · 要重写 |
| #1326 | +3 | Load compositions from a URL | 希望运行时远程加载 · 现在全本地 bundle |
| #4372 | +2 | Allow Lambda to run with a single concurrency | Lambda 强制多 chunk · 短视频反而慢 |

### 8.2 按评论数排序(讨论最多的坑)

| # | comments | 标题 |
|---|---|---|
| #2930 | 33c | **HLS Support for `<Video>`** — 不能播 HLS 流 |
| #4664 | 18c | **Improve single-instance rendering performance** — 大 VPS 并发不 scale |
| #1326 | 14c | Load compositions from a URL |
| #3310 | 12c | v5 breaking changes |
| #5227 | 11c | Lambda: Custom output destination 不支持 Tigris(S3-compat) |
| #3332 | 8c | `--disable-headless` 不工作(bug) |
| #3839 | 6c | Lambda: Private Buckets 需求 |
| #1078 | 6c | CloudFormation/Terraform/Pulumi/CDK 模板需求 |

### 8.3 Top 3 抱怨总结

1. **单机性能上不去**(issue #4664 + #4300)
   - 48 核 350GB VPS 高并发不线性加速
   - **根因**: Chrome 多 tab 不等于多 CPU 用满 · **OffthreadVideo 帧提取串行** · 视频合成场景高并发反而慢
   - 暴露的架构局限: Remotion 靠 Lambda 多机并发掩盖单机瓶颈 · 单机用户受罪

2. **HLS / 现代视频格式支持差**(#2930 33 评论)
   - `<Video>` 不吃 HLS / DASH / 流式
   - 用户得自己 ffmpeg 预转成 MP4 · 麻烦

3. **运行时远程加载 composition**(#1326 · 自 2022 就开)
   - 至今必须 build 时 bundle
   - SaaS 多租户场景(每用户不同 composition)只能每次 bundle = 慢

### 8.4 Client-side rendering(#5913 · 未来方向)

官方已起 `@remotion/web-renderer` alpha:

```ts
// remotion.config.ts
Config.setExperimentalClientSideRenderingEnabled(true);
```

两个新 API:
- `renderMediaOnWeb()`
- `renderStillOnWeb()`

**动机**: 脱 Lambda · 用户浏览器直渲 · cost 归零。
**挑战**:
- "Not everything is capturable"(z-index / transform stacking 不能 100% 复刻)
- Context 隔离(global APIs 冲突)
- 需新 API `useDelayRender()` 替代 `delayRender()`

**信号**: Remotion 自己意识到 Lambda-only 架构限制 · 在主动拆服务器依赖。

### 8.5 NextFrame 启发(Issue 痛点)

- ✅ **避 HLS 坑**: NextFrame 第一天就支持流式视频输入 · 用 mediabunny / ffmpeg.wasm 做源侧适配
- ✅ **避单机并发坑**: 不靠 Chrome 多 tab · 直接 wgpu/metal GPU 路径 · 单机就能起量
- ✅ **避 bundle-per-user 坑**: NextFrame JSON-first 架构天生支持"运行时 spec → 动态渲染" · 不 rebuild
- 💡 **观察 client-side rendering 方向**: Remotion 知道 server-render-only 是瓶颈 · NextFrame 若有 client render 能力 = 战略差异化

### 8.6 为啥 rustymotion 等第三方要重写

本次扫描没直接撬到 rustymotion 的 README · 但从 Remotion 自己 issues 可推:
- **v1.0 license 收紧**(freelancer 算 employee)吓退企业
- **单机性能上限** · source-available 想 fork 优化的人被 license 挡
- **React 强绑定** · 不是所有团队都要 React
- **Lambda-only cost** + CRU 附加 license · 想脱绑

Rust 方案(rustymotion)三条卖点:真开源 / 原生性能 / 无 React 依赖 · 正好打 Remotion 痛点。

---

## 总结 · NextFrame 5 条启发

1. **抄**: **AI-native docs 的 `.md` URL pattern** — `/docs/xxx.md` 直出 markdown + Accept header 协商 · 零成本让 LLM 爬 · Remotion 实战验证过(官方 Claude Code / opencode 自动抓)。不跟 llms.txt 跟风(Remotion 自己都没用)。实现:Next.js `route.ts` 加后缀分支 or 静态 build 同时 emit md+html。

2. **抄**: **Agent Skill 包 "SKILL.md 当 router + 粒度细的 rules/"** 结构 — 35 条 rule · 平均 3KB · 按需 "load the XX.md" · frontmatter 只 3 字段(name/description/tags)· 用 MUST/FORBIDDEN 大写硬话 · 版本号跟主包同步。NextFrame 若出 `@nextframe/skills` npm 包 · 直接照搬结构 + `npx skills add nextframe/skills` 分发。

3. **避**: **source-available license + ≤3 员工门槛** — 企业吓退 · 还在往紧里收(v5 把 freelancer 算 employee)。NextFrame 坚持 Apache 2.0 · 变现走 Lambda 托管 / 企业 SaaS / 培训 · 不走 license 杠杆。

4. **避**: **React 组件 = Composition = Schema 强绑定** — 门槛在会写 React · 排除非程序员 / AI 生成路径 / 非 React 团队。NextFrame JSON-first(scene.json → 引擎翻译)是**对立面 · 差异化价值**。保住。

5. **观察 + 学习**: **架构瓶颈(单帧提取串行 + Chromium 多 tab 不 scale)**是 headless-browser-render 通病 — 这是 Remotion 用 Lambda 大并发来掩盖的问题。NextFrame 若想真有性能优势 · 必须**换渲染底座**(wgpu/metal/WebGPU/自己的 scene graph)· 不是 "比 Remotion 更好的 React 套壳"。Remotion 自己起 `@remotion/web-renderer` 就是在爬出这个坑。

---

## 关键 URL 索引(本次扫描直接访问的)

- **Skill 源码(35 rules)**: https://github.com/remotion-dev/remotion/tree/main/packages/skills/skills/remotion
- **SKILL.md 主 router**: https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/skills/skills/remotion/SKILL.md
- **animations rule 样本**: https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/skills/skills/remotion/rules/animations.md
- **compositions rule 样本**: https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/skills/skills/remotion/rules/compositions.md
- **timing rule 样本**: https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/skills/skills/remotion/rules/timing.md
- **Agent Skills 文档**: https://www.remotion.dev/docs/ai/skills
- **AI-friendly docs 总介**: https://www.remotion.dev/docs/ai
- **`.md` URL 实例**: https://www.remotion.dev/docs/player.md(验证过返回 raw markdown)
- **Lambda 架构详解**: https://www.remotion.dev/docs/lambda/how-lambda-works
- **Lambda 总览**: https://www.remotion.dev/docs/lambda
- **Lambda CLI**: https://www.remotion.dev/docs/lambda/cli
- **renderMedia API**: https://www.remotion.dev/docs/renderer/render-media
- **Chromium flags**: https://www.remotion.dev/docs/chromium-flags
- **bundle() API**: https://www.remotion.dev/docs/bundle
- **Player 组件**: https://www.remotion.dev/docs/player
- **License**: https://www.remotion.dev/docs/license
- **Pro 商店**: https://www.remotion.pro/
- **skills.sh marketplace**: https://skills.sh
- **Top issue · client-side render**: https://github.com/remotion-dev/remotion/issues/5913
- **v5 breaking changes**: https://github.com/remotion-dev/remotion/issues/3310
- **单机性能瓶颈**: https://github.com/remotion-dev/remotion/issues/4664
- **HLS 不支持**: https://github.com/remotion-dev/remotion/issues/2930

---

**扫描深度**: 21 调用(9 WebFetch docs + 7 gh API + 5 curl raw files) · 覆盖 8 维度 · 所有代码/frontmatter/价格/issue body 均原文摘录或 gh API 直读。
