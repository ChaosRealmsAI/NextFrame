# NextFrame 录制 MP4 卡顿/掉帧诊断

## 结论

这次的主因**不是编码、不是 `--no-skip`、也不是 scene 的 `t` 规范**。  
真正的问题更接近：

1. **P0：recorder 捕获到的是“落后提交”的 WKWebView 画面，不是 `__onFrame(time)` 刚算出来的那一帧。**
2. **P1：runtime 每帧整棵重建 layer DOM / SVG defs，放大了 WebKit 在 SVG-heavy 场景里的提交滞后。**
3. **P2：个别 scene 的离散参数更新（如 `Math.floor(t * n)` seed）会增加 30fps 下的跳变感，但不是主因。**

最关键的实测现象：`tmp/v08-showoff-noskip.mp4` 与 `tmp/v08-showoff.html` 在**同一绝对时间**上并不一致。MP4 在 `t=9s`、`t=12s` 附近明显还停留在前一个 scene，表现为**长时间几乎不变，然后突然跳一大步**，这就是用户感知到的“卡顿”。

## 实测方法

### A. `__onFrame` 后是否至少等到双 rAF

做了一个最小探针 `tmp/diag-raf-probe.html`：

- `__onFrame()` 立即把背景设成红
- 第 1 个 `requestAnimationFrame` 设成绿
- 第 2 个 `requestAnimationFrame` 设成蓝

抓到的 `tmp/diag-browser/raf-probe/000.png` 平均色是：

- `#2050D9`（蓝）

结论：

- **“inject 后立刻截图，连双 rAF 都没等到”不是主因。**
- 但这只能证明**简单 DOM** 能过双 rAF，**不能证明 SVG filter / CALayer commit 已经 ready**。

### B. 最小样例：canvas vs SVG vs SVG-rebuild

临时样例：

- `tmp/diag-canvas.html`
- `tmp/diag-svg-persist.html`
- `tmp/diag-svg-rebuild.html`

用 Chromium 按 `window.__onFrame({time})` 以 30fps 精确步进截图，计算相邻帧 RMSE：

| 样例 | 相邻帧数 | 平均 RMSE | std |
|---|---:|---:|---:|
| canvas | 15 | 0.044229 | 0.006884 |
| svg-persist | 15 | 0.039069 | 0.001883 |
| svg-rebuild | 15 | 0.039070 | 0.001894 |

结论：

- **单纯 30fps 不是问题。**
- **单纯“每帧重建 SVG DOM”也不是单独根因**，因为在 browser step 下 `svg-persist` 和 `svg-rebuild` 几乎一样。
- 但这不排除它在 **WKWebView + CALayer.render** 路径里成为放大器。

### C. 真实样例：browser step vs 现有 MP4

对 `tmp/v08-showoff.html` 做 browser 30fps 步进截图；再从 `tmp/v08-showoff-noskip.mp4` 抽同段 16 帧 contact sheet：

- `tmp/diag-contact/showoff-9s-browser.png`
- `tmp/diag-contact/showoff-9s-mp4.png`
- `tmp/diag-contact/showoff-12s-browser.png`
- `tmp/diag-contact/showoff-12s-mp4.png`

#### 9s 段（orbitDiagram 切入）

相邻帧 RMSE：

| 序列 | 平均 RMSE | std | min | max |
|---|---:|---:|---:|---:|
| browser 9s | 0.011026 | 0.003150 | 0.007726 | 0.021875 |
| mp4 9s | 0.002215 | 0.006079 | 0.000299 | 0.024952 |

观察：

- browser 已进入 `orbitDiagram`
- MP4 在整个 `9.0s ~ 9.5s` 窗口里仍基本停留在前一个 `shaderRipple`
- 数值上表现为：**大多数相邻帧几乎不变，偶尔突跳**

#### 12s 段（bigStat 切入）

相邻帧 RMSE：

| 序列 | 平均 RMSE | std | min | max |
|---|---:|---:|---:|---:|
| browser 12s | 0.034786 | 0.018897 | 0.004647 | 0.062199 |
| mp4 12s | 0.006346 | 0.016901 | 0.000198 | 0.066947 |

观察：

- browser 在 `12.0s` 开始已经是 `bigStat` counter：`0 -> 4 -> 8 -> 12 -> ...`
- MP4 在 `12.0s ~ 12.47s` 仍停留在前一个 `orbitDiagram`
- 到窗口最后才突然跳到 `bigStat`

结论：

- MP4 不是“正常 30fps 但看起来不够丝滑”
- 而是**旧画面维持过久，新的 SVG-heavy 场景晚提交，然后一次跳过去**
- 这和用户描述的“尤其 bigStat/orbitDiagram 段卡顿”完全一致

## 代码层定位

### 1. recorder 端没有“页面已提交到可抓取 layer tree”的握手

关键链路：

- [src/nf-recorder/src/webview/inject.rs](/Users/Zhuanz/bigbang/NextFrame/src/nf-recorder/src/webview/inject.rs:43)
- [src/nf-recorder/src/record/frame_loop.rs](/Users/Zhuanz/bigbang/NextFrame/src/nf-recorder/src/record/frame_loop.rs:117)
- [src/nf-recorder/src/webview/frame.rs](/Users/Zhuanz/bigbang/NextFrame/src/nf-recorder/src/webview/frame.rs:25)

现状是：

1. native `eval` 调 `window.__onFrame({time,...})`
2. native `flush_render(200ms)`
3. 直接 `CALayer.render`

问题在于：

- 这里**没有 page-side ack**
- `flush_render(200ms)` 只是跑 runloop，不等于“新的 SVG/filter layer tree 已经 commit 给 `CALayer.render`”
- 对简单 DOM 足够；对 scene switch + SVG filter + 大量 DOM churn，不够可靠

### 2. runtime 每帧整棵重建 layer DOM，给 WebKit 提交制造巨大压力

关键代码：

- [src/nf-core/engine/build-runtime.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/build-runtime.ts:145)
- [src/nf-core/engine/build-runtime.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/build-runtime.ts:195)
- [src/nf-core/engine/build-runtime.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/build-runtime.ts:220)

每帧做的事：

- 重新拼整段 `html.join("")`
- `frag.innerHTML = ...`
- 删除旧 child
- append 新 child
- SVG `<defs>/<filter>/<gradient>` 也跟着重建

这意味着在 `orbitDiagram` / `bigStat` / `shaderRipple` / `liquidNoise` 这些 SVG-heavy scene 上：

- WebKit 每帧都要重建大量 DOM / filter graph
- scene 切换时旧 layer tree 更容易比新 tree 多活几帧
- recorder 抓到的就是“前一段残留 + 下一段晚到”

### 3. scene 自身的离散更新是次要放大项

例如：

- [src/nf-core/scenes/16x9/effects-showcase/content-shaderRipple.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/effects-showcase/content-shaderRipple.js:91) `Math.floor(t * 12)`
- [src/nf-core/scenes/16x9/effects-showcase/bg-liquidNoise.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/effects-showcase/bg-liquidNoise.js:86) `Math.floor(t * 3)`

这些会让 30fps 下更容易看到“纹理一档一档变”。  
但它解释不了：

- 为什么 browser 30fps step 仍连续
- 为什么 MP4 在 scene 边界会“整整十几帧停在上一段”

所以只能放 P2。

## 优先级与修复方案

### P0：给 recorder 增加 page-side capture-ready 握手

建议优先做。

不要再靠 native 侧 `flush_render(200ms)` 猜测“应该画完了”，而是让页面明确告诉 recorder：

```js
window.__onFrame = async function(data) {
  enableRecorderMode();
  seek(extractTime(data));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  void stage.offsetHeight;
  void stage.getBoundingClientRect();
  return "ready";
};
```

native 侧改成：

- `evaluateJavaScript` 等 Promise resolve
- resolve 后再 `capture_frame`

更稳一点可以把 `seek()` 后的 host scene switch 做成：

- `rAF`
- `rAF`
- 再读一次 `document.querySelectorAll("svg, canvas").length`
- 必要时第 3 个 `rAF`

如果 `CALayer.render` 仍有旧树残留，P0.1 备选：

- scene switch 附近强制走 `WKWebView.takeSnapshot`
- 或只在 SVG-heavy scene 上切换 capture backend

### P1：runtime 改成“按 layer id 复用 host”，不要每帧整棵 replace

建议第二优先级。

目标：

- `stage` 上的 layer host 长驻
- scene 还在可见时只更新内容，不删除 host
- scene 切换时再创建/销毁 host

至少做到：

- 不要每帧 `frag.innerHTML + remove + append`
- SVG scene 的 `<svg>` / `<defs>` / filter host 复用
- 只更新属性 / inner subtree

这会显著降低 WebKit 每帧 commit 压力，尤其是 `bigStat` / `shaderRipple` / `liquidNoise`。

### P2：scene 预热 + 减少离散 seed

边缘但有收益。

可做两件事：

1. scene switch 前 1 帧预热下一段 SVG/filter scene
2. 少用 `Math.floor(t * n)` 直接跳 seed，改成连续参数驱动，或只在更低权重层用离散 seed

## 建议的落地顺序

1. **先做 P0**：`__onFrame -> Promise -> double rAF -> capture`
2. **再做 P1**：runtime layer host 复用，避免每帧重建整棵 SVG/filter tree
3. **最后做 P2**：scene 预热与 seed 连续化

## 本轮诊断的限制

- 当前 workspace 下，`nextframe-recorder` 在尝试新录制时会在 encoder 里 panic：
  - `invalid message send ... appendPixelBuffer:withPresentationTime:`
- 所以这轮“最小样例”主要通过 **browser 精确步进截图** + **现有 MP4 对照** 完成
- 但现有证据已经足够说明：**主问题不是编码，不是 skip，不是 scene `t` 规范，而是 recorder 路径拿到的画面提交时机不对**
