# 删除 v0.9 shader type（完全移除）

## 背景
用户决定：shader type 写不好（AI 写 GLSL 质量差），完全删除。scene type 从 7 种减到 6 种（dom/canvas/svg/media/particle/motion）。

## 执行清单（必须全做完）

### 1. 删除 runtime 文件
- `src/nf-core/engine/runtime/shader.js` 删除

### 2. 删除所有 shader scene 文件
搜并删：`grep -rl 'type: *"shader"' src/nf-core/scenes/` → 删除文件
预期 7 个：
- anthropic-warm: bg-auroraMesh.js / bg-gradientFlow.js / bg-noiseField.js / bg-rippleWater.js / fx-screenFilm.js
- warm-editorial: bg-paperGrain.js / bg-warmGlow.js

### 3. 从 VALID_TYPES / TYPES 删 shader
- `src/nf-cli/src/commands/render/scene-smoke.ts` — VALID_TYPES Set 删 "shader"
- `src/nf-cli/src/commands/render/scene-new.ts` — TYPES const 数组删 "shader"，scaffold() 函数删 `type === "shader"` 分支

### 4. scene-lint L7 删 shader 规则
- `src/nf-cli/src/commands/render/scene-lint.ts` — 删 shader 相关的 L7 检查 + SIG_MISMATCH 里 shader 分支合并到通用分支
- 保留 particle(Math.random) 和 motion(Date.now) 的 L7

### 5. scene-smoke 删 shader 验证分支
- 删 `validateRuntimeShape` 里 shader 分支
- 删 `verifyFramePure` 里 shader 分支
- 保留 particle/motion 分支

### 6. scene-gallery + scene-preview 删 mountShader
- `scene-gallery.ts` — 删 `mountShader` 函数 + 删 shader dispatch 分支 + 删 CSS `tag-type-shader` 样式
- `scene-preview.ts` — 删 shader 分支 + 删 `_shaderCtx` 相关代码

### 7. ADR-020 更新
- `spec/cockpit-app/data/dev/adrs.json` 的 ADR-020
- 把 engines 数组里 shader 整个对象删掉
- 把 firstparty_components 里 shader 数组删掉
- title 改为 "Scene 渲染引擎扩展 — 新增 type: particle + motion（frame-pure）"
- decision 文本里去掉 shader
- 加一条 superseded_reason：shader 实际写作质量不可控（AI 写 GLSL 质量差、从 Shadertoy 扒又有授权问题），v0.9.1 移除

### 8. nf-guide recipe 更新（最重要）
- `src/nf-guide/recipes/component/00-pick.md` —
  - 标题 `### type（7 选 1）` 改为 `### type（6 选 1）`
  - 表格删 shader 行
  - §1 "7 种 type 的设计选型指南" 删 shader 小节
  - §2.5 图>文铁律删"能不能用 GPU shader 画？"一条
  - 决策表 `type: (dom/canvas/svg/media/shader/particle/motion)` 改为 `type: (dom/canvas/svg/media/particle/motion)`
  - "专业级画面分层公式" 删 shader 层，只留 particle/dom/svg/motion
- `src/nf-guide/recipes/component/01-aesthetics.md` 删 shader 美学要求
- `src/nf-guide/recipes/component/02-craft.md` —
  - §1 示例删 `scene-new --type=shader` 那一行
  - §1.5 type 强约束表删 shader 行
- `src/nf-guide/recipes/component/03-verify.md` —
  - §3 "新 type 的查看方式" 删 `shader → 看 WebGL canvas...`
- `src/nf-guide/recipes/component/pitfalls.md` —
  - 坑 18 如果是关于 shader 反引号断裂，删除该坑
  - 其他 shader 相关提及也删

### 9. prototype HTML
- `spec/cockpit-app/prototypes/v09-scene-engines.html` — 删 SHADER 那一列和相关 JS（mountShader / frame-pure proof panel 里的 shader run）。保留 PARTICLE + MOTION 两列。

### 10. features.json
- `spec/cockpit-app/data/plan/features.json` v09-scene-engines 模块里删 "shader runtime" feature

### 11. roadmap.json
- `spec/cockpit-app/roadmap.json` v0.9 goal/acceptance/note 里把 "shader + particle + motion" 改为 "particle + motion"

### 12. architecture.md
- `spec/cockpit-app/architecture/v09-scene-engines.md` — 删 shader 相关章节、stack diagram 里 shader 行

## 验证（全部跑通才能 commit）

```bash
# 1. 确认无 shader 残留
grep -rn '"shader"' src/nf-cli/ src/nf-core/engine/ 2>&1 | head
grep -rn "type: *['\"]shader" src/nf-core/scenes/ 2>&1 | head
# 预期：除了 pitfalls.md 的历史记录注释，其他都无命中

# 2. smoke
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=warm-editorial
# 预期：全 pass（减去 shader 组件）

# 3. lint-all
cargo check --workspace
cargo clippy --workspace -- -D warnings
bash scripts/lint-all.sh
# 预期：全绿

# 4. gallery 生成
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=16:9 --theme=warm-editorial --no-server --no-open
# 预期：无报错，组件数减到 11（warm-editorial）
```

## commit (分两个提交)

commit 1 in main repo (NextFrame):
```
fix(v0.9.1): remove shader type — AI write quality unacceptable

What: 删除 shader runtime + 7 shader scenes + CLI 所有 shader 分支 (smoke/lint/new/gallery/preview)
Why: AI 写 GLSL 视觉质量差，从 Shadertoy 扒有授权问题。scene type 从 7 回到 6。
```

commit 2 in spec/cockpit-app:
```
docs(v0.9.1): remove shader from ADR-020 + recipe + prototype + architecture

What: ADR-020 engines 删 shader / recipe 改 6 选 1 / prototype 删 shader 列 / architecture 删 shader stack
Why: v0.9.1 shader removal follow-up
```

## 约束
- 只删除 shader 相关，不动 particle/motion/dom 等其他 type
- 如果某文件删完 shader 后行数太少或结构破碎，保持文件存在但只含空壳也行（后续 v1.0 可能回来做）— 或者直接删整个文件，看哪个更干净
- 执行完所有验证通过才能 commit
