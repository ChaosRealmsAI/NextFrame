# 轻量 Agent 框架 + 便宜模型选型（PM 视角）

> 面向 NextFrame：自己封装 agent 调内部 CLI 剪视频，不套庞大框架。
> 数据截至 2026-04。

---

## 一、7 个框架横评

### 1. smolagents（HuggingFace 官方）★★★★★ 首推骨架参考
一句话：专为小模型设计的 code-action 骨架，核心只有 ~1000 行。
- 最小闭环：**3 行**（`model → agent → agent.run()`）
- 小模型：官方主打，benchmark 表明开源模型跑 code-action 能打闭源
- Tool 抽象：agent 直接写 Python 代码调函数（不是 JSON function call）——对 NextFrame "调内部 CLI" 场景天然契合
- 多 agent：支持层级
- Stars/更新：26.8k / 2026-01（活跃）

### 2. PocketFlow ★★★★ 教学级极简
一句话：100 行总代码实现 agent 全套 pattern，零依赖、零供应商锁定。
- 最小闭环：框架本体即 100 行，示例更短
- 小模型：不绑供应商，任意接
- Tool 抽象：Graph 节点，自由度最高
- 多 agent：Supervisor / Multi-Agent cookbook
- Stars/更新：10.4k / 持续更新
- **最适合抄骨架**：NextFrame 若自封装 agent，读完这 100 行就会写

### 3. Pydantic AI ★★★★ 工程感最好
一句话：FastAPI 作者出品、强类型的 agent 框架。
- 最小闭环：**6-8 行**
- 小模型：40+ provider，含 Ollama 本地
- Tool 抽象：`@agent.tool` 装饰器 + Pydantic 校验入参——写得爽但**隐式反射**，不如 smolagents 透明
- 多 agent：A2A
- Stars/更新：16.5k / 2026-04-18（最新）

### 4. DSPy ★★★ 成本敏感神器（但学习曲线陡）
一句话：Stanford 出品，把 prompt 当代码优化，能让**小模型跑大模型的活**。
- 最小闭环：未查到准确行数（概念复杂）
- 小模型：核心卖点——用 few-shot 自动优化让 Haiku/Qwen 接近 Opus 结果
- Tool 抽象：ReAct + 自定义 Module
- 多 agent：支持
- Stars/更新：33.9k / 2026-02
- **适合**：未来想省钱极致优化某条关键链路（例如"JSON → 分镜"prompt）时加挂，不是初期骨架

### 5. Agno（原 Phidata）★★★ 偏重，向 SaaS 靠
一句话：定位"agentic software at scale"，100+ 集成 + MCP。
- 最小闭环：~20 行
- 小模型：官方示例全 Claude/OpenAI，未强调本地
- Tool 抽象：集成库风格（类似 LangChain）
- 多 agent：agents + teams + workflows
- Stars/更新：39.6k / 2026-04-15
- **NextFrame 不合**：为"平台化"设计，自封装调 CLI 反而碍事

### 6. Mastra ★★★ TypeScript 生态唯一选项
一句话：TS 版 agent 框架，React/Next.js 无缝接。
- 最小闭环：未提供（文档含糊）
- 小模型：40+ provider
- Tool 抽象：含糊
- 多 agent：`.then() / .branch() / .parallel()` workflow DSL
- Stars/更新：23.2k / 2026-04-08
- **NextFrame 不合**：项目已 Rust + TS 零框架原则，不引入 TS 框架

### 7. LangGraph（重量级对照组）★ 劝退
一句话：LangChain 系 stateful agent 编排，概念多、依赖重。
- 最小闭环：quickstart 都要几十行 + 装一堆依赖
- 小模型：无特殊优化
- Tool 抽象：继承 LangChain，抽象层多
- 多 agent：Deep Agents
- Stars/更新：29.8k / 502 个 release
- **劝退理由**：状态机 + 节点 + edge + checkpoint + LangSmith 调试链，学完能上车，但对"调内部 CLI 剪视频"场景属火箭筒打蚊子。CrewAI / AutoGen 同病，不重复列。

---

## 二、便宜模型对比表（2026-04）

| 模型 | 输入 $/1M | 输出 $/1M | 能力（视频指令 + tool use + 中文） | OpenAI 兼容 |
|---|---|---|---|---|
| **DeepSeek V3.2** | $0.28（miss）/ $0.028（cache hit） | $0.42 | 强中文 · tool use 稳 · 性价比王 | ✅ |
| **DeepSeek R1** | $0.55 | $1.68-2.19 | 推理强 · 但慢 · 适合关键决策不适合批量 | ✅ |
| **Claude Haiku 4.5** | $1.00 | $5.00 | tool use 最稳 · 指令遵循强 · 中文可 · 贵于 DeepSeek | ✅（官方 SDK / OpenRouter） |
| **GPT-4o-mini** | $0.15 | $0.60 | 便宜 · tool use OK · 中文一般 | ✅ |
| **GPT-4.1-mini** | ~$0.4 | ~$1.6 | 比 4o-mini 强 · tool use 好 | ✅ |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | 长上下文 · 多模态 · 中文 OK | ✅ |
| **Qwen3.5 Plus** | $0.26 | $1.56 | 中文母语 · tool use 好 · 阿里云 | ✅ |
| **Qwen3 Coder（免费）** | $0 | $0 | OpenRouter 免费额度 · 代码强 | ✅ |
| **本地 Llama 3.3 70B** | 电费 | 电费 | 接近 405B 能力 · 要 48GB+ VRAM | ✅（Ollama） |
| **本地 Phi-4（14B）** | 电费 | 电费 | 数学推理强 · 支持 function calling · 16GB 可跑 | ✅（Ollama） |
| **本地 Qwen 3.5 9B** | 电费 | 电费 | MMLU-Pro 82.5 · 原生多模态 · 笔记本可跑 | ✅（Ollama） |

---

## 三、给 NextFrame 的建议

### 骨架抄谁？

```
   Pocketflow (100 行极简)
          ↓  抄 Graph + Flow 结构
   + smolagents (code-action 思想)
          ↓  抄 "agent 写 Python 直调 CLI"
   = NextFrame agent 内核 (~200 行)
```

不超过 300 行就能搞定。**思路**：agent 不输出 JSON，直接生成一段 Python 代码调 `nf-tts`、`ffmpeg`、`nextframe-render`，沙箱跑完拿结果。这样 CLI 每加一个子命令 = agent 多一个能力，**零胶水代码**。

### 默认挂什么模型？

**双挡位策略**（写进 NextFrame config，PM 一键切）：

| 档位 | 模型 | 用在哪 |
|---|---|---|
| **主力（便宜挡）** | **DeepSeek V3.2** | 所有批量动作：解析 JSON、拆分镜、调 CLI、生成字幕 |
| **精工（贵挡）** | **Claude Haiku 4.5** | 关键一步：最终分镜节奏审校 / 复杂剧本理解 |
| **本地（离线）** | Qwen 3.5 9B + Ollama | 开发/断网/隐私敏感客户 |

为啥 DeepSeek 当主力：中文母语 + tool use 稳 + 比 GPT-4o-mini 还便宜（输出 $0.42 vs $0.60）+ 有 cache hit $0.028 模式，重复模板场景成本再砍 90%。

### 劝退清单

| 框架 | 劝退理由 |
|---|---|
| **LangGraph / LangChain 系** | 抽象层 5+，装完依赖几百 MB，NextFrame 这种"CLI 编排"用不上 checkpoint/state machine |
| **CrewAI** | Role/Goal/Backstory 角色扮演范式，跟"机械调 CLI"不匹配 |
| **AutoGen** | 微软研究向，对话式多 agent，工程落地重 |
| **Agno** | 向 SaaS 平台靠，100+ 集成 NextFrame 全不需要 |
| **Mastra** | TS 栈，违反项目"零框架"原则 |

### ASCII 架构（目标形态）

```
  用户 JSON (scene.json)
         ↓
  [NextFrame Agent 核心 ~200 行]
   ├─ Planner (DeepSeek V3.2)   ← 读 JSON 拆 task
   ├─ Executor (code-action)    ← 生成 Python 调 CLI
   │    ├─ nf-tts batch ...
   │    ├─ nextframe-render ...
   │    └─ ffmpeg ...
   └─ Verifier (Haiku 4.5)      ← 看输出 mp4 截图评分
         ↓
      成品 MP4
```

一句话：**骨架抄 PocketFlow + smolagents 100 行凑出，主力挂 DeepSeek V3.2，关键步骤 Haiku 4.5 兜底，不碰 LangChain 系**。

---

**Sources**: smolagents / PocketFlow / Pydantic AI / DSPy / Agno / Mastra / LangGraph GitHub README (2026-04); DeepSeek / Anthropic / Google / OpenAI / Qwen / OpenRouter 官方 pricing 页（2026-04）; HuggingFace + Local AI Master 小模型 benchmark（2026-04）。
