---
poc_id: P-02
topic: tao 多窗 + Unix socket IPC 双向
affects_scenarios: [S-01, S-02, S-03, S-04, S-05, S-06]
merged_at: 2026-04-21 16:05
status: valid
confidence: 0.95
selected_proposal: opus(详细度 + 依赖 feature 踩坑记录完整)
ally_corroboration: 独立验证一致(结论 100% 重合)· ally 数字优于 opus(5ms vs 40ms)
---

# P-02 merged · tao 多窗 + Unix socket IPC

## 主 agent 亲验结论

两份独立报告(opus 45min · ally 31min)**结论 100% 一致 · 0 分歧**:

- tao 多窗 + Unix socket IPC 方案成立
- v0.2 **无需降级到 "1 window 限制"**
- S-01 ~ S-06 底层路径全部 unblock

## opus vs ally 对比

| 维度 | opus | ally-gpt | 一致? |
|---|---|---|---|
| 测试 | 4/4 PASS | 4/4 PASS | ✓ |
| 2 window 关 1 留 1 | PASS | PASS | ✓ |
| 关最后一窗保活 + open 延迟 | 40 ms | **5 ms**(opus 的 cold measure 更保守) | ✓ 方向一致 · 远低于 200ms 预算 |
| 10 并发 IPC req_id 对齐 | 10/10 · 0 丢包 · 34ms 回合 | 10/10 · 0 丢包 | ✓ |
| SIGTERM 清理 | PASS · 重启 bind OK | PASS · 重启 bind OK | ✓ |
| 依赖版本 | tao 0.30 / interprocess 2.4 / ctrlc 3 term | tao 0.27 / interprocess 2.2.3 / ctrlc 3 term | 🟡 小差 · 两版都 OK · 推荐 opus 的更新版 |
| 报告详细度 | 212 行 + 完整代码模板 + 踩坑记录 | 80 行 · 简洁 | — |
| 架构建议 | UserEvent 枚举 · oneshot ack · SocketGuard Drop | 同思路(EventLoopProxy + mpsc response) | ✓ |

**方向完全一致**:两 agent 独立跑 · 结论、架构、踩坑点一致 = **双视角无盲区 · v0.2 可放心按此推进**。

## 选定方案(进 adrs.json)

### 依赖版本(按 opus · 最新稳定)

```toml
[dependencies]
tao = "0.30"
interprocess = { version = "2.4", features = ["tokio"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
ctrlc = { version = "3", features = ["termination"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### 架构

```
Main Thread ──── tao EventLoop<UserEvent> ─── Window w-1, w-2, ...
                         ▲
                         │ EventLoopProxy<UserEvent>(Clone-able)
Tokio Runtime ─── local_socket::LocalSocketListener
                  每 conn 独立 task · read NDJSON · send_event · await ack
```

### 3 层 socket 清理(防 stale)

1. `SocketGuard: Drop`(panic/正常退出 · 自动删)
2. `ctrlc::set_handler` features=termination(macOS 默认不抓 SIGTERM · 必开)
3. 启动时 stale clean(`if sock.exists() { remove_file }`)

### UserEvent 枚举(Ack 模式)

```rust
enum UserEvent {
    OpenWindow { project: String, episode: String, clip: Option<String>, ack: oneshot::Sender<Result<String, String>> },
    CloseWindow { window_id: String, ack: oneshot::Sender<Result<(), String>> },
    Broadcast { event: String, data: serde_json::Value },
    ListWindows { ack: oneshot::Sender<Vec<WindowStatus>> },
    Quit { ack: oneshot::Sender<()> },
}
```

### NDJSON 协议

每行一 JSON · req_id correlation:

```json
{"req_id": 1, "op": "open-window", "params": {"project": "next-frame", "episode": "ep-01"}}
{"req_id": 1, "ok": true, "data": {"window_id": "w-1", "pid": 42817}, "error": null}
```

## 对 v0.2 scenarios 的支撑

| scenario | 支撑 |
|---|---|
| S-01 冷启 | IPC ready ≤ 500ms · 2 window 建成 |
| S-02 快路径 | open-window 5-40ms |
| S-03 多窗 --new-window | 10 窗并存验过 |
| S-04 独立 state(tao 层) | 每窗独立 Window + HashMap 索引 |
| S-05 关窗不退 | tao 默认行为 · mac 标准 |
| S-06 cmd+q 真退 | IPC quit op + socket unlink |

**S-04 per-window JS state 注入**归 P-01 范畴(wry WebView 层)。

## 风险 / 后续

- ✅ 无 blocker
- ⚠️ `ctrlc` features=termination 忘开 → test4 FAIL · 两 agent 都踩并抓 · build 写死
- ⚠️ `interprocess` features=tokio 忘开 → 编译错 · 同上 build 写死
- 📋 macOS-only 验过 · Linux/Windows v0.3+ 再跑

## Next(进 adrs.json)

- A-0006 · IPC 协议 + 多窗管理 · NDJSON + EventLoopProxy + oneshot ack
- A-0007 · socket 清理三层兜底 · SocketGuard Drop + ctrlc term + stale clean
- Build Phase 4 W-1 T-02 + W-3 T-10 T-11 直接复用此方案代码模板
