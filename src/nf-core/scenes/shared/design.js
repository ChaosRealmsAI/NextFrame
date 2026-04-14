// Shared design system — extracted from MediaAgentTeam slide-base.js + clip-slide.js + subs-zone.js
// Reference canvas: 540×960 → our canvas: 1080×1920 (2× scale)
// All px values are for 1080×1920. Use scale() helpers for other resolutions.

// ── Color tokens ──────────────────────────────────────────────
export const TOKENS = {
  interview: {
    bg: "#111111",
    gold: "#e8c47a",
    warm: "#da7756",
    text: "#ffffff",
    textDim: "rgba(255,255,255,0.7)",
    textFaint: "rgba(255,255,255,0.3)",
    blue: "#7ec8e3",
    tagBg: "rgba(126,200,227,0.06)",
    tagBorder: "rgba(126,200,227,0.15)",
    tagText: "#7ec8e3",
    decoLine: "rgba(232,196,122,0.12)",
    decoLineDiamond: "rgba(232,196,122,0.2)",
    gridDot: "rgba(232,196,122,0.08)",
    glowTop: "rgba(232,196,122,0.03)",
    glowBottom: "rgba(232,196,122,0.02)",
    vignette: "rgba(17,17,17,0.5)",
  },
  lecture: {
    bg: "#1a1510",
    codeBg: "#1e1e2e",
    accent: "#da7756",
    gold: "#d4b483",
    text: "#f5ece0",
    green: "#7ec699",
    comment: "#6a6a7a",
    red: "#e06c75",
  },
};

// ── Layout grid (1080×1920) ───────────────────────────────────
// All values are absolute px at 1080×1920. Scenes use scaleW/scaleH to adapt.
export const GRID = {
  sidePad: 80,         // left/right margin (40×2)
  header: { top: 0, height: 260 },           // series name + title zone
  decoLine1: 258,      // first separator (129×2)
  video: { top: 276, height: 538, left: 80, right: 80 }, // video area (138×2, 269×2)
  decoLine2: 820,      // second separator (410×2)
  subs: { top: 830, left: 140, right: 140, height: 340 }, // subtitle zone (415×2, 70×2)
  timeInfo: 1186,      // time info row (593×2)
  topic: { top: 1224, height: 256 },         // topic zone (612×2, 128×2)
  progress: 1496,      // progress bar (748×2)
  decoLine3: 1580,     // third separator (790×2)
  brand: 1590,         // brand bar (795×2)
  teamLine: 1760,      // team line (bottom 80×2 = 1920-160)
};

// ── Typography scale (1080×1920) ──────────────────────────────
export const TYPE = {
  seriesName:  { size: 44, weight: 800, spacing: "0.06em", font: "'PingFang SC','Noto Sans SC',Inter,system-ui,sans-serif" },
  title:       { size: 60, weight: 700, spacing: "-0.01em", lineHeight: 1.2, font: "'PingFang SC','Noto Sans SC',Inter,system-ui,sans-serif" },
  cnSub:       { size: 52, weight: 700, lineHeight: 1.3, font: "-apple-system,'PingFang SC','Microsoft YaHei',system-ui,sans-serif" },
  enSub:       { size: 22, weight: 400, lineHeight: 1.6, font: "-apple-system,'PingFang SC',system-ui,sans-serif" },
  topicLabel:  { size: 20, weight: 600, spacing: "0.1em", font: "'PingFang SC','Noto Sans SC',sans-serif" },
  topicText:   { size: 24, weight: 500, lineHeight: 1.65, font: "'PingFang SC','Noto Sans SC',sans-serif" },
  tag:         { size: 22, weight: 500, spacing: "0.03em", font: "'SF Mono','JetBrains Mono',monospace" },
  timeInfo:    { size: 22, weight: 500, spacing: "0.05em", font: "'SF Mono','JetBrains Mono',monospace" },
  brand:       { size: 40, weight: 900, spacing: "0.2em", font: "'Iowan Old Style','Songti SC','Playfair Display',Georgia,serif" },
  teamLine:    { size: 20, weight: 500, spacing: "0.03em", font: "'SF Mono','JetBrains Mono',monospace" },
  clipLabel:   { size: 14, weight: 500, spacing: "0.08em", font: "'SF Mono','JetBrains Mono',monospace" },
};

// ── Utility functions ─────────────────────────────────────────
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escAttr(value) {
  return esc(value).replace(/'/g, "&#39;");
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function easeOutCubic(value) {
  const p = clamp01(value);
  return 1 - Math.pow(1 - p, 3);
}

export function scaleW(vp, px) {
  return Math.round((vp.width * px) / 1080);
}

export function scaleH(vp, px) {
  return Math.round((vp.height * px) / 1920);
}

export function fadeIn(t, delay, duration) {
  const d = Number.isFinite(delay) ? delay : 0;
  const dur = Number.isFinite(duration) ? duration : 0.45;
  return easeOutCubic((t - d) / Math.max(dur, 0.001));
}

// Render a decorative separator line with diamond endpoints
export function decoLine(vp, y) {
  const left = scaleW(vp, GRID.sidePad);
  const lineY = scaleH(vp, y);
  const dSize = scaleW(vp, 10);
  return `<div style="position:absolute;left:${left}px;right:${left}px;top:${lineY}px;height:1px;background:linear-gradient(90deg,transparent,${TOKENS.interview.decoLine} 20%,${TOKENS.interview.decoLine} 80%,transparent);pointer-events:none">` +
    `<div style="position:absolute;left:0;top:${-dSize/2}px;width:${dSize}px;height:${dSize}px;border:1px solid ${TOKENS.interview.decoLineDiamond};transform:rotate(45deg);background:${TOKENS.interview.bg}"></div>` +
    `<div style="position:absolute;right:0;top:${-dSize/2}px;width:${dSize}px;height:${dSize}px;border:1px solid ${TOKENS.interview.decoLineDiamond};transform:rotate(45deg);background:${TOKENS.interview.bg}"></div>` +
    `</div>`;
}
