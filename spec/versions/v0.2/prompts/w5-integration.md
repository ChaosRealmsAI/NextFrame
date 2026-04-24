# W-5 预备 · Integration(合并 W-2 + W-3 + W-4 冲突 + 联调)

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-integration` (基于 v0.2-W1-ally · 含 handlers/mod.rs + main.rs 合并冲突待解)

**目标**: 解 W-2 CRUD 跟 W-3 app shell 的 merge 冲突 · 合并 W-4 前端(无 Rust 冲突) · 让 `cargo check --workspace` 零 warning · `cargo test --workspace --lib` 全过 · 实际 e2e test 跑通(CRUD + App 双通道 IPC)。

## 先做 merge 3 branches

```bash
# 已在 v0.2-integration · base=v0.2-W1-ally
git merge v0.2-W2-ally --no-ff -m "merge W-2 CRUD handlers"     # 预期 clean
git merge v0.2-W3-ally --no-ff -m "merge W-3 app shell"         # 预期冲突 handlers/mod.rs + main.rs
# 解冲突:
#   - handlers/mod.rs: keep W-2 全文 + 加 "pub mod app;" + 在 ComposeOpHandler::new 里加 AppOpHandler
#   - main.rs: keep W-3 tao EventLoop 结构 · 但 ipc_server::spawn_server_thread 接受 ComposeOpHandler + proxy 双参
git add -A && git commit
git merge v0.2-W4-ally --no-ff -m "merge W-4 Web Components"   # 纯前端文件 · 无冲突
```

## 双通道 IPC 架构(关键!)

W-3 的 main.rs 用 proxy.send_event(UserEvent::...) 把 **App op**(open/close/screenshot/click/state/devtools/quit)转到主线程 EventLoop 处理(因为要操作 tao Window)。
W-2 的 CRUD op(projects/episodes/clips/anchors/log)**不需要 Window · 直接 tokio 里 ComposeOpHandler.handle(req)** 处理。

**改 ipc_server.rs**:
```rust
// 原 W-3:spawn_server_thread(proxy) 只转 App op
// 改成:spawn_server_thread(proxy, compose_handler) · 接到 req 先 dispatch:
//   - if req.op in ["projects.list", "projects.create", ..., "log.tail", ...] → compose_handler.handle(req) 直接回 resp
//   - else if req.op in ["open", "close", "ps", "quit", "screenshot", "click", "state", "devtools"] → proxy.send_event(UserEvent::...)
//   - else → NfError::ValidationFailed "unknown op"
```

分流 op 的简单判断:从 `req.op` 字符串首段(projects. / episodes. / clips. / anchors. / log. → CRUD)or 单词(open/close/etc → App)。

## 验收

- `cargo fmt --all --check`
- `cargo check --workspace` · **零 warning**
- `cargo clippy --workspace --all-targets -- -D warnings` · 零 warning
- `cargo test --workspace --lib` · 18+ tests pass(W-1 4 + W-2 10 + W-3 4 + integration new 0-2)
- **e2e 实测**:
  ```sh
  cargo run --bin nf-shell &
  sleep 1
  ./target/debug/nf projects create --slug=demo --name='Demo'        # W-2 path
  ./target/debug/nf episodes create --project=demo --slug=ep-01 --name='一' --duration=10
  ./target/debug/nf open --project=demo --episode=ep-01              # W-3 path · 窗口弹
  ./target/debug/nf ps --project=demo --episode=ep-01
  ./target/debug/nf screenshot --project=demo --episode=ep-01 --out=tmp/i.png
  file tmp/i.png  # 确认真 PNG
  ./target/debug/nf quit
  ```

## 合并 W-4 前端

W-4 在 branch v0.2-W4-ally · 产物 `frontend/nf-components/{src,index.html,mock.json,...}` + `dist/index.js`(43.7KB)。无 Rust 冲突。Merge 后:

- 改 nf-shell webview 加载 URL:从 `file:///.../src/tao-webview-stub.html`(W-3 stub)→ `file:///<project root>/frontend/nf-components/index.html`
- 保证 `npm run build` 产 dist/index.js 之后 `nf open` 加载真 Web Components UI

可以留给 W-5 正式联调 · 本 integration 先保持 W-3 stub HTML · 让 cargo + tsc 各自过。

## 产出

- `INTEGRATION-REPORT.md` · 冲突点 + 解法 + cargo + e2e 命令全输出 · 测试数字
- NO git commit after merge commits(主 agent 统一 commit + push)

## 硬约束

- NO 加新依赖(用 W-1 已定 workspace deps)
- NO 改 W-4 前端代码(只可能改 webview URL)
- NO 改 v0.2 scope_out(不实现 frame pure 真渲染 / export / 真 AI)
- 时间预算 60-90min · blocker >15min 记 report 停
