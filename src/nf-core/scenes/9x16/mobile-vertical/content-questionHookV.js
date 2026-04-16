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
    const k0 = easeOut(clamp(t / 0.5, 0, 1));
    const k1 = easeOut(clamp((t - 0.3) / 0.5, 0, 1));
    const k2 = easeOut(clamp((t - 0.5) / 0.5, 0, 1));
    const k3 = easeOut(clamp((t - 0.7) / 0.5, 0, 1));
    const card = (text, k, color) => `
      <div style="opacity:${k};transform:translateY(${(1-k)*40}px);transition:none;
                  background:${color};border-radius:20px;padding:32px 40px;margin:0 0 24px 0;
                  border-left:8px solid #ef4444;">
        <div style="font:600 44px/1.3 Inter,'PingFang SC',sans-serif;color:#1f2937;">${esc(text)}</div>
      </div>`;
    return `
      <div style="position:absolute;inset:0;background:${params.bgColor || '#ffffff'};
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="opacity:${k0};transform:scale(${0.5 + k0*0.5});
                    font:900 200px/1 Inter,'PingFang SC',sans-serif;color:#ef4444;margin-bottom:48px;">?</div>
        <div style="font:700 72px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    text-align:center;margin-bottom:56px;opacity:${k0};">${esc(params.question || "")}</div>
        ${card(params.pain1 || "", k1, "#fff7f7")}
        ${card(params.pain2 || "", k2, "#fff7f7")}
        ${card(params.pain3 || "", k3, "#fff7f7")}
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
