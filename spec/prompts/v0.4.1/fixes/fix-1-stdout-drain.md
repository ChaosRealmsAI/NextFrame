# Fix-1 · orchestrator 子进程 stdout 阻塞修复

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 根因(D6 P0-1)

`crates/nf-recorder/src/orchestrator.rs:155-180` `run_parallel` spawn segment 子进程:
```rust
.stdout(Stdio::piped())   // ← 这里
```
但成功路径只 `.wait()` · 不读 stdout. 子进程 `record_loop` 每帧 `emit(Event::RecordFrame)` 写 stdout · pipe buffer(~64KB)填满后子进程阻塞 · 父进程也阻塞 `wait()` → deadlock. 4K/长视频/parallel=4 触发.

## 修法(简单直接版)

段子进程 stdout 改 `Stdio::null()` — segment 内部每帧事件**本就不需父进程看**(父进程只看 segment start/done/progress 聚合事件 · 本来就是父进程自己 emit 的).

**改动**: `orchestrator.rs` `spawn` 那几行 · `.stdout(Stdio::piped())` → `.stdout(Stdio::null())`.

stderr 保留(可能含 error msg · 父进程 `wait_with_output` 捕获).

## 具体 edit

1. 找 `orchestrator.rs` 所有 `.stdout(Stdio::piped())` (只应有一两处 in spawn)
2. 改 `.stdout(Stdio::null())`
3. 确保 `Command::spawn` 后不再尝试读 `child.stdout`(grep 确认没 `child.stdout.take()`)
4. stderr 处理逻辑保留

## 验

```bash
cd crates/nf-recorder
cargo build -p nf-recorder 2>&1 | tail -5    # 必须编译过
cargo clippy -p nf-recorder --all-targets 2>&1 | tail -5  # lint 绿
```

## 禁

- ❌ 大改 orchestrator 结构(只改 stdout 2 行)
- ❌ 加 drain 线程方案(本 fix 选 null · 简单)
- ❌ 碰 pub API
- ❌ 动 stderr 处理
