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
      },
    },
  };
}

export function sample() {
  return {
    src: "file:///tmp/sample-clip.mp4",
    from_ms: 2000,
    to_ms: 7000,
    fit: "contain",
    muted_in_record: true,
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

  // render is PURE. Do NOT emit `muted` attribute: HTML boolean attributes
  // are true whenever present (any string value including "false" = muted).
  // Runtime sets v.muted via property assignment after diff mount based on
  // body[data-mode] (play → false, record → true). See BUG-20260419-01.
  // Opacity hardcoded to 0.95 (FM-T0 gate: ≥ 0.9).
  const style =
    "position:absolute;inset:0;" +
    "width:" + vp.w + "px;height:" + vp.h + "px;" +
    "object-fit:" + fit + ";" +
    "background:#000;" +
    "opacity:0.95;";

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
