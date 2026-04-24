# ally 任务 · 复制 clips-pipeline 6 crate 到主仓 crates/

## 上下文

NextFrame v0.3.0 · 归档迁移版本 · 把 `reference/clips-pipeline/` (v0.5 · 334e48bd commit 抽出)里的 6 个 Rust crate 复制到主仓 `crates/` 下。**不重写 · 机械复制 + 少量 Cargo.toml 调整**。

## 工作目录

`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2/`

## 要干啥

1. **复制目录** (保留所有文件结构):
   ```
   reference/clips-pipeline/nf-source/             → crates/nf-source/
   reference/clips-pipeline/videocut-core/         → crates/videocut-core/
   reference/clips-pipeline/videocut-download/     → crates/videocut-download/
   reference/clips-pipeline/videocut-transcribe/   → crates/videocut-transcribe/
   reference/clips-pipeline/videocut-align/        → crates/videocut-align/
   reference/clips-pipeline/videocut-cut/          → crates/videocut-cut/
   ```

2. **改每个子 crate Cargo.toml**:
   - 删除 `[lints.clippy]` 整段(工作区已定义 · 改为 `[lints] workspace = true`)
   - 其他字段保留原样(edition = 2024, rust-version = 1.86, 依赖不动)

3. **验证**(每 crate 分别):
   ```bash
   cd crates/<crate-name>
   cargo check  # 单独 check(主 Cargo.toml workspace.members 可能还没改 · 会 warn 但不 fail)
   ```
   失败记录具体错误 · 不自行修(主 agent 统一 align)

## 产物汇报

在任务结尾产一份简短 json 报告:
```json
{
  "copied": ["nf-source", "videocut-core", "videocut-download", "videocut-transcribe", "videocut-align", "videocut-cut"],
  "cargo_check_status": {
    "nf-source": "ok|fail(原因一句)",
    "videocut-core": "...",
    ...
  },
  "notes": ["任何注意事项"]
}
```

## 禁

- ❌ 改主仓 Cargo.toml(主 agent 负责)
- ❌ 删源码/测试(原样保留)
- ❌ 重写逻辑(机械复制)
- ❌ 修 lint 违规(暴露给主 agent 统一处理)

## 预期耗时

5 min 级别 · 纯文件操作 + 6 次 cargo check
