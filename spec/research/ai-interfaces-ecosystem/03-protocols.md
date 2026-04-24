# 多模型协议调研（给 PM 看）

## 事实标准是什么

**OpenAI 的 `/v1/chat/completions` 格式已经是事实标准 —— 写一个客户端，能调几乎所有模型。**

证据：Claude、Gemini、DeepSeek、Qwen、Ollama、vLLM、LM Studio **全部**提供 "OpenAI-compatible endpoint"，你换个 `base_url` 和 key，代码一行不改就能切换模型。不是谁统一谁，是大家**主动抄 OpenAI 的格式**，因为生态已在那。

## MCP 是什么 / 跟模型层的关系

MCP（Model Context Protocol，Anthropic 2024-11 推出）**不是模型接口协议，是"工具/数据接入"协议** —— 让 AI 客户端能发现并调用外部工具。类比：`chat/completions` 是"AI 的嘴"，MCP 是"AI 的手"。

2026 年 3 月 OpenAI / Google 全都加入，10000+ public MCP servers 在跑。

```
┌─────────────────────────────────────────────────┐
│ 应用层      Claude Desktop / Cursor / ChatGPT   │  ← 用户在这
├─────────────────────────────────────────────────┤
│ MCP 协议    "手"：让 AI 调外部工具 / 读数据     │  ← NextFrame 可做 server
├─────────────────────────────────────────────────┤
│ Agent 层    编排 / 决策 / 多轮                  │
├─────────────────────────────────────────────────┤
│ LLM 接口    "嘴"：OpenAI chat/completions 格式  │  ← 事实标准在这
├─────────────────────────────────────────────────┤
│ 模型        GPT / Claude / Gemini / DeepSeek    │
└─────────────────────────────────────────────────┘
```

Tool Use 跨家**格式不一样**（OpenAI `parameters` / Claude `input_schema`），但 Claude 的 OpenAI-兼容层能帮你糊过去；要严格 schema 还得走原生。MCP 的出现正是为了让这个乱象终结。

## 给 NextFrame 的启示

两条路，**不冲突，建议都做**：

1. **调模型时只写 OpenAI 格式** —— 一套客户端打遍天下，用户换 key 就换模型。成本：几乎零。
2. **做 MCP server** —— 把 NextFrame 的"剪视频 / 生成场景 / 渲染 mp4"暴露成 MCP tools。任何 AI 客户端（Claude Desktop / ChatGPT / Cursor）都能让用户说"帮我剪个视频"然后调 NextFrame。这是**让 AI 帮用户操作 NextFrame** 的标准路径，2026 已经是入场券。

选 ① 是"NextFrame 调 AI"，选 ② 是"AI 调 NextFrame"。PM 视角：两个方向的流量都接，不站队任何家。

## Sources

- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [vLLM OpenAI-Compatible Server](https://docs.vllm.ai/en/stable/serving/openai_compatible_server/)
- [LM Studio OpenAI Compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Anthropic OpenAI SDK compatibility](https://docs.anthropic.com/en/api/openai-sdk)
- [MCP Introduction](https://modelcontextprotocol.io/introduction)
- [MCP Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [MCP vs Function Calling](https://www.descope.com/blog/post/mcp-vs-function-calling)
- [OpenAI Function Calling vs Anthropic Tool Use](https://agentsindex.ai/compare/anthropic-tool-use-vs-openai-function-calling)
