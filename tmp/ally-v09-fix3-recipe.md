# Fix 3: nf-guide recipe 4→7 + ADR fps 修正

## 问题（Review 报告 WARN + MEDIUM）
1. nf-guide 组件 recipe 00-pick.md 还是"type（4 选 1）"，AI 做组件不知道有 shader/particle/motion。
2. ADR-020 写了 `fps` 字段但 runtime 和组件都没用。

## 修复方案

### 3a. 00-pick.md type 列表 4→7
在 `### type（4 选 1 — 决定 render 签名）` 处：
- 改标题为 `### type（7 选 1 — 决定 render 签名）`
- 添加三行到 type 表格：

```
| **shader** | GPU 背景效果（流光/噪声/水波/极光） | `render(host, t, params, vp)` → `{ frag, uniforms? }` |
| **particle** | 确定性粒子（星场/雪/火花/连线/浮尘） | `render(host, t, params, vp)` → `{ emitter, field?, render }` |
| **motion** | 矢量语义动画（点赞/图标/涟漪/路径描边） | `render(host, t, params, vp)` → `{ duration, size, layers }` |
```

- 在 §2.5 图 > 文铁律的选 type 流程里加：
  - "能不能用 GPU shader 画？（流光/噪声/水波/极光 → 强制 type=shader）"
  - "能不能用确定性粒子系统？（星场/雪/爆发/连线 → 强制 type=particle）"
  - "能不能用矢量动画？（点赞/图标弹跳/路径描边 → 强制 type=motion）"

- 在决策表里 `type:` 改为 `(dom/canvas/svg/media/shader/particle/motion)`

### 3b. 01-aesthetics.md 加新 type 美学要求
在合适的位置（§8 区域）加：
- shader 美学：GLSL 必须 ≥ 20 行，不能只有一个 sin 函数了事；推荐从 Shadertoy 扒成熟 shader 重写
- particle 美学：深度分层（near/mid/far）+ 色温梯度 + 呼吸透明度；不能全部同大小同颜色
- motion 美学：优先用 behavior 预设，不要手写 keyframe track（AI 写的 track 容易不自然）

### 3c. 02-craft.md 加新 type 创建指引
在 `scene-new` 调用部分加 `--type=shader|particle|motion` 示例。说明 runtime API：
- shader: render 返回 frag 字符串，框架自动注入 uT/uR
- particle: emitter.spawn 函数用 mulberry32 的 rng，禁 Math.random
- motion: 用 behavior 名 + shape 名 + layers 组合

### 3d. 03-verify.md 加新 type 验证
- L7 规则说明（shader 禁 rAF/setTimeout；particle 禁 Math.random；motion 禁 Date.now）
- gallery 新 type 查看方式（shader → WebGL canvas / particle → Canvas 2D / motion → SVG）
- --verify-frame-pure 说明

### 3e. pitfalls.md 加新 type 坑
追加 3 条：
- pit 18: shader GLSL 含反引号 → gallery inline 断裂（用 `<script src>` import 而非 template literal 内联）
- pit 19: motion viewBox 用了 1920x1080 但 shape size 只有 100 → 缩略图看不到（gallery 用 400x400 VP 预览）
- pit 20: particle render 函数里写 Math.random → L7 lint 拦截，用 mulberry32(emitter.seed + i*37)

### 3f. ADR-020 fps 修正
在 `spec/cockpit-app/data/dev/adrs.json` 的 ADR-020 motion contract 里，把 `fps` 改为 optional：
```
"contract": "... motion = { duration, fps?, size:[w,h], layers[] }"
```
加注释：fps 在 v0.9 未使用（recorder 控制帧率，motion runtime 不关心 fps）。

## 文件
- `src/nf-guide/recipes/component/00-pick.md`
- `src/nf-guide/recipes/component/01-aesthetics.md`
- `src/nf-guide/recipes/component/02-craft.md`
- `src/nf-guide/recipes/component/03-verify.md`
- `src/nf-guide/recipes/component/pitfalls.md`
- `spec/cockpit-app/data/dev/adrs.json`（ADR-020 fps optional 修正）

## 验证
```bash
# recipe 引用完整性
cargo run -p nf-guide
cargo run -p nf-guide -- component
cargo run -p nf-guide -- component pick
# 预期：每步输出正常，pick 步骤提到 7 种 type

# ADR JSON 有效
python3 -c "import json; json.load(open('spec/cockpit-app/data/dev/adrs.json'))"
# 预期：OK

# grep 确认
grep -c "shader\|particle\|motion" src/nf-guide/recipes/component/00-pick.md
# 预期：≥ 6
```

## commit (在 spec 子仓库分别提交)
```
docs(v0.9): nf-guide recipe 4→7 types + ADR-020 fps optional
```
