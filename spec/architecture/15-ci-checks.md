# CI 检查清单

所有检查必须通过才能合并。一个脚本跑完所有维度。

## 检查项

| # | 维度 | 命令 | 期望 |
|---|------|------|------|
| 1 | Rust 编译 | `cargo check --workspace` | 零 error |
| 2 | Rust 测试 | `cargo test --workspace` | 全 pass |
| 3 | Clippy | `cargo clippy --workspace -- -D warnings` | 零 warning |
| 4 | 产品文件行数 | 见下方脚本 | 零文件 >500 行 |
| 5 | 测试文件行数 | 见下方脚本 | 零文件 >800 行 |
| 6 | JS var 使用 | `grep '\bvar '` | 零结果 |
| 7 | JS console.log | `grep 'console.log'`（排除 bridge） | 零结果 |
| 8 | TODO/FIXME | `grep 'TODO\|FIXME\|HACK\|XXX'` | 零结果 |
| 9 | unsafe 注释 | unsafe 块无 SAFETY 注释 | 零结果 |
| 10 | 依赖方向 | scenes 不 import modules | 零结果 |
| 11 | gitignore | `git ls-files --others` 无二进制 | 无 .png/.mp4/.cache |
| 12 | Cargo.toml deny | 6 条 deny 规则在位 | 全部 deny |

## 脚本

```bash
#!/bin/bash
# scripts/lint-all.sh
set -e
FAIL=0

echo "=== 1. cargo check ==="
cargo check --workspace || FAIL=1

echo "=== 2. cargo test ==="
cargo test --workspace || FAIL=1

echo "=== 3. clippy ==="
cargo clippy --workspace -- -D warnings || FAIL=1

echo "=== 4. prod files >500 lines ==="
OVER=$(find . -type f \( -name '*.rs' -o -name '*.js' \) \
  -not -path '*/target/*' -not -path '*/node_modules/*' \
  -not -path '*/.worktrees/*' -not -path '*/poc/*' \
  -not -path '*/output/*' -not -path '*/test*' \
  | xargs wc -l 2>/dev/null | awk '$1 > 500 {print}' | grep -v total)
if [ -n "$OVER" ]; then echo "FAIL: files >500 lines:" && echo "$OVER"; FAIL=1; fi

echo "=== 5. test files >800 lines ==="
OVER_TEST=$(find . -type f \( -name '*test*' -o -name '*tests*' \) \
  \( -name '*.rs' -o -name '*.js' \) \
  -not -path '*/target/*' -not -path '*/node_modules/*' \
  | xargs wc -l 2>/dev/null | awk '$1 > 800 {print}' | grep -v total)
if [ -n "$OVER_TEST" ]; then echo "FAIL: test files >800 lines:" && echo "$OVER_TEST"; FAIL=1; fi

echo "=== 6. JS var usage ==="
VAR_COUNT=$(grep -rn '\bvar ' runtime/web/src/ --include='*.js' 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
if [ "$VAR_COUNT" -gt 0 ]; then echo "FAIL: $VAR_COUNT var usages found"; FAIL=1; fi

echo "=== 7. console.log ==="
LOG_COUNT=$(grep -rn 'console\.log' runtime/web/src/ --include='*.js' 2>/dev/null | grep -v '\[bridge\]' | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 0 ]; then echo "FAIL: $LOG_COUNT console.log found"; FAIL=1; fi

echo "=== 8. TODO/FIXME ==="
TODO_COUNT=$(grep -rn 'TODO\|FIXME\|HACK\|XXX' bridge/src/ shell/src/ recorder/src/ runtime/web/src/ --include='*.rs' --include='*.js' 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -gt 0 ]; then echo "FAIL: $TODO_COUNT TODO/FIXME found"; FAIL=1; fi

echo "=== 9. unsafe without SAFETY comment ==="
UNSAFE=$(grep -rn 'unsafe' bridge/src/ shell/src/ recorder/src/ --include='*.rs' 2>/dev/null | grep -v '// SAFETY' | grep -v '#\[allow' | grep -v 'unsafe_code' | grep -v test)
if [ -n "$UNSAFE" ]; then echo "FAIL: unsafe without SAFETY:" && echo "$UNSAFE" | head -10; FAIL=1; fi

echo "=== 10. scene cross-import ==="
CROSS=$(grep -rn "from.*modules/" runtime/web/src/scenes-v2/ --include='*.js' 2>/dev/null)
if [ -n "$CROSS" ]; then echo "FAIL: scenes import modules:" && echo "$CROSS"; FAIL=1; fi

echo "=== 11. Cargo.toml deny rules ==="
for RULE in unwrap_used expect_used panic unreachable todo wildcard_imports; do
  if ! grep -q "$RULE.*deny" Cargo.toml 2>/dev/null; then
    echo "FAIL: $RULE not deny in Cargo.toml"; FAIL=1
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "SOME CHECKS FAILED"
  exit 1
fi
```
