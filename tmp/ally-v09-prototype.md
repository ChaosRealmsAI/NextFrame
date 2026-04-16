# Task: v0.9 Scene Engines 原型 HTML + features.json

## 背景
NextFrame v0.9 新增 3 种 scene type：`shader`（WebGL fragment）、`particle`（确定性粒子）、`motion`（NF-Motion 矢量动画，对标 Lottie 自造）。本版**只做组件级预览**，不碰 timeline/build/recorder。

ADR: spec/cockpit-app/data/dev/adrs.json 的 ADR-020
POC 已跑通: tmp/nf-motion/engine.js（215 行 frame-pure NF-Motion runtime，13 帧像素级可复现）

## 任务 A · 产出原型 HTML

**路径**: `/Users/Zhuanz/bigbang/NextFrame/spec/cockpit-app/prototypes/v09-scene-engines.html`

### 设计决策（主 agent 已定）

- **布局**: 三列并排 + 全局 scrub bar，一眼看到 shader/particle/motion 在同一个 t 下的输出
- **每列**: live canvas（实际跑的 demo）+ type badge + 切换 source 按钮（展开代码片段）
- **底部**: frame-pure proof 面板 — 同 t 跑两次像素 diff = 0 的证据可视化
- **交互**: scrub bar 拖动 → 三列同步 seek；Play 按钮串联 3 秒演示；Dual-Render 按钮分屏比对

### 必须内嵌的 3 个真实 demo

1. **SHADER 列 — bg-auroraMesh 模拟**
   - 用 WebGL2 fragment shader 写极光 mesh gradient
   - uniform `uT`（时间）+ `uR`（分辨率）
   - shader 代码 30-50 行，必须真的能跑
   - 注释说明：`uT = scrub bar 当前 t`，拖动 scrub bar → shader 重新 draw

2. **PARTICLE 列 — bg-starfield 模拟**
   - 200 颗星，用 mulberry32 PRNG 按 id seed，位置由 (id, t, field) 确定
   - field = 慢速旋转的 noise，给星点视差感
   - 必须 frame-pure：`render(t=1.23)` 两次调用像素完全一样
   - canvas 2D 绘制即可

3. **MOTION 列 — fx-heartLike 迁入 tmp/nf-motion/engine.js**
   - 直接 inline tmp/nf-motion/engine.js 的 215 行 NF-Motion runtime
   - 用 tmp/nf-motion/heart-like.json 的 config
   - scrub 到 t=0.6 看 squash 阶段，t=0.9 看 sparkle burst
   - 展示 behavior: impact 语义配置 + 展开后的 keyframes

### Frame-Pure Proof 面板

一块区域，左右两个相同 canvas，标题 "render(t=1.23) · run 1 | run 2 · pixel diff"。两个 canvas 渲染同一组件同一 t，用 putImageData 对比像素差异数，显示 "diff: 0 ✓"。

### 样式基调

参考已有 `spec/cockpit-app/prototypes/v07-wysiwyg.html` 和 `recording-log-prototype.html` 的配色/字体/留白，保持一致。
字体栈：system-ui / 'SF Pro Display' / -apple-system
背景：深灰 #1a1a1d，卡片：#252528，强调色：#ff9ab8（motion 粉）/ #6eaaff（shader 蓝）/ #ffb44d（particle 金）
留白多，字号克制（7 级内）

### 状态

- loading（runtime 编译中，skeleton placeholder）
- ready（可交互）
- dual-render（分屏比对开启）
- error（WebGL 不支持时降级提示）

### 硬要求

- **单文件 HTML 零外部依赖**，不引任何 CDN（所有 runtime inline 进来，包括 motion engine.js 原样粘贴）
- 截图发给不知情的人，他以为这是真产品
- 所有数据真实，不用 Lorem ipsum
- 三个 demo 必须实际跑通，不是假图片

## 任务 B · 追加 features.json

**路径**: `/Users/Zhuanz/bigbang/NextFrame/spec/cockpit-app/data/plan/features.json`

**追加（不是覆盖）** 一个 v0.9 模块组：

```json
{
  "module": "v09-scene-engines",
  "title": "v0.9 Scene Engines 扩展",
  "ver": "v0.9",
  "features": [
    {"title": "shader runtime", "desc": "WebGL fragment shader 粘合层，uT/uR 自动注入", "tags": ["engine","gpu"], "status": "planned"},
    {"title": "particle runtime", "desc": "确定性粒子系统，mulberry32 PRNG + emitter/field/render", "tags": ["engine","frame-pure"], "status": "planned"},
    {"title": "motion runtime", "desc": "NF-Motion 语义矢量动画，behavior 预设 + keyframe tracks", "tags": ["engine","svg"], "status": "planned"},
    {"title": "scene-new --type 扩展", "desc": "支持 shader|particle|motion 骨架生成", "tags": ["cli","ai-ops"], "status": "planned"},
    {"title": "scene-lint L7", "desc": "三种 type 的 frame-pure AST 检查", "tags": ["cli","gate"], "status": "planned"},
    {"title": "scene-smoke 双渲染比对", "desc": "同 (t, params) 两次 render 像素/结构相等", "tags": ["cli","gate"], "status": "planned"},
    {"title": "15 首发组件", "desc": "5 shader + 5 particle + 5 motion，全过 smoke/gallery", "tags": ["scenes"], "status": "planned"},
    {"title": "nf-guide recipe 分支", "desc": "00-pick / 01-aesthetics 加三种 type 指引", "tags": ["docs","ai-ops"], "status": "planned"}
  ]
}
```

读 features.json 当前最末 module 后追加。注意保持 JSON valid。

## 任务 C · 追加 prototypes.json

**路径**: `/Users/Zhuanz/bigbang/NextFrame/spec/cockpit-app/data/plan/prototypes.json`

追加一条：

```json
{"ver": "v0.9", "title": "Scene Engines — shader + particle + motion 同步预览", "path": "prototypes/v09-scene-engines.html"}
```

## 验收

1. 打开 `v09-scene-engines.html` on Chrome/Safari：三列 demo 全部动起来，scrub bar 可拖动
2. Dual-Render 按钮点击：左右两个 canvas 显示完全相同的帧
3. `python3 -c "import json; json.load(open('features.json'))"` OK
4. `python3 -c "import json; json.load(open('prototypes.json'))"` OK
5. HTML 单文件零外部依赖：`grep -c "src=\"http\|href=\"http" v09-scene-engines.html` 应为 0

## 约束

- 不写业务代码，只写原型 HTML + JSON 注册
- 不碰 src/ 目录下任何文件
- 不碰 timeline/build/recorder 相关
- 所有 runtime 内联，0 CDN

完成后在 worktree 内 commit：`docs(v0.9): Step 1 prototype — scene engines preview`
