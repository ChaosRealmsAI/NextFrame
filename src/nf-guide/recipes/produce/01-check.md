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

## 1.2 检查主题下有哪些组件（不要假设名字，CLI 查）

**别写死组件名。每个主题有自己的一套。用 CLI 发现当前实际可用的：**

```bash
# 列出该 ratio + theme 下所有 scene
node src/nf-cli/bin/nextframe.js scenes --ratio={ratio} | grep {theme}

# 看某组件接口
node src/nf-cli/bin/nextframe.js scenes {id}
```

### 典型组件分类（role 维度，每个主题都有）

| role | 职责 | 常见组件名（各主题不同）|
|------|------|---------|
| **bg** | 背景层（全屏渐变 + 暗角） | 每主题 1 个 |
| **chrome** | 品牌顶栏 / 底栏（集数 / 署名） | 每主题 1-2 个 |
| **content** | 主内容（卡片 / 列表 / 代码 / 类比） | 每主题 3-8 个 |
| **text** | 大标题 / 金句 | 每主题 1-3 个 |
| **overlay** | 小徽章 / 进度条 / 章节标 | 可选 |
| **data** | 图表 / 大数字 | 可选 |

### 视频嵌入（访谈类专用）

想嵌入真实 mp4 视频片段 → 该主题必须有 `type=media + videoOverlay:true` 的组件（通常名为 `videoArea`）。看 component/pitfalls.md 坑 11 完整流程。

### 缺组件怎么办

`nf-guide -- component` 进 4 步状态机做新组件。

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
