# v0.9 Scene Engines — 全版本审计 Review

## 背景

NextFrame v0.9 新增 3 种 scene type（shader / particle / motion），零外部依赖，全部 frame-pure。已完成：
- 3 runtime（engine/runtime/{shader,particle,motion}.js）
- 15 首发组件（5 shader + 5 particle + 5 motion）
- CLI 扩展（scene-new/lint/smoke 支持 7 种 type）
- gallery + detail page 预览全通
- playwright 验证 20 组件 × 3 时间点 = 60 检查全 PASS

## 你的任务

**对 v0.9 全部改动做代码审计**，输出 review 报告到 `/Users/Zhuanz/bigbang/NextFrame/tmp/v09-review-report.md`。

### 审计维度（逐条检查，给 PASS / WARN / FAIL + 理由）

1. **ADR-020 契约符合性**
   - 读 `spec/cockpit-app/data/dev/adrs.json` 的 ADR-020
   - 检查 3 runtime 是否实现了 ADR 声明的契约（shader: frag+uniforms / particle: emitter+field+render / motion: layers+behaviors+shapes）
   - 检查 15 组件是否符合 render 返回值契约

2. **Frame-pure 硬约束**
   - 读 scene-lint L7 规则（`src/nf-cli/src/commands/render/scene-lint.ts`）
   - 在 15 个新组件里搜 `Math.random` / `Date.now` / `performance.now` / `setInterval` / `setTimeout` / `requestAnimationFrame`
   - 有任何一个 → FAIL

3. **TS/JS 边界**
   - runtime/*.js 必须在 JS-only zone
   - 不能有同名 .ts/.js 对
   - 读 `scripts/lint-boundary.sh` 确认 runtime/ 在 JS_ZONES 里

4. **文件大小**
   - 每个 prod 文件 ≤ 500 行
   - `wc -l src/nf-core/engine/runtime/*.js src/nf-core/scenes/16x9/anthropic-warm/{bg-,fx-,icon-,diagram-}*.js`

5. **Scene v3 契约完整性**
   - 每个新组件必须有 11 required 字段（id/name/version/ratio/theme/role/description/type/frame_pure/render/sample）
   - intent ≥ 50 字

6. **组件视觉质量（主观判断）**
   - 读每个组件的 render 函数，评估：
     - shader: GLSL 复杂度是否足够出好看效果（不是一行 sin 了事）
     - particle: 粒子数/颜色/运动是否有视觉层次
     - motion: SVG path 是否正确（勾号是一笔画还是断的？爱心对称吗？）
   - 给每个组件 1-5 分

7. **scene-smoke 兼容性**
   - 读 `src/nf-cli/src/commands/render/scene-smoke.ts`
   - 新 type 分支（shader/particle/motion）是否验证返回值结构
   - --verify-frame-pure 是否有实现（哪怕是 skeleton）

8. **scene-gallery + scene-preview 渲染管线**
   - 读 `scene-gallery.ts` 和 `scene-preview.ts`
   - mountShader / mountParticle / mountMotion 是否正确
   - motion 用了 MOTION_VP 400x400 — 这是 hack 还是合理的？

9. **nf-guide recipe 更新**
   - 读 `src/nf-guide/recipes/component/00-pick.md`
   - type 选择列表是否已更新到 7 种
   - 如果没更新 → WARN

10. **安全 / 代码卫生**
    - 禁 `var`（const/let only）
    - 禁 `console.log` 在 prod 代码
    - 禁 TODO/FIXME/HACK/XXX
    - 无硬编码密钥/URL

## 输出格式

```markdown
# v0.9 Scene Engines — Review Report

**审计时间**: {时间}
**审计范围**: v0.9 全部改动（3 runtime + 15 组件 + CLI + gallery）

## Summary Score: {X}/10

## 逐维度审计

### 1. ADR-020 契约符合性: PASS/WARN/FAIL
{详细发现}

### 2. Frame-pure 硬约束: PASS/WARN/FAIL
{grep 结果}

...（10 个维度全写）

## 发现的问题（按严重度排序）
1. [CRITICAL] ...
2. [WARN] ...
3. [INFO] ...

## 建议修复优先级
1. ...
```

## 约束
- 只读不改代码
- 报告写到 `tmp/v09-review-report.md`
- 评分客观，有问题就说
