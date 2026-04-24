# D5 · 维护性审查 · ally gpt-5.4

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 任务

审查 `crates/nf-recorder/` **维护性** · 产 `spec/quality-reports/v0.4.1/reports/D5-maintenance.md`.

## 审查维度

1. **文档密度** · 每 pub fn / struct 有 `///` doc comment 吗? 关键契约(如 record_loop 的 FrameReady)有 `//!` module-level 说明吗?
2. **unsafe 注释率** · 每 `unsafe {}` 块 · 上方应有 `// SAFETY: ...` 说明为啥 safe. 扫全部 unsafe · 看有多少无 SAFETY 注释
3. **ABI 稳定性** · pub API surface 变化代价(如果改 pub fn 签名 · 谁受影响)· 但本版 nf-recorder 只被本 workspace 用 · 外部无引用 · ABI 可以变
4. **新人可读性**:
   - 模块入口(lib.rs)有没整体架构说明?
   - 复杂函数(> 100 行)是否拆得合理 · 注释关键决策
   - 命名: `surface_dim` vs `output_dim` 这种 · 一致?
5. **跨版本引用过时** · doc 里写 "v1.14 T-09 / T-17" 这种 · 对 v0.4.1 新读者无意义 · 应改
6. **spec 对齐** · doc 引用 `spec/versions/v1.14/spec/interfaces-delta.json` 这些路径不存在 · 需改或删

## 读什么

- ✅ `crates/nf-recorder/**/*.rs`
- ✅ pub API 特别注意 `lib.rs` 的 `pub mod`

## 命令辅助

```bash
cd crates/nf-recorder
grep -rn "^///" src/ | wc -l               # doc comment 行数
grep -rn "^pub fn\|^pub struct\|^pub enum" src/ | wc -l  # pub 数
grep -rB1 "unsafe {" src/ | grep -c "SAFETY"  # 有 SAFETY 注释的 unsafe
grep -c "unsafe {" src/**/*.rs              # 总 unsafe 数
grep -rn "v1\\.\(13\|14\|44\|56\|67\)\|interfaces-delta" src/  # 过时引用
```

## 报告格式

同 D1 + 特别加:
- doc 覆盖率估算: doc_lines / pub_count = ?
- unsafe 注释率: SAFETY_count / unsafe_count = ?
- 过时引用清单(路径 + 行号)

## 禁

- ❌ 修代码(只审)
- ❌ "建议迁到 docs.rs 格式" 这种超 scope
