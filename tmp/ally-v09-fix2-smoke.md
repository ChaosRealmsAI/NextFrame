# Fix 2: scene-smoke per-type shape 验证 + verify-frame-pure

## 问题（Review 报告 HIGH）
scene-smoke 新 type 分支只检查 `typeof out === 'object'`，没验证返回值结构。ADR-020 承诺了 per-type shape 验证和 `--verify-frame-pure`。

## 修复方案

### 2a. per-type shape 验证
在 `scene-smoke.ts` 的 `shader/particle/motion` 分支里，加结构检查：
```ts
if (cr.type === "shader") {
  if (typeof out.frag !== "string") result.errors.push("shader render() must return { frag: string }");
} else if (cr.type === "particle") {
  if (!out.emitter || typeof out.emitter !== "object") result.errors.push("particle render() must return { emitter: object }");
  if (typeof out.render !== "function") result.errors.push("particle render() must return { render: function }");
} else if (cr.type === "motion") {
  if (!Array.isArray(out.layers)) result.errors.push("motion render() must return { layers: array }");
  if (!Array.isArray(out.size) || out.size.length !== 2) result.errors.push("motion render() must return { size: [w, h] }");
}
```

### 2b. --verify-frame-pure 基础实现
加 `--verify-frame-pure` flag：
- 对每个组件，同 (t=1.23, params=sample()) 调 render 两次
- shader: 比较两次 frag + uniforms JSON.stringify 相等
- particle: 用 dumpState() 两次比较 JSON.stringify 相等（已有此函数）
- motion: 用 renderMotion() 两次比较返回的 SVG 字符串相等
- 结果输出 `{ id, pass: boolean, diff?: string }`

### 2c. 删 TODO 注释
把 `scene-smoke.ts` 和 `scene-lint.ts` 里的 `// TODO(v0.9 implement):` 注释删掉或替换为实际代码。prod 代码禁 TODO。

## 文件
- `src/nf-cli/src/commands/render/scene-smoke.ts`
- `src/nf-cli/src/commands/render/scene-lint.ts`（删 TODO 注释）

## 验证
```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=16:9 --theme=anthropic-warm
# 预期：20/20 pass，shader/particle/motion 新检查点不报错

node src/nf-cli/bin/nextframe.js scene-lint --ratio=16:9 --theme=anthropic-warm
# 预期：无 v0.9 引入的新 error

# 无 TODO 残留
grep -r "TODO" src/nf-cli/src/commands/render/scene-smoke.ts src/nf-cli/src/commands/render/scene-lint.ts
# 预期：0 match
```

## commit
```
fix(v0.9): scene-smoke per-type shape validation + verify-frame-pure
```
