# 01 · 分层架构

NextFrame 是 5 层栈，**严格单向依赖**。

```
┌─────────────────────────────────────────────────────────────┐
│ L5 · Editor UI (optional · v0.2)                            │
│      desktop GUI · web preview · drag/drop                   │
├─────────────────────────────────────────────────────────────┤
│ L4 · Surface (CLI · Bridge · IPC)                           │
│      nextframe-cli · JSON-RPC bridge · file watcher          │
├─────────────────────────────────────────────────────────────┤
│ L3 · Workflows (composed tasks)                             │
│      ai-edit · export · serve · validate · render-batch      │
├─────────────────────────────────────────────────────────────┤
│ L2 · Engine + Domain                                         │
│      timeline · scenes · validate · resolve symbolic time    │
│      describe · gantt · ascii-screenshot                     │
├─────────────────────────────────────────────────────────────┤
│ L1 · Render Targets                                          │
│      napi-canvas (preview) · wgpu (export) · wasm (portable) │
└─────────────────────────────────────────────────────────────┘
```

## 依赖规则

| 层 | 可以 import |
|---|---|
| L5 | L4, L3, L2 (read-only), L1 (read-only) |
| L4 | L3, L2, L1 |
| L3 | L2, L1 |
| L2 | L1 |
| L1 | （只 std + 自己的 dep） |

**反向依赖一票否决**。

**跨 2 层禁止**：例如 L5 不能直接调 L1。如果 GUI 想触发渲染，必须 → L4 (CLI/bridge) → L3 (workflow) → L2 (engine) → L1 (target)。

**同层互相**：允许但少用。例如 L2 内部 timeline 可以引用 scenes，但 scenes 不能引用 timeline（保持 frame-pure）。

---

## 每层详细职责

### L1 · Render Targets

**职责**：把指令变像素。不知道 timeline 是什么、不知道 scene 是什么。

只暴露 1 个能力：`drawCommands(cmds: DrawCommand[]) → Pixels`

模块：
- `targets/napi-canvas/` — Skia-backed Canvas2D，编辑器实时预览用
- `targets/wgpu/` — GPU shader，导出加速用
- `targets/wasm/` — Rust→WASM，跨平台 / 浏览器版

**规则**：
- 不 import L2 / L3 / L4 / L5
- 内部数据结构纯粹（DrawCommand 是简单 enum）
- 每个 target 实现同一个接口 `RenderTarget`
- 单测覆盖：相同输入 → 相同输出（cross-target 像素 diff）

---

### L2 · Engine + Domain

**职责**：理解 timeline 和 scene。frame-pure 的家。

模块：
- `engine/` — `renderAt(target, timeline, t)` + scene 调度 + 时间分发
- `engine/validate.js` — schema + 不变式检查
- `engine/resolve-time.js` — symbolic time → raw seconds
- `engine/describe.js` — `describe(timeline, t) → SceneDescription[]`
- `engine/gantt.js` — `renderGantt(timeline) → ASCII string`
- `engine/ascii-shot.js` — `pngToAscii(buffer) → ASCII string`
- `scenes/` — 21+ frame-pure scene 函数 + 各自的 describe
- `timeline/` — JSON schema + ops（addClip / moveClip / split / setParam）

**规则**：
- 只 import L1
- 不知道 CLI / bridge / GUI 存在
- 每个 scene 必须 export `render` + `describe` + `META`（详见 [02-modules](./02-modules.md)）
- engine 不修改 timeline，timeline ops 是纯函数（in→out 都是新 timeline）

---

### L3 · Workflows

**职责**：组合 L2 完成完整任务。任务有副作用（读写文件、调外部进程）但状态无副作用。

模块：
- `workflows/ai-edit.js` — 调 LLM API → 解析输出 → apply patches → 验证
- `workflows/export.js` — 帧序列 + ffmpeg pipe → MP4
- `workflows/serve.js` — file watcher + ws + http server → 浏览器预览
- `workflows/render-batch.js` — 并行 N worker 渲染指定帧范围
- `workflows/validate-project.js` — 资产存在检查 + lint

**规则**：
- import L2 + L1
- 不知道 CLI 长什么样
- 每个 workflow 是一个 async 函数，返回 `{ok, result, errors, hints}`
- 副作用集中在这一层（fs / spawn / network）
- 单测：mock fs + spawn

---

### L4 · Surface · CLI / Bridge / IPC

**职责**：给外部用户（CLI 用户、AI agent、GUI app）一个调用入口。

模块：
- `surface/cli/` — clap 子命令路由
- `surface/bridge/` — JSON-RPC 风格的 IPC（给 GUI 或外部 SDK）
- `surface/ipc/` — wry shell 的 IPC handler（v0.2 GUI 用）

**规则**：
- import L3 + L2 + L1
- 这一层是"包装"，不该有业务逻辑
- 每个 CLI 子命令是 thin wrapper 调一个 workflow
- 输入解析在这层（clap arg parse），错误格式化在这层
- 不该有 frame-pure / scene / engine 的概念暴露

---

### L5 · Editor UI（可选）

**职责**：给人类视觉化操作。**v0.1 不做**，v0.2 加。

模块：
- `editor/shell.rs` — wry + tao 桌面壳
- `editor/ui/` — 5 区布局 HTML/JS
- `editor/preview.js` — 嵌入式 preview canvas
- `editor/inspector.js` — 属性面板

**规则**：
- 只 import L4（通过 bridge / IPC）
- **不直接 import L2 / L1**！必须经过 surface 层
- 这条最重要 — 保证 GUI 是"另一个 client"，不是嵌入业务逻辑
- 如果 v0.2 改了 GUI 不影响 CLI / AI

---

## 架构测试

提供一个脚本 `scripts/check-layers.sh`：

```bash
# 检查反向依赖
grep -rE 'from "../surface' src/engine/    # L2 不能 import L4
grep -rE 'from "../workflows' src/engine/  # L2 不能 import L3
grep -rE 'from "../engine' src/targets/    # L1 不能 import L2

# 检查跨层
grep -rE 'from "../../targets' src/surface/  # L4 不能跨过 L3
grep -rE 'from "../../engine' src/editor/    # L5 不能跨过 L4
```

**任何 hit 都是 PR 拒绝。**

---

## 命名约定

文件 / 目录就用层级命名，让 import 路径自带语义：

```
src/
  targets/      ← L1
    napi/
    wgpu/
    wasm/
  engine/       ← L2
    scenes/
    timeline/
    validate.js
    describe.js
  workflows/    ← L3
    ai-edit.js
    export.js
    serve.js
  surface/      ← L4
    cli/
    bridge/
  editor/       ← L5（v0.2）
    shell.rs
    ui/
```

import 路径 `"../engine/..."` 立刻知道这是 L2。

---

## v0.1 简化

v0.1 不做 L5。整个栈只 4 层：

```
nextframe-cli (L4 surface)
       │
       ▼
ai-edit / export / serve (L3 workflows)
       │
       ▼
engine + scenes (L2)
       │
       ▼
napi-canvas + wgpu (L1)
```

这是最小可发布的 NextFrame。
