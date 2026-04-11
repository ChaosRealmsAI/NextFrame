import { makeDraggable } from "../../dnd/source.js";
import * as engine from "../../engine/index.js";

const CATEGORY_COLORS = {
  Backgrounds: "#3b82f6",
  Typography: "#a855f7",
  "Shapes & Layout": "#06b6d4",
  "Data Viz": "#22c55e",
  Overlays: "#ec4899",
  Default: "#6366f1",
};

const ASSET_COLORS = {
  video: ["#2563eb", "#0f172a"],
  image: ["#7c3aed", "#1f2937"],
  audio: ["#0f766e", "#0f172a"],
  default: ["#475569", "#0f172a"],
};

const SCENE_THUMB_WIDTH = 96;
const SCENE_THUMB_HEIGHT = 54;
const SCENE_FALLBACK_DURATION = 4;

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

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function cloneValue(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function estimateDurationSeconds(durationHint) {
  const matches = String(durationHint || "").match(/\d+(?:\.\d+)?/g) || [];
  const values = matches
    .map((match) => Number.parseFloat(match))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    return SCENE_FALLBACK_DURATION;
  }

  if (values.length === 1) {
    return values[0];
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createSceneThumbnailTimeline(scene) {
  const duration = Math.max(estimateDurationSeconds(scene.duration_hint), 0.25);

  return {
    version: "1",
    duration,
    background: "#0b0b14",
    tracks: [
      {
        id: `thumb-track-${scene.id}`,
        kind: "video",
        clips: [
          {
            id: `thumb-clip-${scene.id}`,
            start: 0,
            dur: duration,
            scene: scene.id,
            params: cloneValue(scene.default_params || {}),
          },
        ],
      },
    ],
  };
}

function renderSceneThumbnail(thumb, scene) {
  if (!engine.SCENES.has(scene.id)) {
    return false;
  }

  const canvas = document.createElement("canvas");
  canvas.width = SCENE_THUMB_WIDTH;
  canvas.height = SCENE_THUMB_HEIGHT;
  canvas.style.display = "block";
  canvas.style.width = `${SCENE_THUMB_WIDTH}px`;
  canvas.style.height = `${SCENE_THUMB_HEIGHT}px`;
  canvas.setAttribute("aria-hidden", "true");

  const timeline = createSceneThumbnailTimeline(scene);
  const heroTime = timeline.duration * 0.5;

  try {
    const ctx = engine.setupDPR(canvas);
    engine.renderAt(ctx, timeline, heroTime);
    thumb.replaceChildren(canvas);
    return true;
  } catch {
    return false;
  }
}

function createCardShell(title, hint, meta) {
  const card = document.createElement("article");
  card.className = "asset-card";

  const content = document.createElement("div");
  content.className = "asset-meta";

  const name = document.createElement("div");
  name.className = "asset-name";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;

  const hintElement = document.createElement("span");
  hintElement.textContent = hint;

  const metaElement = document.createElement("div");
  metaElement.className = "asset-length";
  metaElement.textContent = meta;

  name.append(titleElement, hintElement);
  content.append(name, metaElement);
  card.append(content);
  return card;
}

export function createSceneCard(scene) {
  const accent = CATEGORY_COLORS[scene.category] || CATEGORY_COLORS.Default;
  const card = createCardShell(
    scene.name,
    `${scene.category} • ${scene.duration_hint || "Custom duration"}`,
    scene.id,
  );

  card.classList.add("scene-card");
  card.style.borderColor = hexToRgba(accent, 0.32);

  const thumb = document.createElement("div");
  thumb.className = "asset-thumb library-scene-thumb";
  thumb.style.setProperty("--thumb-a", accent);
  thumb.style.setProperty("--thumb-b", hexToRgba(accent, 0.18));
  thumb.style.setProperty("--thumb-glow", hexToRgba(accent, 0.28));
  thumb.style.width = `${SCENE_THUMB_WIDTH}px`;
  thumb.style.height = `${SCENE_THUMB_HEIGHT}px`;
  thumb.style.aspectRatio = "16 / 9";
  thumb.style.alignSelf = "flex-start";
  thumb.style.border = `1px solid ${hexToRgba(accent, 0.42)}`;

  const badge = document.createElement("div");
  badge.className = "library-scene-badge";
  badge.textContent = scene.category.slice(0, 1).toUpperCase();
  badge.style.position = "absolute";
  badge.style.top = "8px";
  badge.style.right = "8px";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.width = "22px";
  badge.style.height = "22px";
  badge.style.borderRadius = "999px";
  badge.style.background = hexToRgba(accent, 0.86);
  badge.style.color = "#f8fafc";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "700";
  badge.style.boxShadow = `0 6px 16px ${hexToRgba(accent, 0.32)}`;
  thumb.appendChild(badge);
  renderSceneThumbnail(thumb, scene);

  card.prepend(thumb);
  makeDraggable(card, { type: "scene", id: scene.id });

  return card;
}

export function createAssetCard(asset) {
  const [primary, secondary] = ASSET_COLORS[asset.kind] || ASSET_COLORS.default;
  const name = asset.name || asset.label || asset.id || "Untitled asset";
  const hint = asset.path || asset.description || asset.kind || "asset";
  const meta = formatDuration(Number(asset.duration)) || String(asset.kind || "").toUpperCase();
  const card = createCardShell(name, hint, meta);

  const thumb = document.createElement("div");
  thumb.className = "asset-thumb";
  thumb.style.setProperty("--thumb-a", primary);
  thumb.style.setProperty("--thumb-b", secondary);

  card.prepend(thumb);
  makeDraggable(card, {
    type: asset.kind === "audio" ? "audio" : "media",
    assetId: asset.id,
  });
  return card;
}
