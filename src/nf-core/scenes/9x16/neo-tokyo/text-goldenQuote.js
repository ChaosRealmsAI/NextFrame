// scenes/9x16/neo-tokyo/text-goldenQuote.js

export default {
  id: "goldenQuote",
  name: "金句定格卡",
  version: "1.0.0",
  ratio: "9:16",
  theme: "neo-tokyo",
  role: "text",
  description: "serif italic 大字金句 zoom 推入 + 呼吸微动 + 上下双引号 + 署名 mono 小字",
  duration_hint: 4.0,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    情绪波形收尾段（§7.6 最后 3s serif italic 定格）的主力。赛博主题下 serif italic
    是刻意的反差 — 全片都是 mono 硬朗 收尾突然用 Times New Roman italic 荧光紫 让观众
    记住金句。做法 全文从 blur(16px) + scale 1.12 推入到 blur(0) scale 1.0（zoom + blurClear
    双 verb）持续 0.9s easeOut。推入完成后 持续 scale 1.0↔1.012 + opacity 0.94↔1.0
    呼吸 周期 3s 防止 §7.2 静止>3s 观众划走。上下巨大 serif 引号 "" 荧光紫 40% 不透明
    装饰背景 像书法飞白（引用文学）。主体文字居中 56px serif italic 冷白 ink。底部
    署名 mono 小字 28px ink-50 "— Jensen Huang · 2025"。色彩语义 cyan 主题突然
    让位 neon 紫 做金句"超验时刻"。文本最多 3 行 每行 ≤ 18 字。§7.8 可截图传播
    朋友圈发"你最讨厌 AI 写代码 它就是你今天的老师"就是转发钩子。
  `,
  when_to_use: [
    "每条短视频的收尾金句帧（最后 2-4s）",
    "名人名言 / 研究结论 / 作者暴论",
    "章节结尾做『停一下思考』 效果",
  ],
  when_not_to_use: [
    "数据 metric（用 counterStat）",
    "过长段落（>50 字建议拆 2 张或换 bodyText）",
    "动态讲述过程中不适合（会打断节奏）",
  ],
  limitations: [
    "中文 ≤ 50 字 英文 ≤ 100 字符 超过字号自动压缩（手动调）",
    "署名 ≤ 32 字符",
    "一帧一句 不支持多句段落",
  ],
  inspired_by: "Medium pull-quote + 3Blue1Brown 结尾黑板板书 + 攻壳结尾 Motoko 独白字幕",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-gridPulse", "content-hookTitle", "content-counterStat"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "high",
  z_layer: "top",
  mood: ["calm", "poetic", "tech"],

  tags: ["quote", "golden", "italic", "serif", "neo-tokyo", "zoom", "breathe"],

  complexity: "simple",
  performance: { cost: "low", notes: "DOM 4 节点 + t-driven blur filter + scale" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版 zoom + blurClear + breathe" }],

  params: {
    text: {
      type: "string",
      required: true,
      semantic: "金句正文 中文 ≤ 50 字",
    },
    byline: {
      type: "string",
      default: "",
      semantic: "署名 mono 小字 例 '— Jensen Huang · GTC 2025'",
    },
    accent: {
      type: "color",
      default: "#b967ff",
      semantic: "引号和署名色 默认荧光紫",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const text = String(params.text || "你最讨厌的 AI，正是你最该学的老师。");
    const byline = String(params.byline || "");
    const ac = params.accent || "#b967ff";

    // zoom + blurClear 0-0.9s
    const zoomDur = 0.9;
    const zp = Math.min(Math.max(t / zoomDur, 0), 1);
    const zEased = 1 - Math.pow(1 - zp, 3);
    const entryScale = 1.12 - 0.12 * zEased;
    const entryBlur = 16 * (1 - zEased);
    const entryOpacity = zEased;

    // breathe 呼吸（完成后）周期 3s
    const breatheT = t > zoomDur ? t - zoomDur : 0;
    const breatheScale = 1 + 0.012 * Math.sin((breatheT / 3) * Math.PI * 2);
    const breatheOpacity = 0.97 + 0.03 * Math.sin((breatheT / 3) * Math.PI * 2);

    const finalScale = zp < 1 ? entryScale : breatheScale;
    const finalOpacity = zp < 1 ? entryOpacity : breatheOpacity;

    // 引号装饰渐入 0.15s 起
    const qp = Math.min(Math.max((t - 0.15) / 0.7, 0), 1);
    const qEased = 1 - Math.pow(1 - qp, 3);

    // 署名 fly up 1.0s 起
    const byp = Math.min(Math.max((t - 1.0) / 0.6, 0), 1);
    const byEased = 1 - Math.pow(1 - byp, 3);

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: 0; right: 0;
        top: ${H * 0.22}px;
        text-align: center;
        font: 400 280px/0.8 Georgia, 'Times New Roman', serif;
        color: ${ac};
        opacity: ${(qEased * 0.22).toFixed(3)};
        transform: scale(${(0.8 + 0.2 * qEased).toFixed(3)});
        pointer-events: none;
      ">&ldquo;</div>

      <div style="
        position: absolute;
        left: 0; right: 0;
        bottom: ${H * 0.16}px;
        text-align: center;
        font: 400 280px/0.8 Georgia, 'Times New Roman', serif;
        color: ${ac};
        opacity: ${(qEased * 0.22).toFixed(3)};
        transform: scale(${(0.8 + 0.2 * qEased).toFixed(3)});
        pointer-events: none;
      ">&rdquo;</div>

      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${W * 0.82}px;
        transform: translate(-50%, -50%) scale(${finalScale.toFixed(4)});
        opacity: ${finalOpacity.toFixed(3)};
        filter: blur(${entryBlur.toFixed(2)}px);
        text-align: center;
        font: italic 500 64px/1.55 Georgia, 'Times New Roman', 'Noto Serif SC', serif;
        color: #e6f7ff;
        letter-spacing: -0.005em;
        text-shadow: 0 0 24px rgba(185,103,255,0.18);
      ">${escapeHtml(text)}</div>

      ${byline ? `
      <div style="
        position: absolute;
        left: 0; right: 0;
        bottom: ${H * 0.1}px;
        text-align: center;
        font: 600 32px/1 'JetBrains Mono', 'SF Mono', monospace;
        color: ${ac};
        letter-spacing: 0.16em;
        opacity: ${(byEased * 0.8).toFixed(3)};
        transform: translateY(${(18 * (1 - byEased)).toFixed(2)}px);
      ">${escapeHtml(byline)}</div>
      ` : ""}
    `;
  },

  describe(t, params, vp) {
    return {
      sceneId: "goldenQuote",
      phase: t < 0.9 ? "zoom-in" : "breathe",
      progress: Math.min(t / 1.6, 1),
      visible: true,
      params,
      elements: [
        { type: "decoration", role: "quote-open", value: "“" },
        { type: "text", role: "quote-body", value: params.text || "", font: "serif-italic-64" },
        { type: "decoration", role: "quote-close", value: "”" },
        ...(params.byline ? [{ type: "byline", role: "attribution", value: params.byline, font: "mono-32" }] : []),
      ],
      boundingBox: { x: vp.width * 0.09, y: vp.height * 0.28, w: vp.width * 0.82, h: vp.height * 0.5 },
    };
  },

  sample() {
    return {
      text: "你最讨厌的 AI，正是你今天最该学的老师。",
      byline: "— NEO-TOKYO MEMO · 2026",
      accent: "#b967ff",
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
