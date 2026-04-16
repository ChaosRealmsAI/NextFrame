# v0.9.3 Scene Type 收敛 — 5 种 → 2 种（dom + media）

## 背景

NextFrame v0.9 经过 shader/particle/motion 三次引擎抽象尝试（全部失败或过度设计），已决定把 scene type 收敛到 **只剩 dom + media 两种**。

**ADR-021** 已写好：`spec/cockpit-app/data/dev/adrs.json` 搜 `ADR-021`。
**roadmap.json** v0.9.3 已开 in-progress。

## 核心哲学

scene = JS 写的 HTML 模板函数。契约简化为：

```js
render(t, params, vp) → HTML 字符串
```

不再需要 canvas/svg/motion 分 type，组件内部爱写 `<canvas>` / `<svg>` / `<video>` / `<script>` 都可以，靠作者自己守 frame-pure。

**保留**：现有 scene 契约 v3 的字段（id/name/role/intent/sample/params/...）、CLI 接口（scene-new/lint/smoke/gallery/preview）、调用方式。
**简化**：type 系统；删 motion runtime；统一 render 入口。

## 任务清单（按顺序做完，全部跑通验证才能 commit）

### 1. 改 scene 契约枚举

- `src/nf-cli/src/commands/render/scene-smoke.ts` — `VALID_TYPES` Set 只留 `["dom", "media"]`
- `src/nf-cli/src/commands/render/scene-new.ts` — `TYPES` 数组只留 `["dom", "media"]`；`scaffold()` 函数删 canvas/svg/motion 分支（全部 fallthrough 到 dom）；`--type` help 文本改为 `dom | media`
- `src/nf-cli/src/commands/render/scene-lint.ts` — L5（SIG_MISMATCH）：只检查 type=dom 要 host、type=media 要 host；删 type=canvas 要 ctx、type=svg 要 host、type=motion/particle/shader 分支；删 L7（v0.9 的 frame-pure runtime lint，现在无 runtime 了）

### 2. 迁移现有 motion scene

读 `grep -rl 'type: *"motion"' src/nf-core/scenes/`，预期 5 个：
- `warm-editorial/fx-heartLike.js`
- `warm-editorial/fx-heartThrob.js`
- `warm-editorial/fx-bellShake.js`
- `warm-editorial/fx-sparkDart.js`
- `warm-editorial/fx-pageFlip.js`
- `warm-editorial/icon-quoteOpen.js`
- `warm-editorial/icon-leafRise.js`
- `warm-editorial/diagram-pathTrace.js`
- `warm-editorial/fx-attentionDart.js`
- `warm-editorial/fx-loadingPulse.js`
- `warm-editorial/icon-animatedCheck.js`

每个 motion scene 改写为 type=dom：
- 改 `type: "motion"` → `type: "dom"`
- render 函数签名从 `render(host, t, params, vp)` 改为 `render(host, t, params, vp)`（签名不变）— 但 return 从 config 对象改为 mutate host 或返回 HTML 字符串
- 原 `return { duration, size, layers: [...] }` 改为在 render 内部用 t 计算 transform/opacity 后 `host.innerHTML = <svg>...</svg>`
- 保留原视觉效果（behavior: impact 要展开成 t-driven 的 squash/stretch/overshoot）
- 在组件文件底部 inline 需要的工具函数（easing / escape / svg shape path）
- 保留 shape path（heart/bell/check/leaf/sparkle/...）：inline 到组件里
- **frame_pure: false**（因为读 t 做动画）

### 3. 类似地迁移现有 canvas / svg scene（如果有）

- `grep -rl 'type: *"canvas"' src/nf-core/scenes/` → 可能有的都改为 type=dom，render 里 `host.innerHTML = '<canvas width="..." height="..."></canvas>'` 然后 `host.querySelector('canvas').getContext('2d').fillRect(...)`
- `grep -rl 'type: *"svg"' src/nf-core/scenes/` → 改 type=dom，render 里 `host.innerHTML = '<svg>...</svg>'`

### 4. 删 motion runtime

- `rm src/nf-core/engine/runtime/motion.js`
- 如果 `src/nf-core/engine/runtime/` 目录空了，删目录
- `scripts/lint-boundary.sh` 把 `src/nf-core/engine/runtime` 从 `JS_ZONES` 删掉（如无文件就没必要保留）

### 5. 清 gallery/preview runtime import

- `src/nf-cli/src/commands/render/scene-gallery.ts` — 删 `import { renderMotion as __nfMotionRender } from '/src/nf-core/engine/runtime/motion.js';` 行；删 mountMotion 函数；渲染逻辑简化为：统一 `stage.innerHTML = c.render(host, 0.5, params, VP)`（统一调用，不再分 type）
- `src/nf-cli/src/commands/render/scene-preview.ts` — 同样删 motion 相关 import 和 renderAt 的 motion 分支；删 shader/particle 遗留分支；renderAt 简化为 `stage.innerHTML = ''; c.render(stage, t, params, VP);`

### 6. build-scenes.ts 清理

- `src/nf-core/engine/build-scenes.ts` — 删 `__v09_type` 相关 dispatcher 代码；v3 adapter 简化为：render 要么 mutate host（旧 dom/canvas/svg/media 习惯），要么返回 string（新 v4 习惯），两种都兼容

### 7. nf-guide recipe 更新

- `src/nf-guide/recipes/component/00-pick.md`：
  - 标题 `### type（5 选 1）` 改为 `### type（2 选 1）`
  - 表格只留 dom / media 两行
  - 删『motion — 矢量语义动画』小节
  - 删『canvas — 逐像素手绘』小节
  - 删『svg — 矢量图形』小节
  - §2.5 图>文铁律删『能不能用矢量动画』条目
  - 决策表 `type: (dom/canvas/svg/media/motion)` 改为 `type: (dom | media)`
  - 画面分层公式改简化版
  - 加一段说明："所有技术性（Canvas/SVG/WebGL/3D/filter）都在 dom type 的 HTML 字符串里自由实现"
- `src/nf-guide/recipes/component/01-aesthetics.md`：删所有提到 motion/canvas/svg type 美学的段落
- `src/nf-guide/recipes/component/02-craft.md`：
  - 示例 scene-new 命令删 --type=motion 的
  - §1.5 强约束表删 motion/canvas/svg 行
- `src/nf-guide/recipes/component/03-verify.md`：
  - §3 新 type 查看方式删 motion / canvas / svg
  - §3.5 gallery 截图像素门禁保留
- `src/nf-guide/recipes/component/pitfalls.md`：
  - 坑 19（motion viewBox）删
  - 坑 20（particle Math.random）确认已是历史记录标记
  - 加新坑：『坑 21 · scene type 过度抽象』讲 ADR-021 的教训

### 8. ADR-020 标 superseded

- `spec/cockpit-app/data/dev/adrs.json` ADR-020 `status` 改为 `"superseded"`
- 加字段 `"superseded_by": "ADR-021"`

### 9. architecture.md 更新

- `spec/cockpit-app/architecture/v09-scene-engines.md` 标为 historical；
- 新建 `architecture/v09-scene-simplified.md`（100 字即可）说明 v0.9.3 后的极简 scene 模型

## 验证（全过才能 commit）

```bash
# 1. 无残留
grep -rn '"motion"\|"shader"\|"particle"' src/nf-cli/src/commands/render/ src/nf-core/engine/ | grep -v node_modules | head
grep -rn 'type: *"motion"\|type: *"shader"\|type: *"particle"' src/nf-core/scenes/ | head

# 2. smoke 全 pass
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=warm-editorial
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm

# 3. lint 无 v0.9.3 新引入 error（v0.5 遗留技术债可有）
node src/nf-cli/bin/nextframe.js scene-lint --ratio=16:9 --theme=warm-editorial

# 4. gallery 能生成
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=16:9 --theme=warm-editorial --no-server --no-open

# 5. Rust + lint-all
cargo check --workspace
cargo clippy --workspace -- -D warnings
bash scripts/lint-all.sh

# 6. scene-new --type=dom 能生成
node src/nf-cli/bin/nextframe.js scene-new --id=_test93 --type=dom --role=bg --ratio=16:9 --theme=warm-editorial
rm src/nf-core/scenes/16x9/warm-editorial/bg-_test93.js
```

## commit 格式

主仓（nf-core + nf-cli + scripts）：
```
fix(v0.9.3): collapse scene types 5→2 (dom + media only)

What: delete motion runtime, migrate 10+ motion/canvas/svg scenes to type=dom, simplify all CLI type dispatchers (scene-new/lint/smoke/gallery/preview)
Why: ADR-021 — scene = JS 写的 HTML 模板函数。AI 写 HTML 比写 engine schema 强。type 只做语义分类不做技术分类。
```

spec 子仓（recipe + adrs + architecture）：
```
docs(v0.9.3): recipe + architecture 跟随 ADR-021 收敛到 dom + media

What: nf-guide recipe 5 type → 2 type；ADR-020 标 superseded；新建 v09-scene-simplified.md
```

## 注意

- **保留所有 motion scene 的视觉效果** — 只改内部实现（从返回 config → 返回/mutate HTML）；smoke + gallery 看起来要和原来一致
- **完全不碰 timeline / build.ts / recorder** — v0.8 还在重构中
- **不碰 media scene**（bg-photoBlur 等）— 它已经是简单 type=media
- 不改 existing scene 契约字段（intent/sample/params/...）— 只改 type 和 render 实现

## 时长

预计 30-40 分钟。高优先级是 motion scene 迁移 + CLI type 清理。

开始干吧。
