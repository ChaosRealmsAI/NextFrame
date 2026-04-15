# sv-interview · 9:16

> 设计语言文档。AI 写组件前必读。**代码不 import 此文件** — 所有值在组件文件里写死，改 token 用 sed 批处理。

---

## 气质

科技新闻国际范 · 深空蓝夜 · 电光蓝 + 琥珀金句。
配「硅谷访谈」合集：剪辑翻译海外顶级 AI 播客/访谈精华，原声 + 中英双语字幕。
给 AI 从业者 / 创业者（25-45 岁，关注行业趋势但英语听力不够流畅）在短视频场景一手获得硅谷 AI 大佬观点。

**信息密度高。字幕是主舞台——中文金色、英文白色、原声画面居中。** 不用灰色文字，不用 emoji，不做花字。

参考：Bloomberg Technology 新闻直播条 · Lex Fridman Podcast 官方剪辑 · Dwarkesh Podcast YouTube 片段的冷静质感。

---

## 配色（直接 hex 写到组件里）

### 背景层（深空蓝）
- `--bg`       `#0a0e1a`   主背景（页面底色）
- `--bg2`      `#0f1428`   二级面板（话题卡片、字幕底带）
- `--bg3`      `#161b2e`   三级表面（标签胶囊、底部品牌条）
- `--bg-in`    `#07091300` inset / 视频黑幕基底（纯黑）

### 文字（白 / 半透明）
- `--ink`      `#e8edf5`                   主文字（标题 / 英文字幕）
- `--ink-75`   `rgba(232,237,245,.75)`     次文字（说话人名、副标题）
- `--ink-50`   `rgba(232,237,245,.50)`     辅助文字（时间码、话题说明）
- `--ink-25`   `rgba(232,237,245,.25)`     脚注 / 占位 / 分割点

### 主调（电光蓝）+ 辅助（琥珀金）
- `--ac`       `#4da6ff`   主强调（频道/来源标注、章节标记、分割线）
- `--ac2`      `#7ec8e3`   浅蓝辅（标签胶囊文字、数据标注）
- `--gold`     `#f0a030`   金句 / 集数 / 中文字幕高亮
- `--gold2`    `#e8c47a`   金色柔调（进度条主色、金句底线）

### 状态色
- `--green`    `#4dff91`   通过 / 在线 / 正在播放
- `--red`      `#ff4d6a`   警告 / 重要

### 透明度变体（常用组合，组件复制粘贴）
- `--ac-10`     `rgba(77,166,255,.10)`
- `--ac-25`     `rgba(77,166,255,.25)`
- `--gold-20`   `rgba(240,160,48,.20)`
- `--gold2-10`  `rgba(232,196,122,.10)`
- `--gold2-40`  `rgba(232,196,122,.40)`
- `--gold2-60`  `rgba(232,196,122,.60)`
- `--bg-panel`  `rgba(10,14,26,.85)`

### 分割线 / 幽灵
- `--rule`     `rgba(232,196,122,.12)`   金色极淡水平分割
- `--rule2`    `rgba(255,255,255,.08)`   白色极淡分隔
- `--ghost`    `rgba(255,255,255,.04)`   幽灵底

---

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `system-ui, -apple-system, 'SF Pro Text', 'PingFang SC', sans-serif` | UI / 正文 / 英文字幕 |
| serif | `Georgia, 'Noto Serif SC', serif` | 金句 / 引用（斜体） |
| mono | `'SF Mono', 'JetBrains Mono', Consolas, monospace` | 时间码 / 数据 / 标签 |
| cn | `'PingFang SC', 'Heiti SC', sans-serif` | 中文字幕主字体 |

**禁止外部字体下载** — 组件 `assets:[]` 必须为空。系统自带 = 部署 0 依赖。

---

## 字号阶梯（1080×1920，9:16 竖屏输出）

预览 / 基础坐标按 540×960 计算（recorder DPR=2 放大到 1080×1920）。字号下方给的是**1080×1920 最终像素**；组件里用 `vp.width * ratio` 写成 viewport-relative。

| 用途 | px @ 1080×1920 | ratio = px / 1080 | 行高 |
|------|----|---------|------|
| Display（封面大金句） | 72 | 0.067 | 1.15 |
| H1（段落标题） | 60 | 0.056 | 1.2 |
| H2（章节标记、嘉宾名） | 48 | 0.044 | 1.25 |
| H3（系列名+集数） | 36 | 0.033 | 1.3 |
| CN-sub（中文字幕） | 54 | 0.050 | 1.4 |
| EN-sub（英文字幕） | 36 | 0.033 | 1.3 |
| Body 大（话题文字） | 30 | 0.028 | 1.55 |
| Caption（时间码 / 标签） | 22 | 0.020 | 1.4 |
| Mono（原片时间戳） | 24 | 0.022 | 1.5 |

字重：`400 / 500 / 600 / 700`。中文字幕用 600，标题用 700，英文字幕用 500。

---

## 网格（1080 × 1920）

- **顶部安全区**：y = 0..200（平台 UI 覆盖 + 来源条 100..150）
- **视频区**（16:9 嵌入 9:16）：x = 48..1032（宽 984），y = 316..870（高 554）
  - 对应 540×960 base：x = 24..516（宽 492），y = 158..435（高 277）
  - ffmpeg overlay：`overlay=48:316, scale=984:554`（DPR 2）
- **字幕区**：y = 900..1240（CN 居中 + EN 在下）
- **进度条**：y = 1290..1296（3px 细条 + 段分割竖线）
- **话题区**：y = 1310..1570（话题标签 + 说明 + tags 胶囊）
- **品牌条**：y = 1640..1700（中央 "OPC · 王宇轩"）
- **底部安全区**：y = 1700..1920（平台 UI + 水印覆盖）

### 左右安全边距
- 左右各 48px（content 区宽度 984）
- 特殊：进度条宽度 = 710px 居中，视频区宽度 = 984 撑满

---

## 暗角 / 纹理

默认配 `bg-spaceField`：
1. **径向暗角**：中心 → 四角 `rgba(0,0,0,.4)`
2. **星点微粒**：稀疏白点 rgba(232,237,245,.06)，frame_pure（seed-based）
3. **顶部柔蓝辉光**：`radial-gradient(at 50% 0%, rgba(77,166,255,.06), transparent 60%)`

组件 `bg-spaceField` 负责出这三层。其他组件不重复画。

---

## 图层顺序（z 从下到上）

| 层 | role | 例 |
|----|------|----|
| 0 | bg | bg-spaceField |
| 1 | content | content-videoArea / content-topicCard |
| 2 | text | text-bilingualSub / text-speakerLabel / text-goldenQuote |
| 3 | chrome | chrome-sourceBar / chrome-brandFooter |
| 4 | overlay | overlay-progressBar / overlay-chapterMark |

timeline 写入顺序自由，bg 自然在底；如需强制，用 `z_layer` 字段声明。

---

## 命名约定

- 文件名：`{role}-{name}.js`，camelCase，role 用前缀（bg/chrome/content/text/overlay/data）
- id 字段 = camelCase 名（不带前缀）— 例：文件 `text-bilingualSub.js` → `id: "bilingualSub"`
- 全局唯一性：同 ratio 同 theme 内 id 不重复

---

## 组件设计原则

1. **零 import** — 每组件单文件，颜色/坐标/工具函数全写死或内联
2. **frame_pure** — 同 t 同 params → 同画面，禁 Date.now / Math.random
3. **viewport-relative** — 用 `vp.width * 0.05` 不写死 `54`，preview 缩放 / 录制 DPR 2 都能对齐
4. **18 AI 理解字段必填** — intent ≥ 50 字真实推理
5. **assets: []** — 不引用外部 url，字体用系统自带
6. **字幕必须有标点符号** — 中文字幕在 render 里不能自动 trim 掉逗号句号

---

## 合集视觉差异（对照其他 theme）

| 合集 | 底色 | 强调色 | 气质 |
|------|------|--------|------|
| 数字员工内部爆料 | 纯黑 #08080a | 金色 #d4a030 | 机密档案 |
| claude-code-讲解（anthropic-warm） | 暖棕 #1a1510 | 赤陶橙 #da7756 | 壁炉旁 |
| **硅谷访谈（sv-interview）** | **深蓝 #0a0e1a** | **电光蓝 #4da6ff + 琥珀 #f0a030** | **科技新闻** |

---

## 改设计语言时

修改 hex / 字号 / 网格的步骤：

1. 改这个 `theme.md`
2. `grep -rn "{old-hex}" src/nf-core/scenes/9x16/sv-interview/`
3. `sed -i '' "s/{old-hex}/{new-hex}/g" *.js`
4. 跑 `node scripts/scene-smoke-test.mjs`
5. preview 自查每个组件

**没有 token 抽象层 — 改值是显式动作，git diff 看得清清楚楚。**
