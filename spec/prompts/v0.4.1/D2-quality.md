# D2 · 代码质量审查 · ally gpt-5.4

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 任务

审查 `crates/nf-recorder/` **代码质量** · 产 `spec/quality-reports/v0.4.1/reports/D2-quality.md`.

## 审查维度

1. **panic 路径** · grep `unwrap()` · `expect(` · `panic!(` · `unreachable!(` · `todo!(` · 评估是否合规 allow(workspace lint deny 这 6 个 · 如存在必须有 `#[allow(...)]` + 理由注释)
2. **error handling** · `thiserror` enum 是否完整 · `?` 传播是否丢信息 · Result 返回链有无 `.unwrap()` 绕过
3. **thread safety** · `Arc` · `Mutex` · `crossbeam::queue::ArrayQueue` 用法是否对 · 有无 poisoning / deadlock 风险
4. **async 风险** · `tokio::spawn` · `block_on` · `call_async` 调用 main thread 约束是否守
5. **FFI 正确性** · `objc2` block · `Retained<T>` 生命周期 · `CFRetain` / `CFRelease` 配对

## 读什么

- ✅ `crates/nf-recorder/src/**/*.rs`
- ✅ `crates/nf-recorder/Cargo.toml`(看 tokio features / crossbeam version 等)
- ❌ 不读其他 crate

## 命令辅助

```bash
cd crates/nf-recorder
grep -rn "unwrap()" src/ | wc -l          # unwrap 个数
grep -rn "expect(" src/                   # expect 清单
grep -rn "unreachable\|panic!\|todo!" src/
grep -rn "Arc::\|Mutex::\|ArrayQueue" src/
grep -rn "unsafe" src/                    # unsafe 块位置
cargo clippy -p nf-recorder --all-targets -- -D warnings 2>&1 | tail -30  # 真 lint
```

## 报告格式

同 D1(总评 / P0-P2 findings / 亮点 / 汇总)· 每 finding 贴代码片段 + 行号.

## 禁

- ❌ 修代码 · 只审
- ❌ 建议换库(thiserror → anyhow 这种 · 超 scope)
