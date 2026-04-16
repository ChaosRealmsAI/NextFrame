// scenes/16x9/blueprint-cinema/content-questionHook.js
// F1: 红问号 + 3 痛点卡 — awwwards 级：radial mesh bg + glass cards + grain + halo
export default {
  id: "questionHook",
  name: "Question Hook",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "开场红问号大字配3个痛点卡片，radial mesh 背景 + 玻璃质感卡片 + grain",
  duration_hint: 8,
  intent: "awwwards 级视觉：深蓝 radial mesh 背景打底，橙色 blur halo 包裹问号制造 glow，3 张痛点卡使用 backdrop-filter glass + 3 层 shadow depth。问号 hue-rotate 微呼吸，grain SVG noise 叠在顶层制造胶片质感。",
  when_to_use: ["视频开头，快速建立共鸣","展示问题清单场景"],
  when_not_to_use: ["内容详解阶段（用jsonShowcase代替）"],
  limitations: ["卡片文字不超过12字/条"],
  inspired_by: "Stripe gradient mesh + Linear glassmorphism + Arc blob halo",
  used_in: [],
  requires: [],
  pairs_well_with: ["brandTitle"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["intense", "serious", "cinematic"],
  tags: ["hook", "problem", "question", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "backdrop-filter + SVG grain" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards-level visual upgrade: mesh bg + glass cards + halo + grain" },
  ],
  params: {
    question: { type: "string", default: "想做视频，但 AI 不会？", semantic: "大问号标题" },
    pain1: { type: "string", default: "不知道该讲什么顺序", semantic: "痛点1" },
    pain2: { type: "string", default: "做完效果不够专业", semantic: "痛点2" },
    pain3: { type: "string", default: "每次都要重新发明轮子", semantic: "痛点3" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const q = entry(0, 0.25), c1 = entry(0.12, 0.2), c2 = entry(0.24, 0.2), c3 = entry(0.36, 0.2);
    const breathe = 1 + 0.012 * Math.sin(t * Math.PI * 0.7);
    const hue = Math.sin(t * 0.8) * 8;
    const haloScale = 1 + 0.08 * Math.sin(t * 1.1);
    const haloOp = 0.55 + 0.2 * Math.sin(t * 1.3);
    const question = params.question || "想做视频，但 AI 不会？";
    const pains = [params.pain1 || "不知道该讲什么顺序", params.pain2 || "做完效果不够专业", params.pain3 || "每次都要重新发明轮子"];
    const opacities = [c1, c2, c3];

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.18;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n1"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0"/></filter><rect width="100%" height="100%" filter="url(#n1)"/></svg>`;

    const cardsHtml = pains.map((text, i) => `<div style="opacity:${opacities[i]};transform:translateY(${ty(0.12 + i*0.12, 0.2)}px);
      background:linear-gradient(135deg,rgba(255,107,53,0.14),rgba(88,166,255,0.06));
      border:1px solid rgba(255,107,53,0.32);border-radius:14px;
      padding:${H*0.028}px ${W*0.028}px;margin-bottom:${H*0.02}px;
      backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);
      box-shadow:0 2px 0 rgba(255,255,255,0.06) inset,0 24px 48px -16px rgba(255,107,53,0.28),0 48px 96px -32px rgba(0,0,0,0.5);
      font:500 ${Math.round(W*0.019)}px/1.4 Inter,'PingFang SC',system-ui,sans-serif;
      color:#f5f2e8;letter-spacing:0.2px;display:flex;align-items:center;gap:${W*0.012}px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#ff6b35;box-shadow:0 0 16px #ff6b35,0 0 32px rgba(255,107,53,0.6);flex-shrink:0;"></span>${text}</div>`).join('');

    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 70% 55% at 22% 50%,rgba(255,107,53,0.22),transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 40%,rgba(88,166,255,0.14),transparent 65%),
        radial-gradient(ellipse 100% 100% at 50% 100%,#06101f,#0a1628 40%,#0a1628);overflow:hidden;">
        <div style="position:absolute;left:${W*0.08}px;top:50%;transform:translateY(-50%) scale(${haloScale});
          width:${H*0.7}px;height:${H*0.7}px;border-radius:50%;
          background:radial-gradient(circle,rgba(255,107,53,0.5),rgba(255,107,53,0.1) 50%,transparent 70%);
          filter:blur(40px) hue-rotate(${hue}deg);opacity:${haloOp};pointer-events:none;"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;padding:0 ${W*0.08}px;">
          <div style="display:flex;align-items:center;gap:${W*0.06}px;width:100%;">
            <div style="opacity:${q};transform:scale(${breathe});flex-shrink:0;position:relative;
              font:800 ${Math.round(H*0.5)}px/1 Inter,system-ui,sans-serif;
              color:#ff6b35;letter-spacing:-0.04em;
              text-shadow:0 0 ${60 + 30*Math.sin(t*1.2)}px rgba(255,107,53,0.8),0 0 120px rgba(255,107,53,0.4),0 8px 40px rgba(0,0,0,0.6);
              filter:hue-rotate(${hue}deg);">?</div>
            <div style="flex:1;">
              <div style="opacity:${q};transform:translateY(${ty(0, 0.2)}px);
                font:700 ${Math.round(W*0.034)}px/1.15 Inter,'PingFang SC',system-ui,sans-serif;
                color:#f5f2e8;margin-bottom:${H*0.045}px;letter-spacing:-0.5px;
                text-shadow:0 2px 20px rgba(0,0,0,0.5);">${question}</div>
              ${cardsHtml}
            </div>
          </div>
        </div>
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "questionHook", phase: t < 0.7 ? "enter" : "show",
      progress: Math.min(1, t / 0.7), visible: true, params,
      elements: [
        { type: "headline", role: "question", value: params.question || "" },
        { type: "card", role: "pain1", value: params.pain1 || "" },
        { type: "card", role: "pain2", value: params.pain2 || "" },
        { type: "card", role: "pain3", value: params.pain3 || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      question: "想做视频，但 AI 不会？",
      pain1: "不知道该讲什么顺序",
      pain2: "做完效果不够专业",
      pain3: "每次都要重新发明轮子",
    };
  },
};
