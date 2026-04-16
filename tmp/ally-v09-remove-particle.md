# 删除 v0.9 particle type（完全移除）

## 背景
继 shader 移除之后，particle 也删除。scene type 从 6 减到 5（dom/canvas/svg/media/motion）。

**前提**：此任务在 shader removal 之后执行。git log 应能看到 `fix(v0.9.1): remove shader type` commit。

## 执行清单

### 1. 删 runtime
- `src/nf-core/engine/runtime/particle.js` 删除

### 2. 删所有 particle scene 文件
搜：`grep -rl 'type: *"particle"' src/nf-core/scenes/` → 删
预期 7 个：
- anthropic-warm: bg-starfield.js / bg-snowfall.js / fx-sparkBurst.js / fx-connectGraph.js / fx-floatMotes.js
- warm-editorial: bg-dustMotes.js / overlay-inkSplatter.js

### 3. 从 VALID_TYPES / TYPES 删 particle
- `src/nf-cli/src/commands/render/scene-smoke.ts` — VALID_TYPES 删 "particle"；删 validateRuntimeShape 的 particle 分支；删 verifyFramePure 的 particle 分支；去掉 `import { dumpState } from particle.js`
- `src/nf-cli/src/commands/render/scene-new.ts` — TYPES 数组删 "particle"；scaffold() 删 particle 分支
- `src/nf-cli/src/commands/render/scene-lint.ts` — 删 L7 particle(Math.random) 规则；SIG_MISMATCH 新类型分支移除 particle

### 4. gallery + preview 删 mountParticle
- `scene-gallery.ts` — 删 mountParticle 函数 + particle dispatch 分支 + `tag-type-particle` CSS
- `scene-preview.ts` — 删 particle 分支 + mulberry32 inline 代码

### 5. ADR-020 再次更新（v0.9.2）
- `spec/cockpit-app/data/dev/adrs.json` ADR-020
- engines 数组里 particle 对象删除
- firstparty_components 里 particle 数组删除
- title 改为 "Scene 渲染引擎扩展 — 新增 type: motion（frame-pure）"
- 加 superseded_reason 记录：particle 视觉质量同样不够，v0.9.2 移除

### 6. nf-guide recipe 更新
- `00-pick.md` — 标题 `6 选 1` 改 `5 选 1`；表格删 particle 行；§1 设计选型指南删 particle 小节；§2.5 删"能不能用确定性粒子系统？"；决策表类型列表删 particle；画面分层公式删 particle 层
- `01-aesthetics.md` 删 particle 美学
- `02-craft.md` — 示例删 `--type=particle`；§1.5 强约束表删 particle 行；坑 20 (Math.random) 注明已废除
- `03-verify.md` — 删 `particle → Canvas 2D 粒子分层...`；删 frame-pure 复验里 particle 行
- `pitfalls.md` — 坑 20 (particle Math.random) 改为历史记录标记「已随 particle 移除废除」或直接删

### 7. prototype + architecture + features + roadmap
- `spec/cockpit-app/prototypes/v09-scene-engines.html` — 删 PARTICLE 列。只剩 MOTION 一列
- `spec/cockpit-app/architecture/v09-scene-engines.md` — stack diagram 删 particle；删 particle 模块职责行；rejected alternatives 保留
- `spec/cockpit-app/data/plan/features.json` v09-scene-engines 删 "particle runtime" feature
- `spec/cockpit-app/roadmap.json` v0.9 goal/acceptance 从 "particle + motion" 改为 "motion"

## 验证

```bash
# 无 particle 残留
grep -rn '"particle"' src/nf-cli/ src/nf-core/engine/ 2>&1 | head
grep -rn "type: *['\"]particle" src/nf-core/scenes/ 2>&1 | head
# 预期：除 pitfalls 历史备注，无命中

# smoke
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=warm-editorial
# 预期：全 pass（再减 7 个）

# lint-all
cargo check --workspace
cargo clippy --workspace -- -D warnings
bash scripts/lint-all.sh
# 预期：全绿
```

## commit（分两个）

main repo:
```
fix(v0.9.2): remove particle type — visual quality insufficient

scene types 6→5（dom/canvas/svg/media/motion）
```

spec/cockpit-app:
```
docs(v0.9.2): remove particle from ADR/recipe/prototype/architecture
```

## 约束
- 只删 particle，不动其他
- 保留已有 shader 移除的成果，不回退
- 执行完验证通过才 commit
