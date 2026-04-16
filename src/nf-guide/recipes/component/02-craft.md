# Step 2 · 实现（CLI 生成 + 填内容 + 加动画）

## 1 · 生成骨架（CLI，不手写）

```bash
node src/nf-cli/bin/nextframe.js scene-new \
  --id=<camelCase id> \
  --role=<bg|chrome|content|text|overlay|data> \
  --type=<dom|media> \
  --ratio=<16:9|9:16|1:1|4:3> \
  --theme=<theme> \
  --name="<显示名>" \
  --description="<一句话用途>"
```

生成 `src/nf-core/scenes/{ratio}/{theme}/{role}-{id}.js`，包含全 11 必填 + 18 AI 字段 + render/describe/sample 骨架。

示例：

```bash
node src/nf-cli/bin/nextframe.js scene-new --id=heartLike --role=overlay --type=dom --ratio=16:9 --theme=anthropic-warm --name="Heart Like" --description="点赞反馈 SVG 动效"
```

### 1.5 · 每种 type 的强约束

**先读 theme.md**：color hex / font / grid 全部从那里复制，**禁止自己造色**。

| type | 硬约束 |
|------|--------|
| **dom** | 所有自生成内容都放这里。色值 100% 从 theme.md 复制 hex。动画必须 t-driven，禁 `@keyframes`。内部可以自由写 `<svg>` / `<canvas>` / `<video>` / `<script>`。 |
| **media** | `sample().src` 必须是真实可访问 URL 或真实资源路径，禁 `"assets/placeholder.mp4"` 这种假值。只在组件真的依赖外部资源时用。 |

---

## 2 · 填 18 AI 理解字段（按重要度）

### 最重要

**`intent`** — ≥ 50 字真实推理，不套话：

```js
intent: `
  访谈类视频的核心字幕组件。设计取舍：
  1. 中文在英文下方 — 目标观众优先听英文，中文辅助。
  2. 中文字号 0.7 倍 — 测试出的"看清但不抢戏"平衡点。
  3. 用 PingFang SC 不思源 — macOS 自带零依赖。
  4. 位置 y=0.78~0.82 — 避开人脸三分线和底部进度条。
  5. 不做花字 — 访谈严肃，花字破坏沉浸感。
`,
```

**`when_to_use` / `when_not_to_use`** 要写具体场景，不写套话。

### 配伍字段

```js
requires: ["bg-gradient", "content-video"],
pairs_well_with: ["chrome-header", "overlay-progress"],
conflicts_with: ["text-singleSub", "text-anchoredSub"],
alternatives: ["text-singleSub", "text-kineticSub"],
```

### 视觉权重

```js
visual_weight: "heavy",
z_layer: "foreground",
mood: ["calm", "professional"],
```

---

## 3 · 实现 render

### DOM 组件（主力）

```js
render(host, t, params, vp) {
  const fadeDur = 0.6;
  const p = Math.min(Math.max(t / fadeDur, 0), 1);
  const eased = 1 - Math.pow(1 - p, 3);

  host.innerHTML = `
    <div style="
      position:absolute;
      left:50%;
      top:50%;
      width:${vp.width * 0.6}px;
      padding:56px 64px;
      transform:translate(-50%, calc(-50% + ${20 * (1 - eased)}px));
      opacity:${eased};
    ">
      <svg viewBox="0 0 400 400" width="240" height="240">...</svg>
      <div>${escapeHtml(params.text || "")}</div>
    </div>
  `;
}
```

**关键点**：
- 动画走 t-driven，不用 CSS `@keyframes`
- 读了 `t` 就必须 `frame_pure: false`
- 内部写 `<svg>` / `<canvas>` / `<video>` 都算 `dom`
- 允许返回 HTML 字符串，也允许 mutate host

### 在 dom 里写 Canvas

```js
render(host, t, params, vp) {
  host.innerHTML = `<canvas width="${vp.width}" height="${vp.height}" style="position:absolute;inset:0;width:100%;height:100%"></canvas>`;
  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, vp.width, vp.height);
  // t-driven draw
}
```

### 在 dom 里写 SVG

```js
render(host, t, params, vp) {
  const dash = 620 * (1 - Math.min(t / 1.8, 1));
  host.innerHTML = `
    <svg viewBox="0 0 ${vp.width} ${vp.height}" width="100%" height="100%">
      <path d="..." stroke-dasharray="620" stroke-dashoffset="${dash}"/>
    </svg>
  `;
}
```

### Media 组件

```js
render(host, _t, params, vp) {
  host.innerHTML = `
    <video src="${params.src}" style="
      position:absolute;
      left:0;top:0;
      width:${vp.width}px;
      height:${vp.height}px;
      object-fit:cover;
    " autoplay muted></video>
  `;
}
```

---

## 4 · sample() 用真实业务内容

从 script.md 摘真实台词，不要 Lorem ipsum：

```js
sample() {
  return {
    label: "类比",
    text: "你对我说「帮我写个天气工具」—— 你以为我收到的就这一句话？",
  };
}
```

---

## 5 · describe() 返回结构化状态

让 AI 不看像素就知道画面在演什么：

```js
describe(t, params, vp) {
  return {
    sceneId: "analogyCard",
    phase: t < 0.7 ? "enter" : "show",
    progress: Math.min(t / 0.7, 1),
    visible: true,
    params,
    elements: [
      { type: "card", role: "primary" },
      { type: "label", role: "eyebrow", value: params.label || "" },
    ],
    boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
  };
}
```

---

## 6 · JS 工具函数就地写在文件底部

```js
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

easing / svg path / canvas mount helper 都就地写，不要把 scene 变成跨模块依赖网。

## 下一步

实现完 → `cargo run -p nf-guide -- component verify`
