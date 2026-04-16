# Step 2 · 实现（CLI 生成骨架 · render 签名 pin 死）

## 1 · render 签名（ADR-021 冻结）

**只有一个签名**：

```js
render(t, params, vp) { return "<div>...</div>"; }
```

- `t` — layer-local 秒数（0 = 组件进入那一刻）
- `params` — scene clip 的 params
- `vp` — `{ width, height }` viewport 像素
- 返回 — 非空 HTML string，至少含 1 个标签

**禁 `render(host, ...)`**（旧签名）/ **禁 `render(ctx, ...)`**（canvas 旧写法）。

## 2 · CLI 生成骨架（不要手写）

```bash
node src/nf-cli/bin/nextframe.js scene-new \
  --id=<camelCaseId> \
  --role=<bg|chrome|content|text|overlay|data> \
  --type=<dom|media> \
  --ratio=<16:9|9:16> \
  --theme=<theme-name> \
  --name="<显示名>" \
  --description="<一句话用途>"
```

生成 `src/nf-core/scenes/{ratio}/{theme}/{role}-{id}.js`，含 11 必填 + 18 AI 字段 + render/describe/sample 骨架。**type 只能 `dom` / `media`**。

## 3 · 起点模板（复制改，不从零写）

```bash
# dom
cp src/nf-core/scenes/_examples/scene-dom-card.js \
   src/nf-core/scenes/<ratio>/<theme>/<role>-<id>.js
# media
cp src/nf-core/scenes/_examples/scene-media-video.js \
   src/nf-core/scenes/<ratio>/<theme>/<role>-<id>.js
```

然后改 id / name / theme / render / sample。

## 4 · frame-pure 硬检查

```js
// ❌ 全禁（让同 t 不同输出）
Date.now()  performance.now()  Math.random()
setInterval(...)  setTimeout(...)  requestAnimationFrame(...)

// ✅ 用传入的 t 算
const phase = Math.sin(t * Math.PI * 2 / 3);   // 3s 周期呼吸
const counter = Math.floor(t * 30);             // t 驱动计数
```

`frame_pure` 字段：读 t → `false`（每帧必录）；不读 → `true`（recorder 可跳帧）。

## 5 · CSS 约束

- ❌ **禁 CSS `@keyframes`** — compose 每帧重建 DOM，动画永远停在 t=0
- ❌ **禁 `animation:` / `transition:` 做入场**
- ✅ **必须 t-driven inline style**：在 render 里用 t 算 opacity / transform 数值

```js
render(t, params, vp) {
  const k = Math.min(t / 0.6, 1);
  const eased = 1 - Math.pow(1 - k, 3);
  return `<div style="
    opacity:${eased};transform:translateY(${(1-eased)*20}px);
    background:#0a1628;color:#f5f2e8;padding:64px;
  ">${params.text}</div>`;
}
```

## 6 · dom 内部随便写

dom 不限制 HTML 内部结构 — SVG / `<canvas>` + inline script / CSS conic-gradient / filter / 3D transform 都可以。关键：都得是 t-driven，别用 `@keyframes`。

```js
// SVG stroke-dash
return `<svg viewBox="0 0 ${vp.width} ${vp.height}">
  <path d="..." stroke-dashoffset="${620*(1-t/1.8)}"/></svg>`;

// CSS conic-gradient 跟 t 转
return `<div style="background:conic-gradient(from ${t*60}deg,#ff6b35,#0a1628);"></div>`;
```

## 7 · media 特殊规则

```js
export default {
  type: "media",
  videoOverlay: true,   // recorder 识别视频覆盖层
  render(t, params, vp) {
    return `<video src="${params.src}" autoplay muted playsinline
      style="width:100%;height:100%;object-fit:cover;"></video>`;
  },
  sample() { return { src: "./real-clip.mp4" }; },  // 必须真实路径
};
```

视频覆盖坐标见 pitfalls 坑 11。

## 8 · 18 AI 字段（intent ≥ 50 字真实推理）

```js
intent: `
  开场 hook 组件。设计取舍：
  1. serif 200px 大数字 — 对标 3Blue1Brown，一眼记住。
  2. 数字上方留白 40%，视觉重心压到下三分之二。
  3. counter 动画 1.2s easeOut cubic — 有冲击感不拖。
  4. 只用 --bg + --ac 两色，不让辅助色抢戏。
`,
requires: [], pairs_well_with: [], conflicts_with: [], alternatives: [],
visual_weight: "heavy", z_layer: "foreground", mood: ["calm"],
```

## 9 · sample / describe 速查

```js
sample() { return { title: "NextFrame", subtitle: "JSON → MP4" }; }  // 禁 Lorem ipsum

describe(t, params, vp) {
  return {
    sceneId: "heroTitle", phase: t < 0.6 ? "enter" : "show",
    progress: Math.min(t/0.6, 1), visible: true, params,
    elements: [{ type: "title", role: "headline", value: params.title }],
    boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
  };
}
```

## 10 · 硬检查清单（写完必看）

- [ ] render 签名 = `render(t, params, vp)` 返回 string
- [ ] 返回非空 string 且 ≥ 1 个 HTML 标签
- [ ] hex / 字号 / 字体全从 theme.md 拷贝（零 import）
- [ ] type ∈ {dom, media}
- [ ] 读 t → `frame_pure: false`
- [ ] 无 `Date.now` / `Math.random` / `setInterval` / `requestAnimationFrame`
- [ ] 无 CSS `@keyframes` / `animation:` / `transition:`
- [ ] intent ≥ 50 字
- [ ] sample() 真实业务内容

## 下一步

`cargo run -p nf-guide -- component verify`
