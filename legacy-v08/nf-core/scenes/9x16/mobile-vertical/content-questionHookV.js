// content-questionHookV.js — F1: 顶部大红问号 + 下方 3 张痛点卡片堆叠
export default {
  id: "questionHookV",
  name: "questionHookV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "竖屏 Hook：顶部大红问号 + 3 张痛点卡片纵向堆叠，移动端开场用",
  duration_hint: 7,
  intent: "竖屏开场用大红问号锚定注意力，3 张痛点卡片纵向堆叠制造情绪共鸣。问号 t=0 即可见，卡片 stagger 0.1s 依次浮现。",
  when_to_use: ["竖屏视频开头","快速建立痛点共鸣"],
  when_not_to_use: ["内容深度讲解阶段"],
  limitations: ["痛点文字不超过 12 字/条","3 张卡片固定"],
  inspired_by: "抖音开场大标题 + Kurzgesagt 问号",
  used_in: [],
  requires: [],
  pairs_well_with: ["brandTitleV"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["intense", "serious"],
  tags: ["hook", "problem", "question", "content", "mobile-vertical"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure HTML/CSS" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    question:  { type: "string", default: "你的信息还在用 PPT 传播吗？", semantic: "主问题文字" },
    pain1:     { type: "string", default: "制作耗时 3 小时起",           semantic: "痛点1" },
    pain2:     { type: "string", default: "排版混乱看不懂",               semantic: "痛点2" },
    pain3:     { type: "string", default: "观众划走率 80%",               semantic: "痛点3" },
    bgColor:   { type: "color",  default: "#ffffff",                      semantic: "背景色" },
  },
  sample() {
    return { question: "你的信息还在用 PPT 传播吗？", pain1: "制作耗时 3 小时起", pain2: "排版混乱看不懂", pain3: "观众划走率 80%", bgColor: "#ffffff" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const W = vp.width, H = vp.height;
    // entry: opacity ≥ 0.9 at t=0
    const entry = (delay = 0, dur = 0.2) => 0.9 + 0.1 * easeOut(clamp((t - delay) / dur, 0, 1));
    const ty = (delay = 0, dur = 0.2) => 8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const k0 = entry(0, 0.2);
    const k1 = entry(0.1, 0.2);
    const k2 = entry(0.2, 0.2);
    const k3 = entry(0.3, 0.2);
    // persistent breathe + glow pulse
    const breathe = 1 + 0.008 * Math.sin(t * Math.PI * 0.8);
    const glowPulse = 0.5 + 0.5 * Math.sin(t * 1.2);
    const card = (text, k, yOff, color) => `
      <div style="opacity:${k};transform:translateY(${yOff}px);transition:none;
                  background:${color};border-radius:20px;padding:32px 40px;margin:0 0 24px 0;
                  border-left:8px solid #ef4444;">
        <div style="font:600 44px/1.3 Inter,'PingFang SC',sans-serif;color:#1f2937;">${esc(text)}</div>
      </div>`;
    return `
      <div style="position:absolute;inset:0;background:${params.bgColor || '#ffffff'};
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="opacity:${k0};transform:scale(${breathe * (0.97 + 0.03*easeOut(clamp(t/0.25,0,1)))});
                    font:900 200px/1 Inter,'PingFang SC',sans-serif;color:#ef4444;margin-bottom:48px;
                    text-shadow:0 0 ${40+30*glowPulse}px rgba(239,68,68,${0.3+0.3*glowPulse});">?</div>
        <div style="font:700 72px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    text-align:center;margin-bottom:56px;opacity:${k0};transform:translateY(${ty(0,0.2)}px);">${esc(params.question || "")}</div>
        ${card(params.pain1 || "", k1, ty(0.1,0.2), "#fff7f7")}
        ${card(params.pain2 || "", k2, ty(0.2,0.2), "#fff7f7")}
        ${card(params.pain3 || "", k3, ty(0.3,0.2), "#fff7f7")}
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "questionHookV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.7),
      visible: true, params,
      elements: [
        { type: "question", role: "headline", value: params.question || "" },
        { type: "pain", role: "card", value: params.pain1 || "" },
        { type: "pain", role: "card", value: params.pain2 || "" },
        { type: "pain", role: "card", value: params.pain3 || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
