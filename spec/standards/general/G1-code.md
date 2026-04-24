# G1 · 编译 + lint (硬门禁)

## 守护

Harness engineering —— 坏代码编译不过 · 提交不过 · 不靠自律。

## 规则

### Rust

- `cargo check --workspace --all-targets` 零 warning
- `cargo clippy --workspace --all-targets -- -D warnings` 过 · workspace 已 `deny` 6 条(`unwrap_used` / `expect_used` / `panic` / `unreachable` / `todo` / `wildcard_imports`)
- `cargo fmt --all -- --check` 过
- `unsafe` / FFI 必带 `#[allow(...)]` + 一句注释说明理由(CLAUDE.md 硬约束)

### TypeScript(frontend/nf-components)

- `npx tsc --noEmit` 零 error
- `tsconfig` 必带: `strict: true` · `noImplicitAny` · `noUnusedLocals` · `noUnusedParameters` · `noImplicitReturns` · `exactOptionalPropertyTypes`

## check

```bash
make check         # 一键闭环: check-rust + clippy + check-ts
```

CI 卡口(`.github/workflows/ci.yml`):rust job (fmt-check + check + clippy -D warnings) + frontend job (tsc --noEmit)。

## 评分

| 分 | 状态 |
|---|---|
| **A=10** | `make check` 三绿 · CI 绿 · 0 warning / 0 error |
| **B=8** | 有 1-3 warning(非 deny)· CI 还是绿 |
| **C=6** | 4-10 warning / 有 allow 但无注释 |
| **D=4** | clippy deny 规则被 allow 没理由 / CI 红过但修了 |
| **F=0** | CI 持续红 / make check 跑不过 |

## 门禁

**F = 阻合并**。commit 上 CI 绿才能 merge。

## 关联

- CLAUDE.md lint baseline 段
- `ai-coding-mindset` rule §4 验证能力
- `identity` rule Harness Engineering
