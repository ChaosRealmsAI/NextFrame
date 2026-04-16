# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入是 JSON，输出是可播放的 HTML 或 4K MP4。不限于自媒体，任何需要"让信息更容易理解"的场景都是它的用武之地：教育、产品演示、数据报告、内部培训、开源项目介绍。

技术栈：JSON timeline → 组件化多轨道渲染 → WKWebView 播放/编辑/录制三合一 → VideoToolbox 硬编码 4K MP4。核心原则：**Track = Component，AI 可写**；**getStateAt(t) 纯函数**；**一个 WebView 三种模式**（播放/编辑/录制）。

## v2.0 重构进行中（当前状态）

- **旧 src/ 已归档到 `legacy-v08/`**（不编译，保留参考）。这一版里只读不改。
- **新 src/ 是空骨架**，按 7 核心 crate 规划逐步填入：
  `nf-core-app` / `nf-core-engine` / `nf-tracks` / `nf-runtime` / `nf-shell-mac` / `nf-recorder` / `nf-cli`。
- **所有 lint 脚本与 `Cargo.toml` workspace 目前为空壳**，新 crate 加入后再启用。
- **外围工具层（nf-tts / nf-source / nf-guide / nf-publish / nf-bridge）不在 v2.0 范围**。
- 详细架构见 `spec/cockpit-app/module-understand/ultimate-architecture.html`。

## Build & Test

```bash
# v2.0 重构期间：workspace 暂为空，lint 脚本全部返回 0，仅作为骨架就位后的入口。
cargo check --workspace          # 当前无 member
bash scripts/lint-all.sh         # 当前 exit 0
```

新 crate 就位后，恢复：
- `cargo check --workspace` / `cargo test --workspace` / `cargo clippy --workspace -- -D warnings`
- `bash scripts/lint-all.sh` 按新骨架重建

## 写代码前（强制）

1. 先读 roadmap：`cat spec/cockpit-app/roadmap.json` → 确认当前版本阶段（v2.0 应在 prototype/spec/architecture）
2. 再读架构文档：`spec/cockpit-app/module-understand/ultimate-architecture.html`（v2.0 的北极星）
3. 读 ADR（如有）：`spec/cockpit-app/data/dev/adrs.json`
4. 没走完 prototype → spec → architecture → poc → walking → lint 骨架 6 步，**不写产品代码**。

## v2.0 五条公理（北极星）

1. **Anchor Timeline** — JSON 里用命名锚点 + 表达式 + 引用，避免硬编码毫秒数。
2. **Source/Resolved 两层** — 源文件存 Source，运行时派生 Resolved。
3. **`app.getStateAt(t)` 纯函数** — 任意时刻画面/字幕/选中/数据可独立计算。音频例外：预渲染素材引用。
4. **一个 WebView 三模式** — play（RAF 自驱）/ edit（冻结 t + 写回）/ record（Rust 驱动截帧）。
5. **Track = Component** — AI 可写；ABI 稳定、机器可验；单文件 `.js`，纯 `render(t, keyframes, viewport)`。

## v2.0 新 src/ 模块（规划）

| Crate | 语言 | 职责 |
|------|------|------|
| `nf-core-app` | JS | 引擎心脏，`getStateAt(t)` 纯函数 |
| `nf-core-engine` | TS | Source → Resolved 编译 + bundle |
| `nf-tracks` | JS | 组件库 + Track ABI + 用户热加载 (`user/`) |
| `nf-runtime` | JS | 浏览器运行时（一个 WebView 三模式） |
| `nf-shell-mac` | Rust | macOS 原生壳（objc2 + AppKit + WKWebView），4 面板桌面 |
| `nf-recorder` | Rust | WKWebView 截帧 → VideoToolbox → 4K MP4 |
| `nf-cli` | Rust | 最小 CLI（build / record / validate） |

**桌面 4 面板**：顶部操作栏 / 左预览 / 右参数面板 / **底部图形化多轨时间线（拖拽）**。

## JSON viewport 一对一

源 JSON 顶层固定 `viewport: { ratio, w, h }`。**一个 JSON = 一个比例**，不在 UI 切换。

## Track ABI（AI 可写组件契约）

- 单文件 `.js`，零外部 import
- 纯函数 `render(t, keyframes, viewport) → { dom?, audio? }`
- 必有 `describe()` 返回参数 schema（机器可验）
- 必有 `sample()` 返回典型用例
- 热加载目录：`src/nf-tracks/user/{category}/{name}.js`

## Core Rules（延续）

- Rust：禁 `unwrap`/`expect`/`panic`（workspace lints deny）。FFI 需 `#[allow(...)]` + 注释。
- 所有浏览器 ↔ 原生走**同一**的 IPC 通道；不另起平行路径。
- 产品源文件 ≤ 500 行，测试 ≤ 800 行。
- JS 禁 `var`，只用 `const`/`let`；运行时禁 `console.log`。
- 禁 `TODO`/`FIXME`/`HACK`/`XXX` 留存在产品代码。

## AI 自验证（产品内建，不靠外部权限）

- 截图：`cargo run -p nf-shell-mac -- --screenshot` → 写 `tmp/nf-screenshot.png`（新 shell 落地后启用）
- 查状态：`--eval-script` + 内建 `__nfDiagnose()` / `__nfEditorDiagnose()`
- 日志：关键路径结构化日志，AI `grep` 定位

## Key Paths

- **旧归档（只读参考）**：`legacy-v08/`（v0.8~v1.0 的完整 src，含 11 crates + scene 系统 + anchors + wysiwyg 等）
- **新 src/ 骨架**：规划见 `spec/cockpit-app/module-understand/ultimate-architecture.html`
- **架构北极星**：`spec/cockpit-app/module-understand/ultimate-architecture.html`
- **roadmap**：`spec/cockpit-app/roadmap.json`
- **ADRs**：`spec/cockpit-app/data/dev/adrs.json`
- **Standards**：`spec/standards/00-index.md`
- **BDD**：`spec/cockpit-app/bdd/`
- **竞品研究**：`spec/cockpit-app/analysis/competitors/`

## 跨会话通讯

见 `~/.claude/rules/project-brain.md`（读写闭环）和 `rules/commit-format.md`（提交格式）。
新会话先读 git log / ADR / roadmap / ultimate-architecture.html，做完必须写回。
