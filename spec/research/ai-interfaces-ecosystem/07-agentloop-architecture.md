# agentloop 架构调研 · 给 NextFrame 的素材

> 读者：产品经理 · 为 NextFrame 未来自研 agentloop 做决策

## 4 个权威来源

1. **Anthropic · Building Effective Agents**（最权威单篇） — https://www.anthropic.com/research/building-effective-agents
2. **Claude Code · How the agent loop works**（官方 SDK 文档） — https://code.claude.com/docs/en/agent-sdk/agent-loop ｜ 辅读 PromptLayer 解析 https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/
3. **OpenAI · A Practical Guide to Building Agents** + Agents SDK — https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/ ｜ https://openai.github.io/openai-agents-python/
4. **LangGraph · Agent Orchestration Framework** — https://www.langchain.com/langgraph ｜ https://github.com/langchain-ai/langgraph

---

## A. agent vs workflow 区别是啥

**Anthropic 原话**：
- **Workflow** = "LLM 和工具被**预定义代码路径**编排"（路线是人写死的 · LLM 填空）
- **Agent** = "LLM **动态主导自己的流程和工具使用** · 自己控制怎么完成任务"（路线 LLM 自己决定）

| 维度 | workflow | agent |
|---|---|---|
| 谁决定下一步 | 代码（if/else / DAG） | LLM 自己 |
| 流程可预测性 | 高（每次一样） | 低（每次不同） |
| 成本 / 延迟 | 低（步数固定） | 高（LLM 可能反复转） |
| 适用场景 | 任务能清晰拆成固定步 | 任务开放 · 步骤预测不出来 |

**一句话判断**：**能画流程图 → workflow；画不出来 / 每次都得现想 → agent**。Anthropic 建议：**先用 workflow · workflow 真做不到才上 agent**（因为 agent 不可预测 + 贵）。

---

## B. 单 agent 循环模板（就这么简单）

Anthropic 原话："LLMs using tools based on environmental feedback **in a loop**" —— 一个 while 循环。

```
         ┌──────────────────────────────┐
         │                              │
         ▼                              │
用户输入 ──► [LLM 想]──► tool_call? ──是─► 执行 tool ──► 把结果塞回 context
                           │
                           否（LLM 输出纯文本）
                           │
                           ▼
                        返回用户 · 循环结束
```

Claude Code 官方叫 **master loop**："Claude 评估 prompt · 调 tool · 收结果 · 重复 · 直到任务完成"。**本质就是一个 while 循环 · 条件是"LLM 还在调 tool 吗"**。

**骨架就 20 行代码**（PM 不用看代码 · 记住"一个 while 循环"就够）。复杂的不是循环本身 · 是**给 LLM 配什么 tool / memory / context 管理**（Anthropic 叫 **augmented LLM** = LLM + 检索 + 工具 + 记忆）。

---

## C. 4+1 种 workflow 模式（Anthropic 分类）

| 模式 | 干啥 | 何时用 | 画面 |
|---|---|---|---|
| **Prompt Chaining**（链式） | 一步输出喂下一步输入 | 能拆固定步骤 | `A ─► B ─► C` |
| **Routing**（路由） | 分类器选专门处理器 | 有明显类别 · 分开处理更好 | `in ─► 分类 ─► {A\|B\|C}` |
| **Parallelization**（并行） | 同时跑多路 / 多次投票 | 子任务独立可并发 · 或要多视角 | `in ─► {A ‖ B ‖ C} ─► 汇总` |
| **Orchestrator-Workers**（主-从） | 主 LLM 动态拆任务 · 分派 worker LLM | 子任务**预测不出来** · 要临时拆 | `主 ─► 动态派 {w1, w2, ...}` |
| **Evaluator-Optimizer**（审-改） | 一个生成 · 一个评 · 循环 | 评价标准清晰 · 迭代能提质 | `生成 ⇄ 评审`（到 OK 为止） |

**记忆点**：前 3 种流程是**人画好的**（workflow）· **Orchestrator-Workers 的拆分是 LLM 临时决定的**（已经接近 agent）· Evaluator-Optimizer 是 agent 里常见的子模式。

---

## D. 给 NextFrame 的 3 种架构方案对比

**场景**：用户说"做个 30 秒介绍视频" · NextFrame 要出 MP4。

| 维度 | 方案 A · workflow 固定 5 步 | 方案 B · 单 agent 全自主 | 方案 C · Orchestrator-Workers |
|---|---|---|---|
| **流程** | 拆句→选素材→排时间线→渲染→预览（写死） | 给 AI 所有 tool · 让它自己决策每步 | 主 agent 拆子任务 · subagent 并行做素材/文案/配乐 |
| **可预测性** | 高（每次一样） | 低（AI 可能跳步 / 走弯路） | 中（主拆分有弹性 · 子任务并行） |
| **延迟** | 最快（步数定） | 慢（LLM 多轮思考） | 中（并行弥补） |
| **成本** | 低 | 高（token 烧得多） | 中 |
| **出错可恢复** | 易（知道卡在第几步） | 难（不知道 AI 在想啥） | 中（每 subagent 独立） |
| **开发复杂度** | 低 | 中 | 高（要调度 + 合并） |
| **质量上限** | 受限（流程死） | 高（AI 能即兴） | 高（多视角 · 同 claude-seed `subagent-dispatch` rule） |
| **PM 视角：够不够好** | 基础款 · 稳 | 每次效果飘 · 不稳 | 平衡 · 但前期投入大 |
| **适配 NextFrame v1** | ✅ **最匹配** | ❌ 太飘 | ⚠️ 太早 |

**ASCII 对比**：

```
方案 A（workflow）            方案 B（单 agent）            方案 C（orchestrator）

input                         input                         input
  │                             │                             │
  ▼                             ▼                             ▼
[拆句]                       ┌──[LLM]──┐                   [主 agent 拆]
  │                          │    ▲    │                    ├──► [素材 worker]
  ▼                          ▼    │    │                    ├──► [文案 worker]
[选素材]                    [tool]─┘    │                   └──► [配乐 worker]
  │                          任意顺序                            │
  ▼                          任意次数                            ▼
[排时间线]                      │                             [主合并]
  │                             ▼                                │
  ▼                          output                              ▼
[渲染]                                                        output
  │
  ▼
[预览] ──► output
```

---

## 给 NextFrame 的落地建议（v1 从哪起步）

**v1 起步 = 方案 A（固定 workflow）+ 每步内部小 agent loop**。理由：

1. **NextFrame 核心路径固定**：JSON → HTML → MP4 · 这是物理流水线 · 不需要 AI 现想步骤
2. **PM 要可预测**：出错知道卡在哪 · 成本可控 · 用户体验稳
3. **质量瓶颈不在流程 · 在每步内容**（选什么素材 / 文案写得好不好）· 把 agent 用在**每步内部**（如"选素材"这一步可以是个小 agent loop · AI 自己挑）

**v2-v3 演进方向**：当某个固定步骤**规则写不清了**（如"素材怎么选最贴合用户意图"）· 把那一步升级成 agent loop · 其他步骤仍走 workflow。

**v5+ 桌面端多任务时**可考虑方案 C（主 agent 并行派多任务）· 但**现在禁 over-engineering**（呼应用户反复强调的 `feedback_v1_pacing` = "打通流程优先于做宽"）。

**核心结论一句话**：**agent 不是越自主越好 · Anthropic 原话"先用 workflow · 真做不到才上 agent"**。NextFrame v1 走 workflow · 该 agent 的点位单独上 agent 子循环 —— 两者混用 · 不是二选一。

---

**来源**：Anthropic Building Effective Agents · Claude Code agent-loop docs · OpenAI Agents SDK · LangGraph docs（URL 见顶部）
