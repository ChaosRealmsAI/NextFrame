// scenes/16x9/cosmos-viridian/data-cosmicCounter.js
//
// cosmicCounter — serif 巨型数字 counter，0 → 目标值非线性滚动 + 左上 mono 坐标
// + 单位右下挂 + subtitle 下方注解 + 底部翠青辉光下划

export default {
  // ===== Identity =====
  id: "cosmicCounter",
  name: "cosmicCounter",
  version: "1.0.0",

  ratio: "16:9",
  theme: "cosmos-viridian",
  role: "data",

  description: "超大 serif 数字 counter 动画 — 从 0 滚到目标值，配 mono 坐标标签 + 单位 + 注解 + 辉光底线",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `宇宙科普里"一个震撼数字"就是那期视频的命根子 — 黑洞质量 M87* = 65 亿倍太阳质量 / 一立方厘米中微子数量 = 3.4 亿 / 宇宙背景辐射温度 = 2.725K。这个组件专门伺候这类 Hook 数字。serif 260px 做主数字（比 sans 更"博物馆铭牌感"，和主题宇宙敬畏感绑），counter 从 0 滚到目标（easeOutCubic）— 观众眼睛被数字增长"钓"着看完，比静态数字强十倍。左上挂 mono 坐标签（RA/Dec 或 "M87* 核心"），把数字锚定到具体天体，不是随便说。单位 serif italic 挂在数字右下 baseline 上，翠青色（唯一着色的元素，不染主数字 — 主数字白让画面稳）。底部一条翠青辉光横线从 0 展开到 40% 宽（verb: reveal），带 box-shadow 柔光。数字停稳后整体 scale 1.00↔1.015 呼吸，保持"活着"。情绪波形：Hook 段（0-3s）用它。Kurzgesagt + Apple keynote 数字排版的合体。`,

  when_to_use: [
    "Hook 帧展示一个震撼天文/物理数字（黑洞质量、距离、温度、数量）",
    "章节转场的 reveal 高潮（『这个数 = X』）",
    "收尾 callback 开头的那个数",
  ],

  when_not_to_use: [
    "多数字并列对比（用 dataCompare 或拆成两张 slide）",
    "数字 > 5 位字符会挤压右侧单位（换 compact 模式或拆位）",
    "数字不是重点（用 body 正文带过即可）",
  ],

  limitations: [
    "主数字字符 ≤ 5 位（含逗号），超过会破安全区",
    "coord 坐标 ≤ 20 字符，否则换行破节奏",
    "subtitle ≤ 30 中文字符",
  ],

  inspired_by: "Kurzgesagt 封面大数字 + Apple 发布会『Thousands of』式统计 + Event Horizon Telescope 技术卡片",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-voidField", "chrome-observatoryBar", "content-formulaReveal"],
  conflicts_with: ["cosmicCounter"],
  alternatives: ["formulaReveal"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["intense", "scientific", "awe"],

  tags: ["data", "counter", "number", "metric", "hook", "cosmos-viridian", "大数字"],

  complexity: "simple",
  performance: { cost: "low", notes: "单 innerHTML per frame + 字符串拼接；t-driven 数字 + breathe scale" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for cosmos-viridian · E01 黑洞质量 reveal" },
  ],

  params: {
    value: {
      type: "number",
      required: true,
      semantic: "目标数字（数值）。counter 从 0 滚到这里。",
    },
    prefix: {
      type: "string",
      default: "",
      semantic: "数字前缀（例 '×' 或 '~' 或 '10^'），serif 小字",
    },
    unit: {
      type: "string",
      default: "",
      semantic: "单位（亿倍太阳质量 / K / km/s），挂数字右下",
    },
    coord: {
      type: "string",
      default: "",
      semantic: "左上 mono 坐标/天体编号（例 'M87* · RA 12h30m49s'）",
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "数字下方一行注解，body 字号",
    },
    accent: {
      type: "color",
      default: "#3ddc97",
      semantic: "单位/坐标/底线的翠青强调色",
    },
    formatThousands: {
      type: "boolean",
      default: true,
      semantic: "是否用千分位逗号（2,725 vs 2725）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const target = Number(params.value != null ? params.value : 65);
    const prefix = String(params.prefix || "");
    const unit = String(params.unit || "");
    const coord = String(params.coord || "");
    const subtitle = String(params.subtitle || "");
    const accent = params.accent || "#3ddc97";
    const fmt = params.formatThousands !== false;

    // coord fly-in (verb 1: fly)，0 → 0.6s，从左 translateX(-24)
    const pCoord = Math.min(Math.max(t / 0.6, 0), 1);
    const coordEase = 1 - Math.pow(1 - pCoord, 3);
    const coordOpacity = coordEase;
    const coordX = -24 * (1 - coordEase);

    // counter (verb 2: counter)，0.2 → 1.6s，easeOutCubic
    const counterDur = 1.4;
    const counterStart = 0.2;
    const pCount = Math.min(Math.max((t - counterStart) / counterDur, 0), 1);
    const countEase = 1 - Math.pow(1 - pCount, 3);
    const currentNum = target * countEase;
    const currentStr = formatNum(currentNum, target, fmt);

    // pop 开场数字 scale overshoot（verb 3: pop），0.2 → 0.9s
    const popDur = 0.7;
    const pPop = Math.min(Math.max((t - 0.2) / popDur, 0), 1);
    const popScale = pPop < 0.7
      ? (pPop / 0.7) * 1.08
      : 1.08 - ((pPop - 0.7) / 0.3) * 0.08;
    const numScale = Math.max(popScale, 0.01);
    const numOpacity = Math.min(pPop / 0.3, 1);

    // unit fly-in 0.8 → 1.4s
    const pUnit = Math.min(Math.max((t - 0.8) / 0.6, 0), 1);
    const unitEase = 1 - Math.pow(1 - pUnit, 3);
    const unitOpacity = unitEase;
    const unitX = -12 * (1 - unitEase);

    // rule reveal 1.2 → 1.8s（verb: reveal）
    const pRule = Math.min(Math.max((t - 1.2) / 0.6, 0), 1);
    const ruleScale = 1 - Math.pow(1 - pRule, 3);

    // subtitle fade 1.4 → 2.0s
    const pSub = Math.min(Math.max((t - 1.4) / 0.6, 0), 1);
    const subOpacity = 0.75 * (1 - Math.pow(1 - pSub, 3));

    // breathe scale 入场后持续（verb: breathe）
    const breatheStart = 2.0;
    const breathe = t > breatheStart
      ? 1 + 0.012 * Math.sin((t - breatheStart) * Math.PI * 0.8)
      : 1;

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-rows: auto 1fr auto auto auto;
        align-content: center;
        justify-items: center;
        row-gap: 28px;
        padding: ${H*0.11}px ${W*0.08}px;
        color: #eaf4f2;
        text-align: center;
      ">
        <div style="
          font: 500 20px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: ${accent};
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: ${coordOpacity.toFixed(3)};
          transform: translateX(${coordX.toFixed(2)}px);
        ">${escapeHtml(coord)}</div>

        <div style="
          display: inline-flex;
          align-items: baseline;
          gap: 18px;
          transform: scale(${(numScale * breathe).toFixed(4)});
          transform-origin: center;
        ">
          ${prefix ? `<span style="
            font: 400 72px/1 'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: rgba(234,244,242,.55);
            opacity: ${numOpacity.toFixed(3)};
          ">${escapeHtml(prefix)}</span>` : ""}
          <span style="
            font: 400 260px/0.9 'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: #eaf4f2;
            letter-spacing: -0.02em;
            opacity: ${numOpacity.toFixed(3)};
            text-shadow: 0 0 48px rgba(61,220,151,0.18);
          ">${escapeHtml(currentStr)}</span>
          <span style="
            font: italic 400 60px/1 'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif;
            color: ${accent};
            opacity: ${unitOpacity.toFixed(3)};
            transform: translateX(${unitX.toFixed(2)}px);
            display: inline-block;
          ">${escapeHtml(unit)}</span>
        </div>

        <div style="
          width: ${W*0.28}px;
          height: 2px;
          background: ${accent};
          box-shadow: 0 0 24px rgba(61,220,151,0.55);
          transform-origin: center;
          transform: scaleX(${ruleScale.toFixed(3)});
        "></div>

        <div style="
          font: 400 28px/1.55 system-ui, -apple-system, 'PingFang SC', sans-serif;
          color: rgba(234,244,242,.85);
          max-width: ${W*0.6}px;
          opacity: ${subOpacity.toFixed(3)};
        ">${escapeHtml(subtitle)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(1, Math.max(0, t / 2.0));
    const phase = progress < 1 ? "enter" : "breathe";
    return {
      sceneId: "cosmicCounter",
      phase,
      progress,
      visible: true,
      params,
      elements: [
        { type: "coord", role: "label", value: params.coord || "" },
        { type: "number", role: "metric", value: params.value, font: "serif-260" },
        { type: "unit", role: "unit", value: params.unit || "" },
        { type: "rule", role: "divider", glow: true },
        { type: "subtitle", role: "caption", value: params.subtitle || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      coord: "M87* · RA 12h30m49s · Dec +12°23'",
      prefix: "",
      value: 6.5,
      unit: "十亿倍太阳质量",
      subtitle: "这是人类第一次拍到的黑洞，它的质量相当于 65 亿颗太阳压成一个点。",
      accent: "#3ddc97",
      formatThousands: true,
    };
  },
};

function formatNum(n, target, fmt) {
  // 判断目标是否是整数
  const isInt = Math.abs(target - Math.round(target)) < 1e-9;
  if (isInt) {
    const v = Math.round(n);
    if (!fmt) return String(v);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  } else {
    // 保留 1 位小数
    const v = n.toFixed(1);
    if (!fmt) return v;
    const [intPart, decPart] = v.split(".");
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + decPart;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
