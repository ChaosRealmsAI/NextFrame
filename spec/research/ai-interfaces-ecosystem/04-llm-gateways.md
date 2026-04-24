# 开源 LLM Gateway 调研（2026-04-21）

PM 视角 · "下游应用→一个 gateway→所有家大模型" 类项目。

---

## 1. LiteLLM Proxy · 44k stars

- **是啥**：BerriAI/litellm 的 gateway 部署模式 · OpenAI 格式统一调 100+ provider
- **能力**：虚拟 key / 预算 / 限流 / 成本追踪 / 管理面板 · 全齐
- **部署**：Docker + PostgreSQL（必须 DB）· YAML 配 model
- **Provider**：100+（OpenAI / Anthropic / Gemini / Bedrock / Azure / Vertex / Cohere / HuggingFace / VLLM...）
- **适配 NextFrame**：✅ 英文生态最成熟 · 但需 Postgres · 部署稍重

## 2. One API · 32k stars · 中文事实标准

- **是啥**：中文社区最火 · 管理员配真 key · 下游用虚拟 key（OpenAI 格式）
- **能力**：token 管理（过期/配额）· 充值券 · 多渠道负载均衡 · 流式 · 用户分组费率
- **部署**：**单 Docker 一条命令** · SQLite 单机 / MySQL 多机 · MIT 协议
- **Provider**：OpenAI / Azure / Claude / Gemini / 文心 / 通义 / ChatGLM 等国内外主流
- **适配 NextFrame**：✅✅ **首推** · 国内模型齐 · 部署极简 · MIT 随便用

## 3. New API · 28k stars · One API 活跃分叉

- **差异**：现代 UI + 多语言 · 兼容 One API 数据库
- **加料**：在线充值（Stripe/EPay）· Claude/Gemini 原生格式互转 · 推理模型（o3/Claude thinking）· 加权路由 · Midjourney/Suno
- **部署**：Docker 一条命令 · SQLite/MySQL/PG · **AGPLv3**（闭源产品要注意）
- **适配 NextFrame**：✅ 比 One API 更活跃 · 但 AGPL 协议对商业 C 端产品不友好

## 4. Portkey Gateway · 11k stars

- **是啥**：AI Gateway + 40+ guardrail · 号称最快最轻
- **能力**：重试/fallback / 负载均衡 / 语义缓存 / guardrail / 虚拟 key / 用量分析
- **部署**：`npx @portkey-ai/gateway` 一行 · 或 Docker / Cloudflare Workers / Replit · **无需 DB**（轻量）· 开源免费自托管 + Portkey Cloud 付费版
- **Provider**：250+（README 口径）· 实测 45+ 稳定适配
- **适配 NextFrame**：✅ 最轻 · 想要 Edge 部署选它 · 但日志/计费要上 Cloud 付费

## 5. Helicone · 5.5k stars · gateway + observability

- **是啥**：主打**可观测性** · gateway 是副产品（换 baseURL 即接入）
- **能力**：成本/延迟追踪 / 请求日志 / fallback / prompt 版本化 / session 监控（偏日志不偏管控）
- **部署**：Docker Compose 自托管 · Helm 企业 · Cloud 免费 10k 请求/月
- **Provider**：100+ 模型（OpenAI/Anthropic/Gemini/Bedrock/Groq...）
- **适配 NextFrame**：⚠️ 想看"用户用了多少 token" 适合 · 想管 key/计费不如 One API

## 6. Arch / Plano · 6.4k stars

- **是啥**：面向 **agent 应用** 的 proxy（不是通用 gateway）· 强调 agent 编排 + 安全
- **能力**：智能路由 / 虚拟 key / jailbreak 防护 / OTEL 追踪 · 成本追踪未明确
- **部署**：Docker / binary `planoai up config.yaml`
- **Provider**：文档只展示 OpenAI + Anthropic · 可扩展
- **适配 NextFrame**：❌ 定位 agent · NextFrame 是视频引擎不匹配 · 跳过

---

## 共识 + 给 NextFrame 的 3 种策略

**共识**：这类项目本质都是"OpenAI 协议 proxy + 虚拟 key + 计费 + 日志"四件套。中文生态 One API / New API 事实统治 · 英文生态 LiteLLM 最全。Portkey 最轻。Helicone 偏日志。

| 策略 | 做法 | 成本 | 用户体验 | 适用 |
|---|---|---|---|---|
| **A. NextFrame 托管 gateway** | 自部署 LiteLLM 或 One API · 用户充值用虚拟 key · 后台统一配真 key | 服务器+token 预付+风控 | 最好（零配置登录即用） | 做 C 端 SaaS 认真做 |
| **B. 推荐用户自部署 One API** | 文档教用户 Docker 起 One API · NextFrame 填 gateway 地址 + 虚拟 key（3 字段） | 零（用户担） | 中（懂技术用户 OK） | 开源 / 极客向 |
| **C. 直接填 provider key** | 用户 UI 里填 OpenAI/Anthropic/Gemini 原生 key · NextFrame 不碰 | 零 | 差（每家都填 · 换模型麻烦） | MVP 起步最省事 |

**建议**：v0.1 走 **C**（最省事验证需求）· 规模起来转 **A**（差异化 + 控成本）· **B** 作为"自托管版"副选项面向企业/极客。
