# 4 个开源 AI agent 产品 · 多模型切换调研

PM 视角 · 看用户怎么切模型 · 底层怎么搭

---

## 1. opencode (sst/opencode · TS/Go)

**是啥**:开源版 Claude Code · 终端里的编码 agent

**用户切模型**:两种都行
- 运行时敲 `/models` 命令弹选择器(最轻松)
- 或改 `opencode.json` 配置文件 · 写 `"model": "anthropic/claude-sonnet"`

**底层**:**Vercel AI SDK + models.dev 注册表** · 不自己写 adapter · 新模型只要 models.dev 更新 opencode 立刻能用

**支持家数**:**75+ provider** · 主流预装 · OpenAI-compatible 也支持

**stars**:~140k(2026 年 1 月因 Anthropic 封号事件一个月涨 30k)

---

## 2. Cline (cline/cline · VSCode 插件)

**是啥**:VSCode 里的自主编码 agent · 能开浏览器 / 跑命令 / 改文件

**用户切模型**:**齿轮图标 → 下拉菜单选 Provider** · 再填 API key · 最 PM 友好
- 选 OpenRouter 会自动拉取最新模型列表

**底层**:自己写 adapter · 每个 provider 一份 · 不用库

**支持家数**:9 家官方(Anthropic / OpenAI / Gemini / Bedrock / Azure / Vertex / Cerebras / Groq / OpenRouter)+ 任意 OpenAI-compatible + 本地 Ollama/LM Studio

**stars**:~60.5k

---

## 3. Aider (Aider-AI/aider · Python CLI)

**是啥**:终端里的 AI pair programming

**用户切模型**:CLI flag · 一句话搞定
- `aider --model sonnet --api-key anthropic=xxx`
- `aider --model deepseek ...`
- 可选写 `.aider.model.settings.yml` 做默认

**底层**:**LiteLLM 库** · 不自己写 adapter · LiteLLM 支持啥 Aider 就支持啥

**支持家数**:~100+(继承 LiteLLM 全量)

**stars**:~43.6k

---

## 4. Continue.dev (continuedev/continue · VSCode+JetBrains)

**是啥**:可自定义的 AI 编码助手 · 企业友好 · 支持 CI 检查

**用户切模型**:改 `config.yaml`(新版)或 `config.json`(旧版)· 侧边栏顶部也能切 · 有 `AUTODETECT` 魔法名一键拉所有模型

**底层**:**自己写 adapter**(每 provider 一个 class)· 不用 LiteLLM

**支持家数**:所有主流(OpenAI / Anthropic / Azure / Mistral / Ollama / ...)· 官方没给确切数

**stars**:~32.7k

---

## 共识抽取(5 条共同做法)

1. **配置放 JSON/YAML · 不写死代码** · 用户改文件就能加模型 · 4 个全这样
2. **OpenAI-compatible base_url 兜底** · 只要模型服务商支持 OpenAI 格式 · 都能接(覆盖 90% 长尾)
3. **OpenRouter 是主流兜底路径** · 一个 key 接所有 · 4 个全原生支持
4. **分两派底层实现**:① 用现成库(opencode=Vercel AI SDK / aider=LiteLLM · 省事 · 跟得快)② 自己写 adapter(cline / continue · 可控 · 能深度用 provider 特性如 Anthropic tool use)
5. **模型选择必须是运行时动作** · 不是重启 · 4 个都给了"运行中切换"路径(命令 / 下拉 / flag)

**给 NextFrame 的启发**:PM 用户不碰代码 · **先选库再自己写**——Vercel AI SDK(TS 项目)或 LiteLLM(Python 项目) · 配置走 JSON · UI 给下拉切换 · 默认挂 OpenRouter 做兜底。深度特性(如 Anthropic 原生 tool use)再单独写 adapter。

Sources:
- [sst/opencode](https://github.com/sst/opencode)
- [opencode models docs](https://opencode.ai/docs/models/)
- [cline/cline](https://github.com/cline/cline)
- [Cline OpenRouter config](https://docs.cline.bot/provider-config/openrouter)
- [Aider-AI/aider](https://github.com/Aider-AI/aider)
- [Aider LiteLLM integration (DeepWiki)](https://deepwiki.com/Aider-AI/aider/6.3-multi-provider-llm-integration)
- [continuedev/continue](https://github.com/continuedev/continue)
- [Continue config reference](https://docs.continue.dev/reference)
