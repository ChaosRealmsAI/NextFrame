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

### ⚠️ 铁律：render(t=0) 必须"已经在"（v1.0 L1 发现的 #1 卡感根因）

**禁止从 opacity=0 淡入超过 0.3s**。sonnet L1 第一轮 16 个 scene 全部犯这错：render(0) 返回 opacity≈0 的 HTML，观众看前 1-3 秒完全空白 → 整个视频像每段都"黑屏→闪现→黑屏→闪现"。

**正确做法**：

```js
// ❌ 错：前 1s opacity 0→1 淡入（观众看到 1s 黑屏）
const opacity = Math.min(1, t / 1.0);

// ✅ 对：t=0 已经 opacity=0.9+，可选细节 t=0→0.3s 做微缩放/微透明
const mainOpacity = 1;                              // 主元素立即显示
const bloomOpacity = Math.min(1, t / 0.3);          // 辅助光晕 0.3s 淡入
const scale = 0.98 + 0.02 * Math.min(1, t / 0.3);   // 0.3s 从 0.98 → 1.0（微妙）
```

**render(0) 自检**：
- 主文字 / 主图案必须在 t=0 **立即可见**（opacity ≥ 0.9）
- 动画在 0.3s 内完成"入场"，剩余时间是 **hold state**（稳定显示）
- 入场后的 "visual variation"（每 2.5-3s 规则）是**元素切换或位移**，不是"继续淡入"
- 除非 scene 是专门的 "enter" 转场（`role: "overlay"` 且 `duration_hint: 0.5`），否则不能有超过 0.5s 的入场动画

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

❌ 禁 CSS `@keyframes` / `animation:` / `transition:` 做入场（compose 每帧重建 DOM，动画永远停在 t=0）
✅ 必须 t-driven inline style：在 render 里用 t 算 opacity / transform 数值

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

dom 不限制 HTML 内部结构 — SVG / `<canvas>` + inline script / CSS conic-gradient / filter / 3D transform 都行。关键：都得是 t-driven，别用 `@keyframes`。

```js
// SVG stroke-dash
return `<svg viewBox="0 0 ${vp.width} ${vp.height}"><path d="..." stroke-dashoffset="${620*(1-t/1.8)}"/></svg>`;
// CSS conic-gradient 跟 t 转
return `<div style="background:conic-gradient(from ${t*60}deg,#ff6b35,#0a1628);"></div>`;
```

## 7 · media 特殊规则

```js
export default {
  type: "media", videoOverlay: true,   // recorder 识别视频覆盖层
  render(t, params, vp) { return `<video src="${params.src}" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`; },
  sample() { return { src: "./real-clip.mp4" }; },  // 必须真实路径
};
```

视频覆盖坐标见 pitfalls 坑 11。

## 8 · 18 AI 字段（intent ≥ 50 字真实推理）

```js
intent: `开场 hook。serif 200px 对标 3Blue1Brown；数字上方留白 40%；counter 1.2s easeOut 有冲击不拖；只用 --bg + --ac 两色。`,
requires: [], pairs_well_with: [], conflicts_with: [], alternatives: [],
visual_weight: "heavy", z_layer: "foreground", mood: ["calm"],
```

## 9 · sample / describe

```js
sample() { return { title: "NextFrame", subtitle: "JSON → MP4" }; }  // 禁 Lorem ipsum
describe(t, params, vp) { return { sceneId: "heroTitle", phase: t<0.6?"enter":"show",
  progress: Math.min(t/0.6,1), visible: true, params,
  elements: [{type:"title",role:"headline",value:params.title}],
  boundingBox: {x:0,y:0,w:vp.width,h:vp.height} }; }
```

## 10 · 硬检查清单（写完必看）

- [ ] render 签名 = `render(t, params, vp)` 返回 string 且 ≥ 1 个 HTML 标签
- [ ] hex / 字号 / 字体全从 theme.md 拷贝（零 import），type ∈ {dom, media}
- [ ] 读 t → `frame_pure: false`；无 `Date.now` / `Math.random` / `setInterval` / `requestAnimationFrame`
- [ ] 无 CSS `@keyframes` / `animation:` / `transition:`
- [ ] intent ≥ 50 字；sample() 真实业务内容

## 11 · 反例 vs 正例（视觉质量对照）

### 对照 1: 动画曲线
❌ `transform: translateY(${t*100}px)` — 线性，像电子闹钟跳字
✅ `transform: translateY(${easeOutExpo(t)*100}px)` — 物理感，专业级
其中 `easeOutExpo = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)`

### 对照 2: 淡入
❌ opacity 0 → 1 直接渐变（0.3s 内）
✅ opacity 0 → 0.4 → 1 分两段（前 0.2s 快，后 0.3s 慢）

### 对照 3: 字号
❌ `font-size: 24px`（16:9 下太小，观众看不清）
✅ `font-size: clamp(48px, 4vw, 72px)`（响应式 + 最小保底）

### 对照 4: 配色
❌ 纯黑 `#000` + 纯白 `#fff`（刺眼，廉价感）
✅ 近黑 `#0a0a0a` + 近白 `#f5f5f5`（眼睛舒服，专业）

### 对照 5: 留白
❌ 画面塞满 5 句文字，撑到 95% 屏幕
✅ 一个主标题占 30% 屏幕，周围 40% 留白（Apple Keynote 规律）

## 12 · 视觉质感硬规则（awwwards 级）

sonnet L1 v1.0 踩过的坑：只用 opacity + translateY 做入场 → 画面 low，用户反馈「这么 low 没有设计感」。每个 scene **必须至少用 2 条**以下技术：

| 技术 | 代码示例 |
|------|---------|
| 背景 mesh（radial / conic 多层叠） | `background: radial-gradient(ellipse 70% 55% at 22% 50%,rgba(255,107,53,0.22),transparent 60%),conic-gradient(...)` |
| backdrop-filter glass（card 层） | `backdrop-filter:blur(20px) saturate(180%)` |
| filter blur halo（装饰 blob） | `filter:blur(40px) hue-rotate(${hue}deg)` 配 `radial-gradient` |
| 多层 box-shadow depth（≥3 层） | `box-shadow:0 2px 0 rgba(255,255,255,0.06) inset,0 24px 48px -16px rgba(...,0.3),0 48px 96px -32px rgba(0,0,0,0.5)` |
| SVG feTurbulence noise grain | `<svg><filter><feTurbulence baseFrequency="0.9"/><feColorMatrix .../></filter><rect filter="url(#n)"/></svg>` 叠 `mix-blend-mode:overlay` |
| t-driven 周期动画 | `filter:hue-rotate(${Math.sin(t*0.8)*8}deg)` / `transform:rotate(${t*4}deg)` / `opacity:${0.5+0.3*Math.sin(t*1.5)}` |
| gradient text fill | `background:linear-gradient(...);background-clip:text;color:transparent;filter:drop-shadow(0 0 40px rgba(...))` |

**参考**：Stripe / Linear / Arc / Vercel / Awwwards Site of the Day 2024。

**禁止**：
- 纯色块背景（bg: #0a1628 单色 → 补 radial/conic mesh）
- 单层 shadow（box-shadow 只写 1 行 → 补 inset + 中层 + 远层 3 层）
- 无 grain/texture 的平面卡片（扁平感 = low）
- 入场之后完全静止（必须有 hue-rotate / breathe / blob 旋转持续动）

示例（v1.0 upgrade 参考）：`src/nf-core/scenes/16x9/blueprint-cinema/content-questionHook.js`（mesh + halo + glass + grain + hue-rotate）。

## 下一步

`cargo run -p nf-guide -- component verify`
