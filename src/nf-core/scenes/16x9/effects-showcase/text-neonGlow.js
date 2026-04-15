// scenes/16x9/effects-showcase/text-neonGlow.js
//
// neonGlow — SVG feGaussianBlur + feMerge 多层霓虹辉光文字
// 真·霓虹管：3 层不同 stdDeviation 的辉光合并 + t-driven flicker。

export default {
  id: "neonGlow",
  name: "neonGlow",
  version: "1.0.0",

  ratio: "16:9",
  theme: "effects-showcase",
  role: "text",

  description: "SVG feGaussianBlur 三层辉光叠加 + feMerge 合成 — 真·霓虹管文字带 t-driven 闪烁",
  duration_hint: null,

  type: "svg",
  frame_pure: false,
  assets: [],

  intent: `霓虹效果不是「文字加 text-shadow」就完事了。真正的 Awwwards 级霓虹是 SVG 滤镜链：feGaussianBlur stdDeviation=2.5（内核近距），叠 stdDeviation=8（中层光晕），叠 stdDeviation=22（远距空气散射），三层用 feMerge 按从远到近顺序合成，最上面才是原始白色文字。这给的层次感是 CSS text-shadow 永远做不到的 — text-shadow 是单层叠几次都是同一种发散，没有深度。再加上 t-driven flicker：用低频噪声生成 0.85↔1.0 的 opacity 抖动（10Hz），模拟旧霓虹管气体不稳定。底色辉光走 cyan，可换 magenta/violet。情绪节点：金句段（结尾 3s 收尾）serif italic 大字定格，或开场 H1 砸脸。`,

  when_to_use: [
    "片头大字砸脸（H1 ≥ 96px）",
    "金句收尾定格",
    "章节标题需要冲击感的镜头",
  ],

  when_not_to_use: [
    "正文 / 字幕（辉光会糊成一团）",
    "字数 > 16（辉光占空间，挤出安全区）",
  ],

  limitations: [
    "字号 < 64px 辉光看不清，没意义",
    "中文字符建议 ≤ 8 字",
  ],

  inspired_by: "Vegas 招牌 + Blade Runner 2049 字幕 + Linear changelog 大字",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-liquidNoise", "content-particleField", "overlay-glitch"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "top",
  mood: ["cinematic", "neon", "punk", "futuristic"],

  tags: ["text", "neon", "glow", "svg-filter", "effects-showcase"],

  complexity: "medium",
  performance: { cost: "low", notes: "三层 feGaussianBlur，1080p 流畅" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — true 3-layer SVG neon" },
  ],

  params: {
    text: {
      type: "string",
      default: "VISION 2.0",
      semantic: "霓虹文字内容，建议 ≤ 16 字符 / ≤ 8 中文字",
    },
    color: {
      type: "color",
      default: "#00f0ff",
      semantic: "霓虹颜色，cyan/magenta/violet/yellow/green",
    },
    sub: {
      type: "string",
      default: "",
      semantic: "副标 mono 小字（可选）",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const text = String(params.text || "VISION 2.0");
    const sub = String(params.sub || "");
    const color = params.color || "#00f0ff";

    const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 入场：letter-spacing 收紧 + opacity
    const enterDur = 1.0;
    const ep = Math.min(t / enterDur, 1);
    const easedEnter = 1 - Math.pow(1 - ep, 4);
    const opacity = easedEnter;
    const tracking = 40 * (1 - easedEnter); // px

    // Flicker：旧霓虹管气体不稳，10Hz 低频噪声
    // 用伪随机：sin(t * 频率 + 相位) 多个叠加
    const f1 = Math.sin(t * 11.3 + 1.2);
    const f2 = Math.sin(t * 7.7 + 3.1);
    const f3 = Math.sin(t * 23.1 + 0.4);
    const flickerNoise = (f1 + f2 * 0.5 + f3 * 0.3) / 1.8;
    // 大部分时间 1.0，偶发掉到 0.7
    const flickerOpacity = flickerNoise > 0.6 ? 0.72 : 1.0;
    // 慢 breathe
    const breathe = 0.92 + 0.08 * Math.sin((t / 3) * Math.PI * 2);
    const finalOpacity = opacity * flickerOpacity * breathe;

    // 字号缩放 viewport-relative
    const fontSize = Math.min(W * 0.075, H * 0.16);
    const subSize = Math.max(16, fontSize * 0.16);

    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;display:block;">
        <defs>
          <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
            <!-- 远距大气散射 -->
            <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="far"/>
            <!-- 中层光晕 -->
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="mid"/>
            <!-- 近距内核 -->
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="near"/>
            <feMerge>
              <feMergeNode in="far"/>
              <feMergeNode in="far"/>
              <feMergeNode in="mid"/>
              <feMergeNode in="near"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <g opacity="${finalOpacity.toFixed(3)}" filter="url(#neon)">
          <text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="middle"
                font-family="system-ui, -apple-system, 'PingFang SC', sans-serif"
                font-weight="800"
                font-size="${fontSize.toFixed(2)}"
                letter-spacing="${tracking.toFixed(2)}"
                fill="${color}">
            ${safe(text)}
          </text>
        </g>

        <!-- 内核白：完全不糊，提高可读性 -->
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="middle"
              font-family="system-ui, -apple-system, 'PingFang SC', sans-serif"
              font-weight="800"
              font-size="${fontSize.toFixed(2)}"
              letter-spacing="${tracking.toFixed(2)}"
              fill="#eaf2ff"
              opacity="${(opacity * 0.92).toFixed(3)}">
          ${safe(text)}
        </text>

        ${sub ? `
        <text x="${W / 2}" y="${H / 2 + fontSize * 0.7}" text-anchor="middle"
              font-family="'SF Mono', 'JetBrains Mono', Consolas, monospace"
              font-size="${subSize.toFixed(2)}"
              letter-spacing="6"
              fill="${color}"
              opacity="${(opacity * 0.65 * breathe).toFixed(3)}">
          ${safe(sub)}
        </text>` : ""}
      </svg>
    `;
  },

  describe(t, params, vp) {
    return {
      sceneId: "neonGlow",
      phase: t < 1.0 ? "enter" : "show",
      progress: Math.min(1, t / 1.0),
      visible: true,
      params,
      elements: [
        { type: "neon-text", role: "headline", value: params.text || "", color: params.color || "#00f0ff" },
        { type: "filter", role: "neon-3layer", layers: [22, 8, 2.5] },
      ],
      boundingBox: { x: 0, y: vp.height * 0.35, w: vp.width, h: vp.height * 0.3 },
    };
  },

  sample() {
    return {
      text: "AI VISION 2.0",
      sub: "// SHADER-NATIVE",
      color: "#00f0ff",
    };
  },
};
