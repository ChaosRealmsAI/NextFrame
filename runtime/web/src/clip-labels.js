export const CLIP_LABEL_COLORS = Object.freeze({
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
});

export const CLIP_LABEL_ORDER = Object.freeze([
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
]);

export function normalizeClipLabel(label) {
  if (typeof label !== "string") {
    return "";
  }

  const normalized = label.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CLIP_LABEL_COLORS, normalized) ? normalized : "";
}

export function getClipLabelColor(label) {
  const normalized = normalizeClipLabel(label);
  return normalized ? CLIP_LABEL_COLORS[normalized] : "";
}
