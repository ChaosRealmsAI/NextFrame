# W-1 · Phase 4 Build 基础层 · 4 tasks 合一(T-01~T-04)

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-W1-basic`(你的独立 worktree · 基于 main · 有 v0.1.1 Cargo workspace)

**目标**: 写 nf-cli 基础层(clap 分派 + IPC client + errors)+ nf-shell 基础层(IPC server + storage)· 让后续 CRUD / app-shell / UI 能挂上。

## 必读(顺序 · Read 全文)

1. `spec/versions/v0.2/drafts/merged.md` — **架构总图 · 依赖版本 · 关键设计决策**
2. `spec/versions/v0.2/spec.json` — 27 items(看 S-01 · S-04 · S-19 · S-22 · S-25 对应 W-1)
3. `spec/contracts/interfaces.json` — 37 CLI 命令 + IPC 5 op + Unix socket 路径
4. `spec/poc/P-02-tao-ipc/merged.md` — **复用 IPC 架构**(NDJSON + EventLoopProxy + oneshot + 3 层清理)
5. `spec/poc/P-02-tao-ipc/opus/src/` — **参考代码**(opus 写过真跑 4/4 PASS)· 拿 EventLoopProxy 模式直接抄

## 4 Tasks

### T-01 · `nf-cli` clap 框架(`crates/nf-cli/src/main.rs` + `commands/`)

- binary `nf` · clap 分派 37 subcommand(见 interfaces.json)
- 子命令模块化:`commands/projects.rs` / `episodes.rs` / `clips.rs` / `anchors.rs` / `log.rs` / `app.rs` / `utility.rs`(7 个 mod)
- 每子命令解析 args → 产 IPCRequest JSON → 调 `ipc_client::send(req)` → 拿 resp → 打印 JSON stdout + 设 exit code
- 入 args 缺失:clap 自动 error · exit 2
- **实现范围**:T-01 本身只写 dispatcher 骨架 + 3 个**非 CRUD 命令**(`version` / `help` / `doctor`)· CRUD 命令(projects/episodes/clips/anchors/log)stub 留给 W-2 实现
- BDD: S-01(nf open 骨架 · 本波只 stub) · S-24 help · S-27 doctor

### T-02 · IPC 双向(`crates/nf-cli/src/ipc_client.rs` + `crates/nf-shell/src/ipc_server.rs`)

- Socket path(两边共用常量):`nf_common::socket_path()` = `$XDG_RUNTIME_DIR/nextframe-$UID.sock`(macOS 用 `/tmp/nextframe-$UID.sock`)
- **Protocol**: NDJSON · 每行一 JSON · req: `{req_id, op, params}` · resp: `{req_id, ok, data, error}`
- **Client**(nf-cli ipc_client.rs):connect / write_line / read_line / parse · timeout 10s
- **Server**(nf-shell ipc_server.rs):
  - tokio multi-thread runtime 子线程跑
  - `interprocess::local_socket::tokio::Listener::bind(path)`(features=["tokio"] 必开 · Cargo.toml 加)
  - accept → 每 conn 独立 task → 读 NDJSON → `proxy.send_event(UserEvent::Op{...ack})` → `rx.await` → 写回 resp
  - socket 清理 3 层:`SocketGuard: Drop` + `ctrlc features=["termination"]`(必开 · macOS SIGTERM)+ 启动时 stale clean
- **UserEvent enum**(`nf-shell/src/events.rs`)先定义空 OpenWindow / CloseWindow / StateQuery / Screenshot / Quit · W-3 再填实现
- BDD: S-01 S-02 S-03 S-04(window ipc 本波只 stub · 下 W-3 实 WindowManager)

### T-03 · 存储层(`crates/nf-shell/src/storage.rs`)

- `~/.nextframe/` layout(用 `directories` crate 找 home):
  - `registry.json` · `{"projects": [{"slug", "name", "created", "last_modified"}]}`
  - `<project-slug>/project.json` · `{slug, name, description?, tags?, created, modified}`
  - `<project-slug>/episodes/<ep-slug>.json` · `{slug, name, duration, anchors: {}, clips: [], log: []}`
- **原子写**(`atomic_write<T: Serialize>(path, value) -> Result`):
  1. `write_all(path.with_extension("tmp"), serde_json::to_string_pretty(value))`
  2. `fs::rename(tmp, path)`
  3. 失败删 tmp
- **读 API**(Storage trait):`load_registry` / `load_project` / `load_episode` + `save_*` 配对
- **slug 校验**:小写 + `-` · regex `^[a-z][a-z0-9-]{0,63}$` · 不符 return structured error(T-04)
- BDD: S-19 S-20 S-21 S-22 S-23(文件 IO 底层 · 具体 CRUD 在 W-2)

### T-04 · 错误体系(`crates/nf-cli/src/errors.rs` + `crates/nf-shell/src/errors.rs`)

- **NfError enum**(thiserror):`UnknownProject{slug, hint}` · `UnknownEpisode{...}` · `SlugExists` · `SlugInvalid` · `SocketFailed` · `StorageFailed` · `ValidationFailed` · `NotImplemented(String)` ...
- **Exit codes map**:0 OK · 1 IPC/perm · 2 app crash · 3 selector not found · 4 not clickable · 5 unknown slug · 6 slug exists · 7 needs --confirm · 8 referenced
- **stderr format**(structured JSON):`{"error": "<type>", "detail": "<str>", "hint": "<str>", "exit_code": N}`
- **fromerror`**:`impl From<io::Error> for NfError` · `serde_json::Error` · `interprocess::Error`
- BDD: S-25(错误 hint flow)

## 依赖(按 drafts/merged.md Cargo.toml 锁定版本)

workspace Cargo.toml `[workspace.dependencies]` 添加(如没)。crate 级 Cargo.toml `.workspace = true` 引用。

```toml
[workspace.dependencies]
wry = "0.55"
tao = "0.35"
interprocess = { version = "2.4", features = ["tokio"] }
ctrlc = { version = "3", features = ["termination"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
clap = { version = "4", features = ["derive", "cargo"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
thiserror = "2"
directories = "6"
once_cell = "1"
regex = "1"
```

## 产出(你必做)

- `crates/nf-cli/` 代码(main / commands/mod.rs 分派 / ipc_client / errors + 3 dispatch stub)
- `crates/nf-shell/` 代码(events / ipc_server / storage / errors · main 先 stub)
- 修改 workspace Cargo.toml 加 deps
- 可选 `crates/nf-common/`(common types 复用)· 或每 crate 各写
- `cargo fmt` + `cargo clippy -- -D warnings`(lint 必过)
- `cargo check --workspace` 必过 **零 warning**
- 1 unit test per critical path:
  - `nf-shell/src/storage.rs` tests:registry roundtrip · project roundtrip · slug 校验
  - `nf-shell/src/ipc_server.rs` tests:socket cleanup trait
  - `nf-cli/src/errors.rs` tests:serialize NfError 到 stderr JSON
- `W1-REPORT.md`(项目根)列:每 task 做了啥 · 数字(LOC / test pass 数) · 踩坑

## 硬约束

- **不许 git commit**(主 agent 验过统一 commit)
- **不许写 W-2+ 范围**(CRUD 命令具体实现 · 不碰 nf-engine / nf-runtime)
- **依赖锁定**·不装 drafts/merged.md 外的 crate
- `cargo check --workspace` 零 warning 是硬门
- 时间预算:60-90 min · 超时 blocker 记 report

完成后产 W1-REPORT.md 包括:
- 改了哪些文件(行数)
- cargo check / clippy 输出摘要
- unit test 结果
- 哪些留 W-2+(避免 W-1 越界)
- 发现的问题或改进建议
