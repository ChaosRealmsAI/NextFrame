# Step 2: 写 theme.md

把 brief + tokens 落成文档。

## 路径

```
src/nf-core/scenes/{ratio-dir}/{theme}/theme.md
```

例 16:9 anthropic-warm → `src/nf-core/scenes/16x9/anthropic-warm/theme.md`

目录不存在先创：

```bash
mkdir -p src/nf-core/scenes/16x9/{new-theme}
```

## 模板结构（9 段，一段不能少）

```markdown
# {theme-name} · {ratio}

> 设计语言文档。AI 写组件前必读。**代码不 import 此文件** — 所有值在组件文件里写死，改 token 用 sed 批处理。

---

## 气质
(3-5 句话，从 brief 来)

## 配色（直接 hex 写到组件里）
### 背景层
- `--bg`     `#xxxxxx`  主背景
- `--bg2`    ...
### 文字
- ...
### 主调 + 辅助
- ...
### 透明度变体
- ...
### 分割线 / 幽灵
- ...

## 字体
| 角色 | 字族 | 用途 |
|...

## 字号阶梯（{w}×{h}）
| 用途 | px | 行高 |
|...

## 网格（{w}×{h}）
- 安全边距：...
- chrome 顶部条：y = ...
- chrome 底部条：y = ...
- 主内容区：...

## 图层顺序（z 从下到上）
| 层 | role | 例 |
|...

## 命名约定
- 文件名：`{role}-{name}.js`
- id = camelCase

## 组件设计原则
1. 零 import
2. frame_pure
3. viewport-relative
4. 18 AI 理解字段必填
5. assets: []

## 改设计语言时
(sed 批处理步骤)
```

## 参考样例

已有的 theme.md 可以抄结构：

```bash
cat src/nf-core/scenes/16x9/anthropic-warm/theme.md
cat src/nf-core/scenes/9x16/interview-dark/theme.md   # (如果有)
```

## 验证

```bash
# 文件存在
ls src/nf-core/scenes/{ratio}/{theme}/theme.md

# 文件有效（至少包含这 4 个段落标题）
grep -E "^## (气质|配色|字体|网格)" src/nf-core/scenes/{ratio}/{theme}/theme.md
# 应输出 4 行
```

## 下一步

theme.md 写好 → 进入 `produce` recipe：

```bash
cargo run -p nf-guide -- produce        # 看 produce 流程
cargo run -p nf-guide -- produce scene  # 进 02-scene 做组件
```

produce/02-scene 会用 `nextframe scene-new` CLI 生成组件骨架 — 骨架里的颜色/字号你改成 theme.md 里的 hex 就行。
