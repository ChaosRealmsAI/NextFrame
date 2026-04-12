# 03 · 代码规范

每条都可执行 — lint / format / test 强制。"应该" "建议" 不算规范。

---

## 语言

- **Rust** 用于：targets/wgpu, targets/wasm, surface/cli, editor/shell（v0.2）
- **JavaScript（ESM only）** 用于：targets/napi-canvas, engine/, scenes/, timeline/, workflows/, surface/bridge

**禁止 TypeScript**。理由：scene 作者门槛 + zero build。

---

## Rust

### Cargo workspace

```toml
[workspace]
members = ["nextframe-cli", "wgpu-target", "wasm-target"]
resolver = "2"

[workspace.package]
edition = "2021"
rust-version = "1.75"

[workspace.lints.rust]
unsafe_code = "deny"
unused_imports = "deny"

[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "warn"
panic = "deny"
unreachable = "deny"
todo = "deny"
wildcard_imports = "deny"
unused_async = "warn"
```

### 错误

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("clip {clip_id} not found")]
    ClipNotFound { clip_id: String },

    #[error("invalid time expression: {expr}")]
    InvalidTimeExpression { expr: String, hint: String },

    #[error("schema violation at {path}: {message}")]
    Schema { path: String, message: String, hint: Option<String> },

    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
```

每个 public 函数返回 `Result<T>`。

### 命名

- 文件：`snake_case.rs`
- 函数 / 变量：`snake_case`
- 类型 / trait：`PascalCase`
- 常量：`SCREAMING_SNAKE_CASE`
- 模块：`snake_case`

### 模块边界

- 每个 crate `lib.rs` re-export 公共 API
- 内部函数 `pub(crate)` 或 `pub(super)`
- 没有 `pub use crate::*`

### 测试

- 单测在源文件底部：`#[cfg(test)] mod tests { ... }`
- 集成测试在 `tests/` 目录
- frame-pure invariant 测试必须 100% 覆盖
- pixel hash 稳定性测试每个 target 必须有

### Format

- `cargo fmt` 强制
- 单行 ≤100 字符
- import 顺序：std → 外部 crate → 本地

---

## JavaScript

### 模块

- ESM only：`type: "module"` in package.json
- 不用 commonjs（no `require()`）
- 不用 bundler（每个文件独立可被 node import）

### 命名

- 文件：`camelCase.js`
- 目录：`kebab-case/`
- 函数 / 变量：`camelCase`
- 类（少用）：`PascalCase`
- 常量：`SCREAMING_SNAKE_CASE`

### 错误

**禁止 throw 给上层**。返回 `{ok, value, error, hints}` 对象：

```js
export function setParam(timeline, clipId, key, value) {
  const clip = timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === clipId);
  if (!clip) {
    return {
      ok: false,
      error: { code: 'CLIP_NOT_FOUND', message: `no clip ${clipId}`, ref: clipId },
      hints: [{ msg: 'use find_clips() to discover available clips' }],
    };
  }
  // ...
  return { ok: true, value: newTimeline };
}
```

**例外**：truly unrecoverable 系统错（OOM、磁盘损坏）可以 throw，但要 wrap 成 Error 实例。

### 函数纯度

scene 函数和 utility 函数 **禁止副作用**：

```js
// ❌
let lastFrame = null;
export function render(t, params, ctx) {
  lastFrame = t;  // top-level state
  ctx.fillRect(...);
}

// ✅
export function render(t, params, ctx) {
  // 只用入参
  ctx.fillRect(...);
}
```

副作用集中在 L3 workflows 层。

### 文件大小

≤300 行/文件。超限拆。

### Format

- 缩进：2 空格
- 分号：必加
- 引号：双引号 `"`
- 末尾换行
- ESLint config 强制

---

## Git

### Commit 格式

```
{type}({scope}): {summary}

{What changed in 1-3 sentences}
{Why this matters}

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

**type**：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `perf`

**scope**：`engine` / `scenes` / `cli` / `workflows` / `targets/wgpu` / 等等

**summary**：英文，imperative，≤70 字符

**body**：英文或中文，"why" 比 "what" 重要

### Branching

- `main` 永远绿（lint + test pass）
- 功能分支 `feat/<name>` 短命周期
- 合入 main 用 squash merge 保持历史干净
- 不准 force push main
- 不准 `--no-verify` skip hooks

### PR

- 一个 PR 一件事
- PR 描述包含：动机 / 改动清单 / 测试如何跑
- 至少 1 reviewer（v0.2 多人时）
- CI 必须绿才能合

---

## 注释

**默认不写。**

写就写"为什么"不写"是什么"：

```js
// ❌ 是什么
// 设置 x 为 100
const x = 100;

// ✅ 为什么
// 100 是 lint 强制的最大文件行数
const MAX_FILE_LINES = 100;
```

**public API 必须有 JSDoc**（function signature、@param、@returns、可选 @throws）。

**禁止**：
- "TODO" 留在 main 分支（开 issue 不留 comment）
- "HACK" / "FIXME" 留在 main 分支
- "// changed by xxx" 历史注释（git blame 是真相源）

---

## 命名语义

变量名要表达**意图**不是**类型**：

```js
// ❌
const arr = timeline.tracks;
const obj = { ... };
const num = 5.0;
const str = "hello";

// ✅
const tracks = timeline.tracks;
const headlineParams = { ... };
const fadeOutSeconds = 5.0;
const errorMessage = "hello";
```

布尔变量用 `is...` / `has...` / `can...`：

```js
const isVisible = true;
const hasError = false;
const canEdit = true;
```

事件回调 `on...`，命令式 `do...` / `start...`：

```js
function onClipSelected(clipId) { ... }
function startRender(timeline) { ... }
```

---

## CSS（仅 v0.2 GUI 用）

- CSS variables 而不是硬编码：`var(--bg)` 不是 `#0b0b14`
- BEM 命名：`.timeline-track__clip--selected`
- 一个组件一个 stylesheet
- 不用 framework（不用 Tailwind / Bootstrap）

---

## 文档

- markdown only
- 中文写细节，英文写 commit + 代码
- ASCII 图优先于 svg / png 图
- 表格优先于 bullet list
- 每个 doc 单文件 ≤500 行

---

## CI（v0.2 加）

`.github/workflows/check.yml`:
1. `cargo fmt --check`
2. `cargo clippy --workspace --all-targets -- -D warnings`
3. `cargo test --workspace`
4. `node test/run.mjs` (JS tests)
5. `bash scripts/check-layers.sh` (架构测试)
6. `bash scripts/lint-scenes.sh` (frame-pure invariant 检查)
7. `bash scripts/check-file-sizes.sh` (≤300 行)

任意 fail = PR 阻塞。
