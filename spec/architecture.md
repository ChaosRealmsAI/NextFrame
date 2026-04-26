# NextFrame Architecture

## Architecture Principles · 架构原则

- **JSON 是 source of truth** · preview / 导出 / 验证都从同一份 compiled source 出 · 不让任何一路读自己的复制。
- **零框架 · 用库** · Rust 直调 platform API · 前端直调 Web Components · 禁 Electron / React / Vue / Tauri v1。
- **AI 自验先于人审** · `nf verify` / `nf capture` 是产品内建命令 · 走真实代码路径 · 不调外部 GUI 自动化。
- **模块单职责** · `nf-cli` 是 AI 接口 · `nf-shell` 是窗口 · `nf-recorder` 是导出 · 不互相伸手。
- **导出与预览同源** · 任何"先 MVP 用别的渲染"= 违 · 必须 day1 同源。
- **examples 是真示范** · 不是 fixture · 项目改 schema 必同步更 examples。

## Core Object Model · 核心对象模型

- **Project**(项目): 一个目录(`examples/<slug>/` 或 `~/.nextframe/<slug>/`)· 含多个 compositions 和 components。
- **Composition**(组合): 一个 v2 JSON 文档 · 含 `tracks[]` / `source` / `metadata`。
- **Track**(轨): composition 顶层一行 · 有 `time` / `z` / `component` / `params` / `style`。
- **Component**(组件): JS 模块 · 在 `examples/<slug>/components/<id>.js` · export `mount` / `update` · single-file · import-free。
- **Source**(编译源): `nf-project` 把 components 内联进 composition.source · preview / recorder 都读这一份。
- **VerifyReport**(自验报告): `nf verify` 输出 · 含 `checks[]` / `timeline.ascii` / `anchor_guide` / `screenshot_plan[]`。
- **ExportJob**(导出任务): `nf-shell` 主导 · 派 `nf-recorder` 子进程 · 含 `id` / `status` / `progress` / `diagnostics`。

## State Machine · 状态机

**Composition lifecycle**:
```
authored (raw JSON)
  → validated (nf composition validate · component registry / file existence / mount/update exports OK)
  → compiled (nf-project 内联 source · 进 composition.source)
  → previewed (nf-shell webview 渲染同一 source)
  → exported (nf-recorder 跑同一 source · 出 MP4)
```
任一步失败 → fail · 报 `next step ·` 行 · 不允许跳过下游。

**ExportJob lifecycle**:
```
pending → running → done | failed | cancelled
```
- `running` · `nf-recorder` 子进程跑 · `nf-shell` 监听 stdin/stdout JSONL events
- `done` · MP4 + sibling diagnostics.json 落盘
- `failed` · stderr 含 `next step ·` · diagnostics 含错点
- `cancelled` · `nf export-cancel --job-id` 触发 · SIGTERM 进程组

## Product Flow

```text
examples/*/compositions/*.json
  -> nf-project validates component registry
  -> nf-project compiles source
  -> nf-cli verify reports JSON/component/timeline/layout risks
  -> nf-shell opens desktop editor
  -> frontend/nf-components previews and edits
  -> nf-cli/nf-shell saves composition patches
  -> nf-recorder renders source to MP4
```

## Module Map

- `crates/nf-cli`: AI-facing command surface. It opens projects, inspects DOM, patches, validates and verifies compositions, starts export, checks export status, and cancels export jobs.
- `crates/nf-shell`: desktop app shell. It owns windows, WebView IPC, project handlers, export job state, and process cleanup.
- `crates/nf-project`: storage, component registry validation, and compiler for projects, episodes, and v2 compositions.
- `crates/nf-recorder`: export engine that drives the runtime and encodes MP4.
- `crates/nf-shell-mac`: macOS capture bridge used by recorder and shell capture paths.
- `frontend/nf-components`: zero-framework Web Components for topbar, timeline, preview, inspector, and editing events.
- `examples/v2-showcase`: current source example for high-ceiling component compositions.

## Dependency Direction

```text
nf-cli -> nf-project, nf-recorder, shell IPC
nf-shell -> nf-project, frontend assets, export child process
nf-recorder -> nf-shell-mac
frontend -> shell IPC only
examples -> consumed by project/runtime code
spec -> documentation and acceptance; no runtime dependency
```

Forbidden directions:

- frontend must not depend on Rust internals.
- recorder must not mutate composition JSON.
- export must not use a different source than preview/editor save paths.
- generated artifacts must not become source dependencies.

## Component Contract

V2 component tracks reference project-local source files:

```text
examples/{project}/components/{component-id}.js
```

`nf-project` owns the registry contract before preview/export:

- component ids use lowercase letters, numbers, dots, and hyphens.
- each referenced component file must exist under `components/`.
- component source must export `mount` and `update`.
- component source must remain single-file and import-free.
- `nf composition validate` emits structured JSON with available components, used components, track usage, observed params, warnings, and errors.

The compiler still embeds source into `source.components`; preview and recorder load that same compiled source so validation, preview, and export stay on one contract.

## AI Verification Contract

`nf verify --project --composition` is the composition-level QA entry for AI-authored JSON.

It runs without opening the editor:

- loads the project and v2 composition from storage.
- runs `nf-project` component validation.
- compiles the same source used by preview/export.
- emits `timeline.ascii` so AI can inspect timing without screenshots.
- emits `intent.overlap_policy=allowed-by-default`; multi-track overlap is normal video design and is not a verifier error by itself.
- emits `anchor_guide` so AI edits time with named anchors such as `intro`, `layers + 1s`, and `out` instead of raw numeric track times.
- emits `checks[]` with `ok` / `warn` / `error` levels for component, timeline, layout, and text risks.
- emits `screenshot_plan[]` with deterministic open/capture commands for visual review.

The verifier does not mutate composition JSON and does not replace real pixel review. Its job is to catch machine-readable JSON problems first, avoid false positives from normal layered design, and point AI to the exact track/clip that needs repair.

## Repository Skeleton

Root directories are intentionally few:

- `crates/`
- `frontend/`
- `examples/`
- `scripts/`
- `tests/`
- `spec/`
- `.github/`

Everything else should be hidden build cache, ignored scratch, or outside the repository archive.
