// scenes/_examples/scene-dom-card.js — minimal dom scene skeleton (AI reads, copies, adapts)

export default {
  id: "exampleCard",
  name: "exampleCard",
  version: "1.0.0",
  ratio: "16:9",
  theme: "_examples",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "最小 dom 组件样例 — 居中标题卡片，t-driven 淡入。",
  duration_hint: null,
  params: {
    title:    { type: "string", required: true,       semantic: "主标题" },
    subtitle: { type: "string", default: "",          semantic: "副标题（可选）" },
    bgColor:  { type: "color",  default: "#2563eb",   semantic: "背景渐变基准色" },
  },
  sample() {
    return { title: "Hello", subtitle: "World", bgColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeInOut = (x) => x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2) / 2;
    const title = esc(params.title || "");
    const subtitle = esc(params.subtitle || "");
    const bg = params.bgColor || "#2563eb";
    const k = easeInOut(clamp(t / 0.6, 0, 1));
    const opacity = k;
    const ty = (1 - k) * 24;
    const W = vp.width, H = vp.height;
    return `
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                  background:radial-gradient(ellipse at center, ${bg} 0%, #0a0a0a 100%);">
        <div style="text-align:center;color:#fff;opacity:${opacity};transform:translateY(${ty}px);
                    padding:${H*0.06}px ${W*0.08}px;max-width:${W*0.7}px;">
          <div style="font:700 ${Math.round(W*0.05)}px/1.2 system-ui,-apple-system,sans-serif;margin-bottom:16px;">${title}</div>
          ${subtitle ? `<div style="font:400 ${Math.round(W*0.022)}px/1.4 system-ui,-apple-system,sans-serif;opacity:0.75;">${subtitle}</div>` : ""}
        </div>
      </div>
    `;
  },
  describe(t, params, vp) {
    const k = Math.min(1, Math.max(0, t / 0.6));
    return {
      sceneId: "exampleCard",
      phase: k < 1 ? "enter" : "show",
      progress: k,
      visible: true,
      params,
      elements: [
        { type: "title", role: "headline", value: params.title || "" },
        ...(params.subtitle ? [{ type: "subtitle", role: "support", value: params.subtitle }] : []),
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
