# 多模型适配层调研(PM 视角)

> 目标:给 NextFrame 加"用户自选模型"能力 —— 门槛能多低?

---

## 1. LiteLLM (BerriAI/litellm · Python)

- **是啥**:100+ LLM 统一成 OpenAI 格式的翻译层,能做库用也能做网关自部署。
- **用户接入姿势**:一把 `completion()` 调所有家 —— 换模型只改 `model="anthropic/claude-..."` 或 `model="gemini/..."`,key 从环境变量读。自部署网关更彻底:下游只认 OpenAI 格式,上游谁来无所谓。
- **支持**:100+ providers(OpenAI / Claude / Gemini / Bedrock / Azure / Ollama / 国内模型全覆盖)。
- **优点**:production-grade(虚拟 key / 成本追踪 / 负载均衡 / 限流),低延迟(P95 8ms)。
- **坑**:抽象层本身是锁定点;自部署要运维一个 gateway 服务;企业功能要单独 license。
- **Stars / 用户**:44.1k · Stripe / Netflix / Google ADK / OpenAI Agents SDK / OpenHands 都在用 —— 活得很。

## 2. Vercel AI SDK (vercel/ai · TypeScript)

- **是啥**:TypeScript 生态的 AI 工具包 —— 前端场景(streaming chat / React hook)统一封装。
- **用户接入姿势**:装 `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/google` 包,`streamText({ model: anthropic('claude-opus-4.6'), prompt })` 一把调。换家换 model 字段,不改业务代码。
- **支持**:三巨头官方包 + 社区提供 "OpenAI-compatible provider" 万能适配器 —— 任何 OpenAI 兼容端点(Ollama / vLLM / 国内模型)一行配 base_url 接入。
- **优点**:前端 streaming / React hook(`useChat`)开箱,结构化输出走 Zod schema,TS 原生类型安全。
- **坑**:只服务 JS/TS 生态;默认鼓励走 Vercel AI Gateway(可绕);Node 18+。
- **Stars / 用户**:23.7k · 月下载 2000 万+ · Thomson Reuters(CoCounsel 法律 AI)、Clay、大量 Fortune 500 在用。

## 3. OpenRouter (openrouter.ai)

- **是啥**:**SaaS 代理**(不是库 · 不是协议) —— 一个中间商,拿一个 key 调所有家。
- **用户接入姿势**:注册拿一个 OpenRouter key,base_url 改成 `https://openrouter.ai/api/v1`,直接用 **OpenAI SDK** 调 —— 业务代码一行不改。`model` 写 `"anthropic/claude-opus-4.6"` / `"google/gemini-2.5-pro"` 切换。
- **支持**:数百个模型(含开源 / 闭源 / 国内)。
- **优点**:零接入成本(已有 OpenAI 代码几乎白嫖),自动 fallback,跨家统一计费。
- **坑**:**要经过它的服务器**(隐私 / 延迟 / 它挂了你挂) · 加一层它的抽成 · 企业合规场景不能用。

---

## 共识抽取(3-5 条跨项目共同做法)

1. **OpenAI Chat Completions 格式 = 事实标准**。Anthropic 官方出 OpenAI 兼容层,Ollama 内建 `/v1/chat/completions`,Gemini 有 compat endpoint —— 全行业往这个口子收敛。
2. **用户接入的最低门槛 = `base_url` + `api_key` 两个配置项**。不用写各家 SDK,OpenAI SDK 一把梭。
3. **模型选择 = 一个字符串**(`"provider/model-name"`),前缀区分家族 —— 换模型零代码改动。
4. **分两条路线**:① 调库(LiteLLM Python / Vercel AI SDK TS) —— 跑你自己机器;② 代理 SaaS(OpenRouter) —— 跑别人机器,最省事但有依赖。
5. **NextFrame 接入建议**:UI 给用户填 `base_url` + `api_key` + `model` 三个框,按 OpenAI 格式发请求 —— 覆盖 Claude/GPT/Gemini/Ollama/OpenRouter/国内模型全部场景。不用绑任何一个库。
