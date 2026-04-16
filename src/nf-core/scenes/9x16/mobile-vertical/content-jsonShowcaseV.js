// content-jsonShowcaseV.js — F3: 上半 JSON 代码块 + 下半 9:16 手机预览框
export default {
  id: "jsonShowcaseV",
  name: "jsonShowcaseV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "JSON 输入展示：上半代码块 + 下半手机预览缩略框",
  duration_hint: 8,
  params: {
    title:   { type: "string", default: "写 JSON", semantic: "标题" },
    code:    { type: "string", default: '{\n  "scene": "titleCard",\n  "text": "Hello",\n  "duration": 5\n}', semantic: "代码内容" },
    preview: { type: "string", default: "→ 视频",  semantic: "预览标签" },
    acColor: { type: "color",  default: "#2563eb", semantic: "强调色" },
  },
  sample() {
    return { title: "写 JSON", code: '{\n  "scene": "titleCard",\n  "text": "Hello",\n  "duration": 5\n}', preview: "→ 视频", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const k = easeOut(clamp(t / 0.6, 0, 1));
    const k2 = easeOut(clamp((t - 0.4) / 0.5, 0, 1));
    const ac = params.acColor || "#2563eb";
    const codeLines = (params.code || "").split("\n").map((l, i) =>
      `<div style="margin:0;color:${i===0?"#e06c75":i>0&&i<4?"#98c379":"#abb2bf"}">${esc(l)}</div>`
    ).join("");
    return `
      <div style="position:absolute;inset:0;background:#f8f9fa;
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="font:700 72px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    margin-bottom:40px;opacity:${k};text-align:center;">${esc(params.title || "")}</div>
        <div style="width:100%;background:#282c34;border-radius:20px;padding:40px;margin-bottom:48px;
                    opacity:${k};transform:translateY(${(1-k)*30}px);">
          <div style="font:500 32px/1.8 'Courier New',monospace;word-break:break-all;">${codeLines}</div>
        </div>
        <div style="opacity:${k2};transform:translateY(${(1-k2)*30}px);
                    width:200px;height:360px;background:#1f2937;border-radius:24px;
                    border:6px solid ${ac};display:flex;align-items:center;justify-content:center;">
          <div style="font:700 40px/1.2 Inter,'PingFang SC',sans-serif;color:#fff;text-align:center;">
            ${esc(params.preview || "→ 视频")}</div>
        </div>
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "jsonShowcaseV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.6),
      visible: true, params,
      elements: [
        { type: "title", role: "headline", value: params.title || "" },
        { type: "code", role: "content", value: params.code || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
