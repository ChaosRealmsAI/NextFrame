# neo-tokyo · 9:16

> 设计语言文档。AI 写组件前必读。**代码不 import 此文件** — 所有值在组件文件里写死，改 token 用 sed 批处理。

---

## 气质

赛博夜东京 · 霓虹电光青 · 荧光紫 · 程序员深夜终端。
给"AI 时代程序员观察"合集：讲 AI 替代人、代码消失的瞬间、下一代开发者的困境与希望。
目标受众：22-35 岁程序员 + AI 从业者（刷 TikTok/B站/小红书）。

**情绪基调：希望 + 科技（不是悲观的赛博朋克，是兴奋的未来感）。**
高对比度 · 电光青主强调 · 荧光紫辅助 · 扫描线纹理 · 故障美学适度点缀。

参考：Fireship 片头动画的能量感 + 攻壳机动队 GITS 的 HUD 面板 + Blade Runner 2049 夜东京街景（霓虹反射）+ GitHub dark pro 的代码色彩语义。

---

## 配色（直接 hex 写到组件里）

### 背景层（深夜黑）
- `--bg`      `#07090f`   主背景（近黑 带一点蓝）
- `--bg2`     `#0c1018`   二级面板（卡片 / HUD 框）
- `--bg3`     `#141a26`   三级表面（嵌套 / 按钮底）
- `--bg-in`   `#04060a`   inset 输入框 / 代码块

### 文字（冷白 / 电光青）
- `--ink`     `#e6f7ff`                   主文字（高亮电光白）
- `--ink-75`  `rgba(230,247,255,.75)`     次文字
- `--ink-50`  `rgba(230,247,255,.50)`     辅助文字
- `--ink-25`  `rgba(230,247,255,.25)`     脚注

### 主调（电光青）+ 辅助（荧光紫）
- `--ac`      `#00e5ff`   主强调（数字 / 标题 / 扫描线）
- `--ac2`     `#7cf9ff`   浅青辅（对比 / 第二轴）
- `--neon`    `#b967ff`   荧光紫（金句 / 收尾定格）
- `--neon2`   `#e879ff`   粉紫辅（脉冲高光）

### 状态色
- `--green`   `#4dff91`   成功 / 正在运行
- `--yellow`  `#ffd84d`   警告 / 提醒
- `--red`     `#ff4d6a`   错误 / 危险 / "替代"红线

### 透明度变体（常用组合）
- `--ac-08`   `rgba(0,229,255,.08)`
- `--ac-20`   `rgba(0,229,255,.20)`
- `--ac-40`   `rgba(0,229,255,.40)`
- `--neon-12` `rgba(185,103,255,.12)`
- `--neon-40` `rgba(185,103,255,.40)`
- `--red-20`  `rgba(255,77,106,.20)`

### 分割线 / 幽灵
- `--rule`    `rgba(0,229,255,.15)`       青色极淡水平线
- `--rule2`   `rgba(255,255,255,.06)`     白色极淡分隔
- `--ghost`   `rgba(230,247,255,.04)`     幽灵底

---

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `'Inter', system-ui, -apple-system, 'PingFang SC', sans-serif` | UI / 正文 / 中文 |
| mono | `'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, monospace` | 主字体 · 数字 / 代码 / 标签 / 金句 |
| serif | `'Times New Roman', Georgia, 'Noto Serif SC', serif` | 极少用 · 仅收尾金句 italic |

**禁止外部字体下载**。mono 是本主题的灵魂 — 90% 的文字走 mono，显赛博终端感。

---

## 字号阶梯（1080 × 1920）

| 用途 | px | 行高 | 字重 |
|------|----|------|------|
| Display 封面 / Hook 大字 | 180 | 0.95 | 700 |
| H1 主标题 | 108 | 1.1 | 700 |
| H2 章节 | 76 | 1.15 | 600 |
| H3 卡片标题 | 56 | 1.3 | 600 |
| Body 大 / 金句 | 48 | 1.45 | 500 |
| Body 默认 | 40 | 1.5 | 400 |
| Mono 大（代码 / 命令）| 44 | 1.5 | 500 |
| Mono 中（标签 / 状态） | 28 | 1.4 | 600 |
| Caption / 脚注 | 26 | 1.4 | 400 |

**短视频手机端下限 42px**（§7.5）。Caption 26px 只能用在 chrome 条带里不可用作正文。

---

## 网格（1080 × 1920）

- **安全边距**：左右 88（8.1%），顶 160（8.3%），底 260（13.5%）— 避开 TikTok/Reels UI 遮挡
- **可用主内容区**：x = 88..992，y = 160..1660（904 × 1500）
- **chrome 顶部 HUD 条**：y = 40..140（channel / step / status）
- **chrome 底部 brand 条**：y = 1720..1880（handle + progress）
- **字幕带**：y = 1480..1640（三行中文 48px + 英文 28px）

### 视觉比例
- Hook 大字主体：y = 520..1100，字高 ≤ 560px
- metric 数字主体：最大 480px（display serif or mono）
- 对比双栏：左 x=88..536 / 右 x=544..992 / 中缝 8

---

## 图层顺序（z 从下到上）

| 层 | role | 例 |
|----|------|----|
| 0 | bg | bg-gridPulse（扫描线呼吸） |
| 1 | content | content-hookTitle / content-counterStat / content-comparePair |
| 2 | text | text-goldenQuote |
| 3 | chrome | （本批次未做，留扩展）|
| 4 | overlay | overlay-progressPulse |

bg 互斥：同画面只能一个 bg 层。

---

## 命名约定

- 文件名：`{role}-{name}.js`
- id = camelCase（无 role 前缀）
- theme 字段 = `"neo-tokyo"`
- ratio 字段 = `"9:16"`

---

## 组件设计原则

1. **零 import** — 所有 hex / 字号 / 坐标直接写在 render 里
2. **frame_pure: false 默认** — 本主题所有组件都有 t-driven 动画，静止 >3s = 废
3. **viewport-relative 布局** — 用 `vp.width * 0.5` 不写死 540
4. **18 AI 理解字段必填**（id/name/version/ratio/theme/role/description/intent/when_to_use/when_not_to_use/limitations/inspired_by/visual_weight/mood/complexity/performance/status/changelog）
5. **assets: []** — 只用系统字体和 CSS，零外部资源
6. **t-driven 动画** — 用 Math.min/max 把 t 映射成 opacity/transform，不依赖 CSS @keyframes（compose 每帧 mutate host）
7. **至少 2 种动效 verb** — 禁止只用 fadeUp。pop + stagger / counter + pulse / fly + reveal
8. **手机可读** — 字号 ≥ 42px（caption 例外），对比度 ≥ 7:1

---

## 情绪波形使用位置

本主题组件 mood 映射：

- **Hook 0-3s** — `content-hookTitle`（pop + glitch）
- **展开 3-10s** — `content-comparePair`（fly stagger）
- **核心 10-20s** — `content-counterStat`（counter + pulse）
- **呼吸** — `bg-gridPulse`（breathing） + `overlay-progressPulse`（pulse）
- **金句定格** — `text-goldenQuote`（zoom + breathe，italic serif）

每个组件 intent 注明它在波形哪段发力。

---

## 改设计语言时

颜色批量替换：
```bash
# 改主强调色 #00e5ff → #00ccff（示例）
grep -l "#00e5ff" src/nf-core/scenes/9x16/neo-tokyo/*.js | xargs sed -i '' 's/#00e5ff/#00ccff/g'
```

改字号：改 theme.md + 用 sed 批处理组件 `font:` 属性。
