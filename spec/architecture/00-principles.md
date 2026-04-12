# 00 · 原则

NextFrame 的所有设计都从这 7 条不变式推导。**违反任何一条 = 重新讨论，不是写代码绕过**。

---

## 1. Frame-pure is sacred

`render(timeline, t) → frame` 是函数。给定 `(scene, t, params)` 永远返回相同像素。

**禁止**：
- scene 函数有 top-level mutable state
- scene 函数调用 `Math.random()`
- scene 函数读 `Date.now()` / `performance.now()`
- scene 函数写 module-scope 变量
- scene 之间互相调用
- scene 缓存上一帧的状态

**唯一允许的"状态"**：scene 模块顶层 `const` 配置、常量表、查找表、Image 对象 cache（输入相同则缓存命中相同）。

**违反检测**：lint 强制 grep 上述模式。CI 拒绝合入。

---

## 2. JSON is source of truth

`timeline.json` 是项目的全部状态。任何东西都能序列化进去。

- 文档保存 = 序列化 JSON
- 文档加载 = 反序列化 JSON
- AI 操作 = 修改 JSON
- 人操作（CLI 或 GUI）= 修改 JSON
- 撤销 = 替换 JSON
- 测试 = 输入 JSON 输出 PNG/MP4

**禁止**：
- 任何状态藏在内存里且不能存进 JSON
- 任何"内部" / "私有" / "运行时" 字段
- 任何依赖 file-system 的状态（除资产引用本身）

JSON schema 严格 versioned。schema 改 = bump major。

---

## 3. CLI ≥ GUI

任何功能必须先有 CLI 入口，GUI 是 CLI 的可视化包装。

- 编辑：`nextframe set-param ...` 必须能干 GUI inspector 干的事
- 渲染：`nextframe render --t 5 --out f.png` 必须能干 preview 干的事
- 导出：`nextframe export ...` 必须能干 GUI export 对话框干的事
- AI：`nextframe ai-edit "..."` 必须能干"AI 编辑器"干的事

**意义**：AI agent 是 first-class user，跟人类平权。CLI 通则 AI 通。

---

## 4. AI is a first-class user

设计每个功能时，问"AI 怎么用这个？" 而不是"人怎么用这个？"

- 命名：function/param 有语义不只是 magic name
- 错误：返回结构化 `{ok, errors[]}`，每条错误有 hint 字段告诉 AI 怎么修
- 操作：通过工具表（W5 的 7 个函数）而不是 GUI 自动化
- 验证：能用 metadata 解决就不用 vision，能 assert_at 就不用 LLM 推理
- 时间：AI 写关系（`{after:'X'}`），不写 raw seconds

**反推**：如果一个功能 AI 用着别扭，人多半也会别扭。

---

## 5. Errors are values, not panics

Rust 用 `Result<T, Error>`，JS 返回 `{ok: bool, value?, error?, hints?}`。

**禁止**：
- Rust `unwrap()` / `expect()` / `panic!` （除 main 入口）
- JS `throw` 给上层（除非 unrecoverable）
- silent failure（吞错误）

每个错误 type 有：
- `code: string`（机器可识别）
- `message: string`（人话）
- `hint?: string`（AI 修复建议）
- `ref?: string`（涉及的 clipId / sceneId / path）

---

## 6. Layers don't leak

5 层架构（见 [01-layering](./01-layering.md)），**严格单向依赖**。

- 上层 import 下层 ✅
- 下层 import 上层 ❌（一票否决）
- 同层互相 import ⚠️（少用）
- 跨 2 层 import ❌（必须经过中间层）

**违反检测**：架构测试脚本，每次 PR 跑。

---

## 7. 时间是符号，不是浮点

AI 永远不写 raw seconds。时间用关系表达：

```js
// ❌
{ start: 3.5 }

// ✅
{ start: { after: 'clip-headline', gap: 0.5 } }
{ start: { at: 'marker-drum-1' } }
{ start: { sync: 'subtitle-cue-3' } }
```

所有 raw 时间值 quantize 到 **0.1s 网格**（去浮点污染）。

display 一律 `mm:ss.f` 格式（`0:02.5` 不是 `2.5`）。

详见 [04-interfaces](./04-interfaces.md) 的 `SymbolicTime`。

---

## 禁用清单（直接写出来，不准例外）

| 禁 | 为什么 |
|---|---|
| Tauri / Electron | 框架 = 失去控制 |
| React / Vue / Svelte | 框架 = 失去控制 |
| Webpack / Vite / build step | 增加发版复杂度，AI 看不懂 build 产物 |
| TypeScript | 增加 build step，scene 作者门槛 |
| Cargo `unwrap()`/`expect()` | 违反原则 5 |
| Scene 里 `Math.random()` | 违反原则 1 |
| `eval()` / `new Function()` | 安全 + AI 不可读 |
| Magic numbers in scene params | 必须命名 |
| Index-based clip reference | 必须 stable id |

---

## 引用

- [01-layering.md](./01-layering.md) — 5 层架构 + 依赖图
- [02-modules.md](./02-modules.md) — 13 个模块的契约
- [03-conventions.md](./03-conventions.md) — 代码规范
- [04-interfaces.md](./04-interfaces.md) — 跨层 API
- [05-safety.md](./05-safety.md) — 防呆机制
- [06-ai-loop.md](./06-ai-loop.md) — AI 操作模型
