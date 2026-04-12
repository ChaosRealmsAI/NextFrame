# 02 · 模块契约

这一版只记录 v0.1.0 已落地的模块、数量和职责，不再保留早期的 aspirational 模块清单。

## v0.1.0 快照

| 项目 | 当前状态 |
|---|---|
| package | `nextframe-cli@0.1.0` |
| CLI 子命令 | 25 |
| AI tools | 12 |
| node tests | 74 |
| architecture tests | 6 / 6 pass |
| scene render functions | 33 registered |
| public scenes (`nextframe scenes`) | 32 |

## Scene 模块

真实状态需要区分“registry 中的 scene”与“对外公开的 scene 列表”：

- `src/scenes/index.js` 中有 33 个 registered render functions
- `listScenes()` 会过滤掉 `imageHero`
- 所以 `nextframe scenes --json` 当前返回 32 个 public scenes

### Registered scene categories（代码真相）

| 类别 | 数量 |
|---|---|
| Backgrounds | 7 |
| Typography | 3 |
| Shapes | 4 |
| Data Viz | 3 |
| Overlays | 4 |
| Series | 5 |
| Browser | 6 |
| Media | 1 |

合计：33。

### Public scene surface（CLI 真相）

| 类别 | 数量 |
|---|---|
| Backgrounds | 7 |
| Typography | 3 |
| Shapes | 4 |
| Data Viz | 3 |
| Overlays | 4 |
| Series | 5 |
| Browser | 6 |

合计：32。

注：
- `imageHero` 仍在 registry 中，作为隐藏的 media scene / extension example
- 浏览器 scene 现在是 `htmlSlide`、`svgOverlay`、`markdownSlide`、`lottieAnim`、`videoClip`、`videoWindow`

## CLI 模块

`bin/nextframe.js` 当前路由 25 个子命令：

### Render / inspect
- `validate`
- `frame`
- `render`
- `probe`
- `describe`
- `gantt`
- `ascii`

### Bake
- `bake-html`
- `bake-browser`
- `bake-video`

### Project / discovery
- `new`
- `scenes`
- `guide`

### Timeline ops
- `add-clip`
- `move-clip`
- `resize-clip`
- `remove-clip`
- `set-param`
- `add-marker`
- `list-clips`
- `dup-clip`

### Asset management
- `import-image`
- `import-audio`
- `list-assets`
- `remove-asset`

## AI tool 模块

`src/ai/tools.js` 当前实现 12 个工具：

| 工具 | 职责 |
|---|---|
| `list_scenes` | 返回 public scene META |
| `get_scene_meta` | 返回单个 scene META |
| `validate_timeline` | 跑 6 个 safety gates |
| `resolve_time` | 解析 symbolic time |
| `describe_frame` | 返回时间点语义事实 |
| `find_clips` | 按 scene / track / at / param 搜 clip |
| `get_clip` | 读 clip 原始详情 + resolved start |
| `apply_patch` | 执行 patch 后自动 validate |
| `assert_at` | 对时间点做结构化断言 |
| `render_ascii` | 渲染单帧 ASCII |
| `gantt_ascii` | 输出 ASCII gantt |
| `suggest_clip_at` | 返回时间点 active clips |

## Bake pipeline

v0.1 已经有完整的 bake-to-cache 工作流。

### 1. HTML bake

`nextframe bake-html <timeline.json>`

职责：
- 收集 `htmlSlide`
- 用 puppeteer 截图
- 写入 HTML cache PNG

关键 helper：
- `src/scenes/_html-cache.js`

### 2. Browser bake

`nextframe bake-browser <timeline.json>`

职责：
- 收集 `htmlSlide`
- 收集 `svgOverlay`
- 收集 `markdownSlide`
- 收集 `lottieAnim`
- 写入对应 PNG cache

关键 helper：
- `src/scenes/_browser-scenes.js`
- `src/scenes/_browser-documents.js`
- `src/scenes/_png-decode.js`

### 3. Video bake

`nextframe bake-video <timeline.json>`

职责：
- 扫描 `videoClip`
- 按 timeline fps 预提取视频帧
- 用 ffmpeg 写入 `/tmp/nextframe-video-cache`

关键 helper：
- `src/scenes/_video-cache.js`

### 4. Render time

真正 render 时，scene 不再发起浏览器/ffmpeg 工作，而是同步读缓存：
- browser scene 从 cache PNG 解码
- `videoClip` / `videoWindow` 读预提取帧

这就是 v0.1 保持 frame-pure 的关键。

## Asset management 模块

`src/cli/assets.js` 已经实现 4 个资产管理子命令：

| 命令 | 行为 |
|---|---|
| `import-image` | 向 `timeline.assets[]` 添加 image asset |
| `import-audio` | 向 `timeline.assets[]` 添加 audio asset |
| `list-assets` | 列出 asset，并标记 missing |
| `remove-asset` | 按 id 删除 asset |

v0.1 的资产管理仍然是“时间线内索引 + 文件路径引用”，不是独立资产库。

## 测试模块

当前 test 目录下共有 74 个 `test(...)`：
- `architecture.test.js`
- `scene-contract.test.js`
- `safety-gates.test.js`
- `ai-tools.test.js`
- `cli-render.test.js`
- `cli-timeline-ops.test.js`
- `cli-assets.test.js`
- `cli-export.test.js`
- `browser-scenes.test.js`
- `html-scene.test.js`
- `video-scene.test.js`
- `smoke.test.js`

## 小结

v0.1.0 的模块边界已经固定：
- scene library 已扩到 browser/video baked scene
- AI tool surface 已扩到 12 tools
- CLI 已扩到 25 个子命令
- 资产管理和 bake pipeline 都已经是正式模块，而不是 roadmap 占位
