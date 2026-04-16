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
    const k1 = easeOut(clamp(t / 0.5, 0, 1));
    const k2 = easeOut(clamp((t - 0.2) / 0.5, 0, 1));
    const k3 = easeOut(clamp((t - 0.5) / 0.5, 0, 1));
    const ac = params.acColor || "#2563eb";
    return `
      <div style="position:absolute;inset:0;background:#ffffff;
                  display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="opacity:${k1};transform:translateY(${(1-k1)*-40}px);
                    font:900 180px/1.0 Inter,'PingFang SC',sans-serif;color:${ac};
                    letter-spacing:-4px;margin-bottom:-12px;">${esc(params.line1 || "")}</div>
        <div style="opacity:${k2};transform:translateY(${(1-k2)*40}px);
                    font:900 180px/1.0 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    letter-spacing:-4px;margin-bottom:60px;">${esc(params.line2 || "")}</div>
        <div style="opacity:${k3};transform:translateY(${(1-k3)*24}px);text-align:center;">
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
