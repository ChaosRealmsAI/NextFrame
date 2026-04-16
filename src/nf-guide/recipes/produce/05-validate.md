# Step 05: Validate

## 命令

```bash
nextframe validate timeline.json --json
```

目标：`pass=true`，没有 anchor / kind contract 错误。

## 重点检查

- `UNSUPPORTED_VERSION`
  Fix: 删掉 v0.6 `matches`，确保顶层是 `version: "0.8"`
- `MISSING_ANCHOR`
  Fix: 定义缺失 anchor，或改正引用名
- `BAD_ANCHOR_EXPR`
  Fix: 只用最小语法 `id.begin|at|end ± n s|ms`
- `KIND_SCHEMA_VIOLATION`
  Fix: 对照 kind contract 修字段

## v0.8 常见错误

- subtitle clip 只写了 `params.text`，没写 `text`
- animation `target` 写成了旧 layer 路径
- timeline 里混入了 v0.3 `layers`

## 下一步

```bash
nf-guide produce build
```
