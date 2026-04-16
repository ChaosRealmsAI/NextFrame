// scenes/16x9/blueprint-cinema/content-brandTitle.js
// F2: NextFrame hero — mesh bg + multi-halo blob + grain + cinematic title
export default {
  id: "brandTitle",
  name: "Brand Title",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "产品大标题 hero：conic mesh 背景 + 橙蓝双色 blob halo + grain texture + gradient fill text",
  duration_hint: 8,
  intent: "hero 级品牌 reveal。conic-gradient mesh + 2 个 blur blob（橙红左下、蓝色右上）制造 depth，主标题用 linear-gradient text fill + 多层 drop-shadow。letter-spacing -0.04em 收紧字距，副标题细字距 +0.2em 制造现代感。微 hue-rotate 呼吸让画面活。",
  when_to_use: ["产品介绍第一帧","品牌reveal时刻"],
  when_not_to_use: ["中间过渡场景"],
  limitations: ["品牌名不超过16字"],
  inspired_by: "Apple发布会 + Stripe首屏 mesh + Arc Browser blob halo",
  used_in: [],
  requires: [],
  pairs_well_with: ["questionHook"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "intense", "cinematic"],
  tags: ["brand", "title", "hero", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "conic mesh + blur blobs + grain" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards visual upgrade: mesh + halo + gradient text + grain" },
  ],
  params: {
    brand: { type: "string", default: "NextFrame", semantic: "品牌名" },
    tagline: { type: "string", default: "JSON 进来，MP4 出去", semantic: "副标题" },
    sub: { type: "string", default: "AI 视频引擎 · 开源 · 可编程", semantic: "说明文字" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const k1 = entry(0, 0.3), k2 = entry(0.15, 0.22), k3 = entry(0.3, 0.22);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    const breathe = 1 + 0.01 * Math.sin(t * Math.PI * 0.6);
    const hue = 6 * Math.sin(t * 0.7);
    const blob1Rot = t * 4;
    const blob2Rot = -t * 3;
    const brand = params.brand || "NextFrame";
    const tagline = params.tagline || "JSON 进来，MP4 出去";
    const sub = params.sub || "AI 视频引擎 · 开源 · 可编程";

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.15;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n2"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n2)"/></svg>`;

    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 90% 70% at 50% 50%,rgba(255,107,53,0.08),transparent 65%),
        conic-gradient(from ${t*8}deg at 50% 50%,#0a1628,#0f1d3a,#0a1628,#071322,#0a1628);
        overflow:hidden;">
        <div style="position:absolute;left:-10%;bottom:-15%;width:65%;height:75%;border-radius:50%;
          background:radial-gradient(circle,rgba(255,107,53,0.7),rgba(255,107,53,0.15) 45%,transparent 70%);
          filter:blur(60px) hue-rotate(${hue}deg);transform:rotate(${blob1Rot}deg);opacity:${0.6+0.15*pulse};"></div>
        <div style="position:absolute;right:-12%;top:-18%;width:55%;height:70%;border-radius:50%;
          background:radial-gradient(circle,rgba(88,166,255,0.55),rgba(88,166,255,0.1) 45%,transparent 70%);
          filter:blur(70px) hue-rotate(${-hue}deg);transform:rotate(${blob2Rot}deg);opacity:${0.5+0.2*pulse};"></div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
          <div style="opacity:${k1};transform:scale(${breathe * (0.985 + 0.015*eo(Math.min(1,t/0.3)))});position:relative;">
            <div style="font:800 ${Math.round(W*0.085)}px/1.05 Inter,'PingFang SC',system-ui,sans-serif;
              letter-spacing:-0.045em;
              background:linear-gradient(135deg,#ff8a5c 0%,#ff6b35 50%,#ff5519 100%);
              -webkit-background-clip:text;background-clip:text;color:transparent;
              filter:drop-shadow(0 0 ${40+30*pulse}px rgba(255,107,53,${0.55+0.25*pulse})) drop-shadow(0 8px 24px rgba(0,0,0,0.6));">${brand}</div>
          </div>
          <div style="opacity:${k2};transform:translateY(${ty(0.15,0.22)}px);margin-top:${H*0.035}px;">
            <div style="font:600 ${Math.round(W*0.032)}px/1.2 Inter,'PingFang SC',system-ui,sans-serif;
              color:#f5f2e8;letter-spacing:-0.01em;text-shadow:0 2px 24px rgba(0,0,0,0.5);">${tagline}</div>
          </div>
          <div style="opacity:${k3};transform:translateY(${ty(0.3,0.22)}px);margin-top:${H*0.028}px;">
            <div style="font:400 ${Math.round(W*0.017)}px/1.4 Inter,'PingFang SC',system-ui,sans-serif;
              color:#8b92a5;letter-spacing:0.22em;text-transform:uppercase;">${sub}</div>
          </div>
          <div style="opacity:${k3};margin-top:${H*0.05}px;width:${W*0.06}px;height:1px;
            background:linear-gradient(90deg,transparent,rgba(255,107,53,0.8),transparent);"></div>
        </div>
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "brandTitle", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "headline", role: "brand", value: params.brand || "" },
        { type: "subtitle", role: "tagline", value: params.tagline || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { brand: "NextFrame", tagline: "JSON 进来，MP4 出去", sub: "AI 视频引擎 · 开源 · 可编程" };
  },
};
