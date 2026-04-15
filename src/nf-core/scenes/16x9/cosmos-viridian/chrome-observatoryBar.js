// scenes/16x9/cosmos-viridian/chrome-observatoryBar.js
//
// observatoryBar — 顶部 chrome 条 (y 40~120)
// 左 章节号 + 中 标题 + 右 mono 坐标（RA/Dec）+ 顶部极细翠青线 reveal

export default {
  // ===== Identity =====
  id: "observatoryBar",
  name: "observatoryBar",
  version: "1.0.0",

  ratio: "16:9",
  theme: "cosmos-viridian",
  role: "chrome",

  description: "观测站顶条 — 左章节号 + 中标题 + 右 mono 坐标 + 顶部翠青线 unfold + 整体 fly-down",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `科普视频的 chrome 不能是丑陋的标题栏，它应该像 NASA 任务控制屏的 HUD — 提供"语境锚点"而不抢戏。这个顶条占 y 40~120（80px 高），严格遵守主题网格。左侧 mono 章节号"EP 03 · §2"给观众"这是第几集第几段"的导航感（观看长视频不迷路）；中心 sans 600 28px 标题（本集名），单行截断；右侧 mono 坐标（天体 RA/Dec 或 UTC 时间戳 或 镜头序号）— 这个"坐标感"是主题气质的灵魂，观测站就该有坐标。顶部一条 1px 翠青辉光线从中心向两边 unfold（verb 1: reveal/unfold，0 → 1s），整体 chrome 从 y=-40 fly-in 到 y=0（verb 2: fly，0.1 → 0.7s），两种动效组合形成"HUD 启动"感。不做底纹不做 blur — chrome 必须让背景的星点透过来（否则 bg-voidField 白花）。进入后静止但不死：坐标字符有 pulse（每 3s 冒一次 1px 辉光，模拟接收信号），维持"活着"。bg 同屏不冲突（chrome z=5，在 bg 上 content 上）。对标 Apollo 任务控制 HUD + Webb 望远镜观测图例。`,

  when_to_use: [
    "所有 cosmos-viridian 场景顶部（除纯金句收尾外可常驻）",
    "视频内导航（章节号 + 坐标）",
    "建立观测站 / HUD 氛围",
  ],

  when_not_to_use: [
    "收尾 3s 金句帧（text-aweQuote 独占画面）",
    "Hook 大数字独占帧（可选 disable 减少噪音）",
    "9:16 竖屏（尺寸不适配）",
  ],

  limitations: [
    "标题 ≤ 20 中文字符（单行截断）",
    "coord ≤ 28 字符",
    "chapter ≤ 15 字符",
  ],

  inspired_by: "NASA 任务控制 HUD + Webb 望远镜观测图例 + 星际穿越飞船仪表盘",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-voidField", "cosmicCounter", "orbitDiagram", "formulaReveal"],
  conflicts_with: ["observatoryBar"],
  alternatives: [],

  visual_weight: "low",
  z_layer: "top",
  mood: ["scientific", "focused", "tech"],

  tags: ["chrome", "hud", "bar", "top", "observatory", "navigation", "cosmos-viridian"],

  complexity: "simple",
  performance: { cost: "low", notes: "3 文本 span + 1 线 + t-driven line scale + breathe pulse" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for cosmos-viridian · 顶部观测站 HUD" },
  ],

  params: {
    chapter: {
      type: "string",
      default: "",
      semantic: "左侧章节号（例 'EP 03 · §2 · 视界悖论'）",
    },
    title: {
      type: "string",
      default: "",
      semantic: "中心主标题（本集名或主题）",
    },
    coord: {
      type: "string",
      default: "",
      semantic: "右侧 mono 坐标（RA/Dec 或 UTC 或 镜头编号）",
    },
    accent: {
      type: "color",
      default: "#3ddc97",
      semantic: "顶部辉光线和章节/坐标色",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const chapter = String(params.chapter || "");
    const title = String(params.title || "");
    const coord = String(params.coord || "");
    const accent = params.accent || "#3ddc97";

    const W = vp.width;
    const H = vp.height;

    // line unfold 0 → 1s（verb: reveal/unfold）
    const pLine = Math.min(Math.max(t / 1.0, 0), 1);
    const lineScale = 1 - Math.pow(1 - pLine, 3);

    // chrome fly-down 0.1 → 0.7s（verb: fly）
    const pBar = Math.min(Math.max((t - 0.1) / 0.6, 0), 1);
    const barEase = 1 - Math.pow(1 - pBar, 3);
    const barY = -20 * (1 - barEase);
    const barOpacity = barEase;

    // stagger text: chapter 0.3, title 0.45, coord 0.6
    const makeP = (delay) => {
      const p = Math.min(Math.max((t - delay) / 0.5, 0), 1);
      return 1 - Math.pow(1 - p, 3);
    };
    const chP = makeP(0.3);
    const tiP = makeP(0.45);
    const coP = makeP(0.6);

    // coord pulse 信号感（verb: pulse）— 3s 周期冒一次辉光
    const coordPulseStart = 1.2;
    const coordGlow = t > coordPulseStart
      ? 4 + 6 * Math.max(0, Math.sin((t - coordPulseStart) * Math.PI / 3))
      : 0;

    // 顶部 y = 40 / 高度 80 / 标题栏 — 相对 vp
    const topY = H * (40 / 1080);
    const barH = H * (80 / 1080);
    const padX = W * 0.05;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: 0; right: 0;
        top: ${topY.toFixed(2)}px;
        height: ${barH.toFixed(2)}px;
        opacity: ${barOpacity.toFixed(3)};
        transform: translateY(${barY.toFixed(2)}px);
      ">
        <div style="
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%) scaleX(${lineScale.toFixed(3)});
          width: 92%;
          height: 1px;
          background: linear-gradient(to right,
            transparent 0%,
            ${accent} 20%,
            ${accent} 80%,
            transparent 100%);
          box-shadow: 0 0 12px rgba(61,220,151,0.4);
        "></div>

        <div style="
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 32px;
          padding: 0 ${padX.toFixed(2)}px;
          color: #eaf4f2;
        ">
          <div style="
            justify-self: start;
            font: 500 14px/1.3 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: ${accent};
            letter-spacing: 0.22em;
            text-transform: uppercase;
            opacity: ${chP.toFixed(3)};
          ">${escapeHtml(chapter)}</div>

          <div style="
            justify-self: center;
            font: 600 26px/1.2 system-ui, -apple-system, 'PingFang SC', sans-serif;
            color: rgba(234,244,242,0.95);
            letter-spacing: -0.005em;
            max-width: ${(W*0.5).toFixed(0)}px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: ${tiP.toFixed(3)};
          ">${escapeHtml(title)}</div>

          <div style="
            justify-self: end;
            font: 400 14px/1.3 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: rgba(234,244,242,0.6);
            letter-spacing: 0.08em;
            opacity: ${coP.toFixed(3)};
            text-shadow: 0 0 ${coordGlow.toFixed(2)}px rgba(61,220,151,0.6);
          ">${escapeHtml(coord)}</div>
        </div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 1.1));
    return {
      sceneId: "observatoryBar",
      phase: progress < 1 ? "enter" : "show",
      progress,
      visible: true,
      params,
      elements: [
        { type: "line", role: "divider", position: "top" },
        { type: "chapter", role: "label", value: params.chapter || "" },
        { type: "title", role: "body", value: params.title || "" },
        { type: "coord", role: "meta", value: params.coord || "" },
      ],
      boundingBox: { x: 0, y: vp.height * (40/1080), w: vp.width, h: vp.height * (80/1080) },
    };
  },

  sample() {
    return {
      chapter: "EP 03 · §2 · 视界悖论",
      title: "黑洞里的信息去哪了？",
      coord: "M87* · RA 12h30m49s · Dec +12°23'",
      accent: "#3ddc97",
    };
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
