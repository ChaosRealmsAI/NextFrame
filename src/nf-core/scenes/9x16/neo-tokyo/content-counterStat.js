// scenes/9x16/neo-tokyo/content-counterStat.js

export default {
  id: "counterStat",
  name: "数字 counter + 对比锚点",
  version: "1.0.0",
  ratio: "9:16",
  theme: "neo-tokyo",
  role: "content",
  description: "超大 mono 数字从 0 滚到目标 + 脉冲光晕 + 单位后缀 + 对比锚点一行小字",
  duration_hint: 2.5,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    核心段 metric 模式（§7.4 数字必配对比锚点 "87 类" 孤零零 vs "87 类 ChatGPT 只有 12"）。
    做法 320px mono 700 数字从 0 counter 到目标值 持续 1.2s easeOut cubic 不是线性 让大
    数字有加速感。counter 完成后 数字光晕 pulse 呼吸（box-shadow + text-shadow 周期 2s）
    给静止的数字呼吸感防止 §7.2 静止>3s。单位（%/万/x/类）紧贴数字右下 cyan 76px mono
    视觉锚定。上方 kicker 标签 mono 小字 28px 冷白标题像终端 prompt ">> METRIC"。下方
    对比锚点 "vs 2022 年 3%" 用 ink-50 小字 两行 第一行 vs/than 关键词 第二行具体数字
    紫色 neon 让对比瞬间成立。数字颜色 cyan 主强调 带一条底部细红色分割线（暗示"替代"
    的危险感）。两个 verb counter + pulse。情绪波形 核心段 10-20s。截图测试 朋友圈
    转发率高 一个大数字抵一千字。
  `,
  when_to_use: [
    "讲具体数据冲击（90% 代码 AI 写 · 3 年取代 50 万人）",
    "数据新闻风 metric 段落",
    "研究报告引用的数字可视化",
  ],
  when_not_to_use: [
    "没有确切数字只有定性描述（用 goldenQuote）",
    "多个数字需对比（用 comparePair）",
    "数字本身无冲击力 <10 或 >亿（视觉张力不足）",
  ],
  limitations: [
    "整数 counter 实现 小数点/百分数用 params.format 指定",
    "数字显示上限约 4 位 5 位以上压 300px 字号",
    "锚点 ≤ 30 字符 超过压 2 行",
  ],
  inspired_by: "Kurzgesagt 数字大字 + Bloomberg 数据直播条 + 小Lin说 '数字对比'",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-gridPulse", "content-comparePair", "overlay-progressPulse"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "high",
  z_layer: "top",
  mood: ["focused", "tech", "shock"],

  tags: ["metric", "counter", "stat", "number", "neo-tokyo", "pulse"],

  complexity: "medium",
  performance: { cost: "low", notes: "单帧 DOM 8 节点 t-driven counter + shadow pulse" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版 counter + pulse + 对比锚点" }],

  params: {
    kicker: {
      type: "string",
      default: ">> METRIC",
      semantic: "顶部 mono 标签 命令提示符风",
    },
    value: {
      type: "number",
      default: 87,
      semantic: "目标数字（整数）",
    },
    unit: {
      type: "string",
      default: "%",
      semantic: "单位后缀（% / 万 / x / 类 / 人）",
    },
    anchorLabel: {
      type: "string",
      default: "vs 2022 年",
      semantic: "对比锚点前缀",
    },
    anchorValue: {
      type: "string",
      default: "3%",
      semantic: "对比锚点数字值（字符串 可带单位）",
    },
    accent: {
      type: "color",
      default: "#00e5ff",
      semantic: "数字主色",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const kicker = String(params.kicker || ">> METRIC");
    const target = Number(params.value || 87);
    const unit = String(params.unit || "%");
    const anchorLabel = String(params.anchorLabel || "vs 2022");
    const anchorValue = String(params.anchorValue || "3%");
    const ac = params.accent || "#00e5ff";

    // counter 1.2s easeOut cubic
    const counterDur = 1.2;
    const p = Math.min(Math.max(t / counterDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = Math.round(target * eased);

    // kicker 入场 0-0.5s
    const kp = Math.min(Math.max(t / 0.5, 0), 1);
    const kEased = 1 - Math.pow(1 - kp, 3);

    // 数字本身 0-0.3s scale 0.88→1 + fade
    const np = Math.min(Math.max(t / 0.3, 0), 1);
    const nEased = 1 - Math.pow(1 - np, 3);
    const numScale = 0.88 + 0.12 * nEased;

    // pulse glow 在 counter 完成后开始 周期 2s
    const pulsePhase = t > counterDur ? Math.sin((t - counterDur) * Math.PI) : 0;
    const glow = t > counterDur ? 24 + 18 * (0.5 + 0.5 * pulsePhase) : 16;
    const glowOpacity = t > counterDur ? 0.45 + 0.25 * (0.5 + 0.5 * pulsePhase) : 0.35;

    // 对比锚点 counter 完成后 fly in 0.4s
    const anchorStart = counterDur + 0.05;
    const ap = Math.min(Math.max((t - anchorStart) / 0.5, 0), 1);
    const aEased = 1 - Math.pow(1 - ap, 3);

    // 底部红线 drawLine 0.6s 起
    const linep = Math.min(Math.max((t - 0.6) / 0.5, 0), 1);
    const lineEased = 1 - Math.pow(1 - linep, 3);

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.22}px;
        transform: translateX(-50%) translateY(${(16 * (1 - kEased)).toFixed(2)}px);
        font: 600 32px/1 'JetBrains Mono', 'SF Mono', monospace;
        color: ${ac};
        letter-spacing: 0.16em;
        opacity: ${kEased.toFixed(3)};
      ">${escapeHtml(kicker)}</div>

      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.4}px;
        transform: translate(-50%, 0) scale(${numScale.toFixed(3)});
        display: flex;
        align-items: baseline;
        color: ${ac};
        opacity: ${nEased.toFixed(3)};
        white-space: nowrap;
        text-shadow: 0 0 ${glow.toFixed(1)}px rgba(0,229,255,${glowOpacity.toFixed(3)}),
                     0 0 ${(glow * 2).toFixed(1)}px rgba(0,229,255,${(glowOpacity * 0.4).toFixed(3)});
      ">
        <span style="
          font: 700 320px/0.9 'JetBrains Mono', 'SF Mono', monospace;
          letter-spacing: -0.04em;
          font-variant-numeric: tabular-nums;
        ">${current}</span>
        <span style="
          font: 600 76px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #7cf9ff;
          margin-left: 14px;
          letter-spacing: -0.02em;
        ">${escapeHtml(unit)}</span>
      </div>

      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.72}px;
        transform: translateX(-50%) scaleX(${lineEased.toFixed(3)});
        transform-origin: center;
        width: ${W * 0.4}px;
        height: 2px;
        background: linear-gradient(to right,
          transparent 0%, #ff4d6a 50%, transparent 100%);
        box-shadow: 0 0 8px rgba(255,77,106,0.4);
      "></div>

      <div style="
        position: absolute;
        left: 0; right: 0;
        top: ${H * 0.76}px;
        text-align: center;
        opacity: ${aEased.toFixed(3)};
        transform: translateY(${(24 * (1 - aEased)).toFixed(2)}px);
      ">
        <div style="
          font: 400 34px/1.4 'JetBrains Mono', 'SF Mono', monospace;
          color: rgba(230,247,255,0.55);
          letter-spacing: 0.04em;
          margin-bottom: 12px;
        ">${escapeHtml(anchorLabel)}</div>
        <div style="
          font: 700 60px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: #b967ff;
          letter-spacing: -0.02em;
          text-shadow: 0 0 16px rgba(185,103,255,0.5);
        ">${escapeHtml(anchorValue)}</div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const counterDur = 1.2;
    const p = Math.min(Math.max(t / counterDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = Math.round((params.value || 87) * eased);
    return {
      sceneId: "counterStat",
      phase: t < counterDur ? "counter" : "pulse",
      progress: Math.min(t / (counterDur + 0.5), 1),
      visible: true,
      params,
      elements: [
        { type: "kicker", role: "label", value: params.kicker || ">> METRIC" },
        { type: "number", role: "metric", value: current, target: params.value || 87, unit: params.unit || "%" },
        { type: "anchor", role: "compare", label: params.anchorLabel || "", value: params.anchorValue || "" },
      ],
      boundingBox: { x: 0, y: vp.height * 0.2, w: vp.width, h: vp.height * 0.6 },
    };
  },

  sample() {
    return {
      kicker: ">> METRIC · 2026",
      value: 92,
      unit: "%",
      anchorLabel: "// 3 年前只有",
      anchorValue: "7%",
      accent: "#00e5ff",
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
