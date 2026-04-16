// scenes/16x9/blueprint-cinema/content-timelineDiagram.js
// F5: timeline 4 track — gradient clips + glowing anchors + sweeping playhead
export default {
  id: "timelineDiagram",
  name: "Timeline Diagram",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "4 轨时间轴：gradient clip + glow 锚点 + cinematic sweeping playhead + grain",
  duration_hint: 8,
  intent: "可视化 anchors+tracks。每条 track 用专属 gradient + depth shadow。anchors 竖线用 glow pulse 强调节点。playhead 白色 + 前后 gradient trail 扫过。4 轨 stagger 入场，背景 subtle mesh。",
  when_to_use: ["解释timeline数据模型","展示多轨道编辑概念"],
  when_not_to_use: ["纯展示场景"],
  limitations: ["固定4条轨道"],
  inspired_by: "Figma timeline + Descript editor + DaVinci Resolve",
  used_in: [],
  requires: [],
  pairs_well_with: ["jsonShowcase", "cliDemo"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "serious", "cinematic"],
  tags: ["timeline", "anchors", "tracks", "diagram", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "gradient clips + glow pulses" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards upgrade: gradient tracks + glowing anchors + sweeping playhead" },
  ],
  params: {
    title: { type: "string", default: "Anchors 让时间用名字说话", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const kTitle = entry(0, 0.2);
    const tracks = [
      { label: "scene",    c1: "#58a6ff", c2: "#1e3a5f", clips: [{x:0.05,w:0.25},{x:0.32,w:0.25},{x:0.62,w:0.30}] },
      { label: "audio",    c1: "#ff6b35", c2: "#5a1a08", clips: [{x:0.05,w:0.55},{x:0.65,w:0.28}] },
      { label: "subtitle", c1: "#a0a8bb", c2: "#2a3040", clips: [{x:0.05,w:0.18},{x:0.28,w:0.18},{x:0.52,w:0.18},{x:0.75,w:0.18}] },
      { label: "overlay",  c1: "#fbbf24", c2: "#78350f", clips: [{x:0.10,w:0.12},{x:0.60,w:0.12}] },
    ];
    const anchors = [0.05, 0.32, 0.57, 0.62, 0.93];
    const timelineW = W * 0.82;
    const timelineX = W * 0.09;
    const trackH = H * 0.09;
    const trackGap = H * 0.025;
    const trackStartY = H * 0.28;
    const playheadProg = ((t * 0.15) % 1);
    const playheadX = timelineX + timelineW * (0.05 + playheadProg * 0.88);

    const tracksHtml = tracks.map((tr, i) => {
      const delay = 0.08 + i * 0.09;
      const k = entry(delay, 0.22);
      const y = trackStartY + i * (trackH + trackGap);
      const trackBg = `<div style="position:absolute;left:${timelineX}px;top:${y}px;width:${timelineW}px;height:${trackH}px;
        background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));
        border:1px solid rgba(245,242,232,0.06);border-radius:6px;opacity:${k};"></div>`;
      const clipsHtml = tr.clips.map((cl, ci) => {
        const cx = timelineX + cl.x * timelineW;
        const cw = cl.w * timelineW;
        const clipPulse = 0.85 + 0.15 * Math.sin(t * 1.2 + i * 0.6 + ci * 0.4);
        return `<div style="position:absolute;left:${cx}px;top:${y}px;width:${cw}px;height:${trackH}px;
          background:linear-gradient(135deg,${tr.c1}${Math.round(clipPulse*70).toString(16).padStart(2,'0')},${tr.c2}cc);
          border:1px solid ${tr.c1}99;border-radius:6px;opacity:${k};
          box-shadow:0 2px 0 rgba(255,255,255,0.08) inset,0 8px 24px -8px ${tr.c1}80,0 16px 40px -16px rgba(0,0,0,0.5);"></div>`;
      }).join('');
      return `
        ${trackBg}
        <div style="position:absolute;left:${timelineX - W*0.07}px;top:${y + trackH*0.3}px;opacity:${k};
          font:500 ${Math.round(W*0.014)}px/1 'JetBrains Mono',monospace;color:${tr.c1};letter-spacing:0.05em;
          text-shadow:0 0 12px ${tr.c1}80;">${tr.label}</div>
        ${clipsHtml}`;
    }).join('');

    const anchorsHtml = anchors.map((ax, i) => {
      const delay = 0.4 + i * 0.06;
      const k = entry(delay, 0.18);
      const x = timelineX + ax * timelineW;
      const pulse = 0.5 + 0.35 * Math.sin(t * 1.8 + i * 0.9);
      const totalH = tracks.length * (trackH + trackGap) + H * 0.05;
      return `
        <div style="position:absolute;left:${x-1}px;top:${trackStartY - H*0.04}px;width:2px;height:${totalH}px;
          background:linear-gradient(180deg,transparent,#ff6b35,#ff6b35,transparent);
          opacity:${k * (0.6 + 0.25 * pulse)};box-shadow:0 0 ${8+8*pulse}px #ff6b35;"></div>
        <div style="position:absolute;left:${x-6}px;top:${trackStartY - H*0.055}px;width:14px;height:14px;border-radius:50%;
          background:radial-gradient(circle,#ff6b35,rgba(255,107,53,0.3));
          opacity:${k * (0.7 + 0.2 * pulse)};box-shadow:0 0 ${12+10*pulse}px #ff6b35,0 0 24px rgba(255,107,53,0.5);"></div>`;
    }).join('');

    const totalH = tracks.length * (trackH + trackGap) + H * 0.07;
    const playheadHtml = `
      <div style="position:absolute;left:${playheadX-30}px;top:${trackStartY - H*0.06}px;width:60px;height:${totalH}px;
        background:linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent);pointer-events:none;"></div>
      <div style="position:absolute;left:${playheadX-1}px;top:${trackStartY - H*0.06}px;width:2px;height:${totalH}px;
        background:linear-gradient(180deg,transparent,#fff,#fff,transparent);opacity:0.92;
        box-shadow:0 0 16px rgba(255,255,255,0.8);"></div>
      <div style="position:absolute;left:${playheadX-7}px;top:${trackStartY - H*0.075}px;width:16px;height:16px;
        background:#fff;transform:rotate(45deg);opacity:0.95;
        box-shadow:0 0 16px rgba(255,255,255,0.8);"></div>`;

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.1;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n5"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="17"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n5)"/></svg>`;

    const title = params.title || "Anchors 让时间用名字说话";
    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 80% 40% at 50% 40%,rgba(88,166,255,0.1),transparent 70%),
        linear-gradient(180deg,#0a1628,#06101f);overflow:hidden;">
        <div style="position:absolute;top:${H*0.07}px;left:${W*0.09}px;right:${W*0.05}px;">
          <div style="opacity:${kTitle};transform:translateY(${ty(0,0.2)}px);
            font:600 ${Math.round(W*0.024)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;color:#f5f2e8;letter-spacing:-0.01em;text-shadow:0 2px 16px rgba(0,0,0,0.5);">${title}</div>
        </div>
        ${tracksHtml}
        ${anchorsHtml}
        ${playheadHtml}
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "timelineDiagram", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [{ type: "diagram", role: "timeline", value: "4 tracks + anchors" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { title: "Anchors 让时间用名字说话" };
  },
};
