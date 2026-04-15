// scenes/9x16/neo-tokyo/content-comparePair.js

export default {
  id: "comparePair",
  name: "A vs B 对比双栏",
  version: "1.0.0",
  ratio: "9:16",
  theme: "neo-tokyo",
  role: "content",
  description: "上下两张卡片 A vs B A 从左 fly 入场 B 从右 fly 入场 中间 VS 徽章 pop + 各自数据 stagger",
  duration_hint: 3.0,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    before-after / contrast 模式（§7.4 §1 frame-craft 12 模式）在 9:16 竖屏的最佳落位
    上下双卡（不是左右 因为竖屏宽度不够容纳两列大字）。做法 A 卡从屏幕左侧 fly -80%
    到 0 fade 入场 0-0.5s B 卡从右 fly 0.55-1.05s stagger 中间 "VS" 荧光紫徽章 1.1s 起
    scale 0→1.15→1 pop 进场 圆形边框 box-shadow 光晕。两张卡各自 header（左 "HUMAN"
    cyan / 右 "AGENT" neon）+ 大数字 + 一行描述。用颜色语义区分 cyan = 人 neon 紫 = AI
    观众一眼懂谁是谁。底部细线 cyan/neon 双色渐变过渡 暗示"AI 取代人"的主题。两个
    verb fly + pop（外加 VS 徽章的 pulse 呼吸持续 1.3s 后）。情绪波形位置 展开段 3-10s
    观众此时在等"那是什么"对比给答案。截图测试 单帧看懂 "人 X / AI Y" 已经构成转发钩子。
  `,
  when_to_use: [
    "讲 AI 替代人的能力对比（时薪 / 速度 / 错误率）",
    "新旧世代对比（2022 GPT-3 vs 2025 Claude 4.6）",
    "两种方案取舍（本地 vs 云端）",
  ],
  when_not_to_use: [
    "只有一个数字（用 counterStat）",
    "三个及以上对比（用列表 / 表格 不适合本组件）",
    "需要连续序列对比（用时间线组件）",
  ],
  limitations: [
    "每卡 title ≤ 10 字符 value ≤ 8 字符 desc ≤ 20 字符 超出压行",
    "双卡硬对齐 若内容长短差距大视觉失衡",
  ],
  inspired_by: "Bloomberg 双候选人对比直播条 + Apple 新旧 iPhone spec 对照页",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-gridPulse", "content-hookTitle", "text-goldenQuote"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "high",
  z_layer: "top",
  mood: ["focused", "tech"],

  tags: ["compare", "contrast", "versus", "pair", "neo-tokyo", "stagger"],

  complexity: "medium",
  performance: { cost: "low", notes: "两张卡片 DOM + 一个 VS 徽章 + 一条渐变线" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版 fly stagger + VS pop" }],

  params: {
    aTitle: {
      type: "string",
      default: "HUMAN",
      semantic: "左/上卡标题（默认代表人）",
    },
    aValue: {
      type: "string",
      default: "¥200/h",
      semantic: "左/上卡主值",
    },
    aDesc: {
      type: "string",
      default: "平均时薪",
      semantic: "左/上卡说明",
    },
    bTitle: {
      type: "string",
      default: "AI AGENT",
      semantic: "右/下卡标题（默认代表 AI）",
    },
    bValue: {
      type: "string",
      default: "¥0.3/h",
      semantic: "右/下卡主值",
    },
    bDesc: {
      type: "string",
      default: "Claude 4.6 推理",
      semantic: "右/下卡说明",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const aT = String(params.aTitle || "HUMAN");
    const aV = String(params.aValue || "¥200/h");
    const aD = String(params.aDesc || "平均时薪");
    const bT = String(params.bTitle || "AI AGENT");
    const bV = String(params.bValue || "¥0.3/h");
    const bD = String(params.bDesc || "Claude 4.6");

    // A 卡 fly in from left 0-0.55s
    const aDur = 0.55;
    const aP = Math.min(Math.max(t / aDur, 0), 1);
    const aEased = 1 - Math.pow(1 - aP, 3);
    const aX = -100 * (1 - aEased); // %

    // A 卡 value stagger 0.25s 起
    const aValP = Math.min(Math.max((t - 0.25) / 0.4, 0), 1);
    const aValEased = 1 - Math.pow(1 - aValP, 3);

    // B 卡 fly in from right 0.55-1.1s
    const bStart = 0.55;
    const bP = Math.min(Math.max((t - bStart) / 0.55, 0), 1);
    const bEased = 1 - Math.pow(1 - bP, 3);
    const bX = 100 * (1 - bEased);

    // B 卡 value stagger 0.8s
    const bValP = Math.min(Math.max((t - 0.8) / 0.4, 0), 1);
    const bValEased = 1 - Math.pow(1 - bValP, 3);

    // VS 徽章 pop 1.1-1.45s
    const vsStart = 1.1;
    const vsP = Math.min(Math.max((t - vsStart) / 0.4, 0), 1);
    let vsScale = 0;
    if (vsP > 0) {
      if (vsP < 0.65) {
        const q = vsP / 0.65;
        vsScale = 1.15 * (1 - Math.pow(1 - q, 3));
      } else {
        const q = (vsP - 0.65) / 0.35;
        vsScale = 1.15 - 0.15 * q;
      }
    }
    // VS 徽章 pulse（1.5s 后）
    const vsPulse = t > 1.55 ? 1 + 0.04 * Math.sin((t - 1.55) * Math.PI * 1.4) : 1;
    const finalVsScale = vsScale < 1 ? vsScale : vsScale * vsPulse;

    // 底部渐变线 clipReveal 0.3s 起
    const lineP = Math.min(Math.max((t - 0.3) / 0.8, 0), 1);
    const lineEased = 1 - Math.pow(1 - lineP, 3);

    const W = vp.width;
    const H = vp.height;
    const cardW = W - 176; // 88 padding each
    const cardH = H * 0.28;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: 88px;
        top: ${H * 0.18}px;
        width: ${cardW}px;
        height: ${cardH}px;
        background: linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(0,229,255,0.02) 100%);
        border: 1.5px solid rgba(0,229,255,0.35);
        border-radius: 4px;
        padding: 40px 48px;
        box-sizing: border-box;
        transform: translateX(${aX.toFixed(2)}%);
        opacity: ${aEased.toFixed(3)};
        overflow: hidden;
      ">
        <div style="
          font: 600 32px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #00e5ff;
          letter-spacing: 0.2em;
          margin-bottom: 28px;
        ">&gt; ${escapeHtml(aT)}</div>
        <div style="
          font: 700 108px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #e6f7ff;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
          opacity: ${aValEased.toFixed(3)};
          transform: translateY(${(16 * (1 - aValEased)).toFixed(2)}px);
          text-shadow: 0 0 18px rgba(0,229,255,0.3);
          font-variant-numeric: tabular-nums;
        ">${escapeHtml(aV)}</div>
        <div style="
          font: 400 30px/1.4 'JetBrains Mono', 'SF Mono', monospace;
          color: rgba(230,247,255,0.6);
          letter-spacing: 0.04em;
        ">${escapeHtml(aD)}</div>
      </div>

      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.5 - 56}px;
        transform: translate(-50%, 0) scale(${finalVsScale.toFixed(3)});
        width: 112px;
        height: 112px;
        border: 2px solid #b967ff;
        border-radius: 50%;
        background: #07090f;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 24px rgba(185,103,255,0.6),
                    inset 0 0 12px rgba(185,103,255,0.2);
        z-index: 5;
      ">
        <span style="
          font: 700 40px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #b967ff;
          letter-spacing: 0.04em;
        ">VS</span>
      </div>

      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.5}px;
        width: ${cardW * lineEased}px;
        transform: translate(-${50 * lineEased}%, -50%);
        height: 1px;
        background: linear-gradient(to right, #00e5ff 0%, #b967ff 100%);
        opacity: 0.5;
        z-index: 1;
      "></div>

      <div style="
        position: absolute;
        left: 88px;
        top: ${H * 0.54}px;
        width: ${cardW}px;
        height: ${cardH}px;
        background: linear-gradient(135deg, rgba(185,103,255,0.08) 0%, rgba(185,103,255,0.02) 100%);
        border: 1.5px solid rgba(185,103,255,0.35);
        border-radius: 4px;
        padding: 40px 48px;
        box-sizing: border-box;
        transform: translateX(${bX.toFixed(2)}%);
        opacity: ${bEased.toFixed(3)};
        overflow: hidden;
      ">
        <div style="
          font: 600 32px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #b967ff;
          letter-spacing: 0.2em;
          margin-bottom: 28px;
        ">&gt; ${escapeHtml(bT)}</div>
        <div style="
          font: 700 108px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #e6f7ff;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
          opacity: ${bValEased.toFixed(3)};
          transform: translateY(${(16 * (1 - bValEased)).toFixed(2)}px);
          text-shadow: 0 0 18px rgba(185,103,255,0.35);
          font-variant-numeric: tabular-nums;
        ">${escapeHtml(bV)}</div>
        <div style="
          font: 400 30px/1.4 'JetBrains Mono', 'SF Mono', monospace;
          color: rgba(230,247,255,0.6);
          letter-spacing: 0.04em;
        ">${escapeHtml(bD)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    return {
      sceneId: "comparePair",
      phase: t < 1.1 ? "fly-in" : t < 1.5 ? "vs-pop" : "show",
      progress: Math.min(t / 1.5, 1),
      visible: true,
      params,
      elements: [
        { type: "card", role: "pair-a", title: params.aTitle, value: params.aValue, desc: params.aDesc, side: "top", color: "#00e5ff" },
        { type: "badge", role: "separator", value: "VS", color: "#b967ff" },
        { type: "card", role: "pair-b", title: params.bTitle, value: params.bValue, desc: params.bDesc, side: "bottom", color: "#b967ff" },
      ],
      boundingBox: { x: 88, y: vp.height * 0.18, w: vp.width - 176, h: vp.height * 0.66 },
    };
  },

  sample() {
    return {
      aTitle: "HUMAN DEV",
      aValue: "8h",
      aDesc: "写一个 CRUD 后端",
      bTitle: "AI AGENT",
      bValue: "11m",
      bDesc: "Claude 4.6 + 工具链",
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
