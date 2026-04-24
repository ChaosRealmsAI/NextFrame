# W-3 · app shell · wry + tao + 多窗 + probe/screenshot/click/state/devtools CLI

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-W3-ally` (基于 v0.2-W1-ally · W-1 IPC+Storage 可用)

**目标**: `nf open/ps/close/quit` 真启动 Mac 窗口 · tao EventLoop + wry WebView + 多窗 + 3 层 socket 清理 · 加 nf-shell 内建 CLI `--probe` + `--screenshot`(self-verification rule · 禁 host screencapture)

## 必读

1. `spec/poc/P-02-tao-ipc/merged.md` · 架构(EventLoop<UserEvent> + Proxy + oneshot + UserEvent enum)
2. `spec/poc/P-02-tao-ipc/opus/src/` · 真跑代码参考(4/4 PASS · 复制 pattern)
3. `spec/poc/P-01-wry-glass/merged.md` · wry 初始化(wry 0.55 + tao 0.35 default · with_ipc_handler)
4. `spec/poc/P-01-wry-glass/opus/src/` · wry 真代码
5. `crates/nf-shell/src/{events,ipc_server}.rs` — W-1 已定义 UserEvent enum + OpHandler
6. `spec/versions/v0.2/drafts/merged.md` · §W-3

## Tasks

### T-10 · tao + wry 主循环

- `crates/nf-shell/src/main.rs`: EventLoop<UserEvent>::with_user_event() · EventLoopProxy 传给 IPC server
- `crates/nf-shell/src/webview.rs`: `create_window(proxy, project, episode)` → (tao Window + wry WebView) · load `file:///<bundle>/index.html` · with_ipc_handler(发 UserEvent::IpcFromJs)
- ctrlc termination · SocketGuard Drop · 已有

### T-11 · WindowManager(关键)

- `crates/nf-shell/src/window_manager.rs`:
  - `struct WindowManager { windows: HashMap<String, Window>, id_by_wid: HashMap<WindowId, String> }`
  - `open(project, episode) -> window_id`(按 project+episode 定位 · 已有则聚焦 · 无则新建)
  - `open_new(project, episode) -> window_id`(无条件新建 · 带 slug suffix e.g. w-1/w-2)
  - `close(window_id)` · `quit_all()`
  - Mac 标准:关最后 window 不退 app(主循环保活)· cmd+q / nf quit 才真退
  - 处理 WindowEvent::CloseRequested · 从 map 删 · `ControlFlow::Wait`
- 连到 OpHandler:`WindowOpHandler::open` → proxy.send_event(UserEvent::OpenWindow{...ack}) → await ack → 返 window_id

### T-12 · nf shell app 控制 CLI(nf-cli 侧)

按 interfaces.json:
- `nf open [--new-window] --project --episode [--clip] [--t]`
- `nf ps [--project] [--episode]`
- `nf close --project --episode [--window]`
- `nf quit`
- `nf screenshot --project --episode [--region=topbar|clips|log|timeline|inspector|preview|full] [--out]`
- `nf click --project --episode --selector=<css> [--window]`
- `nf state --project --episode --key=<path> [--window]`
- `nf devtools --project --episode --query=<sel> --get=<prop> [--action=append-style|remove|set-css-var] [--value]`
- `nf select --project --episode --clip=<slug>`
- `nf tab --project --episode --switch=<script|slice|voice|edit>`

实现:
- `crates/nf-shell/src/handlers/app.rs` · `AppOpHandler` 接 OpenWindow / CloseWindow / Screenshot / Click / StateQuery / DevtoolsQuery
- screenshot via wry `evaluate_script` 跑 `document.documentElement.outerHTML` 或用 tao window capture(参考 P-01 opus screenshot.rs 模式)· 禁 host `screencapture`
- probe = `evaluate_script("JSON.stringify(getComputedStyle(document.querySelector(...)))")`

### 注意(POC 发现)

- `.app` 有 backdrop-filter 不是 `.topbar`(S-07 ai_tools 要 query .app)
- wry DPR 返 1 · 若需要用 objc2 读 NSScreen(本版可暂用 devicePixelRatio 或 hardcode)
- IPC handler 必 `stdout.flush()`

## 验收(硬门)

- `cargo check --workspace` 零 warning
- `cargo clippy` 零 warning
- **e2e 真跑**:
  - `cargo run --bin nf-shell` 起 · 另终端 `./target/debug/nf open --project=next-frame --episode=ep-01`(可用 mock 数据)
  - Mac 窗口弹出 · 0.5s 内
  - `nf ps` 返 1 · `nf screenshot --region=topbar --out=tmp/x.png` 产真 PNG
  - `nf click --selector='body'` 不崩(body 是合法 selector)
  - `nf close` + `nf ps` 返 0 window 但 pid 在
  - `nf open` 再来 · 0.2s 内
  - `nf quit` · socket 清理
- unit tests 至少 3(WindowManager + AppOpHandler + screenshot fmt)

## 交付

- `crates/nf-shell/src/{window_manager, webview, handlers/app}.rs`
- `crates/nf-cli/src/commands/app.rs` 填完 IPC 调用
- `W3-REPORT.md` 项目根

## 硬约束

- **真启 Mac 窗口测** · 不许只 mock
- NO git commit
- NO Web Components(纯 Rust · HTML 等 W-4 合进来)
- 本波暂用**空 HTML**(`<html><body>nf-shell</body></html>`) · W-5 再接 W-4 的 dist
- 时间 60-120min · blocker >15min 记 report 停
