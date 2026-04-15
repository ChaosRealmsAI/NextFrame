# Step 2: 做组件 — 单文件自包含 + 按 type 选 render

> **完整规范见**: `spec/standards/project/scene/scene-component-system.html`
> 这一步只讲 AI 实操流程，不重复规范细节。

## 2.0 起手原则（必须先过脑子）

1. **一个组件 = 一个 .js 文件**，路径：`src/nf-core/scenes/{ratio}/{theme}/{role}-{name}.js`
2. **零 import** — 颜色/坐标/工具函数全在文件里写死或内联
3. **default export 一个对象** — 含 11 必填 + 18 AI 理解字段 + render/describe/sample 三函数
4. **文件本身就是文档** — 未来 AI 看一眼就能用、改、抄，不用读 README

## 2.1 决定 type（最关键的一步，选错全错）

```
需要嵌入真实视频/图/音频？      → media
是矢量图标 / 几何箭头？         → svg
是 UI 布局（卡片/列表/标签/聊天）? → dom（默认！）
是逐像素效果（grain/blur/粒子）? → canvas
不确定？                         → 先 dom，扛不住再升级
```

| type | render 签名 | 最常见用途 |
|------|-------------|-----------|
| **dom** | `render(host, _t, params, vp)` mutate host | 卡片 / 列表 / 标签 / 聊天 / 标题 / 代码块 |
| **svg** | `render(host, _t, params, vp)` 追加 SVG 子元素 | 流程图箭头 / 矢量图标 |
| **canvas** | `render(ctx, _t, params, vp)` ctx.fillXxx | 滤镜 / 粒子 / 真实视频帧合成 |
| **media** | `render(host, _t, params, vp)` 挂 video/img | B-roll / 封面图 |

**反模式警告**：把 UI 类组件硬塞 canvas → 中文字体方框 + 布局靠手算 + 改字号要重画。

## 2.2 读 theme.md 拿设计语言

每个 theme 都有 `theme.md`，**纯文档，AI 读、代码不 import**：

```bash
cat src/nf-core/scenes/{ratio}/{theme}/theme.md
```

里面有：配色 hex / 字体 / 字号阶梯 / 网格坐标 / 气质描述 / 图层顺序。

**所有值复制粘贴到组件里，写死。改 theme 用 sed 批量改，不抽 token。**

## 2.3 复制模板起步

```bash
# Canvas 类（参考）
cat src/nf-core/scenes/16x9/anthropic-warm/text-headline.js

# DOM 类（待补 — 第一个 dom 模板还没建，参考 spec 新签名手写）
```

整段复制 → 改 id/name/role → 改 intent + when_to_use + 配伍三组 → 改 params → 改 render/describe/sample。

## 2.4 11 必填字段速查

```
身份: id / name / version
归属: ratio / theme / role        ← role: bg|chrome|content|text|overlay|data
语义: description / duration_hint
渲染: type / frame_pure / assets
契约: params
```

## 2.5 18 AI 理解字段速查

```
理解意图（6）: intent / when_to_use / when_not_to_use / limitations / inspired_by / used_in
配伍关系（4）: requires / pairs_well_with / conflicts_with / alternatives
视觉权重（3）: visual_weight / z_layer / mood
索引工程（5）: tags / complexity / performance / status / changelog
```

**`intent` 必须 ≥ 50 字真实推理**（为什么要这个组件、设计取舍、视觉哲学），不能写"This is a foo"。

## 2.6 写 render 的硬规则

| # | 规则 | 反例 |
|---|------|------|
| 1 | 用 `viewport.width / height`，不硬编码 1920/1080 | `ctx.fillText(t, 540, 1500)` |
| 2 | 颜色 hex 直接写，不 import token | `import { TOKENS }` |
| 3 | frame_pure: 同 t 同 params → 同画面 | `Date.now()` / `Math.random()` |
| 4 | 不 import 任何东西 | `import { utils }` |
| 5 | 系统字体（PingFang SC / Hiragino / Songti / SF Mono），不外部下载 | google fonts CDN |
| 6 | 文件 ≤ 500 行 | — |
| 7 | 未用的参数加 `_` 前缀（`_t`），躲 TS strict | `function (ctx, t, ...) {}` |

## 2.7 写 describe 的目的

让 AI **不用看像素**就知道组件当前在演什么：

```javascript
describe(_t, params, vp) {
  return {
    sceneId: "...",
    phase: "enter" | "hold" | "exit" | "hidden",
    progress: 0..1,
    visible: true,
    params,
    elements: [{ type, role, value, ... }],   // 当前画面上的逻辑元素
    boundingBox: { x, y, w, h },
  };
}
```

debug / 自验 / AI 回看时神器。

## 2.8 写 sample 的目的

返回**能直接跑**的参数样例。最好用真实业务内容（从 script.md 摘）。

```javascript
sample() {
  return { title: "...", subtitle: "..." };
}
```

CLI 三层披露（L2）输出 sample 时直接复用。

## 2.9 写完后自验（强制 4 步）

```bash
# 1. 语法
node --check src/nf-core/scenes/{ratio}/{theme}/{role}-{name}.js

# 2. 加载（出现在列表）
node src/nf-cli/bin/nextframe.js scenes | grep {id}

# 3. smoke test（30 字段 + render+describe+sample 不抛 + 输出 PNG）
node scripts/scene-smoke-test.mjs

# 4. composite（多组件叠加，看真实 slide 视觉）
node scripts/scene-demo-composite.mjs
# 然后 Read /tmp/scene-previews/composite-*.png 自查
```

任一不过 → 改 → 重跑，循环到全过。

## 2.10 检查清单（checklist）

- [ ] 文件路径正确 `scenes/{ratio}/{theme}/{role}-{name}.js`
- [ ] default export 对象
- [ ] 11 必填字段全有
- [ ] 18 AI 理解字段全有，intent ≥ 50 字真实推理
- [ ] type 选对（UI → dom，不要默认 canvas）
- [ ] render 签名与 type 匹配
- [ ] 零 `import` 关键字
- [ ] 颜色/坐标/字体写死，不 import token
- [ ] frame_pure: 无 Date.now / Math.random
- [ ] viewport-relative 坐标
- [ ] sample() 用真实业务内容
- [ ] node --check 通过
- [ ] nextframe scenes 列表能看到
- [ ] smoke + composite 视觉自查通过

## 下一步

全部组件验证通过后：

```bash
nf-guide produce timeline   # 进入 step 03，写 timeline JSON
```
