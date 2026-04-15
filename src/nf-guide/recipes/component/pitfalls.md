# component recipe · 已知坑

每个坑都是真实踩过的。新 AI 进 recipe 前扫一眼。

## 坑 1 · CSS @keyframes 动画在 build→record 里完全失效（重大）

**症状**：gallery 里 Play 按钮看动画正常，但 `nextframe build` + `recorder` 出的 MP4 里动画元素全部保持在 opacity:0 的初始状态（看不见）。

**根因**：引擎 compose() 每帧调 scene.render() → adapter 每帧 `document.createElement("div")` 创建新宿主 → getOuterHTML → 字符串注入 stage。新 DOM 意味着 **CSS @keyframes 动画每帧从头开始**，永远停在 t=0 的初始关键帧（opacity 0）。

**修复**：在 render 里用 `t` 参数**直接计算**动画值，不依赖 CSS keyframes：

```js
render(host, t, params, vp) {
  const fadeDur = 0.6;
  const opacity = Math.min(t / fadeDur, 1);
  const easedOpacity = 1 - Math.pow(1 - opacity, 3);  // easeOut cubic
  const translateY = 20 * (1 - easedOpacity);  // 20px → 0
  host.innerHTML = `
    <div style="opacity: ${easedOpacity}; transform: translateY(${translateY}px); ...">
      ${content}
    </div>
  `;
}
```

**同时必须** `frame_pure: false`，否则 recorder 跳帧，动画被跳过只剩某一帧。

**别用 CSS @keyframes 做入场**：只在纯 gallery 预览场景用 CSS 动画可以，但生产环境（build → record）必须走 JS t-driven。

**防复发**：
- scene spec 20 条规则的 C 组第 1 条改为"入场动画必须 t-driven，禁用 CSS @keyframes 做入场"
- scene-new CLI 骨架将来应该生成 t-driven 示例而不是 CSS keyframes

---

## 坑 2 · 动画每次 scrubber 拖动都重播

**症状**：gallery 里拖时间条，每次动画从头播一遍，视觉断裂。

**根因**：render 每帧都 `host.innerHTML = ...` 重置 DOM → CSS animation 重置。

**修复**：
```js
if (host._rendered && t > enter_dur) return;
host._rendered = true;
```

只在 `t < enter_dur` 时重写 DOM，之后保留首次结果。

---

## 坑 3 · Canvas 组件中文方框

**症状**：canvas 里的中文字显示为 □。

**根因**：`@napi-rs/canvas` 默认不加载系统 CJK 字体。

**修复**：全靠 `src/nf-cli/src/lib/canvas-factory.ts` 自动注册系统字体（已做）。`nextframe scene-smoke` 和 `scene-gallery` 都走 canvas-factory，自动注册。

**防复发**：别用 `createCanvas` from `@napi-rs/canvas` 直接导，统一走 `canvas-factory.ts`。

---

## 坑 4 · frame_pure:true 但 render 读 t

**症状**：MP4 里动画应该有但被跳帧，数字从 0 永远是 0。

**根因**：`frame_pure: true` 告诉 recorder "同 params 同输出"，recorder 只录第一帧。但 render 读了 t 做 counter 动画，应该是 dynamic。

**修复**：
- 静态（不读 t）→ `frame_pure: true`（可跳帧，快）
- 动态（读 t）→ `frame_pure: false`（每帧必录，慢但正确）

---

## 坑 5 · 纯文字 slide（无视觉主体）

**症状**：组件只有"H1 + 副标 + bullet list"，观众看不下去。

**根因**：懒得画视觉主体，偷懒做成纯文字。

**修复**：从 12 模式选一个，强制有真 artifact / 大数字 / 节点图。

**防复发**：Step 03-verify checklist 第 1 项："把文字全删掉还剩图吗？"

---

## 坑 6 · 中文字符串用 `"..."` 嵌 `"`

**症状**：`node --check` 报 `',' expected`，组件加载不出。

**根因**：中文描述里用 ASCII `"` 做强调，`"xxx"yyy"` 提前闭合字符串。

**修复**：
- 中文强调用 `『』` 或 `「」`，不用 `"`
- 或者转义 `\"`
- 或者 template string `\`...\``

**防复发**：scene-new 骨架注释里有提醒。

---

## 坑 7 · theme.md 改色但组件没改

**症状**：theme.md 主色改了，组件还是老色，gallery 里不一致。

**根因**：组件写死 hex 没 import，改 theme.md 不会自动传导。

**修复**：用 sed 批改
```bash
grep -rn "#da7756" src/nf-core/scenes/16x9/anthropic-warm/*.js
sed -i '' 's/#da7756/#新色/g' src/nf-core/scenes/16x9/anthropic-warm/*.js
```

改完跑 `nextframe scene-smoke` 确认都还过。

---

## 坑 8 · 组件的 role 填错

**症状**：gallery 里分类混乱，overlay 组件和 content 组件混在同一组。

**根因**：`role` 是软分类，AI 凭感觉填。

**正确分辨**：
- `bg` — 最底层，一张 slide 一个
- `chrome` — 品牌带 / 集数，全集共享，z 最上（不是 overlay）
- `content` — 主内容卡片/图/列表
- `text` — 纯文字（金句、大标题）覆盖 content
- `overlay` — 小徽章 / 章节标，浮在 chrome 之上
- `data` — 图表 / 数字（content 子类）

---

## 坑 9 · t 是 layer-local 不是 timeline-global

**症状**：组件以为 t=0 是视频开始，但实际是 layer.start 起算。

**根因**：render 收到的 `t = time - layer.start`。

**影响**：counter 动画从 0 开始每个 layer 都对，但如果组件想用"当前在整段视频中的进度"，需要 params 传 `globalT` 而不是用 render 的 t。

---

## 坑 10 · describe 返回和 render 画的对不上

**症状**：gallery 右侧 describe JSON 说 `visible: true`，但画面空白。

**根因**：describe 照抄了骨架，没根据实际 render 逻辑更新。

**修复**：describe() 的 elements/boundingBox 必须反映 render 真实画出来的东西。一个 JSON 对的值就等于 render 的调试输出。

---

## 坑 11 · 视频嵌入（video clip overlay）必须走 ffmpeg 后合成

**症状**：想嵌入真实 mp4 视频片段到 9:16 访谈画面。DOM 里写 `<video src>` + WKWebView 截屏 → 所有 MP4 帧里 video 画面是黑的（WebKit 安全策略：跨源视频不进 snapshot）。

**根因**：WKWebView takeSnapshot 不捕获 `<video>` 元素的帧内容。

**正确做法**（两步）：
1. **scene 组件只画黑框占位**（type="media"），标 `videoOverlay: true`
2. **Rust recorder clip 模式**：`nextframe-recorder clip <html> --video <mp4.mp4> --out <out.mp4>` — recorder 先录制 HTML 帧，再用 ffmpeg overlay filter 把真 video 合成到黑框坐标

### 视频区坐标（1080×1920 CSS 设计空间）

```
x: 80, y: 276, w: 920, h: 538
```

这个坐标 hardcoded 在 `src/nf-recorder/src/overlay/ffmpeg.rs`（OVERLAY_X_CSS 等常量）。scene 组件的黑框必须画在同样位置。

### scene 必填字段

```js
export default {
  type: "media",
  videoOverlay: true,       // 让 recorder 识别
  // ...
  render(host, _t, params, vp) {
    const x = (80 / 1080) * vp.width;
    const y = (276 / 1920) * vp.height;
    const w = (920 / 1080) * vp.width;
    const h = (538 / 1920) * vp.height;
    host.innerHTML = `<div style="position:absolute;left:${x}px;top:${y}px;
      width:${w}px;height:${h}px;background:#000;border-radius:8px"></div>`;
  },
};
```

### recorder 命令

```bash
# 对 --width 1080 --dpr 1（output 1080x1920）
nextframe-recorder clip timeline.html --video clip.mp4 --out out.mp4 \
  --width 1080 --height 1920 --dpr 1 --fps 30

# 对 --width 540 --dpr 2（也是 output 1080x1920，retina 风格）
nextframe-recorder clip timeline.html --video clip.mp4 --out out.mp4 \
  --width 540 --height 960 --dpr 2 --fps 30
```

**不要用 slide 模式**（`recorder slide`）— 那个没有 --video overlay 能力。

**防复发**：scene 规范 B 组加一条"type=media 的 video 组件必须有 videoOverlay:true 且坐标和 recorder ffmpeg 常量对齐"。

---

## 坑 12 · _rendered 缓存在 compose 架构下无效

**症状**：按 recipe 建议加了 `if (host._rendered && t > 1.0) return;` 防动画重播，但没效果。

**根因**：compose 每帧 `document.createElement("div")` 新 host，`_rendered` 永远 undefined。

**修复**：不依赖这个缓存。直接用 t-driven 动画（见坑 1）。这个缓存模式只在 scene-preview 详情页（host 是持久 stage element）有效，timeline compose 场景不适用。

**防复发**：把坑 1 的修复（t-driven）作为唯一推荐方案，弃用 `_rendered` cache 方案。
