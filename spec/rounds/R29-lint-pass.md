# Task — R29: Final lint + quality pass

## Goal
Final code quality sweep. Ensure: zero clippy warnings with `-D warnings`, zero eslint-like issues in JS (via node parser check), all tests pass, no dead code.

## Requirements

### Rust
- Already clean per verify.sh — confirm `cargo clippy --workspace --all-targets -- -D warnings` exits 0
- Add `#[deny(unused)]` to each crate lib.rs / main.rs where safe
- Add `[lints.clippy]` section to each Cargo.toml with `unwrap_used = "deny"`, `expect_used = "warn"`, `panic = "deny"`
- Fix any new warnings that appear

### JS
- Add a `runtime/web/test/lint.mjs` that walks `runtime/web/src/**/*.js` and:
  - Parses each file via `node:vm` to check syntax
  - Greps for common issues: `console.log(` (should be console.warn/.error or debug flag), `TODO` (count + warn), `debugger` (fail)
  - Exit 0 if all pass, non-zero otherwise
- Do NOT introduce a bundler or eslint dep
- Fix any console.log → console.warn or remove, remove any debugger statements

### Verification
- `scripts/verify.sh` is extended to also run `node runtime/web/test/lint.mjs` and include the result in the report

## Verification Commands
```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
test -f runtime/web/test/lint.mjs
node runtime/web/test/lint.mjs
node runtime/web/test/bdd/run.mjs
bash scripts/verify.sh
```

## Non-Goals
- NO architectural refactor
- NO dependency changes (stay with current versions)
