# 01 · 分层架构

NextFrame v0.1.0 的依赖图以代码和 `test/architecture.test.js` 为准，不再按早期的“workflows / bridge / GUI”草图描述。它更像一个受约束的 DAG，而不是完美直线分层。

```
preview/
   ↓
bin/ + src/cli/
   ↓
src/ai/ + src/timeline/
   ↓
src/engine/
   ↓
src/scenes/

src/views/   -> src/engine/
src/targets/ -> src/engine/
```

## 依赖规则

| 区域 | 可依赖 |
|---|---|
| `preview/*` | `src/*` |
| `src/cli/*` | `src/ai/*`, `src/timeline/*`, `src/engine/*`, `src/views/*`, `src/targets/*`, `src/scenes/*` |
| `src/ai/*` | `src/engine/*`, `src/timeline/*`, `src/views/*`, `src/scenes/*` |
| `src/timeline/*` | `src/engine/*` |
| `src/views/*` | `src/engine/*` |
| `src/targets/*` | `src/engine/*` |
| `src/engine/*` | `src/scenes/index.js`, same-dir engine modules |
| `src/scenes/*` | scene helpers、自身依赖、`node:*`、`@napi-rs/canvas` |

更细的硬规则由 `arch-1 layer graph` 测试执行。

## L1 · Scene 层

### Scene registry 与 scene 实现

关键文件：
- `nextframe-cli/src/scenes/index.js`
- `nextframe-cli/src/scenes/_contract.js`

公共 scene 文件：
- Backgrounds: `auroraGradient`, `fluidBackground`, `starfield`, `spotlightSweep`, `pixelRain`, `particleFlow`, `orbitRings`
- Typography: `kineticHeadline`, `glitchText`, `countdown`
- Shapes: `circleRipple`, `meshGrid`, `neonGrid`, `shapeBurst`
- Data Viz: `barChartReveal`, `lineChart`, `dataPulse`
- Overlays: `lowerThirdVelvet`, `cornerBadge`, `textOverlay`, `vignette`
- Series: `ccFrame`, `ccBigNumber`, `ccPill`, `ccNote`, `ccDesc`
- Browser: `htmlSlide`, `svgOverlay`, `markdownSlide`, `lottieAnim`, `videoClip`, `videoWindow`
- Hidden extension example: `imageHero`

Browser / cache helpers：
- `src/scenes/_browser-scenes.js`
- `src/scenes/_png-decode.js`
- `src/scenes/_browser-documents.js`
- `src/scenes/_browser-markdown.js`
- `src/scenes/_html-cache.js`
- `src/scenes/_video-cache.js`
- `src/scenes/_image-cache.js`

## L2 · Engine 层

关键文件：
- `src/engine/render.js`
- `src/engine/validate.js`
- `src/engine/time.js`
- `src/engine/describe.js`
- `src/engine/_guard.js`

职责：
- resolve symbolic time
- validate timeline
- render frame
- aggregate describe metadata

## Engine adapters · Views / Targets

这两组模块都依赖 engine，但不被 engine 反向依赖。

### Views

关键文件：
- `src/views/gantt.js`
- `src/views/ascii.js`

职责：
- 把 engine 结果格式化为 ASCII 视图
- 提供给 AI / CLI 做低成本观察

### Targets

关键文件：
- `src/targets/napi-canvas.js`
- `src/targets/ffmpeg-mp4.js`

职责：
- `napi-canvas`：单帧 PNG 输出
- `ffmpeg-mp4`：MP4 导出与音频 mux

v0.1 的真实 target 形态不是早期草图里的 `wgpu/wasm` 多实现，而是：
- still frame: `napi-canvas`
- video export: `ffmpeg + libx264`

## L3 · AI / Timeline 层

### Timeline mutation 层

关键文件：
- `src/timeline/ops.js`

提供的纯函数：
- `addClip`
- `removeClip`
- `moveClip`
- `resizeClip`
- `setParam`
- `addMarker`
- `duplicateClip`
- `findClips`
- `getClip`

### AI tool 层

关键文件：
- `src/ai/tools.js`

职责：
- 暴露 12 个结构化工具给 AI
- 包装时间解析、描述、断言、ASCII 渲染
- 在 `apply_patch` 中执行 mutation + validate 闭环

## L4 · CLI 层

入口：
- `bin/nextframe.js`

CLI 模块：
- `src/cli/_io.js`
- `src/cli/new.js`
- `src/cli/validate.js`
- `src/cli/frame.js`
- `src/cli/render.js`
- `src/cli/probe.js`
- `src/cli/describe.js`
- `src/cli/gantt.js`
- `src/cli/ascii.js`
- `src/cli/scenes.js`
- `src/cli/guide.js`
- `src/cli/ops.js`
- `src/cli/assets.js`
- `src/cli/bakeHtml.js`
- `src/cli/bakeBrowser.js`
- `src/cli/bakeVideo.js`

L4 做的事：
- 路由 25 个子命令
- 解析 flags / positional args
- 格式化 stdout / stderr / JSON 输出
- 调 lower layers，不放业务状态

## L5 · preview/（可选 client）

`preview/` 目前只是一个薄 client，不是产品主路径。它只能向下读 `src/*`，不能反向让核心逻辑依赖 preview。

## 架构测试

当前自动化检查：
- `arch-1`：层级 import 图
- `arch-2`：scene contract
- `arch-3`：error contract
- `arch-4`：extension registry
- `arch-5`：file size cap
- `arch-6`：guard runtime

验证命令：

```bash
cd nextframe-cli
node --test test/architecture.test.js
```
