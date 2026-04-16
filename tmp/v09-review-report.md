# v0.9 Scene Engines — Review Report

**审计时间**: 2026-04-16 09:51:04 CST
**审计范围**: v0.9 全部改动（3 runtime + 15 组件 + CLI + gallery）

## Summary Score: 7/10

整体结论：首发 15 个组件本身质量合格，frame-pure 和边界约束基本守住；真正的短板在工具链收尾，尤其是 `scene-smoke` 未按 ADR-020 完成、`scene-gallery` / `scene-preview` 没复用 runtime 导致新类型预览链路和真实 runtime 已发生漂移。

## 逐维度审计

### 1. ADR-020 契约符合性: WARN

PASS 部分：
- `shader` runtime 已实现 `frag + uniforms` 主契约，且支持 typed uniforms，不只是标量：见 [shader.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/shader.js:99) 与 [shader.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/shader.js:228)。
- `motion` runtime 已实现 ADR 要求的 `layers + behaviors + shapes` 语义层，`expandLayer()` 支持 `ripple` / `burst` / behavior 展开，`renderMotion()` 输出 SVG：见 [motion.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/motion.js:207)。
- 15 个首发组件的 `render()` 返回值都和当前实际 runtime 一致：
  - 5 个 shader: `{ frag, uniforms, fallback_gradient }`
  - 5 个 particle: `{ emitter, render }`
  - 5 个 motion: `{ duration, size, layers }`

WARN 原因：
- `particle` runtime 注释声明 `field(x,y,t) -> {vx,vy}` 或 `{x,y}`，但实际实现只是 `Object.assign(particle, delta)`，并没有把 `{vx,vy}` 积分回位置；`lifespan` 也在 `normalizeEmitter()` 中被直接丢弃。ADR 文本与实现不完全一致：见 [particle.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/particle.js:4)、[particle.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/particle.js:80)、[particle.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/particle.js:101)。
- ADR-020 对 `motion` 的原文契约是 `motion = { duration, fps, size, layers[] }`，但 runtime 和 5 个 motion 组件都只使用 `{ duration, size, layers }`，未见 `fps` 字段：见 [adrs.json](/Users/Zhuanz/bigbang/NextFrame/spec/cockpit-app/data/dev/adrs.json:1131)、[motion.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/motion.js:207)、[fx-heartLike.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/anthropic-warm/fx-heartLike.js:46)。

结论：
- “首发组件可用”层面成立。
- “严格按 ADR 原文完全落地”层面还差最后一截。

### 2. Frame-pure 硬约束: PASS

依据：
- `scene-lint` L7 已加入新类型规则：`shader/motion` 禁 `setInterval/setTimeout/requestAnimationFrame`，`motion` 禁 `Date.now/performance.now`，`particle` 禁 `Math.random`：见 [scene-lint.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-lint.ts:126)。
- 对 15 个新组件全文搜索：
  - `Math.random`
  - `Date.now`
  - `performance.now`
  - `setInterval`
  - `setTimeout`
  - `requestAnimationFrame`
- 结果：**无命中**。

说明：
- 搜索命中的只有 runtime/CLI 注释和 preview 播放器代码，不在这 15 个 scene 组件里。

### 3. TS/JS 边界: PASS

依据：
- `scripts/lint-boundary.sh` 已把 `src/nf-core/engine/runtime` 放进 `JS_ZONES`：见 [lint-boundary.sh](/Users/Zhuanz/bigbang/NextFrame/scripts/lint-boundary.sh:33)。
- Rule 3 也明确把 `src/nf-core/engine/runtime/*` 作为 `nf-core/engine` 里的 JS-only 例外：见 [lint-boundary.sh](/Users/Zhuanz/bigbang/NextFrame/scripts/lint-boundary.sh:60)。
- 同名 `.ts/.js` 对搜索结果为空。
- 3 个 runtime 文件均为 `.js`，符合 browser-inline zone 约束。

### 4. 文件大小: PASS

`wc -l` 结果：

| 文件组 | 行数结果 |
|---|---:|
| `runtime/shader.js` | 343 |
| `runtime/particle.js` | 158 |
| `runtime/motion.js` | 225 |
| 最大 scene 文件 | `bg-noiseField.js` = 214 |

结论：
- 所有新增 prod 文件都低于 500 行限制。

### 5. Scene v3 契约完整性: PASS

自动核对结果：
- 15/15 新组件都具备 11 个 required 字段：
  - `id`
  - `name`
  - `version`
  - `ratio`
  - `theme`
  - `role`
  - `description`
  - `type`
  - `frame_pure`
  - `render`
  - `sample`
- 15/15 的 `intent` 都 ≥ 50 字，范围为 **175 - 222** 字。

结论：
- 这批组件的 scene v3 元数据完整性是过关的。

### 6. 组件视觉质量（主观）: PASS

总体判断：
- 没发现明显“凑数件”或几何错误件。
- shader 里 `noiseField` / `auroraMesh` 最强，particle 里 `starfield` / `connectGraph` 层次最好，motion 里 `heartLike` 可读性最高。
- motion shape 检查通过：
  - `check` 是单一连续 path，不是断开的两笔。
  - `heart` path 近似左右对称，没有明显歪斜。

评分：

| 组件 | 分数 | 简评 |
|---|---:|---|
| `bg-gradientFlow` | 3 | 比“一行 sin”好很多，但仍是首发 shader 里最保守的一档 |
| `bg-noiseField` | 5 | 内联 simplex + fbm，质感成立 |
| `bg-rippleWater` | 4 | 3 波源 + caustic，隐喻清楚 |
| `bg-auroraMesh` | 5 | curtain/bands/mesh 都到位，是 hero 级背景 |
| `fx-screenFilm` | 4 | subtle，但 grain/vignette/fringe 配比合理 |
| `bg-starfield` | 4 | 近远景、冷暖色、十字 flare 都有层次 |
| `bg-snowfall` | 4 | 深度、风向、回卷逻辑清楚 |
| `fx-sparkBurst` | 4 | 尾迹 + glow + head 组合完整 |
| `fx-connectGraph` | 4 | 节点/连线/透明度关系成立 |
| `fx-floatMotes` | 3 | 完成度足够，但辨识度最低 |
| `fx-heartLike` | 5 | semantic 组合最完整，情绪读得最快 |
| `fx-loadingPulse` | 3 | 可靠但偏保守 |
| `icon-animatedCheck` | 4 | path reveal + pop 合理，确认感清楚 |
| `fx-attentionDart` | 4 | 指向性强，功能明确 |
| `diagram-pathTrace` | 4 | 说明性很强，适合流程/链路镜头 |

### 7. scene-smoke 兼容性: FAIL

现状：
- 新类型分支是有的：见 [scene-smoke.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-smoke.ts:148)。
- 但实现仍停在 walking skeleton：
  - per-type return shape 验证还只是 TODO
  - `--verify-frame-pure` 还是 TODO
  - 当前只检查“返回值是不是 object”，没有做 ADR 承诺的像素/状态/SVG 一致性验证

证据：
- [scene-smoke.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-smoke.ts:150)
- [scene-smoke.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-smoke.ts:154)

结论：
- 从“有分支”角度看是接上了。
- 从“ADR-020 promised smoke coverage 已交付”角度看，**没有交付**。

### 8. scene-gallery + scene-preview 渲染管线: FAIL

主要问题 1：两条预览链路没有复用 `runtime/shader.js` / `runtime/particle.js`，而是各自手写了一套简化实现。

这直接导致功能漂移：
- `scene-gallery` / `scene-preview` 的 `mountShader()` 统一用 `gl.uniform1f()` 上传 custom uniforms：见 [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:220)、[scene-preview.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-preview.ts:225)。
- 但真实 shader runtime 已支持数组 / vec / matrix typed uniforms：见 [shader.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/shader.js:228)。
- `bg-rippleWater` 明确声明 `uniform vec2 uOrigins[3]`，并返回 `uOrigins: flattenOrigins(...)` 数组：见 [bg-rippleWater.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/anthropic-warm/bg-rippleWater.js:95)、[bg-rippleWater.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/anthropic-warm/bg-rippleWater.js:134)。

结论：
- **真实 runtime 能跑，gallery/preview 不一定能正确预览。**
- 这是目前最实质的回归风险。

主要问题 2：`scene-gallery --composite` 对新类型不兼容。

证据：
- composite 分支里只有 canvas 特判，其他类型直接 `c.render(layer, ...)`，返回 config 后就被丢了：见 [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:290)。

结论：
- `shader/particle/motion` 进入 composite 时不会按真实 runtime 挂载，属于功能性缺口。

主要问题 3：`motionVP = 400x400` 是 hack，不是严格合理。

判断：
- 对 gallery 缩略图来说，它能让 icon 类 motion 在缩略图里“看得见”，这一点是合理的。
- 但对 detail preview 来说，它会让 16:9 scene 用一个居中的 1:1 坐标系渲染，预览不再等同真实时间线坐标。见 [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:250)、[scene-preview.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-preview.ts:257)。

结论：
- **gallery 可接受为 thumbnail hack**
- **preview 不应继续沿用**

### 9. nf-guide recipe 更新: WARN

现状：
- `00-pick.md` 仍然写的是 “type（4 选 1）”，只列 `dom / canvas / svg / media`：见 [00-pick.md](/Users/Zhuanz/bigbang/NextFrame/src/nf-guide/recipes/component/00-pick.md:22)。
- 后文也还在引导 “粒子/波形/滤镜 => 强制 type=canvas”：见 [00-pick.md](/Users/Zhuanz/bigbang/NextFrame/src/nf-guide/recipes/component/00-pick.md:81)。

结论：
- v0.9 已经把 scene type 扩到 7 种，但 AI 的 recipe 入口还停在旧世界。
- 这不会影响 runtime，但会直接影响后续 AI 继续产出正确 scene 的能力。

### 10. 安全 / 代码卫生: WARN

PASS 部分：
- 未发现 `var`
- 未发现 `console.log`
- 未发现硬编码密钥

WARN 部分：
- TODO 仍留在 CLI prod 代码里：
  - [scene-lint.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-lint.ts:127)
  - [scene-smoke.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-smoke.ts:150)
- preview/gallery 存在硬编码 URL：
  - 远程 CSS CDN： [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:128)、[scene-preview.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-preview.ts:75)
  - 本地 `http://localhost` 生成链接： [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:401)、[scene-preview.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-preview.ts:388)

结论：
- 不是安全事故级别问题。
- 但按你给的 hygiene 标准，还不能算完全干净。

## 发现的问题（按严重度排序）

1. [CRITICAL] `scene-gallery` / `scene-preview` 的 shader 挂载逻辑把所有 custom uniform 都当成 `uniform1f` 上传，和真实 `runtime/shader.js` 已经脱节；`bg-rippleWater` 的 `uOrigins[3]` 这类数组 uniform 在预览链路里会错。见 [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:220)、[scene-preview.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-preview.ts:225)、[bg-rippleWater.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/anthropic-warm/bg-rippleWater.js:95)、[shader.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/shader.js:228)。
2. [HIGH] `scene-smoke` 对 `shader/particle/motion` 只验证“返回了 object”，没有实现 ADR-020 承诺的 per-type shape 验证，也没有 `--verify-frame-pure`。见 [scene-smoke.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-smoke.ts:148)。
3. [HIGH] `scene-gallery --composite` 对 config-returning scene type 不兼容，`shader/particle/motion` 图层进入 composite 时不会真实挂载。见 [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:302)。
4. [MEDIUM] `particle` runtime 与 ADR 文本仍有偏差：`lifespan` 未实现，`field -> {vx,vy}` 没有被积分进位置，只是直接挂到 particle 对象上。见 [particle.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/particle.js:80)、[particle.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/engine/runtime/particle.js:101)。
5. [MEDIUM] `motion` 真实契约已收敛为 `{duration,size,layers}`，但 ADR-020 文字仍写 `{duration,fps,size,layers}`；runtime 和 5 个组件都没有 `fps`。见 [adrs.json](/Users/Zhuanz/bigbang/NextFrame/spec/cockpit-app/data/dev/adrs.json:1131)、[fx-heartLike.js](/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/anthropic-warm/fx-heartLike.js:46)。
6. [WARN] `nf-guide` 的 component recipe 还只教 4 种 type，后续 AI 会继续把本该是 `shader/particle/motion` 的组件写回老类型。见 [00-pick.md](/Users/Zhuanz/bigbang/NextFrame/src/nf-guide/recipes/component/00-pick.md:22)。
7. [WARN] `MOTION_VP = 400x400` 作为 gallery thumbnail hack 可以理解，但放到 detail preview 会失真，不是严格正确的预览。见 [scene-gallery.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-gallery.ts:250)、[scene-preview.ts](/Users/Zhuanz/bigbang/NextFrame/src/nf-cli/src/commands/render/scene-preview.ts:257)。
8. [INFO] hygiene 还差最后一轮清理：有 TODO、有硬编码 preview URL，但没有 `var` / `console.log` / secret。

## 建议修复优先级

1. 先把 `scene-gallery` / `scene-preview` 改成直接复用 `runtime/shader.js` 与 `runtime/particle.js`，不要再维护平行实现；这会一次性修掉 uniform typing 漂移和后续更多兼容问题。
2. 完成 `scene-smoke` 的 v0.9 收尾：至少校验 `shader/particle/motion` 的返回 shape，并补一个可工作的 `--verify-frame-pure`。
3. 修 `scene-gallery --composite` 对新类型的挂载逻辑，否则“gallery 全通”并不覆盖 composite 模式。
4. 统一 ADR-020 / runtime / 首发组件的 motion contract；要么补 `fps`，要么改 ADR 文本，避免规范与实现长期分叉。
5. 明确 `particle.field` 的真正语义：如果保留 `{vx,vy}`，就把它积分到位置；如果不保留，就把 ADR 和 runtime 注释改成“返回位置修正”。
6. 更新 `nf-guide` recipe 到 7 种 type，这是防止后续 AI 继续写旧风格 scene 的基础设施工作。
7. 最后再清理 TODO 和 preview URL 硬编码，把 hygiene 收口。
