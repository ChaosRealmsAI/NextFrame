# D4 · 清洁度审查 · ally gpt-5.4

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 任务

审查 `crates/nf-recorder/` **代码清洁度** · 产 `spec/quality-reports/v0.4.1/reports/D4-cleanliness.md`.

## 审查维度

1. **dead code** · grep `#[allow(dead_code)]` · 不用的 struct field(v0.4 build 看到 `output_surface` warning)· 不用的 pub fn · 不用的 enum variant(之前 CliError 报过 SpecViolation/engine_* 没用)
2. **unused imports** · `cargo check` 有 warning 吗
3. **过时 TODO / FIXME / HACK / XXX** · 迁自 v1.67 的过时注释
4. **废抽象** · 比如 trait 只 1 个实现 · typedef 只用 1 次 · 过度 wrapper · 可以 inline 的小 struct
5. **死 branch** · match 里永远不走的 arm · `if false` / `if cfg!(never)`
6. **过时 doc comment** · 引用 v1.14 / v1.44 / v1.67 历史版本 · 但 crate 现在是 v0.4 · 需改
7. **magic number** · 硬编码常数没命名

## 读什么

- ✅ `crates/nf-recorder/**/*.rs`
- ✅ clippy 输出

## 命令辅助

```bash
cd crates/nf-recorder
grep -rn "#\[allow(dead_code)\]\|#\[allow(unused\|#\[cfg(test)\]" src/
grep -rn "TODO\|FIXME\|HACK\|XXX\|v1\\.\(13\|14\|15\|44\|56\|58\|67\)" src/ tests/  # 过时版本注释
cargo clippy -p nf-recorder -- -W dead_code -W unused 2>&1 | grep warning | head -30
wc -l src/**/*.rs | tail -5             # 行数分布
```

## 报告格式

同 D1 + 分 4 类:
- **dead code**: ...
- **过时版本引用**: ...(v1.x → v0.4 · 这版是 rename)
- **废抽象**: ...
- **其他清洁**(TODO / magic number 等)

## 禁

- ❌ 修代码(只审)
- ❌ 建议风格改(fmt 归 rustfmt · 不在审查 scope)
