// scenes/16x9/effects-showcase/data-bigStat.js
//
// bigStat — SVG conic-gradient 圆环 + 巨数 + mix-blend-mode 色散
// 数据可视化的高级形态：圆环包围一个 280px serif 巨数，环本身是彩色 conic 渐变。

export default {
  id: "bigStat",
  name: "bigStat",
  version: "1.0.0",

  ratio: "16:9",
  theme: "effects-showcase",
  role: "data",

  description: "SVG conic 渐变圆环 + 280px serif 巨数 + 三色 RGB 色散描边 — 数据可视化电影级",
  duration_hint: null,

  type: "svg",
  frame_pure: false,
  assets: [],

  intent: `数据组件大部分长得像 Excel — 我要的是「电影海报里的统计」。布局：中心 280px serif italic 巨数（数字本身就是 hero），外围一个旋转的 conic-gradient（cyan→magenta→violet→cyan）圆环，圆环描边由三个稍偏移的同心圆模拟「RGB 色散」（cyan 偏左 1px，magenta 偏右 1px → CMY 三色边）。圆环 stroke-dasharray 走 progress：进度 0→target 在 1.2 秒内 ease-out cubic 完成。数字本身用 counter 动画（从 0 滚到 target，非线性 easeOutQuart）。idle motion：整个圆环慢速旋转（30s/圈），数字 letter-spacing 微呼吸。情绪节点：核心 reveal 帧，给观众「记住这个数」。272 / 87 / 4 这种数字必须超大。`,

  when_to_use: [
    "一个数字 dominate 全屏的揭露帧",
    "需要「电影海报感」的统计数据",
    "Hook 砸脸 + 核心论点反转",
  ],

  when_not_to_use: [
    "多个并列数字（用对比卡而不是 bigStat）",
    "数字 > 5 位（serif 280 撑不下）",
  ],

  limitations: [
    "数字 string 长度建议 ≤ 4 字符",
    "圆环半径写死 viewport 的 28%",
  ],

  inspired_by: "Apple keynote 性能数据 hero + Linear /next 大字 + Awwwards 数据可视化 SOTD",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-liquidNoise", "text-neonGlow"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["powerful", "revealing", "cinematic"],

  tags: ["data", "stat", "ring", "dispersion", "conic", "effects-showcase"],

  complexity: "medium",
  performance: { cost: "low", notes: "纯 SVG，无 filter 链；流畅" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — cinematic ring stat" },
  ],

  params: {
    value: {
      type: "number",
      default: 272,
      semantic: "目标数字（counter 终点）",
    },
    label: {
      type: "string",
      default: "MODELS TRAINED",
      semantic: "顶部 mono 标签",
    },
    unit: {
      type: "string",
      default: "B",
      semantic: "右下角单位（B / M / % / x）",
    },
    progress: {
      type: "number",
      default: 0.78,
      semantic: "圆环填充比例 0~1",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.32;

    const target = Number(params.value) || 272;
    const label = String(params.label || "MODELS TRAINED");
    const unit = String(params.unit || "B");
    const progressTarget = Math.max(0, Math.min(1, Number(params.progress) || 0.78));

    const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Counter: 0 → target over 1.5s easeOutQuart
    const cdur = 1.5;
    const cp = Math.min(t / cdur, 1);
    const eased = 1 - Math.pow(1 - cp, 4);
    const currentValue = Math.round(target * eased);

    // Ring progress: 0 → progressTarget over 1.2s easeOutCubic
    const pdur = 1.2;
    const pp = Math.min(Math.max((t - 0.2) / pdur, 0), 1);
    const easedP = 1 - Math.pow(1 - pp, 3);
    const ringFill = progressTarget * easedP;

    // Idle: 慢速旋转 30s/圈
    const rot = (t / 30) * 360;

    // Letter-spacing 呼吸
    const breathe = -0.025 + 0.005 * Math.sin((t / 4) * Math.PI * 2);

    // 圆环周长
    const circ = 2 * Math.PI * R;
    const dashArray = `${circ * ringFill} ${circ}`;

    // 入场：整体 opacity
    const opacity = Math.min(t / 0.6, 1);

    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;display:block;opacity:${opacity.toFixed(3)};">
        <defs>
          <!-- conic 用 SVG 模拟：用渐变 stops 旋转 -->
          <linearGradient id="ring-c" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#00f0ff"/>
            <stop offset="33%" stop-color="#7c4dff"/>
            <stop offset="66%" stop-color="#ff2bd6"/>
            <stop offset="100%" stop-color="#00f0ff"/>
          </linearGradient>

          <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6"/>
          </filter>
        </defs>

        <!-- 底环（轨道）-->
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
                stroke="rgba(234,242,255,0.08)" stroke-width="2"/>

        <!-- 色散描边：cyan / magenta 偏移 1.5px 模拟 RGB 分离 -->
        <g transform="rotate(${rot.toFixed(2)} ${cx} ${cy})">
          <circle cx="${cx - 1.5}" cy="${cy}" r="${R}" fill="none"
                  stroke="#00f0ff" stroke-opacity="0.55" stroke-width="3"
                  stroke-dasharray="${dashArray}" stroke-linecap="round"
                  transform="rotate(-90 ${cx} ${cy})"/>
          <circle cx="${cx + 1.5}" cy="${cy}" r="${R}" fill="none"
                  stroke="#ff2bd6" stroke-opacity="0.55" stroke-width="3"
                  stroke-dasharray="${dashArray}" stroke-linecap="round"
                  transform="rotate(-90 ${cx} ${cy})"/>
          <!-- 主环（彩虹渐变）-->
          <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
                  stroke="url(#ring-c)" stroke-width="4"
                  stroke-dasharray="${dashArray}" stroke-linecap="round"
                  transform="rotate(-90 ${cx} ${cy})"
                  filter="url(#ring-glow)"/>
          <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
                  stroke="url(#ring-c)" stroke-width="2.5"
                  stroke-dasharray="${dashArray}" stroke-linecap="round"
                  transform="rotate(-90 ${cx} ${cy})"/>

          <!-- 进度端点高亮圆 -->
          ${ringFill > 0.02 ? `
          <circle cx="${cx + Math.cos(-Math.PI / 2 + ringFill * Math.PI * 2) * R}"
                  cy="${cy + Math.sin(-Math.PI / 2 + ringFill * Math.PI * 2) * R}"
                  r="8" fill="#eaf2ff" filter="url(#ring-glow)"/>
          ` : ""}
        </g>

        <!-- 顶部 mono 标签 -->
        <text x="${cx}" y="${cy - R - 32}" text-anchor="middle"
              font-family="'SF Mono', 'JetBrains Mono', Consolas, monospace"
              font-size="20" fill="#00f0ff"
              letter-spacing="4" opacity="0.85">
          ${safe(label)}
        </text>

        <!-- 巨数 + 单位 -->
        <text x="${cx}" y="${cy + 24}" text-anchor="middle"
              font-family="Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif"
              font-style="italic"
              font-weight="700"
              font-size="${(R * 1.1).toFixed(2)}"
              letter-spacing="${breathe.toFixed(3)}em"
              fill="#eaf2ff">
          ${currentValue}
        </text>

        <!-- 单位（右下角小字）-->
        <text x="${cx + R * 0.8}" y="${cy + 24}"
              font-family="Georgia, serif"
              font-weight="600"
              font-size="${(R * 0.28).toFixed(2)}"
              fill="#ff2bd6"
              opacity="0.9">
          ${safe(unit)}
        </text>

        <!-- 底部进度文本 -->
        <text x="${cx}" y="${cy + R + 56}" text-anchor="middle"
              font-family="'SF Mono', Consolas, monospace"
              font-size="16" fill="rgba(234,242,255,0.5)"
              letter-spacing="2">
          PROGRESS  ${(ringFill * 100).toFixed(1)}%
        </text>
      </svg>
    `;
  },

  describe(t, params, vp) {
    const target = Number(params.value) || 272;
    const cp = Math.min(t / 1.5, 1);
    const eased = 1 - Math.pow(1 - cp, 4);
    return {
      sceneId: "bigStat",
      phase: t < 1.5 ? "enter" : "show",
      progress: cp,
      visible: true,
      params,
      elements: [
        { type: "ring", role: "progress", fill: Number((Number(params.progress) || 0.78).toFixed(2)) },
        { type: "value", role: "metric", current: Math.round(target * eased), target },
        { type: "label", role: "kicker", value: params.label || "" },
        { type: "unit", role: "unit", value: params.unit || "" },
      ],
      boundingBox: { x: vp.width * 0.18, y: vp.height * 0.1, w: vp.width * 0.64, h: vp.height * 0.8 },
    };
  },

  sample() {
    return {
      value: 272,
      label: "PARAMS / NEURAL CORE",
      unit: "B",
      progress: 0.78,
    };
  },
};
