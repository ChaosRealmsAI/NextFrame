---
version: v0.2.0
phase: build-drafts
merged_at: 2026-04-21 17:15
author: main-agent(整合 3 POC 结论)
status: locked
inputs:
  - spec/poc/P-01-wry-glass/merged.md(wry+tao WebView glass)
  - spec/poc/P-02-tao-ipc/merged.md(tao 多窗+IPC)
  - spec/poc/P-03-wc-tokens/merged.md(WC+tokens 穿透)
  - spec/contracts/interfaces.json(37 CLI 契约)
  - spec/versions/v0.2/spec.json(27 scenarios)
---

# v0.2 Build 集成方案 · 3 POC 整合

## 架构(跨 crate 布局)

```
NextFrame (Cargo workspace)
├── crates/
│   ├── nf-cli/                     <- binary · clap 37 commands dispatcher · IPC client
│   │   ├── src/
│   │   │   ├── main.rs             <- clap App · subcommand 分派
│   │   │   ├── commands/
│   │   │   │   ├── projects.rs     <- list/show/create/rename/archive/delete
│   │   │   │   ├── episodes.rs
│   │   │   │   ├── clips.rs
│   │   │   │   ├── anchors.rs
│   │   │   │   ├── log.rs
│   │   │   │   ├── app.rs          <- open/ps/close/quit/screenshot/click/state/devtools/select/tab
│   │   │   │   └── utility.rs      <- help/doctor/version
│   │   │   ├── ipc_client.rs       <- Unix socket connect · NDJSON write/read · 复用 A-0006
│   │   │   ├── errors.rs           <- structured stderr + hint(A-0005)
│   │   │   └── help/              <- 37 命令 help 模板 + 例子 + common errors
│   │   └── Cargo.toml
│   │
│   ├── nf-shell/                   <- binary · wry+tao 主进程 · IPC server · window manager
│   │   ├── src/
│   │   │   ├── main.rs             <- EventLoop<UserEvent> + ctrlc(termination feature)
│   │   │   ├── window_manager.rs   <- HashMap<WindowId, Window> 路由 · 复用 A-0011
│   │   │   ├── webview.rs          <- wry with_ipc_handler · 复用 A-0012 · 禁 title 桥
│   │   │   ├── ipc_server.rs       <- interprocess local_socket tokio listener · NDJSON demux
│   │   │   ├── storage.rs          <- ~/.nextframe/ JSON 原子写 · serde_json · 复用 A-0004
│   │   │   ├── probe.rs            <- nf shell --probe CLI · evaluate_script for computed-style
│   │   │   ├── screenshot.rs       <- nf shell --screenshot CLI · wry canvas toBlob · 复用 A-0013
│   │   │   └── lifecycle.rs        <- 关最后窗保活 · cmd+q 真退 · socket 3 层清理(A-0007)
│   │   └── Cargo.toml
│   │
│   ├── nf-engine/                  <- v0.3+ · frame pure 渲染 · 本版不动
│   └── nf-runtime/                 <- v0.3+ · 3 模式 pixel 一致 · 本版不动
│
└── frontend/nf-components/         <- TS + Web Components · esbuild bundle
    ├── src/
    │   ├── index.ts                <- 入口 · customElements.define 8 tag
    │   ├── components/
    │   │   ├── _base.ts            <- NfBase extends HTMLElement · adoptedStyleSheets(A-0008)
    │   │   ├── topbar.ts
    │   │   ├── clips.ts
    │   │   ├── log.ts
    │   │   ├── timeline.ts
    │   │   ├── track.ts
    │   │   ├── clip.ts
    │   │   ├── anchor.ts
    │   │   └── inspector.ts
    │   ├── shell.css               <- 抽自 editor-v0.1.html · 全局 body aurora+grain
    │   └── storage.ts              <- fetch ~/.nextframe/<project>/<episode>.json · 通过 nf-shell
    ├── index.html                  <- <link rel=preload href=tokens.css>(A-0009 FOUC 解)
    ├── tokens.css                  <- 软链到 spec/design/tokens.css
    ├── package.json
    └── tsconfig.json
```

## 跨 crate 数据流

```
┌─────────────────────────┐     ┌──────────────────────────┐
│ AI / User 终端            │     │   nf-shell 主进程            │
│                         │     │                          │
│   nf projects create    │     │   tao EventLoop          │
│       │                  │     │      ↓                   │
│       ▼                  │     │   tokio IPC listener    │
│   Unix socket  ───────►  │────►│   (NDJSON · req_id)     │
│   NDJSON                 │     │      ↓                   │
│                         │     │   UserEvent::CreateProj  │
│                         │     │      ↓                   │
│                         │     │   storage.rs             │
│                         │     │      ↓                   │
│                         │     │   ~/.nextframe/          │
│                         │     │      └─ <slug>/          │
│                         │     │         ├─ project.json  │
│                         │     │         └─ episodes/    │
│                         │     │            └─ ep-01.json │
│                         │     │                          │
│                         │     │   ◄ resp(ok/data/error)  │
│                         │     └──────────┬───────────────┘
│                         │                │ (同进程)
│                         │                ▼
│                         │     ┌──────────────────────────┐
│                         │     │   wry WebView(每 window) │
│                         │     │                          │
│                         │     │   fetch ~/.nextframe/... │
│                         │     │       │ (file://)        │
│                         │     │       ▼                  │
│                         │     │   customElements         │
│                         │     │   <nf-topbar> <nf-clips> │
│                         │     │       ← 读 JSON · 渲染   │
│                         │     └──────────────────────────┘
└─────────────────────────┘
```

## 依赖锁定(Cargo.toml workspace)

```toml
[workspace]
members = ["crates/*"]

[workspace.dependencies]
# A-0011: wry + tao
wry = "0.55"
tao = "0.35"

# A-0006 + A-0007: IPC
interprocess = { version = "2.4", features = ["tokio"] }    # 必开 tokio feature
ctrlc = { version = "3", features = ["termination"] }       # 必开 termination feature(macOS SIGTERM)
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }

# 通用
clap = { version = "4", features = ["derive", "cargo"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
thiserror = "2"
directories = "6"                                            # ~/.nextframe/ 跨平台路径
once_cell = "1"

# DPR(A-0012)· 如需
objc2 = "0.5"
objc2-app-kit = "0.2"
```

## Frontend 依赖(package.json)

```json
{
  "devDependencies": {
    "typescript": "^5.6",
    "esbuild": "^0.24"
  }
}
```

无 runtime deps(零框架)。

## 关键设计决策(基于 POC ADR)

### 1. CLI 入口 → IPC 模型(A-0005 + A-0006)

- `nf open --project=X --episode=Y` → `nf-cli` clap 解析 → IPC connect Unix socket
- 若 socket 不存在 · `nf-cli` fork `nf-shell` 主进程 · 等 socket ready · 再 connect
- `nf-shell` 启后:tao EventLoop 主线程 · tokio runtime 子线程跑 IPC listener
- 每 IPC conn 独立 tokio task · `proxy.send_event(UserEvent::X { ack })` 注入主线程 · `rx.await` 拿 ack
- 响应 JSON 回 client · client 按 exit code 退

### 2. UI 数据流(A-0008 + A-0009)

- wry WebView 加载 `file://<bundle>/index.html`
- `index.html` head 有 `<link rel=preload as=style href=tokens.css>` · 防 FOUC
- JS bundle:`customElements.define('nf-*', class extends NfBase)` × 8
- Component `connectedCallback`:fetch `~/.nextframe/<project>/<episode>.json` · parse · render
- Storage 通过 nf-shell IPC · 不直接 fs(浏览器不能直接读 FS)

### 3. 验证内建(A-0013)

- `nf shell --probe --project=X --episode=Y --query='.topbar' --get=computed-style:background`
  - nf-cli IPC 发 UserEvent::Probe
  - nf-shell evaluate_script 执行 `getComputedStyle(...)` · 回 JSON
  - 返给 nf-cli stdout
- `nf shell --screenshot --region=topbar --out=tmp/x.png`
  - evaluate_script 跑 `document.querySelector('.topbar').getBoundingClientRect()`
  - tao window capture PNG by region(或 wry canvas.toBlob)· 写文件

### 4. S-07 ai_tools 调整(POC 发现)

原断言 `.topbar` backdrop-filter:blur(50px) → **改 `.app` -webkit-backdrop-filter**(实际位置)· `.topbar` 只测 background rgba(10,10,14,0.65)。build W-4 写 shell.css 保持不变(hifi 原设计)。

## 5 波 task 改进(基于 POC)

### W-1 基础 · 4 tasks(不变)

- T-01 clap 37 命令 dispatcher + 40 common errors codes
- T-02 IPC server + NDJSON + tokio listener + EventLoopProxy ack(按 A-0006)
- T-03 storage 原子写 + ~/.nextframe/ layout(按 A-0004)
- T-04 errors 体系 · stderr JSON + hint 字段(按 A-0005)

### W-2 CRUD · 5 tasks(不变)

T-05 ~ T-09(projects / episodes / clips / anchors / log 族)· 每 task 5-8 命令 · 共享 storage trait

### W-3 app shell · 3 tasks(按 A-0011 A-0012)

- T-10 wry+tao 主循环 · EventLoop<UserEvent> · ctrlc termination
- T-11 WindowManager · open/new-window/close/quit + 关最后窗保活 + cmd+q 真退
- T-12 app 控制 CLI · probe + screenshot + click + state + devtools + select + tab(按 A-0013)

### W-4 Web Components · 5 tasks(按 A-0008 A-0009 A-0010)

- T-13 shell.css 抽 + tokens.css preload 配置
- T-14 NfBase 基类 + adoptedStyleSheets + 直角 reset base sheet
- T-15 nf-topbar + nf-clips + nf-log
- T-16 nf-timeline + nf-track + nf-clip + nf-anchor
- T-17 nf-inspector

### W-5 集成 + help + sonnet · 4 tasks

- T-18 UI ↔ JSON 联动(fetch via IPC)
- T-19 help 自包含模板 · 37 命令 USAGE+FLAGS+EXAMPLES+COMMON ERRORS+RELATED
- T-20 doctor 环境自检
- T-21 **sonnet 盲测 S-26**(核心 acceptance)

### W-6 红队 + 收尾 · 4 tasks(不变)

T-22 ~ T-25(opus / ally 红队 + 补漏 + cargo check)

## 派遣策略

- **默认 ally gpt**(Bash `ally run --backend codex --model gpt-5.4 --dir <worktree>`)
- **复杂 task 必并行 ally+opus 双草稿**:T-02(IPC 架构)· T-10 / T-11(app shell)· T-14(NfBase)· T-21(sonnet 盲测)
- **每 task 独立 worktree** `.worktrees/v0.2-T{NN}-{SESSION}`
- **全后台** `run_in_background: true`
- **波次闸口**:每波末主 agent 亲验(跑 ai_tools CLI + BDD scenarios)· 过了进下波

## 不丢失:build.json tasks status 流转

```
pending → in-progress(executor 接)→ waiting-review(报完)→ done(主验过)→ (或 blocked)
```

主 agent 每 task notification 返 · Read evidence · 跑 ai_tools · 更新 status · commit。
