# Step 05 · Validate

## 命令

```bash
node src/nf-cli/bin/nextframe.js validate timeline.v08.json --json
```

目标：`pass: true`，无 anchor / kind contract 错误。

## 重点检查

| 错误码 | 修法 |
|--------|------|
| `UNSUPPORTED_VERSION` | 顶层必须 `"version": "0.8"`（字符串），删 v0.6 `matches` / v0.3 `layers` |
| `MISSING_ANCHOR` | 定义缺失 anchor，或改正引用名 |
| `BAD_ANCHOR_EXPR` | 只用最小语法 `id.begin|at|end ± Nms|Ns` |
| `KIND_SCHEMA_VIOLATION` | 对照 kind contract 修字段（见 Step 04） |
| `UNSUPPORTED_SCENE_TYPE` | 某 scene 的 type 不在 {dom, media}，回 component 改 |

## v0.8 常见错误

- `subtitle clip` 只写 `params.text`，漏写 clip 根字段 `text`
- `animation.target` 写成 v0.3 的 layer 路径而非 `sceneTrackId.clips[N].params.field`
- timeline 顶层混入 `layers` 或 `matches`
- `version` 写成数字 `0.8` 而非字符串 `"0.8"`

## 快速自查

```bash
# 1. version 检查
grep -E '"version":\s*"0\.8"' timeline.v08.json || echo "MISSING version:0.8"

# 2. 有无裸毫秒（违反 anchors-only 规则）
grep -E '"begin":\s*[0-9]+' timeline.v08.json && echo "FAIL: 裸毫秒 → 必须引用 anchor"

# 3. 有无旧格式
grep -E '"(matches|layers)"\s*:' timeline.v08.json && echo "FAIL: 混入 v0.6/v0.3 字段"
```

## 下一步

```bash
cargo run -p nf-guide -- produce build
```
