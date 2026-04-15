// scenes/16x9/cosmos-viridian/content-formulaReveal.js
//
// formulaReveal — 居中大号公式（serif italic 变量 + mono 符号） + 左侧 mono 章节号
// + 下方一行人话注解 + 公式逐段 type / fade 显露 + 关键变量脉冲高亮

export default {
  // ===== Identity =====
  id: "formulaReveal",
  name: "formulaReveal",
  version: "1.0.0",

  ratio: "16:9",
  theme: "cosmos-viridian",
  role: "content",

  description: "公式大字显露 — 变量 serif italic + 符号 mono，分段 stagger 淡入 + 关键变量脉冲辉光 + 下方人话解释",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `物理 / 宇宙科普躲不开公式 — E=mc² / R_s = 2GM/c² / S = kB·ln(Ω) / F=GMm/r²。差的视频把公式当图片贴一张完事，观众看了没感觉。这个组件把公式拆成段（变量 / 等号 / 系数 / 符号）分批淡入（verb 1: type/reveal，每段 120ms stagger），观众的眼动跟着公式"被写出来"的过程走 — 这是 Veritasium / 3Blue1Brown 板书教学的关键心法："让观众看到公式长出来，不是砸一张图"。变量用 serif italic 写（物理惯例：M / R / c 都是 serif 斜体 — 不斜就不是物理），符号用 mono（等号/括号/指数）。左侧挂 mono 章节号"§2 · 史瓦西半径"做锚点。一个关键变量（params.highlight 指定下标）入场后持续 pulse 辉光（verb 2: pulse）— 观众的眼睛会被拉到"这个变量最重要"。下方人话注解 body 字号，把公式翻译成"一颗恒星塌缩到多小会变黑洞" — 公式必须配人话不然是炫技。情绪：核心段（10-25s）。对标 Veritasium 公式推导 + 3B1B 线性代数系列。`,

  when_to_use: [
    "需要展示物理/数学公式（相对论、引力、熵、波动方程）",
    "公式推导的中间态（从 E=mc² 导出 R_s = 2GM/c²）",
    "核心段深度解释（观众需要看懂这一步才能继续）",
  ],

  when_not_to_use: [
    "公式太长（超过 8 个元素，拆成两张或换文字叙述）",
    "需要完整推导链（用 chain 组件或多张 slide）",
    "观众没数学基础（公式换成类比图）",
  ],

  limitations: [
    "segments 数 ≤ 8，超过会被压缩字号或换行",
    "explain 注解 ≤ 40 中文字符",
    "highlight 下标必须在 segments 范围内",
  ],

  inspired_by: "Veritasium 板书推导 + 3Blue1Brown 公式渐变 + Feynman lecture 手写公式",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-voidField", "chrome-observatoryBar", "cosmicCounter"],
  conflicts_with: ["formulaReveal"],
  alternatives: ["orbitDiagram", "cosmicCounter"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["scientific", "analytical", "focused"],

  tags: ["content", "formula", "equation", "physics", "math", "reveal", "cosmos-viridian"],

  complexity: "medium",
  performance: { cost: "low", notes: "每段一个 span，t-driven opacity/translateY；highlight span 脉冲 opacity" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for cosmos-viridian · 史瓦西半径 / 相对论公式" },
  ],

  params: {
    chapter: {
      type: "string",
      default: "",
      semantic: "左上章节号（例 '§2 · 史瓦西半径'）",
    },
    segments: {
      type: "array",
      default: [
        { text: "R", kind: "var" },
        { text: "_s", kind: "sub" },
        { text: " = ", kind: "sym" },
        { text: "2GM", kind: "var" },
        { text: " / ", kind: "sym" },
        { text: "c²", kind: "var" },
      ],
      semantic: "公式段数组，每项 {text, kind: 'var'|'sub'|'sym'}。var=serif italic, sub=serif italic 小, sym=mono",
    },
    highlight: {
      type: "number",
      default: -1,
      semantic: "要脉冲高亮的 segment 下标（-1 = 不高亮）",
    },
    explain: {
      type: "string",
      default: "",
      semantic: "公式下方一行人话注解",
    },
    accent: {
      type: "color",
      default: "#3ddc97",
      semantic: "章节号 + 高亮变量的翠青色",
    },
    accent2: {
      type: "color",
      default: "#b967ff",
      semantic: "次强调（辉光紫）用于符号",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const chapter = String(params.chapter || "");
    const segmentsRaw = Array.isArray(params.segments) ? params.segments : [];
    const segments = segmentsRaw.slice(0, 10);
    const highlight = Number.isInteger(params.highlight) ? params.highlight : -1;
    const explain = String(params.explain || "");
    const accent = params.accent || "#3ddc97";
    const accent2 = params.accent2 || "#b967ff";

    const W = vp.width;
    const H = vp.height;

    // chapter fly-in 0 → 0.5s
    const pCh = Math.min(Math.max(t / 0.5, 0), 1);
    const chEase = 1 - Math.pow(1 - pCh, 3);
    const chOpacity = chEase;
    const chY = -12 * (1 - chEase);

    // segments stagger 0.3 → (0.3 + n*0.12 + 0.5)
    const segStart = 0.3;
    const segStep = 0.13;
    const segDur = 0.55;

    const segHtml = segments.map((s, i) => {
      const delay = segStart + i * segStep;
      const p = Math.min(Math.max((t - delay) / segDur, 0), 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const op = ease;
      const y = 14 * (1 - ease);

      const isHL = (i === highlight);
      const isVar = s.kind === "var";
      const isSub = s.kind === "sub";
      const isSym = s.kind === "sym";

      // highlight pulse after it's done entering
      const pulseStart = delay + segDur + 0.1;
      const pulseGlow = (isHL && t > pulseStart)
        ? 12 + 16 * (0.5 + 0.5 * Math.sin((t - pulseStart) * Math.PI * 1.2))
        : 0;

      let style = "";
      if (isVar) {
        style = `font: italic 400 148px/1 'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif; color: ${isHL ? accent : '#eaf4f2'}; letter-spacing: -0.01em;`;
      } else if (isSub) {
        style = `font: italic 400 80px/1 'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif; color: ${isHL ? accent : 'rgba(234,244,242,.75)'}; vertical-align: sub; margin-left: -8px;`;
      } else if (isSym) {
        style = `font: 400 120px/1 'SF Mono', 'JetBrains Mono', Consolas, monospace; color: ${accent2}; opacity: 0.85;`;
      }

      const glowStyle = pulseGlow > 0
        ? `text-shadow: 0 0 ${pulseGlow.toFixed(1)}px ${accent};`
        : "";

      return `<span style="
        display: inline-block;
        ${style}
        ${glowStyle}
        opacity: ${op.toFixed(3)};
        transform: translateY(${y.toFixed(2)}px);
      ">${escapeHtml(String(s.text || ""))}</span>`;
    }).join("");

    // explain fade after all segments
    const explainDelay = segStart + segments.length * segStep + 0.2;
    const pEx = Math.min(Math.max((t - explainDelay) / 0.6, 0), 1);
    const explainOpacity = 0.85 * (1 - Math.pow(1 - pEx, 3));
    const explainY = 10 * (1 - (1 - Math.pow(1 - pEx, 3)));

    // underline reveal after explain
    const ulDelay = explainDelay + 0.3;
    const pUl = Math.min(Math.max((t - ulDelay) / 0.6, 0), 1);
    const ulScale = 1 - Math.pow(1 - pUl, 3);

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-rows: auto 1fr auto auto;
        padding: ${H*0.12}px ${W*0.08}px;
        color: #eaf4f2;
      ">
        <div style="
          font: 500 20px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: ${accent};
          letter-spacing: 0.22em;
          text-transform: uppercase;
          opacity: ${chOpacity.toFixed(3)};
          transform: translateY(${chY.toFixed(2)}px);
        ">${escapeHtml(chapter)}</div>

        <div style="
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0;
          line-height: 1;
          padding: 60px 0;
          white-space: nowrap;
          overflow: visible;
        ">
          ${segHtml}
        </div>

        <div style="
          justify-self: center;
          width: ${W*0.2}px;
          height: 2px;
          background: linear-gradient(to right, transparent, ${accent}, transparent);
          transform-origin: center;
          transform: scaleX(${ulScale.toFixed(3)});
          margin-bottom: 28px;
        "></div>

        <div style="
          justify-self: center;
          font: 400 28px/1.55 system-ui, -apple-system, 'PingFang SC', sans-serif;
          color: rgba(234,244,242,.85);
          max-width: ${W*0.7}px;
          text-align: center;
          opacity: ${explainOpacity.toFixed(3)};
          transform: translateY(${explainY.toFixed(2)}px);
        ">${escapeHtml(explain)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const segmentsRaw = Array.isArray(params.segments) ? params.segments : [];
    const segments = segmentsRaw.slice(0, 10);
    const total = 0.3 + segments.length * 0.13 + 0.55 + 0.8;
    const progress = Math.min(1, Math.max(0, t / total));
    return {
      sceneId: "formulaReveal",
      phase: progress < 1 ? "reveal" : "pulse",
      progress,
      visible: true,
      params,
      elements: [
        { type: "chapter", role: "label", value: params.chapter || "" },
        ...segments.map((s, i) => ({ type: "segment", role: s.kind, index: i, value: s.text, highlight: i === params.highlight })),
        { type: "explain", role: "caption", value: params.explain || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      chapter: "§2 · 史瓦西半径",
      segments: [
        { text: "R", kind: "var" },
        { text: "s", kind: "sub" },
        { text: "  =  ", kind: "sym" },
        { text: "2GM", kind: "var" },
        { text: "  /  ", kind: "sym" },
        { text: "c²", kind: "var" },
      ],
      highlight: 3,
      explain: "一颗恒星的质量被压缩到这个半径以内，任何东西都逃不出来 —— 它变成了黑洞。",
      accent: "#3ddc97",
      accent2: "#b967ff",
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
