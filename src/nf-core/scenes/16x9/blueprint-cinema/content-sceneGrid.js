// scenes/16x9/blueprint-cinema/content-sceneGrid.js
// F4: 2×3 scene 缩略图网格
export default {
  id: "sceneGrid",
  name: "Scene Grid",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "2行3列的场景缩略图网格，展示组件库丰富度",
  duration_hint: 8,
  intent: "用网格展示scene组件系统的视觉多样性。每个缩略图用不同颜色和图标代表不同组件类型，错开100ms依次出现，制造丰富感。",
  when_to_use: ["展示组件库/功能丰富度"],
  when_not_to_use: ["需要深度讲解单个功能时"],
  limitations: ["固定6个格子"],
  inspired_by: "3Blue1Brown 目录页网格",
  used_in: [],
  requires: [],
  pairs_well_with: ["jsonShowcase"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["professional", "calm"],
  tags: ["grid", "scenes", "gallery", "content", "blueprint-cinema"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title: { type: "string", default: "Scene 是组件 — 一个函数返回 HTML", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const kTitle = eo(t / 0.6);
    const cells = [
      { label: "bg-grid", icon: "⬛", color: "#58a6ff" },
      { label: "content-hook", icon: "❓", color: "#ff6b35" },
      { label: "content-title", icon: "🅰", color: "#f5f2e8" },
      { label: "content-code", icon: "{ }", color: "#58a6ff" },
      { label: "content-chart", icon: "📊", color: "#ff6b35" },
      { label: "chrome-bar", icon: "▬", color: "#8b92a5" },
    ];
    const cellW = Math.round(W * 0.26);
    const cellH = Math.round(H * 0.3);
    const cellsHtml = cells.map((c, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const delay = 0.5 + i * 0.12;
      const k = eo((t - delay) / 0.5);
      return `
        <div style="opacity:${Math.max(0,k)};transform:translateY(${(1-Math.max(0,k))*20}px);
          width:${cellW}px;height:${cellH}px;
          background:rgba(255,255,255,0.04);border:1px solid rgba(245,242,232,0.12);
          border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;
          margin:${H*0.01}px ${W*0.008}px;">
          <div style="font-size:${Math.round(H*0.06)}px;margin-bottom:${H*0.015}px;">${c.icon}</div>
          <div style="font:400 ${Math.round(W*0.013)}px/1.3 'JetBrains Mono','SF Mono',monospace;color:${c.color};">${c.label}</div>
        </div>`;
    }).join('');
    const title = params.title || "Scene 是组件 — 一个函数返回 HTML";
    return `
      <div style="position:absolute;inset:0;background:#0a1628;padding:${H*0.07}px ${W*0.05}px;">
        <div style="opacity:${kTitle};transform:translateY(${(1-kTitle)*16}px);
          font:600 ${Math.round(W*0.022)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.04}px;">${title}</div>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;">${cellsHtml}</div>
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "sceneGrid", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [{ type: "grid", role: "scene-gallery", value: "6 scene thumbnails" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { title: "Scene 是组件 — 一个函数返回 HTML" };
  },
};
