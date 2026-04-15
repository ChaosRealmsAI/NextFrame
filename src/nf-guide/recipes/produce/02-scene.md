# Step 2: 做组件 + 单独验证

缺什么组件就做什么。每个组件：写 → preview 截图 → AI 读图验证 → 不对就改 → 循环。

## 2.0 静态/动态分离原则

**全程不变的元素合成一个"chrome"组件。随时间变化的各自独立。**

| 类型 | 举例 | 说明 |
|------|------|------|
| 静态 chrome | 背景、标题、品牌、元信息 | 合成 1 个组件，减少 layer 数量 |
| 动态 | 字幕、进度条、视频区 | 各自独立，有自己的时间逻辑 |

判断标准：**这个元素在 t=0 和 t=最后一帧 长得一模一样吗？** 是 → 静态，合进 chrome。不是 → 动态，单独组件。

## 2.1 先读设计规范

```bash
cat src/nf-core/scenes/shared/design.js
```

这个文件是**唯一真相源**。里面有：

### 预设系统（新 scene 必须用）
```javascript
import { getPreset, esc, scaleW, scaleH, fadeIn, findActiveSub, decoLine } from "../../../shared/design.js";

const preset = getPreset("interview-dark");  // 或 "lecture-warm"
const { colors, layout, type } = preset;
// 用 colors.primary, layout.video.top, type.title.size — 不硬编码
```

### 可用预设
| 预设名 | ratio | 场景 |
|--------|-------|------|
| `interview-dark` | 9:16 | 深黑底+金色，访谈切片 |
| `lecture-warm` | 16:9 | 暖棕底+金色，讲解教程 |

**加新系列 = 在 PRESETS 里加一条，不改工具代码。**

### 工具函数（通用，不绑预设）
- `esc(value)` — HTML 转义
- `scaleW(vp, px, baseW)` / `scaleH(vp, px, baseH)` — 像素缩放
- `fadeIn(t, delay, duration)` — 淡入动画
- `findActiveSub(segments, t)` — 字幕两级查找
- `decoLine(vp, y, colors, baseW, baseH)` — 装饰分隔线（颜色从外部传）

## 2.2 组件契约

每个 scene 必须导出 4 个接口：

```javascript
export const meta = {
  id: "sceneName",           // 唯一 ID
  version: 1,
  ratio: "9:16",             // 或 "16:9"
  category: "overlays",      // backgrounds/media/overlays/typography/browser/data
  label: "Human Name",
  description: "做什么的",
  tech: "dom",
  duration_hint: 20,
  videoOverlay: true,         // 仅视频 scene 需要，recorder 靠这个检测
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    paramName: { type: "string", default: "", label: "说明", group: "content" }
  },
  ai: { when: "什么时候用", how: "怎么用" }
};

export function render(t, params, vp) {
  // t = 当前时间(秒), params = 参数, vp = {width, height}
  // 返回 HTML 字符串
  return `<div>...</div>`;
}

export function screenshots() {
  return [{ t: 0.5, label: "标签" }, { t: 5, label: "中间" }, { t: 19, label: "结尾" }];
}

export function lint(params, vp) {
  const errors = [];
  // 检查参数合法性
  return { ok: errors.length === 0, errors };
}
```

## 2.3 关键规则

### 颜色/布局/字号 — 全部从 preset 取
```javascript
const preset = getPreset("interview-dark"); // 在 render 函数开头
const { colors, layout, type } = preset;

// ✅ 对 — 从 preset 取
color: colors.primary
top: scaleH(vp, layout.video.top, layout.baseH)
fontSize: scaleW(vp, type.title.size, layout.baseW)

// ❌ 错 — 禁止硬编码
color: "#e8c47a"
top: scaleH(vp, 276)
```

### 位置 — 从 preset.layout 取（不用全局 GRID）
```javascript
const { layout } = getPreset("interview-dark");
// ✅ 对
const top = scaleH(vp, layout.video.top, layout.baseH);
// ❌ 错 — 用全局 GRID（硬绑某个预设）
const top = scaleH(vp, GRID.video.top);
```

### 字幕 — 用 findActiveSub 两级查找
```javascript
import { findActiveSub } from "../../../shared/design.js";

// render 函数里：
const active = findActiveSub(params.segments, t);
if (active) {
  // active.cn = 当前中文
  // active.en = 当前英文（segment 级别）
  // active.speaker = 说话人 → 决定颜色
}
```

**禁止把 segments 拍平成 SRT 数组** — 英文跟 segment 走，中文跟 cn[] 子 cue 走。拍平会导致英文重复跳动。

### 视频 — meta 必须有 videoOverlay: true
```javascript
export const meta = {
  // ...
  videoOverlay: true,  // recorder 靠这个检测哪个层需要 ffmpeg 合成
};
```

### WKWebView 兼容
- 代码块 → 用单个 `<pre>` 元素，不用多个 `<div>`
- 流程图 → 用单个 `<svg>` 元素，不用多个 positioned div
- 原因：WKWebView CALayer.render 在快速 DOM 更新时会丢失多个 absolute-positioned 元素

## 2.4 写完后验证

```bash
# 1. 确认被发现
nextframe scenes <id>

# 2. 硬编码检测（应该 0 结果）
grep -n "#[0-9a-fA-F]\{3,8\}" src/nf-core/scenes/{ratio}/*/*/index.js

# 3. 人眼预览（带 Play/Pause + 拖动条）
nextframe scene-preview <id> --ratio=9:16

# 4. AI 截图验证（自动截 t=0.5s 和 t=5s）
nextframe scene-preview <id> --ratio=9:16 --screenshot=/tmp/scene-check
# 输出截图路径 → Read 截图确认:
#   - 内容可见（不是空白/黑屏）
#   - 位置在 GRID 定义的区域内
#   - 颜色匹配 TOKENS
#   - 文字可读
```

**截图不对 → 改代码 → 再跑 scene-preview --screenshot → 再看。循环直到满意。**

**注意：** preview.html 由 `scene-new` 自动生成（design.js 已内联）。不要手写 preview.html。

## 2.5 参考老版本

如果做 9:16 访谈组件，参考：

```bash
# 老版本的完整实现
cat /Users/Zhuanz/bigbang/MediaAgentTeam/series/硅谷访谈/E01-Dario-Amodei-指数终局/frames/slide-base.js
cat /Users/Zhuanz/bigbang/MediaAgentTeam/series/硅谷访谈/E01-Dario-Amodei-指数终局/frames/clip-slide.js
cat /Users/Zhuanz/bigbang/MediaAgentTeam/series/硅谷访谈/E01-Dario-Amodei-指数终局/frames/subs-zone.js
```

这三个文件是视觉参考的终极真相。布局、颜色、字号、间距都从这里来。
design.js 的 GRID/TYPE/TOKENS 就是从这里提取的。

## 下一步

全部组件 preview 通过后：

```bash
nf-guide produce timeline
```
