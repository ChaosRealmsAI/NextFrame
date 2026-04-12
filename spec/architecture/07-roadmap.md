# 07 · Roadmap

这份文档现在是“v0.1 已收口，v0.2 往哪走”的状态说明，不再把 v0.1 当成进行中。

## 当前状态

**当前位置：v0.1.0 released。**

仓库内可验证的发布信号：
- `nextframe-cli/package.json` 版本是 `0.1.0`
- CLI 已有 25 个子命令
- AI tools 已有 12 个
- registry 有 33 个 scene render functions，CLI 对外公开 32 个 scenes
- `grep -c '^test(' nextframe-cli/test/*.test.js | awk ...` = 74
- BDD / AI verify 条目里 `status=done` 或 `verify=pass` 的对象总数 = 45

## v0.1 阶段回顾

| 阶段 | 状态 | 说明 |
|---|---|---|
| v0.1.3 Walking skeleton | ✅ | CLI 能端到端 render / frame / validate |
| v0.1.4 Lint | ✅ | architecture / scene contract / guard 都落地 |
| v0.1.5 Implement | ✅ | render、timeline ops、assets、browser scenes、AI tools 已实现 |
| v0.1.6 Verify | ✅ | 测试与 BDD verify 条目已经收口 |
| v0.1.0 Release | ✅ | `nextframe-cli@0.1.0` |

## v0.1.0 已完成的产物

### Runtime / CLI
- 25 个 CLI subcommands
- bake-html / bake-browser / bake-video
- asset management 4 commands
- `guide` AI onboarding
- `probe` 导出探针

### Scene library
- 33 registered render functions
- 32 public scenes
- browser scene family 已并入正式 surface

### Quality / verification
- 74 node tests
- 6 architecture tests通过
- 45 个 BDD / verify 条目标记为 `done` / `pass`

## v0.2 方向

用户已经确认 v0.2 的方向：**tao desktop app + CapCut-style UI**。

### 目标
- 继续保持 CLI 为 ground truth
- 在其上加桌面壳和可视化时间线
- 让人类用户拥有 CapCut 风格的轨道交互、拖拽和预览

### 计划中的 v0.2 分层
- 桌面壳：`tao`
- 预览与 UI：原生 Web/HTML/JS
- 核心能力：继续复用 `nextframe-cli` 的 schema、engine、scene registry、bake pipeline

### v0.2 placeholder milestones

| 里程碑 | 内容 |
|---|---|
| v0.2.0 | tao shell prototype |
| v0.2.1 | CapCut-style timeline / inspector / preview spec |
| v0.2.2 | UI architecture + bridge contract |
| v0.2.3 | desktop walking skeleton |
| v0.2.4 | UI lint / architecture guard |
| v0.2.5 | implementation |
| v0.2.6 | AI-driven UI verify |

## 暂不进入 v0.2 之前的范围

以下仍然不应回流到 v0.1.x：
- 插件系统
- 云协作
- 浏览器版
- Windows 打包
- 在线素材库
- 高级关键帧系统

## 版本叙述更新

旧叙述里一些数字已经过时，v0.1.0 以后应统一改成：
- scenes：33 registered / 32 public
- subcommands：25
- AI tools：12
- tests：74
- architecture tests：6
- verified BDD objects：45

## 一句话

v0.1 已经是“发布态 CLI”；v0.2 的主任务不再是补 CLI，而是把它包进 tao 桌面应用，并做出 CapCut 风格的人类操作层。
