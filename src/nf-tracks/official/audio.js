// src/nf-tracks/official/audio.js
// Official "audio" Track — <audio> element embed with precise seek + mix.
// Contract: ADR-033 Track ABI v1.1 + ADR-054 (audio kind) + ADR-056 (mix
// allowed) + ADR-047 (data-nf-persist).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports, zero require, zero await import
//   - three and only three exports: describe, sample, render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now, no
// random, no DOM, no fetch). Runtime detects body[data-mode] externally and
// overrides muted/currentTime after render (diff preserves element identity
// via data-nf-persist). Runtime also handles IS-2a Track-window vs
// media-duration boundary behaviour (pause on Track.to / data-nf-silent past
// media end).

export function describe() {
  return {
    id: "audio",
    kind: "audio",
    name: "Audio Track",
    viewport: "any",
    // Audio has no visual, but FM-T0 gate still requires a numeric
    // t0_visibility. Set to 1.0 — the <audio> element's opacity is set to
    // 1.0 too (property exists; no visible pixels since the element renders
    // nothing by default).
    t0_visibility: 1.0,
    // z_order_hint is irrelevant for audio (no visual stacking). Use 0.
    z_order_hint: 0,
    // Dedicated audio channel per ADR-047 / ADR-045 so runtime can route /
    // count audio elements separately from scene-layer visual tracks.
    visual_channels: ["audio"],
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
        volume: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  };
}

export function sample() {
  return {
    src: "file:///tmp/v1.12-demo.mp3",
    from_ms: 0,
    volume: 1,
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

// persist key = "audio-" + stable hash of src (same src → same key across
// frames). Simple FNV-1a hash of the src string; runtime dedupes by key so
// collisions degrade gracefully to shared element (acceptable for same src).
function stableKey(src) {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return "audio-" + h.toString(16);
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  // Guard: no src → render empty placeholder (still FM-T0 compliant).
  // Mirrors video.js pattern: small non-visible div with opacity:0.95 so the
  // t0 lint gate still reads a valid opacity value.
  if (!p.src || typeof p.src !== "string") {
    return (
      '<div data-layout="audio-empty" style="' +
      "position:absolute;inset:0;" +
      "width:" + vp.w + "px;height:" + vp.h + "px;" +
      "pointer-events:none;opacity:0.95;" +
      '"></div>'
    );
  }

  const src = escapeAttr(p.src);
  const key = stableKey(p.src);
  const fromMs = typeof p.from_ms === "number" ? p.from_ms : 0;
  // to_ms is optional — emit empty string when absent so runtime can
  // distinguish "no upper bound given" from a numeric cap.
  const toAttr = typeof p.to_ms === "number" ? String(p.to_ms) : "";
  // volume default 1.0 (runtime reads this to set el.volume after mount).
  const volume = typeof p.volume === "number" ? p.volume : 1.0;

  // render is PURE. Do NOT emit `muted` attribute: HTML boolean attributes
  // are true whenever present (any string value including "false" = muted).
  // Runtime sets a.muted via property assignment after diff mount based on
  // body[data-mode] (play → false, record → true). See ABI contract +
  // BDD-v1.10-05.
  //
  // Opacity hardcoded to 1.0 (FM-T0 gate: >= 0.9). <audio> has no visible
  // pixels so the opacity value has no rendering effect — it exists purely
  // to satisfy the lint gate and remain declarative.
  const style = "opacity:1.0;";

  return (
    '<audio' +
    ' data-nf-persist="' + key + '"' +
    ' data-nf-t-offset="' + fromMs + '"' +
    ' data-nf-t-max="' + toAttr + '"' +
    ' data-nf-volume="' + volume + '"' +
    ' src="' + src + '"' +
    ' preload="auto"' +
    ' style="' + style + '"' +
    '></audio>'
  );
}
