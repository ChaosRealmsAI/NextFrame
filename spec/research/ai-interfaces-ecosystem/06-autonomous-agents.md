# 开源自主 Agent 产品调研（PM 视角）

> 目的：给 NextFrame 未来的 agentloop 找参考 —— "用户说一句话 · AI 规划 N 步剪出视频" 怎么设计。

## 1. OpenHands（原 OpenDevin）· 71.6k stars · 开源

- **定位**：Devin 的开源替代 · 自主软件工程师 agent
- **规划**：CodeAct 架构 —— 所有动作统一成"写代码执行"的单循环（避免 planner/executor 两层协调成本）。2025 年 TODO.md 规划工具补进来，走 Claude Code 风格的显式任务列表
- **失败处理**：事件溯源（event-sourced）+ 确定性重放 · tenacity 库做重试 · 2.1 版重点修了"打转"问题
- **交互**：CLI / 本地 GUI / 云版 三形态 · 中途能插话问澄清 · 可打断
- **工具**：file / bash / browser / MCP · 工具系统类型化
- **借鉴度**：★★★☆ —— "单代码空间 + 事件溯源"思路可迁到 NextFrame（每步生成 scene.json 增量）

## 2. Bolt.new / Lovable / v0.app · 商业

- **定位**：一句话生成全栈应用 · Bolt 偏生成-预览 · Lovable 偏多 agent 协作 · v0 偏 UI 组件
- **规划**：Lovable 有 "PM bot / Designer bot / Dev bot" 多角色模拟 · Chat Mode 先搜文件读 log 查 DB · **用户批准才动代码**（关键体验）
- **失败处理**：Bolt WebContainer 浏览器里直接跑 · 出错即时可见 · 用户看到立即回滚
- **交互**：chat 多轮 · 每步预览可改可撤
- **价格**：Bolt $20/月起 · Lovable $20/月起 · v0 $20/月起
- **借鉴度**：★★★★ —— **"先规划给你看 · 批准后才改"** 这套最适合 NextFrame（剪辑是不可逆 · 用户必须中途控）

## 3. Replit Agent（Agent 4）· 商业

- **定位**：从想法到部署的全栈 agent
- **规划**：多 agent 架构 · manager agent 编排 · editor agent 执行 · Agent 4 能**并行 subagent 同时做不同部分**再合 · 四阶段 pipeline（ideation → design → build → review）
- **失败处理**：**checkpoint 系统（关键）** —— git commit + 数据库状态一起快照 · 能回滚到任意历史点 · 代码和 DB 都走 fork 沙箱试 · git 坏了也能从文件系统前版本恢复
- **交互**：Build/Plan 两模式 · Plan 模式用户先看规划再批准
- **价格**：$20/月起
- **借鉴度**：★★★★★ —— **checkpoint** 机制直接可抄（视频剪每步存 scene.json + 渲染 frame snapshot · 不满回滚）· **Plan 模式先规划后执行** 给视频场景特别合

## 4. Manus AI · 商业（Monica.im）· 2025 火

- **定位**：通用自主 agent · "mind to hand"
- **规划**：**三 agent 协作** —— Planner（拆步骤）+ Executor（沙箱跑）+ Verifier（校验）· 单 loop 四步：analyze → plan → execute → observe · 事件流持续追加
- **失败处理**：verifier agent 专门兜 · 沙箱隔离 · 失败子任务能独立重试
- **交互**：用户给目标走开 → 产 deliverable（报告 / 网页 / 数据）· 过程可查看
- **借鉴度**：★★★★ —— **Planner + Executor + Verifier 三角** 非常匹配 NextFrame（规划师拆剧本 → 执行器渲染 → 验证器看帧质量）

## 5. AutoGPT · 179k stars · 开源老牌

- **定位**：2023 首批自主 agent · 现已转型
- **规划**：2025 分两支 —— **AutoGPT Platform**（生产版 · 拖拽 block 搭 workflow · 每 block 一动作）· **AutoGPT Classic**（原始自循环 · 仅社区维护）
- **失败处理**：Platform 走显式 DAG · 失败定位到具体 block
- **交互**：Platform 是可视化编排 · 不再纯"给目标走开"
- **借鉴度**：★★☆ —— Classic 的纯自主 loop 证明**无约束循环会打转**（2023 教训）· Platform 的 block 编排思路可参考（NextFrame 把剪辑步骤建模成 block）

## 6. MetaGPT / CrewAI · 开源多 agent 框架

- **MetaGPT**：软件公司模拟 —— PM / 架构师 / PM / 工程师 / QA 五角色 · 按 SOP 流水线走 · 结构化强
- **CrewAI**：Manager / Worker / Researcher 可复用角色 · 灵活编排 · 不绑行业
- **失败处理**：框架本身不管 · 靠角色内重试
- **交互**：开发者定义 crew 和任务 · 运行时一口气跑完
- **借鉴度**：★★★ —— **SOP 流水线**思路很适合视频剪辑固定阶段（脚本 → 分镜 → 素材 → 合成 → 校对）· CrewAI 的 Manager/Worker 模式比纯单 agent 稳

---

## 共识 + 给 NextFrame 的启示

**共识 1 · 纯自循环必打转 · 必须显式规划** —— AutoGPT Classic 的教训全行业吸取了。Manus / Replit / Lovable / OpenHands 2.1 都显式维护 TODO / plan.json / checkpoint · 不靠 LLM 脑子记。**NextFrame 必须有 plan.json 一份** —— 每步做啥 · 已做啥 · 待做啥 · PM 能看。

**共识 2 · 长任务必 checkpoint** —— Replit 每步 git + DB 快照 · Bolt WebContainer 即时预览即时回滚 · Manus 沙箱事件流可重放。**NextFrame 剪辑是不可逆（渲染 10 分钟没了）** · checkpoint 比别的产品更关键 —— 每 scene 渲染完存 snapshot（frame 缩图 + scene.json）· 不满一键回到上个 scene。

**共识 3 · 用户中途必能打断 + 批准** —— Replit Plan 模式 / Lovable Chat Mode / Bolt 批准后才改 · 都是"先给你看规划 · 你点头再动"。**NextFrame 的 agentloop 不能一键闷头跑到底** —— 拆完 scene 先渲 10 秒低清预览给 PM · PM 看了改 prompt · 才跑 4K。

**共识 4 · 多 agent 分工 > 单 agent 扛所有** —— Manus 3 角色 / MetaGPT 5 角色 / Replit 多 subagent / Lovable PM+Designer+Dev。**NextFrame 套用**：**剧本 agent**（脚本 → 分镜 JSON）+ **视觉 agent**（选模板选 token）+ **渲染 agent**（HTML → MP4）+ **验证 agent**（看帧 / 对时长）。每个 agent 产物都可 PM 看懂。

**共识 5 · "让 PM 看到 AI 在想啥"的手艺** —— Lovable 用 chat 把每步搜啥查啥讲出来 · Replit Plan 模式把步骤列给你看 · Manus 事件流实时推。**NextFrame 给 PM 的画面**：左边 plan.json 实时勾选 · 右边 scene 预览帧流 · 下方 agent 对话流（"我选了 token-vivid-red 做标题 · 因为你说要热血"）· PM 看见 = 信任。

**核心给 NextFrame 的三条**：
1. **plan.json + checkpoint 必做** —— 别学 AutoGPT Classic 的闷头循环
2. **Plan / Build 两模式** —— 先给 PM 看 10 秒预览再跑 4K · 比 Replit 更关键（视频更贵）
3. **4 agent 分工 + 对话流可视** —— 剧本 / 视觉 / 渲染 / 验证 · 每步说人话让 PM 看得懂

Sources:
- [OpenHands GitHub](https://github.com/All-Hands-AI/OpenHands)
- [OpenHands CodeAct 2.1](https://openhands.dev/blog/openhands-codeact-21-an-open-state-of-the-art-software-development-agent)
- [Replit Agent Case Study](https://www.langchain.com/breakoutagents/replit)
- [Replit Snapshot Engine](https://blog.replit.com/inside-replits-snapshot-engine)
- [Manus AI Analytical Guide](https://www.baytechconsulting.com/blog/manus-ai-an-analytical-guide-to-the-autonomous-ai-agent-2025)
- [Bolt vs Lovable vs v0 Comparison](https://addyo.substack.com/p/ai-driven-prototyping-v0-bolt-and)
- [AutoGPT GitHub](https://github.com/Significant-Gravitas/AutoGPT)
- [MetaGPT GitHub](https://github.com/FoundationAgents/MetaGPT)
- [CrewAI Framework Review](https://latenode.com/blog/ai-frameworks-technical-infrastructure/crewai-framework/crewai-framework-2025-complete-review-of-the-open-source-multi-agent-ai-platform)
