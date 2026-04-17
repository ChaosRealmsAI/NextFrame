# nf-core-app (v2.0, implement)

**引擎心脏**。纯 JS（browser-inline）。

## 核心职责

1. 导出 `getStateAt(t, resolved) → { t, viewport, tracks, selected, data }` 纯函数。
2. 导出 `start({mode, resolved, root, win?})` 统一入口，wires play / edit / record 三模式。
3. 把 Track 的 `render(t, kfs, viewport)` 输出 reconcile 进 `<div id="nf-root">`，对 `data-nf-persist="1"` 元素走 diff（video 不毁）。

## 模块

| 文件 | 说明 |
|------|------|
| `src/state.js` | `interpolateKeyframes` (linear / ease-in / ease-out / ease-in-out) · `activeTracksAt` · `currentValues` · `deriveState` |
| `src/track-host.js` | Track 注册表 (`registerTrack` / `registerTracksFromGlobal`) · `renderTracks(state, mount)` 带 persist reconcile |
| `src/app.js` | `getStateAt` · `start({mode, resolved, root, win?})` · `window.__nfApp` · `window.__nfTick(t)` |

## 边界

- ❌ 不做 IPC / 不动文件
- ❌ 不读 `Date.now` / `performance.now`（getStateAt / interpolate 纯函数）
- ❌ 不跨 Track 共享状态
- ✅ 同一个 `(t, resolved)` 调用结果严格一致
- ✅ 可被 player / editor / recorder 三种 runtime 共用
- ✅ Zero runtime deps（Track 走 `window.__nfTracks` 注入）

## 三模式约定

| mode | 驱动 | 行为 |
|------|------|------|
| `play` | 内部 RAF | `(ts - startTs) / 1000` 作为 t 秒数 |
| `edit` | 外部 `seek(t)` | 不跑 RAF，t 冻结直到被 seek |
| `record` | Rust → `window.__nfTick(t)` | 外部驱动；返回 Promise，双 RAF + microtask 等帧落地 |

## Persist DOM Reconcile

`data-nf-persist="1"` 的元素（典型 `<video>`）在 re-render 时**保持同一个 Element 引用**，只同步 attrs / style，避免 innerHTML 替换造成播放状态复位（legacy build.js bug）。

匹配键：`tagName` + 可选 `data-nf-key`。

## Tests

```bash
cd src/nf-core-app
node --test tests/*.mjs    # 32 unit tests (state / host / app)
node tests/integration-smoke.mjs    # 5 integration checks
```

覆盖：
- state：17 条（边界 / 插值 / easing / nested / activeTracksAt / currentValues / deriveState 纯函数）
- track-host：7 条（wrapper 挂载 / 多 track / persist 保持引用 / 非 persist 替换 / 未知 kind / 失活清理 / audio 汇聚）
- app：8 条（纯函数 / 3 模式 / __nfTick / __nfApp / bundler 兼容）
- smoke：1 条完整场景（官方 text Track + ease-out + 进出时间窗）
