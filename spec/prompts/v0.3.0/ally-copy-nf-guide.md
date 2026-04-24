# ally 任务 · 复制 nf-guide crate 到主仓 crates/

## 上下文

NextFrame v0.3.0 · 归档迁移 · 把 `reference/nf-guide/` (v1.67.0 · d0b928fc 抽出 · prompt md 状态机)复制到主仓 `crates/nf-guide/`。**机械复制**。

## 工作目录

`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2/`

## 要干啥

1. **复制整个目录**:
   ```
   reference/nf-guide/  →  crates/nf-guide/
   ```
   含 `src/` + `flows/` (clips + audio + produce + script + component + design + shared 多个 pipeline 的 prompt md) + `Cargo.toml` + `CLAUDE.md`

2. **改 crates/nf-guide/Cargo.toml**:
   - `[lints] workspace = true` (原本可能已经是 · 确认)
   - 保留原 edition + rust-version 不动

3. **验证**:
   ```bash
   cd crates/nf-guide
   cargo check
   ```
   失败记录 · 不自行修

## 产物汇报

```json
{
  "copied": "nf-guide",
  "flows_preserved": ["clips", "audio", "produce", "script", "component", "design", "shared"],
  "flows_clips_count": <00-download.md 到 06-karaoke.md 几个文件>,
  "flows_audio_count": <flows/audio/*.md 几个>,
  "cargo_check_status": "ok|fail(原因)",
  "notes": ["..."]
}
```

## 禁

- ❌ 改 flows/*.md 内容(原 prompt 就是 haiku 要读的 · 动了它就是违 scope)
- ❌ 删任何 flow 子目录(autopilot 只用 clips + audio · 但其他 pipeline 保留供未来)
- ❌ 改主仓 Cargo.toml

## 注意

`flows/clips/*.md` + `flows/audio/*.md` 是本版 haiku 盲测的**唯一输入源**. Haiku 读这些 md 决定怎么跑 CLI. 它们的内容不动 · 保留成功概率 · 后续如需修 prompt 主 agent 根据 haiku 踩坑结果改.

## 预期耗时

3 min · 纯复制
