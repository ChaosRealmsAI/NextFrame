# JS Lint 规范

## 变量声明

- 禁止 `var`，全部用 `let` / `const`
- 当前违规：253 处
- 优先 `const`，只有需要重新赋值才用 `let`

## console.log

- 产品代码禁止 `console.log`，当前 8 处
- bridge 通信日志用 `[bridge]` 前缀的除外（app-bundle.js 里）
- 调试日志用完即删

## 场景组件

- 同一组件的比例变体（headline / headline_portrait / headline_43）重复代码 ~85%
- 规范：抽共享渲染函数到 scenes-v2-shared.js，变体只传参数差异
- 每个组件文件 ≤150 行

## 命名

- 文件名：camelCase.js（场景组件）/ kebab-case.js（模块）
- 函数名：camelCase
- 常量：UPPER_SNAKE_CASE
- CSS class：kebab-case

## 自动化

```bash
# var 检查
grep -rn '\bvar ' runtime/web/src/ --include='*.js' | grep -v node_modules | wc -l  # 应为 0

# console.log 检查（排除 bridge 日志）
grep -rn 'console\.log' runtime/web/src/ --include='*.js' | grep -v 'bridge' | wc -l  # 应为 0

# 文件行数
find runtime/web/src/ -name '*.js' | xargs wc -l | awk '$1 > 500 {print}'  # 应为空
```
