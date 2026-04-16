# v0.9 Motion Runtime 实现 + 5 个首发组件

## 范围（严格遵守）
- 只碰 `src/nf-core/engine/runtime/motion.js`（填充 skeleton，完整迁入 POC）
- 新增 5 个 motion scene：`src/nf-core/scenes/16x9/anthropic-warm/{fx-heartLike,fx-loadingPulse,icon-animatedCheck,fx-attentionDart,diagram-pathTrace}.js`
- 不碰其他文件
- 不引入外部依赖（禁 lottie-web / gsap）

## 主要任务：POC 迁入

**源**：`/Users/Zhuanz/bigbang/NextFrame/tmp/nf-motion/engine.js`（215 行完整跑通的 NF-Motion 引擎）

**目标**：`src/nf-core/engine/runtime/motion.js`

要做的事：
1. 把 tmp/nf-motion/engine.js 完整内容迁入
2. 扩展 BEHAVIORS：impact 已有，补 pulse / shake / wobble / pop / orbit / swing / blink / dart / rise / drift / typewriter（共 12 个，ADR-020 firstparty_behaviors）
3. 扩展 SHAPES：heart/sparkle/circle/ring 已有，补 star / arrow / check / cross / plus / bolt / drop / cloud / leaf / flame / bell / dot / square / triangle / hexagon / path(custom)（共 20 个）
4. 导出 listBehaviors() / listShapes() 给 `nextframe motion` CLI 用（CLI 本身是下一版，本版只导出）

**硬约束**：
- 禁 Date.now / performance.now / Math.random / setInterval / setTimeout / rAF
- 所有属性值由 interp(track, t) 求出
- 400 行上限

## 契约（POC 已定，参考 tmp/nf-motion/engine.js）

```js
export function renderMotion(host, t, motion) {
  // motion = { duration, size:[w,h], layers:[{type, at, behavior?, tracks?, ...shape_props}] }
  // 遍历 expanded layers，interp 每个属性，挂 <svg><g transform="..."> + shape inner markup
}
```

### Scene render contract
```js
export default {
  id: "...", type: "motion", ...,
  render(host, _t, params, _vp) {
    return {
      duration: params.duration ?? 2.5,
      size: [400, 400],
      layers: [
        { type: "shape", shape: "heart", at: [200, 200], behavior: "impact", ... }
      ]
    };
  }
}
```

## 5 个首发组件（intent ≥ 50 字）

1. **fx-heartLike** — 点赞效果。直接用 tmp/nf-motion/heart-like.json 的配置（ripple + burst + heart w/ impact behavior）。POC 已验证。
2. **fx-loadingPulse** — 呼吸式加载指示。中心圆 + pulse behavior（scale 80%↔110% 循环），opacity 也脉动。loop 无缝。
3. **icon-animatedCheck** — 勾号描边入场 + pop。stroke-dasharray / dashoffset frame-pure 动画（由 t 算 offset），配 pop behavior 弹入。
4. **fx-attentionDart** — 箭头指向 + dart behavior。箭头从画面外滑入指定 target 位置，带轻微回弹。
5. **diagram-pathTrace** — SVG 路径描边动画。用 stroke-dasharray 的 dashoffset 由 t 控制（pathLength - t*speed），frame-pure 无 CSS。

## 验证（必须跑通）
```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm
node src/nf-cli/bin/nextframe.js scene-lint --ratio=16:9 --theme=anthropic-warm
cargo check --workspace && cargo clippy --workspace -- -D warnings
bash scripts/lint-all.sh
# 确定性验证
node -e "import('./src/nf-core/engine/runtime/motion.js').then(m => {
  const host1 = {querySelector:()=>null, appendChild:()=>{}, children:[]};
  // 或用 jsdom mock；验证同 t 两次 renderMotion 产出 SVG 字符串相等
});"
```

## commit
```
feat(v0.9): implement motion runtime (NF-Motion) + 5 components
```

开始实施。
