// src/nf-tracks/official/bg.js
// Official "bg" Track — background layer (solid / gradient / image / video).
// Contract: ADR-033 Track ABI v1.1 + ADR-044 discriminator by type + ADR-045 record-mute.
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports
//   - three exports: describe / sample / render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), vp) → HTML containing opacity >= 0.9 (FM-T0 gate)
//
// 4 variants discriminated by params.type:
//   solid    { type:'solid',    color:'#hex6' }
//   gradient { type:'gradient', gradient:'linear'|'radial'|'conic', angle?, stops:[{offset,color}] }
//   image    { type:'image',    src, fit:'cover'|'contain'|'fill', position? }
//   video    { type:'video',    src, fit, loop?, muted_in_record:true }

export function describe() {
  return {
    id: "bg",
    name: "Background Track",
    viewport: "any",
    // Backgrounds don't fade — always fully opaque. FM-T0 safely exceeds 0.9.
    t0_visibility: 1.0,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Track.bg params (ADR-044 discriminated union)",
      type: "object",
      required: ["type"],
      oneOf: [
        {
          title: "solid variant",
          type: "object",
          required: ["type", "color"],
          additionalProperties: false,
          properties: {
            type: { const: "solid" },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }
          }
        },
        {
          title: "gradient variant",
          type: "object",
          required: ["type", "gradient", "stops"],
          additionalProperties: false,
          properties: {
            type: { const: "gradient" },
            gradient: { enum: ["linear", "radial", "conic"] },
            angle: { type: "number", minimum: 0, maximum: 360 },
            stops: {
              type: "array",
              minItems: 2,
              items: {
                type: "object",
                required: ["offset", "color"],
                additionalProperties: false,
                properties: {
                  offset: { type: "number", minimum: 0, maximum: 1 },
                  color: { type: "string", pattern: "^#[0-9a-fA-F]{6,8}$" }
                }
              }
            }
          }
        },
        {
          title: "image variant",
          type: "object",
          required: ["type", "src"],
          additionalProperties: false,
          properties: {
            type: { const: "image" },
            src: { type: "string", minLength: 1 },
            fit: { enum: ["cover", "contain", "fill"] },
            position: { type: "string" }
          }
        },
        {
          title: "video variant",
          type: "object",
          required: ["type", "src", "muted_in_record"],
          additionalProperties: false,
          properties: {
            type: { const: "video" },
            src: { type: "string", minLength: 1 },
            fit: { enum: ["cover", "contain", "fill"] },
            loop: { type: "boolean" },
            muted_in_record: { const: true }
          }
        }
      ]
    }
  };
}

export function sample() {
  // Solid is the safest sample for FM-T0 gate and lint — deterministic color.
  return {
    type: "solid",
    color: "#0ea5e9"
  };
}

// ---------- helpers (kept in-file per zero-import rule) -------------------

function escapeAttr(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validHex(s) {
  return typeof s === "string" && /^#[0-9a-fA-F]{6,8}$/.test(s);
}

function pickFit(f) {
  return f === "contain" || f === "fill" ? f : "cover";
}

function baseStageStyle(vp) {
  // Absolute fill container. Backgrounds live at z:0 (DOM order places them
  // below tracks appended later — ADR-045 z_order note).
  return (
    "position:absolute;inset:0;" +
    "width:" + vp.w + "px;height:" + vp.h + "px;" +
    "overflow:hidden;" +
    // FM-T0: always fully opaque at t=0 and after. No entry fade.
    "opacity:1.0;"
  );
}

function renderSolid(_t, p, vp) {
  const color = validHex(p.color) ? p.color : "#000000";
  return (
    '<div data-bg-variant="solid" data-nf-track="bg" style="' +
      baseStageStyle(vp) +
      "background-color:" + color + ";" +
    '"></div>'
  );
}

function gradientCss(p) {
  // Build CSS gradient string from stops.
  if (!Array.isArray(p.stops) || p.stops.length < 2) return "#000000";
  const stopStrs = [];
  for (let i = 0; i < p.stops.length; i++) {
    const s = p.stops[i];
    if (!s || typeof s !== "object") continue;
    const color = validHex(s.color) ? s.color : "#000000";
    const offsetPct = Math.max(0, Math.min(1, typeof s.offset === "number" ? s.offset : 0)) * 100;
    stopStrs.push(color + " " + offsetPct.toFixed(2) + "%");
  }
  const joined = stopStrs.join(", ");
  if (p.gradient === "radial") {
    return "radial-gradient(circle at center, " + joined + ")";
  }
  if (p.gradient === "conic") {
    const a = typeof p.angle === "number" ? p.angle : 0;
    return "conic-gradient(from " + a.toFixed(2) + "deg at center, " + joined + ")";
  }
  // linear (default)
  const a = typeof p.angle === "number" ? p.angle : 180;
  return "linear-gradient(" + a.toFixed(2) + "deg, " + joined + ")";
}

function renderGradient(_t, p, vp) {
  const css = gradientCss(p);
  return (
    '<div data-bg-variant="gradient" data-nf-track="bg" style="' +
      baseStageStyle(vp) +
      "background:" + css + ";" +
    '"></div>'
  );
}

function renderImage(_t, p, vp) {
  const src = escapeAttr(p.src || "");
  const fit = pickFit(p.fit);
  const position = typeof p.position === "string" ? escapeAttr(p.position) : "center";
  // Use <img> so image content is inspectable by recorder / tests, wrapped in
  // a positioned container. object-fit handles cover/contain/fill.
  return (
    '<div data-bg-variant="image" data-nf-track="bg" style="' +
      baseStageStyle(vp) +
    '">' +
      '<img src="' + src + '" alt="" draggable="false" ' +
        'style="' +
          "position:absolute;inset:0;" +
          "width:100%;height:100%;" +
          "object-fit:" + fit + ";" +
          "object-position:" + position + ";" +
          "opacity:1.0;" +
        '"/>' +
    '</div>'
  );
}

function renderVideo(_t, p, vp) {
  const src = escapeAttr(p.src || "");
  const fit = pickFit(p.fit);
  const looped = p.loop === false ? "" : "loop ";
  // ADR-045: muted_in_record must be true in schema. At runtime, we set
  // the HTML `muted` attribute always — the audio Track (v1.10) is the single
  // sanctioned audio source; bg video must never emit sound. Browsers require
  // muted to autoplay, which aligns with this.
  return (
    '<div data-bg-variant="video" data-nf-track="bg" style="' +
      baseStageStyle(vp) +
    '">' +
      '<video src="' + src + '" muted playsinline autoplay ' + looped +
        'style="' +
          "position:absolute;inset:0;" +
          "width:100%;height:100%;" +
          "object-fit:" + fit + ";" +
          "opacity:1.0;" +
        '"></video>' +
    '</div>'
  );
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  switch (p.type) {
    case "gradient":
      return renderGradient(t, p, vp);
    case "image":
      return renderImage(t, p, vp);
    case "video":
      return renderVideo(t, p, vp);
    case "solid":
    default:
      return renderSolid(t, p, vp);
  }
}
