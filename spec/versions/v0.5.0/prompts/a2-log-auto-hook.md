# A2 · log 自动 hook 所有 CRUD op

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.0-A2-log`(基于 v0.2-integration 开新分支)

**目标**: 让所有 CRUD op(projects./episodes./clips./anchors./log.)成功后**自动 append log entry** · AI 跑一条命令不用再补 `nf log create` · 一条就有记录。

## 现状 bug

`nf log tail --project=X --episode=Y` 返 `[]` 即使已跑 `projects create` / `episodes create` / `clips create` / `anchors set`。

原因:W-2 ally 实 `log create` 手动接口 + `log tail` 读接口 · 但 **CRUD handlers 未自动埋点** · 除非 AI 每 op 后手动 `nf log create --actor=AI --desc=...`。

## 干啥

### Step 1 · 定 log middleware 位置

查:
- `crates/nf-shell/src/handlers/mod.rs` → `ComposeOpHandler::handle(req)` 是 dispatch 入口
- 在每个具体 handler 成功 return 前 · 挂一个 log writer

### Step 2 · 实现 log middleware

方案 A(推荐 · 集中):在 `compose.rs` 的 `handle` 最后:

```rust
// 伪代码 · 具体看现有结构
let resp = match op {
    "projects.create" => projects::create(req),
    "episodes.create" => episodes::create(req),
    "clips.create" => clips::create(req),
    "anchors.set" => anchors::set(req),
    "anchors.unset" => anchors::unset(req),
    // ... 所有写操作
    "log.create" | "log.tail" | "log.show" => return <直接走 log handler>(req),  // log 自己不记
    _ => <其他>
};

// 成功后记 log(log op 本身不记防递归)
if resp.is_ok() && !op.starts_with("log.") && !is_read_op(op) {
    let _ = log::append_auto(LogEntry {
        actor: "AI",
        op: op.to_string(),
        project: req.project,
        episode: req.episode,
        slug: extract_slug(&req),
        desc: format!("{op} succeeded"),
        status: "ok",
        at: Utc::now(),
    });
}

resp
```

方案 B(分散):每个 handler 里 commit 前自己调 log · 重复但清晰。

**选 A**(集中 · DRY)· 但若嵌入复杂就 B。

### Step 3 · 读操作不记

`projects.list / projects.show / episodes.list / ... / log.tail / log.show` 这些读操作**不记** log(否则 tail 操作本身会记一条又拉一次 · 递归)。

实现:`fn is_read_op(op: &str) -> bool { op.ends_with(".list") || op.ends_with(".show") || op.starts_with("log.") }`

### Step 4 · log 格式扩展

现有 `log.create` 手动记 `{actor, desc, cli, status?}` · 自动记要加 `op + slug` 字段:

```json
{
  "id": "log-<ulid>",
  "actor": "AI",
  "op": "projects.create",
  "project": "demo",
  "episode": "ep-01",
  "slug": "demo",
  "desc": "projects.create succeeded",
  "cli": "nf projects create --slug=demo --name=...",
  "status": "ok",
  "at": "2026-04-21T17:50:00Z"
}
```

存储:`~/.nextframe/<project>/episodes/<ep>.log.json`(已有位置 · append 到 JSON array)或单独 log.jsonl。看现有 `log create` 怎么存就跟着存。

### Step 5 · 单测

在 `crates/nf-shell/src/handlers/log.rs`(或 compose tests)加 2 单测:
- `auto_log_on_project_create` · fake compose dispatch projects.create · 验 log tail 返 1 条 actor=AI op=projects.create
- `no_auto_log_on_read` · dispatch projects.list · 验 log tail 不增

### Step 6 · 回归

跑全套 `cargo test --workspace --lib` · 确保现有 18 测试仍 pass · 新 2 测试通过。

## 硬约束

- **不改 log.create 手动接口**(继续兼容 · AI 仍可手动 log)
- **不改 tail/show 读接口**
- **不加新依赖**
- `compose.rs` 改动控制在 < 80 行新增

## 验收

- `cargo check --workspace` 零 warning
- `cargo clippy -D warnings` 零 warning
- `cargo test --workspace --lib` · 20+ pass(原 18 + 2 新)
- **真 e2e**:
  ```sh
  cd .worktrees/v0.5.0-A2-log
  cargo build --release --bins
  mkdir -p tmp/test
  HOME="$PWD/tmp/test" ./target/release/nf-shell &
  sleep 1
  HOME="$PWD/tmp/test" ./target/release/nf projects create --slug=t --name='T'
  HOME="$PWD/tmp/test" ./target/release/nf episodes create --project=t --slug=e1 --duration=10
  HOME="$PWD/tmp/test" ./target/release/nf clips create --project=t --episode=e1 --slug=c1 --label=L --track=scene --start=0 --end=5
  HOME="$PWD/tmp/test" ./target/release/nf log tail --project=t --episode=e1 --limit=10
  # 期望 ≥ 3 条 actor:"AI" 的自动记录
  HOME="$PWD/tmp/test" ./target/release/nf quit
  ```

## 产出

- `A2-REPORT.md` · 改了哪些文件 + middleware 实现要点 + e2e 真 log 条目输出
- NO git commit

时间预算 30-60min。
