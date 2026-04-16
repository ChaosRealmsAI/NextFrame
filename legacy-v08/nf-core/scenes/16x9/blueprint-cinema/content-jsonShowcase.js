// scenes/16x9/blueprint-cinema/content-jsonShowcase.js
// F3: JSON→HTML — glass code panel + gradient arrow + depth-shadowed preview
export default {
  id: "jsonShowcase",
  name: "JSON Showcase",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "左 glass code panel + 中间 gradient 箭头 + 右 depth-shadow 渲染 mock，展示 JSON→HTML",
  duration_hint: 8,
  intent: "Fireship 级代码演示。左侧 JSON 用 glass backdrop + syntax highlight + 逐行 stagger，右侧 mock preview 带多层 shadow depth 和微旋转的 gradient 色块。中间箭头用 gradient fill + glow trail。背景 radial mesh 打底。",
  when_to_use: ["展示数据到可视化的转换过程"],
  when_not_to_use: ["纯文字场景"],
  limitations: ["代码示例不超过8行"],
  inspired_by: "Stripe docs + Vercel code blocks + Fireship demo",
  used_in: [],
  requires: [],
  pairs_well_with: ["timelineDiagram"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "serious", "cinematic"],
  tags: ["code", "json", "demo", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "backdrop-filter + multi-layer shadows" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards upgrade: glass + gradient arrow + depth preview" },
  ],
  params: {
    title: { type: "string", default: "Timeline 描述视频结构", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const kTitle = entry(0, 0.2), kLeft = entry(0.12, 0.22), kArrow = entry(0.24, 0.2), kRight = entry(0.3, 0.22);
    const lines = ['{', '  "version": "0.8",', '  "width": 1920,', '  "anchors": {', '    "s1.begin": {"at": 0}', '  },', '  "tracks": [...]', '}'];
    const codeHtml = lines.map((l, i) => {
      const op = entry(0.12 + i * 0.05, 0.15);
      let color = '#f5f2e8';
      if (l.includes('"version"') || l.includes('"width"')) color = '#58a6ff';
      else if (l.includes('"anchors"') || l.includes('"tracks"')) color = '#ff6b35';
      else if (l.includes('0') && l.includes(':')) color = '#8b92a5';
      return `<div style="opacity:${op};color:${color};white-space:pre;letter-spacing:0.02em;">${l}</div>`;
    }).join('');
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
    const arrowShift = eo(Math.min(1, (t - 0.24) / 0.3)) * 6;
    const previewRot = 2 * Math.sin(t * 0.5);
    const hue = 10 * Math.sin(t * 0.9);
    const title = params.title || "Timeline 描述视频结构";

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.12;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n3"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n3)"/></svg>`;

    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 60% 50% at 20% 50%,rgba(88,166,255,0.14),transparent 65%),
        radial-gradient(ellipse 60% 50% at 80% 50%,rgba(255,107,53,0.16),transparent 65%),
        linear-gradient(180deg,#0a1628,#06101f);overflow:hidden;padding:${H*0.07}px ${W*0.05}px ${H*0.05}px;">
        <div style="opacity:${kTitle};transform:translateY(${ty(0,0.2)}px);
          font:600 ${Math.round(W*0.024)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.045}px;letter-spacing:-0.01em;
          text-shadow:0 2px 16px rgba(0,0,0,0.5);">${title}</div>
        <div style="display:flex;align-items:center;gap:${W*0.03}px;height:${H*0.62}px;position:relative;z-index:2;">
          <div style="opacity:${kLeft};flex:1;position:relative;
            background:linear-gradient(135deg,rgba(88,166,255,0.12),rgba(10,22,40,0.6));
            border:1px solid rgba(88,166,255,0.28);border-radius:14px;padding:${H*0.035}px ${W*0.025}px;
            backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
            font:500 ${Math.round(W*0.015)}px/1.9 'JetBrains Mono','SF Mono',Menlo,monospace;
            box-shadow:0 2px 0 rgba(255,255,255,0.06) inset,0 32px 64px -24px rgba(88,166,255,0.25),0 48px 96px -32px rgba(0,0,0,0.6);
            overflow:hidden;">
            <div style="position:absolute;top:14px;left:14px;display:flex;gap:6px;">
              <div style="width:10px;height:10px;border-radius:50%;background:#ff5f57;"></div>
              <div style="width:10px;height:10px;border-radius:50%;background:#ffbd2e;"></div>
              <div style="width:10px;height:10px;border-radius:50%;background:#28c840;"></div>
            </div>
            <div style="margin-top:${H*0.025}px;">${codeHtml}</div>
          </div>
          <div style="opacity:${kArrow};flex-shrink:0;text-align:center;transform:translateX(${arrowShift}px);">
            <div style="position:relative;width:${W*0.07}px;height:4px;
              background:linear-gradient(90deg,rgba(88,166,255,0.5),#ff6b35);border-radius:2px;
              box-shadow:0 0 24px rgba(255,107,53,0.6),0 0 48px rgba(255,107,53,0.3);"></div>
            <div style="position:absolute;transform:translate(${W*0.065}px,-9px);width:0;height:0;
              border-left:14px solid #ff6b35;border-top:10px solid transparent;border-bottom:10px solid transparent;
              filter:drop-shadow(0 0 12px rgba(255,107,53,0.8));"></div>
            <div style="font:500 ${Math.round(W*0.012)}px/1.3 'JetBrains Mono',monospace;color:#8b92a5;margin-top:14px;letter-spacing:0.15em;text-transform:uppercase;">render</div>
          </div>
          <div style="opacity:${kRight};flex:1;position:relative;transform:rotate(${previewRot*0.3}deg);
            background:linear-gradient(145deg,rgba(255,107,53,${0.18+0.05*pulse}),rgba(88,166,255,0.08));
            border:1px solid rgba(255,107,53,${0.3+0.12*pulse});border-radius:14px;padding:${H*0.04}px;
            backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            box-shadow:0 2px 0 rgba(255,255,255,0.08) inset,0 40px 80px -24px rgba(255,107,53,0.35),0 60px 120px -40px rgba(0,0,0,0.7);">
            <div style="width:82%;height:${H*0.16}px;border-radius:10px;margin-bottom:${H*0.03}px;
              background:conic-gradient(from ${t*20}deg,#ff6b35,#58a6ff,#ff6b35);
              filter:blur(0.5px) hue-rotate(${hue}deg);
              box-shadow:0 8px 32px -8px rgba(255,107,53,0.5),0 2px 0 rgba(255,255,255,0.1) inset;"></div>
            <div style="width:65%;height:${H*0.028}px;background:linear-gradient(90deg,rgba(245,242,232,0.35),rgba(245,242,232,0.15));border-radius:4px;margin-bottom:${H*0.018}px;"></div>
            <div style="width:82%;height:${H*0.022}px;background:linear-gradient(90deg,rgba(139,146,165,0.4),rgba(139,146,165,0.15));border-radius:4px;"></div>
            <div style="margin-top:${H*0.035}px;font:500 ${Math.round(W*0.013)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;letter-spacing:0.15em;text-transform:uppercase;">HTML 输出</div>
          </div>
        </div>
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "jsonShowcase", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "code", role: "input", value: "timeline json" },
        { type: "preview", role: "output", value: "rendered html" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { title: "Timeline 描述视频结构" };
  },
};
