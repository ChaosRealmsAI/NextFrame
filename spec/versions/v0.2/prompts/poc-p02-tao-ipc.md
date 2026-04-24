# POC P-02 · tao 多窗 + Unix socket IPC 双向

**课题**: tao 单进程 EventLoop 管多 Window 是否稳?(关一个不影响其他 · 关最后一个保进程活 · 下次 IPC 'open-window' 0.2s 内新建 · Mac 标准行为) · Unix socket NDJSON 双向消息(req_id correlation · 10 并发 req 正确 demux) · socket 清理(SIGTERM / panic / normal quit 都要清 · 避免 stale socket)?

**背景 + affects_scenarios**: v0.2 启动 + 多窗体系(S-01 冷启 · S-02 快路径 · S-03 多窗 · S-04 独立 state · S-05 关窗不退 · S-06 cmd+q 真退)全压这 POC。若 tao EventLoop + interprocess crate 不能稳定跑 · 需换实现路径或限制多窗语义。

## 方案要求

**做 4 个 scene 验证**:

1. **基础多窗**:启进程 + EventLoop · 开 2 tao window · 各载 `about:blank` + 注入 `window.WINDOW_ID = "w-1"/"w-2"` JS 区分 · 关 w-1 不影响 w-2
2. **关最后一窗保活**:关 w-2 后 · EventLoop 不退 · sleep(100ms) · 再通过 IPC 收到 "open-window" 消息 · 新建 w-3 · 返回 ack
3. **IPC 并发 demux**:main 进程起 Unix socket server · 另起 CLI binary 并发 10 次 `cat ... > socket`(req_id=1..10)· server 回复 { req_id, ok, data } · client 全收到 · 无丢包 · 无串号
4. **socket 清理**:启后 `ls -la /tmp/nf-test-*.sock` 存在 · kill -TERM <pid> + wait · sock 文件自动删(Drop impl / ctrlc 处理)· 再启同 binary OK(否则 "Address already in use")

**工具**:
- Rust `tao = "0.27"` · `interprocess = "2.2"` · `tokio` · `serde_json` · `ctrlc`
- 压测工具:`parallel -j 10` 或 shell `for i in {1..10}; do echo '...' | nc -U socket & done; wait`

## 实施步骤

1. 在独立 worktree 里建 `cargo new poc-tao-ipc --bin` + 第二 bin `ipc-client`
2. main binary:
   - `EventLoop::new()` + `WindowBuilder::new().build(&event_loop)` × 2
   - async tokio runtime + `interprocess::local_socket::LocalSocketListener::bind("/tmp/nf-test-$UID.sock")`
   - 收到 JSON req → 按 req.op 路由 → 回 JSON resp
3. client binary:`LocalSocketStream::connect(...)` + `write_all(json)` + `read_to_end`
4. 写 4 shell test:`test1-multi-window.sh` / `test2-reopen-after-close.sh` / `test3-concurrent-ipc.sh` / `test4-socket-cleanup.sh`
5. 每 test 产 log + exit code

## 验收数字

- [ ] 2 window 并存 · 关 1 不杀 2(ps 查进程数不变)
- [ ] 关最后 1 窗 · 进程活 · 下次 open-window msg 0.2s 内 return ack
- [ ] 10 并发 IPC req · 全收到 resp · req_id 对齐 · 无乱序丢包
- [ ] SIGTERM 后 socket 文件不存在 · 重启 binary 能再 bind

**若不过**:
- 多窗不稳 → 记 "v0.2 可能限制 1 window · 多窗 v0.3+"
- IPC 并发丢 req → 记 "需加 mutex 或单线程 dispatch loop"
- socket 清理漏 → 记 "需 ctrlc 注册 handler"

## 输出要求

**路径**:
- opus:`spec/poc/P-02-tao-ipc/opus/`
- ally:`spec/poc/P-02-tao-ipc/ally/`

文件:
- `report.md` 带 frontmatter(同 P-01 格式 · affects_scenarios: [S-01, S-02, S-03, S-04, S-05, S-06])
- `src/` 完整可跑 Rust 项目(main.rs + ipc_client.rs + Cargo.toml)
- `tests/` 4 shell test 输出 log

## 时间预期

30-60 min · tao + IPC 是成熟组合 · 应该能快跑通。

## 关键参考

- tao 多 window 例子:`https://github.com/tauri-apps/tao/tree/dev/examples`(找 multiwindow.rs)
- interprocess crate 文档 · 注意 Windows vs Unix 差异(macOS = Unix 分支)
