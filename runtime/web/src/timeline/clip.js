import { SCENE_MANIFEST } from "../scenes/index.js";

const CATEGORY_COLORS = {
  Backgrounds: "#3b82f6",
  Typography: "#a855f7",
  Shapes: "#06b6d4",
  "Shapes & Layout": "#06b6d4",
  DataViz: "#22c55e",
  "Data Viz": "#22c55e",
  Transitions: "#f59e0b",
  Overlays: "#ec4899",
};

const SCENE_META = new Map(SCENE_MANIFEST.map((scene) => [scene.id, scene]));

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const numeric = Number.parseInt(value, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function createClip(clip, zoom) {
  const scene = typeof clip.scene === "string" ? SCENE_META.get(clip.scene) : null;
  const category = clip.category || scene?.category || "";
  const labelText = clip.name || scene?.name || clip.scene || "Untitled scene";
  const duration = Number(clip.duration ?? clip.dur) || 0;
  const element = document.createElement("div");
  const accent = CATEGORY_COLORS[category] || CATEGORY_COLORS.Backgrounds;
  const width = Math.max(zoom.timeToPx(duration), 44);

  element.className = "timeline-clip";
  element.dataset.clipId = clip.id || "";
  element.dataset.category = category;
  element.style.left = `${zoom.timeToPx(clip.start)}px`;
  element.style.width = `${width}px`;
  element.style.setProperty("--clip-accent", accent);
  element.style.setProperty("--clip-fill-start", hexToRgba(accent, 0.48));
  element.style.setProperty("--clip-fill-end", hexToRgba(accent, 0.2));
  element.title = labelText;

  const leftHandle = document.createElement("span");
  leftHandle.className = "timeline-clip-handle timeline-clip-handle-left";
  leftHandle.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "timeline-clip-label";
  label.textContent = labelText;

  const rightHandle = document.createElement("span");
  rightHandle.className = "timeline-clip-handle timeline-clip-handle-right";
  rightHandle.setAttribute("aria-hidden", "true");

  element.append(leftHandle, label, rightHandle);
  return element;
}

export { CATEGORY_COLORS };
