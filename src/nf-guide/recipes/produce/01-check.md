# Step 1: 确认素材 + 检查组件

## 1.0 先定主题（强制）

**开工第一件事**：用 AskUserQuestion 问用户"用哪个主题？"。用户回 "anthropic-warm" / "sv-interview" / 或其他已有 theme。

拿到主题名后**必读 3 份文件**：

```bash
cat src/nf-core/scenes/{ratio-dir}/{theme}/theme.md    # 视觉语言
cat src/nf-core/scenes/{ratio-dir}/{theme}/tone.md     # 话术风格（如有）
cat src/nf-core/scenes/{ratio-dir}/{theme}/RETRO.md    # 上次教训（如有）
```

- `theme.md` 缺 → 先跑 `cargo run -p nf-guide -- design` 建主题，再回来
- `tone.md` 缺 → 基于 theme.md 气质写一份或跳过（影响脚本质量，不阻塞）
- `RETRO.md` 缺 → 首次使用本主题，正常

**不读主题 = 视觉话术靠猜 = 做出来四不像**。

## 1.1 确认素材

根据视频类型检查输入素材是否存在。

### 有素材（访谈切片）

```bash
# 视频片段
ls clips/clip_01.mp4
ffprobe -v quiet -show_entries format=duration -of csv=p=0 clips/clip_01.mp4

# 翻译数据 — 必须有 segments 数组
node -e "
  const f = require('./translate/clip_01.fine.json');
  console.log('segments:', f.segments.length, 'duration:', f.clip_duration);
  const seg = f.segments[0];
  console.log('sample:', JSON.stringify({s:seg.s, e:seg.e, speaker:seg.speaker, cn_count:seg.cn.length}));
"
```

**检查 fine.json 结构：**
- `segments` 是数组
- 每个 segment 有 `s`(number), `e`(number), `speaker`(string), `en`(string), `cn`(array)
- 每个 cn 条目有 `text`(string), `s`(number), `e`(number)
- segment.cn 的时间范围在 segment.s 和 segment.e 之内

如果结构不对 → 停。这是上游管线的问题，不在 NextFrame 解决。

### 纯创作（讲解视频）

```bash
# 确认有脚本或数据文件
ls script.md    # 脚本
ls data/*.json  # 或数据文件
```

纯创作不需要 fine.json，但需要知道总时长和内容分几个阶段（phase）。

## 1.2 检查组件

```bash
nextframe scenes
```

### 9:16 需要 4 个（静态合并后）

| scene | 类型 | 作用 |
|-------|------|------|
| interviewChrome | **静态** | 背景+标题+元信息+品牌 — 全程不变的所有元素合在一个组件 |
| interviewVideoArea | **动态** | 视频嵌入框（recorder 叠加真实视频） |
| interviewBiSub | **动态** | 双语字幕（两级查找：segment→英文, cn[]→中文） |
| progressBar9x16 | **动态** | 进度条 |

**设计原则：** 全程不变的元素合成一个"chrome"组件，随时间变化的各自独立。减少 layer 数量，方便维护。

### 16:9 讲解（按需组合，不是全部都要）

| scene | 类型 | 作用 | 何时需要 |
|-------|------|------|---------|
| lectureChrome | **静态** | 背景+顶栏+进度条+水印 | 必选 |
| headlineCenter | **动态** | 全屏居中大标题（有淡入） | phase 1 标题 |
| codeTerminal | **动态** | 代码块（单个 pre） | 展示代码时 |
| flowDiagram | **动态** | 流程图（单个 svg） | 展示流程时 |
| lecturePanel | **动态** | 右侧说明面板 | 双栏布局时 |
| subtitleBar | **动态** | 底部字幕条 | 有配音时 |

**跟 9:16 一样的原则：** 不变的合成 chrome，变的各自独立。不需要全部组件 — 按内容选。

## 分支

- **全有** → 跳到 `nf-guide produce timeline`
- **缺组件** → 进 `nf-guide produce scene`

## 下一步

```bash
# 缺组件
nf-guide produce scene

# 组件齐全
nf-guide produce timeline
```
