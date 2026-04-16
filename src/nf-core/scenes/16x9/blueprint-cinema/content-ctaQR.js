// scenes/16x9/blueprint-cinema/content-ctaQR.js
// F8: logo + GitHub URL + QR 占位
export default {
  id: "ctaQR",
  name: "CTA QR",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "结尾CTA页：大品牌名+GitHub URL+QR码占位图",
  duration_hint: 8,
  intent: "结尾需要明确的行动召唤。大字品牌名居中，下方URL用等宽字体，右侧QR码占位。3s后URL有光晕脉冲，强调可扫码。配色用--ac橙红打造温暖收尾感。",
  when_to_use: ["视频结尾CTA","引流到项目链接"],
  when_not_to_use: ["开头或中段"],
  limitations: ["URL不超过50字符"],
  inspired_by: "Kurzgesagt结尾订阅页",
  used_in: [],
  requires: [],
  pairs_well_with: ["dualOutput"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "calm"],
  tags: ["cta", "qr", "github", "ending", "content", "blueprint-cinema"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
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
    const k1 = eo(t / 0.8);
    const k2 = eo((t - 0.6) / 0.6);
    const k3 = eo((t - 1.2) / 0.6);
    const k4 = eo((t - 1.8) / 0.5);
    const pulse = t > 3 ? 0.5 + 0.5 * Math.sin((t - 3) * 1.5) : 0;
    const brand = params.brand || "NextFrame";
    const url = params.url || "github.com/anthropics/nextframe";
    const cta = params.cta || "开源 · 欢迎玩起来";

    // QR placeholder — a grid of squares
    const qrSize = Math.round(H * 0.3);
    const qrCells = 9;
    const cellS = Math.round(qrSize / qrCells);
    // deterministic pattern (no Math.random)
    const pattern = [1,0,1,1,0,1,0,1,1, 0,1,0,1,1,0,1,0,1, 1,0,1,0,1,0,1,1,0,
                     1,1,0,1,0,1,0,1,1, 0,0,1,0,1,0,1,0,0, 1,1,0,1,0,1,0,1,1,
                     1,0,1,1,0,1,1,0,1, 0,1,0,0,1,0,0,1,0, 1,0,1,1,0,1,0,1,1];
    const qrHtml = pattern.map((on, i) => {
      const r = Math.floor(i / qrCells), c = i % qrCells;
      return `<div style="position:absolute;left:${c*cellS}px;top:${r*cellS}px;width:${cellS-1}px;height:${cellS-1}px;background:${on?'#f5f2e8':'transparent'};"></div>`;
    }).join('');

    return `
      <div style="position:absolute;inset:0;background:#0a1628;display:flex;align-items:center;justify-content:center;">
        <div style="display:flex;align-items:center;gap:${W*0.07}px;">
          <div style="flex:1;display:flex;flex-direction:column;align-items:flex-start;">
            <div style="opacity:${k1};transform:scale(${0.85+0.15*k1});
              font:700 ${Math.round(W*0.065)}px/1.1 Inter,'PingFang SC',system-ui,sans-serif;
              color:#ff6b35;margin-bottom:${H*0.025}px;">${brand}</div>
            <div style="opacity:${k2};transform:translateY(${(1-k2)*16}px);margin-bottom:${H*0.02}px;">
              <div style="font:600 ${Math.round(W*0.022)}px/1.2 Inter,'PingFang SC',system-ui,sans-serif;color:#f5f2e8;">${cta}</div>
            </div>
            <div style="opacity:${k3};transform:translateY(${(1-k3)*12}px);
              font:400 ${Math.round(W*0.018)}px/1.4 'JetBrains Mono','SF Mono',monospace;
              color:#58a6ff;text-shadow:0 0 ${20+15*pulse}px rgba(88,166,255,${0.3+0.4*pulse});">
              ${url}
            </div>
            <div style="opacity:${k4};margin-top:${H*0.03}px;transform:translateY(${(1-k4)*10}px);">
              <div style="font:400 ${Math.round(W*0.014)}px/1.4 Inter,system-ui,sans-serif;color:#8b92a5;">AI 视频引擎 · 开源 · 可编程</div>
            </div>
          </div>
          <div style="opacity:${k4};flex-shrink:0;">
            <div style="position:relative;width:${qrSize}px;height:${qrSize}px;
              background:#f5f2e8;border-radius:8px;padding:8px;">
              ${qrHtml}
            </div>
            <div style="font:400 ${Math.round(W*0.012)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;text-align:center;margin-top:8px;">扫码访问</div>
          </div>
        </div>
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
    return {
      brand: "NextFrame",
      url: "github.com/anthropics/nextframe",
      cta: "开源 · 欢迎玩起来",
    };
  },
};
