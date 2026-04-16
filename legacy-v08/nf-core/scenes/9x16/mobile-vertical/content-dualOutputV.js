// content-dualOutputV.js — F7: 上下堆叠横屏+竖屏视频缩略
export default {
  id: "dualOutputV",
  name: "dualOutputV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "双输出展示：上方横屏缩略 + 下方竖屏缩略，一套 JSON 两套输出",
  duration_hint: 7,
  intent: "上下堆叠展示同一 JSON 产出两种格式。两个播放按钮持续呼吸，竖屏框有 glow 边框脉冲，强调『两屏同出』的价值。",
  when_to_use: ["展示多格式输出"],
  when_not_to_use: ["单一输出场景"],
  limitations: ["固定横+竖两种"],
  inspired_by: "设计工具多尺寸预览",
  used_in: [],
  requires: [],
  pairs_well_with: ["cliDemoV"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["professional", "calm"],
  tags: ["output", "dual", "landscape", "portrait", "content", "mobile-vertical"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title:    { type: "string", default: "一套 JSON\n两种格式",   semantic: "标题（\\n 换行）" },
    label1:   { type: "string", default: "16:9 横屏",             semantic: "横屏标签" },
    label2:   { type: "string", default: "9:16 竖屏",             semantic: "竖屏标签" },
    acColor:  { type: "color",  default: "#2563eb",               semantic: "强调色" },
  },
  sample() {
    return { title: "一套 JSON\n两种格式", label1: "16:9 横屏", label2: "9:16 竖屏", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const entry = (delay = 0, dur = 0.2) => 0.9 + 0.1 * easeOut(clamp((t - delay) / dur, 0, 1));
    const ty = (delay = 0, dur = 0.2) => 8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const kTitle = entry(0, 0.2);
    const k1 = entry(0.1, 0.2);
    const k2 = entry(0.25, 0.2);
    const ac = params.acColor || "#2563eb";
    const titleLines = (params.title || "").split("\\n");
    // persistent play button pulse
    const playBreathe = 1 + 0.08 * Math.sin(t * 2);
    const borderPulse = 0.7 + 0.3 * Math.sin(t * 1.5);
    return `
      <div style="position:absolute;inset:0;background:#fff;
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="text-align:center;margin-bottom:64px;opacity:${kTitle};transform:translateY(${ty(0,0.2)}px);">
          ${titleLines.map(l => `<div style="font:700 96px/1.15 Inter,'PingFang SC',sans-serif;color:#1f2937;">${esc(l)}</div>`).join("")}
        </div>
        <div style="width:100%;background:#f1f5f9;border-radius:20px;padding:32px;margin-bottom:32px;
                    opacity:${k1};transform:translateY(${ty(0.1,0.2)}px);">
          <div style="font:600 40px/1.3 Inter,'PingFang SC',sans-serif;color:#6b7280;margin-bottom:20px;">${esc(params.label1 || "")}</div>
          <div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,${ac} 0%,#93c5fd 100%);
                      border-radius:12px;display:flex;align-items:center;justify-content:center;">
            <div style="font:700 48px/1 Inter,sans-serif;color:#fff;transform:scale(${playBreathe});">▶</div>
          </div>
        </div>
        <div style="width:200px;background:#f1f5f9;border-radius:20px;padding:24px;
                    opacity:${k2};transform:translateY(${ty(0.25,0.2)}px);border:3px solid ${ac};
                    box-shadow:0 0 ${20+20*borderPulse}px rgba(37,99,235,${0.2+0.3*borderPulse});">
          <div style="font:600 32px/1.3 Inter,'PingFang SC',sans-serif;color:#6b7280;margin-bottom:16px;text-align:center;">${esc(params.label2 || "")}</div>
          <div style="width:100%;aspect-ratio:9/16;background:linear-gradient(180deg,${ac} 0%,#93c5fd 100%);
                      border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <div style="font:700 48px/1 Inter,sans-serif;color:#fff;transform:scale(${playBreathe});">▶</div>
          </div>
        </div>
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "dualOutputV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.7),
      visible: true, params,
      elements: [{ type: "title", role: "headline", value: params.title || "" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
