// scenes/16x9/anthropic-warm/content-statNumber.js
//
// 大数字 - 视觉锤式的巨大数字 + 单位 + 说明，强化关键数据点

export default {
  // ===== Identity =====
  id: "statNumber",
  name: "大数字",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "单个巨大数字（ac 橙 200-300px）+ 单位 + 上方 kicker + 下方说明，作为视觉锤",
  duration_hint: 3,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 脚本最抓人的钩子是具体数字："87 类"、"3000 多字"、"2 万字"、"2.5 万字"、"3.5 万字"、
    "100 万 token"、"8 万 → 4 万"。这些数字每个都值得一张独立 slide 砸在观众脸上。
    类比衣戈猜想「信息密度」「数字爆破」的手法——一个大数字 = 一个认知锚点。
    视觉 (参考 style/landscape-atoms/stat-number.html)：
    - 数字本体：ac 橙 #da7756，字号 ~240px（viewport.width * 0.125），超粗 900，
      让它成为屏幕上最重的东西，观众视线必被抓住
    - 单位（字/类/轮/token）：紧贴数字右下角，gold #d4b483，~64px，下沉 baseline
    - kicker（上方预告）：ink-75 uppercase 小字，~22px，letter-spacing 0.14em，
      讲"这个数字指的是什么"（如 "API 请求规模"）
    - 说明（下方收束）：ink 正文 ~32px，一句话解释数字的意义
      （如"最干净的状态下，已经 2 万字了"）
    - 副字（可选）：gold + 斜体，用来放"对比上一个数字"的信息
      （如"比 Session 1 多了 0.5 万字"）
    所有文字居中对齐，整块垂直居中在主内容区。
    一张 slide 只讲一个数字——数字和上下文共同构成视觉锤。
  `,

  when_to_use: [
    "开场爆点数字（E01 Slide 01「87 类」）",
    "每个 Session 结尾的规模总结（2 万/2.5 万/4 万字）",
    "压缩前后 delta（8 万 → 4 万）",
    "任何需要把一个具体数字『敲进观众脑子』的时刻",
  ],

  when_not_to_use: [
    "有多个并列数字——用 content-compareCols 或 stat-grid",
    "数字本身没有强信息量（『3』『5』这种普通计数）",
    "数字是代码里的配置值（用 content-codeBlock 更合适）",
  ],

  limitations: [
    "单个数字最多 6 个字符（含逗号），如 1,000,000 还行，再长字号会被挤小",
    "unit 建议 ≤ 3 汉字 / 6 英文字符",
    "不做数字动画（计数效果由 timeline 动画负责，这里保持 frame_pure）",
  ],

  inspired_by: "衣戈猜想数字爆点 + NYT Graphics 年度报告大数字 + stat-number.html",
  used_in: [
    "claude-code-源码讲解 E01 Slide 01（87 类）",
    "claude-code-源码讲解 E01 Slide 23（Session 1：2.5 万字）",
    "claude-code-源码讲解 E01 Slide 32（Session 3：20 轮）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-analogyCard", "text-goldenQuote"],
  conflicts_with: [],
  alternatives: ["text-goldenQuote（金句不是数字）", "content-keyPoints（多条并列）"],

  visual_weight: "high",
  z_layer: "content",
  mood: ["impactful", "emphatic"],

  tags: ["stat", "number", "hero", "emphasis", "hook", "metric"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM text, no SVG" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — hero number + unit + kicker + caption" },
  ],

  // ===== Params =====
  params: {
    kicker: {
      type: "string",
      default: "",
      semantic: "数字上方的小字预告，uppercase（如「API 请求规模」），≤ 20 字",
    },
    number: {
      type: "string",
      required: true,
      semantic: "数字本身，可含逗号和小数点（如 '87' '2.5万' '100K'），≤ 6 字符视觉最好",
    },
    unit: {
      type: "string",
      default: "",
      semantic: "数字单位（如「类」「字」「token」「轮」），≤ 3 汉字",
    },
    caption: {
      type: "string",
      default: "",
      semantic: "下方一句话说明，≤ 30 汉字（如「最干净状态下的包裹规模」）",
    },
    sub: {
      type: "string",
      default: "",
      semantic: "可选副字（gold 斜体），做对比或补充（如「比上一轮多 5000 字」）",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const w = vp.width;
    const h = vp.height;
    const kicker = escapeHtml(params.kicker || "");
    const number = escapeHtml(params.number || "");
    const unit = escapeHtml(params.unit || "");
    const caption = escapeHtml(params.caption || "");
    const sub = escapeHtml(params.sub || "");

    const numberSize = Math.round(w * 0.125);       // ~240px
    const unitSize = Math.round(w * 0.0333);        // ~64px
    const kickerSize = Math.round(w * 0.0115);      // ~22px
    const captionSize = Math.round(w * 0.0167);     // ~32px
    const subSize = Math.round(w * 0.0125);         // ~24px

    const contentTop = Math.round(h * 0.22);
    const blockH = Math.round(h * 0.6);

    host.innerHTML = `
      <div style="
        position:absolute;
        left:0;
        top:${contentTop}px;
        width:${w}px;
        height:${blockH}px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:${Math.round(h*0.026)}px;
      ">
        ${kicker ? `<div style="
          color:rgba(245,236,224,0.75);
          font:600 ${kickerSize}px/1.3 system-ui,-apple-system,'PingFang SC',sans-serif;
          letter-spacing:0.14em;
          text-transform:uppercase;
          text-align:center;
        ">${kicker}</div>` : ""}
        <div style="
          display:flex;
          align-items:baseline;
          justify-content:center;
          gap:${Math.round(w*0.011)}px;
          line-height:1;
        ">
          <span style="
            color:#da7756;
            font:900 ${numberSize}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
            letter-spacing:-0.02em;
            text-shadow:0 4px 24px rgba(218,119,86,0.25);
          ">${number}</span>
          ${unit ? `<span style="
            color:#d4b483;
            font:700 ${unitSize}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
            margin-left:6px;
          ">${unit}</span>` : ""}
        </div>
        ${caption ? `<div style="
          color:#f5ece0;
          font:500 ${captionSize}px/1.4 system-ui,-apple-system,'PingFang SC',sans-serif;
          text-align:center;
          max-width:${Math.round(w*0.7)}px;
        ">${caption}</div>` : ""}
        ${sub ? `<div style="
          color:#d4b483;
          font:400 italic ${subSize}px/1.4 Georgia,'Hiragino Mincho ProN','Noto Serif SC',serif;
          text-align:center;
          opacity:0.9;
        ">${sub}</div>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "statNumber",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "kicker", value: params.kicker || "" },
        { type: "text", role: "number", value: params.number || "" },
        { type: "text", role: "unit", value: params.unit || "" },
        { type: "text", role: "caption", value: params.caption || "" },
      ],
      boundingBox: {
        x: 0,
        y: Math.round(vp.height * 0.22),
        w: vp.width,
        h: Math.round(vp.height * 0.6),
      },
    };
  },

  sample() {
    return {
      kicker: "API 请求里到底有什么",
      number: "87",
      unit: "类",
      caption: "你写了 1 行，系统拼了 87 类。每一轮，重新拼一遍。",
      sub: "我数过了 —— Claude Code 本人",
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
