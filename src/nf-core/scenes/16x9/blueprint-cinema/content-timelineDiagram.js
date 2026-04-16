// scenes/16x9/blueprint-cinema/content-timelineDiagram.js
// F5: 4 轨道时间轴 + 锚点箭头
export default {
  id: "timelineDiagram",
  name: "Timeline Diagram",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "水平时间轴带4条轨道和锚点标记，可视化anchors+tracks概念",
  duration_hint: 8,
  intent: "用可视化时间轴图示解释anchors和tracks的关系。轨道从上到下依次出现，锚点用橙红竖线标注，播放头从左到右扫过，让抽象概念立即可理解。",
  when_to_use: ["解释timeline数据模型","展示多轨道编辑概念"],
  when_not_to_use: ["纯展示场景"],
  limitations: ["固定4条轨道"],
  inspired_by: "视频编辑器时间轴UI",
  used_in: [],
  requires: [],
  pairs_well_with: ["jsonShowcase", "cliDemo"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "serious"],
  tags: ["timeline", "anchors", "tracks", "diagram", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title: { type: "string", default: "Anchors 让时间用名字说话", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const kTitle = eo(t / 0.6);
    const tracks = [
      { label: "scene", color: "#58a6ff", clips: [{x:0.05,w:0.25},{x:0.32,w:0.25},{x:0.62,w:0.30}] },
      { label: "audio", color: "#ff6b35", clips: [{x:0.05,w:0.55},{x:0.65,w:0.28}] },
      { label: "subtitle", color: "#8b92a5", clips: [{x:0.05,w:0.18},{x:0.28,w:0.18},{x:0.52,w:0.18},{x:0.75,w:0.18}] },
      { label: "overlay", color: "#f5f2e8", clips: [{x:0.10,w:0.12},{x:0.60,w:0.12}] },
    ];
    const anchors = [0.05, 0.32, 0.57, 0.62, 0.93];
    const timelineW = W * 0.82;
    const timelineX = W * 0.09;
    const trackH = H * 0.09;
    const trackGap = H * 0.025;
    const trackStartY = H * 0.28;
    // Playhead at t > 3s sweeps
    const playheadProg = t > 3 ? Math.min(1, (t - 3) / 4.5) : 0;
    const playheadX = timelineX + timelineW * (0.05 + playheadProg * 0.88);

    const tracksHtml = tracks.map((tr, i) => {
      const delay = 0.5 + i * 0.2;
      const k = eo((t - delay) / 0.5);
      const y = trackStartY + i * (trackH + trackGap);
      const clipsHtml = tr.clips.map(cl => {
        const cx = timelineX + cl.x * timelineW;
        const cw = cl.w * timelineW;
        return `<div style="position:absolute;left:${cx}px;top:${y}px;width:${cw}px;height:${trackH}px;
          background:${tr.color}22;border:1px solid ${tr.color}66;border-radius:4px;"></div>`;
      }).join('');
      return `
        <div style="position:absolute;left:${timelineX - W*0.06}px;top:${y + trackH*0.28}px;opacity:${Math.max(0,k)};
          font:400 ${Math.round(W*0.013)}px/1 'JetBrains Mono',monospace;color:${tr.color};">${tr.label}</div>
        <div style="opacity:${Math.max(0,k)};">${clipsHtml}</div>`;
    }).join('');

    const anchorsHtml = anchors.map((ax, i) => {
      const delay = 1.5 + i * 0.15;
      const k = eo((t - delay) / 0.4);
      const x = timelineX + ax * timelineW;
      return `<div style="position:absolute;left:${x}px;top:${trackStartY - H*0.04}px;width:2px;height:${tracks.length*(trackH+trackGap)+H*0.04}px;
        background:#ff6b35;opacity:${Math.max(0,k) * 0.7};"></div>`;
    }).join('');

    const playheadHtml = playheadProg > 0 ? `<div style="position:absolute;left:${playheadX}px;top:${trackStartY - H*0.06}px;width:2px;height:${tracks.length*(trackH+trackGap)+H*0.06}px;background:#fff;opacity:0.8;"></div>` : '';

    const title = params.title || "Anchors 让时间用名字说话";
    return `
      <div style="position:absolute;inset:0;background:#0a1628;">
        <div style="position:absolute;top:${H*0.07}px;left:${W*0.09}px;right:${W*0.05}px;">
          <div style="opacity:${kTitle};transform:translateY(${(1-kTitle)*16}px);
            font:600 ${Math.round(W*0.022)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;color:#f5f2e8;">${title}</div>
        </div>
        ${tracksHtml}
        ${anchorsHtml}
        ${playheadHtml}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "timelineDiagram", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "diagram", role: "timeline", value: "4 tracks + anchors" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { title: "Anchors 让时间用名字说话" };
  },
};
