// content-brandTitleV.js — F2: "Next" + "Frame" 纵向层叠 + 副标题
export default {
  id: "brandTitleV",
  name: "brandTitleV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "品牌标题竖屏：Next + Frame 纵向大字层叠，副标题换行居中",
  duration_hint: 7,
  intent: "竖屏品牌展示需要垂直分层。Next 上行强调色，Frame 下行黑色，形成品牌识别的视觉节拍。入场 opacity ≥ 0.9，持续光晕呼吸避免静态屏。",
  when_to_use: ["产品介绍第一帧","品牌 reveal"],
  when_not_to_use: ["中间过渡"],
  limitations: ["单词不超过 8 字/行"],
  inspired_by: "抖音品牌大字 + Apple 发布大字幕",
  used_in: [],
  requires: [],
  pairs_well_with: ["questionHookV"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "intense"],
  tags: ["brand", "title", "hero", "content", "mobile-vertical"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure CSS text" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    line1:    { type: "string", default: "Next",           semantic: "品牌第一行" },
    line2:    { type: "string", default: "Frame",          semantic: "品牌第二行" },
    subtitle: { type: "string", default: "AI 视频引擎",    semantic: "副标题" },
    tagline:  { type: "string", default: "输入 JSON，输出视频", semantic: "标语" },
    acColor:  { type: "color",  default: "#2563eb",        semantic: "强调色" },
  },
  sample() {
    return { line1: "Next", line2: "Frame", subtitle: "AI 视频引擎", tagline: "输入 JSON，输出视频", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const entry = (delay = 0, dur = 0.2) => 0.9 + 0.1 * easeOut(clamp((t - delay) / dur, 0, 1));
    const tyUp = (delay = 0, dur = 0.2) => -8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const tyDn = (delay = 0, dur = 0.2) => 8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const k1 = entry(0, 0.2);
    const k2 = entry(0.1, 0.2);
    const k3 = entry(0.2, 0.2);
    const ac = params.acColor || "#2563eb";
    // persistent breathe + glow
    const breathe = 1 + 0.006 * Math.sin(t * Math.PI * 0.7);
    const glowPulse = 0.5 + 0.5 * Math.sin(t * 1.3);
    return `
      <div style="position:absolute;inset:0;background:#ffffff;
                  display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="opacity:${k1};transform:translateY(${tyUp(0,0.2)}px) scale(${breathe});
                    font:900 180px/1.0 Inter,'PingFang SC',sans-serif;color:${ac};
                    letter-spacing:-4px;margin-bottom:-12px;
                    text-shadow:0 0 ${30+20*glowPulse}px rgba(37,99,235,${0.2+0.2*glowPulse});">${esc(params.line1 || "")}</div>
        <div style="opacity:${k2};transform:translateY(${tyDn(0.1,0.2)}px) scale(${breathe});
                    font:900 180px/1.0 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    letter-spacing:-4px;margin-bottom:60px;">${esc(params.line2 || "")}</div>
        <div style="opacity:${k3};transform:translateY(${tyDn(0.2,0.2)}px);text-align:center;">
          <div style="font:700 72px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;margin-bottom:24px;">
            ${esc(params.subtitle || "")}</div>
          <div style="font:400 44px/1.5 Inter,'PingFang SC',sans-serif;color:#6b7280;">
            ${esc(params.tagline || "")}</div>
        </div>
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "brandTitleV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.7),
      visible: true, params,
      elements: [
        { type: "brand", role: "headline", value: (params.line1 || "") + (params.line2 || "") },
        { type: "subtitle", role: "support", value: params.subtitle || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
