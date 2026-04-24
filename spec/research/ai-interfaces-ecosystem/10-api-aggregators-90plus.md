# LLM API 聚合厂商全景调研(2026-04)

**说明**:这是 **搜索发现** 任务的产物 · **不是推荐** · 不是 "top 10 最佳"。只列搜到的厂商 · 列厂商 ≠ 背书。

读者:NextFrame PM · 需要全景地图 · 从"一个 key 调多家模型"角度盘市面上的玩家。

---

## 分类口径

- **A · 真聚合型(Pure Aggregator)**:核心定位就是"多家合一个 key" · 不自己训模型 · 不自家卡跑推理 · 做的是路由 / 转发 / 计费 / 观测。OpenAI 兼容是标配。
- **B · 推理云 + 少量聚合(Serverless Inference Hub)**:主营自家 GPU / 自研芯片跑开源模型 · 顺便聚合少量友商。特点:只有开源模型 + 部分托管。
- **C · 云厂商 Model Marketplace**:大公有云自家的模型商店,模型多来自合作方,统一计费,走云厂商的账号体系。
- **D · 自建 / 开源网关(Self-hosted Gateway)**:你自己部署的软件,自带聚合逻辑,key 自己加。不是 SaaS。
- **E · 国产中转站(CN-friendly Relay)**:专门解决国内直连 / 人民币充值 / 发票合规,上游多为 GPT / Claude / Gemini 官方或转手。
- **F · 自家模型开放平台**:厂家只卖自己的模型,严格说不是"聚合",但常被列在一起做对比。列出来供 PM 看生态全貌。

---

## 一、全表

### A · 真聚合型(12 家)

| 厂商 | 是啥 | 模型数 | 定价 | OpenAI 兼容 | 定位 | 来源 |
|---|---|---|---|---|---|---|
| **OpenRouter** | 行业事实标准 · 海外首选聚合 | 300+(60+ 上游) | 多数持平原价 · 少数加 5.5% · 部分开源模型有 BYO-key | ✅ | 最全 · 开源 + 闭源全覆盖 · 但国内无直连 | [openrouter.ai](https://openrouter.ai/) |
| **LLM Gateway (llmgateway.io)** | 开源 + SaaS 双形态的聚合网关 | 19+ 家上游 | pay-as-you-go | ✅ | 兼顾自建和托管 | [llmgateway.io](https://llmgateway.io/) |
| **Portkey** | 生产级 AI 网关 · 重观测 / 会话 / 预算 | 250+ | 网关免费 · 高级观测付费 | ✅ | 企业生产级 · 要观测 / 护栏 / prompt 管理选这个 | [portkey.ai](https://portkey.ai/) |
| **Requesty** | 轻量 LLM 网关 | 数百 | 低开销 | ✅ | 最小化配置的路由层 | [requesty.ai](https://www.requesty.ai/) |
| **Crazyrouter** | OpenRouter 的更激进替代 | 300+(含图 / 视频 / TTS / embedding) | 激进低价 | ✅ | 跨模态 · 开发者向 | [crazyrouter.com](https://crazyrouter.com/) |
| **Eden AI** | 多模态 AI 工作流平台 | 多家 | 多档 | ✅ | 偏多模态 / 工作流,不只是文本 LLM | [edenai.co](https://www.edenai.co/) |
| **MegaLLM** | 统一 API · 号称比原价便宜 60% | 70+ | 最高便宜 60% | ✅ | 走低价 + fallback | [megallm.io](https://megallm.io/) |
| **Unify** | 动态测性能 · 按 cost/speed 路由 | 多家 | 按路由选择 | ✅ | 路由智能(不是简单转发) | [unify.ai](https://unify.ai/) |
| **Helicone AI Gateway** | 以观测 / 分析起家的网关 | 多家 | 免费 + 付费观测 | ✅ | 监控分析强 · 生产级控制台 | [helicone.ai](https://www.helicone.ai/) |
| **TrueFoundry** | 企业级 AI 网关(含 MCP) | 250+ | 企业向 | ✅ | SOC2 / HIPAA / GDPR · RBAC / 审计日志 | [truefoundry.com](https://www.truefoundry.com/) |
| **Bifrost (Maxim AI)** | 高性能 AI 网关 · 主打 < 10ms 开销 | 多家 | 企业向 | ✅ | 跟 Maxim 评估平台深绑定 | [getmaxim.ai/bifrost](https://www.getmaxim.ai/bifrost) |
| **TokenMix.ai** | 统一 SDK + key | 300+ | 多档 | ✅ | 简化迁移(改 2 个环境变量) | [tokenmix.ai](https://tokenmix.ai/) |
| **Krater** | 多模型 AI 平台 | 350+ | 多档 | ✅ | 面向 end-user 也有开发者 | [krater.ai](https://krater.ai/) |
| **Ofox** | 多协议兼容(OpenAI + Anthropic + Gemini SDK 原生) | 多家 | 零购买费 | ✅ | 协议最灵活 | [ofox.ai](https://ofox.ai/) |
| **Smart AIPI** | 便宜 75% · 同款模型 | 多家 | 低价 | ✅ | 价格敏感 | [smartaipi.com](https://smartaipi.com/) |
| **Vercel AI Gateway** | Vercel 生态内聚合 | 100+ | pay-as-you-go · 预算追踪内建 | ✅ | Vercel / AI SDK 用户无缝 | [vercel.com/ai-gateway](https://vercel.com/ai-gateway) |
| **Kong AI Gateway** | Kong 做的 AI / MCP / A2A 网关 | 多家 | 企业级 | ✅ | 原来做 API 网关的,顺延到 AI | [konghq.com/products/kong-ai-gateway](https://konghq.com/products/kong-ai-gateway) |
| **Martian** | LLM 路由(cost / uptime / skill 自动选模型) | 多家 | 按路由算 | ✅ | 不是简单转发 · 是"自动选最佳" | [withmartian.com](https://withmartian.com/) |
| **Not Diamond** | AI 模型路由器 · 按 query 选 LLM | 多家 | 按路由算 | ✅ | 类似 Martian · 更智能化 | [notdiamond.ai](https://www.notdiamond.ai/) |
| **Inworld Router** | 按业务指标路由(成本 / 延迟 / 任务复杂度) | 多家 | 企业向 | ✅ | 路由维度更细 | [inworld.ai](https://inworld.ai/) |
| **AI/ML API (aimlapi)** | 多模型聚合 API | 多家 | 多档 | ✅ | 通用聚合 | [aimlapi.com](https://aimlapi.com/) |

### B · 推理云 + 少量聚合(11 家)

这类"看起来像聚合 · 但本质是自家卡跑开源模型"。只有 llama / qwen / deepseek / mistral / flux 等开源家族 · 闭源模型(GPT / Claude / Gemini)**不在里面**。

| 厂商 | 自家推理芯片 | 开源模型数 | 速度亮点 | OpenAI 兼容 | 定位 | 来源 |
|---|---|---|---|---|---|---|
| **Together.ai** | GPU | 200+ | < 100ms 延迟 | ✅ | 最全的开源托管 | [together.ai](https://www.together.ai/) |
| **Fireworks.ai** | GPU + 自研 FireAttention 引擎 | 多 | 10T tokens/day 级别 | ✅ | 速度 + 合规(HIPAA/SOC2) | [fireworks.ai](https://fireworks.ai/) |
| **DeepInfra** | GPU | 最新开源模型最全(Kimi K2 / Qwen3.5 / GLM-5 / DeepSeek V3.2 / MiniMax-M2 / gpt-oss) | 价格最低档之一 | ✅ | 开源模型目录最新 | [deepinfra.com](https://deepinfra.com/) |
| **Groq** | 自研 LPU | 少数精选 | **首字延迟 < 100ms · 全市最快** | ✅ | 速度狂魔 · 低延迟首选 | [groq.com](https://groq.com/) |
| **Cerebras** | 自研 WSE(Wafer Scale Engine) | 少数精选 | 超高吞吐 | ✅ | 大模型超高吞吐 | [cerebras.ai](https://www.cerebras.ai/) |
| **SambaNova** | 自研 RDU | 少数精选 | DeepSeek R1 · 118 t/s | ✅ | 芯片派 · 类似 Cerebras | [sambanova.ai](https://sambanova.ai/) |
| **Novita AI** | GPU | 多 | DeepSeek V3 · $0.48/1M(第二便宜) | ✅ | 便宜 · HF 集成 | [novita.ai](https://novita.ai/) |
| **Hyperbolic** | GPU | 多 | TTFT 0.81s(次快) | ✅ | 性价比 | [hyperbolic.xyz](https://hyperbolic.xyz/) |
| **Nebius AI Studio** | GPU | 多 | Nebius Fast · 202 t/s 最快 | ✅ | 欧洲玩家(原 Yandex 拆出) · HF 集成 | [studio.nebius.com](https://studio.nebius.com/) |
| **Replicate** | GPU | 数千(含图 / 视频) | 多档 | ✅ | 开源模型动物园 · 多模态最全 | [replicate.com](https://replicate.com/) |
| **Anyscale** | Ray 生态 | 多 | Python 友好 | ✅ | Python + Ray 用户 | [anyscale.com](https://www.anyscale.com/) |
| **Baseten** | GPU + Truss 框架 | 多 | 冷启 16-60s · 但热了吞吐好 | ✅ | 自部署 ML 模型友好 | [baseten.co](https://www.baseten.co/) |
| **Modal** | GPU | 多 | 冷启 2-4s | ✅ | 最便宜的托管 serverless | [modal.com](https://modal.com/) |
| **Runpod** | GPU(消费卡 / H100 都有) | 多 | 48% 冷启 < 200ms | ✅ | GPU 租赁 + serverless · 最灵活 | [runpod.io](https://www.runpod.io/) |
| **Lepton AI** | GPU | 多 | — | ✅ | 创始人 Jia Yangqing · 2025 被 NVIDIA 收购传闻 | [lepton.ai](https://www.lepton.ai/) |
| **Featherless.ai** | GPU + 独特加载 | **6700+ 开源模型(HF 第一)** | — | ✅ | **目录最大** · HF 上最全 | [featherless.ai](https://featherless.ai/) |
| **fal.ai** | GPU | 图 / 视频 / 音频偏重 | 快 | ✅ | 多模态(图像视频)首选 | [fal.ai](https://fal.ai/) |
| **Nscale** | GPU | 多 | 欧洲 | ✅ | 欧洲推理 | [nscale.com](https://www.nscale.com/) |
| **Scaleway Generative APIs** | GPU(欧洲) | 多 | TTFT < 200ms | ✅ | 欧洲合规 | [scaleway.com](https://www.scaleway.com/en/generative-apis/) |
| **OVHcloud AI Endpoints** | GPU(欧洲) | 多 | — | ✅ | 欧洲合规 | [ovhcloud.com](https://www.ovhcloud.com/) |
| **Lambda Labs** | GPU(2025-09 砍了 serverless · 只剩 VM) | — | — | — | GPU VM 按小时租 · $1.39/h A100 | [lambdalabs.com](https://lambdalabs.com/) |
| **Cloudflare Workers AI** | 边缘 GPU(330+ 数据中心) | 50+ | 边缘低延迟 | ✅ | 跟 Cloudflare Worker 深度整合 | [developers.cloudflare.com/workers-ai](https://developers.cloudflare.com/workers-ai/) |
| **Perplexity (pplx-api)** | GPU | 部分开源 | 快 | ✅ | Perplexity 开放的 API · 跟搜索绑定 | [perplexity.ai/api-platform](https://www.perplexity.ai/api-platform) |
| **HF Inference Providers (Hugging Face)** | 不自家做 · **聚合 15+ 家推理伙伴** 到一个 endpoint(Groq/Novita/Cerebras/SambaNova/Nscale/fal/Hyperbolic/Together/Fireworks/Featherless/Zai/Replicate/Cohere/Scaleway/PublicAI/OVH/WaveSpeed) | 10000+ | 跟上游走 | ✅ | **推理界 OpenRouter** · 聚合的聚合 | [huggingface.co/docs/inference-providers](https://huggingface.co/docs/inference-providers/index) |

### C · 云厂商 Model Marketplace(6 家)

| 厂商 | 模型覆盖 | 定价 | OpenAI 兼容 | 定位 | 来源 |
|---|---|---|---|---|---|
| **AWS Bedrock** | Claude / Llama / Mistral / Cohere / AI21 / Amazon Titan / Nova + AgentCore(2025-10 GA) | 云账单 | 部分 | 云内生 · Claude / Llama 延迟最低 | [aws.amazon.com/bedrock](https://aws.amazon.com/bedrock/) |
| **Azure AI Foundry** | OpenAI(独家级) + Mistral + Llama + Phi + 自家 agent framework | 云账单 | ✅ | 企业 / 合规首选(特别是 OpenAI) | [ai.azure.com](https://ai.azure.com/) |
| **GCP Vertex AI Model Garden** | Gemini + 200+ 合作 / 开源模型 | 云账单 | 部分 | 自家训练 + MLOps 最强 | [cloud.google.com/vertex-ai](https://cloud.google.com/vertex-ai) |
| **Databricks Mosaic AI** | Databricks 市场 + Mistral 原生集成 | 云账单 | ✅ | 数据 + 模型一体 | [databricks.com](https://www.databricks.com/) |
| **阿里云百炼(Model Studio)** | 通义 + 第三方 | 人民币计费 | ✅ | 国内合规 / 阿里生态 | [bailian.aliyun.com](https://bailian.console.aliyun.com/) |
| **百度千帆 / 火山方舟(字节) / 腾讯元宝** | 对应家族 + 合作 | 人民币 | 部分 | 国产云自带 | — |

### D · 自建 / 开源网关(7 家 · 自己跑的软件)

| 项目 | 语言 | GitHub Stars 量级 | 上游数 | 特色 | 来源 |
|---|---|---|---|---|---|
| **LiteLLM** | Python | ~40K | 100+ | **业内最广泛开源 AI gateway** · SDK + Proxy Server 双形态 · 虚拟 key · 成本追踪 | [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm) |
| **one-api** | Go | 20K+(停更) | 多 | 中文圈自建鼻祖 · **已停更** · 继承者 new-api | [原 one-api](https://github.com/songquanpeng/one-api) |
| **New API** | Go | 活跃 | 多 | one-api 主力继承者 · 支持 OpenAI/Claude/Gemini 兼容转换 | [github.com/QuantumNous/new-api](https://github.com/QuantumNous/new-api) |
| **OneHub** | Go | 活跃 | 多 | one-api 另一分支 · AWS Serverless 一键部署方案 | — |
| **DoneHub / Veloera / Sub2API** | Go / TS | 小 | 多 | new-api 分叉或同代 | — |
| **Metapi** | Go | 新(2026) | 聚合 New API / One API / OneHub / DoneHub / Veloera / AnyRouter / Sub2API | **聚合器的聚合器** · 一 key 管多个自建站 | [github.com/cita-777/metapi](https://github.com/cita-777/metapi) |
| **OmniRoute (9router 继承)** | TypeScript | 活跃 | 多 | TS 重写 · 多模态 API · OpenAI 兼容 | [github.com/diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) |
| **OpenZiti LLM Gateway** | — | — | 多 | Zero-trust · 身份绑定访问 · 端到端加密 | [github.com/openziti/llm-gateway](https://github.com/openziti/llm-gateway) |
| **LLM-API-Key-Proxy** | Python | 小 | 多 | OpenAI + Anthropic 双兼容 | [github.com/Mirrowel/LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy) |
| **claude-max-api-proxy** | TS | 小 | 仅 Claude | **把你的 Claude Max $200/月订阅伪装成 OpenAI API** · 灰色 | [github.com/sethschnrt/claude-max-api-proxy](https://github.com/sethschnrt/claude-max-api-proxy) |
| **claude-code-proxy** | Python | 活跃 | Claude Code ↔ OpenAI | Claude Code 反过来用 OpenAI · 开发者用 | [github.com/fuergaosi233/claude-code-proxy](https://github.com/fuergaosi233/claude-code-proxy) |

### E · 国产中转站(18 家)

核心卖点:人民币 / 支付宝 / 发票 / 国内直连不走 VPN。**定价一般是 "¥1=$1" 起 · 打折的有 0.3~0.9 档**。

| 厂商 | 规模 / 定位 | 覆盖模型 | 定价 | OpenAI 兼容 | 来源 |
|---|---|---|---|---|---|
| **DMXAPI** | "大模型" 拼音首字 · LangChain 中文网 | 全球 300+(GPT / Claude / Gemini + 文图音视频) | 打折 | ✅ | [dmxapi.cn](https://dmxapi.cn/) |
| **硅基流动(SiliconFlow)** | 国内最大开源模型推理云 · 跟 302.AI 打通 | 100+ 开源(DeepSeek / Qwen / GLM) | 超便宜 · 国内直连 50-200ms | ✅ | [siliconflow.cn](https://www.siliconflow.cn/) |
| **UiUiAPI** | 聚合 | 几十种 | 打折 | ✅ | [uiuiapi.com](https://uiuiapi.com/) |
| **302.AI** | 聚合 + AI 应用市场 | 全球 + 硅基流动打通 · 自定义上游 | 按量 | ✅ | [302.ai](https://302.ai/) |
| **AiHubMix** | 老牌中转 | GPT / Claude / Gemini / Midjourney / Suno / Luma | 打折 | ✅ | [aihubmix.com](https://aihubmix.com/) |
| **API2D** | 老牌 | GPT / Claude | 打折 | ✅ | [api2d.com](https://api2d.com/) |
| **CloseAI** | "亚洲规模最大" 企业 OpenAI 中转 · 数百家企业客户(阿里 / 腾讯 / 百度) | GPT / Claude / Gemini | 企业级 | ✅ | [closeai-asia.com](https://www.closeai-asia.com/) |
| **柏拉图 AI (api.bltcy.ai)** | 中转 | OpenAI / Claude / Midjourney / Suno / Luma | 打折 | ✅ | [api.bltcy.ai](https://api.bltcy.ai/) |
| **灵芽 API (lingyaai.cn)** | 中转 · 7x24 直连 · 比官方便宜 50% | GPT / Claude / Gemini / Deepseek / Grok / Midjourney | 便宜 50% | ✅ | [api.lingyaai.cn](https://api.lingyaai.cn/) |
| **TokenPony (小马算力)** | 讯盟科技 · 个人开发者向 | DeepSeek / Kimi / Qwen / GLM | 限时免费算力 | ✅ | [tokenpony.cn](https://www.tokenpony.cn/) |
| **七牛云 AI** | 云厂商顺延 · 国内直连 | 50+ 主流 · **兼容 Anthropic SDK** 是差异化 | 便宜 | ✅ + Anthropic | [qiniu.com/ai](https://www.qiniu.com/ai) |
| **老张 API (laozhang.ai)** | 中转 · 注册送 $10 | GPT-5 / Claude 4.6 / Gemini-3.1 / Grok-4 | 比官方低 30% | ✅ | [api.laozhang.ai](https://api.laozhang.ai/) |
| **GPTsAPI** | 中转 | 多家 | 打折 | ✅ | [gptsapi.net](https://gptsapi.net/api) |
| **V-API (api.gpt.ge)** | 中转 | OpenAI/Gemini/Claude/Deepseek/Grok/openclaw | 打折 | ✅ | [api.gpt.ge](https://api.gpt.ge/) |
| **Poloapi** | 生产级稳定性重点 | 多 | — | ✅ | — |
| **ApiPlus** | V2EX 活跃推广 | Claude 4.6 / GPT 5.4 / Gemini | 打折 | ✅ | — |
| **XueDingToken** | V2EX 口碑 · 智能路由 + 备援 | Claude / GPT / Gemini | 多档 | ✅ | — |
| **147API** | 企业结算 / 公对公 | 多 · 多模态 | 官方 50% 左右 · 首字 <300ms | ✅ | — |
| **星链 4SAPI** | 中转 | 多 | — | ✅ | — |
| **GPT_API_free (chatanywhere)** | 免费 API Key 项目 | GPT / DeepSeek / Claude / Gemini / Grok | **免费有限额** | ✅ | [github.com/chatanywhere/GPT_API_free](https://github.com/chatanywhere/GPT_API_free) |
| **Deepbricks** | 中转 | GPT / LLaMA | 低价 | ✅ | [deepbricks.ai](https://deepbricks.ai/) |
| **api.kksj.org** | V2EX 口碑 · ¥1=$1 · 0.9 折 | 全模型官渠 | 打折 0.9 | ✅ | — |

### F · 自家模型开放平台(国产 · 不是聚合 · 列出看生态)

国产"六小虎" + 互联网大厂自家模型 · 都开放了 OpenAI 兼容 API,**严格说不是聚合**,但用户 PM 常和聚合混着看。

| 厂商 | 自家模型 | OpenAI 兼容 | 来源 |
|---|---|---|---|
| **DeepSeek** | DeepSeek V3 / R1 | ✅ | [platform.deepseek.com](https://platform.deepseek.com/) |
| **月之暗面 Kimi** | Kimi K2 / K2.5 | ✅ | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| **智谱 AI (BigModel)** | GLM-4.5 / GLM-5 | ✅ · 70 万企业用户 | [bigmodel.cn](https://bigmodel.cn/) |
| **MiniMax** | abab / Music / Video | ✅ + Anthropic SDK | [platform.minimaxi.com](https://platform.minimaxi.com/) |
| **阶跃星辰 (StepFun)** | Step-1 / Step-2 | ✅ | [stepfun.com](https://www.stepfun.com/) |
| **百川智能** | Baichuan | ✅ | [baichuan-ai.com](https://www.baichuan-ai.com/) |
| **零一万物 (01.AI)** | Yi 系列 | ✅ | [lingyiwanwu.com](https://www.lingyiwanwu.com/) |
| **阿里通义** | Qwen3.6 / Qwen-Plus | ✅ · 走阿里百炼 | [tongyi.aliyun.com](https://tongyi.aliyun.com/) |
| **Mistral La Plateforme** | Mistral Large / Small | ✅ | [console.mistral.ai](https://console.mistral.ai/) |
| **Cohere** | Command / Command-R | 部分 | [cohere.com](https://cohere.com/) |

---

## 二、意外发现(3 家原本不在我预设里 · 搜到觉得有意思)

### 1. Featherless.ai — **HF 上第一大** 开源模型聚合(6700+)
大多数人不知道有个专门"把 HF 所有 open-weight 模型都通过 serverless 跑起来"的厂 · 他们靠**独特的模型加载 + GPU 编排**做到 6700+ 模型同时可调。**对做长尾小众模型实验 / 做 benchmark 的用户是神器**。[来源](https://featherless.ai/blog/featherless-becomes-hugging-faces-largest-llm-inference-provider-with-6-700-models)

### 2. Metapi — **聚合器的聚合器**(2026 新)
太多人自建 New API / One API / OneHub / AnyRouter 站,一个开发者可能同时有 5 个中转站账号。Metapi 干的事是"把这些站都挂上来,一 key 全覆盖,自动发现模型、智能路由、成本最优"。**套娃聚合** · 侧面印证国产中转站数量已经泛滥到需要再聚合一层。[github.com/cita-777/metapi](https://github.com/cita-777/metapi)

### 3. claude-max-api-proxy — **把 $200/月 Claude Max 订阅伪装成 OpenAI API**
严格意义上灰色玩法 · 不是商业聚合 · 但反映出一类民间需求:"我付了 Claude Max · 它 rate limit 高 · 为啥不拿来当 API 用省钱?" 做法就是劫持 Claude Code 的鉴权请求,转成 OpenAI 格式。**Anthropic 偶尔封** · 但走开源路线屡禁不绝。反映出"AI 订阅套利"已经工业化。[github.com/sethschnrt/claude-max-api-proxy](https://github.com/sethschnrt/claude-max-api-proxy)

**附加惊讶点**:
- **Lambda Labs 砍 serverless**(2025-09)退回纯 GPU VM —— 说明 serverless 推理卷到头了 · 小玩家撑不住(2026-04 补记)
- **LiteLLM 2026-03 爆出供应链攻击**(Trend Micro 报告)· 反向印证它装机量确实大(不然轮不到被攻)
- **HF Inference Providers 事实上是个"推理 OpenRouter"** · 15+ 家推理商统一 endpoint · 很多人不知道可以这么用

---

## 三、搜索覆盖度自评

### 覆盖到的路径 ✅

1. **英文 7 组关键词** — 全搜到 · 信息最丰富的是"OpenRouter 替代品"这条线
2. **中文 6 组关键词** — 覆盖中转 / 聚合 / 国内直连 / 发票等国产特色词
3. **Reddit r/LocalLLaMA** — 主要沉淀在 claude-max-proxy 一类民间玩法
4. **V2EX** — 国产中转站口碑 / 真伪辨别 / "不建议任何人用中转" 的怀疑派
5. **GitHub 开源趋势** — LiteLLM / new-api / OmniRoute / Metapi / OpenZiti 等
6. **知乎 / SegmentFault / 博客园** — 六维评分 / 发票 / 公对公结算维度
7. **HuggingFace Inference Providers** — 推理界聚合的聚合

### 可能遗漏的点 ⚠️

1. **日韩 / 俄罗斯 / 中东本地中转站** — 没专门搜,应该也存在(类似 Yandex → Nebius 这条线)
2. **边缘 / 物联网专用 AI 网关**(比如给车企 / IoT 做 AI 网关的) — 本次没覆盖
3. **Twitter/X 实时热点** — 我没直接访问 Twitter · 可能漏掉最近 2 周新冒出的小玩家
4. **ProductHunt 过去 90 天新上架的聚合产品** — 没单独爬 PH
5. **国产"私有部署 + 国产信创芯片"的聚合**(华为昇腾 / 寒武纪 / 海光)— 只零星看到,没深挖
6. **"Shadow" 聚合**(专门给某地区做游戏 / 内容过审绕道的 API 中转)— 敏感领域,搜不到也正常

### 总体自信度

- **海外真聚合**:覆盖度 **95%** · 头部中腰部全在
- **推理云**:覆盖度 **90%** · 主流都在 · 可能漏 2-3 家欧洲 / 中东小厂
- **国产中转**:覆盖度 **70%** · 长尾极多 · 每周都有新站冒出(见 Metapi 证据)
- **开源自建**:覆盖度 **85%**

**结论**:A + B + C + D 四类可以说"全景基本搞定" · E 类(国产中转)**必有遗漏** · 但上了 Metapi 这种二级聚合后,PM 可以当作"国产中转 = 同质化长尾 + 少数头部(DMXAPI / 硅基流动 / 302.AI / CloseAI / 灵芽 / 老张)" 看待,细节不用逐个枚举。

---

## Sources(主要依据)

- [LLM Gateway unified API](https://llmgateway.io/)
- [Best AI Gateway Tools 2026 (DEV.to)](https://dev.to/lightningdev123/best-ai-gateway-tools-in-2026-for-scalable-llm-applications-4dg)
- [Top 5 Enterprise LLM Gateways 2026 (Maxim)](https://www.getmaxim.ai/articles/top-5-enterprise-llm-gateways-in-2026/)
- [Best OpenRouter Alternatives 2026 (Eden)](https://www.edenai.co/post/best-alternatives-to-openrouter)
- [7 Best OpenRouter Alternatives (ShareAI)](https://shareai.now/blog/alternatives/openrouter-alternatives/)
- [11 Best LLM API Providers (Helicone)](https://www.helicone.ai/blog/llm-api-providers)
- [Artificial Analysis Providers Leaderboard](https://artificialanalysis.ai/leaderboards/providers)
- [Hugging Face Inference Providers Docs](https://huggingface.co/docs/inference-providers/index)
- [Featherless AI · 6700+ models](https://featherless.ai/blog/featherless-becomes-hugging-faces-largest-llm-inference-provider-with-6-700-models)
- [LiteLLM GitHub](https://github.com/BerriAI/litellm)
- [Metapi · 聚合器的聚合器](https://github.com/cita-777/metapi)
- [大模型 API 中转平台盘点 (CSDN)](https://blog.csdn.net/weixin_40378209/article/details/141827552)
- [2026 大模型API中转指南 (腾讯云)](https://cloud.tencent.com/developer/article/2619750)
- [知乎 · 2026 大模型 API 聚合平台选型](https://zhuanlan.zhihu.com/p/2018989107150346100)
- [DMXAPI](https://dmxapi.cn/) · [SiliconFlow](https://www.siliconflow.cn/) · [302.AI](https://302.ai/) · [AiHubMix](https://doc.aihubmix.com/) · [API2D](https://api2d.com/) · [CloseAI](https://www.closeai-asia.com/) · [LaoZhang.ai](https://api.laozhang.ai/) · [TokenPony](https://www.tokenpony.cn/) · [灵芽API](https://api.lingyaai.cn/) · [柏拉图 AI](https://api.bltcy.ai/) · [Qiniu AI](https://www.qiniu.com/ai)
- [V2EX · AI 中转讨论汇](https://www.v2ex.com/t/1205344)
- [claude-max-api-proxy](https://github.com/sethschnrt/claude-max-api-proxy)
- [AWS Bedrock vs Azure Foundry vs Vertex AI 2026](https://www.index.dev/skill-vs-skill/ai-aws-bedrock-vs-azure-ai-vs-vertex)
- [Groq vs DeepInfra vs Cerebras vs Fireworks vs Hyperbolic Benchmark](https://blog.gopenai.com/the-token-arbitrage-groq-vs-deepinfra-vs-cerebras-vs-fireworks-vs-hyperbolic-2025-benchmark-ccd3c2720cc8)
- [Martian LLM Router](https://withmartian.com/)
- [Portkey · OpenRouter Alternatives](https://portkey.ai/alternatives/openrouter-alternatives)
- [Vercel AI Gateway](https://vercel.com/ai-gateway)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [16 Private OpenRouter Alternatives (Prem)](https://blog.premai.io/best-openrouter-alternatives-for-private-production-ai/)
