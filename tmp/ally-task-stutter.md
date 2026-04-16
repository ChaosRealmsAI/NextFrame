# Task — 排查 NextFrame 录制 MP4 的卡顿/掉帧根因

## 背景

用户报告：`tmp/v08-showoff-noskip.mp4`（4K/16.7s/30fps/516 帧/`--no-skip`）在播放器里看**明显卡顿**，尤其 bigStat/orbitDiagram 段（t=9-15s）。但同一份 HTML (`tmp/v08-showoff.html`) 在浏览器里播放**流畅**。

## 已排查排除的可能

- ✅ **不是 recorder 帧跳过**：用了 `--no-skip`，log 显示 `516 frames, 0 skipped`
- ✅ **不是编码问题**：已试 Baseline profile / 无 B 帧 / 1080p，仍卡
- ✅ **不是帧重复**：6 连续帧 md5 全不同
- ✅ **不是 scene 组件违规 t-frame 规范**：10 个组件全部 `frame_pure: false` + `t-driven` + 零 `performance.now()` 零 `<animate>`
- ✅ **不是 recorder 掉帧**：`ffprobe` 显示 499 帧（516 - 17 mux overhead）均匀 33.3ms 间隔
- ✅ **不是 scene 实现 bug**（bigStat：line 19 frame_pure=false，line 103 `t/cdur`）

## 现象细节

- 浏览器 HTML 播放：60fps rAF 驱动，流畅
- MP4 播放：30fps，看起来动画"跳跃"，尤其 SVG-type 组件
- 录制实际耗时：516 帧用 69 秒（7.5 fps 真实录制速率，每帧 ~130ms）

## 关键代码位置

- **v0.3 runtime（决定如何响应 recorder 的 __onFrame）**：`src/nf-core/engine/build-runtime.ts`
  - line 313 `seek(time)` — 设置 currentTime 并 compose
  - line 335 `enableRecorderMode()` — 停 rAF
  - line 343 `window.__onFrame = function(data)` — recorder 钩子
  - line 145 `compose(time)` — 重建所有 layer DOM，调 scene.render(t-start, ...)
  - line 161 `scene.render(t - start, ...)` — 关键：layer local t

- **recorder 侧**：
  - `src/nf-recorder/src/webview/inject.rs` line 46 — `window.__onFrame({time, cue, subtitle, ...})`
  - `src/nf-recorder/src/record/frame_loop.rs` line 117 — inject_state 后立即 capture_frame
  - `src/nf-recorder/src/webview/capture.rs` — CALayer.render / takeSnapshot

- **scene 组件（全部合规 t-driven）**：
  - `src/nf-core/scenes/16x9/effects-showcase/data-bigStat.js` (svg type)
  - `src/nf-core/scenes/16x9/effects-showcase/content-shaderRipple.js` (svg type)
  - `src/nf-core/scenes/16x9/effects-showcase/bg-liquidNoise.js` (svg type)

- **测试文件**：
  - `tmp/v08-showoff.html` / `tmp/v08-showoff-noskip.mp4`
  - `tmp/v08-showoff.json` — demo timeline

## 你要做的

写一份诊断报告到 `tmp/stutter-diagnosis.md`，回答：

### 1. 找到真正的根因（或最可能的 2-3 个）

用**实际测试**验证，不只猜测。建议方法：

- 录一个**只含 1 个 canvas scene**（darkGradient）的 minimal demo，看是否也卡
- 录一个**只含 1 个 svg scene**（bigStat）的 minimal demo，对比
- 用 `ffplay -vsync passthrough` 或抽每一帧看相邻帧 diff 的视觉连续性
- 查 recorder 是否在 inject_state 后等待 WKWebView paint 完成（例如 requestAnimationFrame double-buffered flush）
- 查 `compose()` 里是否每帧 createElement / replaceChildren 导致 SVG filter 重建

### 2. 具体修复方案

- 如果是 WKWebView paint 时机：recorder 里加 `requestAnimationFrame(() => requestAnimationFrame(capture))` 双缓冲等待
- 如果是 compose DOM 重建：runtime 里 scene 按 id 复用 host，不要每帧 replaceChildren
- 如果是 SVG filter 首帧成本：预热一遍（first-paint warmup）

### 3. 给出优先级

P0 = 最可能 / 修起来简单、收益大
P1 = 次要
P2 = 边缘

## 约束

- **不改产品代码**，只诊断 + 出报告
- 如果必须改代码验证假设，改完**立即 git checkout 还原**
- 可以写临时 debug HTML / 加 console.log 看时序
- 报告用中文，markdown 格式，简洁有数据

## 输出文件

- `tmp/stutter-diagnosis.md` — 诊断报告
- （可选）`tmp/stutter-minimal-canvas.mp4` / `tmp/stutter-minimal-svg.mp4` — 对比录制
