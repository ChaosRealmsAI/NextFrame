# v0.9 Shader Runtime 实现 + 5 个首发组件

## 范围（严格遵守）
- 只碰 `src/nf-core/engine/runtime/shader.js`（填充 walking skeleton 的 TODO）
- 新增 5 个 shader scene：`src/nf-core/scenes/16x9/anthropic-warm/{bg-gradientFlow,bg-noiseField,bg-rippleWater,bg-auroraMesh,fx-screenFilm}.js`
- 不碰其他文件（包括 timeline / build.ts / recorder）
- 不引入任何外部依赖（禁 Three.js / 任何 npm install）

## 契约（ADR-020 + architecture/v09-scene-engines.md）

### Runtime `engine/runtime/shader.js`
```js
export function initShader(canvas, fragSrc) { /* compile VERT+FRAG, link, returns ctx */ }
export function renderShader(ctx, t, uniforms) { /* viewport, uniform1f(uT), uniform2f(uR), drawArrays(TRIANGLE_STRIP,0,4) */ }
export function readPixels(ctx) { /* gl.readPixels → Uint8Array(W*H*4) */ }
export function cssFallback(host, scene) { /* WebGL 不可用时 setBackground */ }
```

### Scene render contract
```js
export default {
  id: "...", type: "shader", ...,
  render(host, _t, params, _vp) {
    return {
      frag: "precision highp float; uniform float uT; uniform vec2 uR; void main() { ... }",
      uniforms: { uHue: params.hue ?? 0.0 }
    };
  }
}
```
注意：render **不 mutate host**，返回 config 对象。framework 管 canvas。

### Frame-pure 硬约束（L7 lint 会拦）
- 禁 setInterval / setTimeout / requestAnimationFrame
- GLSL 所有时间通过 uT uniform，uT = 外部传入的 t

## 5 个首发组件（intent 每个 ≥ 50 字，真实 GLSL）

1. **bg-gradientFlow** — 流动渐变背景。sin 波叠加色相偏移，替代平面 linear-gradient。
2. **bg-noiseField** — 柏林噪声背景气氛。GLSL 内联实现 simplex noise（不 import）。
3. **bg-rippleWater** — 水波涟漪。2-3 个波源同时扩散，可配 `origins` 参数。
4. **bg-auroraMesh** — 极光 mesh gradient。参考原型 HTML 里的 aurora shader。
5. **fx-screenFilm** — 全屏滤镜（颗粒+晕影+色差），透明叠加在任意底层上（alpha blend）。

每个 scene 必须有全 11 required 字段（用 `node src/nf-cli/bin/nextframe.js scene-new --type=shader --id=xxx --role=bg --ratio=16:9 --theme=anthropic-warm` 生成骨架后填充）。

## 验证（必须跑通才能 commit）
```bash
# 每个组件 smoke
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm
# 预期：5 个 shader 组件全 ✓

# lint L7
node src/nf-cli/bin/nextframe.js scene-lint --ratio=16:9 --theme=anthropic-warm
# 预期：无 L7 error（已有的非 v0.9 错误不管）

# Rust + clippy
cargo check --workspace 2>&1 | tail -3
cargo clippy --workspace -- -D warnings 2>&1 | tail -3
bash scripts/lint-all.sh 2>&1 | tail -5
# 预期：全 PASS
```

## commit
```
feat(v0.9): implement shader runtime + 5 components

session: {CLAUDE_SESSION_ID}

What: shader runtime (initShader/renderShader/readPixels/cssFallback) +
bg-gradientFlow / bg-noiseField / bg-rippleWater / bg-auroraMesh / fx-screenFilm
Why: ADR-020 v0.9 核心交付；GLSL 自写零依赖
```

开始实施。
