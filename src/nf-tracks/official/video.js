// src/nf-tracks/official/video.js
// Official "video" Track — <video> element embed with precise seek.
// Contract: ADR-033 Track ABI v1.1 + ADR-046 (video kind) + ADR-047 (data-nf-persist).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports, zero require, zero await import
//   - three and only three exports: describe, sample, render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now,
// no random, no DOM, no fetch). Runtime detects body[data-mode] externally
// and overrides muted/currentTime after render (diff preserves element
// identity via data-nf-persist).

export function describe() {
  return {
    id: "video",
    kind: "video",
    name: "Video Track",
    viewport: "any",
    t0_visibility: 0.95,
    z_order_hint: 0,
    visual_channels: ["scene"],
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["src"],
      additionalProperties: false,
      properties: {
        src: {
          type: "string",
          pattern: "^(file://|data:)",
        },
        from_ms: { type: "number", minimum: 0 },
        to_ms: { type: "number", minimum: 0 },
        fit: { type: "string", enum: ["contain", "cover"] },
        muted_in_record: { const: true },
        // Embedding rect (viewport-percent 0-100). Omit → full-stage.
        x: { type: "number", minimum: 0, maximum: 100 },
        y: { type: "number", minimum: 0, maximum: 100 },
        w: { type: "number", minimum: 0, maximum: 100 },
        h: { type: "number", minimum: 0, maximum: 100 },
        // Visual chrome.
        radius: { type: "number", minimum: 0 },
        border: { type: "string" },
        shadow: { type: "string" },
      },
    },
  };
}

export function sample() {
  return {
    src: "file:///tmp/sample-clip.mp4",
    from_ms: 2000,
    to_ms: 7000,
    fit: "cover",
    muted_in_record: true,
    // Embed bottom-right ≈ 40% × 40% PIP-style window.
    x: 55,
    y: 55,
    w: 40,
    h: 40,
    radius: 16,
    border: "2px solid rgba(255,255,255,0.25)",
    shadow: "0 12px 40px rgba(0,0,0,0.5)",
  };
}

// ---------- helpers (single-file rule; kept inline) ----------

function escapeAttr(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// persist key = "video-" + stable hash of src (same src → same key across frames).
// We use a simple FNV-1a hash of the src string so different clips with same
// src share the element (which is fine: runtime dedupes by key).
function stableKey(src) {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return "video-" + h.toString(16);
}

function computeFit(p) {
  return p.fit === "cover" ? "cover" : "contain";
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  // Guard: no src → render empty placeholder (still FM-T0 compliant).
  if (!p.src || typeof p.src !== "string") {
    return (
      '<div data-layout="video-empty" style="' +
      "position:absolute;inset:0;" +
      "width:" + vp.w + "px;height:" + vp.h + "px;" +
      "background:#0b0d10;opacity:0.95;" +
      '"></div>'
    );
  }

  const src = escapeAttr(p.src);
  const key = stableKey(p.src);
  const fromMs = typeof p.from_ms === "number" ? p.from_ms : 0;
  const fit = computeFit(p);

  // Embed rect — percent of viewport (NOT px): bundle CSS scales #nf-stage>*
  // by stage/viewport ratio, and scale() does NOT scale `left` values — so
  // percent is the only way to express position relative to stage. Also add
  // transform: none to cancel the global scale on this element (the video
  // should fill its PIP rect at native resolution, not be re-scaled).
  // !important overrides bundle CSS `#nf-stage > *{top:0!important;left:0!important;transform:scale...!important}`.
  const hasRect = typeof p.x === "number" || typeof p.y === "number"
    || typeof p.w === "number" || typeof p.h === "number";
  const xPct = typeof p.x === "number" ? p.x : 0;
  const yPct = typeof p.y === "number" ? p.y : 0;
  const wPct = typeof p.w === "number" ? p.w : 100;
  const hPct = typeof p.h === "number" ? p.h : 100;

  // render is PURE. Do NOT emit `muted` attribute: HTML boolean attributes
  // are true whenever present (any string value including "false" = muted).
  // Runtime sets v.muted via property assignment after diff mount based on
  // body[data-mode] (play → false, record → true). See BUG-20260419-01.
  // Opacity hardcoded to 0.95 (FM-T0 gate: ≥ 0.9).
  const posStyle = hasRect
    ? "position:absolute !important;" +
      "left:" + xPct + "% !important;top:" + yPct + "% !important;" +
      "width:" + wPct + "% !important;height:" + hPct + "% !important;" +
      "transform:none !important;"
    : "position:absolute !important;" +
      "left:0 !important;top:0 !important;" +
      "width:100% !important;height:100% !important;" +
      "transform:none !important;";

  const radius = typeof p.radius === "number" ? p.radius : 0;
  const border = typeof p.border === "string" ? p.border : "";
  const shadow = typeof p.shadow === "string" ? p.shadow : "";

  const style =
    posStyle +
    "object-fit:" + fit + ";" +
    "background:#000;" +
    "opacity:0.95;" +
    (radius ? ("border-radius:" + radius + "px;") : "") +
    (border ? ("border:" + escapeAttr(border) + ";box-sizing:border-box;") : "") +
    (shadow ? ("box-shadow:" + escapeAttr(shadow) + ";") : "");

  return (
    '<video' +
    ' data-nf-persist="' + key + '"' +
    ' data-nf-t-offset="' + fromMs + '"' +
    ' src="' + src + '"' +
    ' preload="auto"' +
    ' playsinline' +
    ' style="' + style + '"' +
    '></video>'
  );
}
