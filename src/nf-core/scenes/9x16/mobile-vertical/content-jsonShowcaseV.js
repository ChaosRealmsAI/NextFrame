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
  intent: "竖屏用上下分区展示 JSON 输入 → 视频输出。上方代码块逐行着色，下方手机预览框有持续边框呼吸，强调『输入即所得』。",
  when_to_use: ["展示 JSON 到视频的转换"],
  when_not_to_use: ["纯文字场景"],
  limitations: ["代码行不超过 10 行"],
  inspired_by: "Fireship 代码演示",
  used_in: [],
  requires: [],
  pairs_well_with: ["timelineV"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "serious"],
  tags: ["code", "json", "demo", "content", "mobile-vertical"],
  complexity: "medium",
  performance: { cost: "low", notes: "text only" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
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
    const entry = (delay = 0, dur = 0.2) => 0.9 + 0.1 * easeOut(clamp((t - delay) / dur, 0, 1));
    const ty = (delay = 0, dur = 0.2) => 8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const k = entry(0, 0.2);
    const kCode = entry(0.1, 0.2);
    const k2 = entry(0.25, 0.2);
    const ac = params.acColor || "#2563eb";
    // per-line stagger inside code block
    const codeLines = (params.code || "").split("\n").map((l, i) => {
      const op = entry(0.15 + i * 0.06, 0.15);
      return `<div style="margin:0;opacity:${op};color:${i===0?"#e06c75":i>0&&i<4?"#98c379":"#abb2bf"}">${esc(l)}</div>`;
    }).join("");
    // continuous border pulse on phone preview
    const borderPulse = 0.7 + 0.3 * Math.sin(t * 1.5);
    const breathe = 1 + 0.01 * Math.sin(t * Math.PI * 0.9);
    return `
      <div style="position:absolute;inset:0;background:#f8f9fa;
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="font:700 72px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    margin-bottom:40px;opacity:${k};text-align:center;transform:translateY(${ty(0,0.2)}px);">${esc(params.title || "")}</div>
        <div style="width:100%;background:#282c34;border-radius:20px;padding:40px;margin-bottom:48px;
                    opacity:${kCode};transform:translateY(${ty(0.1,0.2)}px);">
          <div style="font:500 32px/1.8 'Courier New',monospace;word-break:break-all;">${codeLines}</div>
        </div>
        <div style="opacity:${k2};transform:translateY(${ty(0.25,0.2)}px) scale(${breathe});
                    width:200px;height:360px;background:#1f2937;border-radius:24px;
                    border:6px solid ${ac};display:flex;align-items:center;justify-content:center;
                    box-shadow:0 0 ${20+20*borderPulse}px rgba(37,99,235,${0.3+0.3*borderPulse});">
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
