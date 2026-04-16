// scenes/16x9/blueprint-cinema/content-cliDemo.js
// F6: 终端窗口 + 进度条
export default {
  id: "cliDemo",
  name: "CLI Demo",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "终端窗口展示CLI命令和进度条，模拟渲染过程",
  duration_hint: 8,
  intent: "用真实终端UI展示一行命令产出MP4的过程。命令逐字出现（0-1.5s），回车后进度条从0到100%（2-7s），最后显示成功消息。制造代码美感和成就感。",
  when_to_use: ["展示CLI使用方式","展示自动化能力"],
  when_not_to_use: ["不是技术受众时"],
  limitations: ["命令不超过60字符"],
  inspired_by: "Fireship终端演示 + iTerm2美学",
  used_in: [],
  requires: [],
  pairs_well_with: ["timelineDiagram"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "intense"],
  tags: ["cli", "terminal", "demo", "progress", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    command: { type: "string", default: "nextframe render timeline.json output.mp4", semantic: "CLI命令" },
    title: { type: "string", default: "一行命令，产出 MP4", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const kTitle = eo(t / 0.6);
    const kWindow = eo((t - 0.3) / 0.5);
    const command = params.command || "nextframe render timeline.json output.mp4";
    const title = params.title || "一行命令，产出 MP4";

    // Typewriter: 0.5 to 2.0s
    const typeProgress = Math.min(1, Math.max(0, (t - 0.5) / 1.5));
    const typedChars = Math.floor(typeProgress * command.length);
    const typedCmd = command.slice(0, typedChars);
    const cursor = t < 2.0 && Math.floor(t * 2) % 2 === 0 ? '█' : (t < 2.0 ? '' : '');

    // Progress bar: 2.2 to 7.0s
    const progT = Math.min(1, Math.max(0, (t - 2.2) / 4.8));
    // Eased progress (fast at start, slow near end for realism)
    const progPct = Math.round(eo(progT) * 100);
    const progBarW = progPct;
    const showProgress = t > 2.2;
    const done = t > 7.2;

    // Processing lines appear step by step
    const procLines = [
      { text: "→ Loading timeline...", at: 2.2 },
      { text: "→ Building HTML bundle...", at: 2.8 },
      { text: "→ Recording frames (1920×1080)...", at: 3.5 },
      { text: "→ Encoding H.264 + AAC...", at: 5.5 },
      { text: "✓ Output: output/v1.0/landscape-1920x1080-1min.mp4", at: 7.2, color: "#ff6b35" },
    ];
    const procHtml = procLines
      .filter(pl => t > pl.at)
      .map(pl => {
        const op = eo((t - pl.at) / 0.3);
        return `<div style="opacity:${op};color:${pl.color || '#8b92a5'};margin-top:${H*0.008}px;">${pl.text}</div>`;
      }).join('');

    return `
      <div style="position:absolute;inset:0;background:#0a1628;padding:${H*0.07}px ${W*0.08}px;">
        <div style="opacity:${kTitle};transform:translateY(${(1-kTitle)*16}px);
          font:600 ${Math.round(W*0.025)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.04}px;">${title}</div>
        <div style="opacity:${kWindow};background:#1a1a2e;border:1px solid rgba(88,166,255,0.2);border-radius:8px;overflow:hidden;">
          <div style="background:#2a2a3e;padding:${H*0.012}px ${W*0.015}px;display:flex;align-items:center;gap:6px;">
            <div style="width:12px;height:12px;border-radius:50%;background:#ff5f57;"></div>
            <div style="width:12px;height:12px;border-radius:50%;background:#ffbd2e;"></div>
            <div style="width:12px;height:12px;border-radius:50%;background:#28c840;"></div>
            <div style="margin-left:auto;font:400 ${Math.round(W*0.011)}px/1 monospace;color:#8b92a5;">nextframe</div>
          </div>
          <div style="padding:${H*0.03}px ${W*0.02}px;font:400 ${Math.round(W*0.015)}px/1.6 'JetBrains Mono','SF Mono',Menlo,monospace;">
            <div style="color:#8b92a5;">$ <span style="color:#f5f2e8;">${typedCmd}</span><span style="color:#ff6b35;">${cursor}</span></div>
            ${procHtml}
            ${showProgress ? `
              <div style="margin-top:${H*0.02}px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                  <span style="color:#58a6ff;">Rendering</span>
                  <span style="color:#f5f2e8;">${progPct}%</span>
                </div>
                <div style="background:rgba(88,166,255,0.15);border-radius:4px;height:8px;">
                  <div style="background:linear-gradient(90deg,#58a6ff,#ff6b35);width:${progBarW}%;height:100%;border-radius:4px;"></div>
                </div>
              </div>` : ''}
          </div>
        </div>
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
    return {
      command: "nextframe render timeline.json output.mp4",
      title: "一行命令，产出 MP4",
    };
  },
};
