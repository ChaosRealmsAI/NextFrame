// @ts-nocheck
// NextFrame 竞品分析 · v0.1.2
// 8 玩家 · AI 写 HTML/DSL → 视频 赛道
// 数据见同目录 data.json · 6 subagent 并行调研产出 (2026-04-21)

window.FRAMES = [
  // ═══════════════ Frame 1 · 封面 + TLDR ═══════════════
  {
    id: 1,
    title: "封面 · TLDR",
    narration: "AI 写 HTML 生视频 · 8 个玩家. NextFrame 被夹击 · 4 个差异化窗口正在关闭.",
    visual_html: `
      <div class="stage-center">
        <div style="text-align:center;max-width:1100px;">
          <div style="font-size:13px;letter-spacing:.2em;color:#a78bfa;font-weight:700;text-transform:uppercase;margin-bottom:18px;">NextFrame · v0.1.2 · 竞品分析</div>
          <h1 style="font-size:64px;font-weight:800;line-height:1.05;letter-spacing:-.03em;margin:0 0 28px;background:linear-gradient(135deg,#fff 0%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;color:transparent;">
            AI 写 HTML → 视频<br>赛道地图
          </h1>
          <div style="display:flex;justify-content:center;gap:48px;margin:36px 0 32px;">
            <div data-id="stat-8" style="text-align:center;">
              <div style="font-size:80px;font-weight:800;color:#a78bfa;line-height:1;">8</div>
              <div style="font-size:18px;color:rgba(255,255,255,.7);margin-top:6px;">玩家</div>
            </div>
            <div data-id="stat-42" style="text-align:center;">
              <div style="font-size:80px;font-weight:800;color:#f87171;line-height:1;">42</div>
              <div style="font-size:18px;color:rgba(255,255,255,.7);margin-top:6px;">天落后</div>
            </div>
            <div data-id="stat-4" style="text-align:center;">
              <div style="font-size:80px;font-weight:800;color:#34d399;line-height:1;">4</div>
              <div style="font-size:18px;color:rgba(255,255,255,.7);margin-top:6px;">差异化窗口</div>
            </div>
          </div>
          <div data-id="tldr" style="font-size:22px;line-height:1.55;color:rgba(255,255,255,.85);max-width:880px;margin:0 auto;padding:24px 32px;background:rgba(248,113,113,.08);border-left:3px solid #f87171;border-radius:0 12px 12px 0;text-align:left;">
            <b>已被夹击</b>:Hyperframes(HeyGen · 1.5 月 8.2k stars · 1:1 镜像)+ Remotion(44k stars 龙头 · Agent Skills 150K 装机)<br>
            <b>唯一活路</b>:Rust + 4K HDR + macOS 壳 + 垂类深做 · 至少拿下 2 个
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "stat-8", animate: "pulse" },
      { target: "stat-42", animate: "pulse" },
      { target: "stat-4", animate: "pulse" },
      { target: "tldr", animate: "pulse" }
    ]
  },

  // ═══════════════ Frame 2 · 赛道地图 (气泡定位) ═══════════════
  {
    id: 2,
    title: "赛道地图 · 8 玩家定位",
    narration: "横轴出生年 · 纵轴 AI 集成度 · 气泡大小 = stars. 看左下角红圈那个 · 1.5 月长到 8.2k.",
    visual_html: `
      <div style="padding:24px 40px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">玩家定位</div>
          <h2 style="font-size:38px;font-weight:700;margin:8px 0 0;color:#fff;">气泡大小 = GitHub stars</h2>
        </div>
        <svg viewBox="0 0 1100 540" style="width:100%;height:auto;max-width:1100px;display:block;margin:0 auto;font-family:inherit;">
          <!-- 网格 -->
          <line x1="80" y1="480" x2="1060" y2="480" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>
          <line x1="80" y1="60" x2="80" y2="480" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>
          <!-- 横轴标签(年份) -->
          <text x="80"   y="510" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">2020</text>
          <text x="276"  y="510" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">2022</text>
          <text x="472"  y="510" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">2024</text>
          <text x="668"  y="510" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">2025</text>
          <text x="864"  y="510" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">2026Q1</text>
          <text x="1020" y="510" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="middle">今</text>
          <text x="540" y="535" fill="rgba(255,255,255,.5)" font-size="14" text-anchor="middle">出生年 →</text>
          <!-- 纵轴标签(AI 集成度) -->
          <text x="60" y="475" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="end">无 AI</text>
          <text x="60" y="270" fill="rgba(255,255,255,.6)" font-size="13" text-anchor="end">外接 agent</text>
          <text x="60" y="80"  fill="rgba(255,255,255,.6)" font-size="13" text-anchor="end">agent-native</text>
          <text x="40" y="270" fill="rgba(255,255,255,.5)" font-size="14" text-anchor="middle" transform="rotate(-90 40 270)">↑ AI 集成度</text>

          <!-- Editly 2020 · 无 AI · 5.4k -->
          <g data-id="b-editly">
            <circle cx="120"  cy="465" r="32" fill="rgba(156,163,175,.25)" stroke="#9ca3af" stroke-width="2"/>
            <text x="120"  y="468" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">Editly</text>
            <text x="120"  y="510" text-anchor="middle" fill="rgba(255,255,255,.5)" font-size="11">5.4k · 半停滞</text>
          </g>
          <!-- Etro 2020 · 无 AI · 1.1k -->
          <g data-id="b-etro">
            <circle cx="170" cy="465" r="14" fill="rgba(156,163,175,.18)" stroke="#9ca3af" stroke-width="1.5"/>
            <text x="195" y="468" text-anchor="start" fill="rgba(255,255,255,.65)" font-size="11">Etro 1.1k</text>
          </g>
          <!-- Remotion 2020 · 外接 agent · 44k (后期升 AI) -->
          <g data-id="b-remotion">
            <circle cx="120"  cy="180" r="68" fill="rgba(167,139,250,.22)" stroke="#a78bfa" stroke-width="2.5"/>
            <text x="120"  y="178" text-anchor="middle" fill="#fff" font-size="16" font-weight="800">Remotion</text>
            <text x="120"  y="200" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="12">44.1k · 龙头</text>
            <!-- 时间漂移箭头(2020 起 · 2026 升 AI) -->
            <path d="M 178 180 Q 400 100 850 200" fill="none" stroke="rgba(167,139,250,.4)" stroke-width="1.5" stroke-dasharray="4 3"/>
            <text x="500" y="125" fill="rgba(167,139,250,.65)" font-size="11" font-style="italic">2026-01 发 Agent Skills · 150K 装机</text>
          </g>

          <!-- Motion Canvas 2023-02 · 无 AI · 18.4k -->
          <g data-id="b-mc">
            <circle cx="380"  cy="465" r="50" fill="rgba(156,163,175,.22)" stroke="#9ca3af" stroke-width="2"/>
            <text x="380"  y="463" text-anchor="middle" fill="#fff" font-size="14" font-weight="700">Motion Canvas</text>
            <text x="380"  y="485" text-anchor="middle" fill="rgba(255,255,255,.65)" font-size="12">18.4k · 0 AI</text>
          </g>

          <!-- Revideo 2024-04 · pivot 闭源 · 3.7k -->
          <g data-id="b-revideo">
            <circle cx="540"  cy="380" r="28" fill="rgba(251,191,36,.18)" stroke="#fbbf24" stroke-width="2" stroke-dasharray="5 3"/>
            <text x="540"  y="378" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">Revideo</text>
            <text x="540"  y="395" text-anchor="middle" fill="rgba(255,255,255,.6)" font-size="11">3.7k · pivot</text>
          </g>

          <!-- Hyperframes 2026-03 · agent-native · 8.2k 🔴 -->
          <g data-id="b-hyperframes">
            <circle cx="864"  cy="105" r="55" fill="rgba(248,113,113,.25)" stroke="#f87171" stroke-width="3"/>
            <text x="864"  y="100" text-anchor="middle" fill="#fff" font-size="15" font-weight="800">Hyperframes</text>
            <text x="864"  y="120" text-anchor="middle" fill="#fca5a5" font-size="12">8.2k · 1.5 月</text>
            <text x="864"  y="38"  text-anchor="middle" fill="#f87171" font-size="13" font-weight="700">🔴 主威胁</text>
            <text x="864"  y="22"  text-anchor="middle" fill="rgba(248,113,113,.7)" font-size="10">HeyGen 出品</text>
          </g>

          <!-- Claude Code Video Toolkit 2026 · agent-native · 926 -->
          <g data-id="b-cctk">
            <circle cx="780"  cy="155" r="22" fill="rgba(52,211,153,.15)" stroke="#34d399" stroke-width="1.8"/>
            <text x="780"  y="158" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">CC-VT</text>
            <text x="780"  y="185" text-anchor="middle" fill="rgba(255,255,255,.55)" font-size="10">926 · skills 包</text>
          </g>

          <!-- NextFrame 2026-04-21 · 起步 -->
          <g data-id="b-nf">
            <circle cx="1020" cy="160" r="20" fill="rgba(167,139,250,.45)" stroke="#a78bfa" stroke-width="3"/>
            <text x="1020" y="163" text-anchor="middle" fill="#fff" font-size="12" font-weight="800">我们</text>
            <text x="1020" y="195" text-anchor="middle" fill="#a78bfa" font-size="11" font-weight="700">v0.1 · 0 stars</text>
            <text x="1020" y="44" text-anchor="middle" fill="#a78bfa" font-size="13" font-weight="700">↓ NextFrame</text>
            <line x1="1020" y1="50" x2="1020" y2="138" stroke="#a78bfa" stroke-width="2" stroke-dasharray="3 3"/>
          </g>
        </svg>
      </div>
    `,
    reveal_steps: [
      { target: "b-editly", animate: "pulse" },
      { target: "b-mc", animate: "pulse" },
      { target: "b-remotion", animate: "pulse" },
      { target: "b-revideo", animate: "pulse" },
      { target: "b-hyperframes", animate: "pulse" },
      { target: "b-nf", animate: "pulse" }
    ]
  },

  // ═══════════════ Frame 3 · 主威胁 Hyperframes ═══════════════
  {
    id: 3,
    title: "🔴 Hyperframes · 主威胁",
    narration: "HeyGen 出品 · 1.5 个月 8.2k stars · 跟我们 1:1 镜像. 我们落后 42 天.",
    visual_html: `
      <div style="padding:32px 48px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:14px;color:#f87171;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">🔴 主威胁 · Tier-1 镜像竞品</div>
          <h2 style="font-size:42px;font-weight:800;margin:8px 0 0;color:#fff;letter-spacing:-.02em;">Hyperframes</h2>
          <div style="font-size:18px;color:rgba(255,255,255,.7);margin-top:6px;">HeyGen 出品的开源 HTML→MP4 框架</div>
        </div>

        <!-- 核心数字 -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px;">
          <div data-id="h-stars" style="text-align:center;padding:18px;background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.3);border-radius:12px;">
            <div style="font-size:40px;font-weight:800;color:#f87171;line-height:1;">8.2k</div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">stars (1.5 月)</div>
          </div>
          <div data-id="h-forks" style="text-align:center;padding:18px;background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.3);border-radius:12px;">
            <div style="font-size:40px;font-weight:800;color:#f87171;line-height:1;">630</div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">forks</div>
          </div>
          <div data-id="h-blocks" style="text-align:center;padding:18px;background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.3);border-radius:12px;">
            <div style="font-size:40px;font-weight:800;color:#f87171;line-height:1;">50+</div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">blocks 现成</div>
          </div>
          <div data-id="h-company" style="text-align:center;padding:18px;background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.3);border-radius:12px;">
            <div style="font-size:32px;font-weight:800;color:#f87171;line-height:1.1;">$500M</div>
            <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">HeyGen 估值</div>
          </div>
        </div>

        <!-- 强 vs 弱 对比卡 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
          <div data-id="h-strong" style="padding:22px 26px;background:rgba(248,113,113,.08);border-left:4px solid #f87171;border-radius:0 12px 12px 0;">
            <div style="font-size:13px;color:#f87171;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">⚠️ 它强(我们追不上)</div>
            <ul style="margin:0;padding-left:22px;line-height:1.8;color:rgba(255,255,255,.88);font-size:15px;">
              <li>HeyGen 品牌 + 渠道(主 SaaS 导流)</li>
              <li>Apache 2.0 · 7 packages 完整</li>
              <li>agent skills + MCP + slash commands</li>
              <li>Browser Studio + web component player</li>
            </ul>
          </div>
          <div data-id="h-weak" style="padding:22px 26px;background:rgba(52,211,153,.08);border-left:4px solid #34d399;border-radius:0 12px 12px 0;">
            <div style="font-size:13px;color:#34d399;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">✓ 它没的(我们可吃)</div>
            <ul style="margin:0;padding-left:22px;line-height:1.8;color:rgba(255,255,255,.88);font-size:15px;">
              <li><b>HDR 不支持</b>(1080p 主 · 4K claimed 无 pipeline)</li>
              <li><b>Node + Chrome</b>(性能天花板 · 非 Rust)</li>
              <li><b>无 macOS 桌面壳</b>(纯 CLI + 网页 Studio)</li>
              <li><b>场景定位混</b>(TikTok/bar chart 都做 · 无垂类深)</li>
            </ul>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "h-stars", animate: "pulse" },
      { target: "h-forks", animate: "pulse" },
      { target: "h-blocks", animate: "pulse" },
      { target: "h-company", animate: "pulse" },
      { target: "h-strong", animate: "pulse" },
      { target: "h-weak", animate: "pulse" }
    ]
  },

  // ═══════════════ Frame 4 · 龙头 Remotion + 二线 ═══════════════
  {
    id: 4,
    title: "🟡 龙头 Remotion · 二线 3 个",
    narration: "Remotion 44k stars 龙头 · 已发 Agent Skills 占 agent 心智 · 但绑 React + 无 HDR. 二线 Revideo/MotionCanvas/Editly 各有姿态.",
    visual_html: `
      <div style="padding:24px 40px;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">🟡 龙头 + 🟡 二线</div>
          <h2 style="font-size:36px;font-weight:700;margin:8px 0 0;color:#fff;">其他 4 个对手</h2>
        </div>

        <!-- Remotion 主卡(大) -->
        <div data-id="r-card" style="padding:24px 28px;background:rgba(167,139,250,.10);border:1px solid rgba(167,139,250,.4);border-radius:14px;margin-bottom:18px;">
          <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:14px;">
            <div style="font-size:28px;font-weight:800;color:#a78bfa;">Remotion</div>
            <div style="font-size:14px;color:rgba(255,255,255,.65);">2020 · React-based programmatic video · 龙头</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;">
            <div style="text-align:center;padding:10px;background:rgba(167,139,250,.12);border-radius:8px;">
              <div style="font-size:24px;font-weight:800;color:#a78bfa;">44.1k</div>
              <div style="font-size:11px;color:rgba(255,255,255,.6);">stars</div>
            </div>
            <div style="text-align:center;padding:10px;background:rgba(167,139,250,.12);border-radius:8px;">
              <div style="font-size:24px;font-weight:800;color:#a78bfa;">170k</div>
              <div style="font-size:11px;color:rgba(255,255,255,.6);">npm/周</div>
            </div>
            <div style="text-align:center;padding:10px;background:rgba(167,139,250,.12);border-radius:8px;">
              <div style="font-size:24px;font-weight:800;color:#a78bfa;">150K</div>
              <div style="font-size:11px;color:rgba(255,255,255,.6);">agent skills 装机 (8wk)</div>
            </div>
            <div style="text-align:center;padding:10px;background:rgba(167,139,250,.12);border-radius:8px;">
              <div style="font-size:24px;font-weight:800;color:#a78bfa;">5</div>
              <div style="font-size:11px;color:rgba(255,255,255,.6);">agent 平台</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:14px;line-height:1.65;">
            <div><span style="color:#34d399;font-weight:700;">✓ 该学</span> · AI-native docs (.md URL + Accept header) / Agent Skills 发行通道 / Studio live preview</div>
            <div><span style="color:#f87171;font-weight:700;">✗ 致命</span> · 无 HDR (Chrome 只 sRGB · 官方明确不做) / 强绑 React + Node / source-available 不真开源</div>
          </div>
        </div>

        <!-- 二线 3 个紧凑卡 -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
          <div data-id="rev-card" style="padding:16px 18px;background:rgba(251,191,36,.08);border-left:4px solid #fbbf24;border-radius:0 10px 10px 0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
              <div style="font-size:18px;font-weight:800;color:#fff;">Revideo</div>
              <div style="font-size:14px;color:#fbbf24;font-weight:700;">3.7k</div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.65);line-height:1.55;">
              <b>2024 · YC W24/S24 · motion-canvas fork</b><br>
              团队 pivot 闭源 Midrender(带 MCP)· 开源仓<b style="color:#fbbf24;">半维护</b> · 无 4K HDR · Canvas 2D 上限
            </div>
          </div>
          <div data-id="mc-card" style="padding:16px 18px;background:rgba(156,163,175,.08);border-left:4px solid #9ca3af;border-radius:0 10px 10px 0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
              <div style="font-size:18px;font-weight:800;color:#fff;">Motion Canvas</div>
              <div style="font-size:14px;color:#9ca3af;font-weight:700;">18.4k</div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.65);line-height:1.55;">
              <b>2023 · Aarthificial YouTuber · TS generator</b><br>
              <b style="color:#34d399;">该偷</b>:generator/signal API + live preview · <b style="color:#9ca3af;">该避</b>:0 AI · 程序员窄圈
            </div>
          </div>
          <div data-id="ed-card" style="padding:16px 18px;background:rgba(156,163,175,.08);border-left:4px solid #9ca3af;border-radius:0 10px 10px 0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
              <div style="font-size:18px;font-weight:800;color:#fff;">Editly</div>
              <div style="font-size:14px;color:#9ca3af;font-weight:700;">5.4k</div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.65);line-height:1.55;">
              <b>2020 · Node + ffmpeg · JSON5 spec</b><br>
              图层栈模型(上一代) · <b style="color:#f87171;">半停滞</b>(2025-02 last commit · v0.15.0-rc.1 未转正)
            </div>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "r-card", animate: "pulse" },
      { target: "rev-card", animate: "pulse" },
      { target: "mc-card", animate: "pulse" },
      { target: "ed-card", animate: "pulse" }
    ]
  },

  // ═══════════════ Frame 5 · 8 维度对比矩阵 ═══════════════
  {
    id: 5,
    title: "8 维度对比矩阵",
    narration: "看右边那列 · NextFrame 是唯一同时拿 Rust + 4K HDR + 桌面壳 三件的. 但生态 stars 是零.",
    visual_html: `
      <div style="padding:24px 40px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">能力矩阵</div>
          <h2 style="font-size:34px;font-weight:700;margin:8px 0 0;color:#fff;">8 维度 · NextFrame vs 4 主竞品</h2>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:rgba(255,255,255,.06);">
              <th style="text-align:left;padding:14px 16px;border-bottom:2px solid rgba(255,255,255,.15);font-size:13px;color:rgba(255,255,255,.7);font-weight:700;letter-spacing:.05em;">维度</th>
              <th style="text-align:center;padding:14px 8px;border-bottom:2px solid rgba(248,113,113,.4);font-size:13px;color:#f87171;">Hyperframes</th>
              <th style="text-align:center;padding:14px 8px;border-bottom:2px solid rgba(167,139,250,.4);font-size:13px;color:#a78bfa;">Remotion</th>
              <th style="text-align:center;padding:14px 8px;border-bottom:2px solid rgba(156,163,175,.4);font-size:13px;color:#9ca3af;">M.Canvas</th>
              <th style="text-align:center;padding:14px 8px;border-bottom:2px solid rgba(156,163,175,.4);font-size:13px;color:#9ca3af;">Editly</th>
              <th style="text-align:center;padding:14px 12px;border-bottom:2px solid rgba(167,139,250,.6);background:rgba(167,139,250,.08);font-size:14px;color:#fff;font-weight:800;">NextFrame</th>
            </tr>
          </thead>
          <tbody data-id="matrix-body" style="font-variant-numeric:tabular-nums;">
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">主语言</td>
              <td style="text-align:center;color:rgba(255,255,255,.6);">TS</td>
              <td style="text-align:center;color:rgba(255,255,255,.6);">TS</td>
              <td style="text-align:center;color:rgba(255,255,255,.6);">TS</td>
              <td style="text-align:center;color:rgba(255,255,255,.6);">TS</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#34d399;font-weight:700;">Rust+TS</td></tr>
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">渲染层</td>
              <td style="text-align:center;font-size:12px;color:rgba(255,255,255,.6);">Chrome</td>
              <td style="text-align:center;font-size:12px;color:rgba(255,255,255,.6);">Chrome</td>
              <td style="text-align:center;font-size:12px;color:rgba(255,255,255,.6);">Canvas2D</td>
              <td style="text-align:center;font-size:12px;color:rgba(255,255,255,.6);">ffmpeg+gl</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#34d399;font-weight:700;font-size:12px;">WebView+GPU</td></tr>
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">4K</td>
              <td style="text-align:center;color:#fbbf24;">claimed</td>
              <td style="text-align:center;color:#fbbf24;">scale</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#fbbf24;">任意</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#34d399;font-weight:700;">✓ 原生</td></tr>
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">HDR / 10-bit</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#f87171;">✗ 官方拒</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#34d399;font-weight:800;">✓ 唯一</td></tr>
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">macOS 壳</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#34d399;font-weight:800;">✓ 唯一</td></tr>
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">Agent skills</td>
              <td style="text-align:center;color:#34d399;font-weight:700;">✓</td>
              <td style="text-align:center;color:#34d399;font-weight:700;">✓ 150K</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;color:#f87171;">✗</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#fbbf24;font-weight:700;">⚠️ 待补</td></tr>
            <tr><td style="padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.06);">License</td>
              <td style="text-align:center;color:#34d399;">Apache</td>
              <td style="text-align:center;color:#fbbf24;font-size:11px;">source-avail</td>
              <td style="text-align:center;color:#34d399;">MIT</td>
              <td style="text-align:center;color:#34d399;">MIT</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#9ca3af;">未定</td></tr>
            <tr><td style="padding:11px 16px;">Stars (生态)</td>
              <td style="text-align:center;color:#f87171;font-weight:700;">8.2k 🔴</td>
              <td style="text-align:center;color:#a78bfa;font-weight:800;">44.1k</td>
              <td style="text-align:center;color:#9ca3af;">18.4k</td>
              <td style="text-align:center;color:#9ca3af;">5.4k</td>
              <td style="text-align:center;background:rgba(167,139,250,.08);color:#f87171;font-weight:800;">0 ❗</td></tr>
          </tbody>
        </table>
      </div>
    `,
    reveal_steps: [
      { target: "matrix-body", animate: "pulse" }
    ]
  },

  // ═══════════════ Frame 6 · NextFrame 4 差异化窗口 ═══════════════
  {
    id: 6,
    title: "NextFrame · 4 差异化窗口",
    narration: "差异化窗口正在关闭. 4 个里至少拿下 2 个才能立 · Rust + 4K HDR 是 day-1 必上.",
    visual_html: `
      <div style="padding:28px 48px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">真差异化窗口</div>
          <h2 style="font-size:38px;font-weight:800;margin:8px 0 0;color:#fff;letter-spacing:-.02em;">NextFrame · 4 个差异点</h2>
          <div style="font-size:16px;color:rgba(255,255,255,.65);margin-top:8px;">至少拿下 2 个 · 否则被降维打击</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
          <div data-id="d-rust" style="padding:24px 26px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="font-size:32px;">🦀</div>
              <div>
                <div style="font-size:22px;font-weight:800;color:#34d399;">Rust 原生栈</div>
                <div style="font-size:12px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.1em;">P0 · day-1 必上</div>
              </div>
            </div>
            <div style="font-size:14px;line-height:1.65;color:rgba(255,255,255,.8);">
              <b style="color:#34d399;">vs</b> 全部竞品 TS+Node+Chrome<br>
              <b>→</b> 性能 / 确定性 / 单二进制分发<br>
              <i style="color:rgba(255,255,255,.5);font-size:12px;">Remotion 已被第三方 rustymotion 重写印证此痛点</i>
            </div>
          </div>

          <div data-id="d-hdr" style="padding:24px 26px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="font-size:32px;">🎬</div>
              <div>
                <div style="font-size:22px;font-weight:800;color:#34d399;">4K HDR 60fps</div>
                <div style="font-size:12px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.1em;">P0 · day-1 必上</div>
              </div>
            </div>
            <div style="font-size:14px;line-height:1.65;color:rgba(255,255,255,.8);">
              <b style="color:#34d399;">vs</b> 全部竞品无 HDR · Hyperframes 1080p · Remotion 官方拒<br>
              <b>→</b> 高端场景(教育/产品/4K 屏)唯一可选<br>
              <i style="color:rgba(255,255,255,.5);font-size:12px;">charter P6 死约束 · 不做"能用版"</i>
            </div>
          </div>

          <div data-id="d-shell" style="padding:24px 26px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:14px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="font-size:32px;">🖥️</div>
              <div>
                <div style="font-size:22px;font-weight:800;color:#a78bfa;">macOS 桌面壳</div>
                <div style="font-size:12px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.1em;">P1 · v0.2 进行中</div>
              </div>
            </div>
            <div style="font-size:14px;line-height:1.65;color:rgba(255,255,255,.8);">
              <b style="color:#a78bfa;">vs</b> 全部竞品纯 web/CLI<br>
              <b>→</b> PM/设计/创作者上手 · 系统字体/文件/性能<br>
              <i style="color:rgba(255,255,255,.5);font-size:12px;">v0.2 wry+tao 落地中 · 别走 v1.19 AppKit 老路</i>
            </div>
          </div>

          <div data-id="d-vertical" style="padding:24px 26px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:14px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="font-size:32px;">🎯</div>
              <div>
                <div style="font-size:22px;font-weight:800;color:#fbbf24;">垂类深做</div>
                <div style="font-size:12px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.1em;">P1 · 待选定</div>
              </div>
            </div>
            <div style="font-size:14px;line-height:1.65;color:rgba(255,255,255,.8);">
              <b style="color:#fbbf24;">vs</b> 全部竞品 generalist<br>
              <b>→</b> 候选: 教育讲解 / 产品演示 / 数据报告 / 4K 屏播<br>
              <i style="color:rgba(255,255,255,.5);font-size:12px;">起步晚必须切口窄 · 通用赛道已被占</i>
            </div>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "d-rust", animate: "pulse" },
      { target: "d-hdr", animate: "pulse" },
      { target: "d-shell", animate: "pulse" },
      { target: "d-vertical", animate: "pulse" }
    ]
  },

  // ═══════════════ Frame 7 · 立刻该做的 5 件事 + CTA ═══════════════
  {
    id: 7,
    title: "立刻该做的 5 件事",
    narration: "P0 两条立刻动 · P1 跟上 · P2 文档基础设施第一天就铺. 窗口正在关闭.",
    visual_html: `
      <div style="padding:28px 48px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:14px;color:#a78bfa;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">战略建议</div>
          <h2 style="font-size:38px;font-weight:800;margin:8px 0 0;color:#fff;letter-spacing:-.02em;">立刻该做的 5 件事</h2>
        </div>

        <div style="display:grid;gap:14px;">
          <div data-id="a-1" style="display:grid;grid-template-columns:80px 1fr;gap:18px;align-items:center;padding:18px 22px;background:rgba(248,113,113,.10);border-left:4px solid #f87171;border-radius:0 12px 12px 0;">
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:#f87171;line-height:1;">P0</div>
              <div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:4px;">立刻</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">v0.3 engine 上 4K HDR + Rust 性能硬指标</div>
              <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;">deterministic frame capture + HDR 验证 day-1 上 · 拿真数字 (帧 hash · 色彩精度) 区别于 claim</div>
            </div>
          </div>

          <div data-id="a-2" style="display:grid;grid-template-columns:80px 1fr;gap:18px;align-items:center;padding:18px 22px;background:rgba(248,113,113,.10);border-left:4px solid #f87171;border-radius:0 12px 12px 0;">
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:#f87171;line-height:1;">P0</div>
              <div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:4px;">立刻</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">出 NextFrame Claude Code skills 包(分发通道)</div>
              <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;">抄 Hyperframes / Claude Code Video Toolkit · agent 心智占位 · 起步晚必须靠 agent 传播</div>
            </div>
          </div>

          <div data-id="a-3" style="display:grid;grid-template-columns:80px 1fr;gap:18px;align-items:center;padding:18px 22px;background:rgba(251,191,36,.08);border-left:4px solid #fbbf24;border-radius:0 12px 12px 0;">
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:#fbbf24;line-height:1;">P1</div>
              <div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:4px;">v0.3-v0.4</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">挑 1-2 垂类深做 · 拒绝 generalist 定位</div>
              <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;">候选: <b>教育讲解</b> / 产品演示 / 数据报告 / 4K 屏播 · 通用赛道已被 Hyperframes/Remotion 占</div>
            </div>
          </div>

          <div data-id="a-4" style="display:grid;grid-template-columns:80px 1fr;gap:18px;align-items:center;padding:18px 22px;background:rgba(251,191,36,.08);border-left:4px solid #fbbf24;border-radius:0 12px 12px 0;">
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:#fbbf24;line-height:1;">P1</div>
              <div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:4px;">v0.2-v0.3</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">学 motion-canvas 的 generator API + Remotion 的 live preview</div>
              <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;">DX 标杆 · TS describe 层时序可读 · 桌面壳 preview &lt; 1s 反馈</div>
            </div>
          </div>

          <div data-id="a-5" style="display:grid;grid-template-columns:80px 1fr;gap:18px;align-items:center;padding:18px 22px;background:rgba(167,139,250,.08);border-left:4px solid #a78bfa;border-radius:0 12px 12px 0;">
            <div style="text-align:center;">
              <div style="font-size:32px;font-weight:800;color:#a78bfa;line-height:1;">P2</div>
              <div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:4px;">day-1 铺</div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">AI-native 文档(.md URL 后缀 + Accept header 内容协商)</div>
              <div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.55;">Remotion 验证 agent 友好文档是关键基础设施 · 文档一开始就 agent 可抓</div>
            </div>
          </div>
        </div>

        <!-- 收尾金句 -->
        <div data-id="closing" style="margin-top:28px;padding:22px 28px;background:linear-gradient(135deg,rgba(167,139,250,.15) 0%,rgba(248,113,113,.10) 100%);border:1px solid rgba(167,139,250,.4);border-radius:14px;text-align:center;">
          <div style="font-size:13px;color:#a78bfa;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-bottom:10px;">一句话总结</div>
          <div style="font-size:22px;line-height:1.55;color:#fff;font-weight:600;">
            <b style="color:#f87171;">已被夹击</b> · <b style="color:#34d399;">唯一活路</b> = Rust + 4K HDR + 桌面壳 + 垂类深做<br>
            <span style="font-size:16px;color:rgba(255,255,255,.7);">v0.3 必须立刻显出真差异化 · 否则窗口关闭</span>
          </div>
        </div>
      </div>
    `,
    reveal_steps: [
      { target: "a-1", animate: "pulse" },
      { target: "a-2", animate: "pulse" },
      { target: "a-3", animate: "pulse" },
      { target: "a-4", animate: "pulse" },
      { target: "a-5", animate: "pulse" },
      { target: "closing", animate: "pulse" }
    ]
  }
];
