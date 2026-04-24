# NextFrame 竞品技术深挖 · v0.1.3

**生成**: 2026-04-21 · 5 subagent 并发 · 各 8 维度 deep-dive · 主 agent cross-cut 整合
**续**: v0.1.2 (8 玩家浅扫) · 本版深挖代码层

## 三件套

| 文件 | 给谁看 |
|---|---|
| [`deep-tech.html`](deep-tech.html) | **PM** · 7 帧 B 档讲解(已 open) |
| [`data.json`](data.json) | **AI / 跨版本引用** · 5 项目技术决策矩阵 + cross-cut themes + action plan |
| [`raw/`](raw/) | **审计追溯** · 5 份 subagent deep-dive markdown(2882 行 · 含真代码片段 + 真 GitHub URL) |

## 5 项目深挖 + 关键发现

| 项目 | 标签 | 最硬发现 |
|---|---|---|
| **Hyperframes** | 🔴 工程化标杆 | CDP `HeadlessExperimental.beginFrame` + `--deterministic-mode` + swiftshader = 跨机器像素级确定性 · `window.__hf` 5 字段窄 RPC · PreToolUse hook 拦 git commit |
| **Remotion** | 🟡 生态老大 | 35 条细粒度 SKILL.md + MUST/FORBIDDEN 大写硬话 · `npx skills add` 跨 IDE 一条命令 · `.md` URL 真有 · License v5 收紧(freelancer 算 employee) |
| **Motion Canvas** | 🟢 该偷 API | generator+signal verbatim · Vite plugin scrub=reset+replay(NextFrame 可加 snapshot)· 作者 #941 拒 AI 立场 · 疑似停滞 |
| **Revideo** | 🔴 死亡范式 | 9 月零 feature commit · re.video 308→midrender · 团队全 pivot 闭源 · MIT 裸+闭源 SaaS = 死 |
| **CC Toolkit** | 🟢 Skills 蓝本 | skill frontmatter 极简(name+description)· 双层入口 + registry.json · 命令 body 当操作指南信 + AskUserQuestion · GitHub clone 分发 |

## 3 大跨项目主题

### 1. AI 集成形态演化(3 stages)

- **Stage 1 · 无 AI** (Motion Canvas / Editly / Etro / Revideo 开源仓): 程序员手写
- **Stage 2 · 外接 agent** (Remotion 2026-01 / CC Toolkit): 出 skills 包给 LLM
- **Stage 3 · agent-native** (Hyperframes / **NextFrame charter P1 已对齐**): 整个产品为 agent 设计 · non-interactive CLI + skills + slash commands

### 2. 渲染栈分类(3 buckets)

| 栈 | 用户 | 天花板 | NextFrame 差异化 |
|---|---|---|---|
| headless Chrome + Puppeteer + ffmpeg | Remotion · Hyperframes | 无真 HDR · Chrome 限制 | 抄 CDP beginFrame + 加 wgpu 真 GPU + 真 HDR encoder |
| Canvas 2D + ffmpeg | Motion Canvas · Revideo · Editly | 无 GPU shader · 上一代 | 直接绕 |
| WebGL 浏览器内 | Etro.js | 边缘 | 非直接竞品 |
| **wry+tao + wgpu + 原生 HDR encoder** | **NextFrame 独占** | - | **唯一同时拿 4K HDR + 真 GPU + 确定性** |

### 3. License 策略(3 模式 1 死)

| 模式 | 案例 | 结果 |
|---|---|---|
| source-available + 商业门槛 | Remotion | 🟡 活 6 年 · 但 v5 收紧引不满 |
| Apache 2.0 + 母公司 SaaS 导流 | Hyperframes (HeyGen) | 🟢 1.5 月 8.2k stars |
| **MIT 裸开源 + 闭源 SaaS** | **Revideo** | **🔴 9 月零 commit · 团队 pivot · 死** |

## P0 立即行动(本周)

1. **出 NextFrame Day-1 Skills 包** (独立仓 `ChaosRealmsAI/nextframe-skills`)
   - 6 SKILL.md(主入口 + nf-anchors / nf-tracks 概念 + nf-build / nf-render / nf-preview 执行)
   - 4 slash commands(`/nf` `/nf-setup` `/nf-build` `/nf-render`)
   - `_internal/registry.json`
   - 装机: `git clone .../nextframe-skills ~/.claude/skills/`
   - **混搭**: CC Toolkit 结构 + Hyperframes PreToolUse + Remotion MUST/FORBIDDEN

2. **PreToolUse hook 拦 git commit** (`.claude/settings.json`)
   - 跑 `cargo check + clippy + tsc --noEmit` (结合 v0.1.1 audit.sh)
   - 抄 Hyperframes "坏代码提交不过"硬约束

3. **v0.4+ engine 上 CDP `beginFrame` + wgpu + 真 HDR encoder**
   - 抄 Hyperframes 确定性协议 + 加 Rust 原生 GPU
   - 跑 same JSON 两次 pixel hash 一致(charter P3 frame pure 落地)

## P1 短期 (v0.4-v0.5)

- AI-native docs `.md` URL 后缀返回 raw markdown(抄 Remotion)
- TS describe 层双层 API: JSON 给 AI 低层 · TS generator 给开发者高层(抄 Motion Canvas)
- live preview Vite plugin + 加帧 snapshot(改进 Motion Canvas reset+replay 短板)

## P2 战略 (v0.4 charter)

- License 策略拍板: Remotion 模式 / Linear 模式 / 闭源 三选一
- **禁 Revideo 模式**(MIT 裸+闭源 SaaS = 死)

## 关键代码索引(供 NextFrame 实现时直接参考)

- Remotion skill router: `github.com/remotion-dev/remotion/packages/skills/skills/remotion/SKILL.md`
- Remotion 35 rules: `github.com/remotion-dev/remotion/packages/skills/skills/remotion/rules/`
- Hyperframes runtimeContract: `github.com/heygen-com/hyperframes/blob/main/packages/core/src/runtimeContract.ts`
- Hyperframes settings: `github.com/heygen-com/hyperframes/blob/main/.claude/settings.json`
- CC Toolkit skill 蓝本: `github.com/digitalsamba/claude-code-video-toolkit/.claude/skills/`
- CC Toolkit registry: `github.com/digitalsamba/claude-code-video-toolkit/_internal/toolkit-registry.json`
- Motion Canvas generator: `github.com/motion-canvas/motion-canvas/blob/main/packages/2d/src/lib/scenes/Scene.ts`

## 调研方法

- 5 subagent (general-purpose) 并发
- 各 12-25 个 web 调用(WebSearch + WebFetch + GitHub raw + gh API)
- 8 维度 deep-dive(渲染 pipeline / API schema / AI 集成 / 性能 / 商业 / 开发流程 / 文档基础设施 / 痛点)
- 总耗时 ~30 min(并发 5 + 主整合)
- 总产出 2882 行原始 md + 1 份汇总 data.json + 1 份 7 帧 HTML

## 跟 v0.1.2 关系

v0.1.2 = **战略层**(8 玩家定位 / 4 差异化窗口 / 5 战略建议)
v0.1.3 = **战术层**(代码层细节 / 具体抄哪个文件 / 死亡范式警示)

合起来: NextFrame v0.4+ 决策完整指南。

## verdict

> 5 项目深挖确认 v0.1.2 总结 · 进一步落地: NextFrame 必须 day-1 出 skills 包(抄 CC Toolkit 蓝本)+ Chrome CDP 确定性渲染(抄 Hyperframes)+ 真 GPU+HDR 差异化 + 同时定 license 策略避 Revideo 死亡范式。
