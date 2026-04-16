// scenes/16x9/blueprint-cinema/content-sceneGrid.js
// F4: 6 scene 缩略网格 — each cell unique gradient + glass + breathe
export default {
  id: "sceneGrid",
  name: "Scene Grid",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "2×3 网格，每格独特 gradient + glass + depth shadow + hover-like breathe",
  duration_hint: 8,
  intent: "展示组件库视觉多样性。6 格每一个有专属 gradient（橙/蓝/青/紫/金/灰）+ backdrop-filter glass + 3 层阴影 depth。每格按 0.08s stagger 入场，入场后 hue-rotate 微呼吸。背景 subtle mesh + grain。",
  when_to_use: ["展示组件库/功能丰富度"],
  when_not_to_use: ["需要深度讲解单个功能时"],
  limitations: ["固定6个格子"],
  inspired_by: "Linear features grid + Vercel templates + Awwwards cards",
  used_in: [],
  requires: [],
  pairs_well_with: ["jsonShowcase"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["professional", "calm", "cinematic"],
  tags: ["grid", "scenes", "gallery", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "per-cell backdrop + gradient" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards upgrade: unique gradient per cell + glass + depth" },
  ],
  params: {
    title: { type: "string", default: "Scene 是组件 — 一个函数返回 HTML", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const kTitle = entry(0, 0.2);
    const cells = [
      { label: "bg-grid",     icon: "◱", c1: "#58a6ff", c2: "#1e3a5f", accent: "#58a6ff" },
      { label: "content-hook",icon: "?", c1: "#ff6b35", c2: "#5a1a08", accent: "#ff6b35" },
      { label: "content-title",icon:"A", c1: "#f5f2e8", c2: "#4a4438", accent: "#f5f2e8" },
      { label: "content-code",icon: "{ }",c1: "#7dd3fc", c2: "#0c4a6e", accent: "#7dd3fc" },
      { label: "content-chart",icon:"◥", c1: "#fbbf24", c2: "#78350f", accent: "#fbbf24" },
      { label: "chrome-bar",  icon: "═", c1: "#8b92a5", c2: "#2a3040", accent: "#8b92a5" },
    ];
    const cellW = Math.round(W * 0.26);
    const cellH = Math.round(H * 0.3);
    const cellsHtml = cells.map((c, i) => {
      const delay = 0.1 + i * 0.08;
      const k = entry(delay, 0.2);
      const yOff = ty(delay, 0.2);
      const breathe = 1 + 0.015 * Math.sin(t * 1.2 + i * 0.9);
      const hue = 4 * Math.sin(t * 0.8 + i * 0.5);
      const glowOp = 0.25 + 0.12 * Math.sin(t * 1.4 + i * 0.7);
      return `
        <div style="opacity:${k};transform:translateY(${yOff}px) scale(${breathe});filter:hue-rotate(${hue}deg);
          width:${cellW}px;height:${cellH}px;position:relative;
          background:linear-gradient(135deg,${c.c2}40,${c.c2}18);
          border:1px solid ${c.accent}3a;border-radius:16px;margin:${H*0.012}px ${W*0.009}px;
          backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);
          box-shadow:0 2px 0 rgba(255,255,255,0.06) inset,0 24px 48px -16px ${c.accent}${Math.round(glowOp*100).toString(16).padStart(2,'0')},0 40px 80px -32px rgba(0,0,0,0.6);
          overflow:hidden;">
          <div style="position:absolute;top:-30%;left:-20%;width:90%;height:90%;border-radius:50%;
            background:radial-gradient(circle,${c.c1}60,transparent 65%);filter:blur(30px);opacity:${0.5+0.2*Math.sin(t*1.1+i)};"></div>
          <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:${H*0.02}px;">
            <div style="font:700 ${Math.round(H*0.075)}px/1 'JetBrains Mono',monospace;color:${c.accent};margin-bottom:${H*0.018}px;
              text-shadow:0 0 32px ${c.accent},0 0 64px ${c.accent}40;letter-spacing:-0.04em;">${c.icon}</div>
            <div style="font:500 ${Math.round(W*0.013)}px/1.3 'JetBrains Mono','SF Mono',monospace;color:#f5f2e8;letter-spacing:0.04em;">${c.label}</div>
            <div style="margin-top:${H*0.01}px;width:${cellW*0.3}px;height:1px;background:linear-gradient(90deg,transparent,${c.accent}80,transparent);"></div>
          </div>
        </div>`;
    }).join('');

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.12;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n4"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="13"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n4)"/></svg>`;

    const title = params.title || "Scene 是组件 — 一个函数返回 HTML";
    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 70% 50% at 50% 0%,rgba(88,166,255,0.12),transparent 60%),
        radial-gradient(ellipse 70% 50% at 50% 100%,rgba(255,107,53,0.12),transparent 60%),
        linear-gradient(180deg,#0a1628,#06101f);overflow:hidden;padding:${H*0.07}px ${W*0.05}px;">
        <div style="opacity:${kTitle};transform:translateY(${ty(0,0.2)}px);
          font:600 ${Math.round(W*0.024)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.04}px;letter-spacing:-0.01em;text-shadow:0 2px 16px rgba(0,0,0,0.5);">${title}</div>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;position:relative;z-index:2;">${cellsHtml}</div>
        ${grain}
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
