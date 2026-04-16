// scenes/16x9/blueprint-cinema/content-cliDemo.js
// F6: CLI demo — glass terminal + gradient progress + syntax highlight + grain
export default {
  id: "cliDemo",
  name: "CLI Demo",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "macOS 风格 glass terminal + syntax highlight 命令 + gradient 进度条 + grain",
  duration_hint: 8,
  intent: "iTerm2 风格终端做玻璃感：backdrop-filter + 多层 shadow。命令行逐字打出带 caret blink，进度条 gradient fill 从蓝到橙加 glow。输出行 stagger 出现，最后成功行橙红带 checkmark glow。背景 subtle radial mesh。",
  when_to_use: ["展示CLI使用方式","展示自动化能力"],
  when_not_to_use: ["不是技术受众时"],
  limitations: ["命令不超过60字符"],
  inspired_by: "Warp terminal + Fireship tutorials + Vercel deploy logs",
  used_in: [],
  requires: [],
  pairs_well_with: ["timelineDiagram"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "intense", "cinematic"],
  tags: ["cli", "terminal", "demo", "progress", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "backdrop glass + gradient" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards upgrade: glass terminal + gradient progress + syntax highlight" },
  ],
  params: {
    command: { type: "string", default: "nextframe render timeline.json output.mp4", semantic: "CLI命令" },
    title: { type: "string", default: "一行命令，产出 MP4", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const kTitle = entry(0, 0.2), kWindow = entry(0.1, 0.25);
    const command = params.command || "nextframe render timeline.json output.mp4";
    const title = params.title || "一行命令，产出 MP4";

    const typeProgress = Math.min(1, Math.max(0, (t - 0.15) / 0.9));
    const typedChars = Math.floor(typeProgress * command.length);
    const typedCmd = command.slice(0, typedChars);
    const caret = Math.floor(t * 2) % 2 === 0 ? '▎' : ' ';
    const progT = Math.min(1, Math.max(0, (t - 1.2) / 4.0));
    const progPct = Math.round(eo(progT) * 100);
    const showProgress = t > 1.2;

    const procLines = [
      { text: "→ Loading timeline...",                       at: 1.2, color: "#8b92a5" },
      { text: "→ Building HTML bundle...",                   at: 1.7, color: "#8b92a5" },
      { text: "→ Recording frames (1920×1080)...",           at: 2.4, color: "#58a6ff" },
      { text: "→ Encoding H.264 + AAC...",                   at: 4.0, color: "#58a6ff" },
      { text: "✓ Output: output/v1.0/landscape-1920x1080-1min.mp4", at: 5.5, color: "#ff6b35" },
    ];
    const procHtml = procLines.filter(pl => t > pl.at).map(pl => {
      const op = eo(Math.min(1, (t - pl.at) / 0.25));
      const glow = pl.color === "#ff6b35" ? `text-shadow:0 0 16px ${pl.color}80;` : '';
      return `<div style="opacity:${op};color:${pl.color};margin-top:${H*0.01}px;${glow}">${pl.text}</div>`;
    }).join('');

    // syntax-highlighted command: cmd cyan, args orange
    const cmdParts = typedCmd.split(' ');
    const cmdHtml = cmdParts.map((p, i) => {
      if (i === 0) return `<span style="color:#58a6ff;">${p}</span>`;
      if (i === 1) return `<span style="color:#7dd3fc;">${p}</span>`;
      return `<span style="color:#ff6b35;">${p}</span>`;
    }).join(' ');

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.1;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n6"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="19"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n6)"/></svg>`;
    const borderPulse = 0.3 + 0.15 * Math.sin(t * 1.4);

    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 70% 50% at 50% 50%,rgba(88,166,255,0.1),transparent 65%),
        linear-gradient(180deg,#0a1628,#06101f);overflow:hidden;padding:${H*0.07}px ${W*0.08}px;">
        <div style="opacity:${kTitle};transform:translateY(${ty(0,0.2)}px);
          font:600 ${Math.round(W*0.026)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.045}px;letter-spacing:-0.01em;text-shadow:0 2px 16px rgba(0,0,0,0.5);">${title}</div>
        <div style="opacity:${kWindow};position:relative;
          background:linear-gradient(180deg,rgba(20,28,48,0.85),rgba(10,15,30,0.9));
          border:1px solid rgba(88,166,255,${borderPulse});border-radius:14px;overflow:hidden;
          backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%);
          box-shadow:0 2px 0 rgba(255,255,255,0.08) inset,0 32px 64px -16px rgba(88,166,255,0.3),0 60px 120px -40px rgba(0,0,0,0.8);">
          <div style="background:linear-gradient(180deg,rgba(42,42,62,0.9),rgba(32,32,52,0.85));padding:${H*0.014}px ${W*0.018}px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(245,242,232,0.05);">
            <div style="width:13px;height:13px;border-radius:50%;background:#ff5f57;box-shadow:0 0 8px rgba(255,95,87,0.5);"></div>
            <div style="width:13px;height:13px;border-radius:50%;background:#ffbd2e;box-shadow:0 0 8px rgba(255,189,46,0.5);"></div>
            <div style="width:13px;height:13px;border-radius:50%;background:#28c840;box-shadow:0 0 8px rgba(40,200,64,0.5);"></div>
            <div style="margin-left:auto;font:500 ${Math.round(W*0.012)}px/1 'JetBrains Mono',monospace;color:#8b92a5;letter-spacing:0.1em;">nextframe · zsh</div>
          </div>
          <div style="padding:${H*0.035}px ${W*0.022}px;font:500 ${Math.round(W*0.016)}px/1.7 'JetBrains Mono','SF Mono',Menlo,monospace;">
            <div><span style="color:#28c840;">➜</span> <span style="color:#8b92a5;">~/project</span> ${cmdHtml}<span style="color:#ff6b35;">${caret}</span></div>
            ${procHtml}
            ${showProgress ? `
              <div style="margin-top:${H*0.025}px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#58a6ff;letter-spacing:0.05em;">Rendering</span>
                  <span style="color:#f5f2e8;font-weight:600;">${progPct}%</span>
                </div>
                <div style="background:rgba(88,166,255,0.12);border-radius:6px;height:10px;position:relative;overflow:hidden;
                  box-shadow:0 2px 8px rgba(0,0,0,0.4) inset;">
                  <div style="background:linear-gradient(90deg,#58a6ff 0%,#7dd3fc 40%,#ff6b35 100%);width:${progPct}%;height:100%;border-radius:6px;
                    box-shadow:0 0 16px rgba(255,107,53,0.6),0 2px 0 rgba(255,255,255,0.2) inset;"></div>
                </div>
              </div>` : ''}
          </div>
        </div>
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    const progT = Math.min(1, Math.max(0, (t - 2.2) / 4.8));
    return {
      sceneId: "cliDemo", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "terminal", role: "cli", value: params.command || "" },
        { type: "progressbar", role: "render-progress", value: Math.round(progT * 100) },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { command: "nextframe render timeline.json output.mp4", title: "一行命令，产出 MP4" };
  },
};
