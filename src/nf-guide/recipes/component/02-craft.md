# Step 2 · 实现（CLI 生成 + 填内容 + 加动画）

## 1 · 生成骨架（CLI，不手写）

```bash
node src/nf-cli/bin/nextframe.js scene-new \
  --id=<camelCase id> \
  --role=<bg|chrome|content|text|overlay|data> \
  --type=<canvas|dom|svg|media> \
  --ratio=<16:9|9:16|1:1|4:3> \
  --theme=<theme> \
  --name="<显示名>" \
  --description="<一句话用途>"
```

生成 `src/nf-core/scenes/{ratio}/{theme}/{role}-{id}.js`，包含全 11 必填 + 18 AI 字段 + render/describe/sample 骨架。

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
