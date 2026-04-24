window.FRAMES = [
  {
    id: 1,
    title: "结论先行",
    narration: "你问『用啥接口封装各家』—— 答案是：没人定协议 · 生态自发收敛到 OpenAI 格式。接下来 5 帧讲清原因 + 给 NextFrame 的两条路。",
    visual_html: `
      <div class="stage-center">
        <div style="font-size:13px;letter-spacing:0.2em;color:var(--accent);font-weight:700;margin-bottom:20px;">AI 接口调研 · 6 帧讲透</div>
        <h1 style="font-size:64px;line-height:1.1;">没接口<br><span style="color:var(--accent);">大家都抄 OpenAI</span></h1>
        <p style="margin-top:28px;max-width:680px;">事实标准不是协议 · 是 Claude / Gemini / Ollama / DeepSeek / Qwen / vLLM <b style="color:var(--warm);">主动提供 OpenAI 兼容端点</b> · 因为生态已经在那。</p>
        <div style="margin-top:40px;display:flex;gap:20px;">
          <div style="padding:10px 18px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);border-radius:999px;font-size:14px;">用户接入 = 3 个字段</div>
          <div style="padding:10px 18px;background:rgba(255,154,60,0.12);border:1px solid rgba(255,154,60,0.3);border-radius:999px;font-size:14px;color:var(--warm);">NextFrame 两条路</div>
        </div>
      </div>
    `
  },
  {
    id: 2,
    title: "分层 · 嘴 vs 手",
    narration: "AI 接模型是两层事：『嘴』调模型（OpenAI 格式是事实标准）· 『手』调工具（MCP 协议是 2026 年入场券）。两层正交 · 合起来才是完整的 agent。",
    visual_html: `
      <div style="width:100%;max-width:720px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:14px;color:var(--accent);letter-spacing:0.2em;font-weight:700;">AI AGENT 架构</div>
          <div style="font-size:24px;margin-top:6px;">两层 · 一嘴一手</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div data-id="app" class="layer bright" style="padding:20px 28px;background:var(--panel);border:1px solid var(--line);border-radius:12px;display:flex;justify-content:space-between;align-items:center;transition:all 0.4s;">
            <div><div style="font-size:11px;color:var(--dim);letter-spacing:0.15em;">APP</div><div style="font-size:20px;font-weight:700;">Claude Desktop · Cursor · ChatGPT · NextFrame</div></div>
            <div style="font-size:32px;">📱</div>
          </div>
          <div data-id="hand" class="layer dim" style="padding:20px 28px;background:rgba(255,154,60,0.08);border:1px solid rgba(255,154,60,0.25);border-radius:12px;display:flex;justify-content:space-between;align-items:center;transition:all 0.4s;">
            <div><div style="font-size:11px;color:var(--warm);letter-spacing:0.15em;font-weight:700;">手 · MCP 协议</div><div style="font-size:18px;font-weight:600;">让 AI 调外部工具 / 读外部数据</div></div>
            <div style="font-size:32px;">🖐</div>
          </div>
          <div data-id="agent" class="layer dim" style="padding:20px 28px;background:var(--panel);border:1px solid var(--line);border-radius:12px;display:flex;justify-content:space-between;align-items:center;transition:all 0.4s;">
            <div><div style="font-size:11px;color:var(--dim);letter-spacing:0.15em;">AGENT 层</div><div style="font-size:18px;">编排 · 多轮 · 记忆</div></div>
            <div style="font-size:32px;">🧠</div>
          </div>
          <div data-id="mouth" class="layer dim" style="padding:20px 28px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:12px;display:flex;justify-content:space-between;align-items:center;transition:all 0.4s;">
            <div><div style="font-size:11px;color:var(--accent);letter-spacing:0.15em;font-weight:700;">嘴 · OpenAI chat/completions</div><div style="font-size:18px;font-weight:600;">事实标准 · 写一个客户端 · 调所有模型</div></div>
            <div style="font-size:32px;">💬</div>
          </div>
          <div data-id="llm" class="layer dim" style="padding:20px 28px;background:var(--panel);border:1px solid var(--line);border-radius:12px;display:flex;justify-content:space-between;align-items:center;transition:all 0.4s;">
            <div><div style="font-size:11px;color:var(--dim);letter-spacing:0.15em;">LLM</div><div style="font-size:18px;">GPT · Claude · Gemini · DeepSeek · Qwen · Ollama</div></div>
            <div style="font-size:32px;">🤖</div>
          </div>
        </div>
        <div style="margin-top:20px;padding:14px 18px;background:rgba(167,139,250,0.08);border-left:3px solid var(--accent);border-radius:6px;font-size:14px;color:var(--dim);">
          两层<b style="color:var(--fg);">正交</b> · 嘴管调模型 · 手管调工具 · 合起来才完整
        </div>
      </div>
    `,
    reveal_steps: [
      { label: "点亮『手』层 · MCP 协议（Anthropic 2024-11 推 · 今天 OpenAI/Google 都加入 · 10000+ public MCP servers）", target: "hand", add: "bright", remove: "dim" },
      { label: "点亮 Agent 层 · 编排 / 多轮 / 记忆", target: "agent", add: "bright", remove: "dim" },
      { label: "点亮『嘴』层 · OpenAI chat/completions · 事实标准", target: "mouth", add: "bright", remove: "dim" },
      { label: "点亮 LLM · 所有家主动提供 OpenAI 兼容端点", target: "llm", add: "bright", remove: "dim" }
    ]
  },
  {
    id: 3,
    title: "用户接入 = 3 个字段",
    narration: "降低用户门槛的答案：UI 给 3 个输入框 · 用户填完就能用。不绑任何 SDK · 一套请求代码打遍全家。",
    visual_html: `
      <div style="width:100%;max-width:640px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:14px;color:var(--accent);letter-spacing:0.2em;font-weight:700;">NEXTFRAME SETTINGS</div>
          <div style="font-size:28px;margin-top:8px;font-weight:700;">模型配置 · 3 个框搞定</div>
        </div>
        <div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:32px;box-shadow:0 8px 40px rgba(0,0,0,0.3);">
          <div style="margin-bottom:24px;">
            <div style="font-size:12px;color:var(--dim);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Base URL</div>
            <div style="padding:14px 18px;background:rgba(255,255,255,0.04);border:1px solid var(--line);border-radius:10px;font-family:'SF Mono',Menlo,monospace;font-size:15px;color:var(--accent);">https://api.anthropic.com/v1</div>
          </div>
          <div style="margin-bottom:24px;">
            <div style="font-size:12px;color:var(--dim);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;font-weight:600;">API Key</div>
            <div style="padding:14px 18px;background:rgba(255,255,255,0.04);border:1px solid var(--line);border-radius:10px;font-family:'SF Mono',Menlo,monospace;font-size:15px;color:var(--dim);">sk-ant-xxxxxxxxxxxx</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--dim);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;font-weight:600;">Model</div>
            <div style="padding:14px 18px;background:rgba(255,255,255,0.04);border:1px solid var(--line);border-radius:10px;font-family:'SF Mono',Menlo,monospace;font-size:15px;color:var(--warm);">anthropic/claude-opus-4.7</div>
          </div>
        </div>
        <div style="margin-top:28px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:13px;text-align:center;">
          <div style="padding:12px;background:rgba(167,139,250,0.08);border-radius:8px;border:1px solid rgba(167,139,250,0.2);">换 <b style="color:var(--accent);">Claude</b><br><span style="color:var(--dim);font-size:11px;">api.anthropic.com</span></div>
          <div style="padding:12px;background:rgba(255,154,60,0.08);border-radius:8px;border:1px solid rgba(255,154,60,0.2);">换 <b style="color:var(--warm);">本地 Ollama</b><br><span style="color:var(--dim);font-size:11px;">localhost:11434/v1</span></div>
          <div style="padding:12px;background:rgba(52,211,153,0.08);border-radius:8px;border:1px solid rgba(52,211,153,0.2);">换 <b style="color:#34d399;">国内模型</b><br><span style="color:var(--dim);font-size:11px;">openrouter.ai/api/v1</span></div>
        </div>
        <div style="margin-top:20px;padding:14px 18px;background:rgba(255,154,60,0.08);border-left:3px solid var(--warm);border-radius:6px;font-size:14px;">
          一套代码 · 不绑 Vercel AI SDK · 不绑 LiteLLM · 不绑 OpenAI SDK · 自己发 HTTP 就行
        </div>
      </div>
    `
  },
  {
    id: 4,
    title: "4 个产品 · 怎么封装",
    narration: "开源 coding agent 怎么做的？opencode（Claude Code 开源版）140k 星 · cline / aider / continue 各有路数 · 看共识不看具体实现。",
    visual_html: `
      <div style="width:100%;max-width:880px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:14px;color:var(--accent);letter-spacing:0.2em;font-weight:700;">4 个开源产品对比</div>
          <div style="font-size:24px;margin-top:6px;">同行怎么让用户切模型</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div data-id="opencode" class="prod" style="padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;transition:all 0.4s;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div style="font-size:18px;font-weight:700;">opencode</div>
              <div style="font-size:12px;color:var(--warm);font-weight:700;">⭐ 140k</div>
            </div>
            <div style="font-size:12px;color:var(--dim);margin-bottom:12px;">Claude Code 开源替代 · 2026-01 Anthropic 封号事件涨 30k</div>
            <div style="font-size:13px;line-height:1.6;"><b style="color:var(--accent);">切模型</b> · 终端敲 <code style="background:rgba(167,139,250,0.15);padding:2px 6px;border-radius:4px;font-size:12px;">/models</code> 弹选择器</div>
            <div style="font-size:13px;line-height:1.6;margin-top:4px;"><b style="color:var(--warm);">底层</b> · Vercel AI SDK + models.dev 注册表 · 75+ provider</div>
          </div>
          <div data-id="cline" class="prod" style="padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;transition:all 0.4s;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div style="font-size:18px;font-weight:700;">Cline</div>
              <div style="font-size:12px;color:var(--warm);font-weight:700;">⭐ 60k</div>
            </div>
            <div style="font-size:12px;color:var(--dim);margin-bottom:12px;">VSCode 自主编码 agent · 能开浏览器 / 跑命令</div>
            <div style="font-size:13px;line-height:1.6;"><b style="color:var(--accent);">切模型</b> · 齿轮图标 → 下拉菜单（最 PM 友好）</div>
            <div style="font-size:13px;line-height:1.6;margin-top:4px;"><b style="color:var(--warm);">底层</b> · 自己写 adapter · 9 家官方 + OpenAI 兼容 + 本地</div>
          </div>
          <div data-id="aider" class="prod" style="padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;transition:all 0.4s;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div style="font-size:18px;font-weight:700;">Aider</div>
              <div style="font-size:12px;color:var(--warm);font-weight:700;">⭐ 43k</div>
            </div>
            <div style="font-size:12px;color:var(--dim);margin-bottom:12px;">Python CLI · AI pair programming</div>
            <div style="font-size:13px;line-height:1.6;"><b style="color:var(--accent);">切模型</b> · <code style="background:rgba(167,139,250,0.15);padding:2px 6px;border-radius:4px;font-size:12px;">--model sonnet</code> CLI flag</div>
            <div style="font-size:13px;line-height:1.6;margin-top:4px;"><b style="color:var(--warm);">底层</b> · LiteLLM 库 · 继承 100+ provider</div>
          </div>
          <div data-id="continue" class="prod" style="padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;transition:all 0.4s;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div style="font-size:18px;font-weight:700;">Continue.dev</div>
              <div style="font-size:12px;color:var(--warm);font-weight:700;">⭐ 32k</div>
            </div>
            <div style="font-size:12px;color:var(--dim);margin-bottom:12px;">VSCode + JetBrains · 企业友好</div>
            <div style="font-size:13px;line-height:1.6;"><b style="color:var(--accent);">切模型</b> · 改 <code style="background:rgba(167,139,250,0.15);padding:2px 6px;border-radius:4px;font-size:12px;">config.yaml</code> · 侧边栏也能切</div>
            <div style="font-size:13px;line-height:1.6;margin-top:4px;"><b style="color:var(--warm);">底层</b> · 自己写 adapter · 所有主流</div>
          </div>
        </div>
        <div data-id="consensus" class="dim" style="margin-top:20px;padding:18px 22px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:12px;transition:all 0.4s;">
          <div style="font-size:12px;color:var(--accent);letter-spacing:0.15em;font-weight:700;margin-bottom:10px;">4 个项目的共识</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:13px;">
            <div>① 配置放 <b>JSON/YAML</b> · 不写死代码</div>
            <div>② <b>OpenRouter</b> 兜底（一个 key 调全部）</div>
            <div>③ <b>OpenAI-compatible</b> base_url 兜长尾</div>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { label: "点亮『4 项目共识』· 3 条共同做法 · 就是你该抄的样", target: "consensus", add: "bright", remove: "dim" }
    ]
  },
  {
    id: 5,
    title: "NextFrame 两条路",
    narration: "做 AI × 视频 · 两个方向：出站 = NextFrame 调 AI 剪视频 · 入站 = AI 调 NextFrame 剪视频。两条路不冲突 · 建议都做 · 先做哪个要你拍板。",
    visual_html: `
      <div style="width:100%;max-width:900px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:14px;color:var(--accent);letter-spacing:0.2em;font-weight:700;">NEXTFRAME 两条路 · 不冲突</div>
          <div style="font-size:24px;margin-top:6px;">出站 vs 入站 · 流量都接</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:stretch;">
          <div data-id="outbound" class="dim" style="padding:28px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);border-radius:16px;transition:all 0.4s;">
            <div style="font-size:40px;margin-bottom:12px;">📤</div>
            <div style="font-size:12px;color:var(--accent);letter-spacing:0.15em;font-weight:700;margin-bottom:8px;">出站 · OUTBOUND</div>
            <div style="font-size:22px;font-weight:700;margin-bottom:14px;">NextFrame 调 AI</div>
            <div style="font-size:14px;color:var(--dim);line-height:1.7;margin-bottom:16px;">产品内置 agentloop · 用户填 base_url/key/model · AI 帮用户剪视频。</div>
            <div style="border-top:1px solid var(--line);padding-top:14px;font-size:13px;line-height:1.7;">
              <div><b style="color:var(--fg);">谁用</b> · NextFrame 自己的用户</div>
              <div><b style="color:var(--fg);">像谁</b> · Cursor / opencode / Cline</div>
              <div><b style="color:var(--fg);">价值</b> · 拥有独立 agent 体验 · 可深度集成视觉</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">AND</div>
          </div>
          <div data-id="inbound" class="dim" style="padding:28px;background:rgba(255,154,60,0.08);border:1px solid rgba(255,154,60,0.3);border-radius:16px;transition:all 0.4s;">
            <div style="font-size:40px;margin-bottom:12px;">📥</div>
            <div style="font-size:12px;color:var(--warm);letter-spacing:0.15em;font-weight:700;margin-bottom:8px;">入站 · INBOUND</div>
            <div style="font-size:22px;font-weight:700;margin-bottom:14px;">AI 调 NextFrame</div>
            <div style="font-size:14px;color:var(--dim);line-height:1.7;margin-bottom:16px;">做 <b style="color:var(--warm);">MCP server</b> · 把剪视频 / 渲染 / 生成场景暴露成 tools · Claude Desktop / ChatGPT / Cursor 的用户都能用。</div>
            <div style="border-top:1px solid var(--line);padding-top:14px;font-size:13px;line-height:1.7;">
              <div><b style="color:var(--fg);">谁用</b> · 全生态 AI 客户端用户</div>
              <div><b style="color:var(--fg);">像谁</b> · Figma MCP / Blender MCP</div>
              <div><b style="color:var(--fg);">价值</b> · 接住别人的流量 · 无感增长</div>
            </div>
          </div>
        </div>
        <div style="margin-top:24px;padding:16px 20px;background:rgba(52,211,153,0.08);border-left:3px solid #34d399;border-radius:6px;font-size:14px;">
          <b style="color:#34d399;">关键</b> · 两条路<b>不冲突</b> · 底层 tool schema 可复用 · 先做哪个看战略优先级
        </div>
      </div>
    `,
    reveal_steps: [
      { label: "点亮『出站』· NextFrame 调 AI · 内置 agentloop", target: "outbound", add: "bright", remove: "dim" },
      { label: "点亮『入站』· 做 MCP server · 接住全生态流量", target: "inbound", add: "bright", remove: "dim" }
    ]
  },
  {
    id: 6,
    title: "你的决策点",
    narration: "讲完了 · 该你拍板：先做哪条路？下一步我会按你选的出单版本方案（不是现在动工 · 先入 ADR 存档）。",
    visual_html: `
      <div style="width:100%;max-width:780px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:14px;color:var(--warm);letter-spacing:0.2em;font-weight:700;">DECISION POINT</div>
          <div style="font-size:36px;margin-top:8px;font-weight:800;">先做哪条路？</div>
          <div style="font-size:16px;color:var(--dim);margin-top:12px;">我会用 AskUserQuestion 按钮问 · 你点选就行</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="padding:20px 24px;background:var(--panel);border:1px solid rgba(167,139,250,0.3);border-radius:12px;display:flex;align-items:center;gap:18px;">
            <div style="font-size:28px;font-weight:800;color:var(--accent);width:40px;">A</div>
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:700;">出站优先 · 内置 agentloop</div>
              <div style="font-size:13px;color:var(--dim);margin-top:4px;">产品内置 AI 能力 · 用户不跳出来 · 像 Cursor / opencode</div>
            </div>
          </div>
          <div style="padding:20px 24px;background:var(--panel);border:1px solid rgba(255,154,60,0.3);border-radius:12px;display:flex;align-items:center;gap:18px;">
            <div style="font-size:28px;font-weight:800;color:var(--warm);width:40px;">B</div>
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:700;">入站优先 · 做 MCP server</div>
              <div style="font-size:13px;color:var(--dim);margin-top:4px;">生态入场券 · 2026 必做 · 像 Figma MCP / Blender MCP</div>
            </div>
          </div>
          <div style="padding:20px 24px;background:var(--panel);border:1px solid rgba(52,211,153,0.3);border-radius:12px;display:flex;align-items:center;gap:18px;">
            <div style="font-size:28px;font-weight:800;color:#34d399;width:40px;">C</div>
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:700;">都不急 · 先入 ADR 存档</div>
              <div style="font-size:13px;color:var(--dim);margin-top:4px;">当前 v0.1 战略版刚 close · 下版 v0.2 别塞这事 · 挂 future_versions 等成熟</div>
            </div>
          </div>
        </div>
        <div style="margin-top:24px;text-align:center;font-size:13px;color:var(--dim);">
          讲完 6 帧 · 回聊天选 A/B/C
        </div>
      </div>
    `
  }
];
