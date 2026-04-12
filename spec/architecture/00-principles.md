# 00 · 原则

NextFrame v0.1.0 的设计仍然由 7 条原则约束。代码如果和这些原则冲突，应先改设计说明，再改实现。

---

## 1. Frame-pure is sacred

`renderAt(timeline, t) -> frame` 必须是确定性的。

禁止：
- scene 读 `Math.random()`、`Date.now()`、`performance.now()`
- scene 持有 top-level mutable state
- scene 之间互相调用上层逻辑
- scene 依赖上一帧结果

允许：
- 只读常量、查找表、字体注册
- 设计时预烘焙缓存，再在渲染时同步读取

v0.1 新增的浏览器 scene 也没有破坏这一条。`htmlSlide`、`svgOverlay`、`markdownSlide`、`lottieAnim`、`videoClip`、`videoWindow` 都走“先 bake 成 PNG，再在 render 时读缓存”的模式：
- `nextframe bake-html`
- `nextframe bake-browser`
- `nextframe bake-video`
- 运行时 helpers：`src/scenes/_browser-scenes.js`、`src/scenes/_png-decode.js`

也就是说，不纯的浏览器/视频求值发生在 bake 阶段；真正的导出/单帧渲染依然是 frame-pure。

---

## 2. JSON is source of truth

`timeline.json` 仍然是唯一真相源。

- CLI 读写 JSON
- AI tools 读写 JSON
- 测试输入是 JSON
- 渲染输入是 JSON

v0.1 runtime 不再声称“所有状态都只能在内存中不存在”。缓存目录是允许的，但它们是可重建产物，不是项目真相：
- `/tmp/nextframe-html-cache`
- `/tmp/nextframe-svg-cache`
- `/tmp/nextframe-md-cache`
- `/tmp/nextframe-lottie-cache`
- `/tmp/nextframe-video-cache`

---

## 3. CLI is the primary surface

v0.1 只有 CLI，没有 GUI；所以“CLI ≥ GUI”在当前版本里的真实含义是：**所有公开能力都先以命令行暴露**。

核心入口：
- `nextframe validate`
- `nextframe frame`
- `nextframe render`
- `nextframe probe`
- `nextframe describe`
- `nextframe gantt`
- `nextframe ascii`
- `nextframe scenes`
- `nextframe guide`
- `nextframe add-clip` / `move-clip` / `resize-clip` / `remove-clip` / `set-param`

---

## 4. AI is a first-class user

这条仍然成立，而且在 v0.1.0 更强了。

AI 的一等公民入口有两层：
- CLI onboarding：`nextframe guide`
- structured tool surface：`src/ai/tools.js` 的 12 个工具

现在的 12 个工具：
- `list_scenes`
- `get_scene_meta`
- `validate_timeline`
- `resolve_time`
- `describe_frame`
- `find_clips`
- `get_clip`
- `apply_patch`
- `assert_at`
- `render_ascii`
- `gantt_ascii`
- `suggest_clip_at`

---

## 5. Errors are values, not panics

这条仍然成立。

JS 公共路径统一返回结构化结果：
- `{ ok: true, value }`
- `{ ok: false, error: { code, message, hint?, ref? } }`

CLI exit code 约定：
- `0` 成功
- `1` 成功但有 warning
- `2` 错误
- `3` 用法错误

`test/architecture.test.js` 的 `arch-3` 和 `arch-6` 在持续守这条规则。

---

## 6. Layers don't leak

这条仍然成立，而且已经由自动化测试落实。

`test/architecture.test.js` 的 `arch-1` 对 `src/` 和 `preview/` 的 import 图做约束：
- `src/scenes/*` 只能向 scene helpers 或 canvas 依赖
- `src/engine/*` 只能依赖 engine 自身和 `src/scenes/index.js`
- `src/timeline/*` 只能依赖 engine
- `src/ai/*` 只能依赖 engine / timeline / scenes / views
- `src/cli/*` 只能依赖更低层
- `preview/*` 只能向下读 `src/*`

详见 [01-layering.md](./01-layering.md)。

---

## 7. Time is symbolic for AI, numeric at runtime

这一条相对最初版本有调整。

现在的真实约束是：
- runtime 接受 numeric time 和 symbolic time
- `resolveTimeline()` / `resolveExpression()` 会把 symbolic time 解析并量化到 `0.1s`
- AI patch surface 仍然强烈偏向 symbolic time
- `apply_patch` 明确拒绝 raw numeric `add-clip.start`

因此 v0.1.0 不是“任何地方都禁止 raw seconds”，而是：
- 人写 CLI 时可以传数字
- 时间解析器可以处理数字
- AI 自动修改 timeline 时，应优先写符号时间

---

## 禁用清单（v0.1 仍有效）

| 禁 | 原因 |
|---|---|
| scene 中的随机源 / 时钟源 | 破坏 frame-pure |
| `eval()` / `new Function()` | 安全差且不可审查 |
| index-based clip 引用 | 不稳定，AI 不可依赖 |
| 从下层 import 上层 | 打破层级约束 |
| 无结构化错误的公共接口 | AI 无法修复 |

---

## 引用

- [01-layering.md](./01-layering.md)
- [02-modules.md](./02-modules.md)
- [04-interfaces.md](./04-interfaces.md)
- [05-safety.md](./05-safety.md)
- [06-ai-loop.md](./06-ai-loop.md)
