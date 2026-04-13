# 文件大小规范

## 规则

**产品代码单文件 ≤ 500 行。** 测试文件 ≤ 800 行。

## 当前违规

| 文件 | 行数 | 类型 | 处理方案 |
|------|------|------|---------|
| bridge/tests/integration.rs | 1056 | 测试 | 按 domain 拆成子模块 |
| runtime/web/test/bdd/engine.test.js | 999 | 测试 | 按功能拆 |
| runtime/web/src/engine-v2.js | 649 | 产品 | 拆 easing/layout/render |
| bridge/src/tests/export_tests.rs | 527 | 测试 | 接近上限，暂不拆 |
| recorder/src/record.rs | 521 | 产品 | 拆 setup/loop/cleanup |
| nextframe-cli/src/cli/_source.js | 515 | 产品 | 拆 |
| runtime/web/src/scenes-v2-shared.js | 504 | 产品 | 拆 easing/color/font |

## 自动化

```bash
# 产品代码 >500 行
find . -type f \( -name '*.rs' -o -name '*.js' \) \
  -not -path '*/target/*' -not -path '*/node_modules/*' \
  -not -path '*/.worktrees/*' -not -path '*/poc/*' \
  -not -path '*/output/*' -not -path '*/test*' \
  | xargs wc -l | sort -rn | awk '$1 > 500 {print}'
# 应为空

# 测试文件 >800 行
find . -type f \( -name '*test*' -o -name '*tests*' \) \
  \( -name '*.rs' -o -name '*.js' \) \
  -not -path '*/target/*' -not -path '*/node_modules/*' \
  | xargs wc -l | sort -rn | awk '$1 > 800 {print}'
# 应为空
```
