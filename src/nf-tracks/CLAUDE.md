# nf-tracks (v2.0, skeleton)

**Track 组件库 + ABI + 用户热加载**。纯 JS（browser-inline）。

## 核心原则

**Track = Component = AI 可写**。ABI 稳定、机器可验、单文件。

## Track ABI（强制）

```js
// src/nf-tracks/{category}/{name}.js（内置）
// src/nf-tracks/user/{category}/{name}.js（用户/AI 热加载）

export const meta = {
  id: 'name',
  category: 'text|shape|chart|media|...',
  version: '1.0.0'
};

export function describe() {
  // 返回参数 schema（AI 和引擎都能读）
  return {
    params: { ... },           // 类型 / 范围 / 默认
    keyframes: [ ... ],        // 哪些字段可 keyframe
    lifecycle: 'long-lived'    // 带 keyframes 插值
  };
}

export function sample() {
  // 返回典型用例（preview/gallery 用）
  return { keyframes: [...], params: {...} };
}

export function render(t, keyframes, viewport) {
  // 纯函数：给定时刻 + 插值后的 keyframe + 画布尺寸
  // 返回 { dom: HTMLElement, audio?: { ref, volume } }
  // ❌ 不读 Date.now() / 不绑 RAF / 不 addEventListener
}
```

## 边界

- 单文件 `.js`，**零外部 import**（stripESM 直接内联）
- `render` 必须是 t-pure（同 t 同 keyframes → 同输出）
- 不允许跨 Track 共享状态
- `user/` 目录的组件走 `nf-core-engine` 的 ABI lint → 不合规就拒绝加载

## 未来填入

- `text/` — label / headline / paragraph / subtitle
- `shape/` — rect / line / polygon / svg-path
- `chart/` — bar / pie / line / scatter
- `media/` — image / video-ref / audio-ref
- `user/` — 空目录，AI 写的组件落这里

**骨架阶段仅占位。**
