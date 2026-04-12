# 06 · AI 操作模型

v0.1.0 的 AI loop 已经从早期 7-tool 草图扩到完整的 12-tool surface，并且有 CLI onboarding 入口。

## 入口

AI agent 进入项目后的首选入口是：

```bash
nextframe guide
```

`guide` 会把下面这些约束一次性讲清楚：
- timeline 结构
- 命名约定
- symbolic time 习惯
- scene 选择建议
- browser scene 需要 bake
- render flags
- safety gates

## AI 的 5 步工作流

v0.1 CLI guide 里固定的是这 5 步：

1. `THINK`：理解 brief，决定 timeline 结构
2. `SEARCH`：看 `nextframe scenes`、`nextframe gantt`
3. `PATCH`：用 timeline ops 或 `apply_patch`
4. `ASSERT`：用 `describe` / `validate` / `assert_at`
5. `RENDER`：用 `frame` / `ascii` / `render`

## AI 看到的 3 个低成本视图

### 1. Scene catalog

来源：
- `nextframe scenes`
- `list_scenes`
- `get_scene_meta`

当前对外 scene surface 是 32 个 public scenes，分布在 7 个 public categories：
- Backgrounds 7
- Typography 3
- Shapes 4
- Data Viz 3
- Overlays 4
- Series 5
- Browser 6

另外 registry 内还保留 1 个隐藏 `Media` scene：`imageHero`。

### 2. 时间结构视图

来源：
- `nextframe gantt`
- `gantt_ascii`

用途：
- 看轨道数量
- 看 clip 分布
- 看 chapter / marker
- 找空档位

### 3. 帧语义 / 粗预览

来源：
- `describe_frame`
- `assert_at`
- `render_ascii`
- `nextframe describe`
- `nextframe ascii`

用途：
- 不看 PNG 也知道某时刻有哪些 active clips
- 做结构化断言
- 用 ASCII 低成本看布局

## 当前 12 个 AI tools

| 工具 | 用途 |
|---|---|
| `list_scenes` | 列 public scene META |
| `get_scene_meta` | 读单 scene META |
| `validate_timeline` | 跑 safety gates |
| `resolve_time` | 解 symbolic time |
| `describe_frame` | 看某时刻语义 |
| `find_clips` | 通过 scene / track / at / param 搜索 |
| `get_clip` | 读取 clip 原始详情 |
| `apply_patch` | 执行 patch 并 validate |
| `assert_at` | 跑结构化断言 |
| `render_ascii` | 渲染 ASCII 单帧 |
| `gantt_ascii` | 输出 ASCII gantt |
| `suggest_clip_at` | 返回 active clips |

相对早期版本新增并已落地：
- `find_clips`
- `get_clip`
- `apply_patch`
- `assert_at`
- `render_ascii`

## 时间规则

v0.1.0 的真实时间规则是：

- AI add-clip 时优先用 symbolic time
- runtime 同时支持 numeric time 和 symbolic time
- `resolveTimeline()` 把 symbolic time 量化到 `0.1s`
- `apply_patch` 会拒绝 raw numeric `add-clip.start`

也就是说，“symbolic time”现在是 AI-facing editing contract，而不是 runtime-only restriction。

## Browser scene workflow

浏览器 scene 已经是正式能力，但使用顺序必须对：

### Browser scene 类型

- `htmlSlide`
- `svgOverlay`
- `markdownSlide`
- `lottieAnim`
- `videoClip`
- `videoWindow`

### 正确流程

1. 写 timeline / patch scene params
2. 先 bake
3. 再 frame / ascii / render

命令：

```bash
nextframe bake-html timeline.json
nextframe bake-browser timeline.json
nextframe bake-video timeline.json
```

原因：
- v0.1 runtime 通过读取 PNG cache 保持 frame-pure
- 不 bake 时，browser scene 会退回占位 / miss-cache 提示，而不是在线做不确定渲染

## AI mutation 闭环

最佳实践：

1. `find_clips` / `get_clip` 找目标
2. `apply_patch` 修改 timeline
3. `validate_timeline` 或直接读取 `apply_patch.value.validation`
4. `assert_at` 检查关键时间点
5. `render_ascii` 或 `nextframe frame` 做低成本确认

这里最重要的是第 2 步和第 3 步的联动：
- `apply_patch` 已自动 validate
- `apply_patch` 还会拒绝 raw numeric add-clip start

## 什么时候该用 CLI，什么时候该用 tools

推荐：
- 本地 agent / shell workflow：先 `nextframe guide`，再用 CLI
- 内嵌 agent / SDK workflow：直接调 `src/ai/tools.js`

两条路径共享同一套核心：
- 同一份 timeline schema
- 同一套 scene registry
- 同一套 safety gates
- 同一套 render / describe / gantt 实现

## 小结

v0.1.0 的 AI loop 已经稳定成型：
- entrypoint 是 `nextframe guide`
- tool surface 是 12 tools
- public scene surface 是 32 scenes
- browser scenes 必须先 bake 再 render
- patch path 自带 validate 闭环
