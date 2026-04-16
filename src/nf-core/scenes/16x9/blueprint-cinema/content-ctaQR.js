// scenes/16x9/blueprint-cinema/content-ctaQR.js
// F8: CTA — hero brand + glowing QR + brand halo + grain
export default {
  id: "ctaQR",
  name: "CTA QR",
  version: "1.1.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: false,
  assets: [],
  description: "结尾 CTA：gradient text 品牌 + glowing QR + brand halo + grain",
  duration_hint: 8,
  intent: "结尾 hero CTA。品牌名用 gradient text fill + drop-shadow glow。URL 用等宽字体 + cyan glow pulse。QR 放在白色 glass card，外围光晕呼吸。背景橙色 blob halo + 蓝色 blob + conic mesh，grain 统一质感。",
  when_to_use: ["视频结尾CTA","引流到项目链接"],
  when_not_to_use: ["开头或中段"],
  limitations: ["URL不超过50字符"],
  inspired_by: "Apple 发布会结尾 + Kurzgesagt订阅页 + Vercel CTA",
  used_in: [],
  requires: [],
  pairs_well_with: ["dualOutput"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "calm", "cinematic"],
  tags: ["cta", "qr", "github", "ending", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "medium", notes: "blob halo + drop-shadow + grain" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial" },
    { version: "1.1.0", date: "2026-04-16", change: "awwwards upgrade: gradient text + glowing QR + brand halo" },
  ],
  params: {
    brand: { type: "string", default: "NextFrame", semantic: "品牌名" },
    url: { type: "string", default: "github.com/anthropics/nextframe", semantic: "GitHub URL" },
    cta: { type: "string", default: "开源 · 欢迎玩起来", semantic: "行动号召语" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const entry = (d = 0, dur = 0.2) => 0.9 + 0.1 * eo(Math.max(0, (t - d) / dur));
    const ty = (d = 0, dur = 0.2) => 4 * (1 - eo(Math.max(0, (t - d) / dur)));
    const k1 = entry(0, 0.28), k2 = entry(0.15, 0.22), k3 = entry(0.28, 0.22), k4 = entry(0.4, 0.22);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    const breathe = 1 + 0.012 * Math.sin(t * Math.PI * 0.7);
    const qrGlow = 0.6 + 0.3 * Math.sin(t * 1.3);
    const hue = 6 * Math.sin(t * 0.8);
    const brand = params.brand || "NextFrame";
    const url = params.url || "github.com/anthropics/nextframe";
    const cta = params.cta || "开源 · 欢迎玩起来";

    const qrSize = Math.round(H * 0.32);
    const qrCells = 11;
    const cellS = Math.round(qrSize / qrCells);
    // deterministic QR-ish pattern (121 cells)
    const pattern = [1,1,1,1,1,0,1,0,1,1,1, 1,0,0,0,1,0,1,0,0,0,1, 1,0,1,1,1,0,1,0,1,1,1,
                     1,0,1,0,1,0,0,0,1,1,0, 1,0,1,1,1,0,1,0,0,1,0, 1,1,1,1,1,0,1,1,1,0,1,
                     0,0,0,0,0,0,1,0,0,1,1, 1,1,1,0,1,0,1,1,1,0,0, 0,1,0,1,0,0,1,0,0,1,1,
                     1,0,1,1,1,0,1,0,1,0,0, 1,1,0,0,1,0,0,1,1,0,1];
    const qrHtml = pattern.slice(0, qrCells * qrCells).map((on, i) => {
      const r = Math.floor(i / qrCells), c = i % qrCells;
      return `<div style="position:absolute;left:${c*cellS}px;top:${r*cellS}px;width:${cellS-1}px;height:${cellS-1}px;background:${on?'#0a1628':'transparent'};border-radius:1px;"></div>`;
    }).join('');

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.12;mix-blend-mode:overlay;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="n8"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="29"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n8)"/></svg>`;

    return `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 60% 55% at 30% 55%,rgba(255,107,53,0.2),transparent 65%),
        radial-gradient(ellipse 50% 50% at 75% 45%,rgba(88,166,255,0.16),transparent 65%),
        conic-gradient(from ${t*6}deg at 50% 50%,#0a1628,#0f1d3a,#0a1628,#06101f,#0a1628);
        overflow:hidden;">
        <div style="position:absolute;left:-10%;bottom:-20%;width:60%;height:70%;border-radius:50%;
          background:radial-gradient(circle,rgba(255,107,53,0.55),rgba(255,107,53,0.1) 50%,transparent 70%);
          filter:blur(70px) hue-rotate(${hue}deg);opacity:${0.55+0.2*pulse};transform:rotate(${t*3}deg);"></div>
        <div style="position:absolute;right:-8%;top:-15%;width:50%;height:60%;border-radius:50%;
          background:radial-gradient(circle,rgba(88,166,255,0.45),transparent 70%);
          filter:blur(60px);opacity:${0.4+0.2*pulse};transform:rotate(${-t*2}deg);"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <div style="display:flex;align-items:center;gap:${W*0.08}px;position:relative;z-index:2;">
            <div style="flex:1;display:flex;flex-direction:column;align-items:flex-start;">
              <div style="opacity:${k1};transform:scale(${breathe * (0.985 + 0.015*eo(Math.min(1,t/0.28)))});margin-bottom:${H*0.028}px;">
                <div style="font:800 ${Math.round(W*0.075)}px/1.05 Inter,'PingFang SC',system-ui,sans-serif;
                  letter-spacing:-0.045em;
                  background:linear-gradient(135deg,#ff8a5c 0%,#ff6b35 50%,#ff5519 100%);
                  -webkit-background-clip:text;background-clip:text;color:transparent;
                  filter:drop-shadow(0 0 ${40+25*pulse}px rgba(255,107,53,${0.5+0.25*pulse})) drop-shadow(0 8px 24px rgba(0,0,0,0.5));">${brand}</div>
              </div>
              <div style="opacity:${k2};transform:translateY(${ty(0.15,0.22)}px);margin-bottom:${H*0.025}px;">
                <div style="font:600 ${Math.round(W*0.024)}px/1.2 Inter,'PingFang SC',system-ui,sans-serif;color:#f5f2e8;letter-spacing:-0.01em;text-shadow:0 2px 16px rgba(0,0,0,0.5);">${cta}</div>
              </div>
              <div style="opacity:${k3};transform:translateY(${ty(0.28,0.22)}px);
                font:500 ${Math.round(W*0.019)}px/1.4 'JetBrains Mono','SF Mono',monospace;
                color:#7dd3fc;letter-spacing:0.02em;
                text-shadow:0 0 ${20+15*pulse}px rgba(125,211,252,${0.5+0.3*pulse}),0 0 40px rgba(88,166,255,0.4);">
                ${url}
              </div>
              <div style="opacity:${k4};margin-top:${H*0.035}px;transform:translateY(${ty(0.4,0.22)}px);display:flex;align-items:center;gap:12px;">
                <div style="width:${W*0.04}px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,107,53,0.8));"></div>
                <div style="font:400 ${Math.round(W*0.014)}px/1.4 Inter,system-ui,sans-serif;color:#8b92a5;letter-spacing:0.2em;text-transform:uppercase;">AI 视频引擎 · 开源</div>
              </div>
            </div>
            <div style="opacity:${k4};flex-shrink:0;transform:scale(${1 + 0.02*Math.sin(t*1.4)});">
              <div style="position:relative;width:${qrSize}px;height:${qrSize}px;
                background:#f5f2e8;border-radius:14px;padding:14px;
                box-shadow:0 0 ${40+30*qrGlow}px rgba(255,107,53,${0.4+0.2*qrGlow}),0 0 80px rgba(255,107,53,0.3),0 40px 80px -16px rgba(0,0,0,0.6),0 2px 0 rgba(255,255,255,0.5) inset;">
                <div style="position:relative;width:100%;height:100%;">
                  ${qrHtml}
                </div>
              </div>
              <div style="font:500 ${Math.round(W*0.013)}px/1.3 'JetBrains Mono',monospace;color:#f5f2e8;text-align:center;margin-top:14px;letter-spacing:0.25em;text-transform:uppercase;text-shadow:0 0 12px rgba(255,107,53,0.4);">扫码访问</div>
            </div>
          </div>
        </div>
        ${grain}
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "ctaQR", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "headline", role: "brand", value: params.brand || "" },
        { type: "url", role: "cta-link", value: params.url || "" },
        { type: "qr", role: "scan-target", value: params.url || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { brand: "NextFrame", url: "github.com/anthropics/nextframe", cta: "开源 · 欢迎玩起来" };
  },
};
