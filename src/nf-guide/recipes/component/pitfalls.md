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

### recorder 命令（正确做法 — recorder slide 自动检测多 clip）

```bash
# timeline 里每层 videoArea 各自带 params.src + videoOverlay 坐标
# recorder slide 会自动扫描所有 videoOverlay 层 → 多 ffmpeg overlay 合成
nextframe-recorder slide timeline.html --out out.mp4 \
  --width 1080 --height 1920 --dpr 1 --fps 30
```

看 log 是否有 `overlay: compositing N video layer(s)` → N = 检测到的视频层数。

**切屏（同 timeline 多视频）示例**：

```json
{
  "layers": [
    { "id": "video-a", "scene": "videoArea", "start": 0, "dur": 3,
      "params": { "src": "/tmp/clip-a.mp4" },
      "videoOverlay": { "x": 80, "y": 276, "w": 920, "h": 538 } },
    { "id": "video-b", "scene": "videoArea", "start": 3, "dur": 3,
      "params": { "src": "/tmp/clip-b.mp4" },
      "videoOverlay": { "x": 80, "y": 276, "w": 920, "h": 538 } }
  ]
}
```

recorder slide 检测到 2 个 video layer → 2 次 ffmpeg overlay filter，用 `enable='between(t,START,END)'` 时段门控 → 视频按时间段自动切换。

### ❌ 别用 recorder clip 模式

`recorder clip --video ONE_FILE` 只支持全程一个 video，无法切屏。**clip 模式是单片段访谈的简化版**，多片段访谈必须用 slide 模式 + timeline 层 videoOverlay 字段。

**防复发**：scene 规范 B 组加一条"type=media 的 video 组件必须有 videoOverlay:true 且坐标和 recorder ffmpeg 常量对齐"。

---

## 坑 12 · _rendered 缓存在 compose 架构下无效

**症状**：按 recipe 建议加了 `if (host._rendered && t > 1.0) return;` 防动画重播，但没效果。

**根因**：compose 每帧 `document.createElement("div")` 新 host，`_rendered` 永远 undefined。

**修复**：不依赖这个缓存。直接用 t-driven 动画（见坑 1）。这个缓存模式只在 scene-preview 详情页（host 是持久 stage element）有效，timeline compose 场景不适用。

**防复发**：把坑 1 的修复（t-driven）作为唯一推荐方案，弃用 `_rendered` cache 方案。

---

## 坑 13 · recorder 录出的 MP4 所有帧都一样（40s 卡在 frame 0）

**症状**：`recorder slide` 产出 MP4，拉时间轴发现每一秒都是同一张画面，像静态图。

**根因**：built HTML 不 emit `window.__hasFrameChanged(prevT, curT)`。recorder 默认 skip 机制基于 cue/subtitle 边界 — 如果 timeline 只有 1 个空 subtitle 覆盖全程，recorder 认定"页面从不变"，只录第 0 帧重用到最后。

**修复**：`build-runtime.ts` emit 的 HTML 必须包含：
```js
window.__hasFrameChanged = function(prevT, curT) {
  // 检测 layer 进入/离开、frame_pure:false 层、enter animation window
  ...
};
```

**防复发**：`scene-component-system.html` D 组第 5 条"built HTML 必须有 __hasFrameChanged 钩子"。`scene-smoke` 可加静态扫描检查。

---

## 坑 14 · recorder width/dpr 和 CSS 坐标空间不匹配

**症状**：video overlay 位置对，但视频超出设计的槽位；或者槽位对，但视频偏移。

**根因**：`OVERLAY_X_CSS = 80` 等常量写在 `overlay/ffmpeg.rs`，假设 CSS 画布是 **1080×1920**。但 recorder 允许 `--width 540 --height 960 --dpr 2`（输出也是 1080×1920 Retina），此时 CSS 是 540×960，80/540 ≠ 80/1080，坐标比例错位。

**修复两种都行**：
- **推荐**：`--width 1080 --height 1920 --dpr 1` 让 CSS 空间 = 设计空间
- 或：scene render 里用 `(80/1080) * vp.width` 把设计空间映射到任何 viewport

**防复发**：produce/06-record.md step prompt 里写死推荐命令。未来改 overlay 常量要和 scene 组件坐标联动。

---

## 坑 15 · build-scenes.ts adapter 不处理 v3 default export

**症状**：`nextframe build` 成功但 build 出的 HTML 里 scene 跑不起来，层渲染为 error 占位。

**根因**：历史 `buildSceneBundle` 只识别 v1/v2 scenes 的 `export const meta` + `export function render`。v3 用 `export default {...}` → `stripESM` 转成 `return {...}`，老 adapter 找不到命名的 `render`。

**修复**：已合入 `build-scenes.ts` — 新 adapter 匹配 `return {...}` 用正则抓默认对象，取 `_def.render.bind(_def)` 并包 DOM-mutation 形态（type=dom/svg/media）转 string-returning（type=canvas）。

**防复发**：每次 scene 契约改动要同步 check `buildSceneBundle` 是否兼容。

---

## 坑 16 · overlay_video_layers 只合视频不合音频 → MP4 静音

**症状**：`recorder slide` 出来的 MP4 视频画面正确切换，但无声。log 提示 `warn: no audio file found (path=None), muxing silent track`。

**根因**：`overlay/ffmpeg.rs` 的 `overlay_video_layers` 只 `-map 0:a?`（0 = recorded，silent），不 mix 每个 clip 的 `:a` 流。

**修复**：`build_audio_layer_filter` 函数新加，每个 clip 的 `:a` 经 `atrim=0:DUR,asetpts=PTS-STARTPTS,adelay=START_MS|START_MS` → `amix` 所有 clip → `-map [aout]`，codec AAC 192k。

**防复发**：`ffprobe` 验证是 MP4 自验必备：
```bash
ffprobe -show_entries stream=codec_type,codec_name,duration /tmp/out.mp4
# 必须看到 codec_type=audio / codec_name=aac / 非 0 duration
```

---

## 坑 17 · 新主题下所有 scene 被 user 清空 重建时没吸收历史经验

**症状**：重建 content-videoArea 时忘记加 `videoOverlay: true` flag + `--video` 路径模式，结果 ffmpeg 不认这层是视频。

**根因**：clear-slate 重建周期中，AI 只抄 scene-new scaffold，没读 pitfalls.md 的历史方案。

**修复**：component recipe 的 00-pick step 在"选 type=media"时**强制链接 pitfalls 坑 11**。

**防复发**：`nf-guide component pick` prompt 里 type=media 分支下嵌入"必读 pitfalls.md 坑 11"链接。
