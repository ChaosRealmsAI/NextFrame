# 浏览器自动化 & AI Browser Agent 全景调研

> 调研日期：2026-04-14  
> 目标：为 nf-publish（WKWebView 多平台发布器）和未来 analytics/话题功能提供竞品参考

---

## 一、经典浏览器自动化框架

### Playwright
- **URL**: https://github.com/microsoft/playwright — ⭐ 70k+
- **是什么**: Microsoft 出品的跨浏览器自动化框架，支持 Chromium / Firefox / WebKit
- **AI 驱动**: 否（纯规则/代码驱动）
- **开源**: 是（MIT）
- **关键能力**: 跨浏览器、内置等待机制、网络拦截、移动模拟、多语言（JS/Python/.NET/Java）
- **与 nf-publish 的关系**: nf-publish 用 WKWebView + NSEvent 原生方案，无需 Playwright 层。但 Skyvern/Stagehand 等 AI 工具基于 Playwright，可参考其 JS 注入和元素定位方式

### Puppeteer
- **URL**: https://github.com/puppeteer/puppeteer — ⭐ 89k+
- **是什么**: Google 出品，Node.js 控制 Chrome/Chromium 的高层 API
- **AI 驱动**: 否
- **开源**: 是（Apache 2.0）
- **关键能力**: 截图、PDF 生成、爬虫、CDP 协议直连 Chrome
- **与 nf-publish 的关系**: nf-publish 已用 WKWebView + JS 评估替代了 Puppeteer 的功能；可参考 Puppeteer 的 evaluate/screenshot API 设计

### Selenium
- **URL**: https://github.com/SeleniumHQ/selenium — ⭐ 31k+
- **是什么**: 历史最久的浏览器自动化框架，WebDriver 标准的来源
- **AI 驱动**: 否
- **开源**: 是（Apache 2.0）
- **关键能力**: 多浏览器、多语言绑定（Python/Java/C#/Ruby）、云测试集成
- **与 nf-publish 的关系**: 架构参考价值低，nf-publish 已超越其设计思路

### Cypress
- **URL**: https://github.com/cypress-io/cypress — ⭐ 47k+
- **是什么**: 前端测试框架，在真实浏览器里运行测试代码
- **AI 驱动**: 否
- **开源**: 是（MIT，部分商业功能付费）
- **关键能力**: 实时重载、内置等待、截图/视频录制、组件测试
- **与 nf-publish 的关系**: 定位是测试工具，不是自动化发布工具，无直接参考价值

---

## 二、AI 浏览器 Agent 框架

### Browser Use
- **URL**: https://github.com/browser-use/browser-use — ⭐ 87.7k
- **是什么**: 最受欢迎的 AI 浏览器 agent 框架，自然语言描述任务，AI 自己决定怎么操作
- **AI 驱动**: 是（支持 GPT-4o / Claude / Gemini / Ollama）
- **开源**: 是（MIT）
- **关键能力**: 纯自然语言驱动、支持多 LLM、云端 + 本地两种部署、Python SDK
- **与 nf-publish 的关系**: 竞品核心对标。nf-publish 用 WKWebView + NSEvent 原生方案更稳定，但 Browser Use 的"任务描述 → 自动执行"模式是未来 nf-publish 可以借鉴的方向

### Stagehand
- **URL**: https://github.com/browserbase/stagehand — ⭐ 22.1k
- **是什么**: Playwright + AI 的混合 SDK，保留代码控制的同时加入 AI 推理层
- **AI 驱动**: 是（act / extract / observe 三个 AI 原语）
- **开源**: 是（MIT）
- **关键能力**: 代码 + AI 混合控制、action 缓存减少 token、自愈自动化（网站改版自适应）
- **与 nf-publish 的关系**: 架构参考价值高。nf-publish 的 JS eval + 命令循环模式类似 Stagehand 的 act/extract 分层设计

### Skyvern
- **URL**: https://github.com/Skyvern-AI/skyvern — ⭐ 21.1k
- **是什么**: 用 LLM + 计算机视觉操作浏览器，不靠 DOM 解析
- **AI 驱动**: 是（多模态，视觉 + 文本理解）
- **开源**: 是（AGPL-3.0）
- **关键能力**: 截图→视觉定位→点击，85.85% WebVoyager 评分，表单填写场景最强，支持 2FA/密码管理器
- **与 nf-publish 的关系**: nf-publish 目前用 JS 定位元素，Skyvern 的视觉定位思路可以作为备用方案（当网页结构复杂时）

### AgentQL
- **URL**: https://github.com/tinyfish-io/agentql — ⭐ 1.3k
- **是什么**: 自然语言查询语言 + Playwright 集成，让 AI 能"查询" Web 页面元素
- **AI 驱动**: 是（自然语言选择器）
- **开源**: 是（部分开源，核心 API 商业）
- **关键能力**: 自愈选择器（UI 改版后自动适应）、结构化数据提取、Python/JS SDK
- **与 nf-publish 的关系**: 其自然语言选择器思路可用于 nf-publish 的"智能定位上传按钮"场景

### LaVague
- **URL**: https://github.com/lavague-ai/LaVague — ⭐ 6.3k
- **是什么**: Large Action Model 框架，自然语言指令驱动 Selenium/Playwright 自动化
- **AI 驱动**: 是
- **开源**: 是（Apache 2.0）
- **关键能力**: 可插拔驱动（Selenium/Playwright/Chrome 扩展）、Gradio 交互界面、基准测试工具
- **与 nf-publish 的关系**: 参考价值中等，架构思路（指令解析 → 驱动层）与 nf-publish 的命令文件循环模式类似

### Nanobrowser
- **URL**: https://github.com/nanobrowser/nanobrowser — ⭐ 12.7k
- **是什么**: 开源 Chrome 扩展，多 agent 协作完成浏览器任务，OpenAI Operator 的免费替代
- **AI 驱动**: 是（用户自带 LLM API Key）
- **开源**: 是（MIT）
- **关键能力**: 本地优先、隐私保护、多 agent 并行、免费
- **与 nf-publish 的关系**: 竞品参考——nf-publish 是 macOS 原生应用，Nanobrowser 是 Chrome 扩展；两者定位不同但都是"自动化发布"场景

### WebVoyager
- **URL**: https://github.com/MinorJerry/WebVoyager — ⭐ 约 1k
- **是什么**: 俄亥俄州立大学研究项目，LMM（大型多模态模型）驱动的端到端 Web Agent
- **AI 驱动**: 是（GPT-4V 视觉推理）
- **开源**: 是（学术 License）
- **关键能力**: 视觉 + 文本联合推理、真实网站交互基准（WebVoyager Benchmark 标准制定者）
- **与 nf-publish 的关系**: 学术参考，WebVoyager Benchmark 是评估 AI 浏览器 agent 的主要基准之一

### SeeAct
- **URL**: https://github.com/OSU-NLP-Group/SeeAct — ⭐ 约 2k
- **是什么**: 俄亥俄州立大学，ICML'24 论文，GPT-4V 驱动的通用 Web Agent
- **AI 驱动**: 是（多模态 LMM）
- **开源**: 是（MIT，Chrome 扩展 2024 年 11 月开源）
- **关键能力**: 任意网站任务执行、Chrome 扩展形态
- **与 nf-publish 的关系**: 学术参考

### Dendrite
- **URL**: https://github.com/dendrite-systems/dendrite-python-sdk — ⭐ 小
- **是什么**: Python SDK，为 AI Agent 提供 Web 认证 + 交互 + 数据提取能力
- **AI 驱动**: 是（自然语言选择器）
- **开源**: 是（已停止维护，代码可 fork）
- **关键能力**: 内置认证、自然语言元素选择、旋转代理支持
- **与 nf-publish 的关系**: 已停维护，参考价值有限

---

## 三、AI 大厂 Browser Agent 产品

### Claude Computer Use（Anthropic）
- **URL**: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- **是什么**: Claude 直接控制桌面环境（截图→分析→鼠标/键盘操作），支持 Windows/Mac/Linux + 浏览器
- **AI 驱动**: 是（Claude 3.5 Sonnet+）
- **开源**: 否（API 付费）
- **关键能力**: 全桌面控制（非仅浏览器）、跨应用工作流、开发任务优秀
- **与 nf-publish 的关系**: nf-publish 的自动化理念与 Computer Use 相同；nf-publish 是 WKWebView 级别、更轻量，Computer Use 是全桌面级

### OpenAI ChatGPT Agent Mode（前身 Operator）
- **URL**: https://openai.com/operator（已合并到 ChatGPT）
- **是什么**: 2025 年 1 月发布为 Operator，2025 年 8 月合并为 ChatGPT Agent Mode
- **AI 驱动**: 是（GPT-4o）
- **开源**: 否（$200/月 Pro 用户）
- **关键能力**: 浏览器任务委托、Web 导航 87% 成功率（2026 年初数据）
- **与 nf-publish 的关系**: 商业竞品参考，nf-publish 走开源 + 本地路线，定位不同

### Google Project Mariner
- **URL**: https://deepmind.google/
- **是什么**: Google DeepMind 研究原型，探索 AI Agent 与浏览器的交互
- **AI 驱动**: 是（Gemini）
- **开源**: 否
- **关键能力**: 浏览器内多步任务执行
- **与 nf-publish 的关系**: 研究方向参考

---

## 四、基础设施 & 无头浏览器服务

### Browserbase
- **URL**: https://browserbase.com / https://github.com/browserbase/mcp-server-browserbase — ⭐ 3.2k（MCP server）
- **是什么**: 云端无头浏览器 API，专为 AI Agent 设计的浏览器基础设施
- **AI 驱动**: 基础设施层（不含 AI，但专为 AI 优化）
- **开源**: 否（商业，2025 年 B 轮 $4000 万）
- **关键能力**: 5000 万 session/年、Session 管理、Stagehand 官方推荐底层
- **与 nf-publish 的关系**: nf-publish 用本地 WKWebView，无需云浏览器基础设施。但 Browserbase 的 session 隔离和 cookie 管理设计值得参考

### Steel Browser
- **URL**: https://github.com/steel-dev/steel-browser — ⭐ 6.8k
- **是什么**: 开源无头浏览器 API，专为 AI App 构建，自托管版 Browserbase
- **AI 驱动**: 基础设施层
- **开源**: 是（Apache 2.0）
- **关键能力**: Session 管理、代理轮换、Chrome 扩展支持、反检测、Docker 部署
- **与 nf-publish 的关系**: nf-publish 可参考其 session 持久化设计（类似 nf-publish 的 tab registry）

### BrowserMCP
- **URL**: https://github.com/BrowserMCP/mcp — ⭐ 6.2k
- **是什么**: MCP server，让 AI 应用通过 Model Context Protocol 控制浏览器
- **AI 驱动**: 是（MCP 协议层）
- **开源**: 是
- **关键能力**: 标准 MCP 接口、本地浏览器控制
- **与 nf-publish 的关系**: MCP 是 Claude 生态标准协议，nf-publish 未来如需对外暴露操作接口可参考

### MultiOn
- **URL**: https://multion.ai / https://docs.multion.ai
- **是什么**: AI Agent 平台，自然语言委托浏览器任务
- **AI 驱动**: 是
- **开源**: 否（商业 API）
- **关键能力**: 多步 Web 任务、Chrome 扩展形态
- **与 nf-publish 的关系**: 商业竞品参考

---

## 五、Computer Use / GUI Agent

### UI-TARS（ByteDance）
- **URL**: https://github.com/bytedance/UI-TARS — ⭐ 10.1k
- **是什么**: 字节跳动出品，多模态 GUI Agent，基于视觉语言模型，可操作桌面/浏览器/手机
- **AI 驱动**: 是（7B～72B 参数视觉语言模型）
- **开源**: 是（Apache 2.0）
- **关键能力**: 全平台 GUI 操作（Windows/Mac/Linux/Android）、强化学习推理、游戏/代码/浏览器多场景
- **与 nf-publish 的关系**: 与 nf-publish 底层理念相似（原生 GUI 控制），但 UI-TARS 需要 AI 推理，nf-publish 走确定性脚本路线

### Self-Operating Computer Framework
- **URL**: https://github.com/OthersideAI/self-operating-computer — ⭐ 10k+
- **是什么**: 让多模态模型通过截图操作电脑
- **AI 驱动**: 是（GPT-4V / Claude / Gemini）
- **开源**: 是（MIT）
- **关键能力**: 截图→AI 决策→鼠标键盘操作的闭环
- **与 nf-publish 的关系**: 参考其截图验证设计

---

## 六、RPA 工具

### Robocorp
- **URL**: https://github.com/robocorp/rpaframework — ⭐ 1.1k
- **是什么**: 开源 Python RPA 平台，基于 Robot Framework
- **AI 驱动**: 部分（集成 AI 功能）
- **开源**: 是（Apache 2.0）
- **关键能力**: Python/Robot Framework 编写、跨平台（Win/Mac/Linux）、云端 Control Room 调度
- **与 nf-publish 的关系**: 工程参考，nf-publish 用 Rust + 原生 API 比 Python RPA 更轻量高效

### TagUI
- **URL**: https://aisingapore.org/aiproducts/tagui — GitHub: aisingapore/tagui — ⭐ 6k+
- **是什么**: AI Singapore 出品，人类可读语法的 RPA 工具
- **AI 驱动**: 部分
- **开源**: 是（Apache 2.0）
- **关键能力**: 自然语言流程描述、Web + 桌面自动化、适合非开发者
- **与 nf-publish 的关系**: 低代码 RPA 参考，nf-publish 不走这个方向

### UI.Vision
- **URL**: https://ui.vision
- **是什么**: 跨平台桌面 + 浏览器自动化工具，支持 Windows/Mac/Linux
- **AI 驱动**: 是（集成 Computer Use）
- **开源**: 是（开源版 + 付费专业版）
- **关键能力**: OCR 识别、Computer Use 集成、RPA 录制重放
- **与 nf-publish 的关系**: 同类竞品，nf-publish 的 WKWebView 方案比 UI.Vision 的跨平台方案更精准

### 影刀 RPA
- **URL**: https://www.yingdao.com
- **是什么**: 国内头部 RPA 工具，主打易用性，无需编程基础
- **AI 驱动**: 是（集成 OCR、AI 识图等）
- **开源**: 否（商业）
- **关键能力**: 可视化流程设计、Web/桌面/移动端自动化、电商/零售场景深度优化
- **与 nf-publish 的关系**: 国内竞品参考，覆盖抖音/小红书/视频号等平台的发布自动化

### UiBot
- **URL**: https://www.uibot.com.cn
- **是什么**: 来也科技出品，从流程自动化到认知自动化
- **AI 驱动**: 是（AI+RPA 融合）
- **开源**: 否（商业）
- **关键能力**: 流程录制、AI 文档理解、企业级部署
- **与 nf-publish 的关系**: 企业 RPA 竞品参考

### 八爪鱼采集器
- **URL**: https://www.bazhuayu.com
- **是什么**: 国内领先的数据采集工具，五年连续行业排名第一
- **AI 驱动**: 是（AI 字段识别）
- **开源**: 否（商业，有免费版）
- **关键能力**: 可视化配置、零代码、内置海量模板、任意网页数据抓取
- **与 nf-publish 的关系**: 主要定位是数据采集（爬虫），与 nf-publish 发布方向不同，但其模板化思路值得参考

### OpenRPA
- **URL**: https://openiap.io/openrpa
- **是什么**: 企业级开源 RPA 平台，.NET 构建
- **AI 驱动**: 部分
- **开源**: 是
- **关键能力**: UiPath 开源替代、企业级部署
- **与 nf-publish 的关系**: 参考价值低

---

## 七、综合对比矩阵

| 工具 | Stars | AI 驱动 | 开源 | 定位 | nf-publish 相关度 |
|------|-------|---------|------|------|-----------------|
| Browser Use | 87.7k | ✅ | ✅ | AI 浏览器 agent | ⭐⭐⭐ 直接竞品 |
| Playwright | 70k+ | ❌ | ✅ | 自动化测试框架 | ⭐⭐ 底层参考 |
| Puppeteer | 89k+ | ❌ | ✅ | Chrome 控制 | ⭐⭐ 底层参考 |
| Stagehand | 22.1k | ✅ | ✅ | AI+代码混合 SDK | ⭐⭐⭐ 架构参考 |
| Skyvern | 21.1k | ✅ | ✅ | 视觉 AI 自动化 | ⭐⭐ 视觉方案参考 |
| Nanobrowser | 12.7k | ✅ | ✅ | Chrome 扩展 agent | ⭐⭐ 竞品参考 |
| UI-TARS | 10.1k | ✅ | ✅ | GUI Agent 模型 | ⭐⭐ 技术参考 |
| Steel Browser | 6.8k | ❌ | ✅ | 无头浏览器 API | ⭐⭐ 基础设施参考 |
| LaVague | 6.3k | ✅ | ✅ | LAM 框架 | ⭐ 学术参考 |
| AgentQL | 1.3k | ✅ | 部分 | Web 查询语言 | ⭐⭐ 选择器参考 |
| Claude Computer Use | — | ✅ | ❌ | 全桌面控制 | ⭐⭐⭐ 理念对标 |
| ChatGPT Agent Mode | — | ✅ | ❌ | 浏览器委托 | ⭐⭐⭐ 商业竞品 |
| Browserbase | — | ❌ | ❌ | 云浏览器基础设施 | ⭐ session 设计参考 |
| 影刀 RPA | — | ✅ | ❌ | 国内 RPA | ⭐⭐⭐ 国内竞品 |
| UiBot | — | ✅ | ❌ | 认知自动化 | ⭐⭐ 国内竞品 |
| 八爪鱼 | — | ✅ | ❌ | 数据采集 | ⭐ 模板化思路 |
| Robocorp | 1.1k | 部分 | ✅ | Python RPA | ⭐ 工程参考 |
| TagUI | 6k+ | 部分 | ✅ | 低代码 RPA | ⭐ 参考 |

---

## 八、对 nf-publish 的启示

### 1. 现有架构的竞争力
nf-publish 用 WKWebView + NSEvent 原生输入 + JS 仅做定位/读取的方案，相比 Browser Use / Playwright 有两个优势：
- **反检测**：原生 NSEvent 事件和真实浏览器 UA，不触发平台反爬
- **macOS 原生**：无需 Node.js 或 Python 运行时，单二进制交付

### 2. 可借鉴的设计

| 来源 | 借鉴点 |
|------|--------|
| Stagehand | act/extract 分层设计 → nf-publish 可分"操作命令"和"读取命令" |
| Skyvern | 视觉定位作为 JS 选择器失败时的备用方案 |
| Steel Browser | Session 隔离 + cookie 持久化 + tab registry 设计 |
| 影刀 RPA | 国内平台（抖音/小红书/视频号）的自动化流程模板化 |
| Browser Use | 自然语言任务描述 → nf-publish 未来可加 LLM 理解层 |

### 3. 未来 analytics / 话题功能
- **AgentQL** 的自然语言查询语言：适合"从任意创作者平台提取数据"
- **Crawl4AI / FireCrawl**：如需批量抓取平台话题趋势数据
- **Skyvern/Browser Use**：如需 AI 自动分析竞争对手发布策略

---

*调研来源：GitHub 直接访问 + web 搜索（2026-04-14）*
