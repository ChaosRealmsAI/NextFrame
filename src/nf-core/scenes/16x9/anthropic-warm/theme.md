# anthropic-warm · 16:9

> 设计语言文档。AI 写组件前必读。**代码不 import 此文件** — 所有值在组件文件里写死，改 token 用 sed 批处理。

---

## 气质

深夜书房 · 暖棕沙发 · 第一人称自嘲。
配 Claude Code 源码精读视频（@anthropic 风），讲清楚比好看更重要。
不花哨、不冷感、不科技蓝。**信息密度 > 视觉冲击。**

参考：3Blue1Brown 类比教学的稳定感 + Apple keynote 的留白 + Anthropic 官方品牌的暖橙。

---

## 配色（直接 hex 写到组件里）

### 背景层（深暖棕）
- `--bg`     `#1a1510`  主背景（页面底色）
- `--bg2`    `#211c15`  二级面板
- `--bg3`    `#2a2319`  三级表面（卡片）
- `--bg-in`  `#15110c`  inset / 输入框

### 文字（米白系）
- `--ink`     `#f5ece0`        主文字（标题 / 正文）
- `--ink-75`  `rgba(245,236,224,.75)`  次文字
- `--ink-50`  `rgba(245,236,224,.50)`  辅助文字
- `--ink-25`  `rgba(245,236,224,.25)`  脚注 / 占位

### 主调（Anthropic 橙）+ 辅助
- `--ac`     `#da7756`  主强调（标题、进度条、关键词）
- `--gold`   `#d4b483`  二级强调（引用、标签）
- `--green`  `#7ec699`  成功 / 通过 / 新增
- `--blue`   `#8ab4cc`  信息 / 中性
- `--red`    `#e06c75`  错误 / 警告 / 删除

### 透明度变体
- `--ac-10`    `rgba(218,119,86,.10)`
- `--ac-25`    `rgba(218,119,86,.25)`
- `--gold-12`  `rgba(212,180,131,.12)`
- `--green-08` `rgba(126,198,153,.08)`

### 分割线 / 幽灵
- `--rule`   `rgba(245,236,224,.10)`
- `--rule2`  `rgba(245,236,224,.12)`
- `--ghost`  `rgba(245,236,224,.06)`

---

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `system-ui, -apple-system, 'PingFang SC', sans-serif` | UI / 标题 / 正文 |
| serif | `Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif` | 类比卡 / 引用 |
| mono | `'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace` | 代码块 / 终端 |

**禁止外部字体下载** — 组件 `assets:[]` 必须为空。系统自带 = 部署 0 依赖。

---

## 字号阶梯（1920×1080）

| 用途 | px | 行高 |
|------|----|------|
| Display（封面大标题） | 96 | 1.1 |
| H1（slide 主标题） | 72 | 1.15 |
| H2（章节标题） | 56 | 1.2 |
| H3（卡片标题） | 40 | 1.3 |
| Body 大（正文 + 类比） | 36 | 1.6 |
| Body（默认正文） | 28 | 1.55 |
| Caption（脚注 / 标签） | 22 | 1.4 |
| Mono 小 | 24 | 1.5 |
| Mono 中 | 28 | 1.5 |

字重：`400 / 500 / 600 / 700`。Serif 用 700 强调，sans 用 600。

---

## 网格（1920 × 1080）

- **安全边距**：左右 96，上下 80
- **可用区**：1728 × 920
- **chrome 顶部条**：y = 0..72（标题 + 集数 + 进度）
- **chrome 底部条**：y = 1020..1080（品牌 + 进度细线）
- **主内容区**：y = 96..1000（中间留 920 高）

### 12 列网格（可选）
- 列宽 132 + 间隙 24
- 第 1 列起 x=96，第 12 列止 x=1824

---

## 暗角 / 纹理

所有 slide 默认有：
1. **径向暗角**：中心 → 四角 `rgba(0,0,0,.4)`，避免边缘出血
2. **柔光斑**：左上 `rgba(212,180,131,.04)` + 右下 `rgba(218,119,86,.03)`，营造温度

组件 `bg-warmGradient` 负责出这两层。其他组件不要重复画。

---

## 图层顺序（z 从下到上）

| 层 | role | 例 |
|----|------|----|
| 0 | bg | bg-warmGradient |
| 1 | content | content-analogyCard / content-codeBlock |
| 2 | text | text-headline / text-goldenQuote |
| 3 | chrome | chrome-titleBar / chrome-footer |
| 4 | overlay | overlay-progress |

timeline 写入顺序自由，bg 自然在底；如需强制，用 `z_layer` 字段声明。

---

## 命名约定

- 文件名：`{role}-{name}.js`，camelCase，role 用前缀（bg/chrome/content/text/overlay/data）
- id 字段 = camelCase 名（不带前缀）— 例：文件 `text-headline.js` → `id: "headline"`，搜索时用 `--role text` 收窄
- 全局唯一性：同 ratio 同 theme 内 id 不重复

---

## 组件设计原则

1. **零 import** — 每组件单文件，颜色/坐标/工具函数全写死或内联
2. **frame_pure** — 同 t 同 params → 同画面，禁 Date.now / Math.random
3. **viewport-relative** — 用 `viewport.width * 0.5` 不写死 `960`，preview 缩放/4K 导出不崩
4. **18 AI 理解字段必填** — 让未来 AI 看一眼就懂作者意图（intent 不少于 50 字）
5. **assets: []** — 不引用外部 url，字体用系统自带

---

## 改设计语言时

修改 hex / 字号 / 网格的步骤：

1. 改这个 `theme.md`
2. `grep -rn "{old-hex}" src/nf-core/scenes/16x9/anthropic-warm/`
3. `sed -i '' "s/{old-hex}/{new-hex}/g" *.js`
4. 跑 `nextframe validate scenes`
5. preview 自查每个组件

**没有 token 抽象层 — 改值是显式动作，git diff 看得清清楚楚。**
