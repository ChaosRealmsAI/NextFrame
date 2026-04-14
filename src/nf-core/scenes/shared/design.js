export const TOKENS = {
  interview: {
    bg: "#0a0a0a",
    gold: "#d4b483",
    warm: "#da7756",
    text: "#f5ece0",
    secondary: "rgba(245,236,224,0.5)",
    muted: "rgba(245,236,224,0.3)",
    tagBg: "rgba(23,44,49,0.62)",
    tagBorder: "rgba(76,125,131,0.32)",
    tagText: "rgba(156,205,214,0.9)",
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

export function scaleW(vp, px, baseWidth) {
  return Math.round((vp.width * px) / baseWidth);
}

export function scaleH(vp, px, baseHeight) {
  return Math.round((vp.height * px) / baseHeight);
}

export function fadeIn(t, delay = 0, duration = 0.45) {
  return easeOutCubic((t - delay) / Math.max(duration, 0.001));
}

