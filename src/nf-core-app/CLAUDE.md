# nf-core-app (v2.0, skeleton)

**引擎心脏**。纯 JS（browser-inline）。

## 核心职责

导出 `app.getStateAt(t) → { visual, subtitle, selection, data }` 纯函数。
所有画面 / 字幕 / 选中 / 数据在任意时刻 t 都可独立计算。音频例外：
`getStateAt` 不生成音频采样，只返回对预渲染素材的引用（路径 + 起止 + 音量曲线）。

## 边界

- ❌ 不做 RAF / 不绑 DOM / 不读时钟 — 只吃 `(timeline, t)`
- ❌ 不做 IPC / 不动文件
- ✅ 同一个 `t` 调用结果严格一致（pure function）
- ✅ 可被 player / editor / recorder 三种 runtime 共用

## 未来填入

- `index.js` — 导出 `createApp(resolvedTimeline)` + `app.getStateAt(t)`
- `state.js` — visual/subtitle/selection/data 状态合并
- `audio-plan.js` — 音频素材引用表（不生成采样）

**骨架阶段仅占位。**
