# v0.9 Particle Runtime 实现 + 5 个首发组件

## 范围（严格遵守）
- 只碰 `src/nf-core/engine/runtime/particle.js`（填充 walking skeleton TODO）
- 新增 5 个 particle scene：`src/nf-core/scenes/16x9/anthropic-warm/{bg-starfield,bg-snowfall,fx-sparkBurst,fx-connectGraph,fx-floatMotes}.js`
- 不碰其他文件
- 不引入任何外部依赖（禁 tsparticles / 任何 npm）

## 契约（ADR-020）

### Runtime `engine/runtime/particle.js`
```js
export function mulberry32(seed) { /* 已在 skeleton 写好，验证 */ }
export function renderParticle(ctx2d, t, scene, params, vp) {
  // const { emitter, field, render } = scene.render(null, t, params, vp);
  // for (let i = 0; i < emitter.count; i++) {
  //   const rng = mulberry32(emitter.seed + i * 37);
  //   const p = (emitter.spawn || defaultSpawn)(rng, i, vp);
  //   p.i = i;
  //   if (field) Object.assign(p, field(p.x, p.y, t));
  //   render(ctx2d, p, t);
  // }
}
export function dumpState(t, scene, params, vp) { /* same loop, push snapshot */ }
export function defaultSpawn(rng, i, vp) { /* uniform random with depth */ }
```

### Scene render contract
```js
export default {
  id: "...", type: "particle", ...,
  render(host, _t, params, _vp) {
    return {
      emitter: { count: 200, seed: 42 },
      // field 可选：(x,y,t) => {vx, vy} 或 {x, y}
      render: (ctx, p, t) => { ctx.fillStyle = ...; ctx.fillRect(p.x, p.y, p.size, p.size); }
    };
  }
}
```

### Frame-pure 硬约束（L7 拦）
- **禁 Math.random**，只用 mulberry32(seed + id*37)
- 禁 setInterval / setTimeout / rAF

## 5 个首发组件（intent ≥ 50 字）

1. **bg-starfield** — 3D 视差星空。200-400 颗星按 depth 分层，近处大快近景，远处小慢远景；色温按 depth 从暖白到冷白。
2. **bg-snowfall** — 飘雪。粒子从顶部 spawn，垂直 + 风向偏移匀速下落，到底部 respawn（用 `y % H` 实现 frame-pure loop）。
3. **fx-sparkBurst** — 点击式火花爆发。参数 triggerAt，从该时刻起沿圆周飞出 N 颗 sparkle，由 t - triggerAt 计算位置/透明度。
4. **fx-connectGraph** — 粒子 + 近距连线。粒子漂浮，距离 < threshold 画连线；连线透明度由距离倒数决定。
5. **fx-floatMotes** — 漂浮光点。少量（30-50）光点慢速漂浮，每颗自己的 sin 轨迹（由 id seed 决定相位）；给画面加氛围。

## 验证（必须跑通）
```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm
node src/nf-cli/bin/nextframe.js scene-lint --ratio=16:9 --theme=anthropic-warm
cargo check --workspace && cargo clippy --workspace -- -D warnings
bash scripts/lint-all.sh
# 额外：确定性验证（dump 同 t 两次 JSON 相等）
node -e "import('./src/nf-core/engine/runtime/particle.js').then(m => {
  const dump1 = m.dumpState(1.5, {render: () => ({emitter:{count:50,seed:42}, render:()=>{}}) }, {}, {width:1920,height:1080});
  const dump2 = m.dumpState(1.5, {render: () => ({emitter:{count:50,seed:42}, render:()=>{}}) }, {}, {width:1920,height:1080});
  console.log('determinism:', JSON.stringify(dump1) === JSON.stringify(dump2) ? 'PASS' : 'FAIL');
});"
```

## commit
```
feat(v0.9): implement particle runtime + 5 components
```

开始实施。
