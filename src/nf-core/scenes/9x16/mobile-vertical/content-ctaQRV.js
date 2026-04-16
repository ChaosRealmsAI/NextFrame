// content-ctaQRV.js — F8: logo 顶 + 大 QR 中 + URL 底
export default {
  id: "ctaQRV",
  name: "ctaQRV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "竖屏 CTA：品牌 Logo 顶部 + QR 码居中 + URL 底部",
  duration_hint: 7,
  params: {
    brand:   { type: "string", default: "NextFrame",                  semantic: "品牌名" },
    cta:     { type: "string", default: "立即体验",                   semantic: "CTA 文字" },
    url:     { type: "string", default: "github.com/nextframe/nf",    semantic: "URL" },
    qrText:  { type: "string", default: "扫码\n了解更多",              semantic: "QR 内文字（QR 实际用文字模拟）" },
    acColor: { type: "color",  default: "#2563eb",                    semantic: "强调色" },
  },
  sample() {
    return { brand: "NextFrame", cta: "立即体验", url: "github.com/nextframe/nf", qrText: "扫码\n了解更多", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const k0 = easeOut(clamp(t / 0.4, 0, 1));
    const k1 = easeOut(clamp((t - 0.2) / 0.5, 0, 1));
    const k2 = easeOut(clamp((t - 0.5) / 0.4, 0, 1));
    const ac = params.acColor || "#2563eb";
    const qrLines = (params.qrText || "").split("\\n");
    // QR placeholder using a grid of squares
    const qrGrid = Array.from({length:6}, (_, r) =>
      `<div style="display:flex;gap:6px;">${Array.from({length:6}, (__, c) => {
        const filled = (r===0||r===5||c===0||c===5||
                        (r>=1&&r<=2&&c>=1&&c<=2)||
                        (r>=3&&r<=4&&c>=3&&c<=4));
        return `<div style="width:28px;height:28px;background:${filled?"#1f2937":"transparent"};border-radius:3px;"></div>`;
      }).join("")}</div>`
    ).join("");
    return `
      <div style="position:absolute;inset:0;background:#fff;
                  display:flex;flex-direction:column;align-items:center;padding:220px 64px 240px;">
        <div style="font:900 100px/1.1 Inter,'PingFang SC',sans-serif;color:${ac};
                    margin-bottom:16px;opacity:${k0};letter-spacing:-2px;">${esc(params.brand || "")}</div>
        <div style="font:400 44px/1.4 Inter,'PingFang SC',sans-serif;color:#6b7280;
                    margin-bottom:80px;opacity:${k0};">AI 视频引擎</div>
        <div style="opacity:${k1};transform:scale(${0.7+k1*0.3});
                    background:#f8f9fa;border-radius:24px;padding:40px;margin-bottom:48px;
                    border:3px solid #e5e7eb;">
          <div style="margin-bottom:24px;">${qrGrid}</div>
          <div style="text-align:center;">
            ${qrLines.map(l => `<div style="font:600 36px/1.4 Inter,'PingFang SC',sans-serif;color:#1f2937;">${esc(l)}</div>`).join("")}
          </div>
        </div>
        <div style="background:${ac};border-radius:16px;padding:24px 60px;margin-bottom:32px;opacity:${k2};">
          <div style="font:700 52px/1.2 Inter,'PingFang SC',sans-serif;color:#fff;">${esc(params.cta || "")}</div>
        </div>
        <div style="font:400 36px/1.4 'Courier New',monospace;color:#6b7280;opacity:${k2};">${esc(params.url || "")}</div>
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "ctaQRV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.7),
      visible: true, params,
      elements: [
        { type: "brand", role: "headline", value: params.brand || "" },
        { type: "cta", role: "action", value: params.cta || "" },
        { type: "url", role: "caption", value: params.url || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
