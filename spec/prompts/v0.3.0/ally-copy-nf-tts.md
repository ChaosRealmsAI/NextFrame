# ally 任务 · 复制 nf-tts crate 到主仓 crates/

## 上下文

NextFrame v0.3.0 · 归档迁移 · 把 `reference/nf-tts/` (v1.67.0 · d0b928fc commit 抽出 · 4800+ 行 Rust)复制到主仓 `crates/nf-tts/`。**机械复制 · 不重写**。

## 工作目录

`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.3.0-0912b6e2/`

## 要干啥

1. **复制整个目录**:
   ```
   reference/nf-tts/  →  crates/nf-tts/
   ```
   包含 src/ · tests/ · scripts/ · Cargo.toml · CLAUDE.md · README.md · .gitignore

2. **改 crates/nf-tts/Cargo.toml**:
   - 确认 `[lints] workspace = true`(原本就是 · 应无需改)
   - 保留其他字段(edition = 2021, rust-version = 1.75, 依赖不动)
   - 注意: nf-tts 的 edition 比 clips 低(2021 vs 2024) · 主 agent 会决策统一或保留差异 · **你不管 · 保留原样**

3. **验证**:
   ```bash
   cd crates/nf-tts
   cargo check  # 单独跑 · workspace 没挂上之前可能 warn
   ```
   失败记录具体错误 · 不自行修

## 产物汇报

```json
{
  "copied": "nf-tts (src/ tests/ scripts/ 齐)",
  "file_count": <files数>,
  "cargo_check_status": "ok|fail(原因)",
  "notes": ["..."]
}
```

## 禁

- ❌ 改主仓 Cargo.toml
- ❌ 删源码(output/ 子模块也保留 · v1.12.1 fix 把 output/ 从 gitignore 救出来 · 是产品代码)
- ❌ 重写 / 重构
- ❌ 修 lint 违规

## 注意

`src/output/` 是 nf-tts 的产品代码模块名(不是输出目录)· 保留. 主仓 `.gitignore` 的 `output/` 规则已经豁免 `src/*/output/` · 不冲突.

## 预期耗时

3-5 min · 纯复制 + 1 次 cargo check
