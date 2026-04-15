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

## TypeScript / JavaScript Boundary (mandatory)

The project has two JS execution contexts. **Writing TS in the wrong zone = browser runtime crash.**

| Zone | Language | Why |
|------|----------|-----|
| **Node zone** (engine/, animation/apply.ts, CLI, filters/) | TypeScript — full syntax OK | Runs in Node with TS support |
| **Browser-inline zone** (scenes, animation/effects/, animation/shared.ts, design.js) | JS only — no TS type annotations | `stripESM()` inlines raw text into `<script>`, browser has no TS compiler |

**Browser-inline zone** = any file read by `stripESM()` / `buildAnimationBundle()` / `buildSharedPreamble()` and injected into HTML.

Rules:
- `src/nf-core/scenes/**/*.js` — keep `.js`, pure functions, no type annotations
- `src/nf-core/scenes/{ratio}/{theme}/*.js` — keep `.js`, default-export object, zero import (see scene v3 spec at `spec/standards/project/scene/scene-component-system.html`)
- `src/nf-core/animation/effects/*.ts` + `animation/shared.ts` — `.ts` extension OK but **must not contain type annotations** (`: string`, `interface`, `as const`, generics). Content must be valid JS.
- Everything else in `src/nf-core/` and `src/nf-cli/` — full TypeScript, write types freely

**How to check:** `grep -rn ': [A-Z]' src/nf-core/animation/effects/` — if any match, it'll break the browser build.

## Core Rules

- Do not add `unwrap`/`expect`/`panic`; workspace lints deny them. Use `#[allow(...)]` with comment on specific FFI functions only.
- Route all browser/native behavior through `nf-bridge`; no parallel IPC paths.
- Check scene contracts with `nextframe scenes <id>` before guessing timeline params.
- Prod files ≤ 500 lines, test files ≤ 800 lines.
- No `var` in JS (const/let only), no `console.log` in runtime code.
- No TODO/FIXME/HACK/XXX in production code.
- Scenes must not cross-import from modules/ directory.

## nf-guide is the SOLE state-machine truth (mandatory)

**Any AI doing scene / timeline / video work — `nf-guide` is the entry point. No exceptions.**

`src/nf-guide/` (Rust crate) reads markdown recipes from `src/nf-guide/recipes/{recipe}/`. Each recipe is a state machine of step-by-step prompts.

### Progressive disclosure (3 levels — AI 自己按需展开)

```bash
# L1 列表 — 有哪些菜谱
cargo run -p nf-guide

# L2 流程 — 看一个菜谱的整体步骤
cargo run -p nf-guide -- {recipe}

# L3 步骤 — 看某一步的完整 prompt
cargo run -p nf-guide -- {recipe} {step}
```

**这份 CLAUDE.md 不展开 recipe 内容**。recipes 会随产品演进不断增加（新主题、新输出格式、新 pipeline），写死在 CLAUDE.md 里就成了滞后的副本。**AI 用 CLI 现取现读**，永远是最新的。

### Maintenance rule (CRITICAL for future-AI usability)

**Every time you change scene contract / CLI command / pipeline behavior, update the matching recipe step.** Stale prompts = future AI follows wrong instructions = product breaks invisibly.

- Changed `nextframe scenes` output? Update the relevant step (run `nf-guide` to find it).
- Added a new ratio / theme? Update the discovery / check steps.
- New verification command? Update the verify section of the relevant step.
- Found a new pitfall? Append to the recipe's `pitfalls.md`.
- 加了新 recipe？放进 `src/nf-guide/recipes/{name}/` — L1 自动发现。

**Don't write parallel state machines elsewhere** (e.g., `src/nf-cli/src/commands/render/states/` was deleted — it was a duplicate that drifted). nf-guide is the only state machine.

### Design system per theme

Each scene theme has its own `theme.md` next to the components:

```
src/nf-core/scenes/{ratio}/{theme}/theme.md
```

Pure documentation. AI reads it before writing components. **Code does NOT import theme.md** — colors / fonts / grid are written directly into each component file (single source of truth = the component file itself).

Themes shipped: `9x16/interview-dark`, `16x9/lecture-light`, `16x9/anthropic-warm`.

## Key Paths

- Engine core: `src/nf-core/engine/` (timeline, build, validate, keyframes)
- Animation: `src/nf-core/animation/` (effects/ + transitions/)
- Scene components: `src/nf-core/scenes/{ratio}/{theme}/{role}-{name}.js` (single-file self-contained, see scene v3 spec)
- Scene state-machine prompts: `src/nf-guide/recipes/` (Rust binary `nf-guide` is the only entry point)
- Design system: `src/nf-core/scenes/shared/design.js` (TOKENS, GRID, TYPE, utilities)
- Pipeline recipes: `src/nf-cli/src/commands/pipeline/recipes/` (state machine prompts)
- CLI commands: `src/nf-cli/src/commands/` (timeline/, render/, project/, pipeline/, app/)
- Source pipeline: `src/nf-source/` (core/, download/, transcribe/, align/, cut/, source/)
- IPC dispatch: `src/nf-bridge/src/lib.rs` → `dispatch` / `dispatch_inner`
- Standards: `spec/standards/00-index.md`
- ADRs: `spec/cockpit-app/data/dev/adrs.json` (5 decisions)
- Competitor research: `spec/cockpit-app/analysis/competitors/` (11 dimensions, 300+ tools)
- Vision & analysis: `spec/cockpit-app/analysis/`
