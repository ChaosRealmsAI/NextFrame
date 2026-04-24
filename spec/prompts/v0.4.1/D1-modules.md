# D1 · 模块拆分审查 · ally gpt-5.4

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 任务

审查 `crates/nf-recorder/` 的**模块拆分** · 产出 `spec/quality-reports/v0.4.1/reports/D1-modules.md` 报告.

## 审查维度

1. **文件职责边界**: 11 文件(cli / main / lib / events / export_api / frame_pool / orchestrator / record_loop / snapshot / verify_mp4 + pipeline/{h264,hevc,mod,mp4_writer,vt_wrap})· 每文件职责是否单一? 有无职责重叠 / 应该合并 / 应该拆分?
2. **循环依赖**: 用 `cargo tree -p nf-recorder` 看 crate 级 · grep `use crate::` 看内部 mod 互相引用 · 有无环?
3. **lib.rs 导出面**: 哪些 pub · 哪些应 pub(crate) · 对外 API surface 是否过大?
4. **模块分层**: 高层(orchestrator/record_loop) vs 底层(pipeline/frame_pool/vt_wrap) 边界是否清晰? 有无跨层调用?

## 读什么 · 禁读什么

- ✅ 读 `crates/nf-recorder/src/**/*.rs`(全部 · 11 文件)
- ✅ 读 `crates/nf-recorder/Cargo.toml` · `tests/*.rs`
- ❌ 不读其他 crate(nf-shell-mac · nf-cli 等)源码 · 只看 nf-recorder 自己的依赖进出口

## 报告格式

```markdown
# D1 · nf-recorder 模块拆分审查

## 总评(1 句)
<好/一般/差 · 一句话结论>

## Findings(按 P0/P1/P2 排)

### P0 · <标题>
- **位置**: crates/nf-recorder/src/xxx.rs:NN-NN
- **问题**: 具体描述
- **建议**: 具体改法
- **代价**: 低/中/高(改动范围)

### P1 · ...
### P2 · ...

## 亮点(好的拆分 · 别改)
- ...

## 汇总
- P0 数: N / P1 数: N / P2 数: N
- 整体分(1-10): X
```

## 汇报产物路径

写到 `spec/quality-reports/v0.4.1/reports/D1-modules.md`(worktree 下 symlink 到主 spec 仓).

## 禁

- ❌ 建议"重写"(只能建议结构优化)
- ❌ 修代码(本 task 只审 · 修在下一波)
- ❌ 泛泛而谈(必须指定文件:行号 + 具体建议)
