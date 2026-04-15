// scenes/16x9/cosmos-viridian/content-orbitDiagram.js
//
// orbitDiagram — 中心天体 + N 条同心轨道 + 公转小星体 + 右侧标签栏
// SVG 精准画圆 + t-driven 轨道角度 + stagger 轨道 draw-in

export default {
  // ===== Identity =====
  id: "orbitDiagram",
  name: "orbitDiagram",
  version: "1.0.0",

  ratio: "16:9",
  theme: "cosmos-viridian",
  role: "content",

  description: "天体轨道图 — SVG 中心星体 + 多条同心圆轨道分批 draw-in + 每条轨道上一颗公转小星体 + 右侧图例",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `宇宙视频讲"尺度关系"最缺的就是一张轨道图 — 水星/金星/地球/木星同心排布，或黑洞周围光子球/ISCO/视界分层。这组件用 SVG 精准画圆（viewBox 固定，等比缩放无走样），中心放主天体（发光圆点 + box-shadow 辉光），外围 N 条同心轨道按 stagger 150ms 逐一 draw-in（用 stroke-dasharray 从 0 → 周长 — verb 1: drawLine/reveal）。每条轨道上一颗小公转体，按各自周期（配参数传入）做圆周运动（verb 2: orbit）— t-driven cos/sin 计算角度，这才是真正的动画（不是 CSS rotate）。右侧 mono 图例栏分批 fly-in，把每条轨道对应的天体/半径标出来。中心主体持续 scale 1.00↔1.03 呼吸（verb 3: breathe）保持活度。翠青 --ac 给主天体 + 关键轨道，辉光紫 --ac2 给次级轨道，3 种语义色铁律里的正好两种。情绪波形：展开段（3-10s）用它做核心视觉。对标 Kurzgesagt 太阳系图 + Cosmos 系列天体分布图。`,

  when_to_use: [
    "讲天体系统（太阳系 / 行星卫星 / 黑洞分层：视界/ISCO/光子球 / 原子电子轨道类比）",
    "展示『尺度关系』（距离/大小递进）",
    "展开段核心视觉（第 5-15 秒）",
  ],

  when_not_to_use: [
    "轨道数 > 6（画面拥挤，拆成两张或换图表）",
    "需要非圆形路径（椭圆 / 螺旋 — 本组件只画正圆）",
    "只讲一个天体没有轨道关系（用 cosmicCounter 或 body）",
  ],

  limitations: [
    "轨道数 2-6 条最佳",
    "每条轨道名称 ≤ 10 中文字符（图例排版）",
    "中心天体标签 ≤ 8 中文字符",
  ],

  inspired_by: "Kurzgesagt 太阳系 + PBS Space Time 黑洞分层图 + Cosmos 系列轨道可视化",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-voidField", "chrome-observatoryBar", "text-aweQuote"],
  conflicts_with: ["orbitDiagram"],
  alternatives: ["formulaReveal"],

  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["scientific", "contemplative", "awe"],

  tags: ["content", "orbit", "diagram", "svg", "solar-system", "black-hole", "cosmos-viridian"],

  complexity: "medium",
  performance: { cost: "low", notes: "SVG N 个 circle + N 个公转圆点；每帧更新 stroke-dashoffset 和圆点 cx/cy" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial for cosmos-viridian · 行星 / 黑洞分层" },
  ],

  params: {
    center: {
      type: "string",
      default: "太阳",
      semantic: "中心天体名称（图的主角，中间显示）",
    },
    centerColor: {
      type: "color",
      default: "#f3b95f",
      semantic: "中心天体颜色（默认暖金 = 恒星）",
    },
    orbits: {
      type: "array",
      default: [
        { name: "地球", radius: 0.22, period: 8.0, color: "#3ddc97" },
        { name: "火星", radius: 0.32, period: 12.0, color: "#b967ff" },
        { name: "木星", radius: 0.44, period: 18.0, color: "#5fb5ff" },
      ],
      semantic: "轨道数组，每项 {name, radius(0-0.5 相对画面高度), period(秒), color(hex)}",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const center = String(params.center || "太阳");
    const centerColor = params.centerColor || "#f3b95f";
    const orbitsRaw = Array.isArray(params.orbits) ? params.orbits : [];
    const orbits = orbitsRaw.slice(0, 6);

    const W = vp.width;
    const H = vp.height;

    // SVG viewBox 中心 (500, 500)，半径 base = 480
    const VB = 1000;
    const cx = VB / 2;
    const cy = VB / 2;

    // 中心天体 pop 0 → 0.6s（verb: pop）
    const pCenter = Math.min(Math.max(t / 0.6, 0), 1);
    const popC = pCenter < 0.7
      ? (pCenter / 0.7) * 1.15
      : 1.15 - ((pCenter - 0.7) / 0.3) * 0.15;
    const centerScale = Math.max(popC, 0.01);
    const centerOpacity = Math.min(pCenter / 0.3, 1);

    // 中心 breathe 循环 0.8s+（verb: breathe）
    const breatheStart = 0.8;
    const centerBreathe = t > breatheStart
      ? 1 + 0.04 * Math.sin((t - breatheStart) * Math.PI * 0.5)
      : 1;

    const finalCenterScale = centerScale * centerBreathe;

    // 轨道 stagger draw-in（verb: drawLine/reveal）
    const orbitEls = orbits.map((o, i) => {
      const delay = 0.3 + i * 0.18;
      const dur = 0.9;
      const p = Math.min(Math.max((t - delay) / dur, 0), 1);
      const ease = 1 - Math.pow(1 - p, 3);

      const r = Math.max(40, Math.min(0.5, Number(o.radius) || 0.25)) * VB;
      const circumference = 2 * Math.PI * r;
      const dashOffset = circumference * (1 - ease);
      const color = o.color || "#3ddc97";

      // 公转小星体（verb: orbit）
      const period = Math.max(2, Number(o.period) || 10);
      const appearDelay = delay + dur * 0.5;
      const pPlanet = t > appearDelay ? Math.min((t - appearDelay) / 0.4, 1) : 0;
      const planetOpacity = pPlanet;

      const angle = ((t / period) * Math.PI * 2) - Math.PI / 2; // 从顶部开始
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);

      // 图例 fly-in
      const labelDelay = delay + 0.2;
      const pLabel = Math.min(Math.max((t - labelDelay) / 0.5, 0), 1);
      const labelEase = 1 - Math.pow(1 - pLabel, 3);

      return {
        r, dashOffset, circumference, color,
        px, py, planetOpacity,
        name: String(o.name || ""),
        labelY: 180 + i * 72,
        labelOpacity: labelEase,
        labelX: -20 * (1 - labelEase),
      };
    });

    const size = Math.min(W, H) * 0.86;
    const svgSize = size;

    const orbitSvg = orbitEls.map(o => `
      <circle cx="${cx}" cy="${cy}" r="${o.r.toFixed(2)}"
        fill="none" stroke="${o.color}" stroke-width="1.5"
        stroke-opacity="0.55"
        stroke-dasharray="${o.circumference.toFixed(2)}"
        stroke-dashoffset="${o.dashOffset.toFixed(2)}" />
      <circle cx="${o.px.toFixed(2)}" cy="${o.py.toFixed(2)}" r="10"
        fill="${o.color}" opacity="${o.planetOpacity.toFixed(3)}"
        filter="url(#glow)" />
    `).join("");

    const legendHtml = orbitEls.map(o => `
      <div style="
        display: flex;
        align-items: center;
        gap: 14px;
        opacity: ${o.labelOpacity.toFixed(3)};
        transform: translateX(${o.labelX.toFixed(2)}px);
      ">
        <span style="
          display: inline-block;
          width: 12px; height: 12px; border-radius: 50%;
          background: ${o.color};
          box-shadow: 0 0 12px ${o.color};
        "></span>
        <span style="
          font: 500 22px/1.4 'SF Mono', 'JetBrains Mono', Consolas, monospace;
          color: rgba(234,244,242,.85);
          letter-spacing: 0.04em;
        ">${escapeHtml(o.name)}</span>
      </div>
    `).join("");

    host.innerHTML = `
      <div style="
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 1fr ${W*0.22}px;
        align-items: center;
        gap: ${W*0.03}px;
        padding: ${H*0.1}px ${W*0.08}px;
      ">
        <div style="
          display: flex;
          justify-content: center;
          align-items: center;
        ">
          <svg viewBox="0 0 ${VB} ${VB}" width="${svgSize.toFixed(0)}" height="${svgSize.toFixed(0)}" style="overflow: visible;">
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="${centerColor}" stop-opacity="1"/>
                <stop offset="60%" stop-color="${centerColor}" stop-opacity="0.85"/>
                <stop offset="100%" stop-color="${centerColor}" stop-opacity="0"/>
              </radialGradient>
            </defs>

            ${orbitSvg}

            <g transform="translate(${cx} ${cy}) scale(${finalCenterScale.toFixed(4)})" opacity="${centerOpacity.toFixed(3)}">
              <circle cx="0" cy="0" r="140" fill="url(#centerGrad)" />
              <circle cx="0" cy="0" r="42" fill="${centerColor}" filter="url(#glow)" />
            </g>

            <text x="${cx}" y="${cy + 210}" text-anchor="middle"
              fill="#eaf4f2" opacity="${centerOpacity.toFixed(3)}"
              font-family="system-ui, -apple-system, 'PingFang SC', sans-serif"
              font-size="36" font-weight="600"
              letter-spacing="1">${escapeHtml(center)}</text>
          </svg>
        </div>

        <div style="
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 20px;
        ">
          <div style="
            font: 500 14px/1.3 'SF Mono', 'JetBrains Mono', Consolas, monospace;
            color: rgba(234,244,242,.45);
            letter-spacing: 0.2em;
            text-transform: uppercase;
            margin-bottom: 8px;
          ">OBJECTS</div>
          ${legendHtml}
        </div>
      </div>
    `;
  },

  describe(t, params, vp) {
    const orbitsRaw = Array.isArray(params.orbits) ? params.orbits : [];
    const orbits = orbitsRaw.slice(0, 6);
    const lastDelay = 0.3 + (orbits.length - 1) * 0.18 + 0.9;
    const progress = Math.min(1, Math.max(0, t / lastDelay));
    return {
      sceneId: "orbitDiagram",
      phase: progress < 1 ? "enter" : "orbiting",
      progress,
      visible: true,
      params,
      elements: [
        { type: "center", role: "body", value: params.center, color: params.centerColor },
        ...orbits.map((o, i) => ({ type: "orbit", role: "path", index: i, name: o.name, radius: o.radius })),
        ...orbits.map((o, i) => ({ type: "planet", role: "body", index: i, name: o.name })),
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      center: "黑洞 M87*",
      centerColor: "#f3b95f",
      orbits: [
        { name: "视界 (EH)", radius: 0.12, period: 6.0, color: "#ff6b8b" },
        { name: "光子球", radius: 0.20, period: 9.0, color: "#b967ff" },
        { name: "ISCO", radius: 0.30, period: 14.0, color: "#3ddc97" },
        { name: "吸积盘外缘", radius: 0.44, period: 22.0, color: "#5fb5ff" },
      ],
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
