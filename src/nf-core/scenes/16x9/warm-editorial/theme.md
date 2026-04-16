# warm-editorial · 16:9 Design Language

> 纸质感 · 温暖 · 人文 · 深夜书房 · 沉静
> 目标受众：25-40 知识工作者、读书人
> 参考：Monocle 杂志排版 / 锵锵三人行片头 / 豆瓣读书配色

## 颜色

| 角色 | hex | 用在 |
|------|-----|------|
| `bg` | `#f7f3ec` | 主背景（米白纸质感，占 80%+） |
| `bg2` | `#ede8df` | 卡片/面板底色 |
| `bg3` | `#e3ddd3` | 引用块/嵌套面板 |
| `ink` | `#2c2418` | 主文字（深棕，不是纯黑） |
| `ink-60` | `rgba(44,36,24,.6)` | 副文字/注释 |
| `ac` | `#c45a3c` | 主强调（砖红，书脊色） |
| `ac2` | `#8b6b4a` | 二级强调（棕金，皮革色） |
| `green` | `#5a8a6a` | 通过/正面 |
| `blue` | `#4a7a8c` | 链接/信息 |
| `red` | `#b84a3a` | 警告/错误 |

**禁忌**：不用纯黑 `#000`、不用纯白 `#fff`、不用荧光色、不用饱和度 > 80% 的颜色。

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| serif（主） | `Georgia, 'Noto Serif SC', 'Hiragino Mincho ProN', serif` | 标题/引用/大字 — **这个主题 serif 是主角** |
| sans | `'Helvetica Neue', 'PingFang SC', system-ui, sans-serif` | 正文/说明/UI 元素 |
| mono | `'SF Mono', 'JetBrains Mono', Consolas, monospace` | 仅代码/数据，不用于正文 |

## 字号（px @ 1920x1080）

| 级别 | px | font | weight | 用途 |
|------|-----|------|--------|------|
| display | 120 | serif | 400 | 封面大字 |
| h1 | 80 | serif | 400 | 主标题 |
| h2 | 56 | serif | 400 | 章节标题 |
| h3 | 40 | sans | 500 | 卡片标题 |
| body | 32 | sans | 400 | 正文 |
| body-sm | 26 | sans | 400 | 辅助正文 |
| caption | 22 | sans | 400 | 注释/标签 |

## 网格（px @ 1920x1080）

```
安全边距：left=120 right=120 top=100 bottom=100
可用区域：1680 x 880 (x: 120→1800, y: 100→980)
中心点：x=960 y=540
主内容区：x=120 y=140 w=1680 h=760（上下各留 40 给 chrome）
chrome 顶部：y=0→100 (高 100px)
chrome 底部：y=980→1080 (高 100px)
```

## 视觉特征

- **直角**：不用圆角（禁止 border-radius > 2px），保持杂志感
- **细线**：分隔线用 `1px solid rgba(44,36,24,.12)`，不用粗线
- **serif 主导**：标题全用 serif，正文用 sans。serif italic 用于引用。
- **留白极重**：一屏只放一个核心信息，周围留 40%+ 空白
- **纸质纹理**：shader bg 可模拟轻微纸质颗粒（grain 极淡，alpha < 0.04）
- **暗模式变体**：bg=`#1e1a14` ink=`#e8e0d4` ac=`#d4694a`（同色相暗调）

## 组件规划（7 type 全覆盖）

| type | role | 组件 | 视觉主体 |
|------|------|------|---------|
| shader | bg | bg-paperGrain | 米白底 + 极淡纸质颗粒 noise（warm tone） |
| shader | bg | bg-warmGlow | 暖光渐变 vignette（中心亮边缘暗） |
| particle | bg | bg-dustMotes | 空气中漂浮的微尘（暖光中的灰尘颗粒） |
| particle | overlay | fx-inkSplatter | 墨水飞溅效果（书法/水墨风） |
| motion | overlay | fx-pageFlip | 翻页动效（纸张翻转 + 阴影） |
| motion | overlay | icon-quoteOpen | 左引号 " 的 pop 入场 |
| dom | content | content-editorial | 杂志排版卡片（大 serif 标题 + 正文 + 图注） |
| dom | content | content-pullQuote | 大号 serif italic 引文 + 来源 |
| dom | text | text-chapterTitle | 章节标题（serif 居中 + 细横线） |
| dom | chrome | chrome-bookSpine | 底部书脊栏（系列名 + 期号 + 页码） |
| svg | content | data-compactChart | 迷你折线图/柱图（editorial 内嵌数据可视化） |
| canvas | bg | bg-linenTexture | 亚麻布纹理底（canvas 2D 逐像素噪声） |
| media | bg | bg-photoBlur | 模糊照片底图（<img> + CSS filter blur） |

**13 个组件 × 7 种 type 全覆盖 + 每种 role 都有。**
