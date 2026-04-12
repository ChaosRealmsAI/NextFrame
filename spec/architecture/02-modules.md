# 02 · 模块契约

每个模块的职责、API、不变式、谁可以改、文件大小限制。

---

## L1 · Render Targets

### `targets/napi-canvas/`

**职责**：用 @napi-rs/canvas 实现 RenderTarget，编辑器实时预览用。

**公共 API**：
```js
export function createTarget(width, height) → RenderTarget
// RenderTarget 接口：
//   draw(cmds: DrawCommand[]) → void
//   readPixels() → Buffer
//   savePNG(path) → void
//   destroy() → void
```

**不变式**：
- 同一组 cmds 永远画出同一组像素
- DPR 由 width/height 直接决定，不读环境
- 不依赖 NodeJS DOM polyfill

**依赖**：`@napi-rs/canvas`

**测试**：`tests/napi-target.test.js`，给固定 cmds 序列，PNG 像素 hash 必须稳定。

**文件大小**：≤300 行/文件

---

### `targets/wgpu/`

**职责**：GPU shader 渲染，导出加速用。

**公共 API**：相同 RenderTarget trait，Rust 实现。

**不变式**：
- 同一组 cmds 永远画出同一组像素（GPU non-determinism 必须 zero — 用 atomic / fixed-point 算）
- 退化到 CPU fallback 是允许的（cargo feature `cpu-fallback`）

**依赖**：`wgpu = "29"`, `bytemuck`, `pollster`

**测试**：`tests/wgpu-pixel-stable.rs`，10 次同样 render，PNG hash 必须一致。

---

### `targets/wasm/`

**职责**：Rust→WASM build of tiny-skia，跨平台单文件 distribution。

**公共 API**：JS shim 把 RenderTarget 接口暴露给 Node 和浏览器。

**不变式**：与 napi-canvas / wgpu 输出像素差异 ≤ 1%（visual diff）。

---

## L2 · Engine + Domain

### `engine/`

**职责**：渲染调度器。读 timeline，对每帧分发到 active scenes。

**公共 API**：
```js
export function renderAt(target, timeline, t) → void
export function validateTimeline(timeline) → {ok, errors[], warnings[]}
export function resolveTimeline(timelineWithSymbols) → resolvedTimeline
export function describeFrame(timeline, t) → SceneDescription[]
```

**不变式**：
- `renderAt` 不修改 timeline
- `renderAt` 不缓存任何东西
- `renderAt(t1)` 和 `renderAt(t2 then t1)` 像素一致

**依赖**：`scenes/`, `timeline/`, `targets/` (L1)

**禁止**：`workflows`, `surface`, `editor` 的引用

**测试**：见 [05-safety](./05-safety.md) lint 1-7

**文件大小**：`renderAt.js` ≤200 行

---

### `engine/scenes/`

**职责**：21+ frame-pure scene 函数库。

**每个 scene 文件**（如 `lowerThirdVelvet.js`）必须 export 3 件事：

```js
// 1. 渲染函数 — 画像素
export function lowerThirdVelvet(t, params, ctx, globalT) { ... }

// 2. 描述函数 — 给 AI 看的语义
export function describe(t, params, viewport) → SceneDescription { ... }

// 3. 元数据 — scene 库注册 + AI param schema
export const META = {
  id: 'lowerThirdVelvet',
  category: 'Overlays',
  description: '底部信息条，标题+副标题+脉冲点',
  duration_hint: 8,
  params: [
    { name: 'title', type: 'string', required: true, semantic: 'main heading' },
    { name: 'subtitle', type: 'string', semantic: 'secondary line' },
    { name: 'hueA', type: 'number', range: [0, 360], default: 24 },
    ...
  ],
  ai_prompt_example: '在视频结尾用这个介绍产品名 + 标语',
};
```

**不变式**：
- frame-pure（见 [00-principles](./00-principles.md) #1）
- describe 和 render 必须同步：同一 (t, params) 描述的元素和画的元素一致
- META 必填：id / category / params

**测试**：每 scene 单测 (`scenes/__tests__/{name}.test.js`)：
- frame-pure invariant：render(t1) === render(t2 then t1)
- describe 一致性：在 describe 报告 visible:true 的 (x,y) 处 readPixel 必须非背景色
- META schema 完整

**文件大小**：每 scene ≤300 行

---

### `engine/timeline/`

**职责**：timeline JSON 操作的纯函数。

**公共 API**：
```js
export function addClip(timeline, trackId, clip) → newTimeline
export function removeClip(timeline, clipId) → newTimeline
export function moveClip(timeline, clipId, newStart) → newTimeline
export function setParam(timeline, clipId, key, value) → newTimeline
export function splitClip(timeline, clipId, t) → newTimeline
export function findClips(timeline, predicate) → [clipId]
```

**不变式**：
- 所有操作纯函数，输入 timeline 不变，返回新 timeline
- 每个操作内部跑 validateTimeline，失败返回 `{ok:false, errors}` 不写
- 时间值如果是符号 (`{after:'X'}`) 不 resolve，留给 engine 渲染时 resolve
- 永远不接受 raw seconds 在 patch 输入（必须是符号 或 显式 raw 字段）

**测试**：每个 op 单测，包含正常 + 边界 + 错误 case

---

### `engine/validate.js`

**职责**：schema 校验 + 6 道防呆闸（见 [05-safety](./05-safety.md)）。

**公共 API**：
```js
export function validateTimeline(timeline) → {
  ok: bool,
  errors: ValidationError[],   // 阻止 render
  warnings: ValidationWarning[], // 不阻止但提示
  infos: ValidationInfo[],
  hints: AIHint[]              // 给 AI 的修复建议
}
```

详见 [05-safety](./05-safety.md)。

---

### `engine/resolve-time.js`

**职责**：把 symbolic time（`{after:'X', gap:0.5}`）resolve 成 raw seconds。

**公共 API**：
```js
export function resolveTimeline(timeline) → timeline (with all times resolved)
export function resolveExpression(expr, context) → number | error
```

**不变式**：
- 拓扑排序处理依赖
- 检测循环引用
- 引用不存在的 marker / clip → error
- quantize 到 0.1s 网格
- roundtrip 稳定（resolve → un-resolve → resolve = 同结果）

**依赖来源**：POC W4 的 resolver.js

---

### `engine/describe.js`

**职责**：聚合所有 active clip 的 describe() 输出。

**公共 API**：
```js
export function describeFrame(timeline, t) → {
  t,
  chapter: string | null,
  active_clips: [{
    clipId,
    sceneId,
    phase,
    progress,
    elements: [...],
    boundingBox,
  }]
}
```

**用途**：给 AI 看（不用看像素就知道帧里有什么），给 lint 看（assert_at 用），给 GUI 看（显示选中信息）

---

### `engine/gantt.js`

**职责**：渲染 ASCII Gantt。

来源：POC W2。

---

### `engine/ascii-shot.js`

**职责**：PNG buffer → ASCII art string。

来源：POC W3。

---

## L3 · Workflows

### `workflows/ai-edit.js`

**职责**：调 LLM 写 timeline 或修改 timeline。

**公共 API**：
```js
export async function aiEdit({prompt, timeline, mode}) → {
  ok,
  newTimeline,
  steps: StepLog[],   // THINK/SEARCH/PATCH/ASSERT/RENDER 5 步
  finalAssertion: bool,
  errors,
}
```

**mode**：
- `'create'` — 从空 timeline 生成
- `'edit'` — 在已有 timeline 上 patch
- `'fix'` — 拿 lint error 修

**详见** [06-ai-loop](./06-ai-loop.md)。

---

### `workflows/export.js`

**职责**：timeline → MP4。

**公共 API**：
```js
export async function exportProject({timelinePath, outputPath, fps, target='wgpu'}) → {
  ok,
  outputPath,
  duration,
  bytes,
  warnings,
}
```

**实现**：拷 POC H 的 ffmpeg pipe + 选 target（默认 wgpu，慢机器降级 napi-canvas）。

---

### `workflows/serve.js`

**职责**：浏览器 hot-reload preview。

**公共 API**：`startServer(timelinePath, port) → server`

**实现**：拷 POC I 的 file watcher + ws + http server。

---

### `workflows/render-batch.js`

**职责**：多 worker 并行渲染。

**实现**：拷 POC K 的 worker_threads pattern。

---

## L4 · Surface · CLI

### `surface/cli/`

**职责**：clap 子命令路由。

**子命令**：
- `nextframe new <project>` — 空 timeline 模板
- `nextframe ai-edit <project> "prompt"` — 调 ai-edit workflow
- `nextframe set-dur <project> <clipId> <seconds>` — 调 timeline.setDur
- `nextframe move-clip <project> <clipId> <symbolicTime>`
- `nextframe set-param <project> <clipId> <key> <value>`
- `nextframe render <project> --t <s> --out <png>` — 单帧
- `nextframe export <project> --out <mp4>` — 全片
- `nextframe serve <project>` — 浏览器 preview
- `nextframe lint <project>` — 跑全部防呆闸
- `nextframe describe <project> --t <s>` — 输出 describe JSON
- `nextframe gantt <project>` — 输出 ASCII gantt
- `nextframe ascii <project> --t <s>` — 输出 ASCII screenshot

**约定**：
- `<project>` 永远是 `.nfproj` 路径（JSON 文件）
- `--t` 接受 raw seconds 或 mm:ss.f 或 marker name
- 输出 默认 stdout，`--out` 覆盖
- `--json` 输出结构化 JSON 给 AI 解析
- `--quiet` / `--verbose` 控制日志
- exit code: 0 成功 / 1 lint warn / 2 error / 3 usage error

---

## 模块统计

| 模块 | LOC 上限 | 文件大小上限 | 单测覆盖率 |
|---|---|---|---|
| L1 target | 800 / target | 300 行 | 90% |
| L2 engine | 2000 总计 | 300 行 | 85% |
| L2 scenes | 300/scene | 300 行 | 70% (frame-pure invariant 必须 100%) |
| L2 timeline | 1000 | 300 行 | 95% |
| L3 workflows | 600/workflow | 400 行 | 70% |
| L4 cli | 1200 总计 | 300 行 | 60%（CLI 主要 e2e 测） |

**超限 = PR 拒绝**。

---

## 引用

- [03-conventions](./03-conventions.md) — 代码细节规范
- [04-interfaces](./04-interfaces.md) — 跨模块 API 完整签名
