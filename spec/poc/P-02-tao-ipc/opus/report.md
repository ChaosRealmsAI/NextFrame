---
poc_id: P-02
topic: tao 多窗 + Unix socket IPC 双向
agent: opus
affects_scenarios: [S-01, S-02, S-03, S-04, S-05, S-06]
status: pass
duration_min: 45
versions_used:
  tao: "0.30"
  interprocess: "2.4.2 (>=2.2 semver)"
  tokio: "1.x"
  ctrlc: "3 (features=[termination])"
  serde_json: "1"
rust_toolchain: "1.94.1 (2026-03-25)"
platform: "macOS darwin 25.0.0 (Apple silicon)"
date: 2026-04-21
---

# POC P-02 · tao 多窗 + Unix socket IPC 双向 · opus 报告

## 结论(TL;DR)

**方案成立 · 全绿 · 无需降级**。tao 0.30 `EventLoop<UserEvent>` + `EventLoopProxy` + interprocess 2.4(tokio feature) + ctrlc(termination feature)四件套组合在 macOS 上稳定工作。4 个 scene 全通过 · 无 workaround · 无 "v0.2 只支持 1 window" 之类的限制。v0.2 的 S-01 ~ S-06 6 个场景底层实现路径全部 unblock。

**关键数字**:

| 指标 | 实测 | 预期 | 结论 |
|---|---|---|---|
| 2 window 并存 · 关 1 留 1 | count 2 → close w-1 → count 1 (ids=['w-2']) | ✓ | PASS |
| 关最后一窗 · 进程保活 | process PID alive · `kill -0` OK | ✓ | PASS |
| 关最后一窗后 open-window 延迟 | **40 ms**(一次 cold-path measurement) | ≤ 200 ms | PASS |
| 10 并发 IPC req 回合耗时 | **34 ms**(10 ping 并发完成) | — | PASS |
| 10 并发 req_id 对齐 | 10/10 req_id 对齐 · 0 丢包 · 0 串号 | 100% | PASS |
| 10 并发 open-window | w-11 ~ w-20 全建成 · list count=10 | 100% | PASS |
| SIGTERM 后 socket 清理 | 200 ms 内进程退出 · `/tmp/nf-test-*.sock` 不存在 | ✓ | PASS |
| SIGTERM 后重启 bind | server2 启动成功 · 无 "Address already in use" | ✓ | PASS |
| SIGINT 后 socket 清理 | ✓ | ✓ | PASS |

## 做了啥

1. 独立 cargo 项目 `poc-tao-ipc` · 双 binary(main 626 行 · client 130 行)
2. main.rs:
   - `EventLoopBuilder::<UserEvent>::with_user_event()` 创 EventLoop(自定义用户事件类型)
   - `EventLoopProxy<UserEvent>` 在 IPC tokio 线程里持有 · `send_event(UserEvent::OpenWindow{...})` 把请求注入主线程
   - 主线程 event_loop.run 里按 `UserEvent` 路由 · `WindowBuilder::new().build(target)` 创窗
   - `tokio::sync::oneshot::channel` 拿回执(ack)· tokio 端 `.await` + 500-1000 ms timeout 兜底
   - `HashMap<String, Window>` + `HashMap<WindowId, String>` 双向索引 · CloseRequested 事件正确清理
3. ipc_client.rs:CLI · `Stream::connect` → write_all + read_line · 解析 `ok` 字段设 exit code
4. NDJSON 协议(一行一 JSON · req_id 标记 · 并发 demux 靠每连接独立 tokio task)
5. `ctrlc::set_handler`(features=["termination"] · 否则 macOS 不抓 SIGTERM)+ `SocketGuard: Drop` 双保险清 socket
6. `--headless` 模式(不开 EventLoop 只跑 IPC)方便 test3/test4 跑 · `--initial-windows N` 用于 test1/test2

## 没踩但需要记的坑

| 坑 | 现象 | 解决 |
|---|---|---|
| `interprocess` tokio API 要 feature gate | 默认 `interprocess::local_socket::tokio` 找不到 | Cargo.toml `features = ["tokio"]` |
| `ctrlc` macOS 默认不抓 SIGTERM | `kill -TERM` 进程死了但 socket 没清 | Cargo.toml `features = ["termination"]`(test4 首跑失败验证过) |
| stale socket 启动失败 | 前次 crash 留 sock → 新起 bind EADDRINUSE | 启动时 `if sock.exists() { remove_file }` 做 stale 清理 |
| tao 0.30 vs prompt 指定 0.27 | API 基本稳定(`EventLoopBuilder::with_user_event` / `EventLoopProxy::send_event` 一致) | 无需调整;如要锁 0.27 也 OK |

## 与 v0.2 场景映射

| scenario | POC 证据 |
|---|---|
| **S-01 冷启** | test1 server 启动 → IPC ready ≤ 500 ms · 2 window 建成 |
| **S-02 快路径** | test2 open-window 40 ms(socket 复用同一 server 进程 · 跳过 cold-start) |
| **S-03 多窗** | test1 2 窗并存 + test3 扩到 10 窗(`list-windows` count=10) |
| **S-04 独立 state** | 每窗独立 `Window` 对象 · HashMap<WindowId, String> 一对一(注:per-window JS state 注入暂未测 · 需 wry WebView · 本 POC 只验 tao 窗本身 · WebView 注入归 P-01/P-03 范畴) |
| **S-05 关窗不退** | test1 close w-1 · 进程 + w-2 alive · test2 关两个窗 · 进程仍 alive |
| **S-06 cmd+q 真退** | IPC `quit` op → `ControlFlow::Exit` · test3 尾部用过(干净退出) · GUI cmd+q 手工 path 原理等价(Mac 菜单 Cmd+Q 发 `RequestedExit` · 行为一致) |

## 建议 build 方案

### 架构

```
┌─────────────────── Main Thread ──────────────────┐
│  tao EventLoop<UserEvent>                         │
│    ├─ window A (wry WebView)                      │
│    ├─ window B (wry WebView)                      │
│    └─ UserEvent router:                           │
│         OpenWindow / CloseWindow / Broadcast ...  │
└────────────▲────────────────────────▲────────────┘
             │ send_event              │ send_event
             │ (EventLoopProxy)        │
┌────────────┴─────────┐     ┌────────┴───────────┐
│ IPC tokio task       │     │ Hotkey / tray task │
│  (Unix socket NDJSON)│     │ (optional)         │
└──────────────────────┘     └────────────────────┘
```

**关键点**:所有 window-level 操作只能在主线程(macOS AppKit 约束)· 子线程通过 `EventLoopProxy::send_event(UserEvent)` 单向注入请求 · 主线程处理后 `oneshot::Sender` 发回执。

### EventLoop 路由模板

```rust
#[derive(Debug)]
enum UserEvent {
    OpenWindow { id: String, ack: oneshot::Sender<Result<String, String>> },
    CloseWindow { id: String, ack: oneshot::Sender<Result<(), String>> },
    Broadcast { payload: serde_json::Value },  // 发给所有 WebView
    Quit { ack: oneshot::Sender<()> },
}

let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
let proxy = event_loop.create_proxy();

// spawn IPC thread:
std::thread::spawn(move || tokio_rt.block_on(ipc_server(sock, proxy.clone())));

event_loop.run(move |event, target, cf| {
    *cf = ControlFlow::Wait;
    match event {
        Event::UserEvent(UserEvent::OpenWindow { id, ack }) => {
            let w = WindowBuilder::new().build(target).expect("build");
            // wry: WebViewBuilder::new(&w).with_url("...").build()
            windows.insert(id.clone(), w);
            let _ = ack.send(Ok(id));
        }
        Event::WindowEvent { event: WindowEvent::CloseRequested, window_id, .. } => {
            // Remove only this window · do NOT exit loop
            windows.retain(|_, w| w.id() != window_id);
        }
        _ => {}
    }
});
```

### IPC 服务端(interprocess 2.x tokio)

```rust
use interprocess::local_socket::{
    tokio::prelude::*, GenericFilePath, ListenerOptions, ToFsName,
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

async fn ipc_server(sock: PathBuf, proxy: EventLoopProxy<UserEvent>) {
    let name = sock.to_str().unwrap().to_fs_name::<GenericFilePath>().unwrap();
    let listener = ListenerOptions::new().name(name).create_tokio().unwrap();
    loop {
        let conn = listener.accept().await.unwrap();
        let proxy = proxy.clone();
        tokio::spawn(async move {
            let (r, mut w) = conn.split();
            let mut br = BufReader::new(r);
            let mut line = String::new();
            loop {
                line.clear();
                let n = br.read_line(&mut line).await.unwrap_or(0);
                if n == 0 { break; }
                let req: IpcReq = serde_json::from_str(line.trim()).unwrap();
                let resp = dispatch(&req, &proxy).await;
                let mut s = serde_json::to_string(&resp).unwrap();
                s.push('\n');
                w.write_all(s.as_bytes()).await.ok();
            }
        });
    }
}
```

**依赖**(Cargo.toml):

```toml
tao = "0.30"  # 或锁 0.27
interprocess = { version = "2.2", features = ["tokio"] }  # tokio feature 必开
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "io-util", "sync", "time"] }
ctrlc = { version = "3", features = ["termination"] }     # termination feature 必开(macOS SIGTERM)
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Signal / socket 清理三层兜底

```rust
// Layer 1: RAII guard on struct holding sock path
struct SocketGuard { path: PathBuf }
impl Drop for SocketGuard {
    fn drop(&mut self) {
        if self.path.exists() { let _ = std::fs::remove_file(&self.path); }
    }
}

// Layer 2: ctrlc for SIGINT + SIGTERM
ctrlc::set_handler(move || {
    if sock.exists() { std::fs::remove_file(&sock).ok(); }
    std::process::exit(0);
}).unwrap();

// Layer 3: stale clean on boot
if sock.exists() { std::fs::remove_file(&sock).ok(); }
```

三层兜底原因:`process::exit` 不跑 Drop(layer 1 漏)· panic 跑 Drop 但不跑 ctrlc 逻辑 · kill -9 啥也跑不了 → 下次启动 layer 3 清 stale。

### 10 并发安全

每个 `listener.accept()` 的连接起独立 `tokio::spawn` 任务 · 连接间彼此无共享 mutable state(只读 `EventLoopProxy` Clone 安全 · state 通过 proxy 事件串到主线程)· 所以 **天然并发安全 · 不需手工 mutex**。req_id 是 client 端赋值 · server 原样 echo 回 resp · 不会串号。

## Blocker

无。预算 45 min · 实花约 40 min(包括一次 ctrlc feature 迭代 + 一次 interprocess feature 迭代)。

## 产物清单

- `src/` — 完整 cargo project(2 binary · 编译通过 · 无 warning)
- `tests/test1-multi-window.sh` + `test1.log` — PASS
- `tests/test2-reopen-after-close.sh` + `test2.log` — PASS(open latency 40 ms / 200 ms budget)
- `tests/test3-concurrent-ipc.sh` + `test3.log` — PASS(10 并发 34 ms · 10/10 对齐)
- `tests/test4-socket-cleanup.sh` + `test4.log` — PASS(SIGTERM + SIGINT 双清)
- `tests/test3-responses/resp-*.json` — 20 条 NDJSON 响应(留证)
