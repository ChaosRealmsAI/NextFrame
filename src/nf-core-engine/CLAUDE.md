# nf-core-engine (v2.0, skeleton)

**Source → Resolved 编译 + bundle**。TS（Node 侧）。

## 核心职责

1. 解析 Source 锚点表达式（`@intro.end + 1s` 之类）→ 计算出精确秒数
2. 展开引用、套层、keyframe 插值 schema → 产出 Resolved JSON
3. 把 Resolved 和所需的 tracks `.js` 内联到一个 HTML 里（bundle）

## 边界

- ❌ 不渲染、不接 WebView — 只做文本处理
- ✅ 输入 `source.json` + `src/nf-tracks/` 组件目录 → 输出 `bundle.html`
- ✅ stripESM：Track `.js` 会被内联进 HTML（不走 ESM import）

## 未来填入

- `src/resolve.ts` — Source → Resolved
- `src/bundle.ts` — Resolved + tracks → 单文件 HTML
- `src/validate.ts` — 校验锚点、周期、viewport 一致性
- `src/lint/` — Track ABI 检查（render arity、describe schema、sample 等）

**骨架阶段仅占位。**
