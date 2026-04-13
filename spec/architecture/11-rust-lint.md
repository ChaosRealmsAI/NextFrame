# Rust Lint 规范

## Clippy Deny（编译红线）

Cargo.toml `[workspace.lints.clippy]` 必须 deny：

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "deny"        # 当前 warn，需升级
panic = "deny"
unreachable = "deny"         # 当前缺失
todo = "deny"                # 当前缺失
wildcard_imports = "deny"    # 当前缺失，有 17 处违规
```

deny = 编译不过。不准绕过，不准改回 warn。

## 当前违规

| 规则 | 违规数 | 说明 |
|------|--------|------|
| expect_used | 1 处（产品代码） | 升级 deny 后必须修 |
| wildcard_imports | 17 处 | `use xxx::*` 全部改具名 import |
| 零 warning | 已达成 | 保持 |

## unsafe 审计

当前 101 处 unsafe 块。规则：

- 每处 unsafe 必须有 `// SAFETY: xxx` 注释
- FFI 边界（objc2）允许，但必须单函数 `#[allow(unsafe_code)]`
- 禁止全模块 `#![allow(unsafe_code)]`
- 新增 unsafe 必须说明为什么安全

## 自动化

```bash
# CI 脚本
cargo clippy --workspace -- -D warnings
cargo test --workspace
grep -rn 'unsafe' --include='*.rs' | grep -v '// SAFETY' | grep -v '#\[allow'  # 应为 0
```
