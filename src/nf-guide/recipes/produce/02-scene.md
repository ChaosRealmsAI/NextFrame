# Step 02 · 做组件（批量流程 · 契约总览）

> **做单个高质量组件**：走专用 recipe `cargo run -p nf-guide -- component`（4 步：pick → aesthetics → craft → verify）。
> 本页只讲批量流程 + 契约总览。

## 1 · type 只有两种（ADR-021，不再讨论）

```
需要挂真实外部 <video> / <img> / <audio>? → media
else → dom（默认，覆盖一切）
```

| type | render 签名 | 用途 |
|------|-------------|------|
| **dom** | `render(t, params, vp) → string` | 卡片 / 标题 / 大数字 / 图表 / SVG / canvas / filter / 背景 |
| **media** | `render(t, params, vp) → string` 内含 `<video>` / `<img>` / `<audio>` | 真实外部资源 |

**禁其他 type**（canvas / svg / motion / shader / particle）— build-v08 会拒绝报 `UNSUPPORTED_SCENE_TYPE`。

**需要的 scene 不存在？** → 必须回 component recipe 造：

```bash
cargo run -p nf-guide -- component
```

## 2 · 起手原则（必先过脑）

1. **一个组件 = 一个 .js 文件**，路径：`src/nf-core/scenes/{ratio}/{theme}/{role}-{name}.js`
2. **零 import** — 颜色 / 坐标 / 工具全在文件里写死
3. **default export 一个对象** — 含 11 必填 + 18 AI 字段 + render/describe/sample
4. **文件本身就是文档** — 未来 AI 看一眼就能用

## 3 · 起点模板（复制 `_examples/`）

```bash
ls src/nf-core/scenes/_examples/
# scene-dom-card.js      ← dom 起点
# scene-media-video.js   ← media 起点

cp src/nf-core/scenes/_examples/scene-dom-card.js \
   src/nf-core/scenes/<ratio>/<theme>/<role>-<id>.js
```

**别从 0 写 — 这两个样例是契约正确的最小起点**。

## 4 · 读 theme.md 拿设计语言

```bash
cat src/nf-core/scenes/{ratio}/{theme}/theme.md
```

有：配色 hex / 字体 / 字号阶梯 / 网格坐标 / 气质。**所有值复制粘贴到组件里写死**，改 theme 用 sed 批改。

## 5 · CLI 生成骨架

```bash
node src/nf-cli/bin/nextframe.js scene-new \
  --id=<camelCaseId> \
  --role=<bg|chrome|content|text|overlay|data> \
  --type=<dom|media> \
  --ratio=<16:9|9:16> \
  --theme=<theme> \
  --name="<显示名>" \
  --description="<一句话用途>"
```

CLI 会：
- 生成正确的 render 签名 `(t, params, vp) → string`
- 内置 11 必填 + 18 AI 字段 + describe + sample
- 内置 t-driven 示例 render body（能直接跑）
- 自动校验 id camelCase / role / type 在枚举内 / theme 目录存在
- type 只接受 `dom` 或 `media`

## 6 · 11 必填 + 18 AI 字段速查

```
11 必填:  id / name / version / ratio / theme / role / description /
         duration_hint / type / frame_pure / assets + params
18 AI 字段:
  意图(6): intent / when_to_use / when_not_to_use / limitations / inspired_by / used_in
  配伍(4): requires / pairs_well_with / conflicts_with / alternatives
  权重(3): visual_weight / z_layer / mood
  索引(5): tags / complexity / performance / status / changelog
```

**intent 必须 ≥ 50 字真实推理**。

## 7 · render 硬规则（table）

| # | 规则 | 反例 |
|---|------|------|
| 1 | render 签名 `(t, params, vp) → string` | `(host, t, ...)` / `(ctx, ...)` |
| 2 | 返回非空 string + ≥ 1 个 HTML 标签 | return "" / return undefined |
| 3 | 用 `vp.width / vp.height`，不硬编码 1920/1080 | `font-size: 48px` 不缩放 |
| 4 | 颜色 hex 直接写，不 import | `import { TOKENS }` |
| 5 | frame_pure: 同 t 同 params 同输出 | `Date.now()` / `Math.random()` |
| 6 | 无 CSS `@keyframes` / `animation:` / `transition:` | 会被 compose 每帧重置 |
| 7 | 系统字体 | google fonts CDN |
| 8 | 文件 ≤ 500 行 | — |

## 8 · 写完自验（强制 4 步）

```bash
# 1. 语法
node --check src/nf-core/scenes/{ratio}/{theme}/{role}-{name}.js

# 2. 出现在列表
node src/nf-cli/bin/nextframe.js scenes --theme={theme} | grep {id}

# 3. smoke（type 白名单 + render 不抛 + intent 够）
node src/nf-cli/bin/nextframe.js scene-smoke --theme={theme} --json

# 4. gallery 真实视觉
node src/nf-cli/bin/nextframe.js scene-gallery --theme={theme}
```

任一不过 → 改 → 重跑。

## 9 · Checklist

- [ ] 文件路径正确 `scenes/{ratio}/{theme}/{role}-{name}.js`
- [ ] default export 对象
- [ ] 11 必填 + 18 AI 字段全
- [ ] intent ≥ 50 字真实推理
- [ ] type ∈ {dom, media}
- [ ] render 签名 `(t, params, vp) → string`
- [ ] 零 `import`
- [ ] 颜色 / 坐标 / 字体写死
- [ ] 无 `Date.now` / `Math.random`
- [ ] 无 CSS `@keyframes`
- [ ] viewport-relative 坐标
- [ ] sample() 真实业务内容
- [ ] smoke + gallery 过

## 下一步

所有 scene 过 → `cargo run -p nf-guide -- produce anchors`
