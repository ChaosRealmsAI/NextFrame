// @ts-nocheck
// NextFrame 竞品技术深挖 · v0.1.3
// 5 活跃项目 × 8 维度 deep-dive · 续 v0.1.2 浅扫
// 数据见同目录 data.json · 5 subagent 并发产出 (2026-04-21)

window.FRAMES = [
  // ═════════ Frame 1 · 封面 + TLDR ═════════
  {
    id: 1,
    title: "封面 · TLDR",
    narration: "5 项目代码层深挖. 3 大发现:Skills 包蓝本就是 CC Toolkit · Hyperframes 工程化抄 · Revideo 死亡范式不能学.",
    visual_html: `
      <div class="stage-center">
        <div style="text-align:center;max-width:1100px;">
          <div style="font-size:13px;letter-spacing:.2em;color:#a78bfa;font-weight:700;text-transform:uppercase;margin-bottom:18px;">NextFrame · v0.1.3 · 技术深挖</div>
          <h1 style="font-size:60px;font-weight:800;line-height:1.05;letter-spacing:-.03em;margin:0 0 28px;background:linear-gradient(135deg,#fff 0%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;color:transparent;">
            5 项目 · 代码层<br>抄哪 / 避哪 / 学哪
          </h1>
          <div style="display:flex;justify-content:center;gap:36px;margin:36px 0 32px;flex-wrap:wrap;">
            <div data-id="s-projects" style="text-align:center;">
              <div style="font-size:64px;font-weight:800;color:#a78bfa;line-height:1;">5</div>
              <div style="font-size:15px;color:rgba(255,255,255,.7);margin-top:6px;">项目深挖</div>
            </div>
            <div data-id="s-dims" style="text-align:center;">
              <div style="font-size:64px;font-weight:800;color:#34d399;line-height:1;">8</div>
              <div style="font-size:15px;color:rgba(255,255,255,.7);margin-top:6px;">维度 / 项目</div>
            </div>
            <div data-id="s-lines" style="text-align:center;">
              <div style="font-size:64px;font-weight:800;color:#fbbf24;line-height:1;">2,882</div>
              <div style="font-size:15px;color:rgba(255,255,255,.7);margin-top:6px;">原始 md 行</div>
            </div>
            <div data-id="s-actions" style="text-align:center;">
              <div style="font-size:64px;font-weight:800;color:#f87171;line-height:1;">3</div>
              <div style="font-size:15px;color:rgba(255,255,255,.7);margin-top:6px;">P0 立即动作</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:24px;">
            <div data-id="t-skills" style="padding:18px 20px;background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.3);border-radius:12px;text-align:left;">
              <div style="font-size:11px;color:#34d399;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">🟢 抄</div>
              <div style="font-size:15px;color:#fff;font-weight:600;line-height:1.45;">CC Toolkit skills 包结构</div>
              <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;">即装即用 · GitHub clone · 双层入口</div>
            </div>
            <div data-id="t-cdp" style="padding:18px 20px;background:rgba(167,139,250,.10);border:1px solid rgba(167,139,250,.3);border-radius:12px;text-align:left;">
              <div style="font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">🟣 抄</div>
              <div style="font-size:15px;color:#fff;font-weight:600;line-height:1.45;">Hyperframes 确定性渲染</div>
              <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;">CDP beginFrame + deterministic-mode</div>
            </div>
            <div data-id="t-die" style="padding:18px 20px;background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.3);border-radius:12px;text-align:left;">
              <div style="font-size:11px;color:#f87171;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">🔴 避</div>
              <div style="font-size:15px;color:#fff;font-weight:600;line-height:1.45;">Revideo 死亡范式</div>
              <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;">MIT 裸开源 + 闭源 SaaS = 死</div>
            </div>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "s-projects", animate: "pulse" },
      { target: "s-dims", animate: "pulse" },
      { target: "s-lines", animate: "pulse" },
      { target: "s-actions", animate: "pulse" },
      { target: "t-skills", animate: "pulse" },
      { target: "t-cdp", animate: "pulse" },
      { target: "t-die", animate: "pulse" }
    ]
  },

  // ═════════ Frame 2 · AI 集成形态演化(3 stages) ═════════
  {
    id: 2,
    title: "AI 集成形态演化 · 3 阶段",
    narration: "Stage 1 程序员手写 · Stage 2 出 skills 包 · Stage 3 整个产品为 agent 设计. NextFrame 起步就在 Stage 3.",
    visual_html: `
      <div style="padding:24px 40px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">行业演化</div>
          <h2 style="font-size:36px;font-weight:700;margin:8px 0 0;color:#fff;">AI 集成 · 3 个 Stage</h2>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:18px;">
          <!-- Stage 1 -->
          <div data-id="s1" style="padding:22px 24px;background:rgba(156,163,175,.08);border:1px solid rgba(156,163,175,.25);border-radius:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <div style="font-size:32px;font-weight:800;color:#9ca3af;line-height:1;">1</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">无 AI</div>
            </div>
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;">程序员手写代码</div>
            <div style="font-size:13px;line-height:1.65;color:rgba(255,255,255,.7);">
              0 LLM · TS / JS 手撸 · IDE 自动补全顶天<br><br>
              <b style="color:#9ca3af;">玩家</b>: Motion Canvas · Editly · Etro · Revideo 开源仓
            </div>
          </div>
          <!-- Stage 2 -->
          <div data-id="s2" style="padding:22px 24px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <div style="font-size:32px;font-weight:800;color:#fbbf24;line-height:1;">2</div>
              <div style="font-size:11px;color:#fbbf24;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">外接 agent</div>
            </div>
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;">出 skills 包给 LLM</div>
            <div style="font-size:13px;line-height:1.65;color:rgba(255,255,255,.7);">
              出 skills 包装到 Claude Code/Cursor · LLM 写代码 · 引擎 render · 产品本身不变<br><br>
              <b style="color:#fbbf24;">玩家</b>: Remotion 2026-01 起 · CC Toolkit
            </div>
          </div>
          <!-- Stage 3 -->
          <div data-id="s3" style="padding:22px 24px;background:rgba(167,139,250,.12);border:2px solid rgba(167,139,250,.5);border-radius:14px;position:relative;">
            <div style="position:absolute;top:-10px;right:14px;background:#a78bfa;color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:10px;letter-spacing:.1em;">NEXTFRAME 起点</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <div style="font-size:32px;font-weight:800;color:#a78bfa;line-height:1;">3</div>
              <div style="font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">agent-native</div>
            </div>
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;">整个产品为 agent 设计</div>
            <div style="font-size:13px;line-height:1.65;color:rgba(255,255,255,.85);">
              non-interactive CLI + skills + slash commands + (可选) MCP · agent 是第一用户<br><br>
              <b style="color:#a78bfa;">玩家</b>: Hyperframes one big bet · CC Toolkit · <b style="color:#fff;">NextFrame (charter P1 已对齐)</b>
            </div>
          </div>
        </div>

        <!-- gap warning -->
        <div data-id="gap" style="margin-top:24px;padding:18px 24px;background:rgba(248,113,113,.08);border-left:4px solid #f87171;border-radius:0 12px 12px 0;">
          <div style="font-size:13px;color:#f87171;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;">⚠️ 我们缺什么</div>
          <div style="font-size:16px;color:rgba(255,255,255,.9);line-height:1.55;">
            charter P1 (AI 第一用户) 已对齐 Stage 3 · 但 <b style="color:#f87171;">NextFrame 还没 skills 包分发</b> · 起步 0 stars · 必须 day-1 出 skills 包占 agent 心智
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "s1", animate: "pulse" },
      { target: "s2", animate: "pulse" },
      { target: "s3", animate: "pulse" },
      { target: "gap", animate: "pulse" }
    ]
  },

  // ═════════ Frame 3 · Skills 包结构对比 ═════════
  {
    id: 3,
    title: "Skills 包结构 · 3 项目对比",
    narration: "Remotion 35 条细粒度 + MUST/FORBIDDEN · Hyperframes 极简 · CC Toolkit 双层入口. NextFrame 该抄哪个混搭最优.",
    visual_html: `
      <div style="padding:20px 36px;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">★ Day-1 P0 关键</div>
          <h2 style="font-size:32px;font-weight:700;margin:8px 0 0;color:#fff;">Skills 包结构 · 3 蓝本</h2>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
          <!-- Remotion -->
          <div data-id="sk-r" style="padding:18px 20px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:12px;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:18px;font-weight:800;color:#a78bfa;">Remotion</div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);">256.2K 装机</div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:10px;">SKILL.md router + 35 rules/*.md</div>
            <pre style="background:#0a0a0d;color:#c9d1d9;padding:12px;border-radius:8px;font-size:11px;line-height:1.5;margin:0;overflow-x:auto;font-family:'SF Mono',Menlo,monospace;border:1px solid rgba(255,255,255,.08);">skills/remotion/
├── SKILL.md      (router)
└── rules/
    ├── 01-...md  (3KB avg)
    ├── 02-...md
    └── ... (35 rules)

frontmatter:
  name | description | tags

body 用 MUST / FORBIDDEN
大写硬话</pre>
            <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,.7);line-height:1.5;">
              <b style="color:#34d399;">抄</b>: 细粒度 + MUST 硬话<br>
              <b style="color:#f87171;">避</b>: 35 条对小项目过重
            </div>
          </div>

          <!-- Hyperframes -->
          <div data-id="sk-h" style="padding:18px 20px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.3);border-radius:12px;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:18px;font-weight:800;color:#f87171;">Hyperframes</div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);">8.2k stars · 1.5 月</div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:10px;">5 slash commands 全 SKILL.md</div>
            <pre style="background:#0a0a0d;color:#c9d1d9;padding:12px;border-radius:8px;font-size:11px;line-height:1.5;margin:0;overflow-x:auto;font-family:'SF Mono',Menlo,monospace;border:1px solid rgba(255,255,255,.08);">.claude/
├── settings.json
│   PreToolUse hook
│   拦 git commit 跑
│   build+lint+typecheck
└── skills/
    ├── hyperframes.md
    ├── hyperframes-cli.md
    ├── gsap.md
    ├── website-...md
    └── ...

(分发: npx skills add
  heygen-com/hyperframes)</pre>
            <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,.7);line-height:1.5;">
              <b style="color:#34d399;">抄</b>: PreToolUse 提交闸 ★<br>
              <b style="color:#34d399;">抄</b>: skills.sh marketplace
            </div>
          </div>

          <!-- CC Toolkit -->
          <div data-id="sk-c" style="padding:18px 20px;background:rgba(52,211,153,.10);border:2px solid rgba(52,211,153,.4);border-radius:12px;position:relative;">
            <div style="position:absolute;top:-10px;right:14px;background:#34d399;color:#0a0a0d;font-size:10px;font-weight:800;padding:3px 10px;border-radius:10px;letter-spacing:.1em;">主蓝本</div>
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:18px;font-weight:800;color:#34d399;">CC Toolkit</div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);">927 stars · v0.14.2</div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:10px;">双层入口 + registry.json 索引</div>
            <pre style="background:#0a0a0d;color:#c9d1d9;padding:12px;border-radius:8px;font-size:11px;line-height:1.5;margin:0;overflow-x:auto;font-family:'SF Mono',Menlo,monospace;border:1px solid rgba(255,255,255,.08);">skills/openclaw-.../
└── SKILL.md (marketplace)

.claude/
├── settings.json {} (空)
├── skills/        (Claude 原生)
│   ├── ltx2/SKILL.md
│   └── ... (11 skills)
└── commands/      (slash)
    └── ...

_internal/
└── toolkit-registry.json
   (元数据索引)</pre>
            <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,.7);line-height:1.5;">
              <b style="color:#34d399;">抄</b>: 双层入口 + registry<br>
              <b style="color:#34d399;">抄</b>: 一 tool 一 skill<br>
              <b style="color:#34d399;">抄</b>: 极简 frontmatter
            </div>
          </div>
        </div>

        <div data-id="sk-template" style="margin-top:20px;padding:16px 22px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:12px;">
          <div style="font-size:13px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin-bottom:10px;">NextFrame day-1 SKILL.md 蓝本(混 3 家长处)</div>
          <pre style="background:#0a0a0d;color:#c9d1d9;padding:14px;border-radius:8px;font-size:12px;line-height:1.55;margin:0;overflow-x:auto;font-family:'SF Mono',Menlo,monospace;border:1px solid rgba(255,255,255,.06);">---
name: nf-build
description: Build a video from JSON. Use when user says "build video" / "出片" / "render mp4". Triggers include nf build / nf-build.
---

## Quick Reference (CC)
nf build &lt;project.json&gt; --out video.mp4

## Parameters (CC)
| flag | required | default |
|---|---|---|
| --out | yes | - |
| --4k | no | false |

## When to Use / NOT (CC)
**MUST** use when build requested.  ← Remotion 大写硬话
**FORBIDDEN** to mock without --dry-run.

## Common Patterns (CC)  ## Troubleshooting (CC)</pre>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "sk-r", animate: "pulse" },
      { target: "sk-h", animate: "pulse" },
      { target: "sk-c", animate: "pulse" },
      { target: "sk-template", animate: "pulse" }
    ]
  },

  // ═════════ Frame 4 · 渲染栈分类(3 buckets) ═════════
  {
    id: 4,
    title: "渲染栈 · 3 buckets",
    narration: "headless Chrome 占大半 · Canvas 2D 上一代 · WebGL 边缘. NextFrame wgpu+原生编码器是真差异化窗口.",
    visual_html: `
      <div style="padding:20px 36px;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">技术栈分类</div>
          <h2 style="font-size:32px;font-weight:700;margin:8px 0 0;color:#fff;">渲染栈 · 3 个 bucket</h2>
        </div>

        <div style="display:grid;gap:14px;">
          <!-- bucket 1 -->
          <div data-id="bk1" style="padding:20px 24px;background:rgba(248,113,113,.08);border-left:4px solid #f87171;border-radius:0 12px 12px 0;">
            <div style="display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;margin-bottom:10px;">
              <div style="font-size:24px;">🌐</div>
              <div>
                <div style="font-size:18px;font-weight:800;color:#fff;">headless Chrome + Puppeteer + ffmpeg</div>
                <div style="font-size:13px;color:rgba(255,255,255,.6);">用户: <b style="color:#a78bfa;">Remotion</b> · <b style="color:#f87171;">Hyperframes</b></div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px;color:#f87171;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">天花板</div>
                <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:2px;">无真 HDR · 性能受限</div>
              </div>
            </div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;padding-left:42px;">
              <b>Hyperframes 巧招</b>: CDP <code style="background:rgba(0,0,0,.4);padding:1px 6px;border-radius:3px;font-size:12px;">HeadlessExperimental.beginFrame</code> + <code style="background:rgba(0,0,0,.4);padding:1px 6px;border-radius:3px;font-size:12px;">--deterministic-mode</code> + swiftshader 软件 GPU = 跨机器像素级确定性 · 但**真 GPU 被禁** · 4K 是 viewport 放大幻觉<br>
              <b style="color:#34d399;">NextFrame 差异化</b>: 抄 CDP beginFrame 协议 + 加 <b>wgpu 真 GPU</b> + 真 HDR encoder = 唯一同时拿确定性 + 真硬件加速
            </div>
          </div>

          <!-- bucket 2 -->
          <div data-id="bk2" style="padding:20px 24px;background:rgba(156,163,175,.08);border-left:4px solid #9ca3af;border-radius:0 12px 12px 0;">
            <div style="display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;margin-bottom:10px;">
              <div style="font-size:24px;">🎨</div>
              <div>
                <div style="font-size:18px;font-weight:800;color:#fff;">Canvas 2D + ffmpeg</div>
                <div style="font-size:13px;color:rgba(255,255,255,.6);">用户: <b style="color:#9ca3af;">Motion Canvas · Revideo · Editly</b></div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px;color:#f87171;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">代差</div>
                <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:2px;">上一代思路</div>
              </div>
            </div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;padding-left:42px;">
              <b>问题</b>: 无 GPU shader · 无真 3D · 4K 慢到不可用 · Motion Canvas 因此自家视频也只到 1080p<br>
              <b style="color:#34d399;">NextFrame 差异化</b>: 直接绕 · 用 WebView (HTML/CSS/transform) + 原生编码器 = 表达力 + 性能双优
            </div>
          </div>

          <!-- bucket 3 -->
          <div data-id="bk3" style="padding:20px 24px;background:rgba(156,163,175,.06);border-left:4px solid #6b7280;border-radius:0 12px 12px 0;">
            <div style="display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;">
              <div style="font-size:24px;">🖼️</div>
              <div>
                <div style="font-size:16px;font-weight:700;color:rgba(255,255,255,.8);">WebGL 浏览器内</div>
                <div style="font-size:12px;color:rgba(255,255,255,.55);">用户: <b style="color:#6b7280;">Etro.js</b> · 边缘 · 非直接竞品</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px;color:#6b7280;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">边缘</div>
              </div>
            </div>
          </div>
        </div>

        <!-- NextFrame slot -->
        <div data-id="bk-nf" style="margin-top:18px;padding:22px 26px;background:linear-gradient(135deg,rgba(167,139,250,.15) 0%,rgba(52,211,153,.10) 100%);border:2px solid rgba(167,139,250,.5);border-radius:14px;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">
            <div style="font-size:28px;">⚡</div>
            <div>
              <div style="font-size:11px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">第 4 bucket · NextFrame 独占</div>
              <div style="font-size:20px;font-weight:800;color:#fff;">wry+tao WebView + wgpu + 原生 HDR encoder</div>
            </div>
          </div>
          <div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.6;padding-left:42px;">
            <b style="color:#34d399;">独占组合</b>: Rust + 真 GPU(wgpu) + 真 HDR (10-bit Rec.2020 / HDR10) + macOS 原生集成 · 全部竞品没有<br>
            <b style="color:#fbbf24;">关键决策</b>: WebView 渲染 (HTML/CSS 表达力) + 原生编码器 (输出质量) · 跑同 JSON 两次 pixel hash 一致 (charter P3 frame pure)
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "bk1", animate: "pulse" },
      { target: "bk2", animate: "pulse" },
      { target: "bk3", animate: "pulse" },
      { target: "bk-nf", animate: "pulse" }
    ]
  },

  // ═════════ Frame 5 · License 策略 + Revideo 死亡 ═════════
  {
    id: 5,
    title: "License 策略 · Revideo 死亡范式",
    narration: "MIT 裸开源 + 闭源 SaaS 在 video 赛道 = 死. Revideo 9 月零 commit · 团队 pivot. NextFrame 必须避.",
    visual_html: `
      <div style="padding:24px 40px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">商业策略警示</div>
          <h2 style="font-size:34px;font-weight:700;margin:8px 0 0;color:#fff;">License 策略 · 3 模式 1 死</h2>
        </div>

        <div style="display:grid;gap:14px;">
          <!-- Remotion -->
          <div data-id="lic-r" style="padding:18px 22px;background:rgba(251,191,36,.08);border-left:4px solid #fbbf24;border-radius:0 12px 12px 0;">
            <div style="display:grid;grid-template-columns:160px 1fr auto;gap:18px;align-items:center;">
              <div>
                <div style="font-size:11px;color:#fbbf24;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Remotion 模式</div>
                <div style="font-size:16px;font-weight:800;color:#fff;margin-top:4px;">source-available + 商业门槛</div>
              </div>
              <div style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.55;">
                ≤3 员工免费 · Creators $25/seat · Automators $0.01/render · Enterprise $500+<br>
                <b style="color:#fbbf24;">v5 收紧</b>: freelancer 算 employee · 用户开始不满
              </div>
              <div style="text-align:center;">
                <div style="font-size:24px;">🟡</div>
                <div style="font-size:11px;color:rgba(255,255,255,.5);">活 6 年</div>
              </div>
            </div>
          </div>

          <!-- Hyperframes -->
          <div data-id="lic-h" style="padding:18px 22px;background:rgba(52,211,153,.08);border-left:4px solid #34d399;border-radius:0 12px 12px 0;">
            <div style="display:grid;grid-template-columns:160px 1fr auto;gap:18px;align-items:center;">
              <div>
                <div style="font-size:11px;color:#34d399;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Hyperframes 模式</div>
                <div style="font-size:16px;font-weight:800;color:#fff;margin-top:4px;">Apache 2.0 真开源</div>
              </div>
              <div style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.55;">
                完全免费 · HeyGen 主 SaaS 导流 · 不靠开源直接盈利<br>
                <b style="color:#34d399;">前提</b>: 母公司有商业护城河 ($500M valuation HeyGen 撑)
              </div>
              <div style="text-align:center;">
                <div style="font-size:24px;">🟢</div>
                <div style="font-size:11px;color:rgba(255,255,255,.5);">1.5 月 8.2k</div>
              </div>
            </div>
          </div>

          <!-- Revideo 死 -->
          <div data-id="lic-rv" style="padding:20px 24px;background:rgba(248,113,113,.12);border:2px solid rgba(248,113,113,.5);border-radius:12px;position:relative;">
            <div style="position:absolute;top:-10px;right:14px;background:#f87171;color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:10px;letter-spacing:.1em;">🔴 死亡范式</div>
            <div style="display:grid;grid-template-columns:160px 1fr auto;gap:18px;align-items:center;">
              <div>
                <div style="font-size:11px;color:#f87171;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Revideo 模式</div>
                <div style="font-size:16px;font-weight:800;color:#fff;margin-top:4px;">MIT 裸开源 + 闭源 SaaS</div>
              </div>
              <div style="font-size:13px;color:rgba(255,255,255,.85);line-height:1.55;">
                YC W24/S24 · 18 月后**事实弃坑**:<br>
                • 最后 commit 2025-05-09 · <b style="color:#f87171;">9 个月零 feature commit</b><br>
                • 61 open issue · "Still maintained?" 1 年无人回<br>
                • re.video <b style="color:#f87171;">308 永久重定向到 midrender.com</b><br>
                • 团队全 pivot 闭源 Midrender Pro $50/mo
              </div>
              <div style="text-align:center;">
                <div style="font-size:36px;">💀</div>
                <div style="font-size:11px;color:rgba(255,255,255,.5);">9 月零 commit</div>
              </div>
            </div>
          </div>
        </div>

        <!-- NextFrame 决策 -->
        <div data-id="lic-nf" style="margin-top:22px;padding:22px 26px;background:rgba(167,139,250,.10);border:1px solid rgba(167,139,250,.4);border-radius:14px;">
          <div style="font-size:13px;color:#a78bfa;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-bottom:10px;">NextFrame 决策路径(v0.4 charter 拍板)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
            <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;">
              <div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:6px;">选项 A · Remotion 模式</div>
              <div style="font-size:12px;color:rgba(255,255,255,.65);">MIT + 企业 license 门槛 · 桌面壳付费</div>
            </div>
            <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;">
              <div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:6px;">选项 B · Linear 模式</div>
              <div style="font-size:12px;color:rgba(255,255,255,.65);">Apache 2.0 + 主营桌面壳 SaaS</div>
            </div>
            <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;">
              <div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:6px;">选项 C · Midrender 模式</div>
              <div style="font-size:12px;color:rgba(255,255,255,.65);">整个闭源(放弃 stars)</div>
            </div>
          </div>
          <div style="margin-top:12px;font-size:13px;color:rgba(255,255,255,.65);font-style:italic;">禁: <span style="color:#f87171;font-weight:700;">"裸 MIT + 闭源 SaaS"</span>(Revideo 范式) · 死路</div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "lic-r", animate: "pulse" },
      { target: "lic-h", animate: "pulse" },
      { target: "lic-rv", animate: "pulse" },
      { target: "lic-nf", animate: "pulse" }
    ]
  },

  // ═════════ Frame 6 · Day-1 Skills 包蓝本 ═════════
  {
    id: 6,
    title: "Day-1 Skills 包蓝本",
    narration: "独立仓 · 6 SKILL.md + 4 slash commands + registry. 抄 CC Toolkit 蓝本 · 加 Hyperframes 提交闸 · 加 Remotion 大写硬话.",
    visual_html: `
      <div style="padding:22px 36px;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:14px;color:#34d399;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">★ P0 立刻动作</div>
          <h2 style="font-size:34px;font-weight:800;margin:8px 0 0;color:#fff;">NextFrame Day-1 Skills 包蓝本</h2>
          <div style="font-size:14px;color:rgba(255,255,255,.65);margin-top:6px;">独立仓 <code style="background:rgba(0,0,0,.4);padding:2px 8px;border-radius:4px;font-size:12px;">ChaosRealmsAI/nextframe-skills</code></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
          <!-- 仓结构 -->
          <div data-id="sp-tree" style="padding:18px 22px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:12px;">
            <div style="font-size:13px;color:#a78bfa;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">仓结构</div>
            <pre style="background:#0a0a0d;color:#c9d1d9;padding:14px;border-radius:8px;font-size:12px;line-height:1.6;margin:0;overflow-x:auto;font-family:'SF Mono',Menlo,monospace;border:1px solid rgba(255,255,255,.06);">nextframe-skills/
├── SKILL.md  (主入口 · router)
├── skills/
│   ├── nf-anchors/SKILL.md
│   ├── nf-tracks/SKILL.md
│   ├── nf-build/SKILL.md
│   ├── nf-render/SKILL.md
│   └── nf-preview/SKILL.md
├── commands/
│   ├── nf.md         (/nf 主命令)
│   ├── nf-setup.md   (/nf-setup 项目)
│   ├── nf-build.md   (/nf-build 出片)
│   └── nf-render.md  (/nf-render 4K)
├── _internal/
│   └── registry.json (元数据索引)
└── README.md (装机指引)</pre>
            <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,.65);">
              <b>装机</b>: <code style="background:rgba(0,0,0,.4);padding:2px 6px;border-radius:3px;">git clone .../nextframe-skills ~/.claude/skills/</code>
            </div>
          </div>

          <!-- 关键混搭 -->
          <div data-id="sp-mix" style="padding:18px 22px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:12px;">
            <div style="font-size:13px;color:#34d399;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">3 蓝本混搭(NextFrame 自家组合)</div>
            <div style="display:grid;gap:10px;font-size:13px;line-height:1.55;">
              <div style="padding:10px 14px;background:rgba(52,211,153,.06);border-left:3px solid #34d399;border-radius:0 8px 8px 0;">
                <b style="color:#34d399;">CC Toolkit 抄</b>: 双层入口 + registry.json + 极简 frontmatter + body 当操作指南信
              </div>
              <div style="padding:10px 14px;background:rgba(248,113,113,.06);border-left:3px solid #f87171;border-radius:0 8px 8px 0;">
                <b style="color:#f87171;">Hyperframes 抄</b>: PreToolUse hook · 拦 git commit · 跑 cargo check + clippy + tsc
              </div>
              <div style="padding:10px 14px;background:rgba(167,139,250,.06);border-left:3px solid #a78bfa;border-radius:0 8px 8px 0;">
                <b style="color:#a78bfa;">Remotion 抄</b>: SKILL.md body 用 MUST / FORBIDDEN 大写硬话 · 跨 IDE 一条命令分发
              </div>
            </div>

            <div style="margin-top:14px;padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;">
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;">分发</div>
              <div style="font-size:12px;color:rgba(255,255,255,.7);font-family:'SF Mono',Menlo,monospace;">
                git clone (✓) · npm (✗) · marketplace (✗ 后期可上 skills.sh)
              </div>
            </div>
          </div>
        </div>

        <!-- 单 SKILL.md 真实内容 -->
        <div data-id="sp-sample" style="margin-top:18px;padding:16px 22px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;">
          <div style="font-size:13px;color:#fff;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">示例 · skills/nf-anchors/SKILL.md (NextFrame 锚点概念 skill)</div>
          <pre style="background:#0a0a0d;color:#c9d1d9;padding:14px;border-radius:8px;font-size:12px;line-height:1.6;margin:0;overflow-x:auto;font-family:'SF Mono',Menlo,monospace;border:1px solid rgba(255,255,255,.06);">---
name: nf-anchors
description: NextFrame 时间锚点系统. Use when user defines video timeline / sets clip start/end / says "锚点" / "anchor". Triggers include nf anchor / 锚点驱动.
---

## Quick Reference
\`\`\`json
{
  "anchors": { "intro-end": 5.0, "feat-1-end": 12.0 },
  "clip_a": { "start": "0", "end": "intro-end" },
  "clip_b": { "start": "intro-end - 0.5", "end": "feat-1-end" }
}
\`\`\`

## When to Use
**MUST** use anchors for any clip timing. **FORBIDDEN** to hardcode start: 5.0 / end: 12.0.

## Common Patterns
- 改总时长 = 改一个锚点 · 所有 clip 自动联动
- ...

## Troubleshooting
- "clip overlapping" → 检查 anchors 是否单调递增</pre>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "sp-tree", animate: "pulse" },
      { target: "sp-mix", animate: "pulse" },
      { target: "sp-sample", animate: "pulse" }
    ]
  },

  // ═════════ Frame 7 · 立即行动清单 ═════════
  {
    id: 7,
    title: "5 行动 · P0/P1/P2",
    narration: "P0 立刻 3 件 · P1 短期 3 件 · P2 战略 1 件. License 策略 v0.4 charter 必拍板.",
    visual_html: `
      <div style="padding:24px 40px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">行动清单</div>
          <h2 style="font-size:36px;font-weight:800;margin:8px 0 0;color:#fff;">立即 + 短期 + 战略</h2>
        </div>

        <!-- P0 -->
        <div data-id="ap-p0" style="margin-bottom:14px;">
          <div style="font-size:13px;color:#f87171;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px;">🔴 P0 · 立即(本周)</div>
          <div style="display:grid;gap:8px;">
            <div style="padding:14px 18px;background:rgba(248,113,113,.08);border-left:3px solid #f87171;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
              <div>
                <div style="font-size:15px;font-weight:700;color:#fff;">出 NextFrame Day-1 Skills 包(独立仓)</div>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">6 SKILL.md + 4 slash commands + registry.json · 抄 CC Toolkit 蓝本</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">~ 1 day</div>
            </div>
            <div style="padding:14px 18px;background:rgba(248,113,113,.08);border-left:3px solid #f87171;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
              <div>
                <div style="font-size:15px;font-weight:700;color:#fff;">PreToolUse hook 拦 git commit · 跑 cargo check + clippy + tsc</div>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">.claude/settings.json · 抄 Hyperframes "坏代码提交不过"硬约束 · 结合 v0.1.1 audit.sh</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">~ 30 min</div>
            </div>
            <div style="padding:14px 18px;background:rgba(248,113,113,.08);border-left:3px solid #f87171;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
              <div>
                <div style="font-size:15px;font-weight:700;color:#fff;">v0.4+ engine 上 CDP beginFrame + wgpu 真 GPU + 真 HDR encoder</div>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">抄 Hyperframes 确定性协议 + 加 Rust 原生 · 唯一同时拿 4K HDR + 真 GPU + 确定性</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">v0.4-v0.5</div>
            </div>
          </div>
        </div>

        <!-- P1 -->
        <div data-id="ap-p1" style="margin-bottom:14px;">
          <div style="font-size:13px;color:#fbbf24;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px;">🟡 P1 · 短期</div>
          <div style="display:grid;gap:8px;">
            <div style="padding:14px 18px;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
              <div>
                <div style="font-size:15px;font-weight:700;color:#fff;">AI-native docs · <code>.md</code> URL 后缀返回 raw markdown</div>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">抄 Remotion · agent 一键抓文档 · NextFrame docs day-1 上</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">v0.4 docs</div>
            </div>
            <div style="padding:14px 18px;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
              <div>
                <div style="font-size:15px;font-weight:700;color:#fff;">TS describe 层 · 双层 API (JSON 给 AI · TS generator 给开发者)</div>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">抄 Motion Canvas generator+signal 模式</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">v0.4-v0.5</div>
            </div>
            <div style="padding:14px 18px;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
              <div>
                <div style="font-size:15px;font-weight:700;color:#fff;">live preview · Vite plugin + 加帧 snapshot 修 scrub 性能</div>
                <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">抄 Motion Canvas 架构 + 改进 reset+replay 短板(NextFrame 缓存关键帧)</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">v0.5+</div>
            </div>
          </div>
        </div>

        <!-- P2 -->
        <div data-id="ap-p2" style="margin-bottom:8px;">
          <div style="font-size:13px;color:#a78bfa;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px;">🟣 P2 · 战略</div>
          <div style="padding:14px 18px;background:rgba(167,139,250,.08);border-left:3px solid #a78bfa;border-radius:0 8px 8px 0;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
            <div>
              <div style="font-size:15px;font-weight:700;color:#fff;">License 策略 v0.4 charter 拍板</div>
              <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:3px;">3 选项: Remotion 模式 / Linear 模式 / 闭源 · <b style="color:#f87171;">禁 Revideo 模式 (MIT+闭源 SaaS = 死)</b></div>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);font-family:'SF Mono',monospace;">v0.4</div>
          </div>
        </div>

        <!-- 收尾 -->
        <div data-id="ap-end" style="margin-top:24px;padding:20px 26px;background:linear-gradient(135deg,rgba(167,139,250,.15) 0%,rgba(52,211,153,.10) 100%);border:1px solid rgba(167,139,250,.4);border-radius:14px;text-align:center;">
          <div style="font-size:13px;color:#a78bfa;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px;">一句话</div>
          <div style="font-size:20px;line-height:1.55;color:#fff;font-weight:600;">
            <b style="color:#34d399;">代码层细节都在了</b> · 该抄哪份文件 / 该避哪个范式 / 该混搭哪几家长处 · 全清楚<br>
            <span style="font-size:15px;color:rgba(255,255,255,.7);">下一步 = 主仓动手做 P0 三件 · 不再调研</span>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "ap-p0", animate: "pulse" },
      { target: "ap-p1", animate: "pulse" },
      { target: "ap-p2", animate: "pulse" },
      { target: "ap-end", animate: "pulse" }
    ]
  }
];
