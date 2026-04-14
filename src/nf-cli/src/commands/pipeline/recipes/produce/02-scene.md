# Step 2: 做组件 + 单独验证

循环：写 → preview 截图 → 看图 → 改 → 再 preview，直到满意。

## 必读（写之前）

```bash
# 1. 设计规范 — 所有颜色/布局/字号从这里取
cat src/nf-core/scenes/shared/design.js

# 2. 组件契约 — 必须导出 4 个接口
#    meta: { id, ratio, category, label, description, params, ... }
#    render(t, params, vp) → HTML string
#    screenshots() → [{t, label}]
#    lint(params, vp) → {ok, errors[]}
```

## 创建组件

```bash
# 写 index.js（用 Write 工具）
# 路径: src/nf-core/scenes/{ratio}/{category}/{name}/index.js
# 例: src/nf-core/scenes/9x16/overlays/interviewBiSub/index.js

# 确认被发现
nextframe scenes <id>
```

## 验证（每个组件必做）

```bash
# 写一个最小 timeline 测试这个组件
# 然后 preview 截图
nextframe preview test-single.json --auto --json --out=/tmp/scene-check

# 读截图确认视觉效果
# Read /tmp/scene-check/frame-*.png
```

## 硬编码检测

```bash
# 组件里不允许出现非 TOKENS 的硬编码颜色
grep -n "#[0-9a-fA-F]\{3,8\}" src/nf-core/scenes/{ratio}/*/*/index.js
# 应该 0 结果。有 → 改成 TOKENS.xxx
```

## 关键规则

- **所有颜色** → `TOKENS.interview.*` 或 `TOKENS.lecture.*`
- **所有位置** → `GRID.*` 或 `GRID_16x9.*`
- **所有字号** → `TYPE.*` 或 `TYPE_16x9.*`
- **字幕组件** → 必须用 `findActiveSub(segments, t)` 两级查找
- **视频组件** → meta 必须有 `videoOverlay: true`
- **代码块** → 用单个 `<pre>` 不用多个 div（WKWebView 兼容）
- **流程图** → 用单个 `<svg>` 不用多个 positioned div

## 门禁

- `nextframe scenes` 能发现所有需要的组件
- 每个组件 preview 截图 AI 确认视觉正确
- grep 硬编码颜色 = 0 结果
