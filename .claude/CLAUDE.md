# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入是 JSON，输出是可播放的 HTML 或 MP4。不限于自媒体，任何需要"让信息更容易理解"的场景都是它的用武之地：教育、产品演示、数据报告、内部培训、开源项目介绍。

技术栈：JSON timeline → 多层 HTML（scene 组件渲染）→ 浏览器播放 → WKWebView 并行录制 → MP4。核心原则：一个视觉元素 = 一个 layer。Frame-pure 渲染：任意时刻 t 可独立计算 f(t) → frame。

## Build & Test

```bash
cargo check --workspace          # Rust compilation check (11 crates)
cargo test --workspace           # Rust tests
cargo clippy --workspace -- -D warnings  # Clippy with zero warnings
bash scripts/lint-all.sh         # Full 10-gate lint (check + test + clippy + file size + JS lint)
```

Single crate test: `cargo test -p nf-bridge`

## CLI (primary interface)

```bash
node src/nf-cli/bin/nextframe.js --help      # Full usage guide (workflow, timeline format, layers, animations)
node src/nf-cli/bin/nextframe.js scenes      # List all 40+ scene components with metadata
node src/nf-cli/bin/nextframe.js scenes <id> # Inspect one component (params, types, ranges, defaults)
node src/nf-cli/bin/nextframe.js validate <timeline.json>  # 6 gates + overlap check
node src/nf-cli/bin/nextframe.js build <timeline.json>     # → single-file HTML
node src/nf-cli/bin/nextframe.js preview <timeline.json>   # Screenshots at key times
```

Recording (separate binary): `nextframe-recorder slide <html> --out <mp4> --width 1920 --height 1080 --fps 30 --parallel 8`

## Architecture (two languages, clear boundary)

**JS side:**
- `src/nf-core/` — engine core (timeline, animation, scenes, filters). Scene components are pure functions: `(ctx, t, params) → canvas draws`.
- `src/nf-cli/` — thin CLI shell (commands only, imports from nf-core)
- `src/nf-runtime/` — browser runtime (web-v2/)

**Rust side:**
- `src/nf-shell-mac/` — macOS desktop shell (objc2 + AppKit + WebKit)
- `src/nf-bridge/` — JSON IPC for project, timeline, storage, export
- `src/nf-recorder/` — WKWebView parallel recording → VideoToolbox → MP4
- `src/nf-tts/` — TTS CLI (Edge + Volcengine backends)
- `src/nf-publish/` — multi-platform publisher (WKWebView tabs)
- `src/nf-source/` — source pipeline: download → transcribe → align → cut

**Data flow**: CLI writes JSON timeline → nf-core build bundles into HTML → recorder opens HTML in WKWebView → captures frames → VideoToolbox encodes MP4.

## Before You Write Code (mandatory)

1. **Read the relevant standard**: `cat spec/standards/00-index.md` → find the standard for your task → read it
2. **Read the ADR**: `cat spec/cockpit-app/data/dev/adrs.json` → check if there's a locked decision about what you're changing
3. **Read the BDD**: if working on a feature module, `cat spec/cockpit-app/bdd/{module}/bdd.json` → know the expected behavior
4. **Read the crate CLAUDE.md**: `cat src/nf-xxx/CLAUDE.md` → know the local rules

**Skipping these = writing code that may violate locked design decisions. If you don't find a relevant standard, say so — don't guess.**

## AI Self-Verification (use these, don't use screencapture)

The desktop app has built-in AI operation interfaces. **Always use these instead of external tools like screencapture or AppleScript.**

### Screenshot (product-internal, pixel-perfect)

```bash
# Quick screenshot of current state
cargo run -p nf-shell-mac -- --screenshot
# → saves to /tmp/nf-screenshot.png, then Read to inspect

# Full verification: auto-navigate all pages, screenshot each
cargo run -p nf-shell-mac -- --verify
# → /tmp/nf-verify-home.png, nf-verify-editor.png, nf-verify-pipeline.png, etc.

# Custom script: navigate + screenshot at specific points
cargo run -p nf-shell-mac -- --eval-script my-test.js
# Script can call: __screenshot("/tmp/my-check.png")
```

### Diagnose (JS functions, call via --eval-script)

```js
__nfDiagnose()         // App state: current view, project, episode, active tab, modals, actions
__nfEditorDiagnose()   // Editor state: scene count, engine loaded, timeline, tracks, playback
```

### Bridge IPC (45+ methods via bridgeCall)

Key methods for AI verification:
- `preview.bundle({ timeline })` — generate scene bundle for preview
- `preview.frame({ timelinePath, t })` — render frame at time t
- `compose.generate({ timelinePath })` — build HTML from timeline
- `timeline.load/save` — read/write timeline JSON
- `project.list/create`, `episode.list/create`, `segment.list`
- `fs.read/write/listDir` — filesystem operations

## Core Rules

- Do not add `unwrap`/`expect`/`panic`; workspace lints deny them. Use `#[allow(...)]` with comment on specific FFI functions only.
- Route all browser/native behavior through `nf-bridge`; no parallel IPC paths.
- Check scene contracts with `nextframe scenes <id>` before guessing timeline params.
- Prod files ≤ 500 lines, test files ≤ 800 lines.
- No `var` in JS (const/let only), no `console.log` in runtime code.
- No TODO/FIXME/HACK/XXX in production code.
- Scenes must not cross-import from modules/ directory.

## Pipeline State Machine (AI 做视频必读)

视频生产全流程由状态机驱动，提示词和坑记录在 `src/nf-cli/src/commands/pipeline/recipes/` 下。

**做视频前先读对应 recipe 的 step MD：**

| Recipe | 路径 | 用途 |
|--------|------|------|
| **produce** | `pipeline/recipes/produce/` | 从素材到 MP4 的完整生产 |

### produce 流程 (8 步)

| Step | 文件 | 做什么 |
|------|------|--------|
| 0 | `00-ratio.md` | 定比例 9:16/16:9 — 一切的起点 |
| 1 | `01-check.md` | 确认素材 + 检查该 ratio 下组件 |
| 2 | `02-scene.md` | 做缺失组件 + preview 截图验证 |
| 3 | `03-timeline.md` | 写 timeline JSON，字幕直接贴不转换 |
| 4 | `04-validate.md` | nextframe validate 参数门禁 |
| 5 | `05-build.md` | nextframe build + 自动截图 + AI 看图 |
| 6 | `06-record.md` | recorder 录制 + ffprobe 验证 |
| 7 | `07-concat.md` | 多段拼接（可选） |

**踩坑记录:** `pipeline/recipes/produce/pitfalls.md` — 10 个已知坑 + 修复方法

### 设计系统

`src/nf-core/scenes/shared/design.js` 是所有 scene 的单一真相源：
- `TOKENS` — 颜色（interview/lecture 两套）
- `GRID` / `GRID_16x9` — 布局网格（精确像素坐标）
- `TYPE` / `TYPE_16x9` — 字号/字重/字体
- `findActiveSub(segments, t)` — 字幕两级查找（segment→英文, cn[]→中文）

## Key Paths

- Engine core: `src/nf-core/engine/` (timeline, build, validate, keyframes)
- Animation: `src/nf-core/animation/` (effects/ + transitions/)
- Scene components: `src/nf-core/scenes/` (7 categories + meta.js + index.js)
- Design system: `src/nf-core/scenes/shared/design.js` (TOKENS, GRID, TYPE, utilities)
- Pipeline recipes: `src/nf-cli/src/commands/pipeline/recipes/` (state machine prompts)
- CLI commands: `src/nf-cli/src/commands/` (timeline/, render/, project/, pipeline/, app/)
- Source pipeline: `src/nf-source/` (core/, download/, transcribe/, align/, cut/, source/)
- IPC dispatch: `src/nf-bridge/src/lib.rs` → `dispatch` / `dispatch_inner`
- Standards: `spec/standards/00-index.md`
- ADRs: `spec/cockpit-app/data/dev/adrs.json` (5 decisions)
- Competitor research: `spec/cockpit-app/analysis/competitors/` (11 dimensions, 300+ tools)
- Vision & analysis: `spec/cockpit-app/analysis/`
