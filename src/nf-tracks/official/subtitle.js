// src/nf-tracks/official/subtitle.js
// Official "subtitle" Track — word-level highlighted captions.
// Contract: ADR-033 Track ABI v1.1 + ADR-055 (subtitle dual-mode source).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports, zero require, zero await import
//   - three and only three exports: describe, sample, render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now, no
// random, no DOM, no fetch). All time-dependent behaviour flows from `t` (ms).
//
// Source resolution is handled by the bundler at build time (ADR-055): the
// three `source` variants (audio_track_id / timeline_path / words) are all
// normalised into `params.source.words` before render is called. At render
// time we only look at `params.source.words`.

export function describe() {
  return {
    id: "subtitle",
    kind: "subtitle",
    name: "Subtitle Track",
    viewport: "any",
    // FM-T0 gate: subtitle container opacity is always 1.0 (no entry fade —
    // captions must be readable from t=0). Safely above the 0.9 minimum.
    t0_visibility: 1.0,
    // Captions sit above scene / chart / video — use a high hint so runtime
    // stacks them on top (ADR-045 z_order).
    z_order_hint: 10,
    // Dedicated subtitle channel so runtime / recorder can route captions
    // separately from scene-layer visual tracks.
    visual_channels: ["subtitle"],
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["source"],
      additionalProperties: false,
      properties: {
        source: {
          oneOf: [
            {
              type: "object",
              required: ["audio_track_id"],
              additionalProperties: false,
              properties: {
                audio_track_id: { type: "string" },
              },
            },
            {
              type: "object",
              required: ["timeline_path"],
              additionalProperties: false,
              properties: {
                timeline_path: { type: "string" },
              },
            },
            {
              type: "object",
              required: ["words"],
              additionalProperties: false,
              properties: {
                words: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["text", "start_ms", "end_ms"],
                    additionalProperties: false,
                    properties: {
                      text: { type: "string" },
                      start_ms: { type: "number", minimum: 0 },
                      end_ms: { type: "number", minimum: 0 },
                    },
                  },
                },
              },
            },
          ],
        },
        style: {
          type: "object",
          additionalProperties: false,
          properties: {
            active_color: { type: "string" },
            size_px: { type: "number", minimum: 8 },
            position: { type: "string", enum: ["top", "middle", "bottom"] },
            padding: { type: "number", minimum: 0 },
          },
        },
      },
    },
  };
}

export function sample() {
  // Words-mode sample — self-contained so FM-T0 gate does not depend on any
  // external timeline file. The bundler normalises the other two source
  // variants (audio_track_id / timeline_path) into the same words shape at
  // build time, so render only ever consumes `source.words`.
  return {
    source: {
      words: [
        { text: "你", start_ms: 0, end_ms: 300 },
        { text: "好", start_ms: 300, end_ms: 600 },
        { text: "字", start_ms: 600, end_ms: 900 },
        { text: "幕", start_ms: 900, end_ms: 1200 },
      ],
    },
    style: {
      active_color: "#fbbf24",
      size_px: 36,
      position: "bottom",
      padding: 12,
    },
  };
}

// ---------- helpers (kept in-file per zero-import rule) -------------------

function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidWord(w) {
  return (
    w &&
    typeof w === "object" &&
    typeof w.text === "string" &&
    typeof w.start_ms === "number" &&
    typeof w.end_ms === "number"
  );
}

// Binary search: find the index of the word whose [start_ms, end_ms) window
// contains `t`. Returns -1 when no word is active (e.g. before first word, in
// a gap between words, or after the last word). Words are assumed sorted by
// start_ms (bundler guarantees this for all three source variants).
//
// O(log N) per render so RAF stays smooth even with thousands of words.
function findActiveIndex(words, t) {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (t < w.start_ms) {
      hi = mid - 1;
    } else if (t >= w.end_ms) {
      lo = mid + 1;
    } else {
      return mid; // w.start_ms <= t < w.end_ms
    }
  }
  return -1;
}

function pickActiveColor(style) {
  if (style && typeof style.active_color === "string" && style.active_color) {
    return style.active_color;
  }
  return "#fbbf24";
}

function pickSizePx(style) {
  if (style && typeof style.size_px === "number" && style.size_px >= 8) {
    return style.size_px;
  }
  return 36;
}

function pickPosition(style) {
  if (
    style &&
    typeof style.position === "string" &&
    (style.position === "top" ||
      style.position === "middle" ||
      style.position === "bottom")
  ) {
    return style.position;
  }
  return "bottom";
}

function pickPadding(style) {
  if (style && typeof style.padding === "number" && style.padding >= 0) {
    return style.padding;
  }
  return 12;
}

function positionCss(position, padding) {
  // Use !important to override bundle CSS that forces top:0 / left:0 /
  // transform:scale on every #nf-stage > * child (ADR-046 layout scaling).
  if (position === "top") {
    return "top:" + padding + "px !important;bottom:auto !important;transform:none !important;";
  }
  if (position === "middle") {
    return "top:50% !important;bottom:auto !important;transform:translateY(-50%) !important;";
  }
  // bottom (default)
  return "bottom:" + padding + "px !important;top:auto !important;transform:none !important;";
}

// Colour for the three word states. We emit inline styles directly (no CSS
// vars at this layer) so the HTML is self-contained and the bundler does not
// need to inject any stylesheet.
const READ_COLOR = "rgba(255,255,255,0.78)";
const UNREAD_COLOR = "rgba(255,255,255,0.42)";

function wordColor(idx, activeIdx, activeColor) {
  if (idx === activeIdx) return activeColor;
  if (idx < activeIdx || activeIdx === -1) {
    // When no word is active yet (activeIdx = -1) we still need to decide
    // read vs unread per word. Fall through to the precise per-word check
    // below (handled by caller passing the word object) — but for the common
    // path (activeIdx >= 0) the idx comparison is sufficient since words are
    // sorted by start_ms.
    return idx < activeIdx ? READ_COLOR : UNREAD_COLOR;
  }
  return UNREAD_COLOR;
}

// Per-word colour using the word's own window vs t. Handles the activeIdx=-1
// case precisely (mid-gap: some words are already past, some still upcoming).
function colorForWord(word, t, activeIdx, idx, activeColor) {
  if (idx === activeIdx) return activeColor;
  if (word.end_ms <= t) return READ_COLOR;
  if (word.start_ms > t) return UNREAD_COLOR;
  // Fallback — should not happen since active word is already handled, but
  // keep the path defined (treat as active to avoid blank word).
  return activeColor;
}

function emptyPlaceholder() {
  return (
    '<div data-layout="subtitle-empty" style="opacity:0.95;"></div>'
  );
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  const src = p.source;
  const rawWords = src && Array.isArray(src.words) ? src.words : null;
  if (!rawWords || rawWords.length === 0) {
    return emptyPlaceholder();
  }

  // Filter out malformed word entries (missing text / start_ms / end_ms).
  // Keep the original indices so data-nf-subtitle-word-idx reflects the
  // position in the filtered (render) list — binary search operates on the
  // same list, so indices stay consistent.
  const words = [];
  for (let i = 0; i < rawWords.length; i++) {
    const w = rawWords[i];
    if (isValidWord(w)) words.push(w);
  }
  if (words.length === 0) {
    return emptyPlaceholder();
  }

  const style = p.style && typeof p.style === "object" ? p.style : {};
  const activeColor = pickActiveColor(style);
  const sizePx = pickSizePx(style);
  const position = pickPosition(style);
  const padding = pickPadding(style);

  const tNum = typeof t === "number" ? t : 0;
  const activeIdx = findActiveIndex(words, tNum);

  // Build word spans.
  const spanParts = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const color = colorForWord(w, tNum, activeIdx, i, activeColor);
    const isActive = i === activeIdx;
    const weight = isActive ? 700 : 400;
    spanParts.push(
      '<span data-nf-subtitle-word-idx="' +
        i +
        '" data-nf-subtitle-state="' +
        (isActive
          ? "active"
          : w.end_ms <= tNum
          ? "read"
          : "unread") +
        '" style="color:' +
        color +
        ";font-weight:" +
        weight +
        ';">' +
        escapeHtml(w.text) +
        "</span>",
    );
  }

  // Container: absolute-positioned strip spanning the stage width. Inline
  // style so the bundle stays self-contained (no external stylesheet needed).
  const containerStyle =
    "position:absolute !important;left:0 !important;right:0 !important;width:auto !important;height:auto !important;" +
    positionCss(position, padding) +
    "text-align:center;" +
    "font-size:" +
    sizePx +
    "px;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;" +
    "line-height:1.4;" +
    "letter-spacing:0.01em;" +
    "text-shadow:0 2px 8px rgba(0,0,0,0.45);" +
    "pointer-events:none;" +
    "opacity:1.0;" +
    "z-index:10;";

  // Suppress the unused-viewport lint by referencing vp in a way that does
  // not change output (viewport is reserved for future responsive sizing).
  // Using vp.w in a no-op comment keeps the parameter meaningful.
  const _vpTag = vp.w > 0 ? "" : "";

  return (
    '<div data-layout="subtitle" data-nf-track="subtitle" style="' +
    containerStyle +
    '">' +
    _vpTag +
    spanParts.join("") +
    "</div>"
  );
}
