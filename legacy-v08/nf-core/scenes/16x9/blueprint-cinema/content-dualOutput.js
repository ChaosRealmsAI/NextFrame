// scenes/16x9/blueprint-cinema/content-dualOutput.js
// F7: landscape+portrait 双屏 — device mock + depth shadow + glow play + gradient arrow
export default {
  id: "dualOutput",
  name: "Dual Output",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "横屏+竖屏 device mock 并排：conic gradient preview + multi-shadow depth + glowing play + gradient arrow",
  duration_hint: 8,
  intent: "设备级 mock：两个屏幕用 conic-gradient + hue-rotate 循环动制造『正在播放』错觉，多层 box-shadow 做 device depth。橙色 play 按钮 radial glow 呼吸。中间双向箭头 gradient+blur trail 连接。grain 统一质感。",
  when_to_use: ["展示多格式输出能力"],
  when_not_to_use: ["只有单一输出格式时"],
  limitations: ["固定横屏+竖屏两种"],
  inspired_by: "Apple device mockup + Framer design kit + Vercel preview",
  used_in: [],
  requires: [],
  pairs_well_with: ["cliDemo"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["professional", "calm", "cinematic"],
  tags: ["output", "landscape", "portrait", "dual", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "conic gradient + deep shadows" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards upgrade: device depth + glow play + gradient arrow" },
  ],
  params: {
    title: { type: "string", default: "横屏竖屏，同一叙事，两套适配", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const kTitle = entry(0, 0.2), kLeft = entry(0.12, 0.22), kArrow = entry(0.24, 0.2), kRight = entry(0.32, 0.22), kPlay = entry(0.42, 0.22);
    const arrowPulse = 1 + 0.1 * Math.sin(t * 1.8);
    const playBreathe = 1 + 0.08 * Math.sin(t * 1.5);
    const playGlow = 0.6 + 0.3 * Math.sin(t * 1.6);
    const hueL = t * 18;
    const hueP = -t * 14;
    const title = params.title || "横屏竖屏，同一叙事，两套适配";

    const lsW = Math.round(W * 0.33);
    const lsH = Math.round(lsW * 9 / 16);
    const ptW = Math.round(H * 0.42 * 9 / 16);
    const ptH = Math.round(H * 0.42);

    function playBtn(op, scale) {
      return `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(${scale});opacity:${op};
        width:60px;height:60px;border-radius:50%;
        background:radial-gradient(circle,#ff8a5c,#ff6b35 60%,#d94b1a);
        display:flex;align-items:center;justify-content:center;
        font-size:22px;color:#fff;
        box-shadow:0 0 ${24+16*playGlow}px rgba(255,107,53,${0.7+0.3*playGlow}),0 0 ${60+30*playGlow}px rgba(255,107,53,0.5),0 2px 0 rgba(255,255,255,0.3) inset,0 10px 24px rgba(0,0,0,0.5);">▶</div>`;
    }

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.1;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n7"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="23"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n7)"/></svg>`;

    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 60% 50% at 30% 50%,rgba(88,166,255,0.14),transparent 65%),
        radial-gradient(ellipse 60% 50% at 70% 50%,rgba(255,107,53,0.14),transparent 65%),
        linear-gradient(180deg,#0a1628,#06101f);overflow:hidden;
        display:flex;flex-direction:column;align-items:center;padding-top:${H*0.07}px;">
        <div style="opacity:${kTitle};transform:translateY(${ty(0,0.2)}px);
          font:600 ${Math.round(W*0.024)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.055}px;letter-spacing:-0.01em;text-shadow:0 2px 16px rgba(0,0,0,0.5);">${title}</div>
        <div style="display:flex;align-items:center;gap:${W*0.045}px;position:relative;z-index:2;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:${H*0.02}px;opacity:${kLeft};transform:translateY(${ty(0.12,0.22)}px);">
            <div style="position:relative;width:${lsW}px;height:${lsH}px;border-radius:12px;overflow:hidden;
              background:conic-gradient(from ${hueL}deg at 50% 50%,#0a2040,#1a3060,#2a4580,#1a3060,#0a2040);
              border:2px solid rgba(88,166,255,0.45);
              box-shadow:0 2px 0 rgba(255,255,255,0.1) inset,0 40px 80px -16px rgba(88,166,255,0.3),0 60px 120px -32px rgba(0,0,0,0.7),0 0 0 8px rgba(245,242,232,0.04);">
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;filter:blur(1px);">
                <div style="width:55%;height:35%;background:linear-gradient(135deg,rgba(88,166,255,0.4),rgba(255,107,53,0.25));border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);"></div>
              </div>
              ${playBtn(kPlay, playBreathe)}
            </div>
            <div style="font:500 ${Math.round(W*0.014)}px/1.3 'JetBrains Mono',monospace;color:#8b92a5;letter-spacing:0.1em;">1920 × 1080 · 16:9</div>
          </div>
          <div style="opacity:${kArrow};text-align:center;">
            <div style="position:relative;width:${W*0.05}px;height:${H*0.02}px;display:flex;align-items:center;justify-content:center;transform:scale(${arrowPulse});">
              <div style="width:100%;height:3px;background:linear-gradient(90deg,#58a6ff,#ff6b35,#58a6ff);border-radius:2px;box-shadow:0 0 16px rgba(255,107,53,0.6);"></div>
              <div style="position:absolute;left:-4px;width:0;height:0;border-right:10px solid #58a6ff;border-top:7px solid transparent;border-bottom:7px solid transparent;filter:drop-shadow(0 0 8px rgba(88,166,255,0.8));"></div>
              <div style="position:absolute;right:-4px;width:0;height:0;border-left:10px solid #ff6b35;border-top:7px solid transparent;border-bottom:7px solid transparent;filter:drop-shadow(0 0 8px rgba(255,107,53,0.8));"></div>
            </div>
            <div style="font:500 ${Math.round(W*0.012)}px/1.3 'JetBrains Mono',monospace;color:#f5f2e8;margin-top:10px;letter-spacing:0.15em;text-transform:uppercase;">同一 JSON</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:${H*0.02}px;opacity:${kRight};transform:translateY(${ty(0.32,0.22)}px);">
            <div style="position:relative;width:${ptW}px;height:${ptH}px;border-radius:14px;overflow:hidden;
              background:conic-gradient(from ${hueP}deg at 50% 50%,#200a40,#401060,#603080,#401060,#200a40);
              border:2px solid rgba(255,107,53,0.45);
              box-shadow:0 2px 0 rgba(255,255,255,0.1) inset,0 40px 80px -16px rgba(255,107,53,0.3),0 60px 120px -32px rgba(0,0,0,0.7),0 0 0 8px rgba(245,242,232,0.04);">
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;filter:blur(1px);">
                <div style="width:65%;height:18%;background:linear-gradient(135deg,rgba(255,107,53,0.35),rgba(88,166,255,0.2));border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);"></div>
                <div style="width:45%;height:10%;background:rgba(139,146,165,0.25);border-radius:4px;"></div>
              </div>
              ${playBtn(kPlay, playBreathe)}
            </div>
            <div style="font:500 ${Math.round(W*0.014)}px/1.3 'JetBrains Mono',monospace;color:#8b92a5;letter-spacing:0.1em;">1080 × 1920 · 9:16</div>
          </div>
        </div>
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "dualOutput", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "preview", role: "landscape", value: "1920x1080" },
        { type: "preview", role: "portrait", value: "1080x1920" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() { return { title: "横屏竖屏，同一叙事，两套适配" }; },
};
