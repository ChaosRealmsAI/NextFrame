# Apple Motion · Design.md

> Apple 风格动画原子的视觉 + 动效宪法。
> 写一次，所有原子只查表不创作。
>
> **来源**：Apple Human Interface Guidelines · SwiftUI Spring API · 5★ DNA 铁律 · 用户审美偏好（见 memory）
>
> **适用范围**：`animation-gallery/atoms/apple/*` 所有作品

---

## 1. 核心品味（5 关键词）

> **简洁 · 留白 · 克制 · 高级感 · 拟态（skeuomorphism 现代版）**

**"Apple 精髓不是视觉风格，是 SwiftUI spring 物理的精准。"**

用户偏好（已写入 memory，见 `user_animation_aesthetics.md`）：
- 扁平基底 + 阴影/渐变营造 2.5D 体积感（不是硬 3D）
- 动效要像真实物体 — 有质量、惯性、弹性、重力
- "慢下来看依然好看" = 好动效

---

## 2. Apple HIG 5 原则（官方）

### 2.1 Purposeful · 有目的的动画
动画必须服务功能 — **让人定位、给反馈、帮理解**，不是装饰。
- ✅ 爱心 spring 弹入 = 明确反馈"点赞成功"
- ❌ 毫无信息量的旋转粒子群 = 噪音

### 2.2 Communicate · 沟通式动画
动画要传达"发生了什么 / 接下来会怎样"。
- ✅ 数字 +1 弹出飞向计数器 = 可见的因果链
- ❌ 突然跳变的数字 = 观众脑补代价大

### 2.3 Quick & Precise · 快速精确
**单动作 100ms–500ms**（HIG 官方时长区间）。
- 太短 = 看不到
- 太长 = 阻塞感、廉价感
- 精准时机 > 长时长

### 2.4 Realism · 真实物理
符合物理直觉 — 有质量、加速、回弹、阻尼。
- ✅ `spring(k=260, d=14)` 欠阻尼，有自然 overshoot
- ❌ `linear` 线性，像机器人，无生命

### 2.5 Accessible · 可选禁用
尊重 `prefers-reduced-motion: reduce`，动画不是唯一信息通道。

---

## 3. 动效规范（Motion System）

### 3.1 主 Easing（唯一默认）

```css
--apple-ease: cubic-bezier(0.22, 1, 0.36, 1);  /* ease-out-quint, Apple 审美基线 */
```

所有**入场 / 淡出 / 非 spring** 动作用此。
禁 `ease` / `ease-out` / `linear` 字面值 — 味道立刻掉档。

### 3.2 Spring 物理（拟态核心）

基于 **SwiftUI `.interpolatingSpring(stiffness:damping:)` API**：

| 场景 | stiffness (k) | damping (d) | mass (m) | 感觉 |
|---|---|---|---|---|
| **主角爆发**（heart scale / 按钮压下） | 260 | 14 | 1 | 明显 overshoot · 有"被戳一下"的回弹 |
| **粒子散射** | 140 | 18 | 1 | 柔和扩散 · 阻尼高 · 不抖 |
| **mini 元素浮入** | 200 | 16 | 1 | 温柔弹入 |
| **+1 数字弹出** | 240 | 14 | 1 | 快速入场 + overshoot |
| **settle 回落** | 220 | 16 | 1 | 轻微收尾 |
| **重物体沉坠** | 180 | 20 | 1.5 | 阻尼足 · 质量感强 |

**iOS 17+ 新 API**（更直觉）：
```swift
.spring(response: 0.4, bounce: 0.3)  // response = 周期, bounce ∈ [0,1] 弹性
```

JS 实现（推荐，前端版）：
```js
function spring(t, k = 260, d = 14, mass = 1) {
  if (t <= 0) return 0;
  const wn = Math.sqrt(k / mass);
  const zeta = d / (2 * Math.sqrt(k * mass));
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta * wn / wd) * Math.sin(wd * t));
  }
  return 1 - (1 + wn * t) * Math.exp(-wn * t);  // 过阻尼
}
```

### 3.3 时长档位（基于 HIG 100–500ms 区间）

```css
--motion-instant:  100ms;  /* 微反馈 · hover · tap 压下 */
--motion-fast:     200ms;  /* 按钮状态 · 颜色变化 · 快速入场 */
--motion-normal:   350ms;  /* 主要入场 · 卡片展开 · 标准过渡 */
--motion-slow:     500ms;  /* 页面转场 · 大元素移动 */
--motion-settle:   800ms;  /* spring 完全收束 · 定格停留 */
```

**禁自由值**：0.3s / 0.4s / 0.6s 这种随手数字。

### 3.4 Stagger（错峰节奏）

```js
// 粒子 / 字符 / 列表项的标准 stagger
const STAGGER_TIGHT  = 0.025;  // 25ms — 粒子等大量元素
const STAGGER_NORMAL = 0.04;   // 40ms — 字符逐字
const STAGGER_LOOSE  = 0.08;   // 80ms — 卡片 / 大元素
// 最多 8 级。超过 = 节奏崩（同 5★ DNA 铁律）
```

### 3.5 Anticipation（蓄力 · 拟态核心）

爆发前**先反向一次**，才能弹出力量感。
```
scale: 1.00 → 0.92（压缩 100ms）→ spring → 1.35（overshoot）→ settle 1.0
```
这是 SwiftUI 按钮点击感 / 爱心动画的核心公式。

### 3.6 细节时机（非同步）

**同一事件的不同属性不要同帧起止** — 50–80ms 偏移创造层次感：
- 颜色变化 **晚于** scale 峰值 50ms
- 阴影扩散 **早于** scale 峰值 30ms
- 粒子散射 **晚于** 主体 scale 开始 100ms

---

## 4. 视觉规范（克制 · 拟态）

### 4.1 调色板（极简）

```css
/* 背景 */
--bg-light:       #ffffff;   /* 浅色模式 */
--bg-light-soft:  #fafafa;   /* 浅色模式 · 更柔和 */
--bg-dark:        #1c1c1e;   /* 深色模式 · Apple iOS */
--bg-dark-true:   #000000;   /* OLED 纯黑 */

/* 主强调色（一次只用一种） */
--apple-red:      #ff3b30;   /* iOS System Red · 默认 like 色 */
--apple-blue:     #0a84ff;   /* iOS System Blue · 链接 / CTA */
--apple-green:    #34c759;   /* iOS System Green · 确认 */
--apple-orange:   #ff9500;   /* iOS System Orange · 警示 */
--coral:          #ff6b6b;   /* 情感 / 温暖变体 */

/* 墨色五档 */
--ink-900:        #1a1a1a;   /* 主文字 */
--ink-700:        #4a4a4a;   /* 次要文字 */
--ink-500:        #8a8a8a;   /* 辅助文字 */
--ink-300:        #c0c0c0;   /* 占位 / 禁用 */
--ink-100:        #e8e8e8;   /* 边框 / 分隔 */
```

**铁律**：
- 一个原子只用 **1 种强调色**（不混搭）
- 禁渐变色充当主色（渐变只做 volumetric fill 用，见 4.3）
- 深色底和浅色底都可以，**不准半深半浅**（灰色背景 = 犹豫 = 低级）

### 4.2 主体形状（简洁拟物）

✅ **SVG 干净几何**：纯 path + 纯色填充 / radial gradient + 简单 stroke
✅ **圆角**（`rx: 12–24px` for rect / card，心形不需要但轮廓平滑）

❌ **禁复杂 SVG**：path 总数 > 10 = 视觉噪音（5★ DNA 铁律）
❌ **禁外部 icon 库**：除非和本设计语言一致

### 4.3 体积感（radial gradient + soft shadow = 2.5D 基准）

**这是 Apple-Like v4 验证过的拟态公式**（用户钦点）：

```svg
<!-- 主体 fill：radial gradient（左上高光 → 中间主色 → 右下暗部） -->
<radialGradient id="volumeFill" cx="0.35" cy="0.3" r="0.75">
  <stop offset="0%"  stop-color="#ff8a7a"/>  <!-- 主色 +35% 亮度 · 高光 -->
  <stop offset="45%" stop-color="#ff3b30"/>  <!-- 主色 · 本色 -->
  <stop offset="100%" stop-color="#b01b14"/> <!-- 主色 -30% 亮度 · 暗部 -->
</radialGradient>

<!-- 阴影：柔和主色 + 微黑色混合，两层叠加增加空气感 -->
<filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
  <feDropShadow dx="0" dy="10" stdDeviation="14"
    flood-color="#ff3b30" flood-opacity="0.28"/>
  <feDropShadow dx="0" dy="4"  stdDeviation="4"
    flood-color="#000000" flood-opacity="0.06"/>
</filter>
```

**参数原理**：
- 高光位置 `cx=0.35 cy=0.3`（左上 1/3 处 · 想象从左上照光）
- 阴影主色 + 低透明度 = 发光感而非硬黑阴影
- 两层 drop-shadow：一层长+柔（大气）+ 一层短+清（贴地）

❌ **禁硬黑色阴影**（`rgba(0,0,0,0.5)` 这种没拟态感）
❌ **禁 inset shadow 伪立体**（廉价 2000 年代网页风）
❌ **禁 WebGL glass / ray-march / 真 3D**（AI 做不好，翻车）

### 4.4 留白（呼吸）

> **主体最大尺寸占屏幕 < 40%。至少 60% 是空白。**

参考 v4 截图：心形占屏高度 ≈ 35%，上下左右各留大片白。留白是高级感的本体。

### 4.5 字体

```css
font-family: -apple-system, "SF Pro Display", "Inter", system-ui, sans-serif;
font-feature-settings: "ss01", "tnum";  /* 更好的数字 */
letter-spacing: -0.02em;  /* 大字号 */
font-variant-numeric: tabular-nums;  /* 计数器必用 */
```

- 主数字 / 计数器：`tabular-nums`（定宽数字，避免跳字）
- 大号标题：负字距 -0.02em（Apple signature）
- 小号标签：字号 10-12px + `letter-spacing: 0.3em` + uppercase（HUD 字）

---

## 5. 画面干净纪律（铁律）

**动画样片的画面只能有 3 样**：
1. 背景（氛围）
2. 动画本体（主体 + 粒子 + 相关数字）
3. 底部时间轴（scrubber + play/pause + frame counter + cue marks）

### 禁止列表（违反 = 立即返工）
- ❌ HUD 角落标签（"Nextframe Labs" / "System · active" / "v 1.0"）
- ❌ 侧栏 vertical text（旋转竖排装饰字）
- ❌ 叙事文字（"FELT NOT CLICKED" / "SEEN BY SOMEONE"）
- ❌ editorial 装饰（ruler / tick marks / serial number / "N° 042"）
- ❌ 产品 mockup（video card / 头像 / comment / share 按钮栏）
- ❌ 背景 grid 太明显（浅灰极淡 OK，深灰重 grid 不行）

**Why**：这些属于"产品 UI"或"editorial 装饰"，不属于"动画原子"范畴。混在一起 = 方向漂移。

---

## 6. 技术约束（Frame-Pure）

### 6.1 单一时间源
```js
setTime(t);  // 唯一入口 · 所有元素状态 = f(t) 纯函数
```

### 6.2 必含底部时间轴 UI
- Play / Pause ⏸/▶
- Reset ↺
- 时间 label（"3.20 / 10.00s"）
- Scrubber（type=range · 可拖拽任意时刻）
- Frame counter（"frame 96 / 300" @ 30fps）
- Cue marks（至少 5 个节拍点）

### 6.3 禁用清单（必违规）
| 禁项 | 原因 | 替代 |
|---|---|---|
| CSS `@keyframes` / `animation:` | 挂浏览器时钟 · 无法被 scrubber seek | JS `render(t)` 按 t 计算 |
| `transition:` | 同上 | 同上 |
| `performance.now()` 驱动视觉 | wall clock · 非 frame-pure | 用 scrubber value 或 `__onFrame(t)` |
| `setTimeout / setInterval` 触发视觉 | 压缩时被漂移 | t 函数式触发 |
| `Math.random()` 每帧调用 | 非确定性 · 同 t 两次不一样 | 种子化 seed |
| `requestAnimationFrame` 驱动视觉 | 只允许时间控制器用 | 时间控制器统一调 `render(t)` |
| WebGL / ray-march / 复杂 shader | AI 做不好 · 糊 | SVG + radial gradient + shadow |

---

## 7. Accessibility（a11y）

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**没有这段 = 质量门不过**。Apple HIG 明确要求。

---

## 8. 20 原子路线（Apple 基线）

按本规范做 20 个原子 HTML 作为视频 + PPT 90% 场景覆盖：

**互动反馈 (4)**：Like ✅ · Bookmark · Follow · Share
**数据 (5)**：CountUp · Progress · Ring · Bar · Countdown
**状态 (4)**：Success ✓ · Error ✗ · Loading · Saving
**成就 (2)**：Achievement · Combo
**入场转场 (3)**：Title Impact · Card Reveal · Page Transition
**情感 (2)**：Heart Float · Confetti

✅ 已完成：Like（see `like.html`）
🔜 下一步：其他 19 个按本规范依次做

---

## 9. 质量门（每个原子产出前自检）

```
□ 视觉：扁平基底 + radial gradient + soft shadow？（#08 基准）
□ 视觉：主体 < 40% 屏幕 · 留白 > 60%？
□ 视觉：最多 1 种强调色？
□ 动效：用了参数化 spring（非简单 easeOut）？
□ 动效：有 anticipation 蓄力？
□ 动效：有 stagger 错峰？
□ 动效：细节时机差 50-80ms？
□ 时长：单动作在 100-500ms？
□ 画面：没有 HUD / 叙事文字 / 产品 mockup？
□ 技术：setTime(t) 单时间源？无 CSS animation？
□ 技术：底部 scrubber + cue marks 齐全？
□ a11y：prefers-reduced-motion 处理？
□ 截图：4 张关键时刻 · Read 自核验 · 像 Linear / Framer 质感吗？
```

**全部 ✅ → 交付 · 任何一项 ❌ → 改**。

---

## 10. Subagent Prompt 模板（给 Opus 复用）

```markdown
## 你是谁
Kai Chen · motion engineer（不是 visual designer）· Framer Motion 核心贡献者 · 做不到 9/10 不发。

## 任务
做 Apple 风 "{原子名称}" 动画原子，10s 循环，frame-pure + scrubber。

## 必读
/Users/Zhuanz/bigbang/NextFrame/animation-gallery/atoms/apple/Design.md
（整个规范，严格遵守）

## 关键约束
- 视觉：扁平 + radial gradient + soft shadow（#08 基准）· 白底或深色底 · 一种强调色
- 动效：参数化 spring · stagger · anticipation · 细节时机差 50-80ms
- 画面：只有背景 + 动画本体 + 底部时间轴 · 禁 HUD / 叙事 / mockup
- 技术：setTime(t) 单源 · 禁 CSS animation / WebGL / shader 材质

## 文件路径
/Users/Zhuanz/bigbang/NextFrame/animation-gallery/atoms/apple/{name}.html

## 自验证
写完截图 4 张 t=X → Read 自核验 → 不达标自改 → 达标返回
```

---

## Sources

- [Motion · Apple HIG](https://developer.apple.com/design/human-interface-guidelines/motion)
- [iOS 26 Motion Design Guide](https://medium.com/@foks.wang/ios-26-motion-design-guide-key-principles-and-practical-tips-for-transition-animations-74def2edbf7c)
- [SwiftUI interpolatingSpring API](https://developer.apple.com/documentation/swiftui/animation/interpolatingspring(mass:stiffness:damping:initialvelocity:))
- [SwiftUI spring response/bounce (iOS 17+)](https://developer.apple.com/documentation/swiftui/animation/spring(response:dampingfraction:blendduration:))
- [WWDC23 · Animate with Springs](https://developer.apple.com/videos/play/wwdc2023/10158/)
- [Reduced Motion Evaluation · Apple](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/)
