# Hyperframes · Deep Tech

> 深挖时间 2026-04-21 · 源自 `heygen-com/hyperframes@main`(v0.4.11)· 13 次 web 调用直读 raw source · 0 次 npm install。
> 8.2k stars · bun monorepo · 7 packages · 4-21 当天还在 merge PR(#352/354/355 · 高频迭代)。

## 0. 一句话定位

**"Write HTML. Render video. Built for agents."**
—— HTML + data-* + GSAP = source of truth;engine 拿 headless Chrome 驱动 **CDP BeginFrame 协议**做**确定性逐帧抓取**;ffmpeg 负责编码 + 混音;agent 侧靠 Anthropic 原生 **Skills** 机制注入(不是 MCP · 不是自造 CLI DSL)。

---

## 1. 渲染 Pipeline (★ 最重要 · 这是他们的核心护城河)

### 1.1 两种抓帧模式(Linux 独占 vs 跨平台 fallback)

`packages/engine/src/services/frameCapture.ts` 里并存两条路径:

| 模式 | 触发条件 | 方法 | 确定性 |
|---|---|---|---|
| **BeginFrame**(主力) | **Linux + `chrome-headless-shell`** | CDP `HeadlessExperimental.beginFrame` 驱动 event loop · 跟踪 damage/no-damage 帧状态 | **最强** — Chrome 官方确定性渲染协议 |
| **Screenshot**(fallback) | 非 Linux / 非 headless-shell | `Page.captureScreenshot` + requestAnimationFrame polling | 中等 — 会漂 |

Chrome 启动关键 flag(`browserManager.ts`):

```
--deterministic-mode               // ⭐ Chrome 官方确定性模式(BeginFrame 前置)
--enable-begin-frame-control       // ⭐ 开 BeginFrame CDP
--use-gl=angle --use-angle=swiftshader   // 软件 GPU · 跨机器一致
--force-color-profile=srgb
--font-render-hinting=none
--disable-background-timer-throttling
--ignore-gpu-blocklist
```

**意味着**:他们**牺牲 GPU 加速换了跨机器像素级一致**。自媒体视频不需要实时 · 确定性 > 速度。

### 1.2 seek 协议(AI 写代码 · 运行时找这个协议就行)

engine 和 page 的接口非常窄 —— **就一个 `window.__hf` 对象**。`runtimeContract.ts` 定义:

```typescript
export const HYPERFRAME_RUNTIME_GLOBALS = {
  player: "__player",
  playerReady: "__playerReady",    // page 准备好了
  renderReady: "__renderReady",    // 可以开始抓帧了
  timelines: "__timelines",         // gsap/lottie/three 都注册到这
  clipManifest: "__clipManifest",
} as const;

export const HYPERFRAME_CONTROL_ACTIONS = [
  "play", "pause", "seek",
  "set-muted", "set-playback-rate",
  "enable-pick-mode", "disable-pick-mode",
] as const;
```

抓帧主循环(`captureFrameCore` 伪代码):

```
1. quantizedTime = floor(t * fps) / fps              // 对齐到帧边界
2. await page.evaluate(`window.__hf.seek(${quantizedTime})`)  // 广播到所有适配器
3. await optional beforeCapture hook                  // 注入真 video 帧(见下)
4. if Linux:  CDP HeadlessExperimental.beginFrame { screenshot: {...} }
   else:      CDP Page.captureScreenshot
5. 记录 seek_ms / screenshot_ms / damage_count 分阶段耗时
```

### 1.3 多框架时间线统一(seek 一次 · 所有动画归位)

`runtime/player.ts` + `runtime/init.ts`:用**适配器模式**把 5 种动画框架的 seek 语义统一成 `seek({ time })`:

- `createGsapAdapter` — `timeline.seek(t)` · 每个 timeline 必须 `{ paused: true }` 注册到 `window.__timelines`
- `createLottieAdapter` — `anim.goToAndStop(t * 1000, true)`
- `createThreeAdapter` — 手动推 `Clock.elapsedTime` + `AnimationMixer.update`
- `createWaapiAdapter` — `animation.currentTime = t * 1000`
- `createCssAdapter` — `animation-delay` 计算 · 只读

duration 解析走 `resolveRootTimelineFromDocument`:

1. 找 `[data-composition-id]` 根元素
2. 用对应 GSAP timeline 的 duration(若 > 1/60s)
3. 合成子 composition(嵌套)
4. **media floor**:遍历 video/audio 的 `data-start + data-duration` 取 max
5. 若 `data-duration` > GSAP duration + 0.5s · 用零时长 tween 垫到声明 duration

### 1.4 视频内嵌(PIP 真视频)的处理(妙招)

**难点**:Chrome 在 BeginFrame 模式下 `<video>` 的 currentTime 跟 DOM seek 不同步。

**解法**:`videoFrameExtractor.ts` + `videoFrameInjector.ts` 双服务 ——
1. 预处理阶段:用 ffmpeg 抽取 mp4 → PNG 帧序列(磁盘)
2. 抓帧 `beforeCapture` hook:按 `quantizedTime` 读对应 PNG 帧 · `canvas.drawImage` 画到 `<video>` poster 位置
3. 抓帧后合成就是正确的 video 画面

这是**绕过 Chrome video 非确定性的关键 trick**。NextFrame 若做真视频合成必抄。

### 1.5 FFmpeg 编码命令(`chunkEncoder.ts`)

按格式 × 质量选 codec:

| 输出 | 编码器 | 像素格式 | 用途 |
|---|---|---|---|
| MP4 标准 | `libx264` | `yuv420p` | 默认 |
| MP4 HDR | `libx265` 10-bit | `yuv420p10le` | BT.2020 |
| WebM | `libvpx-vp9` | `yuva420p` | 带透明通道 |
| MOV | `prores_ks` | `yuva444p10le` | ProRes 4444 · 专业后期 |

GPU 可选:`h264_videotoolbox`(macOS)· `hevc_nvenc`(NVIDIA)· `hevc_vaapi`(Linux Intel)· `hevc_qsv`(Intel 集显)。

**共同尾巴(色彩元数据)**:

```
-c:v libx264 -preset <preset> -crf <quality>
-x264-params "aq-mode=3:..."
-pix_fmt yuv420p
-vf "scale=in_range=pc:out_range=tv"       # ⭐ 全范围→TV 范围 · 绕 browser sRGB bug
-colorspace:v bt709 -color_primaries:v bt709 -color_trc:v bt709
-color_range tv
-video_track_timescale 90000               # ⭐ 90kHz · 所有容器对齐 MPEG-TS 标准
```

音频:mp4/mov 用 `aac @ 192k` · webm 用 `libopus @ 128k` · mp4 额外加 `+faststart`(流媒体)。

### 1.6 混音(`audioMixer.ts`)

ffmpeg `filter_complex` · **不写中间 wav**:

```
[0:a]atrim=0:<dur>,volume=<v>,adelay=<ms>|<ms>[a0]
[1:a]atrim=...,volume=...,adelay=...[a1]
...
[a0][a1][a2]amix=inputs=3:duration=longest:dropout_transition=0
,volume=<master>,apad=whole_dur=<total>
```

所有轨道同时走一个 ffmpeg 进程 · 不生成中间文件。

### 1.7 并行 render(`parallelCoordinator.ts`)

- `distributeFrames()`:`framesPerWorker = ceil(total / N)` · 每 worker 独立目录 `worker-0/`, `worker-1/`
- `Promise.all` 并行跑 · 每 worker 一个独立 Chrome 进程
- `mergeWorkerFrames()`:按 `startFrame` 排序 · 按原始文件名顺序拼
- 默认 `workers = min(8, floor(cores * 3 / 4))` —— **给系统留 25% core**(别跟 ffmpeg 抢)
- CLI flag `--workers`(自动) / `--max-concurrent-renders 1-10`

### 1.8 4K 支持(真相)

**不是真 4K 原生**。`browserManager.ts` 里 **没有 deviceScaleFactor 配置** · 只是 `--window-size=<w>,<h>` 把 viewport 放大到 4K。

**含义**:CSS `1920×1080` 实际被渲染到 `3840×2160` viewport 里 · 字体 / SVG / canvas **真的按 4K 像素画** · 但 `<img>` 还是按原图分辨率(用户自己保证素材够大)。

他们的 HDR 模式独立:`--hdr` → H.265 10-bit + BT.2020 + HDR readback(`hdrCapture.ts`)· 这是**真 HDR 通路**(不是放大)。

### NextFrame 启发 ★

- ✅ **抄 BeginFrame 协议**:Linux CI 跑时必用 · 跨机器像素一致 · 这是自媒体视频可复现的基石
- ✅ **抄 `window.__hf` 窄接口**:engine 和 page 只靠 seek(t) / duration / renderReady 三个字段通信 · 不要胖 RPC
- ✅ **抄 video PNG 预抽取**:解决 BeginFrame 下 `<video>` 非确定性
- ✅ **抄 90kHz timescale + scale=in_range=pc:out_range=tv**:色彩平台一致
- ⚠ **避 4K = 真 4K 幻觉**:用户素材不够分辨率 4K 就是糊的 · 启发 NextFrame **显式约束素材分辨率**
- ⚠ **避 `--use-gl=angle --use-angle=swiftshader`**:完全放弃 GPU · NextFrame 若自己写 wgpu shader 路径就不能抄这套

---

## 2. JSON / API Schema(用户写法)

### 2.1 用户写 HTML · 不写 JSON · 不写 React

README 里的完整示例:

```html
<div id="stage"
     data-composition-id="my-video"
     data-start="0"
     data-width="1920"
     data-height="1080">
  <video id="clip-1" data-start="0" data-duration="5"
         data-track-index="0" src="intro.mp4" muted></video>
  <img   id="overlay" data-start="2" data-duration="3"
         data-track-index="1" src="logo.png" />
  <audio id="bg-music" data-start="0" data-duration="9"
         data-track-index="2" data-volume="0.5" src="music.wav"></audio>
</div>
```

`data-*` 属性全列表:
- `data-composition-id` — 根 composition 唯一 id
- `data-start` — 入场时间(秒 · 数字) / 或 `"#elementId+0.5"` 引用其他元素
- `data-duration` — 在场时长
- `data-track-index` — 层序(z-index 逻辑)
- `data-width` / `data-height` — canvas 尺寸
- `data-volume` — 音量 0-1
- `data-composition-src` — 嵌套 composition 外部文件路径(模块化)

动画**不走 data-*** · 走 GSAP JS:

```javascript
// 每个 timeline 必须 paused + 注册到 window.__timelines
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.from("#logo", { opacity: 0, y: 20, duration: 0.8, ease: "power2.out" });
window.__timelines["my-video"] = tl;
```

### 2.2 TypeScript types(studio 编辑器 / player 才用)

`core.types.ts` 里有:`TimelineElement` · `TimelineMediaElement` · `TimelineTextElement` · `TimelineCompositionElement` · `CompositionSpec` · `Keyframe` · `PlayerAPI` · `CanvasResolution` —— **只用在 studio GUI 里**(所见即所得的 visual editor)。命令行 render 通道**不走 JSON schema** · 直接 parse HTML。

### 2.3 有 JSON schema(但用来 lint · 不给用户写)

- `hyperframes.json`(项目根)— 元数据 · 引用 composition 文件列表
- `npx hyperframes lint` 走自建 parser + lint rules(`packages/core/src/lint/`)
- 链路:HTML → parser → AST → lint rules → 错误/警告

### NextFrame 启发 ★

- ❌ **不抄 HTML 作为 source of truth** —— NextFrame charter 要求 JSON 驱动(v0.1.0 kickoff 会定)· HTML+GSAP 是 web 前端心智模型 · NextFrame 面向 PM 不合适
- ✅ **抄声明式 `data-*` 时间属性模式**:即使用 JSON · 字段名可以参考(start / duration / track / volume)
- ✅ **抄嵌套 composition (`data-composition-src`)**:JSON 里用 `$ref` 做同等事
- ⚠ **避 "动画走 GSAP JS"**:PM 写不出来 · NextFrame 必须纯 JSON 声明式(用户写 "fadeIn" + 参数 · 不写 gsap.from)

---

## 3. AI 集成具体形态(★ 这是 Hyperframes 最值得抄的维度)

### 3.1 没有自造 CLI DSL · 用 Anthropic 原生 Skills 机制

`npx skills add heygen-com/hyperframes` 做的事:

```typescript
// packages/cli/src/commands/skills.ts
spawn("npx", ["skills", "add", "repo", "--all"], {
  env: { ...env, GIT_CLONE_PROTECTION_ACTIVE: "0" },
  stdio: "inherit",
  timeout: 120_000,
})
```

—— 调 **Anthropic 官方 `skills` 工具**(`@anthropic-ai/skills`)· 从 GitHub 仓 `heygen-com/hyperframes` 里同步 `skills/` 目录到用户本地 `~/.claude/skills/` 或项目 `.claude/skills/`。

注册 5 个 skill:

| skill 名 | 触发场景 |
|---|---|
| `hyperframes` | 通用 composition 创作 |
| `hyperframes-cli` | CLI 使用指导 |
| `hyperframes-registry` | registry 50+ 组件 |
| `gsap` | GSAP 动画语法 |
| `website-to-hyperframes` | 7 步 URL → 视频 pipeline |

Claude Code 自动扫 `.claude/skills/*/SKILL.md` 加载 · **跟 NextFrame 用的是同一套机制**(claude-seed skill 机制)。

### 3.2 SKILL.md 内容节选(`skills/hyperframes/SKILL.md`)

**Non-Negotiable Rules**(硬约束 · 每次触发给 Claude 看):
- No random values — deterministic only
- No infinite loops — `repeat: -1` breaks capture; calculate finite repeats
- No async timeline building — timelines must construct synchronously at page load
- Scene transitions mandatory
- Entrance animations required — every element must `gsap.from()` in
- No exit animations (except final scene) — transitions handle scene exits
- Muted video + separate audio — never use video for sound

**Layout-First Principle**:"Position every element where it should be at its most visible moment—the frame where it's fully entered, correctly placed, and not yet exiting. Build static CSS first, then animate *into* those positions using `gsap.from()`."

**视觉统一**(见 `skills/hyperframes/visual-styles.md`):8 个预设 palette + `house-style.md` + `patterns.md` + `data-in-motion.md`。

### 3.3 `website-to-hyperframes` 7 步工作流(skill 内的 state machine)

每一步产出文件 → 下一步强制读 · 不能跳:

1. **Capture & Understand** — 爬站提取 brand / 截图
2. **Write DESIGN.md** — 90 行品牌参考
3. **Write SCRIPT** — 旁白(决定场景时长)
4. **Write STORYBOARD** — beat-by-beat 分镜
5. **Generate VO + Map Timing** — TTS + word-level 对齐
6. **Build Compositions** — 逐 scene 构建 · self-review
7. **Validate & Deliver** — `lint` + `validate` + preview

**each step gates completion** —— 跟 NextFrame 的 4-phase kickoff/spec/poc/build 思路几乎一样 · 但粒度更细。

### 3.4 slash commands(不走 MCP)

`.claude/settings.json` 里**没注册 slash commands** —— slash 是 skill 自带的。用户在 Claude Code 输 `/hyperframes` / `/website-to-hyperframes` 就触发对应 SKILL.md · 没有 MCP server。

**关键**:**没有 MCP tools**。Hyperframes 选了最轻的集成路径 —— 纯 skills。

### 3.5 `.claude/settings.json` 硬约束

就一个 PreToolUse hook · 拦 `git commit`:

```
matcher: Bash
command: 拦 /git\s+commit\b/ · 跑 bun run build + bun run lint + bun typecheck
         任何失败 → continue:false + stopReason 输出
timeout: 180s
```

—— **强制每次 commit 前都过 build + lint + typecheck 三关**。这是"坏代码提交不过"的典范实现(见 NextFrame `identity.md` "Harness Engineering")。

### 3.6 CLI 本身也是 AI-friendly

`packages/cli/src/commands/_examples.ts` 给每个命令附带 `examples` 数组(`type Example`)· `hyperframes --help` 直接列示例。agent 读 help 就能学。

非交互:`--quiet` · `--json`(benchmark 输出 JSON)· `--strict`(lint 失败 exit 非零)· 全链路 agent-friendly。

### NextFrame 启发 ★

- ✅ **抄"skills 机制 · 不自造 DSL"** —— NextFrame 本就走 claude-seed skills · 继续坚持不造 CLI DSL
- ✅ **抄 SKILL.md 里的 "Non-Negotiable Rules"**:给 AI 硬约束比软建议有效 10 倍
- ✅ **抄 `website-to-hyperframes` 的 "each step gates completion"**:每步必产文件 · 跳步 = fail · 这就是 NextFrame 4-phase 的微观化
- ✅ **抄 PreToolUse git commit hook**:build + lint + typecheck 三关作为硬闸口
- ✅ **抄 `--json` 机器输出 + `--strict` exit code**:所有 CLI 命令必须 AI-first
- ⚠ **不抄 MCP**:走 skills 足够了 · MCP 增加运维成本且无明显收益

---

## 4. 性能 / 4K

### benchmark 配置(`benchmark.ts`)

5 个默认组合:

| label | fps | quality | workers |
|---|---|---|---|
| draft · 2w | 30 | draft | 2 |
| standard · 2w | 30 | standard | 2 |
| high · 2w | 30 | high | 2 |
| standard · 4w | 30 | standard | 4 |
| 60fps · standard · 4w | 60 | standard | 4 |

指标:`elapsedMs` · `fileSize` · `failures` · 输出人类 table 或 `--json`。

**没有公开的 benchmark 数据**(README / DESIGN.md 里都没)· 这是他们**刻意不 marketing 性能**(护城河在确定性 · 不在速度)。

### 已知性能瓶颈(从 issues 挖)

- #334 `auto-worker mode times out on trivial image-only compositions` — worker 数上限算法在极小 case 下暴死
- #317 `Jerky Preview experience` — preview 预览卡顿(跟 render 管线是两套)
- #309 `port scan race condition` on Crostini — 并发 Chrome 起进程抢端口

**增量 render 支持**:看不到明显实现 · 每次都是全量重 render · 默认按帧号对齐缓存(worker 目录可复用)。

### NextFrame 启发 ★

- ✅ **抄 benchmark CLI · 5 组默认配置**:NextFrame 也加 `benchmark` 子命令 · 便于 verify
- ⚠ **避 auto-worker 算法**:#334 已暴 · NextFrame 初期固定 workers=1 · 稳了再调
- 💡 **考虑增量 render**:Hyperframes 没做 · NextFrame 可做差异化(scene 级 cache)

---

## 5. Monorepo 7 packages 职责

| package | 职责 | 关键文件 | critical path? |
|---|---|---|---|
| `cli` | 命令行入口 · 绑 commands · 调 engine/producer | `cli.ts` · `commands/render.ts` · `commands/preview.ts` · `commands/skills.ts` | ✅ 用户第一触点 |
| `core` | 类型 · parser · linter · runtime 注入脚本 | `runtime/player.ts` · `runtime/init.ts` · `inline-scripts/runtimeContract.ts` · `core.types.ts` · `lint/` | ✅ 协议中心 |
| `engine` | Puppeteer + CDP 抓帧 + ffmpeg 编码 | `services/frameCapture.ts` · `services/chunkEncoder.ts` · `services/browserManager.ts` · `services/parallelCoordinator.ts` | ✅ **真正的引擎** |
| `producer` | render job 编排 · 把 engine 步骤串成流水线 | (未深挖 · `createRenderJob` 入口) | ✅ 工作流 |
| `studio` | 浏览器可视化编辑器(拖拽时间线) | `studio-api` · 浏览器端 | ❌ 可选 |
| `player` | embeddable web component `<hyperframes-player>` | (未深挖) | ❌ 可选 |
| `shader-transitions` | 14+ WebGL 着色器转场 | 独立 init() API · 接 GSAP timeline | ❌ 可选 |

**观察**:engine + core 是 critical 2 包 · 其他 5 个都是可选加料。

### NextFrame 启发 ★

- ✅ **抄 "engine + core 双核"**:NextFrame 当前 src/ 空 · v0.1.0 先搭这两 crate(或 rust 等价)
- ⚠ **避 7 package 一起上**:charter 要求"一版一件事" · studio/player/shader-transitions 都是后面的事

---

## 6. 文档基础设施

- **docs site**:`hyperframes.heygen.com`(Nextra 或类似)· 自动从 `docs/` + `packages/*/docs/` 聚合
- **catalog**:`registry/` 仓 50+ 预置 composition blocks(registry 跟 skills 是两回事 · registry 是组件 · skills 是 AI 指令)
- **`.github/workflows/catalog-previews.yml`**:CI 自动给每个 catalog block 生成预览视频
- **`.github/workflows/docs.yml`**:docs 部署
- **`DOCS_GUIDELINES.md`** · **`DESIGN.md`**(DESIGN.md 谈的是**文档站视觉设计** · 不是产品视觉)
- 用户完整文档:"Quick Start" + "CLI commands" + "data-* 属性" + "GSAP 约束"

### NextFrame 启发 ★

- 💡 **catalog-previews.yml 模式**:给 NextFrame examples 自动跑 CI 渲染视频作为 PR 预览 · v0.2+ 可抄
- ✅ **registry 和 skills 分开**:NextFrame 若要做 "templates" 系统 · 别混进 skills

---

## 7. CI / 测试 / 发版

### CI workflows

| yml | 作用 |
|---|---|
| `ci.yml` | 通用 CI:build · lint · typecheck · vitest |
| `regression.yml` | 回归测试(像素级对比 golden frames?) |
| `windows-render.yml` | Windows 专项(#333 提到 FFmpeg 检测在 Win 下挂) |
| `catalog-previews.yml` | catalog 预览生成 |
| `docs.yml` | docs 部署 |
| `publish.yml` | npm 发布(带 `workflow_dispatch` 手动触发 · PR #354) |

### 测试

- 单测:vitest(近乎每个 .ts 都有 `.test.ts` 配对 · 见 `frameCapture.test.ts` / `chunkEncoder.test.ts` / `parallelCoordinator.test.ts`)
- 集成:`Dockerfile.test` 专门跑容器内 render 测试
- 契约测试:`inline-scripts/parityContract.test.ts` —— 保障 engine 和 preview 的 seek 行为一致

### 发版节奏

截到 2026-04-21(今天):
- PR 每天 5-10 个 merge · 主要是 HeyGen core team
- 版本号 `@hyperframes/cli@0.4.11` —— 还在 0.x · 没发 1.0
- 最近 5 个 merged PR 全是 **2026-04-19 ~ 04-20**(48 小时内)· 说明仓库**正在高速迭代**

### commit / lint 工具链

- **package manager**:bun(不是 pnpm · `AGENTS.md` 明确禁 pnpm)
- **lint**:**oxlint + oxfmt**(不是 biome / eslint / prettier)· 跑在 lefthook pre-commit 里
- **commitlint**:conventional commits
- **knip**:死代码检测

### NextFrame 启发 ★

- ✅ **抄 `.test.ts` 配对每个 .ts**:高测试密度 = 重构信心
- ✅ **抄 regression.yml 像素回归**:对于视频引擎 · 像素级 golden frame 比行为断言更强
- ✅ **抄 Dockerfile.test**:跨机器跑容器内 render · 确定性的最终闸口
- 💡 **考虑 oxlint 替代 clippy**:若 NextFrame TS 部分多 · oxlint 比 eslint 快 10x

---

## 8. 已知痛点(真实用户反馈)

### 最近 30 天已关闭 bug(11 个)

1. **#343 Build: topological ordering** — monorepo build 顺序之前靠 hack
2. **#334 Auto-worker timeout on image-only** — worker 数算法暴死
3. **#333 Windows FFmpeg detection fails** — Win 平台检测挂
4. **#321 Skipping external asset with unsafe path** — 安全补丁
5. **#317 Jerky Preview experience** — 预览卡
6. **#316 Failed to install due to post-checkout script** — npm 安装挂
7. **#309 preview port scan race on Crostini** — 端口抢
8. **#304 Unable to load schema file** — schema 路径找不到
9. **#300 npx skills add fails with 60s clone timeout** — git clone 卡(所以他们加了 `GIT_CLONE_PROTECTION_ACTIVE: "0"`)
10. **#352 CDN script inlining hardened with linkedom** — CDN 脚本内联安全
11. **#348 video frame injection in snapshot match render** — snapshot 和 render 视频帧不一致

### 当前 open issues(3 个 · 全是 feature request)

- #350 Cloudflare Workers support — serverless render · 还没做
- #340 Reusable Components and Global Design Systems — 想要全局 token
- #337 ElevenLabs TTS integration — 第三方 TTS

### NextFrame 启发 ★

- ⚠ **避 Windows 踩坑**:#333 提示 `ffmpeg` 检测要**跨平台谨慎**(别直接 `which ffmpeg` · 用 `resolveBin`)
- ⚠ **避 auto-worker 激进**:小 case 固定 1 worker 别自动放大
- 💡 **Cloudflare Workers / serverless**:是 Hyperframes 的空白 · NextFrame 若早做是差异化
- 💡 **global design tokens** (#340):用户要 · Hyperframes 还没给 · NextFrame 可以早做

---

## 总结(对 NextFrame 的 5 条具体启发)

1. **抄 — BeginFrame 确定性协议**:Linux CI 跑时用 `--deterministic-mode` + `--enable-begin-frame-control` + CDP `HeadlessExperimental.beginFrame` · 这是自媒体视频"跨机器像素一致"的基石 · 参考 `packages/engine/src/services/frameCapture.ts`。

2. **抄 — 窄接口 `window.__hf`**:engine 和 page 只靠 `seek(t) / duration / renderReady` 三字段通信 · NextFrame 无论用 Rust / TS 写 engine · 注入脚本保持这么窄 · 别自造 RPC · 参考 `packages/core/src/inline-scripts/runtimeContract.ts`。

3. **抄 — AI 集成用 Skills + 硬约束 Non-Negotiable Rules**:不做 MCP · 不造 DSL · 就写 SKILL.md + 几条"no random / no infinite loops"的硬约束 · 参考 `skills/hyperframes/SKILL.md`。PreToolUse hook 拦 git commit 跑 build+lint+typecheck · 这是"坏代码提交不过"的工程实现 · 参考 `.claude/settings.json`。

4. **避 — HTML + GSAP 作为 source of truth**:Hyperframes 的核心用户是**会写 HTML 的前端 / AI agent** · NextFrame 的核心用户是 **PM 写 JSON**(charter 已锁) · 根本错位 · 不能抄这个模型。JSON → 内部转 HTML 是可选链路 · 但**对用户永远暴露 JSON**。

5. **避 — 4K = 放大 viewport 幻觉**:Hyperframes 靠 `--window-size 3840x2160` 把所有东西放大 · 图片素材不够 4K 就糊 · NextFrame 应**显式约束素材分辨率**(lint 阶段卡) · 或做 AI 上采样。同时 Hyperframes 靠 swiftshader 全软件渲染放弃 GPU · NextFrame 若走 wgpu 原生 shader 路径 · 是真 4K + 真 GPU 的差异化。

---

## 关键代码片段索引(v0.1.3 POC 直接 fetch 参考)

| # | 关键文件 | 看啥 |
|---|---|---|
| 1 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/engine/src/services/frameCapture.ts` | BeginFrame + seek 协议 + 抓帧核心 |
| 2 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/engine/src/services/chunkEncoder.ts` | ffmpeg 命令完整参数矩阵 |
| 3 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/engine/src/services/browserManager.ts` | Chrome launch flags(deterministic / swiftshader / BeginFrame) |
| 4 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/engine/src/services/parallelCoordinator.ts` | N worker 分帧 + 合并 |
| 5 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/engine/src/services/audioMixer.ts` | filter_complex 多轨混音一步到位 |
| 6 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/core/src/inline-scripts/runtimeContract.ts` | window.__hf 窄接口(5 个 global + 7 个 action) |
| 7 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/core/src/runtime/player.ts` | PlayerAPI + 5 适配器模式(GSAP/Lottie/Three/WAAPI/CSS) |
| 8 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/core/src/runtime/init.ts` | duration 解析 + seek 广播 |
| 9 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/cli/src/commands/render.ts` | render CLI 完整 flag 表 + 编排流程 |
| 10 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/packages/cli/src/commands/skills.ts` | 调 anthropic 官方 skills 工具的姿势 |
| 11 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/hyperframes/SKILL.md` | AI 约束文本模板 · 7 条硬 rule |
| 12 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/website-to-hyperframes/SKILL.md` | 7 步 URL → 视频 state machine |
| 13 | `https://raw.githubusercontent.com/heygen-com/hyperframes/main/.claude/settings.json` | PreToolUse hook 拦 commit · 强制 build+lint+typecheck |

---

*字数约 4300 · 13 次 web 调用 · 预算 12-18 符合 · 写于 2026-04-21 15:30*
