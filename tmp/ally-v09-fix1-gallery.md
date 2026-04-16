# Fix 1: gallery/preview shader uniform 类型 + composite 兼容

## 问题（Review 报告 CRITICAL + HIGH）
1. `scene-gallery.ts` 和 `scene-preview.ts` 的 `mountShader()` 用 `gl.uniform1f()` 上传所有 custom uniforms，但 `bg-rippleWater` 声明了 `uniform vec2 uOrigins[3]` 需要 `gl.uniform2fv()`。真实 runtime/shader.js 已支持 typed uniforms。
2. gallery `--composite` 对 shader/particle/motion 不兼容（config-returning 会被丢掉）。
3. scene-preview 的 motionVP 400x400 hack 在 detail page 不合理（应该用真实 VP）。

## 修复方案

### 1a. mountShader uniform 类型检测
在 `mountShader()` 和 scene-preview 的 shader 分支里，替换 `gl.uniform1f(u, Number(v))` 为类型检测：
```js
if (Array.isArray(v)) {
  if (v.length === 2) gl.uniform2fv(u, new Float32Array(v));
  else if (v.length === 3) gl.uniform3fv(u, new Float32Array(v));
  else if (v.length === 4) gl.uniform4fv(u, new Float32Array(v));
  else gl.uniform1fv(u, new Float32Array(v));
} else {
  gl.uniform1f(u, Number(v));
}
```

### 1b. composite 新 type 兼容
在 gallery composite 分支里（搜 `scene-composite`），加 shader/particle/motion 处理：跟 mountShader/mountParticle/mountMotion 相同逻辑。

### 1c. scene-preview motionVP 修复
detail page 用 VP（真实尺寸），不再用 MOTION_VP 400x400。Gallery 缩略图保留 400x400 hack 是 OK 的。

## 文件
- `src/nf-cli/src/commands/render/scene-gallery.ts`
- `src/nf-cli/src/commands/render/scene-preview.ts`

## 验证
```bash
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=16:9 --theme=anthropic-warm --no-server --no-open
# 预期：生成成功无报错
```

## commit
```
fix(v0.9): gallery/preview shader typed uniforms + composite new type compat
```
