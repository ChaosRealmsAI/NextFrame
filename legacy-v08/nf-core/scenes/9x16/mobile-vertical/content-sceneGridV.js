// content-sceneGridV.js — F4: 3×2 网格场景展示（纵向更自然）
export default {
  id: "sceneGridV",
  name: "sceneGridV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "Scene 网格：3×2 卡片，纵向展示 6 种内置 scene 类型",
  duration_hint: 8,
  intent: "竖屏 3×2 网格展示组件多样性。每格 stagger 0.08s 依次浮现，入场后持续细微呼吸，避免静态屏。",
  when_to_use: ["展示组件库/功能丰富度"],
  when_not_to_use: ["深度讲解单功能"],
  limitations: ["固定 6 格"],
  inspired_by: "3Blue1Brown 目录页",
  used_in: [],
  requires: [],
  pairs_well_with: ["jsonShowcaseV"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["professional", "calm"],
  tags: ["grid", "scenes", "gallery", "content", "mobile-vertical"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title:  { type: "string", default: "40+ 内置 Scene",       semantic: "标题" },
    items:  { type: "string", default: "标题卡,代码块,时间轴,流程图,数据表,CTA", semantic: "6 个逗号分隔的名称" },
    acColor:{ type: "color",  default: "#2563eb",              semantic: "强调色" },
  },
  sample() {
    return { title: "40+ 内置 Scene", items: "标题卡,代码块,时间轴,流程图,数据表,CTA", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const entry = (delay = 0, dur = 0.2) => 0.9 + 0.1 * easeOut(clamp((t - delay) / dur, 0, 1));
    const ty = (delay = 0, dur = 0.2) => 8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const kTitle = entry(0, 0.2);
    const names = (params.items || "").split(",").slice(0, 6);
    const colors = ["#dbeafe","#fce7f3","#d1fae5","#fef3c7","#ede9fe","#fee2e2"];
    const icons =  ["T","</>","⏱","◇","☰","→"];
    const ac = params.acColor || "#2563eb";
    const cards = names.map((name, i) => {
      const delay = 0.1 + i * 0.08; // stagger ≤ 0.15s
      const k = entry(delay, 0.2);
      const scaleEnter = 0.96 + 0.04 * easeOut(clamp((t - delay) / 0.2, 0, 1));
      const cardBreathe = 1 + 0.012 * Math.sin(t * 1.4 + i * 0.7);
      return `<div style="flex:0 0 calc(33.33% - 12px);aspect-ratio:1;background:${colors[i % colors.length]};
                          border-radius:16px;display:flex;flex-direction:column;align-items:center;
                          justify-content:center;opacity:${k};transform:scale(${scaleEnter * cardBreathe}) translateY(${ty(delay,0.2)}px);">
        <div style="font:700 56px/1 Inter,sans-serif;color:#1f2937;margin-bottom:8px;">${esc(icons[i] || "•")}</div>
        <div style="font:600 28px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;text-align:center;">${esc(name)}</div>
      </div>`;
    }).join("");
    return `
      <div style="position:absolute;inset:0;background:#fff;
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="font:700 80px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    margin-bottom:16px;opacity:${kTitle};text-align:center;transform:translateY(${ty(0,0.2)}px);">${esc(params.title || "")}</div>
        <div style="font:400 40px/1.4 Inter,'PingFang SC',sans-serif;color:${ac};
                    margin-bottom:56px;opacity:${entry(0.08,0.2)};text-align:center;">即插即用</div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;width:100%;">${cards}</div>
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "sceneGridV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.6),
      visible: true, params,
      elements: [{ type: "title", role: "headline", value: params.title || "" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
