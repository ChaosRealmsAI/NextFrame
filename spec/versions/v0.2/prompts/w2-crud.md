# W-2 · CRUD 5 族实现(T-05 ~ T-09)

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-W2-ally` (基于 v0.2-W1-ally 分支 · W-1 基础已 merged · `Storage` trait + `NfError` + `IpcReq/Resp` + `OpHandler` 可用)

**目标**: 实现 projects / episodes / clips / anchors / log 5 族 25 CLI 命令 · OpHandler 真处理(不 NotImplemented) · 调 Storage load/save · 返 structured resp。

## 必读

1. `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-W2-ally/W1-REPORT.md` — W-1 产出 · 了解 Storage + IpcServer 接口
2. `spec/versions/v0.2/drafts/merged.md` · §W-2 章节
3. `spec/contracts/interfaces.json` · 5 族 25 命令详 args/flags/stdout_format
4. `spec/versions/v0.2/spec.json` · S-19/S-20/S-21/S-22/S-23(CRUD 5 族 scenarios)
5. `crates/nf-shell/src/storage.rs` — W-1 产的 Storage trait + atomic_write
6. `crates/nf-shell/src/ipc_server.rs` — OpHandler trait + StubHandler

## T-05 · projects 族(6 命令)

- `projects list` · `projects show --project` · `projects create --slug --name --description? --tags?`
- `projects rename --project --name` · `projects archive --project` · `projects delete --project --confirm`

实现:
- `nf-shell` 新加 `crates/nf-shell/src/handlers/projects.rs` · 实 `ProjectsOpHandler` · impl OpHandler
- `nf-cli` `commands/projects.rs` 调 ipc_client 发 req · parse resp
- 错误:slug 存在 → exit 6(NfError::SlugExists)· 不存在 → exit 5 + hint="nf projects list"
- archive = 移到 `~/.nextframe/.archive/<slug>/`(软删)· delete 必 --confirm · 否则 exit 7

## T-06 · episodes 族(6 命令)

同 projects · 但 crud 在 `<project>/episodes/<ep>.json`
- list 过滤 `--project` · show/create/rename/archive/delete 都 `--project --episode`

## T-07 · clips 族(5 命令)

- `clips list --project --episode [--track=scene|text|audio|trans]`
- `clips show --project --episode --clip`
- `clips create --project --episode --slug --label --track --start --end [--effects=csv]`
- `clips update --project --episode --clip [--start] [--end] [--label] [--effects]`
- `clips delete --project --episode --clip --confirm`

**关键**: `--start` `--end` 支持 anchor 表达式字符串(`feat-1-end + 0.5`)· **v0.2 存原字符串不 eval**(charter P11 · v0.3+ eval)· store trait 字段 `String` 即可

## T-08 · anchors 族(3 命令)

- `anchors list --project --episode` · 输出 `{"name": seconds, ...}`
- `anchors set --project --episode --name --time`
- `anchors unset --project --episode --name`

**关键**: unset 必校验 `episode.clips` 里无 `start/end` 包含该 name · 否则 exit 8 + hint "nf clips update 先改 start/end · 影响 clip: [a, b, c]"

## T-09 · log 族(3 命令)

- `log tail --project --episode [--limit=20] [--actor=AI|human] [--since=<iso>]`
- `log show --project --episode --id`
- `log create --project --episode --actor --desc --cli [--status]`

log 追加到 `episode.log[]` · 每条 `{id: "lg-<n>", time: ISO, actor, desc, cli, status}`

## 验收(硬门)

- `cargo fmt --all --check` · 零改动
- `cargo check --workspace` · **零 warning**
- `cargo clippy --workspace --all-targets -- -D warnings` · 零 warning
- `cargo test --workspace --lib` · 全 pass · 每 handler 至少 1-2 unit test(CRUD roundtrip + error cases)
- 每 handler `ProjectsOpHandler`/`EpisodesOpHandler`/`ClipsOpHandler`/`AnchorsOpHandler`/`LogOpHandler` 实 OpHandler
- 替换 nf-shell 主 loop 里的 StubHandler → Compose handler(按 op 路由到对应 OpHandler)

## 交付

- `crates/nf-shell/src/handlers/{projects,episodes,clips,anchors,log}.rs` + `mod.rs`
- `crates/nf-cli/src/commands/{projects,episodes,clips,anchors,log}.rs` 填完 IPC 调用
- `W2-REPORT.md` 项目根 · 每 handler 行数 + test 数 + 踩坑

## 硬约束

- NO git commit(主 agent 统一 merge)
- NO W-3 范围(tao + wry + WindowManager 留 W-3)· log 条目写 mock 数据(真 AI 触发 v0.3+)
- 依赖锁定(用 W-1 已定的 workspace deps · 别加新)
- 时间 60-90min · blocker >15min 记 report 停
