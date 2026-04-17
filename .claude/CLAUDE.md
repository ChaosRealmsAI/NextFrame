# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入是 JSON，输出是可播放的 HTML 或 4K MP4。不限于自媒体，任何需要"让信息更容易理解"的场景都是它的用武之地：教育、产品演示、数据报告、内部培训、开源项目介绍。

技术栈：JSON timeline → 组件化多轨道渲染 → WKWebView 播放/编辑/录制三合一 → VideoToolbox 硬编码 4K MP4。核心原则：**Track = Component，AI 可写**；**getStateAt(t) 纯函数**；**一个 WebView 三种模式**（播放/编辑/录制）。

## v2.0 重构进行中（当前阶段：lint）

- **旧 src/ 已归档到 `legacy-v08/`**（不编译，保留参考）。只读不改。
- **新 src/ walking skeleton 已落地**（7 crate / 3 Rust + 4 JS/TS）：
  `nf-core-app` (JS) · `nf-core-engine` (TS) · `nf-tracks` (JS) · `nf-runtime` (JS) · `nf-shell-mac` (Rust) · `nf-recorder` (Rust) · `nf-cli` (Rust)。
- **workspace lints 基线已 deny** `unwrap_used / expect_used / panic / unreachable / todo / wildcard_imports`。**lint 阶段正扩展** arch-test / file-size / ban-frameworks / track-abi / cli-json 6 道门禁。
- **外围工具层（nf-tts / nf-source / nf-guide / nf-publish / nf-bridge）不在 v2.0 范围**。
- v2.0 最终架构见 **`spec/adrs.json#ADR-025`**（supersedes ADR-023；13 条 POC-locked 修订一次性入案）+ `spec/versions/v2.0/architecture/crates.json`。

## Build & Test

```bash
cargo check --workspace                      # 绿 (walking merged)
cargo clippy --workspace -- -D warnings      # 绿
cargo test --workspace                       # 绿 (含 tests/architecture.rs DAG 校验)
./target/release/nf build spec/fixtures/sample.json -o out/bundle.html   # stub 链路
./target/release/nf ai-ops describe | jq     # JSON 可解析
bash scripts/lint-all.sh                     # 6 道门禁（lint 阶段产出）
```

## 写代码前（强制）

1. 先读 roadmap：`cat spec/roadmap.json` → 确认当前版本阶段（v2.0 当前在 **lint**；walking 已 done）
2. 再读架构决策：**`spec/adrs.json#ADR-025`**（v2.0 最终架构 supersedes ADR-023）+ ADR-024（Track ABI）+ `spec/versions/v2.0/architecture/crates.json`
3. 查实际代码：`src/nf-*/` walking skeleton 已铺好，`CLAUDE.md` 在各 crate 下
4. 参考原北极星：`spec/versions/v1.0/pm-docs/ultimate-architecture.html`
5. 没走完 prototype → spec → architecture → poc → walking → lint 骨架 6 步，**不写产品代码**。

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
| `nf-core-engine` | **TypeScript** | Source → Resolved 编译 + bundle + byte-stable writeBack (ADR-025：POC P-008 推翻 Rust+WASM，TS 打平 native) |
| `nf-tracks` | JS | 组件库 + Track ABI + 用户热加载 (`user/`) |
| `nf-runtime` | JS | 浏览器运行时（一个 WebView 三模式） |
| `nf-shell-mac` | Rust | macOS 原生壳（objc2 + AppKit + WKWebView），4 面板桌面 |
| `nf-recorder` | Rust | Hidden WKWebView (alpha=1 + orderBack + cover) → SCStream → IOSurface (device-level alias, 零拷贝) → Metal tile shaders → VTCompressionSession HEVC 10-bit HDR10 + 手写 MDCV/CLLI SEI → mp4-atom fragmented MP4 (ADR-025) |
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
- **v2.0 架构决策**：`spec/versions/v2.0/architecture/` (crates.json + architecture.json + v20-rebuild.walkthrough.*)
- **北极星原稿 (v1.0)**：`spec/versions/v1.0/pm-docs/ultimate-architecture.html`
- **roadmap**：`spec/roadmap.json`
- **ADRs**：`spec/adrs.json`（v2.0 主 ADR：ADR-023 + ADR-024）
- **Standards**：`spec/standards/00-index.md`
- **BDD**：`spec/versions/v2.0/bdd/` (10 modules, 55 scenarios, 每场景 module+refs 已填)
- **竞品研究**：`spec/references/competitors/`

## 跨会话通讯

见 `~/.claude/rules/project-brain.md`（读写闭环）和 `rules/commit-format.md`（提交格式）。
新会话先读 git log / ADR (ADR-023/024) / roadmap / crates.json / ultimate-architecture.html，做完必须写回。
