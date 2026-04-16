# `_examples/` — scene 骨架样例

不是正式 scene，只是 recipe 给 AI 看的模板。

**规则**：
- `_examples/` 不在任何 ratio 目录下 → scene loader（`scenes/index.js`）不会发现它
- 文件以 `_` 前缀排序被 `scene-smoke` 和 loader 双重跳过
- gallery / preview / render 管线都忽略此目录

**用途**：
- `recipe component/02-craft.md` 会 `cat` 这里的文件作为模板给 sonnet
- 未来新 AI 写 scene 前先读这里 → 看一个最小完整例子 → 照着写

**当前样例**：
- `scene-dom-card.js` — 最小 dom 组件（标题卡片 + 淡入动画）
- `scene-media-video.js` — 最小 media 组件（video 播放器 + 淡入）

**硬约束**（AI 写新 scene 必须遵守）：
- render 签名严格 `(t, params, vp) → string`
- 工具函数全内联（escape / clamp / ease）不 import
- 禁 CSS `@keyframes` → t-driven inline style
- 禁 `Date.now` / `Math.random` → frame_pure
