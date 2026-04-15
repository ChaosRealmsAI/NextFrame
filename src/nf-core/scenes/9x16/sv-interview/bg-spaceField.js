// scenes/9x16/sv-interview/bg-spaceField.js
//
// 深空底 - 深蓝黑渐变 + 顶部蓝辉光 + 星点微粒，硅谷访谈统一底色

export default {
  // ===== Identity =====
  id: "spaceField",
  name: "深空底",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "9:16",
  theme: "sv-interview",
  role: "bg",

  // ===== Semantics =====
  description: "深蓝黑渐变 + 顶部蓝辉光 + 星点微粒，硅谷访谈统一底色",
  duration_hint: null,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    硅谷访谈的基调底——深空蓝不是黑（#0a0e1a 而不是 #000），是因为纯黑会让观众觉得冷硬，
    深蓝夜色让"凌晨刷短视频"的观众感到沉浸而不压抑。
    顶部加一层 radial 蓝辉光（#4da6ff 6%）暗示"科技频道直播条"的权威感，
    随机星点（seed-based，frame_pure）制造"银河系某个数据中心"的质感，
    信息密度主导——底层只留态度，不抢字幕和视频画面的注意力。
  `,

  when_to_use: [
    "所有 clip slide / bridge slide 的 z=0 底层",
    "需要统一视觉底色的任何硅谷访谈 9:16 视频",
  ],

  when_not_to_use: [
    "封面/片尾全屏金句——该场景用纯金句 serif 大字卡更合适，底色换成偏亮深蓝",
    "需要强对比 vlog 场景——星点和辉光会削弱主体",
  ],

  limitations: [
    "星点数量固定由 starDensity 控制，不随时间动",
    "辉光固定顶部 0..40% — 如果字幕上移进入该区域会轻微叠加蓝色调",
  ],

  inspired_by: "Bloomberg Technology 深蓝演播室背景 + Lex Fridman Podcast 官方剪辑的暗夜感",
  used_in: ["硅谷访谈 E01 Dario Amodei"],

  requires: [],
  pairs_well_with: ["content-videoArea", "text-bilingualSub", "chrome-sourceBar"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "light",
  z_layer: "background",
  mood: ["calm", "professional", "tech"],

  tags: ["bg", "background", "space", "dark", "blue", "gradient", "starfield", "sv-interview"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM with inline SVG star dots; one paint, no animation" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — radial glow + seed-based stars" },
  ],

  // ===== Params =====
  params: {
    glowStrength: {
      type: "number",
      default: 0.06,
      semantic: "顶部辉光 alpha 强度，0..0.15",
    },
    starDensity: {
      type: "number",
      default: 40,
      semantic: "星点数量，推荐 20..60",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const glow = typeof params.glowStrength === "number" ? params.glowStrength : 0.06;
    const n = Math.max(0, Math.min(80, Math.round(params.starDensity || 40)));
    // Deterministic star positions (seeded PRNG, frame_pure)
    const stars = [];
    let seed = 1337;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (let i = 0; i < n; i++) {
      const x = rnd() * vp.width;
      const y = rnd() * vp.height;
      const r = 0.6 + rnd() * 1.2;
      const a = 0.04 + rnd() * 0.10;
      stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="rgba(232,237,245,${a.toFixed(2)})" />`);
    }
    host.innerHTML = `
      <div style="
        position:absolute;left:0;top:0;
        width:${vp.width}px;height:${vp.height}px;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(77,166,255,${glow}) 0%, rgba(77,166,255,0) 55%),
          radial-gradient(ellipse at 50% 50%, #0f1428 0%, #0a0e1a 70%),
          #0a0e1a;
      ">
        <svg xmlns="http://www.w3.org/2000/svg"
             width="${vp.width}" height="${vp.height}"
             viewBox="0 0 ${vp.width} ${vp.height}"
             style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;">
          ${stars.join("")}
        </svg>
        <div style="
          position:absolute;inset:0;
          background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.4) 100%);
          pointer-events:none;
        "></div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "spaceField",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "layer", role: "gradient", value: "deep-space #0a0e1a" },
        { type: "layer", role: "glow", value: `top-blue a=${params.glowStrength || 0.06}` },
        { type: "particles", role: "stars", value: params.starDensity || 40 },
        { type: "layer", role: "vignette", value: "rgba(0,0,0,.4)" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { glowStrength: 0.06, starDensity: 40 };
  },
};
