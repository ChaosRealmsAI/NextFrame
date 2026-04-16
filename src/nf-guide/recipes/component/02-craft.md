# Step 2 · 实现（CLI 生成 + 填内容 + 加动画）

## 1 · 生成骨架（CLI，不手写）

```bash
node src/nf-cli/bin/nextframe.js scene-new \
  --id=<camelCase id> \
  --role=<bg|chrome|content|text|overlay|data> \
  --type=<canvas|dom|svg|media|motion> \
  --ratio=<16:9|9:16|1:1|4:3> \
  --theme=<theme> \
  --name="<显示名>" \
  --description="<一句话用途>"
```

生成 `src/nf-core/scenes/{ratio}/{theme}/{role}-{id}.js`，包含全 11 必填 + 18 AI 字段 + render/describe/sample 骨架。

新 type 示例：

```bash
node src/nf-cli/bin/nextframe.js scene-new --id=heartLike --role=overlay --type=motion --ratio=16:9 --theme=anthropic-warm --name="Heart Like" --description="点赞语义动画"
```

### 1.5 · 每种 type 的强约束（防止 AI 写废）

**先读 theme.md**：color hex / font / grid 全部从那里复制，**禁止自己造色**。

| type | 硬约束 |
|------|--------|
| **dom** | 色值 100% 从 theme.md 复制 hex；禁自定义色。米白主题不能用深色背景（bg 必须是 theme.bg 或 theme.bg2）。禁 `border-radius > 2px` 如主题是杂志风。**t-driven inline style 做动画，禁 @keyframes**。 |
| **media** | `sample()` 的 src **必须是真实可访问 URL**（如 `https://picsum.photos/1920/1080` / `https://placehold.co/1920x1080/e3ddd3/2c2418?text=Photo`），禁用 `"assets/placeholder.mp4"` 这种假 URL。 |
| **motion** | **size 用 [400, 400]，不用 [W, H]**。shape at=[200, 200] 居中。这样 gallery 400px 缩略图里 shape 占比 ≥ 25%，能看清。viewport 是 gallery 外层控制，motion 内部坐标系独立。 |
| **svg** | `viewBox` 用 `0 0 1920 1080` 跟 vp 一致，内部坐标直接用 px。禁 CSS 动画，t-driven `stroke-dashoffset`。 |
| **canvas** | 真的需要逐像素才用。否则能用 motion/dom/svg 就换。 |

---

## 2 · 填 18 AI 理解字段（按重要度）

### 最重要（影响未来 AI 理解）

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

**`when_to_use` / `when_not_to_use`** — 具体场景，不占位符：

```js
when_to_use: [
  "访谈类长视频需要双语字幕",
  "教学视频带翻译辅助",
],
when_not_to_use: [
  "广告类需要花哨字幕动效（用 text-kineticSub）",
  "纯中文内容（用 text-singleSub）",
],
```

### 配伍 4 字段（AI 组 timeline 用）

```js
requires: ["bg-gradient", "content-video"],       // 必须同时在场
pairs_well_with: ["chrome-header", "overlay-progress"],
conflicts_with: ["text-singleSub", "text-anchoredSub"],
alternatives: ["text-singleSub", "text-kineticSub"],
```

### 视觉权重

```js
visual_weight: "heavy",         // light | medium | heavy
z_layer: "foreground",          // background | mid | foreground | overlay
mood: ["calm", "professional"], // 1-3 个
```

---

## 3 · 实现 render（按 type）

### DOM 组件（最常见）

```js
render(host, t, params, vp) {
  // t = 从 layer.start 起的相对时间（秒）
  // vp = { width, height } 画布尺寸
  // params = 已 merge default 的参数
  // host = 容器 HTMLElement，mutate innerHTML 或 appendChild

  // t-driven 入场动画（compose 每帧调 render，CSS @keyframes 在这架构下无效 — 见 pitfalls #1）
  // 把 t 直接映射为 opacity / translateY，frame_pure 必须 false
  const fadeDur = 0.6;
  const p = Math.min(Math.max(t / fadeDur, 0), 1);
  const eased = 1 - Math.pow(1 - p, 3);  // easeOut cubic
  const labelDelay = 0.2;
  const labelP = Math.min(Math.max((t - labelDelay) / fadeDur, 0), 1);
  const labelEased = 1 - Math.pow(1 - labelP, 3);

  // 从 theme.md 复制 hex 写死（不 import token）
  host.innerHTML = `
    <div style="
      position: absolute;
      left: 50%; top: 50%;
      width: ${vp.width * 0.6}px;
      padding: 56px 64px;
      background: rgba(212,180,131,0.06);
      border: 1px solid rgba(212,180,131,0.18);
      border-radius: 12px;
      transform: translate(-50%, calc(-50% + ${20 * (1-eased)}px));
      opacity: ${eased};
    ">
      <div style="
        font: 600 14px/1 'SF Mono', monospace;
        color: #d4b483;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: ${labelEased};
      ">${escapeHtml(params.label || '类比')}</div>
      <div style="
        font: 400 40px/1.6 Georgia, 'Noto Serif SC', serif;
        color: #f5ece0;
        margin-top: 32px;
      "><strong style='color:#da7756;font-weight:700'>${escapeHtml(params.text || '')}</strong></div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

**关键点（已更新）**：
- **动画走 t-driven 不用 CSS @keyframes** — compose 每帧 createElement 新 host，CSS animation 会重置永不完成。把 t 直接算成 opacity / transform。
- **frame_pure 必须 false** — 读了 t 做动画的组件必须这么标，否则 recorder 跳帧
- 所有颜色/字号/坐标写死，零 import
- 多元素 stagger 靠 labelDelay 偏移 t 值实现

### Canvas 组件（逐像素效果）

```js
render(ctx, t, params, vp) {
  // 每帧都调用，不用 _rendered 缓存
  ctx.clearRect(0, 0, vp.width, vp.height);

  // 数字 counter（t-driven 动画）
  const target = params.value || 87;
  const dur = 1.2;
  const prog = Math.min(Math.max(t / dur, 0), 1);
  const eased = 1 - Math.pow(1 - prog, 3);
  const current = Math.round(target * eased);

  ctx.fillStyle = '#da7756';
  ctx.font = '400 280px Georgia, "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(current), vp.width * 0.5, vp.height * 0.5);
}
```

### SVG / Media

参考 scene-new 生成的骨架示例，改成真实内容。

### Particle（确定性粒子）

```js
render(host, _t, params, _vp) {
  void host;
  return {
    emitter: {
      count: params.count ?? 220,
      seed: params.seed ?? 42,
      spawn: (i, emitter) => {
        const rng = mulberry32(emitter.seed + i * 37);
        return {
          x: rng(),
          y: rng(),
          depth: rng(),
        };
      },
    },
    render: (ctx, p, t) => {
      ctx.globalAlpha = 0.35 + p.depth * 0.45 * (0.7 + 0.3 * Math.sin(t * 2 + p.i));
      ctx.fillRect(p.x, p.y, p.size, p.size);
    },
  };
}
```

- `emitter.spawn` 用 **`mulberry32`** 的 seeded rng，禁 `Math.random`
- `field` 可选，用来描述速度场或位置场
- 近/中/远三层要在 spawn 或 render 里显式拉开，不要一锅粥

### Motion（语义矢量动画）

```js
render(host, _t, params, _vp) {
  void host;
  return {
    duration: params.duration ?? 2.2,
    size: [400, 400],
    layers: [
      {
        type: "shape",
        shape: "heart",
        at: [200, 200],
        size: 100,
        fill: params.color ?? "#ff5889",
        behavior: "impact",
        startAt: 0,
        duration: 1.5,
      },
    ],
  };
}
```

- 组合方式是 **behavior 名 + shape 名 + layers**
- 优先用 runtime 内建行为（`impact` / `pulse` / `dart` / `pop`），不要一上来手写长 track
- `size` 直接决定 gallery 预览尺度，别乱填超大 viewBox

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
      { type: "label", value: params.label || "类比" },
      { type: "text", value: params.text || "" },
    ],
    boundingBox: {
      x: vp.width * 0.2,
      y: vp.height * 0.3,
      w: vp.width * 0.6,
      h: vp.height * 0.4,
    },
  };
}
```

---

## 6 · 更新 frame_pure

- **静态组件**（不读 t）：保持 `frame_pure: true`，recorder 可跳帧
- **动态组件**（读 t 做动画）：改 `frame_pure: false`，recorder 会捕每帧

忘改的后果：动画在 MP4 里被跳帧，只显示最后一帧。

---

## 7 · strip TODO + bump status

- 改 `status: "experimental"` → `"stable"`
- 删文件顶部的 TODO 注释块
- 填 `changelog` 初版说明

## 下一步

保存文件 → `cargo run -p nf-guide -- component verify`
