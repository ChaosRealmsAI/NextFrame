# AI 接口 · agentloop 生态调研(2026-04-21)

**覆盖版本**:v0.1.4(8 份 AI interface & agentloop)+ v0.1.5(2 份 API 聚合厂商)
**Session**:64fadcea
**用户原话**:"搜索一些开源项目 · 用户可用模型一般用什么接口 · 就封装各家的 · 我想打造我们的 agentloop 确保会用我们这个剪视频"(+ 3 次扩展补充)

---

## 10 份报告索引

| # | 文件 | 主题 | 关键发现一句话 |
|---|---|---|---|
| 01 | `01-adapter-libs.md` | **纯 adapter 库** | LiteLLM / Vercel AI SDK / OpenRouter · 用户接入 = 3 字段(base_url+key+model) |
| 02 | `02-agent-products.md` | **开源 coding agent provider 层** | opencode(Vercel AI SDK)/ Cline(自写)/ Aider(LiteLLM)/ Continue(自写)· 4 项目共识:配置 JSON · OpenRouter 兜底 · OpenAI-compat 兜长尾 |
| 03 | `03-protocols.md` | **协议事实标准** | OpenAI chat/completions 全行业主动兼容 = 嘴层 · MCP = 手层 · 两层正交 |
| 04 | `04-llm-gateways.md` | **LLM Gateway(自建)** | 中文首推 One API(MIT+Docker 一条)· 英文 LiteLLM Proxy(44k)· Portkey 最轻 · New API AGPL |
| 05 | `05-cli-agents.md` | **Claude Code 类 CLI agent** | Gemini CLI 102k / Codex 77k / OpenHands 72k / goose 43k / **gptme 4.3k(架构最成熟)** · MCP 原生是门票 |
| 06 | `06-autonomous-agents.md` | **自主 agent 产品** | Replit Agent checkpoint(★★★★★) / Bolt+Lovable 批准后才改 / Manus Planner+Executor+Verifier 三角 |
| 07 | `07-agentloop-architecture.md` | **agentloop 架构深分析** | Anthropic"先 workflow · 真做不到才 agent" · 5 种 workflow 模式 · NextFrame v1 = 方案 A(固定 5 步)+ 步内 agent 子循环 |
| 08 | `08-cheap-frameworks-models.md` | **轻量框架 + 便宜模型** | 骨架抄 PocketFlow(100 行)+ smolagents(code-action) · ~200 行自封 · 主力 DeepSeek V3.2 / 精工 Haiku 4.5 / 离线 Qwen 3.5 9B + Ollama |
| 09 | `09-api-aggregators-top10.md` | **主流聚合商精细对比** | OpenRouter / Together / Fireworks / Groq / DeepInfra / Replicate(国际 6) + 硅基流动 / 302.AI / AiHubMix / API2D(国内 4) |
| 10 | `10-api-aggregators-90plus.md` | **聚合商搜索发现全景** | **搜到 90+ 家** · 分 6 大类(真聚合 21 / 推理云 24 / 云 marketplace 6 / 开源网关 7 / 国产中转 18 / 自家平台)· 3 意外:Featherless 6700+ / Metapi 聚合器的聚合器 / Claude Max 订阅套利 |

---

## 核心结论 3 条(浓缩版)

### ① 接口不用自己造 · 抄 OpenAI chat/completions
Claude / Gemini / Ollama / vLLM / LM Studio / DeepSeek / Qwen **全行业主动兼容** OpenAI 格式。NextFrame 代码只写一套 HTTP · 不绑任何 SDK。用户接入 = 3 个字段(`base_url` + `api_key` + `model`)。

### ② agent 别用 LangChain/CrewAI/AutoGen · 自己封 ~200 行
抄 **PocketFlow**(100 行极简骨架) + **smolagents**(code-action · agent 直接写 Python 调函数)· 200 行搞定。agent 直接生成 Python 代码调 `nf-tts` / `nextframe-render` / `ffmpeg` · 零胶水 · CLI 每加一个子命令 = agent 多一个能力。

### ③ 模型双挡 + 用户可自选 provider
- **主力**(便宜挡):**DeepSeek V3.2**(in $0.28 / out $0.42 · cache $0.028 · 中文母语 · tool use 稳)
- **精工**(贵挡):**Claude Haiku 4.5**(in $1 / out $5 · 关键节奏审校)
- **离线**:Qwen 3.5 9B + Ollama(笔记本可跑)
- **provider 切换**:UI 下拉 + 用户可自填 `base_url`(覆盖 90+ 聚合商长尾 · 默认挂硅基流动国内直连)

---

## 架构雏形(tentative · 待 kickoff 锁)

```
用户(PM) → NextFrame UI
             ↓
         [轻量自封 agent ~200 行 · PocketFlow + smolagents]
             ├─ 双挡模型(DeepSeek V3.2 主 / Haiku 4.5 精)
             ├─ 3 字段配置(base_url/key/model · provider 下拉 + 自填)
             ├─ Plan/Build 两模式(低清预览 → PM 批准 → 4K 渲染)
             ├─ plan.json + checkpoint(每 scene 存 snapshot)
             ├─ 4 agent 分工(剧本 · 视觉 · 渲染 · 验证)
             └─ 对话流可视(让 PM 看到 AI 在想啥)
                   ↓
         内置 tool 层(code-action 直调 NextFrame CLI)
                   ↓
         可选 MCP server 暴露(入站 · Claude Desktop 等也能调)
```

---

## 3 决策待未来 kickoff(tentative · 不锁死)

1. **出站 vs 入站 vs 都做** — 建议都做 · 先做哪个?
2. **Gateway 策略** — A=NextFrame 托管 / B=推荐用户自部署 One API / C=用户自填 base_url(最推 · 零维护)
3. **agent 骨架** — PocketFlow 100 行抄 vs fork gptme 完整

---

## 关联锚点

- **devlog**:`spec/devlog/01.md` · 2026-04-21 15:50~17:00 · v0.1.3/v0.1.4/v0.1.5 条目
- **ADR**:`spec/adrs.json` · A-0014(OpenAI+MCP 两层正交 · tentative)· A-0015(workflow+步内 agent loop · tentative)
- **讲解 HTML**:`spec/read-for-human/research-ai-interfaces.html`(6 帧 · 前 4 维度)
- **commit**:ab65d72(v0.1.4 ADR)· cdb6969(v0.1.5 聚合商 Note)· 本目录 commit(v0.1.6 · 收录 10 份 md)

---

## 搜索覆盖度自评

| 维度 | 覆盖度 | 遗漏 |
|---|---|---|
| 01-08(AI interface + agentloop) | 90% | 小众框架可能漏 · 已覆盖主流 |
| 09-10(聚合商) | A/B/C/D 类 85-95% · E 类 70%(国产长尾每周冒新) | 日韩 / 边缘 AI 网关 / 国产信创芯片聚合 / PH 近期新品 |

需定期 refresh(半年级) —— 特别是国产中转站长尾。
