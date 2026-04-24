# 开源 Claude Code 类 CLI Coding Agent 调研

> 2026-04-21 · PM 视角 · 终端 agent 生态摸底 · 为 NextFrame 未来做 agentloop 积累素材

---

## 1. OpenAI Codex CLI (`openai/codex`)

- **是啥**：OpenAI 官方终端 coding agent，Rust 写的，本地跑。
- **agent loop**：README 没细讲架构；ChatGPT 订阅带，偏"问答 + 执行"。subagent/MCP 文档都没写（官方仍在迭代）。
- **模型**：OpenAI 独家（GPT-5.x 系列）。
- **部署**：`npm install -g @openai/codex` / `brew install --cask codex`
- **差异**：Rust 编译单二进制，启动快；但对外只吃 OpenAI，生态封闭。
- **Stars**：76.7k

## 2. Gemini CLI (`google-gemini/gemini-cli`)

- **是啥**：Google 官方终端 Gemini agent，TS 写的。
- **agent loop**：会话 checkpoint 存/恢复 + `GEMINI.md` 项目上下文文件（对标 CLAUDE.md）+ token caching。无 subagent。
- **MCP**：✅ 原生，`~/.gemini/settings.json` 配 MCP server。
- **模型**：Gemini only（-m gemini-2.5-flash / 3）。
- **部署**：`npm install -g @google/gemini-cli` / `brew install gemini-cli` / `npx` 零装。
- **免费额度**：个人 Google 账号 OAuth 60 req/min · 1000 req/day（最大方的）。
- **差异**：免费额度碾压，CLAUDE.md 思路被抄成 GEMINI.md。
- **Stars**：101.9k（本批最高）

## 3. Qwen Code (`QwenLM/qwen-code`)

- **是啥**：阿里官方，**Gemini CLI 的 fork**（parser 层改适配 Qwen-Coder）。
- **agent loop**：带 "Skills + SubAgents" 内建工具 + `/compress` 压历史省 token。
- **MCP**：README 没提（继承 Gemini CLI 应有）。
- **模型**：Qwen 主打，但吃 OpenAI/Anthropic/Gemini-兼容 API + Ollama/vLLM 本地。
- **部署**：`npm install -g @qwen-code/qwen-code@latest` / `brew install qwen-code`
- **差异**：国产可选，模型兼容面最广，fork 策略快速跟进。
- **Stars**：23.6k

## 4. goose (`block/goose`)

- **是啥**：Block（Square 母公司）开源，Rust 写的通用 agent，不止 coding（research/writing/自动化/数据分析）。
- **agent loop**：README 没细讲；主打 extension 机制。
- **MCP**：✅ **MCP-native**，70+ 官方 extension 全走 MCP。
- **模型**：15+ 家（Anthropic / OpenAI / Google / Ollama / OpenRouter / Azure / Bedrock...）。
- **部署**：`curl ... download_cli.sh | bash`（脚本装）
- **差异**：MCP 生态最丰富，模型无关设计最彻底；定位比 Claude Code 更宽。
- **Stars**：42.9k

## 5. OpenHands (`All-Hands-AI/OpenHands`，原 OpenDevin)

- **是啥**：自主 AI 开发 agent 平台，Python 写的。
- **agent loop**：SDK 驱动，"autonomous"（自己拿任务跑），README 没展开多 agent 细节。
- **MCP**：README 没提。
- **部署姿势**：CLI + Local GUI（REST + React）+ 云托管（app.all-hands.dev）三种。
- **模型**："Claude / GPT / 任何 LLM"（抽象层）。
- **差异**：唯一同时提供 CLI 和 Web UI 的，偏 autonomous agent 范式（给目标自己跑到完）；对标 Devin。
- **Stars**：71.6k

## 6. gptme (`gptme/gptme`)

- **是啥**：Python 轻量终端 agent，带 shell/code/file/web/vision 工具。
- **agent loop**：**本批最完整**：持久化 workspace + systemd/launchd 定时触发 + 结构化 task queue + 参考 agent "Bob" 常驻 loop + 文件租约 / message bus / work claiming 多 agent 协调。
- **subagent**：✅ 有 subagent 工具，并行/隔离任务。
- **MCP**：✅ 动态发现加载 MCP server。
- **模型**：Anthropic/OpenAI/Gemini/xAI/DeepSeek/OpenRouter 100+ / llama.cpp 本地。
- **部署**：`pipx install gptme`
- **差异**：小众但 **agent 架构最成熟**（持久化 + 调度 + 多 agent 协调全有），跟 NextFrame 想做的 agentloop 最像。
- **Stars**：4.3k（本批最低，但含金量高）

## 7. Open Interpreter (`OpenInterpreter/open-interpreter`)

- **是啥**：终端里的"自然语言 = 代码"，LLM 本地跑代码（Python/JS/Shell）。
- **agent loop**：对话循环 + function calling，无 planner。
- **MCP**：无。subagent 无。
- **模型**：GPT-4 / Claude / Command + 本地（LiteLLM / Ollama / LM Studio / Llamafile）。
- **部署**：`pip install open-interpreter`
- **差异**：定位跟其他 6 个不同 —— **不是 coding agent，是 "ChatGPT 代码解释器的本地版"**。杀手锏：本地跑不限制文件大小 / 联网 / 无 sandbox。
- **Stars**：63.2k

---

## 共识 + 给 NextFrame 的启示

**共识 5 条**：

1. **都有官方 CLAUDE.md 思路**：Gemini 抄成 `GEMINI.md`，几乎全员都靠"项目根 md 文件"给 agent 喂上下文 —— **这模式已经赢了**。
2. **MCP 快成事实标准**：Gemini/goose/gptme/Qwen(继承) 都原生；OpenAI Codex / Open Interpreter / OpenHands 还没跟 —— 3 年内不跟的会掉队。
3. **模型无关是大势**：只绑自家的（Codex / Gemini）靠生态；goose/gptme/Qwen 吃所有家，**OpenRouter 成穿透层**。
4. **subagent 不普及**：只 gptme 和 Qwen 明说有 —— 多数 CLI 还停在"单 agent 长跑"，并行调度是下一代竞争点。
5. **部署姿势收敛**：`npm install -g` 或 `pip/pipx install` 一条搞定是门票，装起来费劲的（OpenHands docker）天然劣势。

**planner / executor 分离**：6/7 没做（只 gptme 的"Bob reference agent"算），主流仍 LLM 直接 function-call 硬跑 —— **我们做 agentloop 的差异化机会在这**（类比 Claude Code 的 PlanMode）。

**TUI 常见模式**：REPL 对话 + slash 命令（`/compress` `/plan` `/resume`）+ 项目根 md 持久上下文 + checkpoint 恢复 —— 4 要素成标配。

**对 NextFrame 3 条建议**：

- **抄 gptme 的 agentloop 架构**（持久 workspace + 定时 + task queue + work claiming），这是本批最成熟的样本，跟我们 autopilot + worktree 思路最近。
- **MCP 必须原生**，别自造协议 —— goose 的 70+ extension 生态给了前车之鉴。
- **模型抽象层用 LiteLLM 或 OpenRouter**，别绑单家 —— 我们已有 ally 封装多 backend，方向对。

---

路径：`/Users/Zhuanz/bigbang/NextFrame/tmp/research-cli-agents.md`
