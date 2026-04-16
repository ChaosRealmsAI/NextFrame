# nf-runtime (v2.0, skeleton)

**浏览器运行时 — 一个 WebView 三种模式**。纯 JS（WebView 直接加载）。

## 三模式

| 模式 | 驱动 | 说明 |
|------|------|------|
| `play` | RAF 自驱 | 正常播放，`requestAnimationFrame` 推进 t |
| `edit` | 冻结 t + 写回 | 编辑器：暂停在某一帧，UI 拖动 → `source.json` 写回 |
| `record` | Rust 驱动 | 录制：Rust 通过 JS eval 设定 t，截屏，不走 RAF |

## 核心入口

```js
// runtime/index.js
window.__nf.boot({ resolved, tracks, mode: 'play'|'edit'|'record' })

// 三模式共用一个 app = createApp(resolved)
// mode 决定时钟来源，getStateAt(t) 结果三模式一致
```

## 边界

- ❌ 不自己写时间线解析 — 吃 `resolved` 即可
- ❌ 不做组件内部状态 — 组件是 t-pure
- ✅ 负责：DOM mount、audio 素材加载、键盘/鼠标事件（edit 模式）
- ✅ 暴露 `window.__nfDiagnose()` + `window.__nfEditorDiagnose()` 供 AI 查状态
- ✅ 暴露 `window.__nfSeek(t)` 给录制器驱动

## 未来填入

- `index.js` — boot / mode 切换
- `player.js` — RAF 循环
- `editor.js` — 冻结 t / 写回 source
- `recorder-bridge.js` — `__nfSeek(t)` + `__nfScreenshot()`
- `audio.js` — 素材加载 / play（按 `getStateAt(t).audio` 引用）
- `diagnose.js` — AI 查状态接口

**骨架阶段仅占位。**
