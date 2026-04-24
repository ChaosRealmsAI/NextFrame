# 第三方 LLM API 聚合商调研(给 NextFrame · PM 视角)

**调研日期**: 2026-04-21 · 用于 NextFrame "填一个 key 调所有模型" 功能选型

---

## 1. 国际聚合商对比表

| 厂商 | 一句话定位 | 聚合量 | 主流家族覆盖 | 定价模式 | OpenAI 兼容 | 特色 |
|---|---|---|---|---|---|---|
| **OpenRouter** | 国际聚合王 · 单 key 调所有 | **300+** | Claude/GPT/Gemini/Llama/DeepSeek/Qwen 全 | token 持平原价 + **充值 5.5% 手续费**(Claude 有 markup) | ✅ drop-in 替换 | 文档 UX 最好 · BYOK 模式 · 路由兜底 · 国内需梯子 |
| **Together.ai** | 开源模型云 + 自家推理 | 200+ | Llama/Mixtral/Qwen/DeepSeek/FLUX/Kling(开源为主 · **无 Claude/GPT**) | 自家推理定价(Llama 3.3 70B $0.88/M) | ✅ `api.together.xyz/v1` | 送 $1 新用户额度 · 初创可拿 $15K-50K · 支持微调 |
| **Fireworks.ai** | 开源推理 + FireFunction | 100+ | Mixtral/DeepSeek/Qwen/FLUX/Whisper(**无 Claude/GPT**) | 自家推理($0.10-$1.40/M) | ✅ | 批量 5 折 · 微调 $0.50/M · 送 $1 起步额度 |
| **Groq** | 超快推理(LPU 硬件) | ~15 | Llama/Qwen/GPT-OSS/Whisper/Orpheus(**无 Claude/GPT/Gemini**) | 自家推理超便宜(Llama 8B $0.05/M) | ✅ | **840 tokens/秒** · 免费额度 30 RPM/14.4K req/day 不用信用卡 |
| **DeepInfra** | 开源模型最便宜 | 100+ | Claude/DeepSeek/Qwen/Llama/Gemini/FLUX | 自家推理($0.02-$1.50/M · Llama 8B $0.06/M) | ✅ | 按秒付费 · 微调 · 定制 GPU · 无最低消费 |
| **Replicate** | 开源模型超市(run-based) | 数千 | FLUX/Ideogram/Claude/DeepSeek/WAN 视频 | **按秒计费**(H100 $5.49/小时) · 少数 token | ⚠️ 自家格式为主 | 社区模型海量 · 视频/图像首选 · token 模型少 |

---

## 2. 国内聚合商对比表

| 厂商 | 一句话定位 | 聚合量 | 主流家族覆盖 | 定价模式 | OpenAI 兼容 | 特色 |
|---|---|---|---|---|---|---|
| **硅基流动 SiliconFlow** | 国产聚合王 · MaaS | **100+** | DeepSeek/Qwen/GLM/Llama/Kimi/FLUX/Kling | 持平原价(0.35-28 元/M) · 多款小模型免费 | ✅ `api.siliconflow.cn/v1` | 新人送 **14-18 元**(~2000 万 token) · DeepSeek 国内直连 · 发票合规 |
| **302.AI** | 企业级一站式应用中心 | ~100 | OpenAI/Claude/Gemini/Midjourney/DALL-E/Suno | 按量付费 · 余额永久有效 · 无订阅 | ✅(部分)+ 图像/音频自家格式 | AI 应用商店 · 聚图像/音乐/视频 · 国内直连 |
| **AiHubMix** | OpenAI 镜像起家老牌 | ~50 | OpenAI/Claude/Gemini/Llama/Qwen/DeepSeek | **持平原价**(随官方价 · 无订阅) | ✅ 统一 OpenAI 格式 | 国内直连 · 无并发限制 · 支持 Anthropic/Gemini 原生格式 |
| **API2D** | 老牌 OpenAI 镜像 | ~20 | GPT-3.5/4 为主(其他补充) | 点数制(P) · 持平或小溢价 | ✅ | 老牌社区 · OpenAI 镜像稳 · 覆盖面不如硅基/AiHubMix |

**附注**(自家云伪装聚合): 阿里云 DashScope / 火山引擎 ARK / 智谱 BigModel — 主力自家模型 + 少量友商 · 企业合规首选但非真聚合。

---

## 3. 给 NextFrame 的 3 种集成策略

NextFrame 是**视频引擎**(JSON → HTML/MP4) · LLM 用于"脚本生成 / 场景描述 / 解说词" · 不是核心但需要让用户自带 key。

### 策略 A · 锁定 OpenRouter(国际用户首选)

- **优势**: 一个 base_url `openrouter.ai/api/v1` + 用户自己的 key → 300+ 模型全解锁 · 文档/UX 最好 · OpenAI SDK 零改
- **劣势**: 国内用户需梯子 · Claude 有 100% markup(大客户介意) · 充值 5.5% 手续费
- **适合**: NextFrame 海外发行版 / 开发者向

### 策略 B · 锁定硅基流动(国内用户首选)

- **优势**: 国内直连不用梯子 · DeepSeek/Qwen 国产最全 · 中文发票合规 · 新用户 14-18 元白嫖 · OpenAI 兼容
- **劣势**: 无 Claude/GPT 官方(需走海外) · 海外用户访问慢
- **适合**: NextFrame 国内版 / C 端普及场景

### 策略 C · UI 下拉选聚合商 + base_url 预填(**推荐 · 最灵活**)

NextFrame 设置页给用户一个下拉:

```
[Provider]  OpenRouter ▼
            ├─ OpenRouter (国际 300+ 模型)
            ├─ SiliconFlow (国内直连 · 送免费额度)
            ├─ Together.ai (开源专)
            ├─ Groq (超快 · 免费)
            ├─ OpenAI 官方
            ├─ Anthropic 官方
            └─ 自定义 (填 base_url)

[API Key]   sk-xxx
[Model]     (按 provider 自动拉列表)
```

- **优势**: 用户选自己熟的 · NextFrame 零维护聚合层 · 所有主流都 OpenAI-compatible → 代码就一套
- **劣势**: UI 多一步(但下拉 5 秒 · PM 可接受)
- **实现成本**: 硬编码 6-8 个 provider 的 `{name, base_url, model_list_endpoint}` JSON · ~100 行代码

**推荐 C** — 不赌单一平台 · 海外/国内用户都覆盖 · 代码零维护成本 · 后续加 provider 改 JSON 即可。

---

## Sources

- [OpenRouter Models (300+)](https://openrouter.ai/models) · [OpenRouter Pricing 2026 breakdown](https://costbench.com/software/llm-api-providers/openrouter/)
- [Together.ai pricing](https://www.together.ai/pricing) · [Together OpenAI compatibility](https://docs.together.ai/docs/openai-api-compatibility)
- [Fireworks.ai pricing](https://fireworks.ai/pricing)
- [Groq pricing](https://groq.com/pricing/) · [Groq free tier 2026](https://tokenmix.ai/blog/groq-free-tier-limits-2026)
- [DeepInfra pricing](https://deepinfra.com/pricing) · [DeepInfra OpenAI API](https://deepinfra.com/docs/openai_api)
- [Replicate pricing](https://replicate.com/pricing)
- [SiliconFlow docs](https://docs.siliconflow.cn/quickstart) · [SiliconFlow 免费额度](https://zhuanlan.zhihu.com/p/2012665477856507322)
- [AiHubMix docs](https://docs.aihubmix.com/cn)
- [302.AI](https://302.ai/)
- [API2D docs](https://api2d-doc.apifox.cn/)
